/**
 * Cyberpunk Tank Battle - Entities Modules
 * Tank, Player, Enemy, Bullet, PowerUp, and Particle classes.
 */

import { CONFIG } from './config.js';
import { SOUND } from './audio.js';

// ==========================================
// 1. PARTICLE SYSTEM
// ==========================================
export class Particle {
  constructor(x, y, color = CONFIG.COLORS.PARTICLE_SPARK) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = Math.random() * 3 + 1.5;
    
    // Random velocity explosion vector
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3.5 + 1.0;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    this.maxLife = Math.random() * 25 + 15; // frames
    this.life = this.maxLife;
    this.active = true;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    // Friction / drag
    this.vx *= Math.pow(0.94, dt);
    this.vy *= Math.pow(0.94, dt);
    
    this.life -= dt;
    if (this.life <= 0) {
      this.active = false;
    }
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = this.color;
    
    ctx.fillStyle = this.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
}

// ==========================================
// 2. BULLET ENTITY
// ==========================================
export class Bullet {
  constructor(x, y, direction, isPlayerBullet, playerIndex = 0, tier = 1) {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.isPlayerBullet = isPlayerBullet;
    this.playerIndex = playerIndex;
    this.active = true;
    
    this.size = 5;
    this.width = 5;
    this.height = 5;
    this.speed = isPlayerBullet ? 5.5 : 3.8;
    
    // Bullet properties based on weapon upgrades
    this.piercesSteel = isPlayerBullet && tier >= 4;
    this.damage = isPlayerBullet ? (tier >= 2 ? 40 : 30) : 25;
    
    // Velocity vectors
    this.vx = 0;
    this.vy = 0;
    
    switch (direction) {
      case 'UP':    this.vy = -this.speed; break;
      case 'DOWN':  this.vy = this.speed; break;
      case 'LEFT':  this.vx = -this.speed; break;
      case 'RIGHT': this.vx = this.speed; break;
    }
    
    this.trail = []; // Cache trailing positions
  }

  update(dt, mapManager, particles) {
    // Save trail history
    this.trail.push({ x: this.x + this.size / 2, y: this.y + this.size / 2 });
    if (this.trail.length > 5) this.trail.shift();
    
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    // Check map boundaries and obstacle collisions
    const hitBlock = mapManager.checkBulletCollision(this);
    if (hitBlock) {
      this.active = false;
      this.explodeSparks(particles);
    }
  }

  explodeSparks(particles, count = 8) {
    const cx = this.x + this.size / 2;
    const cy = this.y + this.size / 2;
    const color = this.isPlayerBullet 
      ? (this.playerIndex === 0 ? CONFIG.COLORS.P1 : CONFIG.COLORS.P2) 
      : CONFIG.COLORS.ENEMY_BOSS;
      
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(cx, cy, color));
    }
  }

  draw(ctx) {
    ctx.save();
    
    const color = this.isPlayerBullet 
      ? (this.playerIndex === 0 ? CONFIG.COLORS.P1 : CONFIG.COLORS.P2) 
      : CONFIG.COLORS.ENEMY_BOSS;
      
    // 1. Draw glowing neon laser trailing lines
    if (this.trail.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.stroke();
    }
    
    // 2. Draw bullet core head
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x + this.size/2, this.y + this.size/2, this.size/2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
}

// ==========================================
// 3. BASE TANK CLASS
// ==========================================
export class Tank {
  constructor(x, y, speed, maxHealth, color) {
    this.x = x;
    this.y = y;
    this.width = 21;  // TILE_SIZE is 24, 21 enables navigating gaps easily
    this.height = 21;
    this.speed = speed;
    this.health = maxHealth;
    this.maxHealth = maxHealth;
    this.color = color;
    
    this.direction = 'UP';
    this.active = true;
    this.shieldTime = 0; // ms
    this.fireCooldown = 0; // ms
    
    // Sliding physical variables (Ice)
    this.slideX = 0;
    this.slideY = 0;
    
    this.treadAnimationTick = 0;
  }

  update(dt, mapManager) {
    if (this.fireCooldown > 0) {
      this.fireCooldown -= 16.67 * dt;
    }
    if (this.shieldTime > 0) {
      this.shieldTime -= 16.67 * dt;
    }
    
    // Treads visual oscillation
    if (this.isMoving) {
      this.treadAnimationTick += 0.25 * dt;
    }
  }

  /**
   * Safe collision-resolved coordinate placement
   */
  move(dx, dy, mapManager) {
    this.isMoving = (dx !== 0 || dy !== 0);
    
    // Apply slide inertia if sliding on ice
    let finalDx = dx;
    let finalDy = dy;
    
    // Check collision on X axis
    const collX = mapManager.checkTankCollision(this.x + finalDx, this.y, this.width, this.height);
    if (!collX.hit) {
      this.x += finalDx;
      if (collX.friction > 0) {
        this.slideX = finalDx * collX.friction;
      } else {
        this.slideX = 0;
      }
    } else {
      this.x = Math.round(this.x);
      this.slideX = 0;
    }
    
    // Check collision on Y axis
    const collY = mapManager.checkTankCollision(this.x, this.y + finalDy, this.width, this.height);
    if (!collY.hit) {
      this.y += finalDy;
      if (collY.friction > 0) {
        this.slideY = finalDy * collY.friction;
      } else {
        this.slideY = 0;
      }
    } else {
      this.y = Math.round(this.y);
      this.slideY = 0;
    }
    
    // Apply sliding inertia if not actively steering
    if (dx === 0 && Math.abs(this.slideX) > 0.05) {
      const slideColl = mapManager.checkTankCollision(this.x + this.slideX, this.y, this.width, this.height);
      if (!slideColl.hit) {
        this.x += this.slideX;
        this.slideX *= slideColl.friction || 0.85;
      } else {
        this.slideX = 0;
      }
    }
    if (dy === 0 && Math.abs(this.slideY) > 0.05) {
      const slideColl = mapManager.checkTankCollision(this.x, this.y + this.slideY, this.width, this.height);
      if (!slideColl.hit) {
        this.y += this.slideY;
        this.slideY *= slideColl.friction || 0.85;
      } else {
        this.slideY = 0;
      }
    }
  }

  takeDamage(amount) {
    if (this.shieldTime > 0) return false; // Invincible shield
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.active = false;
    }
    return true;
  }

  draw(ctx) {
    ctx.save();
    
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    
    // Apply rotation based on current direction
    ctx.translate(cx, cy);
    if (this.direction === 'DOWN')  ctx.rotate(Math.PI);
    if (this.direction === 'LEFT')  ctx.rotate(-Math.PI / 2);
    if (this.direction === 'RIGHT') ctx.rotate(Math.PI / 2);
    
    // Draw neon outline tank body
    ctx.shadowBlur = 6;
    ctx.shadowColor = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.8;
    ctx.fillStyle = CONFIG.COLORS.BG;
    
    // Tank chassis
    ctx.beginPath();
    ctx.roundRect(-this.width/2 + 2, -this.height/2 + 1, this.width - 4, this.height - 2, 4);
    ctx.fill();
    ctx.stroke();
    
    // Vector treads (dashed line oscillation)
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#ffffff';
    const dashOffset = (Math.floor(this.treadAnimationTick) % 2) * 3;
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = dashOffset;
    // Left tread
    ctx.beginPath(); ctx.moveTo(-this.width/2 + 1, -this.height/2 + 2); ctx.lineTo(-this.width/2 + 1, this.height/2 - 2); ctx.stroke();
    // Right tread
    ctx.beginPath(); ctx.moveTo(this.width/2 - 1, -this.height/2 + 2);  ctx.lineTo(this.width/2 - 1, this.height/2 - 2);  ctx.stroke();
    ctx.setLineDash([]); // clear dash
    
    // Turret cap
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 2, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    
    // Laser barrel
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -this.height/2 - 2);
    ctx.stroke();
    
    ctx.restore();
    
    // Draw rotating shield polygon if invincible
    if (this.shieldTime > 0) {
      this.drawShieldBubble(ctx);
    }
  }

  drawShieldBubble(ctx) {
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = CONFIG.COLORS.SHIELD_OUTLINE;
    ctx.strokeStyle = CONFIG.COLORS.SHIELD_OUTLINE;
    ctx.fillStyle = CONFIG.COLORS.SHIELD;
    ctx.lineWidth = 1.5;
    
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const radius = this.width * 0.85;
    
    // Rotating hexagonal shield bubble
    const rot = (Date.now() / 200) % (Math.PI * 2);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = rot + (Math.PI / 3) * i;
      const sx = cx + Math.cos(angle) * radius;
      const sy = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }
}

// ==========================================
// 4. PLAYER TANK
// ==========================================
export class PlayerTank extends Tank {
  constructor(x, y, playerIndex = 0) {
    const color = playerIndex === 0 ? CONFIG.COLORS.P1 : CONFIG.COLORS.P2;
    super(x, y, CONFIG.PLAYER.BASE_SPEED, CONFIG.PLAYER.MAX_HEALTH, color);
    
    this.playerIndex = playerIndex;
    this.score = 0;
    this.lives = CONFIG.PLAYER.INITIAL_LIVES;
    this.tier = 1; // upgrade level (1 to 4)
    this.pierceSteelEnabled = false; // Gun powerup override
  }

  /**
   * Resets player state after losing a life
   */
  respawn(spawnX, spawnY) {
    this.x = spawnX;
    this.y = spawnY;
    this.health = this.maxHealth;
    this.direction = 'UP';
    this.active = true;
    this.shieldTime = CONFIG.PLAYER.SHIELD_DURATION; // Temp invincibility spawn shield
    this.tier = 1; // revert weapon tier
    this.pierceSteelEnabled = false;
    this.slideX = 0;
    this.slideY = 0;
  }

  fire(bullets) {
    if (this.fireCooldown > 0 || !this.active) return;
    
    // Adjust fire cooldown speed based on weapons upgrade
    const cd = this.tier >= 2 ? CONFIG.PLAYER.FIRE_COOLDOWN * 0.65 : CONFIG.PLAYER.FIRE_COOLDOWN;
    this.fireCooldown = cd;
    
    SOUND.playShoot(this.playerIndex, this.tier >= 2);
    
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const bulletTier = this.pierceSteelEnabled ? 4 : this.tier;
    
    if (this.tier === 3) {
      // Tier 3: Dual shots flanking the barrel
      if (this.direction === 'UP' || this.direction === 'DOWN') {
        bullets.push(new Bullet(cx - 6, cy + (this.direction === 'UP' ? -15 : 10), this.direction, true, this.playerIndex, bulletTier));
        bullets.push(new Bullet(cx + 2, cy + (this.direction === 'UP' ? -15 : 10), this.direction, true, this.playerIndex, bulletTier));
      } else {
        bullets.push(new Bullet(cx + (this.direction === 'LEFT' ? -15 : 10), cy - 6, this.direction, true, this.playerIndex, bulletTier));
        bullets.push(new Bullet(cx + (this.direction === 'LEFT' ? -15 : 10), cy + 2, this.direction, true, this.playerIndex, bulletTier));
      }
    } else {
      // Standard single bullet shot
      let bx = cx - 2.5;
      let by = cy - 2.5;
      
      switch (this.direction) {
        case 'UP':    by -= 14; break;
        case 'DOWN':  by += 14; break;
        case 'LEFT':  bx -= 14; break;
        case 'RIGHT': bx += 14; break;
      }
      
      bullets.push(new Bullet(bx, by, this.direction, true, this.playerIndex, bulletTier));
    }
  }

  upgrade() {
    if (this.tier < 4) {
      this.tier++;
      SOUND.playPowerUpCollect();
      return true;
    }
    return false;
  }
}

// ==========================================
// 5. ENEMY TANK (INTELLIGENT AI)
// ==========================================
export class EnemyTank extends Tank {
  constructor(x, y, typeName = 'BASIC', carriesPowerup = false) {
    const config = CONFIG.ENEMY_TYPES[typeName];
    super(x, y, config.speed, config.health, config.color);
    
    this.typeName = typeName;
    this.scoreValue = config.score;
    this.flashing = carriesPowerup; // carries floating capsule if flashing red
    
    this.direction = 'DOWN';
    this.changeDirTimer = 0;
    this.fireTimer = Math.random() * 1500 + 800; // ms
    this.aiBiasTick = 0;
  }

  aiMove(dt, mapManager, players, basePos) {
    this.changeDirTimer -= 16.67 * dt;
    this.fireTimer -= 16.67 * dt;
    
    let isBlocked = false;
    let dx = 0;
    let dy = 0;
    
    // 1. Direction steering AI
    if (this.changeDirTimer <= 0) {
      this.changeDirTimer = Math.random() * 2000 + 1000; // recalculate in 1-3 seconds
      this.steerTowardsTarget(players, basePos);
    }
    
    // Set velocity components
    switch (this.direction) {
      case 'UP':    dy = -this.speed; break;
      case 'DOWN':  dy = this.speed; break;
      case 'LEFT':  dx = -this.speed; break;
      case 'RIGHT': dx = this.speed; break;
    }
    
    // Keep track of old coords to detect collision stops
    const oldX = this.x;
    const oldY = this.y;
    
    this.move(dx * dt, dy * dt, mapManager);
    
    // If movement is blocked, steer away instantly!
    if (Math.abs(this.x - oldX) < 0.05 && Math.abs(this.y - oldY) < 0.05 && (dx !== 0 || dy !== 0)) {
      this.changeDirTimer = 0; // trigger immediate direction change on next tick
    }
  }

  /**
   * Dynamic hunting steering with bias towards base & players
   */
  steerTowardsTarget(players, basePos) {
    const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    
    // 40% chance of random wandering, 60% chance of targeted steer
    if (Math.random() < 0.4) {
      this.direction = dirs[Math.floor(Math.random() * dirs.length)];
      return;
    }
    
    // Choose target (70% chance targeting Eagle Base, 30% chance targeting player)
    let tx = basePos.x;
    let ty = basePos.y;
    
    const activePlayers = players.filter(p => p.active);
    if (activePlayers.length > 0 && Math.random() < 0.3) {
      const closest = activePlayers[Math.floor(Math.random() * activePlayers.length)];
      tx = closest.x;
      ty = closest.y;
    }
    
    const diffX = tx - this.x;
    const diffY = ty - this.y;
    
    // Steer towards greater difference coordinate
    if (Math.abs(diffX) > Math.abs(diffY)) {
      this.direction = diffX > 0 ? 'RIGHT' : 'LEFT';
    } else {
      this.direction = diffY > 0 ? 'DOWN' : 'UP';
    }
  }

  aiFire(bullets) {
    if (this.fireTimer <= 0 && this.active) {
      this.fireTimer = Math.random() * 2000 + 1000; // reload in 1-3 seconds
      
      SOUND.playShoot(2, false); // Enemy fire laser sound
      
      const cx = this.x + this.width / 2;
      const cy = this.y + this.height / 2;
      let bx = cx - 2.5;
      let by = cy - 2.5;
      
      switch (this.direction) {
        case 'UP':    by -= 14; break;
        case 'DOWN':  by += 14; break;
        case 'LEFT':  bx -= 14; break;
        case 'RIGHT': bx += 14; break;
      }
      
      bullets.push(new Bullet(bx, by, this.direction, false));
    }
  }

  draw(ctx) {
    // Red aura stroke flashing if this enemy holds a power-up capsule
    if (this.flashing && (Math.floor(Date.now() / 150) % 2 === 0)) {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = CONFIG.COLORS.P2;
      
      const tempColor = this.color;
      this.color = CONFIG.COLORS.P2; // Flash pink
      super.draw(ctx);
      this.color = tempColor;
      
      ctx.restore();
    } else {
      super.draw(ctx);
    }
  }
}

// ==========================================
// 6. POWER-UP / CAPSULE ENTITY
// ==========================================
export class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type; // CONFIG.POWERUP.TYPES values
    
    this.width = 18;
    this.height = 18;
    this.active = true;
    
    this.pulseAngle = 0;
    SOUND.playPowerUpSpawn();
  }

  update(dt) {
    this.pulseAngle += 0.08 * dt;
  }

  draw(ctx) {
    ctx.save();
    
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    
    // Glowing pulse scale
    const scale = 1 + Math.sin(this.pulseAngle) * 0.12;
    
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    
    // Choose capsule color
    let color = CONFIG.COLORS.P1;
    if (this.type === CONFIG.POWERUP.TYPES.BOMB || this.type === CONFIG.POWERUP.TYPES.LIFE) {
      color = CONFIG.COLORS.P2;
    } else if (this.type === CONFIG.POWERUP.TYPES.STAR || this.type === CONFIG.POWERUP.TYPES.PIERCE) {
      color = CONFIG.COLORS.ENEMY_FAST;
    }
    
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.fillStyle = CONFIG.COLORS.BG;
    
    // Hexagonal capsule shape
    ctx.beginPath();
    ctx.moveTo(0, -this.height / 2);
    ctx.lineTo(this.width / 2, -this.height / 3);
    ctx.lineTo(this.width / 2, this.height / 3);
    ctx.lineTo(0, this.height / 2);
    ctx.lineTo(-this.width / 2, this.height / 3);
    ctx.lineTo(-this.width / 2, -this.height / 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw Capsule Icon Letter for arcade styling
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let char = 'S'; // default Shield
    switch (this.type) {
      case CONFIG.POWERUP.TYPES.SHIELD: char = 'S'; break; // Shield
      case CONFIG.POWERUP.TYPES.FREEZE: char = 'T'; break; // Time Freeze
      case CONFIG.POWERUP.TYPES.SHOVEL: char = 'B'; break; // Base block (spade)
      case CONFIG.POWERUP.TYPES.STAR:   char = 'U'; break; // Upgrade
      case CONFIG.POWERUP.TYPES.BOMB:   char = 'N'; break; // Nuke bomb
      case CONFIG.POWERUP.TYPES.LIFE:   char = 'L'; break; // Life
      case CONFIG.POWERUP.TYPES.PIERCE: char = 'P'; break; // Pierce
    }
    
    ctx.fillText(char, 0, 0);
    
    ctx.restore();
  }
}
