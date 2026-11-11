#!/usr/bin/env node
/**
 * Genera el icono monocromo de notificaciones de Android: una esfera del
 * dragón blanca con 4 estrellas transparentes.
 *
 * Android usa el canal alfa del icono como máscara, por eso el icono debe ser
 * blanco sobre fondo transparente. Las estrellas se recortan (alfa 0) para
 * que se vean como huecos.
 *
 * Uso:
 *   node scripts/generate-notification-icon.js
 *   node scripts/generate-notification-icon.js --preview /tmp/redup-icon-preview.png
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SIZE = 192;
const SCALE = 4;
const HI = SIZE * SCALE;

const BALL_RADIUS = 86;
const STAR_OUTER = 17;
const STAR_INNER = 7.5;
const STARS = [
  [96, 59],
  [63, 96],
  [129, 96],
  [96, 133],
];

function starPolygon(cx, cy, outerR, innerR, points = 5) {
  const vertices = [];
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outerR : innerR;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    vertices.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return vertices;
}

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function render({ preview }) {
  const polygons = STARS.map(([cx, cy]) =>
    starPolygon(cx * SCALE, cy * SCALE, STAR_OUTER * SCALE, STAR_INNER * SCALE),
  );

  // Fondo blanco con alfa 0: evita halos oscuros al interpolar los bordes.
  const high = Buffer.alloc(HI * HI * 4);
  for (let i = 0; i < high.length; i += 4) {
    high[i] = 255;
    high[i + 1] = 255;
    high[i + 2] = 255;
    high[i + 3] = 0;
  }
  const ballFill = preview ? [245, 166, 35, 255] : [255, 255, 255, 255];
  const starFill = preview ? [208, 2, 27, 255] : [255, 255, 255, 0];
  const center = (SIZE / 2) * SCALE;
  const radius = BALL_RADIUS * SCALE;

  for (let y = 0; y < HI; y += 1) {
    for (let x = 0; x < HI; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const index = (y * HI + x) * 4;
      const dx = px - center;
      const dy = py - center;
      const insideBall = dx * dx + dy * dy <= radius * radius;
      const insideStar = insideBall && polygons.some((p) => insidePolygon(px, py, p));

      if (insideBall) {
        const color = insideStar ? starFill : ballFill;
        high[index] = color[0];
        high[index + 1] = color[1];
        high[index + 2] = color[2];
        high[index + 3] = color[3];
      }
    }
  }

  const png = new PNG({ width: SIZE, height: SIZE });
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SCALE; sy += 1) {
        for (let sx = 0; sx < SCALE; sx += 1) {
          const i = ((y * SCALE + sy) * HI + (x * SCALE + sx)) * 4;
          r += high[i];
          g += high[i + 1];
          b += high[i + 2];
          a += high[i + 3];
        }
      }
      const samples = SCALE * SCALE;
      const o = (y * SIZE + x) * 4;
      png.data[o] = Math.round(r / samples);
      png.data[o + 1] = Math.round(g / samples);
      png.data[o + 2] = Math.round(b / samples);
      png.data[o + 3] = Math.round(a / samples);
    }
  }

  return PNG.sync.write(png);
}

const previewIndex = process.argv.indexOf('--preview');
const preview = previewIndex !== -1;
const outPath = preview
  ? process.argv[previewIndex + 1]
  : path.join(__dirname, '..', 'assets', 'images', 'notification-icon.png');

if (!outPath) {
  console.error('Falta la ruta de salida para --preview');
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, render({ preview }));
console.log(`${preview ? 'Preview' : 'Notification icon'} -> ${outPath}`);
