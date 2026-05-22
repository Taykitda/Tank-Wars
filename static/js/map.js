/**
 * Cyberpunk Tank Battle - Map Manager
 * Manages grid layouts, block painting, destructible bricks (2x2 sub-tiles), and collision loops.
 */

import { CONFIG } from './config.js';
import { SOUND } from './audio.js';

export class MapManager {
  constructor() {
    this.grid = []; // 2D array of grid cells
    this.baseDestroyed = false;
    
    // Shovel powerup state tracking
    this.shovelActive = false;
    this.shovelTimer = 0;
    this.originalBaseWalls = []; // cache original block types to restore them
    
    this.waterAnimationTick = 0;
  }

  /**
   * Loads a grid map structure and sets up destructible sub-tiles for bricks
   */
  loadMap(mapLayout) {
    this.grid = [];
    this.baseDestroyed = false;
    this.shovelActive = false;
    
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      this.grid[r] = [];
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const type = mapLayout[r][c];
        
        if (type === CONFIG.TILE_TYPES.BRICK) {
          // A brick block has 4 sub-tiles [top-left, top-right, bottom-left, bottom-right]
          this.grid[r][c] = {
            type: CONFIG.TILE_TYPES.BRICK,
            subTiles: [true, true, true, true]
          };
        } else {
          this.grid[r][c] = {
            type: type,
            subTiles: null
          };
        }
      }
    }
  }

  /**
   * Directly mutates a specific cell's type and sub-tiles (used by remote client)
   */
  mutateCell(r, c, type, subTiles) {
    if (r < 0 || r >= CONFIG.GRID_ROWS || c < 0 || c >= CONFIG.GRID_COLS) return;
    this.grid[r][c] = {
      type: type,
      subTiles: subTiles ? [...subTiles] : null
    };
  }


  /**
   * Upgrades the base surrounding walls to steel (shovel pickup) or reverts them
   */
  setBaseShieldWalls(toSteel) {
    const wallCoords = [
      { r: 24, c: 11 }, { r: 24, c: 12 }, { r: 24, c: 13 },
      { r: 25, c: 11 },                  { r: 25, c: 13 }
    ];

    if (toSteel) {
      if (this.shovelActive) return; // already active
      
      this.shovelActive = true;
      this.originalBaseWalls = [];
      
      wallCoords.forEach(coord => {
        // Cache original block state
        const current = this.grid[coord.r][coord.c];
        this.originalBaseWalls.push({
          r: coord.r,
          c: coord.c,
          state: JSON.parse(JSON.stringify(current)) // deep copy
        });
        
        // Turn into steel
        this.grid[coord.r][coord.c] = {
          type: CONFIG.TILE_TYPES.STEEL,
          subTiles: null
        };
        if (this.onMapMutation) {
          this.onMapMutation(coord.r, coord.c, CONFIG.TILE_TYPES.STEEL, null);
        }
      });
    } else {
      if (!this.shovelActive) return;
      
      this.shovelActive = false;
      
      // Restore original blocks
      this.originalBaseWalls.forEach(saved => {
        // Make sure it wasn't overwritten by editing or other logic
        this.grid[saved.r][saved.c] = saved.state;
        if (this.onMapMutation) {
          this.onMapMutation(saved.r, saved.c, saved.state.type, saved.state.subTiles);
        }
      });
      this.originalBaseWalls = [];
    }
  }

  update(dt) {
    // Animate water waves
    this.waterAnimationTick += 0.05 * dt;
    
    // Shovel timer countdown
    if (this.shovelActive) {
      this.shovelTimer -= 16.67 * dt; // approx ms per frame
      if (this.shovelTimer <= 0) {
        this.setBaseShieldWalls(false);
      }
    }
  }

  /**
   * Draws the map tiles onto the canvas (excluding bushes which render last)
   */
  draw(ctx, drawBushes = false) {
    if (!this.grid || this.grid.length === 0) return;
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const cell = this.grid[r][c];
        const x = c * CONFIG.TILE_SIZE;
        const y = r * CONFIG.TILE_SIZE;
        
        // Render layers
        if (!drawBushes && cell.type === CONFIG.TILE_TYPES.BRICK) {
          this.drawBrick(ctx, x, y, cell.subTiles);
        } 
        else if (!drawBushes && cell.type === CONFIG.TILE_TYPES.STEEL) {
          this.drawSteel(ctx, x, y);
        } 
        else if (!drawBushes && cell.type === CONFIG.TILE_TYPES.WATER) {
          this.drawWater(ctx, x, y);
        } 
        else if (drawBushes && cell.type === CONFIG.TILE_TYPES.BUSH) {
          this.drawBush(ctx, x, y);
        } 
        else if (!drawBushes && cell.type === CONFIG.TILE_TYPES.ICE) {
          this.drawIce(ctx, x, y);
        }
        else if (!drawBushes && cell.type === CONFIG.TILE_TYPES.BASE) {
          this.drawBase(ctx, x, y);
        }
      }
    }
  }

  drawBrick(ctx, x, y, subTiles) {
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = CONFIG.COLORS.BRICK_GLOW;
    
    const size = CONFIG.SUB_TILE_SIZE;
    
    // Sub-tiles: 0: TL, 1: TR, 2: BL, 3: BR
    const offsets = [
      { dx: 0, dy: 0 },
      { dx: size, dy: 0 },
      { dx: 0, dy: size },
      { dx: size, dy: size }
    ];
    
    for (let i = 0; i < 4; i++) {
      if (subTiles[i]) {
        const tx = x + offsets[i].dx;
        const ty = y + offsets[i].dy;
        
        ctx.fillStyle = CONFIG.COLORS.BRICK;
        ctx.fillRect(tx, ty, size - 1, size - 1);
        
        // Draw cybernetic circuitry details in the brick
        ctx.strokeStyle = '#df734e';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx + 2, ty + 2, size - 5, size - 5);
      }
    }
    ctx.restore();
  }

  drawSteel(ctx, x, y) {
    ctx.save();
    ctx.shadowBlur = 6;
    ctx.shadowColor = CONFIG.COLORS.STEEL_GLOW;
    
    // Teal metallic square
    ctx.fillStyle = '#2b3f54';
    ctx.fillRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
    
    // Bright neon-cyan inner plate border
    ctx.strokeStyle = CONFIG.COLORS.STEEL;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, CONFIG.TILE_SIZE - 6, CONFIG.TILE_SIZE - 6);
    
    // Central rivet decoration
    ctx.fillStyle = CONFIG.COLORS.STEEL;
    ctx.fillRect(x + CONFIG.TILE_SIZE / 2 - 2, y + CONFIG.TILE_SIZE / 2 - 2, 4, 4);
    
    ctx.restore();
  }

  drawWater(ctx, x, y) {
    ctx.save();
    
    // Deep blue background
    ctx.fillStyle = '#011627';
    ctx.fillRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
    
    // Animated wave lines
    ctx.strokeStyle = CONFIG.COLORS.WATER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    const offset = Math.sin(this.waterAnimationTick) * 3;
    
    // Draw double neon waves
    ctx.moveTo(x, y + 8 + offset);
    ctx.bezierCurveTo(x + 6, y + 2 + offset, x + 12, y + 14 + offset, x + 18, y + 8 + offset);
    ctx.bezierCurveTo(x + 21, y + 5 + offset, x + 24, y + 8 + offset, x + CONFIG.TILE_SIZE, y + 8 + offset);
    
    ctx.moveTo(x, y + 16 - offset);
    ctx.bezierCurveTo(x + 6, y + 10 - offset, x + 12, y + 22 - offset, x + 18, y + 16 - offset);
    ctx.bezierCurveTo(x + 21, y + 13 - offset, x + 24, y + 16 - offset, x + CONFIG.TILE_SIZE, y + 16 - offset);
    
    ctx.stroke();
    ctx.restore();
  }

  drawBush(ctx, x, y) {
    ctx.save();
    
    // Translucent leaf grid overlay
    ctx.fillStyle = 'rgba(16, 150, 72, 0.4)';
    ctx.fillRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
    
    // Neon green foliage particles details
    ctx.strokeStyle = CONFIG.COLORS.BUSH;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Left leaf
    ctx.arc(x + 8, y + 8, 4, 0, Math.PI * 2);
    // Right leaf
    ctx.arc(x + 16, y + 16, 4, 0, Math.PI * 2);
    // Center leaf
    ctx.arc(x + 12, y + 12, 3, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  }

  drawIce(ctx, x, y) {
    ctx.save();
    
    // Light frost cyan glaze
    ctx.fillStyle = 'rgba(153, 242, 242, 0.2)';
    ctx.fillRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
    
    // Outer frost outline
    ctx.strokeStyle = CONFIG.COLORS.ICE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
    
    // Dynamic shine reflection lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(x + 4, y + CONFIG.TILE_SIZE - 4);
    ctx.lineTo(x + CONFIG.TILE_SIZE - 4, y + 4);
    ctx.moveTo(x + 10, y + CONFIG.TILE_SIZE - 4);
    ctx.lineTo(x + CONFIG.TILE_SIZE - 4, y + 10);
    ctx.stroke();
    
    ctx.restore();
  }

  drawBase(ctx, x, y) {
    ctx.save();
    
    if (this.baseDestroyed) {
      // Draw destroyed base (skull with sparks)
      ctx.fillStyle = '#1c1c24';
      ctx.fillRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
      
      ctx.strokeStyle = '#8d99ae';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE - 4);
      
      // Crushed core (red alert indicator)
      ctx.fillStyle = CONFIG.COLORS.ENEMY_BOSS;
      ctx.fillRect(x + CONFIG.TILE_SIZE / 2 - 4, y + CONFIG.TILE_SIZE / 2 - 4, 8, 8);
    } else {
      // Draw glowing central Eagle base core
      ctx.shadowBlur = 10;
      ctx.shadowColor = CONFIG.COLORS.BASE;
      
      // Glowing golden outer shield
      ctx.strokeStyle = CONFIG.COLORS.BASE;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE - 4);
      
      // Eagle emblem (neon polygon)
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 18);
      ctx.lineTo(x + 12, y + 4);  // Eagle peak
      ctx.lineTo(x + 20, y + 18);
      ctx.lineTo(x + 16, y + 14);
      ctx.lineTo(x + 12, y + 18); // Wings center
      ctx.lineTo(x + 8, y + 14);
      ctx.closePath();
      ctx.fill();
      
      // core crystal
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 10, y + 9, 4, 4);
    }
    
    ctx.restore();
  }

  /**
   * Bounding box overlap check for solid blocks
   * Returns: { hit: boolean, friction: number }
   */
  checkTankCollision(x, y, w, h) {
    // 1. Boundary checking
    if (x < 0 || x + w > CONFIG.CANVAS_WIDTH || y < 0 || y + h > CONFIG.CANVAS_HEIGHT) {
      return { hit: true, friction: 0 };
    }

    // Determine grid tiles containing the bounding box coordinates
    const startCol = Math.floor(x / CONFIG.TILE_SIZE);
    const endCol = Math.floor((x + w - 0.1) / CONFIG.TILE_SIZE);
    const startRow = Math.floor(y / CONFIG.TILE_SIZE);
    const endRow = Math.floor((y + h - 0.1) / CONFIG.TILE_SIZE);

    let isSliding = false;

    // Loop through overlapping grid cells
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        // Bounds safeguard
        if (r < 0 || r >= CONFIG.GRID_ROWS || c < 0 || c >= CONFIG.GRID_COLS) {
          return { hit: true, friction: 0 };
        }

        const cell = this.grid[r][c];
        
        // Ice tile alters friction, but doesn't block movement
        if (cell.type === CONFIG.TILE_TYPES.ICE) {
          isSliding = true;
          continue;
        }

        // Solid elements block tanks: BRICK, STEEL, WATER, BASE
        if (
          cell.type === CONFIG.TILE_TYPES.BRICK ||
          cell.type === CONFIG.TILE_TYPES.STEEL ||
          cell.type === CONFIG.TILE_TYPES.WATER ||
          cell.type === CONFIG.TILE_TYPES.BASE
        ) {
          // If brick, check if there are actually active sub-tiles in the path!
          if (cell.type === CONFIG.TILE_TYPES.BRICK) {
            if (this.checkBrickSubTileOverlap(x, y, w, h, r, c)) {
              return { hit: true, friction: 0 };
            }
          } else {
            // Steel, Water, and Eagle are fully solid
            return { hit: true, friction: 0 };
          }
        }
      }
    }

    // No hard collision, return sliding state if on ice
    return { hit: false, friction: isSliding ? 0.96 : 0 };
  }

  /**
   * Precision check to see if bounding box hits active 12x12 sub-bricks
   */
  checkBrickSubTileOverlap(tx, ty, tw, th, r, c) {
    const cell = this.grid[r][c];
    if (!cell.subTiles) return false;
    
    const size = CONFIG.SUB_TILE_SIZE;
    const bx = c * CONFIG.TILE_SIZE;
    const by = r * CONFIG.TILE_SIZE;
    
    const offsets = [
      { dx: 0, dy: 0 },
      { dx: size, dy: 0 },
      { dx: 0, dy: size },
      { dx: size, dy: size }
    ];

    for (let i = 0; i < 4; i++) {
      if (cell.subTiles[i]) {
        const subX = bx + offsets[i].dx;
        const subY = by + offsets[i].dy;
        
        // AABB overlap check between tank and sub-tile
        if (
          tx < subX + size &&
          tx + tw > subX &&
          ty < subY + size &&
          ty + th > subY
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Precision bullet impact collision loop
   * Returns: boolean (whether the bullet exploded on impact)
   */
  checkBulletCollision(bullet) {
    const bx = bullet.x;
    const by = bullet.y;
    const size = bullet.size;
    
    // 1. Boundary checking
    if (bx < 0 || bx + size > CONFIG.CANVAS_WIDTH || by < 0 || by + size > CONFIG.CANVAS_HEIGHT) {
      return true; // explodes
    }

    // Grid coordinates
    const col = Math.floor((bx + size / 2) / CONFIG.TILE_SIZE);
    const row = Math.floor((by + size / 2) / CONFIG.TILE_SIZE);
    
    if (row < 0 || row >= CONFIG.GRID_ROWS || col < 0 || col >= CONFIG.GRID_COLS) {
      return true;
    }
    
    const cell = this.grid[row][col];
    
    // Water, Bush, and Ice allow bullets to fly over
    if (
      cell.type === CONFIG.TILE_TYPES.EMPTY ||
      cell.type === CONFIG.TILE_TYPES.WATER ||
      cell.type === CONFIG.TILE_TYPES.BUSH ||
      cell.type === CONFIG.TILE_TYPES.ICE
    ) {
      return false; // passes through
    }

    // 2. Brick collision (Sub-tile demolition)
    if (cell.type === CONFIG.TILE_TYPES.BRICK) {
      const tileX = col * CONFIG.TILE_SIZE;
      const tileY = row * CONFIG.TILE_SIZE;
      const subSize = CONFIG.SUB_TILE_SIZE;
      
      const offsets = [
        { dx: 0, dy: 0 },
        { dx: subSize, dy: 0 },
        { dx: 0, dy: subSize },
        { dx: subSize, dy: subSize }
      ];
      
      let subHit = false;

      // Find which active sub-tile overlaps with the bullet
      for (let i = 0; i < 4; i++) {
        if (cell.subTiles[i]) {
          const subX = tileX + offsets[i].dx;
          const subY = tileY + offsets[i].dy;
          
          if (
            bx < subX + subSize &&
            bx + size > subX &&
            by < subY + subSize &&
            by + size > subY
          ) {
            // Destroy sub-tile
            cell.subTiles[i] = false;
            subHit = true;
            break;
          }
        }
      }

      if (subHit) {
        // If all 4 sub-tiles are destroyed, empty the whole grid cell
        if (cell.subTiles.every(active => !active)) {
          this.grid[row][col] = { type: CONFIG.TILE_TYPES.EMPTY, subTiles: null };
        }
        if (this.onMapMutation) {
          const currentCell = this.grid[row][col];
          this.onMapMutation(row, col, currentCell.type, currentCell.subTiles);
        }
        return true; // bullet explodes
      }
      return false; // didn't clip a sub-tile yet
    }

    // 3. Steel collision (deflects or penetrates)
    if (cell.type === CONFIG.TILE_TYPES.STEEL) {
      if (bullet.piercesSteel) {
        // Bullet with Super Gun powerup penetrates steel!
        this.grid[row][col] = { type: CONFIG.TILE_TYPES.EMPTY, subTiles: null };
        if (this.onMapMutation) {
          this.onMapMutation(row, col, CONFIG.TILE_TYPES.EMPTY, null);
        }
        SOUND.playExplosion(false);
      }
      return true; // bullet explodes
    }

    // 4. Base Core Eagle collision
    if (cell.type === CONFIG.TILE_TYPES.BASE) {
      if (!this.baseDestroyed) {
        this.baseDestroyed = true;
        SOUND.playBaseHit();
        SOUND.playExplosion(true);
      }
      return true; // bullet explodes
    }

    return false;
  }
}
