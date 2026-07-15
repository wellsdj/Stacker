// ============================================================================
// Leaderboard tower viewer — a separate Three.js scene from the city picker
// (City3D). Reconstructs a submitted run's exact block sequence on an empty
// platform with an atmospheric sky, orbitable with the mouse. Exposes
// window.LeaderboardViewer3D.open(runId).
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const canvas = document.getElementById('viewer3d');
const loadEl = document.getElementById('viewerLoad');
const closeBtn = document.getElementById('viewerClose');

const BH = 56; // matches the 2D game's floor height unit (index.html)

// same red/purple-to-blue-night palette as the 2D game's SKY, so the viewer's
// atmosphere matches the world the tower was built in
const SKY = [
  [0, '#d6472f'], [55, '#b23a5c'], [130, '#7c3d86'], [240, '#4a3c81'],
  [400, '#2e3767'], [640, '#212a50'], [1000, '#1a2346'],
];
function hexRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function rgbHex(r, g, b) { const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); }
function lerpHex(h1, h2, t) { const a = hexRgb(h1), b = hexRgb(h2); return rgbHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); }
function skyColorAt(m) {
  m = Math.max(0, m);
  for (let i = 0; i < SKY.length - 1; i++) {
    if (m <= SKY[i + 1][0]) { const t = (m - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]); return lerpHex(SKY[i][1], SKY[i + 1][1], t); }
  }
  return SKY[SKY.length - 1][1];
}
function skyTexture() {
  const c = document.createElement('canvas'); c.width = 2; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  for (let k = 0; k <= 8; k++) grad.addColorStop(k / 8, skyColorAt(1000 * (1 - k / 8)));
  g.fillStyle = grad; g.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let renderer, scene, camera, controls, rafId = 0, active = false, ready = false;
let towerGroup = null;

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(6000, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 20000);

  scene.add(new THREE.HemisphereLight(0xdfefff, 0x2a2440, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(120, 220, 90);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x404860, 0.55));

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(900, 900, 16, 48),
    new THREE.MeshStandardMaterial({ color: 0x2c2740, roughness: 0.95 })
  );
  platform.position.y = -8;
  scene.add(platform);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;

  window.addEventListener('resize', onResize);
  closeBtn.addEventListener('click', close);
  ready = true;
}

function onResize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// isometric-style per-face shading from a single "top" color, echoing the
// 2D game's box shading (drawBox: lighter top, darker right/left faces)
function facesFromTop(topHex) {
  const top = new THREE.Color(topHex);
  const right = top.clone().multiplyScalar(0.62);
  const left = top.clone().multiplyScalar(0.48);
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  return [mat(right), mat(left), mat(top), mat(left), mat(right), mat(left)];
}
function colorForBlock(skin, i) {
  if (skin.mythic) return `hsl(${(i * 16 + (skin.hueOffset || 0)) % 360}, 78%, 62%)`;
  return skin.top || '#a9d3e0';
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isMesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }
  });
}

function buildTower(run) {
  if (towerGroup) { scene.remove(towerGroup); disposeGroup(towerGroup); towerGroup = null; }
  towerGroup = new THREE.Group();
  const skin = run.skin || { mythic: false, top: '#a9d3e0' };
  let y = 0;
  (run.blocks || []).forEach((b, i) => {
    const h = b.h || BH, w = Math.max(1, b.x1 - b.x0), d = Math.max(1, b.z1 - b.z0);
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, facesFromTop(colorForBlock(skin, i)));
    mesh.position.set((b.x0 + b.x1) / 2, y + h / 2, (b.z0 + b.z1) / 2);
    towerGroup.add(mesh);
    y += h;
  });
  scene.add(towerGroup);
  frameTower();
}

// auto-frame the camera on the full tower's bounding box (mirrors City3D's frameModel)
function frameTower() {
  const box = new THREE.Box3().setFromObject(towerGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 100;
  controls.target.copy(center);
  camera.near = maxDim / 500; camera.far = maxDim * 50; camera.updateProjectionMatrix();
  camera.position.set(center.x + maxDim * 0.9, center.y + maxDim * 0.35, center.z + maxDim * 0.9);
  controls.minDistance = maxDim * 0.15; controls.maxDistance = maxDim * 4;
  controls.update();
}

function renderLoop() {
  if (!active) return;
  rafId = requestAnimationFrame(renderLoop);
  controls.update();
  renderer.render(scene, camera);
}

function close() {
  active = false;
  cancelAnimationFrame(rafId);
  canvas.classList.remove('on'); closeBtn.classList.remove('on'); loadEl.classList.remove('on');
  if (window.Leaderboard) window.Leaderboard.openStatsModal();
}

window.LeaderboardViewer3D = {
  async open(runId) {
    if (!ready) init();
    loadEl.classList.add('on');
    canvas.classList.remove('on'); closeBtn.classList.remove('on');
    if (window.Leaderboard) window.Leaderboard.closeStatsModal();
    try {
      const res = await fetch('/api/runs/' + encodeURIComponent(runId));
      if (!res.ok) throw new Error('run not found');
      const run = await res.json();
      buildTower(run);
      active = true;
      canvas.classList.add('on'); closeBtn.classList.add('on');
      onResize();
      cancelAnimationFrame(rafId); renderLoop();
    } catch (e) {
      console.error('[LeaderboardViewer3D] failed to load run', runId, e);
      if (window.Leaderboard) window.Leaderboard.openStatsModal();
    } finally {
      loadEl.classList.remove('on');
    }
  },
  close,
};
