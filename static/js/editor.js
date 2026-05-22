/**
 * Cyberpunk Tank Battle - Level Editor Module
 * Canvas mouse painting controls, layout validations, and LocalStorage map persistence.
 */

import { CONFIG } from './config.js';
import { SOUND } from './audio.js';

export class LevelEditor {
  constructor(canvas, mapManager) {
    this.canvas = canvas;
    this.mapManager = mapManager;
    this.selectedBlock = CONFIG.TILE_TYPES.BRICK;
    this.isDrawing = false;
    
    this.grid = Array(CONFIG.GRID_ROWS).fill(null).map(() => Array(CONFIG.GRID_COLS).fill(0));
    
    // palette descriptors
    this.palette = [
      { type: CONFIG.TILE_TYPES.EMPTY, label: 'E', name: '橡皮擦', color: '#111' },
      { type: CONFIG.TILE_TYPES.BRICK, label: 'B', name: '红砖墙', color: CONFIG.COLORS.BRICK },
      { type: CONFIG.TILE_TYPES.STEEL, label: 'S', name: '钛金钢', color: CONFIG.COLORS.STEEL },
      { type: CONFIG.TILE_TYPES.WATER, label: 'W', name: '数字波', color: CONFIG.COLORS.WATER },
      { type: CONFIG.TILE_TYPES.BUSH, label: 'G', name: '潜隐草', color: CONFIG.COLORS.BUSH },
      { type: CONFIG.TILE_TYPES.ICE, label: 'I', name: '滑流冰', color: CONFIG.COLORS.ICE },
      { type: CONFIG.TILE_TYPES.BASE, label: '★', name: '主基地', color: CONFIG.COLORS.BASE },
      { type: CONFIG.TILE_TYPES.P1_SPAWN, label: '1', name: 'P1起点', color: CONFIG.COLORS.P1 },
      { type: CONFIG.TILE_TYPES.P2_SPAWN, label: '2', name: 'P2起点', color: CONFIG.COLORS.P2 },
      { type: CONFIG.TILE_TYPES.ENEMY_SPAWN, label: 'E', name: '敌刷新', color: CONFIG.COLORS.ENEMY_BOSS }
    ];
  }

  /**
   * Initializes the DOM elements and events
   */
  init(onPlayTest, onQuit) {
    this.onPlayTestCallback = onPlayTest;
    this.onQuitCallback = onQuit;
    
    this.setupPaletteDOM();
    
    // Button event connections
    document.getElementById('btnEditorPlay').onclick = () => this.playTest();
    document.getElementById('btnEditorSave').onclick = () => this.saveMap();
    document.getElementById('btnEditorLoad').onclick = () => this.loadSavedMap();
    document.getElementById('btnEditorClear').onclick = () => this.clearGrid();
    document.getElementById('btnEditorQuit').onclick = () => {
      this.disable();
      if (this.onQuitCallback) this.onQuitCallback();
    };
  }

  enable() {
    this.loadSavedMap(true); // load default or cached custom level on startup
    document.getElementById('editorSidebar').classList.remove('hidden');
    document.getElementById('globalStatsBlock').classList.add('hidden');
    document.getElementById('p1Card').classList.add('hidden');
    document.getElementById('p2Card').classList.add('hidden');
    
    this.setupMouseEventListeners();
    this.draw();
  }

  disable() {
    document.getElementById('editorSidebar').classList.add('hidden');
    document.getElementById('globalStatsBlock').classList.remove('hidden');
    document.getElementById('p1Card').classList.remove('hidden');
    
    this.removeMouseEventListeners();
  }

  setupPaletteDOM() {
    const container = document.getElementById('editorPalette');
    container.innerHTML = ''; // reset
    
    this.palette.forEach(item => {
      const el = document.createElement('div');
      el.className = `palette-item ${item.type === this.selectedBlock ? 'active' : ''}`;
      el.style.backgroundColor = item.color;
      el.title = item.name;
      
      const label = document.createElement('span');
      label.className = 'palette-label';
      label.innerText = item.label;
      
      el.appendChild(label);
      
      el.onclick = () => {
        // Toggle active styling
        document.querySelectorAll('.palette-item').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
        this.selectedBlock = item.type;
        SOUND.playShoot(0, true); // feedback buzz
      };
      
      container.appendChild(el);
    });
  }

  setupMouseEventListeners() {
    // Mouse coords mapper
    const getCoords = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      
      const col = Math.floor(mx / CONFIG.TILE_SIZE);
      const row = Math.floor(my / CONFIG.TILE_SIZE);
      return { col, row };
    };

    const drawTile = (e) => {
      const { col, row } = getCoords(e);
      if (row >= 0 && row < CONFIG.GRID_ROWS && col >= 0 && col < CONFIG.GRID_COLS) {
        // Only modify if type changed to avoid redraw flicker
        if (this.grid[row][col] !== this.selectedBlock) {
          this.grid[row][col] = this.selectedBlock;
          this.draw();
        }
      }
    };

    this.canvas.onmousedown = (e) => {
      this.isDrawing = true;
      drawTile(e);
    };

    this.canvas.onmousemove = (e) => {
      if (this.isDrawing) drawTile(e);
    };

    window.onmouseup = () => {
      this.isDrawing = false;
    };
  }

  removeMouseEventListeners() {
    this.canvas.onmousedown = null;
    this.canvas.onmousemove = null;
    window.onmouseup = null;
  }

  clearGrid() {
    this.grid = Array(CONFIG.GRID_ROWS).fill(null).map(() => Array(CONFIG.GRID_COLS).fill(0));
    // Re-place default Base Eagle block at bottom center
    this.grid[25][12] = CONFIG.TILE_TYPES.BASE;
    this.grid[24][11] = CONFIG.TILE_TYPES.BRICK;
    this.grid[24][12] = CONFIG.TILE_TYPES.BRICK;
    this.grid[24][13] = CONFIG.TILE_TYPES.BRICK;
    this.grid[25][11] = CONFIG.TILE_TYPES.BRICK;
    this.grid[25][13] = CONFIG.TILE_TYPES.BRICK;
    
    SOUND.playExplosion(false);
    this.draw();
  }

  /**
   * Layout check rules (ensures level is logically playable)
   */
  validateMap() {
    let baseCount = 0;
    let p1Spawn = 0;
    let enemySpawn = 0;
    
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const type = this.grid[r][c];
        if (type === CONFIG.TILE_TYPES.BASE) baseCount++;
        if (type === CONFIG.TILE_TYPES.P1_SPAWN) p1Spawn++;
        if (type === CONFIG.TILE_TYPES.ENEMY_SPAWN) enemySpawn++;
      }
    }
    
    if (baseCount !== 1) {
      alert('地图验证错误: 必须包含且仅能有一个“主基地(★)”！');
      return false;
    }
    if (p1Spawn !== 1) {
      alert('地图验证错误: 必须有且仅有一个“玩家1起点(1)”！');
      return false;
    }
    if (enemySpawn < 1) {
      alert('地图验证错误: 请放置至少一个“敌刷新点(E)”！');
      return false;
    }
    return true;
  }

  saveMap() {
    if (!this.validateMap()) return;
    
    localStorage.setItem('custom_neon_tank_map', JSON.stringify(this.grid));
    SOUND.playPowerUpCollect();
    alert('主脑已同步：自定义战役地图已成功保存！');
  }

  loadSavedMap(silent = false) {
    const data = localStorage.getItem('custom_neon_tank_map');
    if (data) {
      this.grid = JSON.parse(data);
      if (!silent) {
        SOUND.playPowerUpCollect();
        alert('主脑已提取：自定义战役地图载入成功！');
      }
      this.draw();
    } else {
      if (!silent) {
        alert('未检索到保存的数据。请绘制地图并点击“保存地图”。');
      }
      this.clearGrid(); // set standard default structure
    }
  }

  playTest() {
    if (!this.validateMap()) return;
    
    SOUND.playPowerUpCollect();
    if (this.onPlayTestCallback) {
      // Pass copy of custom map layout to game loop
      const mapLayoutCopy = JSON.parse(JSON.stringify(this.grid));
      this.onPlayTestCallback(mapLayoutCopy);
    }
  }

  draw() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Load grid state into the mapManager to use its draw logic
    this.mapManager.loadMap(this.grid);
    
    // Draw all physical items (bricks, steel, ice, base)
    this.mapManager.draw(ctx, false);
    
    // Draw bushes translucent on top
    this.mapManager.draw(ctx, true);
    
    // Draw overlays for Spawns
    ctx.save();
    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        const type = this.grid[r][c];
        const x = c * CONFIG.TILE_SIZE;
        const y = r * CONFIG.TILE_SIZE;
        
        if (type === CONFIG.TILE_TYPES.P1_SPAWN) {
          ctx.strokeStyle = CONFIG.COLORS.P1;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 2, y + 2, CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE - 4);
          ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
          ctx.fillRect(x + 2, y + 2, CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE - 4);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px Orbitron';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('P1', x + CONFIG.TILE_SIZE/2, y + CONFIG.TILE_SIZE/2);
        }
        else if (type === CONFIG.TILE_TYPES.P2_SPAWN) {
          ctx.strokeStyle = CONFIG.COLORS.P2;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 2, y + 2, CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE - 4);
          ctx.fillStyle = 'rgba(255, 0, 127, 0.15)';
          ctx.fillRect(x + 2, y + 2, CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE - 4);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px Orbitron';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('P2', x + CONFIG.TILE_SIZE/2, y + CONFIG.TILE_SIZE/2);
        }
        else if (type === CONFIG.TILE_TYPES.ENEMY_SPAWN) {
          ctx.strokeStyle = CONFIG.COLORS.ENEMY_BOSS;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 2, y + 2, CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE - 4);
          ctx.fillStyle = 'rgba(255, 49, 49, 0.15)';
          ctx.fillRect(x + 2, y + 2, CONFIG.TILE_SIZE - 4, CONFIG.TILE_SIZE - 4);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px Orbitron';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('EN', x + CONFIG.TILE_SIZE/2, y + CONFIG.TILE_SIZE/2);
        }
      }
    }
    
    // Draw fine neon grid outline helper
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i <= CONFIG.GRID_COLS; i++) {
      ctx.moveTo(i * CONFIG.TILE_SIZE, 0);
      ctx.lineTo(i * CONFIG.TILE_SIZE, this.canvas.height);
      ctx.moveTo(0, i * CONFIG.TILE_SIZE);
      ctx.lineTo(this.canvas.width, i * CONFIG.TILE_SIZE);
    }
    ctx.stroke();
    
    ctx.restore();
  }
}
