// Front & back body map. Each muscle shape is tagged with the muscle group it belongs to.
// Shapes are drawn for the LEFT half and mirrored; "c:" shapes sit on the centre line.
const BODY_SIL = `
  <ellipse cx="100" cy="30" rx="16" ry="19"/>
  <rect x="91" y="44" width="18" height="18" rx="6"/>
  <path d="M62 66 Q100 56 138 66 L142 120 Q135 160 131 198 L133 216 Q100 228 67 216 L69 198 Q65 160 58 120 Z"/>`;
const BODY_SIL_LEFT = `
  <rect x="40" y="70" width="21" height="82" rx="10.5" transform="rotate(8 50 70)"/>
  <rect x="33" y="146" width="18" height="80" rx="9" transform="rotate(6 42 146)"/>
  <ellipse cx="36" cy="238" rx="7" ry="12"/>
  <rect x="67" y="204" width="32" height="114" rx="15" transform="rotate(2 83 204)"/>
  <rect x="71" y="306" width="23" height="84" rx="11"/>
  <ellipse cx="82" cy="393" rx="13" ry="5"/>`;

const BODY_FRONT = [
  ['Shoulders', '<ellipse cx="58" cy="82" rx="12" ry="14"/>'],
  ['Chest', '<path d="M98 74 L72 76 Q62 86 66 104 Q80 118 98 114 Z"/>'],
  ['Biceps', '<ellipse cx="52" cy="118" rx="8" ry="22" transform="rotate(8 52 118)"/>'],
  ['Forearms', '<ellipse cx="44" cy="183" rx="7" ry="27" transform="rotate(6 44 183)"/>'],
  ['Abs', '<rect x="88" y="122" width="11" height="18" rx="3"/><rect x="88" y="143" width="11" height="18" rx="3"/><rect x="88" y="164" width="11" height="18" rx="3"/><rect x="88" y="185" width="11" height="17" rx="3"/>'],
  ['Abs', '<path d="M76 124 Q72 160 79 198 L85 198 L85 126 Z"/>'],
  ['Quads', '<ellipse cx="84" cy="264" rx="13" ry="42" transform="rotate(2 84 264)"/>'],
  ['Calves', '<ellipse cx="83" cy="347" rx="8" ry="30"/>'],
];
const BODY_BACK = [
  ['Back', 'c:<path d="M100 52 L80 70 Q90 94 100 126 Q110 94 120 70 Z"/>'],
  ['Shoulders', '<ellipse cx="58" cy="82" rx="12" ry="14"/>'],
  ['Back', '<path d="M78 92 Q67 122 74 158 Q86 172 98 178 L98 130 Q90 110 78 92 Z"/>'],
  ['Back', 'c:<rect x="88" y="176" width="24" height="26" rx="7"/>'],
  ['Triceps', '<ellipse cx="52" cy="118" rx="8" ry="22" transform="rotate(8 52 118)"/>'],
  ['Forearms', '<ellipse cx="44" cy="183" rx="7" ry="27" transform="rotate(6 44 183)"/>'],
  ['Glutes', '<ellipse cx="85" cy="222" rx="15" ry="17"/>'],
  ['Hamstrings', '<ellipse cx="84" cy="276" rx="12" ry="34"/>'],
  ['Calves', '<ellipse cx="83" cy="345" rx="10" ry="28"/>'],
];
const MIRROR = 'matrix(-1 0 0 1 200 0)';
const HEAT = ['#ffc29a', '#ff9150', '#ff6a1a'];
const MUSCLE_BASE = '#d9d9d9', SIL_FILL = '#efefef';

// counts: {Chest: 6, Back: 3, ...}  →  colour for each muscle
function heatColor(counts, m) {
  const max = Math.max(0, ...Object.values(counts));
  const v = counts[m] || 0;
  if (!v || !max) return MUSCLE_BASE;
  const r = v / max;
  return r < 0.34 ? HEAT[0] : r < 0.67 ? HEAT[1] : HEAT[2];
}

// view: 'front' | 'back'.  colorOf(muscle) returns a fill colour.
function bodySvg(view, colorOf, opts = {}) {
  const shapes = view === 'front' ? BODY_FRONT : BODY_BACK;
  let left = '', centre = '';
  shapes.forEach(([m, el]) => {
    const fill = colorOf(m);
    if (el.startsWith('c:')) centre += `<g fill="${fill}">${el.slice(2)}</g>`;
    else left += `<g fill="${fill}">${el}</g>`;
  });
  const sil = opts.sil || SIL_FILL;
  return `<svg viewBox="0 0 200 402" xmlns="http://www.w3.org/2000/svg" ${opts.size || ''}>
    <g fill="${sil}">${BODY_SIL}${BODY_SIL_LEFT}<g transform="${MIRROR}">${BODY_SIL_LEFT}</g></g>
    <g stroke="${sil}" stroke-width="1.5">${left}<g transform="${MIRROR}">${left}</g>${centre}</g>
  </svg>`;
}

// muscle-group areas used for the "choose a workout" tiles
const AREAS = [
  { name: 'Chest', muscles: ['Chest'], view: 'front' },
  { name: 'Back', muscles: ['Back'], view: 'back' },
  { name: 'Shoulders', muscles: ['Shoulders'], view: 'front' },
  { name: 'Arms', muscles: ['Biceps', 'Triceps', 'Forearms'], view: 'front' },
  { name: 'Abs', muscles: ['Abs'], view: 'front' },
  { name: 'Legs', muscles: ['Quads', 'Hamstrings', 'Glutes', 'Calves'], view: 'front' },
  { name: 'Glutes', muscles: ['Glutes', 'Hamstrings'], view: 'back' },
];
function areaIcon(area) {
  return bodySvg(area.view, m => area.muscles.includes(m) ? '#141414' : '#dcdcdc', { sil: '#f1f1f1' });
}

// turn an SVG string into an <img> we can draw on a canvas
function svgToImage(svg) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
