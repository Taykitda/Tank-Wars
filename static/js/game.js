/**
 * Cyberpunk Tank Battle - Game Engine Master Orchestrator
 * Game loops, 2-player simultaneous inputs, state machines, wave manager, and screenshakes.
 */

import { CONFIG, LEVELS } from './config.js';
import { SOUND } from './audio.js';
import { MapManager } from './map.js';
import { PlayerTank, EnemyTank, PowerUp, Particle, Bullet } from './entities.js';
import { LevelEditor } from './editor.js';

class GameEngine {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.mapManager = new MapManager();
    this.editor = new LevelEditor(this.canvas, this.mapManager);
    
    // Core game states: 'MENU', 'PLAYING', 'PAUSED', 'GAME_OVER', 'LEVEL_CLEAR', 'EDITOR'
    this.state = 'MENU';
    
    // Game entity arrays
    this.players = [];
    this.enemies = [];
    this.bullets = [];
    this.powerUps = [];
    
    // Remote Multiplayer state
    this.isRemote = false;
    this.isHost = false;
    this.myPlayerIndex = 0;
    this.wsConnection = null;
    this.remoteRoomId = "";
    this.clientInputs = { up: false, down: false, left: false, right: false, fire: false };
    this.netTickTimer = 0;
    this.originalSoundMethods = null;
    
    // Map mutation hook
    this.mapManager.onMapMutation = (row, col, cellType, subTiles) => {
      if (this.isRemote && this.isHost) {
        this.sendWs({
          type: 'MAP_MUTATION',
          row: row,
          col: col,
          cellType: cellType,
          subTiles: subTiles
        });
      }
    };
    
    this.setupParticlesArray();

    
    // Level progress wave manager
    this.currentLevelIndex = 0;
    this.enemiesSpawnedCount = 0;
    this.enemiesTotalCount = CONFIG.ENEMY.WAVE_COUNT;
    this.enemiesRemainingCount = CONFIG.ENEMY.WAVE_COUNT;
    this.spawnTimer = 0;
    
    // Spawn point arrays cached from layout
    this.playerSpawns = [];
    this.enemySpawns = [];
    this.basePos = { x: 12 * CONFIG.TILE_SIZE, y: 25 * CONFIG.TILE_SIZE };
    
    // Mode options
    this.isCoOp = false;
    this.customMapLayout = null; // cached if playtesting
    
    // PowerUp active timers
    this.enemyFreezeTimer = 0;
    
    // Screen Shake vectors
    this.shakeTimer = 0;
    this.shakeIntensity = 0;
    
    // Keyboard input buffer
    this.keysPressed = {};
    
    // Frame time calculation
    this.lastTime = 0;
  }

  setupParticlesArray() {
    this.particles = [];
    this.particles.push = (...items) => {
      Array.prototype.push.apply(this.particles, items);
      if (this.isRemote && this.isHost && items.length > 0) {
        const first = items[0];
        this.sendWs({
          type: 'PARTICLES',
          x: first.x,
          y: first.y,
          color: first.color,
          count: items.length
        });
      }
    };
  }

  /**

   * Runs the initial project bindings and DOM overlays
   */
  init() {
    this.bindDOMEvents();
    this.editor.init(
      (customLayout) => this.startCustomPlayTest(customLayout),
      () => this.changeState('MENU')
    );
    
    // High Score init
    const hi = localStorage.getItem('tank_high_score');
    this.highScore = hi ? parseInt(hi) : 0;
    this.updateHUDHighScore();
    
    // Keyboard event listeners
    window.addEventListener('keydown', (e) => {
      // Start audio context on first keyboard interaction to satisfy safety policies
      SOUND.init();
      
      this.keysPressed[e.code] = true;
      
      // Pause trigger inside gameplay
      if (this.state === 'PLAYING' && e.code === 'Escape') {
        this.changeState('PAUSED');
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed[e.code] = false;
    });

    // Start requestAnimationFrame loop
    this.lastTime = performance.now();
    requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
  }

  bindDOMEvents() {
    // Menu buttons
    document.getElementById('btnSinglePlayer').onclick = () => {
      SOUND.init();
      this.isCoOp = false;
      this.customMapLayout = null;
      this.changeState('LEVEL_SELECT');
    };
    
    document.getElementById('btnCoOp').onclick = () => {
      SOUND.init();
      this.isCoOp = true;
      this.customMapLayout = null;
      this.changeState('LEVEL_SELECT');
    };
    
    document.getElementById('btnRemoteCoOp').onclick = () => {
      SOUND.init();
      this.changeState('REMOTE_LOBBY');
    };
    
    document.getElementById('btnEditor').onclick = () => {
      SOUND.init();
      this.changeState('EDITOR');
    };
    
    document.getElementById('btnInstructions').onclick = () => {
      SOUND.init();
      document.getElementById('instructionsScreen').classList.remove('hidden');
    };
    
    document.getElementById('btnInstructionsBack').onclick = () => {
      document.getElementById('instructionsScreen').classList.add('hidden');
    };

    document.getElementById('btnLevelBack').onclick = () => {
      this.changeState('MENU');
    };
    
    // Remote lobby button bindings
    document.getElementById('btnRemoteBack').onclick = () => {
      this.disconnectWs();
      this.changeState('MENU');
    };
    
    document.getElementById('btnCreateRoom').onclick = () => {
      SOUND.init();
      const roomId = String(Math.floor(1000 + Math.random() * 9000));
      this.connectRemote(roomId, true);
    };
    
    document.getElementById('btnJoinRoom').onclick = () => {
      SOUND.init();
      const input = document.getElementById('inputRoomId');
      const roomId = input.value.trim();
      if (roomId.length !== 4 || isNaN(roomId)) {
        alert('请输入4位数字房间号！');
        return;
      }
      this.connectRemote(roomId, false);
    };
    
    document.getElementById('btnStartRemoteLevel').onclick = () => {
      this.changeState('LEVEL_SELECT');
    };
    
    // Game overlay cards
    document.getElementById('btnRetry').onclick = () => {
      if (this.isRemote && !this.isHost) return; // Client cannot retry
      this.startCampaignLevel(this.currentLevelIndex);
    };
    document.getElementById('btnGameOverMenu').onclick = () => {
      if (this.isRemote) this.disconnectWs();
      this.changeState('MENU');
    };
    
    document.getElementById('btnNextLevel').onclick = () => {
      if (this.isRemote && !this.isHost) return; // Client cannot advance
      if (this.currentLevelIndex + 1 < LEVELS.length) {
        this.startCampaignLevel(this.currentLevelIndex + 1);
      } else {
        alert('主脑宣告：所有五大战役已全部清剿！您拯救了赛博核心！');
        this.changeState('MENU');
      }
    };
    document.getElementById('btnVictoryMenu').onclick = () => {
      if (this.isRemote) this.disconnectWs();
      this.changeState('MENU');
    };
    
    // Pause overlay actions
    document.getElementById('btnResume').onclick = () => {
      this.changeState('PLAYING');
    };
    document.getElementById('btnQuitGame').onclick = () => {
      if (this.isRemote) this.disconnectWs();
      this.changeState('MENU');
    };

    // settings controls
    const toggleMusic = document.getElementById('toggleMusic');
    toggleMusic.onchange = (e) => {
      SOUND.setMusicEnabled(e.target.checked);
    };
    
    const toggleSFX = document.getElementById('toggleSFX');
    toggleSFX.onchange = (e) => {
      SOUND.setSFXEnabled(e.target.checked);
    };
    
    const toggleCRT = document.getElementById('toggleCRT');
    toggleCRT.onchange = (e) => {
      const crt = document.getElementById('crtOverlay');
      if (e.target.checked) {
        document.body.classList.remove('crt-off');
      } else {
        document.body.classList.add('crt-off');
      }
    };
  }


  changeState(newState) {
    this.state = newState;
    
    // Hide all overlays initially
    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('levelSelectScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('victoryScreen').classList.add('hidden');
    document.getElementById('pauseOverlay').classList.add('hidden');
    document.getElementById('remoteLobbyScreen').classList.add('hidden');
    
    // Sound adjustments
    SOUND.silenceEngine();
    
    switch (newState) {
      case 'MENU':
        document.getElementById('menuScreen').classList.remove('hidden');
        this.players = [];
        this.enemies = [];
        this.bullets = [];
        this.powerUps = [];
        this.setupParticlesArray();
        break;
        
      case 'LEVEL_SELECT':
        this.renderLevelSelectGrid();
        document.getElementById('levelSelectScreen').classList.remove('hidden');
        break;
        
      case 'REMOTE_LOBBY':
        document.getElementById('remoteLobbyScreen').classList.remove('hidden');
        document.getElementById('remoteLobbyOptions').classList.remove('hidden');
        document.getElementById('remoteWaitingPanel').classList.add('hidden');
        document.getElementById('remoteConnectedPanel').classList.add('hidden');
        document.getElementById('btnStartRemoteLevel').classList.add('hidden');
        document.getElementById('lblRoomId').innerText = '----';
        document.getElementById('inputRoomId').value = '';
        break;
        
      case 'PLAYING':
        SOUND.setEngineActive(false); // rumble background
        break;
        
      case 'PAUSED':
        document.getElementById('pauseOverlay').classList.remove('hidden');
        break;
        
      case 'GAME_OVER':
        SOUND.playGameOver();
        document.getElementById('gameOverScreen').classList.remove('hidden');
        break;
        
      case 'LEVEL_CLEAR':
        SOUND.playVictory();
        document.getElementById('victoryScreen').classList.remove('hidden');
        this.updateCampaignProgress();
        break;
        
      case 'EDITOR':
        this.editor.enable();
        break;
    }
  }


  renderLevelSelectGrid() {
    const grid = document.getElementById('levelCardGrid');
    grid.innerHTML = ''; // reset
    
    LEVELS.forEach((level, index) => {
      const card = document.createElement('div');
      card.className = 'level-card';
      card.innerHTML = `
        <h4>战役关卡 0${index + 1}</h4>
        <span>${index === 4 ? '终极决战' : '常规战役'}</span>
      `;
      
      card.onclick = () => {
        this.startCampaignLevel(index);
      };
      
      grid.appendChild(card);
    });
  }

  /**
   * Initializes campaign levels using predesigned config levels
   */
  startCampaignLevel(levelIndex, bypassBroadcast = false) {
    this.currentLevelIndex = levelIndex;
    this.customMapLayout = null;
    
    if (this.isRemote) {
      this.isCoOp = true;
    }
    
    const layout = LEVELS[levelIndex];
    this.parseSpawnsAndLoad(layout);
    
    document.getElementById('hudLevelVal').innerText = `关卡 ${levelIndex + 1}`;
    
    if (this.isRemote && this.isHost && !bypassBroadcast) {
      this.sendWs({
        type: 'START_LEVEL',
        levelIndex: levelIndex
      });
    }
    
    this.changeState('PLAYING');
  }


  /**
   * Launches playtest directly from editor grid
   */
  startCustomPlayTest(customLayout) {
    this.customMapLayout = customLayout;
    
    this.parseSpawnsAndLoad(customLayout);
    
    document.getElementById('hudLevelVal').innerText = `自定义战役`;
    
    // Force sidebar configurations to play mode
    this.editor.disable();
    this.changeState('PLAYING');
  }

  /**
   * Scan grid positions for Player and Enemy Spawns, then sets up mapManager
   */
  parseSpawnsAndLoad(layout) {
    this.playerSpawns = [];
    this.enemySpawns = [];
    
    // Copy matrix to keep configuration maps read-only
    const mapMatrix = Array(CONFIG.GRID_ROWS).fill(null).map(() => Array(CONFIG.GRID_COLS).fill(0));
    
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const type = layout[r][c];
        
        if (type === CONFIG.TILE_TYPES.P1_SPAWN) {
          this.playerSpawns[0] = { x: c * CONFIG.TILE_SIZE, y: r * CONFIG.TILE_SIZE };
          mapMatrix[r][c] = CONFIG.TILE_TYPES.EMPTY; // Clear spawn visual inside physical grid
        }
        else if (type === CONFIG.TILE_TYPES.P2_SPAWN) {
          this.playerSpawns[1] = { x: c * CONFIG.TILE_SIZE, y: r * CONFIG.TILE_SIZE };
          mapMatrix[r][c] = CONFIG.TILE_TYPES.EMPTY;
        }
        else if (type === CONFIG.TILE_TYPES.ENEMY_SPAWN) {
          this.enemySpawns.push({ x: c * CONFIG.TILE_SIZE, y: r * CONFIG.TILE_SIZE });
          mapMatrix[r][c] = CONFIG.TILE_TYPES.EMPTY;
        }
        else if (type === CONFIG.TILE_TYPES.BASE) {
          this.basePos = { x: c * CONFIG.TILE_SIZE, y: r * CONFIG.TILE_SIZE };
          mapMatrix[r][c] = type;
        }
        else {
          mapMatrix[r][c] = type;
        }
      }
    }
    
    // In case second spawn didn't exist in single player, default P2 spawn off screen
    if (!this.playerSpawns[1]) {
      this.playerSpawns[1] = { x: -100, y: -100 };
    }
    
    // Load mapManager physical properties
    this.mapManager.loadMap(mapMatrix);
    
    // Setup player entities
    this.setupPlayers();
    
    // Reset Wave indicators
    this.enemiesSpawnedCount = 0;
    this.enemiesRemainingCount = CONFIG.ENEMY.WAVE_COUNT;
    this.enemies = [];
    this.bullets = [];
    this.powerUps = [];
    this.setupParticlesArray();
    this.enemyFreezeTimer = 0;
    this.spawnTimer = 0;

    
    this.updateHUDGlobalStats();
  }

  setupPlayers() {
    this.players = [];
    
    // P1 Setup
    const p1Spawn = this.playerSpawns[0] || { x: 9 * CONFIG.TILE_SIZE, y: 25 * CONFIG.TILE_SIZE };
    const p1 = new PlayerTank(p1Spawn.x, p1Spawn.y, 0);
    p1.shieldTime = CONFIG.PLAYER.SHIELD_DURATION; // Spawning shield
    this.players.push(p1);
    
    document.getElementById('p1Card').classList.remove('hidden');
    this.updateHUDPlayerStats(0);
    
    // P2 Setup
    const p2Card = document.getElementById('p2Card');
    if (this.isCoOp) {
      const p2Spawn = this.playerSpawns[1] || { x: 15 * CONFIG.TILE_SIZE, y: 25 * CONFIG.TILE_SIZE };
      const p2 = new PlayerTank(p2Spawn.x, p2Spawn.y, 1);
      p2.shieldTime = CONFIG.PLAYER.SHIELD_DURATION;
      this.players.push(p2);
      p2Card.classList.remove('hidden');
      this.updateHUDPlayerStats(1);
    } else {
      p2Card.classList.add('hidden');
    }
  }

  /**
   * Main game ticker running at 60fps
   */
  gameLoop(timestamp) {
    const dt = Math.min(3.0, (timestamp - this.lastTime) / 16.67); // scale where 1.0 = 16.67ms
    this.lastTime = timestamp;
    
    if (this.state === 'PLAYING') {
      this.update(dt);
      this.draw();
    } else if (this.state === 'EDITOR') {
      // Editor draws on paint events, no continuous loops needed to save CPU cycles
    } else {
      // Keep background music sequenced even when paused or in menus
      this.draw();
    }
    
    requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
  }

  update(dt) {
    if (this.isRemote && !this.isHost) {
      // Client only updates local particle animations & animations like water/shovel
      this.particles.forEach(p => {
        if (p.active) p.update(dt);
      });
      this.particles = this.particles.filter(p => p.active);
      this.mapManager.update(dt);
      
      this.sendClientInputs();
      return;
    }

    // 1. Countdown screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= 16.67 * dt;
    }

    
    // 2. Countdown freezing states
    if (this.enemyFreezeTimer > 0) {
      this.enemyFreezeTimer -= 16.67 * dt;
    }
    
    // 3. Update map animations (shovel cooldown, water wave oscillations)
    this.mapManager.update(dt);
    
    // 4. Update player tanks
    let anyPlayerMoving = false;
    this.players.forEach((player, index) => {
      if (player.active) {
        this.handlePlayerInput(player, index, dt);
        player.update(dt, this.mapManager);
        if (player.isMoving) anyPlayerMoving = true;
        
        // Powerup pick checking
        this.powerUps.forEach(p => {
          if (p.active && this.checkOverlap(player, p)) {
            p.active = false;
            this.triggerPowerUpEffect(player, p.type);
          }
        });
      } else if (player.lives > 0) {
        // Respawn delay handler if lives remain
        player.lives--;
        const spawnPoint = this.playerSpawns[index];
        player.respawn(spawnPoint.x, spawnPoint.y);
        this.updateHUDPlayerStats(index);
      }
    });
    SOUND.setEngineActive(anyPlayerMoving);
    
    // 5. Spawn enemy waves
    this.spawnTimer += 16.67 * dt;
    if (this.spawnTimer >= CONFIG.ENEMY.SPAWN_INTERVAL && this.enemiesSpawnedCount < this.enemiesTotalCount) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }
    
    // 6. Update enemy tanks
    this.enemies.forEach(enemy => {
      if (enemy.active) {
        if (this.enemyFreezeTimer <= 0) {
          enemy.aiMove(dt, this.mapManager, this.players, this.basePos);
          enemy.aiFire(this.bullets);
        }
        enemy.update(dt, this.mapManager);
      }
    });
    
    // 7. Update laser bullets
    this.bullets.forEach(bullet => {
      if (bullet.active) {
        bullet.update(dt, this.mapManager, this.particles);
        
        // B2B checking
        this.bullets.forEach(other => {
          if (bullet.active && other.active && bullet !== other && bullet.isPlayerBullet !== other.isPlayerBullet) {
            if (this.checkOverlap(bullet, other)) {
              bullet.active = false;
              other.active = false;
              bullet.explodeSparks(this.particles, 4);
            }
          }
        });
        
        // Bullet hit tanks check
        if (bullet.active) {
          if (bullet.isPlayerBullet) {
            // Player bullet hit enemy
            this.enemies.forEach(enemy => {
              if (enemy.active && bullet.active && this.checkOverlap(bullet, enemy)) {
                bullet.active = false;
                const wasHit = enemy.takeDamage(bullet.damage);
                bullet.explodeSparks(this.particles, 6);
                
                if (wasHit && !enemy.active) {
                  // Killed enemy!
                  this.triggerEnemyDeath(enemy, bullet.playerIndex);
                }
              }
            });
          } else {
            // Enemy bullet hit player
            this.players.forEach((player, index) => {
              if (player.active && bullet.active && this.checkOverlap(bullet, player)) {
                bullet.active = false;
                const wasHit = player.takeDamage(bullet.damage);
                bullet.explodeSparks(this.particles, 6);
                
                if (wasHit) {
                  this.triggerScreenShake(120, 4); // feedback hit nudge
                  this.updateHUDPlayerStats(index);
                  if (!player.active) {
                    this.triggerPlayerDeath(player, index);
                  }
                }
              }
            });
          }
        }
      }
    });
    
    // 8. Update active power-ups (pulsating oscillations)
    this.powerUps.forEach(p => {
      if (p.active) p.update(dt);
    });
    
    // 9. Update explosion particle sparks
    this.particles.forEach(p => {
      if (p.active) p.update(dt);
    });
    
    // 10. Filter out inactive collections
    this.bullets = this.bullets.filter(b => b.active);
    this.enemies = this.enemies.filter(e => e.active);
    this.powerUps = this.powerUps.filter(p => p.active);
    this.particles = this.particles.filter(p => p.active);
    
    // 11. State assessment: Game Over or Stage Clear
    this.checkGameConditions();

    // Broadcast state to P2 (Client)
    if (this.isRemote && this.isHost) {
      this.netTickTimer += 16.67 * dt;
      const interval = 1000 / CONFIG.NET_TICK_RATE;
      if (this.netTickTimer >= interval) {
        this.netTickTimer = 0;
        this.broadcastGameState();
      }
    }
  }


  handlePlayerInput(player, index, dt) {
    let dx = 0;
    let dy = 0;
    
    // Remote client inputs read
    if (this.isRemote && index === 1) {
      if (this.clientInputs.up) {
        dy = -player.speed;
        player.direction = 'UP';
      } else if (this.clientInputs.down) {
        dy = player.speed;
        player.direction = 'DOWN';
      } else if (this.clientInputs.left) {
        dx = -player.speed;
        player.direction = 'LEFT';
      } else if (this.clientInputs.right) {
        dx = player.speed;
        player.direction = 'RIGHT';
      }
      
      // Commit coordinates
      player.move(dx * dt, dy * dt, this.mapManager);
      
      // Fire lasers
      if (this.clientInputs.fire) {
        player.fire(this.bullets);
      }
      return;
    }
    
    const controls = index === 0 ? {
      up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'Space'
    } : {
      up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Enter'
    };
    
    // Steer directions (no diagonal movement to fit grids perfectly)
    if (this.keysPressed[controls.up]) {
      dy = -player.speed;
      player.direction = 'UP';
    } else if (this.keysPressed[controls.down]) {
      dy = player.speed;
      player.direction = 'DOWN';
    } else if (this.keysPressed[controls.left]) {
      dx = -player.speed;
      player.direction = 'LEFT';
    } else if (this.keysPressed[controls.right]) {
      dx = player.speed;
      player.direction = 'RIGHT';
    }
    
    // Commit coordinates
    player.move(dx * dt, dy * dt, this.mapManager);
    
    // Fire lasers
    if (this.keysPressed[controls.fire]) {
      player.fire(this.bullets);
    }
  }

  spawnEnemy() {
    // Max screen limits safeguard
    if (this.enemies.length >= CONFIG.ENEMY.MAX_ACTIVE || this.enemyFreezeTimer > 0) return;
    
    // Pick spawn coordinate (rotate spawn points to avoid stacking bots)
    const spawnIndex = this.enemiesSpawnedCount % this.enemySpawns.length;
    const point = this.enemySpawns[spawnIndex] || { x: 0, y: 0 };
    
    // Avoid spawning directly on top of active player tanks
    let clearSpace = true;
    this.players.forEach(p => {
      if (p.active && Math.abs(p.x - point.x) < CONFIG.TILE_SIZE * 1.5 && Math.abs(p.y - point.y) < CONFIG.TILE_SIZE * 1.5) {
        clearSpace = false;
      }
    });
    
    if (!clearSpace) return; // try again on next spawn cycle
    
    // Choose enemy category: Wave count difficulty ramping
    let type = 'BASIC';
    const r = Math.random();
    if (this.enemiesSpawnedCount > 15) {
      type = r < 0.35 ? 'BOSS' : (r < 0.7 ? 'ARMORED' : 'FAST');
    } else if (this.enemiesSpawnedCount > 8) {
      type = r < 0.4 ? 'ARMORED' : (r < 0.8 ? 'FAST' : 'BASIC');
    } else {
      type = r < 0.3 ? 'FAST' : 'BASIC';
    }
    
    // 20% chance this enemy holds upgrade capsule when killed
    const carriesPowerup = Math.random() < 0.25;
    
    const bot = new EnemyTank(point.x, point.y, type, carriesPowerup);
    bot.shieldTime = 1200; // brief invincibility flash on birth
    
    this.enemies.push(bot);
    this.enemiesSpawnedCount++;
    
    // Trigger visual teleport birth flare
    for (let i = 0; i < 15; i++) {
      this.particles.push(new Particle(point.x + CONFIG.TILE_SIZE/2, point.y + CONFIG.TILE_SIZE/2, CONFIG.COLORS.ENEMY_BASIC));
    }
  }

  triggerEnemyDeath(enemy, playerIndex) {
    SOUND.playExplosion(enemy.typeName === 'BOSS');
    this.triggerScreenShake(200, enemy.typeName === 'BOSS' ? 7 : 3);
    
    // Spawn massive fiery debris
    for (let i = 0; i < 20; i++) {
      this.particles.push(new Particle(enemy.x + enemy.width/2, enemy.y + enemy.height/2, enemy.color));
    }
    
    // Distribute score values
    const player = this.players[playerIndex];
    if (player) {
      player.score += enemy.scoreValue;
      this.updateHUDPlayerScore(playerIndex);
      
      // Update high scores
      const totalScore = this.isCoOp ? (this.players[0].score + (this.players[1]?.score || 0)) : player.score;
      if (totalScore > this.highScore) {
        this.highScore = totalScore;
        localStorage.setItem('tank_high_score', this.highScore);
        this.updateHUDHighScore();
      }
    }
    
    // Spawn collectible capsule if this bot carried one
    if (enemy.flashing) {
      const types = Object.values(CONFIG.POWERUP.TYPES);
      const chosenType = types[Math.floor(Math.random() * types.length)];
      this.powerUps.push(new PowerUp(enemy.x, enemy.y, chosenType));
    }
    
    this.enemiesRemainingCount = Math.max(0, this.enemiesTotalCount - this.enemiesSpawnedCount + this.enemies.length);
    this.updateHUDGlobalStats();
  }

  triggerPlayerDeath(player, index) {
    SOUND.playExplosion(true);
    
    // Big blue/magenta flash explosion
    for (let i = 0; i < 25; i++) {
      this.particles.push(new Particle(player.x + player.width/2, player.y + player.height/2, player.color));
    }
    
    this.updateHUDPlayerStats(index);
  }

  triggerPowerUpEffect(player, type) {
    SOUND.playPowerUpCollect();
    
    // Display brief spark shower
    for (let i = 0; i < 12; i++) {
      this.particles.push(new Particle(player.x + player.width/2, player.y + player.height/2, '#ffffff'));
    }
    
    const types = CONFIG.POWERUP.TYPES;
    
    switch (type) {
      case types.SHIELD:
        player.shieldTime = CONFIG.PLAYER.SHIELD_DURATION * 3; // 9 seconds invincibility
        break;
        
      case types.FREEZE:
        this.enemyFreezeTimer = 8000; // freeze enemies for 8 seconds
        break;
        
      case types.SHOVEL:
        this.mapManager.shovelTimer = CONFIG.POWERUP.DURATION;
        this.mapManager.setBaseShieldWalls(true);
        break;
        
      case types.STAR:
        player.upgrade();
        this.updateHUDPlayerStats(player.playerIndex);
        break;
        
      case types.BOMB:
        // Nuclear nuke! Destroy all currently active enemies
        this.triggerScreenShake(450, 10);
        
        // Iterate backwards because array splice modifies length
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const enemy = this.enemies[i];
          enemy.active = false;
          this.triggerEnemyDeath(enemy, player.playerIndex);
        }
        break;
        
      case types.LIFE:
        player.lives++;
        this.updateHUDPlayerStats(player.playerIndex);
        break;
        
      case types.PIERCE:
        player.pierceSteelEnabled = true;
        SOUND.playPowerUpCollect();
        setTimeout(() => {
          player.pierceSteelEnabled = false;
        }, 15000); // 15 seconds pierce duration
        break;
    }
  }

  triggerScreenShake(durationMs, intensity) {
    this.shakeTimer = durationMs;
    this.shakeIntensity = intensity;
  }

  checkGameConditions() {
    // 1. Loss: Base destroyed
    if (this.mapManager.baseDestroyed) {
      this.changeState('GAME_OVER');
      return;
    }
    
    // 2. Loss: All players dead with 0 lives remaining
    const allDead = this.players.every(p => !p.active && p.lives <= 0);
    if (allDead) {
      this.changeState('GAME_OVER');
      return;
    }
    
    // 3. Victory: No enemies remaining in spawns and screen
    if (this.enemiesSpawnedCount >= this.enemiesTotalCount && this.enemies.length === 0) {
      this.enemiesRemainingCount = 0;
      this.updateHUDGlobalStats();
      
      // If playtesting, quit to editor instead of opening next campaigns
      if (this.customMapLayout) {
        alert('主脑宣告：测试试玩获得圆满成功！地图物理结构完整！');
        this.changeState('EDITOR');
      } else {
        this.changeState('LEVEL_CLEAR');
      }
    }
  }

  updateCampaignProgress() {
    // Unlocks next levels or saves status
  }

  /**
   * HUD DOM binders
   */
  updateHUDGlobalStats() {
    document.getElementById('hudEnemiesLeft').innerText = this.enemiesRemainingCount;
  }

  updateHUDPlayerScore(index) {
    const id = index === 0 ? 'p1ScoreVal' : 'p2ScoreVal';
    document.getElementById(id).innerText = this.players[index].score;
  }

  updateHUDHighScore() {
    document.getElementById('hudHighScoreVal').innerText = String(this.highScore).padStart(5, '0');
  }

  updateHUDPlayerStats(index) {
    const player = this.players[index];
    const prefix = index === 0 ? 'p1' : 'p2';
    
    if (player) {
      // Calculate HP percent
      const hpPercent = Math.round((player.health / player.maxHealth) * 100);
      document.getElementById(`${prefix}HealthVal`).innerText = `${hpPercent}%`;
      document.getElementById(`${prefix}HealthBar`).style.width = `${hpPercent}%`;
      
      // Update Lives count
      document.getElementById(`${prefix}LivesVal`).innerText = player.lives;
      
      // Update weapon tier level name
      let tierName = '基础火炮';
      if (player.tier === 2) tierName = '速射激光';
      if (player.tier === 3) tierName = '双子激光';
      if (player.tier === 4) tierName = '聚能核磁';
      
      document.getElementById(`${prefix}TierVal`).innerText = tierName;
    }
  }

  /**
   * Graphic drawings
   */
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Save state for screenshakes displacement
    this.ctx.save();
    
    if (this.state === 'PLAYING' && this.shakeTimer > 0) {
      const sx = (Math.random() * 2 - 1) * this.shakeIntensity;
      const sy = (Math.random() * 2 - 1) * this.shakeIntensity;
      this.ctx.translate(sx, sy);
      
      // Apply CSS shake flash class trigger once
      const panel = document.getElementById('screenPanel');
      if (!panel.classList.contains('shake-screen')) {
        panel.classList.add('shake-screen');
        setTimeout(() => panel.classList.remove('shake-screen'), 300);
      }
    }
    
    // 1. Draw solid elements (bricks, steel, ice, base)
    this.mapManager.draw(this.ctx, false);
    
    // 2. Draw power-ups
    this.powerUps.forEach(p => p.draw(this.ctx));
    
    // 3. Draw laser bullets
    this.bullets.forEach(b => b.draw(this.ctx));
    
    // 4. Draw active player and enemy tanks
    this.players.forEach(p => {
      if (p.active) p.draw(this.ctx);
    });
    this.enemies.forEach(e => {
      if (e.active) e.draw(this.ctx);
    });
    
    // 5. Draw explosion particles
    this.particles.forEach(p => p.draw(this.ctx));
    
    // 6. Draw foliage bushes transparently on TOP of tanks/lasers
    this.mapManager.draw(this.ctx, true);
    
    // Restore screenshake displacement
    this.ctx.restore();
  }

  /**
   * Helper box overlap collision check
   */
  checkOverlap(entA, entB) {
    return (
      entA.x < entB.x + entB.width &&
      entA.x + entA.width > entB.x &&
      entA.y < entB.y + entB.height &&
      entA.y + entA.height > entB.y
    );
  }

  /**
   * Establish WebSocket connection to FastAPI signaling server
   */
  connectRemote(roomId, isHost) {
    this.isRemote = true;
    this.isHost = isHost;
    this.remoteRoomId = roomId;
    this.myPlayerIndex = isHost ? 0 : 1;

    // Build URL dynamically
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/room/${roomId}/${this.myPlayerIndex}`;

    // Close any prior connection safely
    if (this.wsConnection) {
      this.wsConnection.onclose = null;
      this.wsConnection.close();
    }

    this.wsConnection = new WebSocket(wsUrl);

    this.wsConnection.onopen = () => {
      document.getElementById('remoteLobbyOptions').classList.add('hidden');
      if (this.isHost) {
        document.getElementById('remoteWaitingPanel').classList.remove('hidden');
        document.getElementById('lblRoomId').innerText = roomId;

        // Proxy Sound on Host side to broadcast sound cues
        this.originalSoundMethods = {
          playShoot: SOUND.playShoot.bind(SOUND),
          playExplosion: SOUND.playExplosion.bind(SOUND),
          playPowerUpSpawn: SOUND.playPowerUpSpawn.bind(SOUND),
          playPowerUpCollect: SOUND.playPowerUpCollect.bind(SOUND),
          playBaseHit: SOUND.playBaseHit.bind(SOUND),
          playVictory: SOUND.playVictory.bind(SOUND),
          playGameOver: SOUND.playGameOver.bind(SOUND)
        };

        SOUND.playShoot = (playerIndex, speedUp) => {
          this.originalSoundMethods.playShoot(playerIndex, speedUp);
          this.sendWs({ type: 'SOUND_TRIGGER', method: 'playShoot', args: [playerIndex, speedUp] });
        };
        SOUND.playExplosion = (isLarge) => {
          this.originalSoundMethods.playExplosion(isLarge);
          this.sendWs({ type: 'SOUND_TRIGGER', method: 'playExplosion', args: [isLarge] });
        };
        SOUND.playPowerUpSpawn = () => {
          this.originalSoundMethods.playPowerUpSpawn();
          this.sendWs({ type: 'SOUND_TRIGGER', method: 'playPowerUpSpawn', args: [] });
        };
        SOUND.playPowerUpCollect = () => {
          this.originalSoundMethods.playPowerUpCollect();
          this.sendWs({ type: 'SOUND_TRIGGER', method: 'playPowerUpCollect', args: [] });
        };
        SOUND.playBaseHit = () => {
          this.originalSoundMethods.playBaseHit();
          this.sendWs({ type: 'SOUND_TRIGGER', method: 'playBaseHit', args: [] });
        };
        SOUND.playVictory = () => {
          this.originalSoundMethods.playVictory();
          this.sendWs({ type: 'SOUND_TRIGGER', method: 'playVictory', args: [] });
        };
        SOUND.playGameOver = () => {
          this.originalSoundMethods.playGameOver();
          this.sendWs({ type: 'SOUND_TRIGGER', method: 'playGameOver', args: [] });
        };
      } else {
        document.getElementById('remoteConnectedPanel').classList.remove('hidden');
        document.getElementById('lblRemoteStatus').innerText = '连接成功，等待 P1 主机开启战局...';
      }
    };

    this.wsConnection.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'PLAYER_JOINED':
          document.getElementById('remoteWaitingPanel').classList.add('hidden');
          document.getElementById('remoteConnectedPanel').classList.remove('hidden');
          if (this.isHost) {
            document.getElementById('btnStartRemoteLevel').classList.remove('hidden');
            document.getElementById('lblRemoteStatus').innerText = '双方战机连接成功！请点击下方按钮开始关卡选择！';
          } else {
            document.getElementById('remoteLobbyOptions').classList.add('hidden');
            document.getElementById('lblRemoteStatus').innerText = '双方战机连接成功！正在等待主机（Player 1）选关并开火启航...';
          }
          break;

        case 'START_LEVEL':
          this.startCampaignLevel(msg.levelIndex, true); // true to bypass sending START_LEVEL again
          break;

        case 'MAP_MUTATION':
          this.mapManager.mutateCell(msg.row, msg.col, msg.cellType, msg.subTiles);
          break;

        case 'PARTICLES':
          const ParticleClass = Particle;
          for (let i = 0; i < msg.count; i++) {
            this.particles.push(new ParticleClass(msg.x, msg.y, msg.color));
          }
          break;

        case 'SOUND_TRIGGER':
          this.playRemoteSound(msg.method, msg.args);
          break;

        case 'CLIENT_UPDATE':
          this.clientInputs = msg.inputs;
          break;

        case 'STATE_UPDATE':
          this.applyStateUpdate(msg);
          break;

        case 'PEER_DISCONNECTED':
          alert('战机被迫断开连接！队友已离线。');
          this.disconnectWs();
          this.changeState('MENU');
          break;
      }
    };

    this.wsConnection.onclose = (event) => {
      console.warn(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason || 'None'}, Clean: ${event.wasClean}`);
      if (this.isRemote) {
        alert(`联机已断开 (代码: ${event.code}${event.reason ? ', 原因: ' + event.reason : ''})，返回主菜单。`);
        this.disconnectWs();
        this.changeState('MENU');
      }
    };

    this.wsConnection.onerror = (e) => {
      console.error('WebSocket Error: ', e);
    };
  }

  /**
   * Safe and dry websocket stringified dispatcher
   */
  sendWs(payload) {
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify(payload));
    }
  }

  /**
   * Restores network properties and unhooks custom proxied SOUND handlers
   */
  disconnectWs() {
    this.isRemote = false;
    this.isHost = false;
    this.myPlayerIndex = 0;
    if (this.wsConnection) {
      this.wsConnection.onclose = null;
      this.wsConnection.close();
      this.wsConnection = null;
    }
    if (this.originalSoundMethods) {
      SOUND.playShoot = this.originalSoundMethods.playShoot;
      SOUND.playExplosion = this.originalSoundMethods.playExplosion;
      SOUND.playPowerUpSpawn = this.originalSoundMethods.playPowerUpSpawn;
      SOUND.playPowerUpCollect = this.originalSoundMethods.playPowerUpCollect;
      SOUND.playBaseHit = this.originalSoundMethods.playBaseHit;
      SOUND.playVictory = this.originalSoundMethods.playVictory;
      SOUND.playGameOver = this.originalSoundMethods.playGameOver;
      this.originalSoundMethods = null;
    }
    this.clientInputs = { up: false, down: false, left: false, right: false, fire: false };
  }

  /**
   * Play remote sound locally triggered by host
   */
  playRemoteSound(name, args) {
    if (SOUND[name]) {
      SOUND[name](...args);
    }
  }

  /**
   * Client gathers local WASD/Space or Arrow/Enter inputs and sends them to Host
   */
  sendClientInputs() {
    const inputs = {
      up: !!(this.keysPressed['KeyW'] || this.keysPressed['ArrowUp']),
      down: !!(this.keysPressed['KeyS'] || this.keysPressed['ArrowDown']),
      left: !!(this.keysPressed['KeyA'] || this.keysPressed['ArrowLeft']),
      right: !!(this.keysPressed['KeyD'] || this.keysPressed['ArrowRight']),
      fire: !!(this.keysPressed['Space'] || this.keysPressed['Enter'])
    };
    this.sendWs({
      type: 'CLIENT_UPDATE',
      inputs: inputs
    });
  }

  /**
   * Host serializes fully simulated state array variables and broadcasts them to client
   */
  broadcastGameState() {
    const state = {
      type: 'STATE_UPDATE',
      levelIndex: this.currentLevelIndex,
      enemiesSpawned: this.enemiesSpawnedCount,
      enemiesTotal: this.enemiesTotalCount,
      enemiesRemaining: this.enemiesRemainingCount,
      baseDestroyed: this.mapManager.baseDestroyed,
      shovelActive: this.mapManager.shovelActive,
      shovelTimer: this.mapManager.shovelTimer,
      players: this.players.map(p => ({
        active: p.active,
        x: p.x,
        y: p.y,
        direction: p.direction,
        health: p.health,
        maxHealth: p.maxHealth,
        lives: p.lives,
        score: p.score,
        tier: p.tier,
        shieldTime: p.shieldTime,
        treadAnimationTick: p.treadAnimationTick,
        isMoving: p.isMoving
      })),
      enemies: this.enemies.map(e => ({
        active: e.active,
        x: e.x,
        y: e.y,
        direction: e.direction,
        health: e.health,
        maxHealth: e.maxHealth,
        typeName: e.typeName,
        flashing: e.flashing,
        shieldTime: e.shieldTime,
        treadAnimationTick: e.treadAnimationTick,
        color: e.color
      })),
      bullets: this.bullets.map(b => ({
        active: b.active,
        x: b.x,
        y: b.y,
        size: b.size,
        direction: b.direction,
        isPlayerBullet: b.isPlayerBullet,
        playerIndex: b.playerIndex,
        trail: b.trail
      })),
      powerUps: this.powerUps.map(p => ({
        active: p.active,
        x: p.x,
        y: p.y,
        type: p.type,
        pulseAngle: p.pulseAngle
      }))
    };
    this.sendWs(state);
  }

  /**
   * Client overrides local variables and handles simple HUD re-rendering
   */
  applyStateUpdate(msg) {
    this.currentLevelIndex = msg.levelIndex;
    this.enemiesSpawnedCount = msg.enemiesSpawned;
    this.enemiesTotalCount = msg.enemiesTotal;
    this.enemiesRemainingCount = msg.enemiesRemaining;
    this.mapManager.baseDestroyed = msg.baseDestroyed;
    this.mapManager.shovelActive = msg.shovelActive;
    this.mapManager.shovelTimer = msg.shovelTimer;

    // Ensure players exist and sync properties
    msg.players.forEach((pData, idx) => {
      const player = this.players[idx];
      if (player) {
        player.active = pData.active;
        player.x = pData.x;
        player.y = pData.y;
        player.direction = pData.direction;
        player.health = pData.health;
        player.maxHealth = pData.maxHealth;
        player.lives = pData.lives;
        player.score = pData.score;
        player.tier = pData.tier;
        player.shieldTime = pData.shieldTime;
        player.treadAnimationTick = pData.treadAnimationTick;
        player.isMoving = pData.isMoving;
        this.updateHUDPlayerStats(idx);
      }
    });

    // Reconstruct enemies
    const EnemyClass = EnemyTank;
    this.enemies = msg.enemies.map(eData => {
      const enemy = new EnemyClass(eData.x, eData.y, eData.typeName, eData.flashing);
      enemy.active = eData.active;
      enemy.direction = eData.direction;
      enemy.health = eData.health;
      enemy.maxHealth = eData.maxHealth;
      enemy.shieldTime = eData.shieldTime;
      enemy.treadAnimationTick = eData.treadAnimationTick;
      enemy.color = eData.color;
      return enemy;
    });

    // Reconstruct bullets
    const BulletClass = Bullet;
    this.bullets = msg.bullets.map(bData => {
      const bullet = new BulletClass(bData.x, bData.y, bData.direction, bData.isPlayerBullet, bData.playerIndex);
      bullet.active = bData.active;
      bullet.size = bData.size;
      bullet.trail = bData.trail;
      return bullet;
    });

    // Reconstruct powerups
    const PowerUpClass = PowerUp;
    this.powerUps = msg.powerUps.map(pData => {
      const p = new PowerUpClass(pData.x, pData.y, pData.type);
      p.active = pData.active;
      p.pulseAngle = pData.pulseAngle;
      return p;
    });

    this.updateHUDGlobalStats();
  }
}

// Master engine instanced run
window.onload = () => {
  const ENGINE = new GameEngine();
  ENGINE.init();
};
