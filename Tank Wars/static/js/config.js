/**
 * Cyberpunk Tank Battle - Configuration & Constants
 */

export const CONFIG = {
  TILE_SIZE: 24,       // Size of one grid tile (pixels)
  GRID_COLS: 26,       // Width of map in tiles
  GRID_ROWS: 26,       // Height of map in tiles
  
  // Canvas size will be 26 * 24 = 624px
  get CANVAS_WIDTH() { return this.TILE_SIZE * this.GRID_COLS; },
  get CANVAS_HEIGHT() { return this.TILE_SIZE * this.GRID_ROWS; },

  SUB_TILE_SIZE: 12,   // Brick sub-tile size (12x12px, 4 sub-tiles per block)
  
  // Block Types Mapping
  TILE_TYPES: {
    EMPTY: 0,
    BRICK: 1,
    STEEL: 2,
    WATER: 3,
    BUSH: 4,
    ICE: 5,
    BASE: 6,
    P1_SPAWN: 7,
    P2_SPAWN: 8,
    ENEMY_SPAWN: 9
  },

  // Visual Palette (Neon Cyberpunk Themes)
  COLORS: {
    BG: '#020205',
    P1: '#00f0ff',        // Neon Cyan
    P2: '#ff007f',        // Neon Magenta
    ENEMY_BASIC: '#39ff14', // Neon Green
    ENEMY_FAST: '#ffff00',  // Neon Yellow
    ENEMY_ARMORED: '#ff9f00', // Neon Orange
    ENEMY_BOSS: '#ff3131',    // Neon Red
    
    // Blocks
    BRICK: '#b54b24',
    BRICK_GLOW: 'rgba(181, 75, 36, 0.4)',
    STEEL: '#4f728c',
    STEEL_GLOW: 'rgba(79, 114, 140, 0.4)',
    WATER: '#0066cc',
    WATER_GLOW: 'rgba(0, 102, 204, 0.5)',
    BUSH: '#109648',
    ICE: '#99f2f2',
    BASE: '#ffc300',
    
    // UI Effects
    SHIELD: 'rgba(0, 240, 255, 0.45)',
    SHIELD_OUTLINE: '#00f0ff',
    PARTICLE_SPARK: '#ffb703',
    TEXT_GLOW: 'rgba(0, 240, 255, 0.8)'
  },

  // Game Balance parameters
  PLAYER: {
    INITIAL_LIVES: 3,
    MAX_HEALTH: 100,
    BASE_SPEED: 1.8,
    FIRE_COOLDOWN: 500, // ms
    SHIELD_DURATION: 3000 // ms
  },

  ENEMY: {
    MAX_ACTIVE: 5,       // Maximum active enemies on screen at once
    WAVE_COUNT: 20,      // Total enemies per level
    SPAWN_INTERVAL: 3000 // ms
  },

  // Enemy types configurations
  ENEMY_TYPES: {
    BASIC: { speed: 1.0, health: 30,  score: 100, color: '#39ff14', name: 'Basic' },
    FAST:  { speed: 2.0, health: 30,  score: 200, color: '#ffff00', name: 'Scout' },
    ARMORED: { speed: 1.2, health: 90, score: 300, color: '#ff9f00', name: 'Assault' },
    BOSS:  { speed: 0.8, health: 200, score: 500, color: '#ff3131', name: 'Goliath' }
  },

  // Power Up options
  POWERUP: {
    TYPES: {
      SHIELD: 0,   // Invincible helmet
      FREEZE: 1,   // Time freeze (clock)
      SHOVEL: 2,   // Steel wall surrounding base (shovel)
      STAR: 3,     // Tank weapon upgrade (star)
      BOMB: 4,     // Nuclear clear screen (grenade)
      LIFE: 5,     // Plus 1 life (heart)
      PIERCE: 6    // Pierce steel (gun)
    },
    DURATION: 15000 // duration of active states like Shovel steel walls
  }
};

// HELPER: Map builder. Creates a 26x26 empty matrix
const createEmptyMap = () => Array(CONFIG.GRID_ROWS).fill(null).map(() => Array(CONFIG.GRID_COLS).fill(0));

// Build levels
const lvl1 = createEmptyMap();
const lvl2 = createEmptyMap();
const lvl3 = createEmptyMap();
const lvl4 = createEmptyMap();
const lvl5 = createEmptyMap();

// LEVEL 1: Classic layout with neat distribution
// Define Player and Enemy Spawns & base
const applyStandardSpawns = (map) => {
  map[25][12] = CONFIG.TILE_TYPES.BASE; // Eagle base
  // Spawns
  map[25][9] = CONFIG.TILE_TYPES.P1_SPAWN;
  map[25][15] = CONFIG.TILE_TYPES.P2_SPAWN;
  map[0][0] = CONFIG.TILE_TYPES.ENEMY_SPAWN;
  map[0][12] = CONFIG.TILE_TYPES.ENEMY_SPAWN;
  map[0][25] = CONFIG.TILE_TYPES.ENEMY_SPAWN;
  
  // Shield walls around base
  map[24][11] = CONFIG.TILE_TYPES.BRICK;
  map[24][12] = CONFIG.TILE_TYPES.BRICK;
  map[24][13] = CONFIG.TILE_TYPES.BRICK;
  map[25][11] = CONFIG.TILE_TYPES.BRICK;
  map[25][13] = CONFIG.TILE_TYPES.BRICK;
};

// LEVEL 1 DETAILS
applyStandardSpawns(lvl1);
for(let r = 2; r < 22; r++) {
  if (r === 12 || r === 13) continue;
  // Left-right pillars
  lvl1[r][3] = CONFIG.TILE_TYPES.BRICK;
  lvl1[r][4] = CONFIG.TILE_TYPES.BRICK;
  lvl1[r][21] = CONFIG.TILE_TYPES.BRICK;
  lvl1[r][22] = CONFIG.TILE_TYPES.BRICK;
  
  if (r % 4 !== 0) {
    lvl1[r][8] = CONFIG.TILE_TYPES.BRICK;
    lvl1[r][9] = CONFIG.TILE_TYPES.BRICK;
    lvl1[r][16] = CONFIG.TILE_TYPES.BRICK;
    lvl1[r][17] = CONFIG.TILE_TYPES.BRICK;
  }
}
// Mid steel blocks
lvl1[12][11] = CONFIG.TILE_TYPES.STEEL;
lvl1[12][12] = CONFIG.TILE_TYPES.STEEL;
lvl1[12][13] = CONFIG.TILE_TYPES.STEEL;
lvl1[12][14] = CONFIG.TILE_TYPES.STEEL;
lvl1[13][11] = CONFIG.TILE_TYPES.STEEL;
lvl1[13][14] = CONFIG.TILE_TYPES.STEEL;
// Add some bushes
for(let col = 5; col <= 7; col++) {
  lvl1[5][col] = CONFIG.TILE_TYPES.BUSH;
  lvl1[18][col] = CONFIG.TILE_TYPES.BUSH;
  lvl1[5][26 - 1 - col] = CONFIG.TILE_TYPES.BUSH;
  lvl1[18][26 - 1 - col] = CONFIG.TILE_TYPES.BUSH;
}
// Water dividers
lvl1[8][11] = CONFIG.TILE_TYPES.WATER;
lvl1[8][12] = CONFIG.TILE_TYPES.WATER;
lvl1[8][13] = CONFIG.TILE_TYPES.WATER;
lvl1[8][14] = CONFIG.TILE_TYPES.WATER;

// LEVEL 2: "Waterways" - divided by rivers, bridge battle
applyStandardSpawns(lvl2);
// Horizontal river in the middle
for(let c = 0; c < 26; c++) {
  if (c !== 5 && c !== 12 && c !== 20) { // Bridges
    lvl2[11][c] = CONFIG.TILE_TYPES.WATER;
    lvl2[12][c] = CONFIG.TILE_TYPES.WATER;
  } else {
    lvl2[11][c] = CONFIG.TILE_TYPES.STEEL;
    lvl2[12][c] = CONFIG.TILE_TYPES.STEEL;
  }
}
// Vertical walls
for(let r = 2; r < 24; r++) {
  if (r >= 10 && r <= 13) continue;
  lvl2[r][2] = CONFIG.TILE_TYPES.BRICK;
  lvl2[r][23] = CONFIG.TILE_TYPES.BRICK;
  
  if (r % 3 === 0) {
    lvl2[r][7] = CONFIG.TILE_TYPES.STEEL;
    lvl2[r][18] = CONFIG.TILE_TYPES.STEEL;
  } else {
    lvl2[r][7] = CONFIG.TILE_TYPES.BRICK;
    lvl2[r][18] = CONFIG.TILE_TYPES.BRICK;
  }
}
// Add bushes near bridges
for(let r = 9; r <= 14; r++) {
  lvl2[r][4] = CONFIG.TILE_TYPES.BUSH;
  lvl2[r][6] = CONFIG.TILE_TYPES.BUSH;
  lvl2[r][19] = CONFIG.TILE_TYPES.BUSH;
  lvl2[r][21] = CONFIG.TILE_TYPES.BUSH;
}

// LEVEL 3: "Fortress" - heavy steel grids and ice sheets
applyStandardSpawns(lvl3);
// Draw a steel perimeter maze
for(let r = 3; r < 21; r++) {
  for(let c = 3; c < 23; c++) {
    if (r % 4 === 0 && c % 4 === 0) {
      lvl3[r][c] = CONFIG.TILE_TYPES.STEEL;
    } else if ((r + c) % 6 === 0) {
      lvl3[r][c] = CONFIG.TILE_TYPES.BRICK;
    }
  }
}
// Corners are ice sheets
for(let r = 1; r < 5; r++) {
  for(let c = 1; c < 5; c++) {
    if (lvl3[r][c] === 0) lvl3[r][c] = CONFIG.TILE_TYPES.ICE;
    if (lvl3[r][25-c] === 0) lvl3[r][25-c] = CONFIG.TILE_TYPES.ICE;
    if (lvl3[24-r][c] === 0 && r < 4) lvl3[24-r][c] = CONFIG.TILE_TYPES.ICE;
    if (lvl3[24-r][25-c] === 0 && r < 4) lvl3[24-r][25-c] = CONFIG.TILE_TYPES.ICE;
  }
}

// LEVEL 4: "Jungle Ambush" - dense bushes camouflage tanks
applyStandardSpawns(lvl4);
// Cover large portions in bushes
for(let r = 2; r < 22; r++) {
  for(let c = 2; c < 24; c++) {
    if ((r >= 3 && r <= 8) || (r >= 14 && r <= 19)) {
      if (c >= 3 && c <= 10 || c >= 15 && c <= 22) {
        lvl4[r][c] = CONFIG.TILE_TYPES.BUSH;
      }
    }
    // Random brick pathways inside bushes
    if (r % 5 === 0 && c % 5 === 0) {
      lvl4[r][c] = CONFIG.TILE_TYPES.BRICK;
    }
  }
}
// Central cross of steel/water
for(let i = 8; i < 18; i++) {
  lvl4[i][12] = CONFIG.TILE_TYPES.WATER;
  lvl4[11][i] = CONFIG.TILE_TYPES.WATER;
}
lvl4[11][12] = CONFIG.TILE_TYPES.STEEL;

// LEVEL 5: "Final Showdown" - base fortified with steel, skull shape center
applyStandardSpawns(lvl5);
// Steel skull center
const skull = [
  [8, 10, CONFIG.TILE_TYPES.STEEL], [8, 11, CONFIG.TILE_TYPES.STEEL], [8, 12, CONFIG.TILE_TYPES.STEEL], [8, 13, CONFIG.TILE_TYPES.STEEL], [8, 14, CONFIG.TILE_TYPES.STEEL], [8, 15, CONFIG.TILE_TYPES.STEEL],
  [9, 9, CONFIG.TILE_TYPES.STEEL],  [9, 16, CONFIG.TILE_TYPES.STEEL],
  [10, 9, CONFIG.TILE_TYPES.STEEL], [10, 11, CONFIG.TILE_TYPES.BRICK], [10, 14, CONFIG.TILE_TYPES.BRICK], [10, 16, CONFIG.TILE_TYPES.STEEL], // Eyes
  [11, 9, CONFIG.TILE_TYPES.STEEL], [11, 16, CONFIG.TILE_TYPES.STEEL],
  [12, 10, CONFIG.TILE_TYPES.STEEL], [12, 12, CONFIG.TILE_TYPES.STEEL], [12, 13, CONFIG.TILE_TYPES.STEEL], [12, 15, CONFIG.TILE_TYPES.STEEL],
  [13, 11, CONFIG.TILE_TYPES.STEEL], [13, 12, CONFIG.TILE_TYPES.STEEL], [13, 13, CONFIG.TILE_TYPES.STEEL], [13, 14, CONFIG.TILE_TYPES.STEEL],
];
skull.forEach(([r, c, type]) => {
  lvl5[r][c] = type;
});

// Dense outer brick protective maze
for(let r = 2; r < 24; r++) {
  if (r >= 7 && r <= 15) continue;
  lvl5[r][1] = CONFIG.TILE_TYPES.BRICK;
  lvl5[r][2] = CONFIG.TILE_TYPES.BRICK;
  lvl5[r][23] = CONFIG.TILE_TYPES.BRICK;
  lvl5[r][24] = CONFIG.TILE_TYPES.BRICK;
  
  if (r % 2 === 0) {
    lvl5[r][5] = CONFIG.TILE_TYPES.STEEL;
    lvl5[r][20] = CONFIG.TILE_TYPES.STEEL;
  }
}

export const LEVELS = [lvl1, lvl2, lvl3, lvl4, lvl5];
