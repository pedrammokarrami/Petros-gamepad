import * as THREE from 'three';

/**
 * Generates a tileable brushed-metal bump / roughness micro-texture.
 */
export function createBrushedMetalTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y++) {
    const shade = 112 + Math.floor((Math.sin(y * 0.73) * 0.5 + 0.5) * 32);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, size, 1);
  }
  for (let i = 0; i < 600; i++) {
    const x = (i * 47) % size;
    const y = (i * 89) % size;
    const w = 18 + (i % 54);
    const v = i % 2 === 0 ? 156 : 96;
    ctx.fillStyle = `rgba(${v},${v},${v},0.22)`;
    ctx.fillRect(x, y, w, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a soft radial contact shadow disc texture.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.06,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a subtle radial-faded studio floor grid texture inspired by Astro Bot's controller showcase.
 */
export function createStudioFloorGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const step = 32;
  // Fine grid lines calibrated for satin silver studio backdrop
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= size; i += step) {
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, size);
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(size, i + 0.5);
  }
  ctx.stroke();

  // Major studio calibration lines every 4 cells
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.24)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= size; i += step * 4) {
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, size);
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(size, i + 0.5);
  }
  ctx.stroke();

  // Concentric calibration arcs around stage center
  const cx = size / 2;
  const cy = size / 2;
  ctx.strokeStyle = 'rgba(148, 178, 224, 0.2)';
  ctx.lineWidth = 1.25;
  for (const r of [145, 240, 340, 440]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial vignette mask so grid dissolves cleanly into dark studio void
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(cx, cy, size * 0.08, cx, cy, size * 0.49);
  mask.addColorStop(0, 'rgba(255,255,255,0.95)');
  mask.addColorStop(0.55, 'rgba(255,255,255,0.5)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates crisp PlayStation symbol textures (Cross, Circle, Square, Triangle) or Xbox ABXY legends.
 */
export function createButtonSymbolTexture(
  symbol: 'cross' | 'circle' | 'square' | 'triangle' | 'A' | 'B' | 'X' | 'Y' | 'PS' | 'XBOX',
  bgHex: string,
  fgHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  ctx.strokeStyle = fgHex;
  ctx.fillStyle = fgHex;
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (symbol === 'cross') {
    const r = 46;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r);
    ctx.lineTo(cx - r, cy + r);
    ctx.stroke();
  } else if (symbol === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, 50, 0, Math.PI * 2);
    ctx.stroke();
  } else if (symbol === 'square') {
    const s = 86;
    ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
  } else if (symbol === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 52);
    ctx.lineTo(cx + 52, cy + 40);
    ctx.lineTo(cx - 52, cy + 40);
    ctx.closePath();
    ctx.stroke();
  } else if (symbol === 'XBOX') {
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, 74, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 38, cy - 38);
    ctx.quadraticCurveTo(cx, cy - 4, cx + 38, cy + 44);
    ctx.moveTo(cx + 38, cy - 38);
    ctx.quadraticCurveTo(cx, cy - 4, cx - 38, cy + 44);
    ctx.stroke();
  } else if (symbol === 'PS') {
    ctx.font = '700 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PS', cx, cy + 4);
  } else {
    ctx.font = '700 118px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, cx, cy + 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates crisp mechanical keycap top-surface legend texture with aspect-ratio awareness
 * so wide keys (SPACE, SHIFT, ENTER) never stretch horizontally.
 */
export function createKeycapLegendTexture(
  legend: string,
  bgHex: string,
  fgHex: string,
  maxAnisotropy: number,
  widthUnits = 1,
): THREE.CanvasTexture {
  const height = 128;
  const width = Math.max(128, Math.round(height * widthUnits));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, width, height);

  // Subtle top-surface concave keycap dish shading
  const sheen = ctx.createLinearGradient(0, 0, 0, height);
  sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
  sheen.addColorStop(0.5, 'rgba(0,0,0,0.04)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  // Subtle crisp top-edge chamfer highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, width - 8, height - 8);

  if (legend === 'SPACE') {
    // Minimalist machined stabilizer accent line for the Spacebar
    ctx.fillStyle = fgHex;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(width * 0.34, height * 0.48, width * 0.32, 5);
    ctx.globalAlpha = 1;
  } else if (legend) {
    ctx.fillStyle = fgHex;
    const fontSize = legend.length > 3 ? 30 : legend.length > 1 ? 34 : 46;
    ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(legend, width / 2, height / 2 + 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates the sleek iPad Pro dark tactical touch-gaming display glass texture.
 */
export function createIpadScreenTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const width = 1024;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Deep OLED obsidian gradient with subtle atmospheric slate glow
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0d1322');
  bg.addColorStop(0.5, '#090d16');
  bg.addColorStop(1, '#101828');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle tactical precision grid
  ctx.strokeStyle = 'rgba(148, 184, 232, 0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Left virtual joystick ring indicator
  const joyX = width * 0.22;
  const joyY = height * 0.68;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.26)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(joyX, joyY, 76, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.beginPath();
  ctx.arc(joyX, joyY, 26, 0, Math.PI * 2);
  ctx.fill();

  // Right aim/fire/jump subtle HUD rings
  const zones = [
    { x: 0.72, y: 0.36, r: 44, color: 'rgba(167, 139, 250, 0.26)' },
    { x: 0.82, y: 0.66, r: 58, color: 'rgba(251, 146, 60, 0.3)' },
    { x: 0.86, y: 0.44, r: 34, color: 'rgba(52, 211, 153, 0.24)' },
    { x: 0.5, y: 0.76, r: 42, color: 'rgba(34, 211, 238, 0.28)' },
  ];
  for (const z of zones) {
    ctx.strokeStyle = z.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(width * z.x, height * z.y, z.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width * z.x, height * z.y, z.r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = z.color;
    ctx.fill();
  }

  // Center subtle optical crosshair
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1.6;
  const cx = width / 2;
  const cy = height * 0.44;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy);
  ctx.lineTo(cx - 6, cy);
  ctx.moveTo(cx + 6, cy);
  ctx.lineTo(cx + 18, cy);
  ctx.moveTo(cx, cy - 18);
  ctx.lineTo(cx, cy - 6);
  ctx.moveTo(cx, cy + 6);
  ctx.lineTo(cx, cy + 18);
  ctx.stroke();

  // Diagonal studio glass softbox reflection sheen
  const glare = ctx.createLinearGradient(0, 0, width * 0.7, height * 0.6);
  glare.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  glare.addColorStop(0.32, 'rgba(255, 255, 255, 0.02)');
  glare.addColorStop(0.35, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}
