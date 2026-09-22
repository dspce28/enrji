// Procedural t-shirt renderer shared by the browser (catalog, 3D tour, try-on)
// and the server (seed data validation). Every product image is generated from
// { color, design } so there are no image assets to manage.

export const SHIRT_COLORS = {
  'void-black':    { label: 'Void Black',    hex: '#0d0e14' },
  'graphite':      { label: 'Graphite',      hex: '#2b2f38' },
  'arctic-white':  { label: 'Arctic White',  hex: '#e9edf2' },
  'midnight-navy': { label: 'Midnight Navy', hex: '#151c3b' },
  'plasma-purple': { label: 'Plasma Purple', hex: '#3a1d5e' },
  'ion-teal':      { label: 'Ion Teal',      hex: '#0e4a4c' },
  'solar-red':     { label: 'Solar Red',     hex: '#6a1122' },
};

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export const DESIGN_TYPES = [
  'bolt', 'horizon', 'circuit', 'glitch', 'hex', 'orbit',
  'wave', 'cube', 'triangle', 'matrix', 'helix', 'eye',
];

const SHIRT_PATH =
  'M150 38 Q200 82 250 38 L322 58 Q362 74 396 140 L348 174 L312 150 L314 420 ' +
  'Q200 434 86 420 L88 150 L52 174 L4 140 Q38 74 78 58 Z';

let uidCounter = 0;

function rng(seedText) {
  let h = 2166136261;
  for (const c of String(seedText)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

// Each design draws inside a 150 x 170 print box.
const DESIGNS = {
  bolt: ({ a1, a2, id }) => `
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a1}"/><stop offset="1" stop-color="${a2}"/></linearGradient></defs>
    <circle cx="75" cy="80" r="62" fill="none" stroke="${a2}" stroke-width="2" opacity=".5"/>
    <circle cx="75" cy="80" r="70" fill="none" stroke="${a1}" stroke-width="1" stroke-dasharray="4 6" opacity=".7"/>
    <path d="M88 10 L40 92 L72 92 L58 152 L112 64 L80 64 Z" fill="url(#g${id})" filter="url(#glow${id})"/>`,

  horizon: ({ a1, a2, id }) => {
    let stripes = '';
    for (let i = 0; i < 5; i++) stripes += `<rect x="10" y="${70 + i * 9}" width="130" height="${2 + i}" fill="var(--bg)"/>`;
    let grid = '';
    for (let i = 0; i <= 10; i++) grid += `<line x1="${75 + (i - 5) * 6}" y1="112" x2="${75 + (i - 5) * 28}" y2="168" stroke="${a2}" stroke-width="1"/>`;
    [116, 124, 136, 152, 168].forEach((y) => (grid += `<line x1="0" y1="${y}" x2="150" y2="${y}" stroke="${a2}" stroke-width="1"/>`));
    return `
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${a1}"/><stop offset="1" stop-color="${a2}"/></linearGradient>
      <clipPath id="c${id}"><circle cx="75" cy="72" r="46"/></clipPath></defs>
    <g clip-path="url(#c${id})"><rect x="20" y="20" width="110" height="100" fill="url(#g${id})"/>${stripes}</g>
    <g opacity=".85">${grid}</g>
    <line x1="0" y1="112" x2="150" y2="112" stroke="${a1}" stroke-width="2" filter="url(#glow${id})"/>`;
  },

  circuit: ({ a1, a2, seed, id }) => {
    const r = rng(seed);
    let out = '';
    for (let i = 0; i < 14; i++) {
      let x = 10 + Math.floor(r() * 13) * 10, y = 10 + Math.floor(r() * 15) * 10;
      let d = `M${x} ${y}`;
      for (let s = 0; s < 3; s++) {
        const horiz = r() > 0.5, len = (Math.floor(r() * 4) + 1) * 10 * (r() > 0.5 ? 1 : -1);
        if (horiz) x = Math.max(5, Math.min(145, x + len)); else y = Math.max(5, Math.min(165, y + len));
        d += ` L${x} ${y}`;
      }
      const c = i % 3 ? a1 : a2;
      out += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="3.5" fill="var(--bg)" stroke="${c}" stroke-width="2"/>`;
    }
    return `<g filter="url(#glow${id})">${out}</g><rect x="50" y="62" width="50" height="46" rx="4" fill="var(--bg)" stroke="${a1}" stroke-width="2.5"/>
      <text x="75" y="91" text-anchor="middle" font-family="monospace" font-weight="700" font-size="14" fill="${a1}">CPU</text>`;
  },

  glitch: ({ a1, a2, text }) => {
    const t = esc(text || 'ENRJI');
    const fs = Math.min(40, Math.floor(240 / Math.max(3, t.length)));
    const line = (dx, fill, op) => `<text x="${75 + dx}" y="92" text-anchor="middle" font-family="'Orbitron',monospace" font-weight="900" font-size="${fs}" fill="${fill}" opacity="${op}">${t}</text>`;
    return `${line(-3, a1, 0.9)}${line(3, a2, 0.9)}${line(0, 'var(--fg)', 1)}
      <rect x="0" y="78" width="150" height="3" fill="var(--bg)"/><rect x="0" y="86" width="150" height="2" fill="var(--bg)"/>
      <rect x="18" y="104" width="114" height="2" fill="${a1}"/><rect x="30" y="112" width="90" height="1" fill="${a2}"/>
      <text x="75" y="130" text-anchor="middle" font-family="monospace" font-size="8" letter-spacing="3" fill="${a1}">SIGNAL//LOST</text>`;
  },

  hex: ({ a1, a2 }) => {
    let out = '';
    const hex = (cx, cy, s) => Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    const cells = [[75, 85], [75, 55], [75, 115], [49, 70], [101, 70], [49, 100], [101, 100], [23, 85], [127, 85], [49, 40], [101, 130]];
    cells.forEach(([x, y], i) => {
      out += `<polygon points="${hex(x, y, 16)}" fill="${i === 0 ? a1 : 'none'}" fill-opacity="${i === 0 ? 0.9 : 0}" stroke="${i % 2 ? a2 : a1}" stroke-width="2"/>`;
    });
    return out;
  },

  orbit: ({ a1, a2, id }) => `
    <defs><radialGradient id="g${id}" cx=".35" cy=".35"><stop offset="0" stop-color="${a2}"/><stop offset="1" stop-color="${a1}"/></radialGradient></defs>
    <ellipse cx="75" cy="85" rx="70" ry="20" fill="none" stroke="${a2}" stroke-width="2" transform="rotate(-18 75 85)" opacity=".6"/>
    <circle cx="75" cy="85" r="36" fill="url(#g${id})"/>
    <path d="M5 85 A70 20 0 0 0 145 85" fill="none" stroke="${a1}" stroke-width="3" transform="rotate(-18 75 85)" filter="url(#glow${id})"/>
    <circle cx="20" cy="30" r="3" fill="${a1}"/><circle cx="130" cy="140" r="4" fill="${a2}"/><circle cx="128" cy="24" r="2" fill="var(--fg)"/>`,

  wave: ({ a1, a2 }) => {
    let out = '';
    for (let i = 0; i < 9; i++) {
      let d = '';
      for (let x = 0; x <= 150; x += 5) {
        const y = 30 + i * 14 + Math.sin(x / 14 + i * 0.7) * (6 + i * 1.2) * Math.sin((x / 150) * Math.PI);
        d += `${x ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
      }
      out += `<path d="${d}" fill="none" stroke="${i % 2 ? a2 : a1}" stroke-width="${i === 4 ? 3 : 1.6}"/>`;
    }
    return out;
  },

  cube: ({ a1, a2, id }) => `
    <g fill="none" stroke-linejoin="round" filter="url(#glow${id})">
      <polygon points="75,20 130,50 130,112 75,142 20,112 20,50" stroke="${a1}" stroke-width="3"/>
      <polyline points="20,50 75,80 130,50" stroke="${a1}" stroke-width="3"/><line x1="75" y1="80" x2="75" y2="142" stroke="${a1}" stroke-width="3"/>
      <polygon points="75,48 102,63 102,95 75,110 48,95 48,63" stroke="${a2}" stroke-width="2"/>
      <polyline points="48,63 75,78 102,63" stroke="${a2}" stroke-width="2"/><line x1="75" y1="78" x2="75" y2="110" stroke="${a2}" stroke-width="2"/>
    </g>`,

  triangle: ({ a1, a2, id }) => {
    let out = '';
    for (let i = 0; i < 6; i++) {
      const s = 70 - i * 11, cy = 90;
      out += `<polygon points="75,${cy - s} ${75 + s * 0.87},${cy + s / 2} ${75 - s * 0.87},${cy + s / 2}" fill="none" stroke="${i % 2 ? a2 : a1}" stroke-width="${i === 0 ? 3 : 2}"/>`;
    }
    return `<g filter="url(#glow${id})">${out}</g><circle cx="75" cy="90" r="4" fill="var(--fg)"/>`;
  },

  matrix: ({ a1, a2, seed }) => {
    const r = rng(seed + 'm');
    const glyphs = '01アイウエオカキクケコサシスセソ<>/*+=#';
    let out = '';
    for (let c = 0; c < 10; c++) {
      const len = 4 + Math.floor(r() * 9), start = Math.floor(r() * 6);
      for (let k = 0; k < len; k++) {
        const ch = glyphs[Math.floor(r() * glyphs.length)];
        const op = (k + 1) / len;
        out += `<text x="${8 + c * 14.5}" y="${14 + (start + k) * 12}" font-family="monospace" font-size="11" fill="${k === len - 1 ? 'var(--fg)' : c % 3 ? a1 : a2}" opacity="${op.toFixed(2)}">${esc(ch)}</text>`;
      }
    }
    return out;
  },

  helix: ({ a1, a2 }) => {
    let out = '';
    for (let i = 0; i < 16; i++) {
      const y = 10 + i * 10, p = i / 2.4;
      const x1 = 75 + Math.sin(p) * 40, x2 = 75 - Math.sin(p) * 40;
      out += `<line x1="${x1.toFixed(1)}" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}" stroke="var(--fg)" stroke-opacity=".35" stroke-width="1.5"/>
        <circle cx="${x1.toFixed(1)}" cy="${y}" r="${(3.5 + Math.cos(p) * 1.5).toFixed(1)}" fill="${a1}"/>
        <circle cx="${x2.toFixed(1)}" cy="${y}" r="${(3.5 - Math.cos(p) * 1.5).toFixed(1)}" fill="${a2}"/>`;
    }
    return out;
  },

  eye: ({ a1, a2, id }) => `
    <defs><radialGradient id="g${id}"><stop offset="0" stop-color="${a2}"/><stop offset=".6" stop-color="${a1}"/><stop offset="1" stop-color="${a1}" stop-opacity="0"/></radialGradient></defs>
    <path d="M5 85 Q75 20 145 85 Q75 150 5 85 Z" fill="none" stroke="${a1}" stroke-width="3" filter="url(#glow${id})"/>
    <circle cx="75" cy="85" r="30" fill="url(#g${id})"/>
    <circle cx="75" cy="85" r="12" fill="var(--bg)"/><circle cx="80" cy="80" r="4" fill="var(--fg)"/>
    <g stroke="${a2}" stroke-width="1.5">${Array.from({ length: 12 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 12;
      return `<line x1="${(75 + Math.cos(a) * 20).toFixed(1)}" y1="${(85 + Math.sin(a) * 20).toFixed(1)}" x2="${(75 + Math.cos(a) * 28).toFixed(1)}" y2="${(85 + Math.sin(a) * 28).toFixed(1)}"/>`;
    }).join('')}</g>`,
};

/**
 * Render a t-shirt as an SVG string.
 * @param {object} opts
 * @param {string} opts.color  key of SHIRT_COLORS (or a hex)
 * @param {object} opts.design { type, accent, accent2, text }
 * @param {boolean} [opts.printOnly] render only the print (no garment)
 */
export function shirtSVG({ color = 'void-black', design = {}, printOnly = false } = {}) {
  const id = ++uidCounter;
  const hex = SHIRT_COLORS[color]?.hex || (/^#[0-9a-f]{6}$/i.test(color) ? color : '#0d0e14');
  const light = isLight(hex);
  const a1 = design.accent || '#00f0ff';
  const a2 = design.accent2 || '#ff2bd6';
  const fg = light ? '#0d0e14' : '#f4f7ff';
  const draw = DESIGNS[design.type] || DESIGNS.bolt;
  const seed = `${design.type}-${design.text || ''}-${a1}`;
  // Substitute colors directly: var() in SVG presentation attributes is not reliable everywhere.
  const art = draw({ a1, a2, id, seed, text: design.text }).replaceAll('var(--bg)', hex).replaceAll('var(--fg)', fg);
  const glowFilters = `<filter id="glow${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const print = `<g>${art}</g>`;

  if (printOnly) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 170"><defs>${glowFilters}</defs>${print}</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440" role="img">
  <defs>
    ${glowFilters}
    <radialGradient id="hl${id}" cx=".45" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity="${light ? 0.25 : 0.12}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="sd${id}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".18" stop-color="#000" stop-opacity="0"/><stop offset=".82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
    <clipPath id="cl${id}"><path d="${SHIRT_PATH}"/></clipPath>
  </defs>
  <path d="${SHIRT_PATH}" fill="${hex}"/>
  <g clip-path="url(#cl${id})">
    <g transform="translate(125 118)">${art}</g>
    <path d="M88 150 Q120 260 104 410 M312 150 Q280 250 300 412 M160 300 Q200 330 250 296" stroke="#000" stroke-opacity=".12" stroke-width="7" fill="none"/>
    <rect width="400" height="440" fill="url(#sd${id})"/>
    <rect width="400" height="440" fill="url(#hl${id})"/>
  </g>
  <path d="M150 38 Q200 82 250 38" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="7"/>
  <path d="M150 38 Q200 82 250 38" fill="none" stroke="${fg}" stroke-opacity=".12" stroke-width="2"/>
  <path d="M52 174 L4 140 M348 174 L396 140" stroke="#000" stroke-opacity=".25" stroke-width="3"/>
</svg>`;
}

/**
 * Encode an SVG as a data URL. Pass a pixel width so browsers rasterise it
 * sharply when it is drawn to a canvas (SVGs without explicit size default to 300x150).
 */
export function svgDataUrl(svg, width) {
  if (width) {
    const [, , , vw, vh] = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
    svg = svg.replace('<svg ', `<svg width="${width}" height="${Math.round((width * vh) / vw)}" `);
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Load a shirt SVG into an HTMLImageElement (browser only). */
export function shirtImage(opts, width = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = svgDataUrl(shirtSVG(opts), width);
  });
}
