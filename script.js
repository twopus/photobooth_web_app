// script.js — Cloud Studio Photobooth (FIXED)

const CONFIG = { gap: 40 };
const MAX_SHOTS = 8;
const MAX_HISTORY = 12;

let state = {
  photos: [],
  selectedIndices: [],
  targetCount: 4,
  layoutSubMode: 'grid',
  bgColor: '#ffffff',
  bgImage: null,
  objects: [],
  activeObj: null,
  isMirrored: true,
  cameraFilter: 'none',
  brightness: 1.0,

  isDrawing: false,
  brushType: 'marker',
  drawColor: '#000000',
  drawPaths: [],
  brushSize: 8,
  filterType: 'none',
  filterIntensity: 0.8,
  zoom: 1,

  history: [],
  historyStep: -1,
  lineStart: null
};

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const drawLayer = document.createElement('canvas');
const drawCtx = drawLayer.getContext('2d');

let cameraInitialized = false;

// ──────────────────────────────────────────────
// Initialization & Settings Persistence
// ──────────────────────────────────────────────

function initSettings() {
  if (localStorage.getItem('studioLight')) {
    const lightColor = localStorage.getItem('studioLight');
    const lightPicker = document.getElementById('light-picker');
    if (lightPicker) lightPicker.value = lightColor;
  }
  if (localStorage.getItem('brightness')) {
    state.brightness = parseFloat(localStorage.getItem('brightness'));
    const brightnessSlider = document.getElementById('brightness-slider');
    if (brightnessSlider) brightnessSlider.value = state.brightness;
    applyLiveFilter();
  }
  if (localStorage.getItem('isMirrored') !== null) {
    state.isMirrored = JSON.parse(localStorage.getItem('isMirrored'));
  }
  video.classList.toggle('mirrored', state.isMirrored);
}

initSettings();

// ──────────────────────────────────────────────
// Camera & Capture
// ──────────────────────────────────────────────

async function startCamera() {
  if (cameraInitialized && video.srcObject) {
    switchView('view-camera');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' }
    });
    video.srcObject = stream;
    cameraInitialized = true;
    switchView('view-camera');
    applyLiveFilter();
  } catch (err) {
    alert("Camera access denied or unavailable.\nPlease allow camera access.");
  }
}

function toggleInvert() {
  state.isMirrored = !state.isMirrored;
  video.classList.toggle('mirrored', state.isMirrored);
  localStorage.setItem('isMirrored', JSON.stringify(state.isMirrored));
}

let isCapturing = false;
document.getElementById('shutter-btn').onclick = triggerCapture;

function triggerCapture() {
  if (isCapturing || state.photos.length >= MAX_SHOTS) return;
  isCapturing = true;
  const btn = document.getElementById('shutter-btn');
  btn.classList.add('disabled');

  let count = 3;
  const cd = document.getElementById('countdown');
  cd.style.display = 'block';
  cd.textContent = count;

  const timer = setInterval(() => {
    count--;
    if (count > 0) {
      cd.textContent = count;
    } else {
      clearInterval(timer);
      cd.style.display = 'none';
      snap();
    }
  }, 900);
}

function snap() {
  const flash = document.getElementById('flash-fx');
  flash.style.opacity = 1;
  setTimeout(() => flash.style.opacity = 0, 150);

  const c = document.createElement('canvas');
  c.width = 854;
  c.height = 480;
  const cx = c.getContext('2d');

  if (state.isMirrored) {
    cx.translate(854, 0);
    cx.scale(-1, 1);
  }

  cx.filter = 'none';
  cx.drawImage(video, 0, 0, 854, 480);

  state.photos.push(c);
  isCapturing = false;
  document.getElementById('shutter-btn').classList.remove('disabled');
  updateCamUI();

  if (state.photos.length === MAX_SHOTS) finishSession();
}

function updateCamUI() {
  document.getElementById('shot-status').textContent = `${state.photos.length} / ${MAX_SHOTS}`;
  document.getElementById('btn-finish').style.display = state.photos.length > 0 ? 'block' : 'none';
}

document.getElementById('btn-finish').onclick = finishSession;

function finishSession() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    cameraInitialized = false;
  }
  setupSelectionScreen();
}

// ──────────────────────────────────────────────
// Live Camera Filters
// ──────────────────────────────────────────────

function setLiveFilter(type) {
  state.cameraFilter = type;
  applyLiveFilter();
}

function applyLiveFilter() {
  let f = `brightness(${state.brightness}) `;
  switch (state.cameraFilter) {
    case 'bw':      f += 'grayscale(1)'; break;
    case 'vintage': f += 'sepia(0.6) saturate(0.8)'; break;
    case 'warm':    f += 'sepia(0.3) brightness(1.1)'; break;
    case 'cool':    f += 'hue-rotate(180deg) saturate(1.2)'; break;
    default:        f += 'none';
  }
  video.style.filter = f;
}

// ──────────────────────────────────────────────
// Selection Screen
// ──────────────────────────────────────────────

function setupSelectionScreen() {
  switchView('view-select');
  const layoutDiv = document.getElementById('layout-buttons');
  layoutDiv.innerHTML = '';

  const options = [1,2,4,6,8].filter(n => n <= state.photos.length);
  let def = options.includes(4) ? 4 : options[options.length-1];
  state.targetCount = def;

  options.forEach(n => {
    const b = document.createElement('button');
    b.className = 'layout-btn' + (n === def ? ' active' : '');
    b.textContent = n;
    b.onclick = () => {
      state.targetCount = n;
      layoutDiv.querySelectorAll('.layout-btn').forEach(bb => bb.classList.remove('active'));
      b.classList.add('active');
      state.selectedIndices = [];
      renderThumbnails();
    };
    layoutDiv.appendChild(b);
  });

  updateSubOptions();
  renderThumbnails();
}

function updateSubOptions() {
  const sub = document.getElementById('sub-options');
  sub.innerHTML = '';
  if (state.targetCount === 2) {
    ['horiz','vert'].forEach(v => {
      const b = document.createElement('button');
      b.className = 'sub-btn' + (state.layoutSubMode === v ? ' active' : '');
      b.textContent = v === 'horiz' ? 'Side by Side' : 'Stacked';
      b.onclick = () => {
        state.layoutSubMode = v;
        sub.querySelectorAll('.sub-btn').forEach(bb => bb.classList.remove('active'));
        b.classList.add('active');
      };
      sub.appendChild(b);
    });
  }
}

function renderThumbnails() {
  const grid = document.getElementById('thumb-grid');
  grid.innerHTML = '';
  state.photos.forEach((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-wrap' + (state.selectedIndices.includes(i) ? ' selected' : '');
    const img = new Image();
    img.src = p.toDataURL();
    wrap.appendChild(img);
    wrap.onclick = () => {
      const idx = state.selectedIndices.indexOf(i);
      if (idx > -1) state.selectedIndices.splice(idx, 1);
      else if (state.selectedIndices.length < state.targetCount) state.selectedIndices.push(i);
      renderThumbnails();
    };
    grid.appendChild(wrap);
  });
  document.getElementById('btn-confirm').disabled = state.selectedIndices.length !== state.targetCount;
}

// ──────────────────────────────────────────────
// Editor Entry & Canvas Setup
// ──────────────────────────────────────────────

function goToEditor() {
  switchView('view-edit');

  const num = state.targetCount;
  const mode = state.layoutSubMode;

  canvas.width = 854;
  canvas.height = 480;

  if (mode === 'vert' || mode === 'strip') {
    canvas.height = num * 240;
  }

  drawLayer.width = canvas.width;
  drawLayer.height = canvas.height;

  state.objects = [];
  state.activeObj = null;
  state.isDrawing = false;

  const sel = state.selectedIndices.map(i => state.photos[i]);
  const g = CONFIG.gap;
  const W = canvas.width, H = canvas.height;

  if (num === 1) {
    const scale = Math.min((W - 2*g) / sel[0].width, (H - 2*g) / sel[0].height);
    state.objects.push({ type: 'image', img: sel[0], x: W/2, y: H/2, scale, rot: 0 });
  }
  else if (num === 2) {
    const pw = (W - 2*g) / (mode === 'horiz' ? 2 : 1);
    const ph = (H - 2*g) / (mode === 'horiz' ? 1 : 2);
    const scale = Math.min(pw / sel[0].width, ph / sel[0].height) * 0.95;
    if (mode === 'horiz') {
      state.objects.push({type:'image', img:sel[0], x:g+pw/2, y:H/2, scale, rot:0});
      state.objects.push({type:'image', img:sel[1], x:W-g-pw/2, y:H/2, scale, rot:0});
    } else {
      state.objects.push({type:'image', img:sel[0], x:W/2, y:g+ph/2, scale, rot:0});
      state.objects.push({type:'image', img:sel[1], x:W/2, y:H-g-ph/2, scale, rot:0});
    }
  }
  else if (num === 4 && mode === 'grid') {
    const pw = (W - 3*g)/2;
    const ph = (H - 3*g)/2;
    const scale = Math.min(pw / sel[0].width, ph / sel[0].height) * 0.95;
    state.objects.push({type:'image', img:sel[0], x:g+pw/2, y:g+ph/2, scale, rot:0});
    state.objects.push({type:'image', img:sel[1], x:W-g-pw/2, y:g+ph/2, scale, rot:0});
    state.objects.push({type:'image', img:sel[2], x:g+pw/2, y:H-g-ph/2, scale, rot:0});
    state.objects.push({type:'image', img:sel[3], x:W-g-pw/2, y:H-g-ph/2, scale, rot:0});
  }
  else if (num === 6) {
    const pw = (W - 3*g) / 3;
    const ph = (H - 3*g) / 2;
    const scale = Math.min(pw / sel[0].width, ph / sel[0].height) * 0.95;
    for (let i = 0; i < 6; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      state.objects.push({type:'image', img:sel[i], x:g + col*(pw+g) + pw/2, y:g + row*(ph+g) + ph/2, scale, rot:0});
    }
  }
  else if (num === 8) {
    const pw = (W - 3*g) / 4;
    const ph = (H - 3*g) / 2;
    const scale = Math.min(pw / sel[0].width, ph / sel[0].height) * 0.95;
    for (let i = 0; i < 8; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      state.objects.push({type:'image', img:sel[i], x:g + col*(pw+g) + pw/2, y:g + row*(ph+g) + ph/2, scale, rot:0});
    }
  }

  setZoom(1);
  renderCanvas();
  setupInteractions();
  saveHistory();
}

// ──────────────────────────────────────────────
// Core Editor Functions (Rendering, Drawing, History)
// ──────────────────────────────────────────────

function renderCanvas() {
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, W, H);

  if (state.bgImage && state.bgImage.complete) {
    const r = Math.max(W / state.bgImage.width, H / state.bgImage.height);
    ctx.drawImage(
      state.bgImage,
      (W - state.bgImage.width * r) / 2,
      (H - state.bgImage.height * r) / 2,
      state.bgImage.width * r,
      state.bgImage.height * r
    );
  }

  ctx.save();
  ctx.filter = getFilterString();

  state.objects.forEach(obj => {
    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.rotate((obj.rot || 0) * Math.PI / 180);

    if (obj.type === 'text') {
      ctx.font = `bold ${obj.fontSize || 60}px "${obj.fontFamily || 'Quicksand'}"`;
      ctx.fillStyle = obj.color || '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(obj.content || 'Text', 0, 0);
    } else if (obj.type === 'image' && obj.img) {
      const scale = obj.scale || 1;
      const w = obj.img.width * scale;
      const h = obj.img.height * scale;
      ctx.drawImage(obj.img, -w / 2, -h / 2, w, h);
    }

    ctx.restore();
  });

  ctx.restore();

  drawCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
  state.drawPaths.forEach(path => drawStroke(path, drawCtx));
  ctx.drawImage(drawLayer, 0, 0);

  if (state.activeObj) {
    drawActiveHandles(state.activeObj);
  }
}

function drawStroke(path, target = drawCtx) {
  target.save();
  target.strokeStyle = path.color;
  target.lineWidth = path.size;
  target.lineCap = 'round';
  target.lineJoin = 'round';

  if (path.type === 'eraser') {
    target.globalCompositeOperation = 'destination-out';
  }

  if (path.points.length > 1) {
    target.beginPath();
    target.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      target.lineTo(path.points[i].x, path.points[i].y);
    }
    target.stroke();
  }

  target.restore();
}

function drawActiveHandles(obj) {
  const scale = obj.scale || 1;
  const w = (obj.img?.width || 200) * scale;
  const h = (obj.img?.height || 100) * scale;

  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate((obj.rot || 0) * Math.PI / 180);

  ctx.strokeStyle = '#4a90e2';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(-w/2 - 10, -h/2 - 10, w + 20, h + 20);
  ctx.setLineDash([]);

  // Draw resize handle (bottom-right corner)
  const hx = w/2 + 10;
  const hy = h/2 + 10;
  ctx.beginPath();
  ctx.arc(hx, hy, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = '#4a90e2';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

// ──────────────────────────────────────────────
// History (Undo/Redo)
// ──────────────────────────────────────────────

function saveHistory() {
  state.historyStep++;
  state.history = state.history.slice(0, state.historyStep);

  const entry = {
    drawPaths: JSON.parse(JSON.stringify(state.drawPaths)),
    bgColor: state.bgColor,
    bgImageDataURL: state.bgImage ? state.bgImage.toDataURL('image/png') : null,
    objects: state.objects.map(obj => ({
      ...obj,
      imgDataURL: obj.type === 'image' && obj.img ? obj.img.toDataURL('image/png') : null
    }))
  };

  state.history.push(entry);
  if (state.history.length > MAX_HISTORY) state.history.shift();
}

async function applyHistory() {
  const h = state.history[state.historyStep];
  if (!h) return;

  state.drawPaths = JSON.parse(JSON.stringify(h.drawPaths));
  state.bgColor = h.bgColor;

  let promises = [];

  if (h.bgImageDataURL) {
    const img = new Image();
    img.src = h.bgImageDataURL;
    promises.push(new Promise(r => img.onload = r));
    state.bgImage = img;
  } else {
    state.bgImage = null;
  }

  state.objects = h.objects.map(obj => {
    if (obj.imgDataURL) {
      const img = new Image();
      img.src = obj.imgDataURL;
      promises.push(new Promise(r => img.onload = r));
      obj.img = img;
    }
    return obj;
  });

  state.activeObj = null;
  renderCanvas();

  if (promises.length) await Promise.all(promises);
  renderCanvas();
}

function undo() {
  if (state.historyStep > 0) {
    state.historyStep--;
    applyHistory();
  }
}

function redo() {
  if (state.historyStep < state.history.length - 1) {
    state.historyStep++;
    applyHistory();
  }
}

// ──────────────────────────────────────────────
// Pointer Interactions (Move, Draw, Resize)
// ──────────────────────────────────────────────

let activePointer = null;
let activePointerId = null;

function setupInteractions() {
  canvas.style.touchAction = 'none';

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();

    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;

    if (state.isDrawing) {
      const path = { type: state.brushType, color: state.drawColor, size: state.brushSize, points: [{x, y}] };
      state.drawPaths.push(path);
      activePointer = { mode: 'draw', id: e.pointerId, path };
      if (state.brushType === 'line') state.lineStart = {x, y};
      return;
    }

    // Check for resize handle first
    if (state.activeObj && state.activeObj.type === 'image') {
      const obj = state.activeObj;
      const scale = obj.scale || 1;
      const w = obj.img.width * scale;
      const h = obj.img.height * scale;
      const cos = Math.cos((obj.rot || 0) * Math.PI / 180);
      const sin = Math.sin((obj.rot || 0) * Math.PI / 180);
      
      const hx = w/2 + 10;
      const hy = h/2 + 10;
      const handleX = obj.x + (hx * cos - hy * sin);
      const handleY = obj.y + (hx * sin + hy * cos);
      
      if (Math.abs(x - handleX) < 15 && Math.abs(y - handleY) < 15) {
        activePointer = { mode: 'resize', id: e.pointerId, obj, startX: x, startY: y, startScale: scale };
        return;
      }
    }

    // Check for object hit (move mode)
    let hit = null;
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const obj = state.objects[i];
      
      const bounds = getObjectBounds(obj);
      const dx = x - obj.x;
      const dy = y - obj.y;
      const cos = Math.cos((obj.rot || 0) * Math.PI / 180);
      const sin = Math.sin((obj.rot || 0) * Math.PI / 180);
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      if (Math.abs(lx) < bounds.w/2 && Math.abs(ly) < bounds.h/2) {
        hit = obj;
        break;
      }
    }

    if (hit) {
      state.activeObj = hit;
      activePointer = { mode: 'move', id: e.pointerId, obj: hit, offsetX: x - hit.x, offsetY: y - hit.y };
    } else {
      state.activeObj = null;
    }

    renderCanvas();
  });

  document.addEventListener('pointermove', e => {
    if (!activePointer || e.pointerId !== activePointer.id) return;
    e.preventDefault();

    const { x, y } = clientToCanvas(e.clientX, e.clientY);

    if (activePointer.mode === 'draw') {
      if (state.brushType !== 'line') {
        activePointer.path.points.push({x, y});
      }
      renderCanvas();
      return;
    }

    if (activePointer.mode === 'resize') {
      const obj = activePointer.obj;
      const dx = x - activePointer.startX;
      const dy = y - activePointer.startY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const newScale = Math.max(0.1, activePointer.startScale + dist * 0.005);
      obj.scale = newScale;
      renderCanvas();
      return;
    }

    if (activePointer.mode === 'move') {
      const obj = activePointer.obj;
      obj.x = x - activePointer.offsetX;
      obj.y = y - activePointer.offsetY;
      renderCanvas();
    }
  });

  document.addEventListener('pointerup', e => {
    if (!activePointer || e.pointerId !== activePointer.id) return;
    canvas.releasePointerCapture(e.pointerId);

    if (state.isDrawing && state.brushType === 'line' && state.lineStart) {
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      activePointer.path.points.push({x, y});
      state.lineStart = null;
    }

    activePointer = null;
    activePointerId = null;
    saveHistory();
  });
}

function clientToCanvas(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (cx - rect.left) * scaleX,
    y: (cy - rect.top) * scaleY
  };
}

function getObjectBounds(obj) {
  if (obj.type === 'text') {
    ctx.font = `bold ${obj.fontSize || 60}px "${obj.fontFamily || 'Quicksand'}"`;
    const metrics = ctx.measureText(obj.content || 'Text');
    return { w: metrics.width + 40, h: obj.fontSize * 1.5 };
  }
  if (obj.type === 'image' && obj.img) {
    const s = obj.scale || 1;
    return { w: obj.img.width * s, h: obj.img.height * s };
  }
  return { w: 200, h: 200 };
}

// ──────────────────────────────────────────────
// Tools & Actions
// ──────────────────────────────────────────────

let lastDrawButton = null;

function setBrush(type) {
  // If clicking the same brush button twice, toggle drawing off
  if (lastDrawButton === type && state.isDrawing) {
    state.isDrawing = false;
    lastDrawButton = null;
    closeMenus();
  } else {
    state.brushType = type;
    state.isDrawing = true;
    lastDrawButton = type;
  }
  renderCanvas();
}

function toggleDrawMode() {
  state.isDrawing = !state.isDrawing;
  if (!state.isDrawing) {
    closeMenus();
  }
  renderCanvas();
}

function updateBrushSize(val) {
  state.brushSize = parseInt(val, 10);
}

function addText() {
  state.isDrawing = false;
  lastDrawButton = null;
  closeMenus();
  const obj = {
    type: 'text',
    content: 'New Text',
    fontFamily: 'Quicksand',
    fontSize: 60,
    color: '#000000',
    x: canvas.width / 2,
    y: canvas.height / 2,
    rot: 0
  };
  state.objects.push(obj);
  state.activeObj = obj;
  
  const textMenu = document.getElementById('text-menu');
  if (textMenu) {
    textMenu.classList.add('active');
    const textInput = document.getElementById('text-edit');
    if (textInput) textInput.value = obj.content;
  }
  
  saveHistory();
  renderCanvas();
}

function updateActiveText(text) {
  if (state.activeObj && state.activeObj.type === 'text') {
    state.activeObj.content = text;
    renderCanvas();
  }
}

function updateActiveFont(font) {
  if (state.activeObj && state.activeObj.type === 'text') {
    state.activeObj.fontFamily = font;
    renderCanvas();
  }
}

function updateActiveColor(color) {
  if (state.activeObj && state.activeObj.type === 'text') {
    state.activeObj.color = color;
    renderCanvas();
  }
}

function deleteActiveObject() {
  if (state.activeObj) {
    const idx = state.objects.indexOf(state.activeObj);
    if (idx > -1) {
      state.objects.splice(idx, 1);
      state.activeObj = null;
      saveHistory();
      renderCanvas();
    }
  }
}

function addMedia(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      state.objects.push({
        type: 'image',
        img,
        x: canvas.width / 2,
        y: canvas.height / 2,
        scale: 1,
        rot: 0
      });
      saveHistory();
      renderCanvas();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function addBgImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      state.bgImage = img;
      renderCanvas();
      saveHistory();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function setFilter(type) {
  state.filterType = type;
  closeMenus();
  renderCanvas();
}

function setFilterIntensity(val) {
  state.filterIntensity = parseFloat(val);
  renderCanvas();
}

function getFilterString() {
  const i = state.filterIntensity;
  const filterMap = {
    none:     '',
    bw:       `grayscale(1) contrast(${1 + 0.2 * i})`,
    vintage:  `sepia(${0.6 * i}) saturate(${0.8 * i}) brightness(${1 + 0.1 * i})`,
    retro:    `sepia(${0.4 * i}) contrast(${1.1}) brightness(${0.95})`,
    cool:     `hue-rotate(180deg) saturate(${1.2 * i}) brightness(${1 + 0.05 * i})`,
    warm:     `sepia(${0.3 * i}) saturate(${1.1 * i}) brightness(${1 + 0.1 * i})`,
    peach:    `sepia(${0.35 * i}) saturate(${1.15}) brightness(${1.08})`,
    milk:     `brightness(${1.15 * i}) contrast(${0.9}) saturate(${0.85})`,
    film:     `contrast(${0.95}) brightness(${1.05}) sepia(${0.25 * i})`,
    bright:   `brightness(${1.3 * i}) contrast(${1.1})`,
    sepia:    `sepia(${i})`,
    invert:   `invert(${i})`,
    saturate: `saturate(${1 + i * 2})`
  };
  return filterMap[state.filterType] || '';
}

function openMenu(menuId) {
  closeMenus();
  const menu = document.getElementById(menuId);
  if (menu) menu.classList.add('active');
}

function closeMenus() {
  document.querySelectorAll('.context-bar').forEach(m => m.classList.remove('active'));
}

function download() {
  const link = document.createElement('a');
  const now = new Date();
  link.download = `twopus-photobooth-picture_${now.toISOString().split('T')[0]}_${now.toTimeString().slice(0,8).replace(/:/g,'')}`;;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ──────────────────────────────────────────────
// View Switching & Init
// ──────────────────────────────────────────────

function switchView(id) {
  closeMenus();
  state.isDrawing = false;
  lastDrawButton = null;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(id);
  if (view) view.classList.add('active');
}

function setZoom(val) {
  state.zoom = parseFloat(val);
  canvas.style.transform = `scale(${state.zoom})`;
  canvas.style.transformOrigin = '0 0';
}

// Start the app
// startCamera();