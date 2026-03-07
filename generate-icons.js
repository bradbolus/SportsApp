#!/usr/bin/env node
/**
 * generate-icons.js
 * Run with: node generate-icons.js
 * Requires: npm install canvas  (or uses sharp if available)
 *
 * Creates placeholder PNG icons for the PWA.
 * Replace /public/icons/icon-*.png with your real icons later.
 */

const fs = require('fs');
const path = require('path');

// SVG icon template — a simple "M" on deep blue
function makeSVG(size) {
  const fontSize = Math.round(size * 0.5);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size*0.18)}" fill="#04060f"/>
  <rect width="${size}" height="${size}" rx="${Math.round(size*0.18)}" fill="url(#g)"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0a1e3a"/>
      <stop offset="100%" stop-color="#04060f"/>
    </linearGradient>
  </defs>
  <text x="50%" y="54%" font-family="Georgia, serif" font-size="${fontSize}" font-weight="bold"
    fill="#48b4e8" text-anchor="middle" dominant-baseline="middle">M</text>
  <text x="50%" y="82%" font-family="monospace" font-size="${Math.round(size*0.1)}"
    fill="#2a7aad" text-anchor="middle" letter-spacing="2">DAY</text>
</svg>`;
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// Write SVG versions (browsers can use SVG icons too)
sizes.forEach(size => {
  const svgPath = path.join(iconsDir, `icon-${size}.svg`);
  fs.writeFileSync(svgPath, makeSVG(size));
  console.log(`✓ Generated icon-${size}.svg`);
});

console.log('\nSVG icons generated in public/icons/');
console.log('To generate PNGs, run: npm install canvas && node generate-icons-png.js');
console.log('Or replace the SVG files with your own PNG icons.');
