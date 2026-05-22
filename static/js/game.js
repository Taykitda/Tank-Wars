/**
 * Cyberpunk Tank Battle - Game Engine Master Orchestrator
 * Game loops, 2-player simultaneous inputs, state machines, wave manager, and screenshakes.
 */

import { CONFIG, LEVELS } from './config.js';
import { SOUND } from './audio.js';
import { MapManager } from './map.js';
import { PlayerTank, EnemyTank, PowerUp, Particle } from './entities.js';
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
    this.particles = [];
    
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
    
    // Game overlay cards
    document.getElementById('btnRetry').onclick = () => {
      this.startCampaignLevel(this.currentLevelIndex);
    };
    document.getElementById('btnGameOverMenu').onclick = () => {
      this.changeState('MENU');
    };
    
    document.getElementById('btnNextLevel').onclick = () => {
      if (this.currentLevelIndex + 1 < LEVELS.length) {
        this.startCampaignLevel(this.currentLevelIndex + 1);
      } else {
        alert('主脑宣告：所有五大战役已全部清剿！您拯救了赛博核心！');
        this.changeState('MENU');
      }
    };
    document.getElementById('btnVictoryMenu').onclick = () => {
      this.changeState('MENU');
    };
    
    // Pause overlay actions
    document.getElementById('btnResume').onclick = () => {
      this.changeState('PLAYING');
    };
    document.getElementById('btnQuitGame').onclick = () => {
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
    
    // Sound adjustments
    SOUND.silenceEngine();
    
    switch (newState) {
      case 'MENU':
        document.getElementById('menuScreen').classList.remove('hidden');
        this.players = [];
        this.enemies = [];
        this.bullets = [];
        this.powerUps = [];
        this.particles = [];
        break;
        
      case 'LEVEL_SELECT':
        this.renderLevelSelectGrid();
        document.getElementById('levelSelectScreen').classList.remove('hidden');
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
  startCampaignLevel(levelIndex) {
    this.currentLevelIndex = levelIndex;
    this.customMapLayout = null;
    
    const layout = LEVELS[levelIndex];
    this.parseSpawnsAndLoad(layout);
    
    document.getElementById('hudLevelVal').innerText = `关卡 ${levelIndex + 1}`;
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
    this.particles = [];
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
  }

  handlePlayerInput(player, index, dt) {
    let dx = 0;
    let dy = 0;
    
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
}

// Master engine instanced run
window.onload = () => {
  const ENGINE = new GameEngine();
  ENGINE.init();
};
