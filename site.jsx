/* Golden Harmonic Memorial Park — main site */
const { useState, useEffect, useMemo, useRef } = React;

/* ---------- Palettes ----------
   Keyed by the swatch array so TweakColor can pass the array directly back. */
const PALETTE_OPTIONS = [
['#2f5d4c', '#f6f1e8', '#b08544'], // Sage & Sand
['#2a4570', '#f5efe6', '#c9913f'], // River Dawn
['#73302f', '#f4ecdf', '#a8843a'] // Garden Heritage
];

const PALETTES = {
  '#2f5d4c': {
    '--bg': '#f6f1e8', '--bg-2': '#ece4d3', '--ink': '#1f2a26', '--ink-2': '#4a564f',
    '--line': '#d9cfbb', '--accent': '#2f5d4c', '--accent-ink': '#f6f1e8',
    '--gold': '#b08544', '--terracotta': '#b8593a', '--card': '#fbf7ee'
  },
  '#2a4570': {
    '--bg': '#f5efe6', '--bg-2': '#e8dfd0', '--ink': '#1c2535', '--ink-2': '#475064',
    '--line': '#d4c9b7', '--accent': '#2a4570', '--accent-ink': '#f5efe6',
    '--gold': '#c9913f', '--terracotta': '#c25a3f', '--card': '#fbf6ed'
  },
  '#73302f': {
    '--bg': '#f4ecdf', '--bg-2': '#e7dcc7', '--ink': '#2a1a1a', '--ink-2': '#574141',
    '--line': '#d2c3a8', '--accent': '#73302f', '--accent-ink': '#f4ecdf',
    '--gold': '#a8843a', '--terracotta': '#9d4a32', '--card': '#faf3e5'
  }
};

/* ---------- Pricing (base in PHP) ----------
   Sourced from the park's actual price list. No down payment on any plan —
   installment plans instead apply a surcharge to the spot-cash price, then
   divide evenly by the term. Verified against every example in the source
   price list (Regular, Garden, and Family Vault categories all matched this
   exact schedule): */
const PLAN_TERMS = [
{ key: 'cash', label: 'Spot Cash', months: 0, surcharge: 0 },
{ key: '1yr', label: '1-Year Plan', months: 12, surcharge: 0.10 },
{ key: '2yr', label: '2-Year Plan', months: 24, surcharge: 0.15 },
{ key: '3yr', label: '3-Year Plan', months: 36, surcharge: 0.20 },
{ key: '5yr', label: '5-Year Plan', months: 60, surcharge: 0.30 }];


const BASE_TIERS = [
{
  id: 'regular', name: 'Regular Plot', category: 'Regular Plots', price: 60000,
  desc: 'A standard single-interment lot in our open-lawn sections.',
  features: ['1 interment space', 'Perpetual care included', 'Open-lawn setting'],
  label: 'regular plot — open lawn'
},
{
  id: 'premium', name: 'Premium Plot', category: 'Regular Plots', price: 85000,
  desc: 'An upgraded standard plot in one of the park\'s preferred sections.',
  features: ['1 interment space', 'Perpetual care included', 'Preferred section placement'],
  label: 'premium plot — preferred section'
},
{
  id: 'corner-premium', name: 'Corner Premium Plot', category: 'Regular Plots', price: 95000,
  desc: 'A corner plot in our most requested standard section.',
  features: ['1 interment space', 'Perpetual care included', 'Corner placement'],
  label: 'corner premium plot'
},
{
  id: 'garden-regular', name: 'Regular Garden Plot', category: 'Garden Plots', price: 75000,
  desc: 'A single-interment lot within our landscaped garden sections.',
  features: ['1 interment space', 'Perpetual care included', 'Garden setting'],
  label: 'regular garden plot'
},
{
  id: 'garden-premium', name: 'Premium Garden Plot', category: 'Garden Plots', price: 95000,
  desc: 'An upgraded garden plot in a preferred section of the garden.',
  features: ['1 interment space', 'Perpetual care included', 'Preferred garden section'],
  label: 'premium garden plot'
},
{
  id: 'garden-corner', name: 'Corner Prime Garden Plot', category: 'Garden Plots', price: 115000,
  desc: 'A corner plot in our most requested garden section.',
  features: ['1 interment space', 'Perpetual care included', 'Prime corner placement'],
  label: 'corner prime garden plot'
},
{
  id: 'family-vault', name: 'Family Vault Package', category: 'Family Vault', price: 105000,
  desc: 'An apartment-style below-ground vault holding 3 coffins in one plot.',
  features: ['3 coffins in one plot', 'Apartment-style below-ground vault', 'Payment plans available (surcharge applies)'],
  label: 'family vault — apartment-style'
}];


// Mausoleum: land and construction are priced as ranges (they depend on the
// exact size and design), so these live outside the fixed-price calculator
// above and are presented as request-a-quote items instead.
const MAUSOLEUM_PLOTS = [
{ size: 'Small Plot', area: '12–20 sqm', low: 300000, high: 400000, desc: 'Suitable for a small family mausoleum or single-chamber vault.' },
{ size: 'Medium Plot', area: '30–50 sqm', low: 700000, high: 900000, desc: 'Ideal for a medium-sized family mausoleum with multiple chambers.' },
{ size: 'Large Plot', area: '70–100+ sqm', low: 1800000, high: 2500000, desc: 'A spacious plot for a large mausoleum or community memorial.' }];


const MAUSOLEUM_PACKAGES = [
{ size: 'Small Mausoleum Package', area: '12–20 sqm', low: 500000, high: 700000, desc: 'Plot, design, and construction of a small mausoleum.' },
{ size: 'Medium Mausoleum Package', area: '30–50 sqm', low: 1200000, high: 1800000, desc: 'Plot, design, and construction of a medium mausoleum.' },
{ size: 'Large Mausoleum Package', area: '70–100+ sqm', low: 3000000, high: null, desc: 'Plot, design, and construction of a large mausoleum.' }];


const TWO_STORY_MAUSOLEUM = {
  area: '120–160 sqm', low: 5000000, high: 7000000,
  desc: 'Two floors: a ground-floor memorial chamber, comfort room, and reception area, plus a second-floor family rest area, kitchenette, and reflection nook.'
};


const fmt = (n) => '₱' + Math.round(n).toLocaleString('en-PH');

/* ---------- Plan selection (shared between tier cards and the calculator) ---------- */
const PlanSelectionContext = React.createContext({ selectedTierId: null, selectTier: () => {} });
function usePlanSelection() { return React.useContext(PlanSelectionContext); }

/* ---------- Lightbox (shared across Gallery, Tiers) ---------- */
const LightboxContext = React.createContext(() => {});
function useLightbox() { return React.useContext(LightboxContext); }

function LightboxRoot({ children }) {
  const [state, setState] = useState(null); // { items: [{label, caption}], index }

  const open = (items, index = 0) => setState({ items, index });
  const close = () => setState(null);
  const step = (dir) => setState((s) => s && { ...s, index: (s.index + dir + s.items.length) % s.items.length });

  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  return (
    <LightboxContext.Provider value={open}>
      {children}
      {state &&
      <div className="lightbox-overlay" onClick={close}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button className="lb-btn lb-close" onClick={close} aria-label="Close">✕</button>
            {state.items.length > 1 &&
          <button className="lb-btn lb-prev" onClick={() => step(-1)} aria-label="Previous">‹</button>}

            <div className="ph aspect-wide">
              <div className="ph-label">{state.items[state.index].label}</div>
            </div>
            {state.items.length > 1 &&
          <button className="lb-btn lb-next" onClick={() => step(1)} aria-label="Next">›</button>}

            <div className="lightbox-caption">
              <span>{state.items[state.index].caption}</span>
              {state.items.length > 1 &&
            <span className="lb-count">{state.index + 1} / {state.items.length}</span>}

            </div>
          </div>
        </div>}

    </LightboxContext.Provider>);

}

/* Clickable photo frame — drop-in replacement for a bare .ph placeholder */
function Photo({ label, caption, items, index, aspect = '', className = '', style, scene }) {
  const openLightbox = useLightbox();
  const group = items || [{ label, caption: caption || label }];
  const idx = index || 0;
  return (
    <div
      className={`ph ${aspect} clickable ${scene ? 'illustrated' : ''} ${className}`}
      style={style}
      onClick={() => openLightbox(group, idx)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') openLightbox(group, idx); }}>

      {scene ? <Scene variant={scene} /> : <div className="ph-label">{label}</div>}
      {scene && <div className="ph-label ph-label-overlay">{label}</div>}
      <div className="ph-expand">⤢</div>
    </div>);

}

/* ---------- Signature motif: rainforest ridgeline divider ---------- */
function CliffDivider({ flip = false, dark = false }) {
  return (
    <div className={`cliff-divider ${flip ? 'flip' : ''} ${dark ? 'on-dark' : ''}`}>
      <svg viewBox="0 0 1200 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M0,60 L0,38 L60,20 L110,34 L170,12 L230,30 L300,8 L360,26 L430,4 L500,22 L560,10 L630,28 L700,6 L770,24 L840,14 L910,30 L980,10 L1050,26 L1120,16 L1200,30 L1200,60 Z"
          fill="var(--accent)" opacity="0.14" />

        <path
          d="M0,60 L0,46 L70,30 L140,42 L210,24 L280,40 L350,20 L420,36 L490,18 L560,34 L630,22 L700,38 L770,20 L840,34 L910,24 L980,38 L1050,26 L1120,36 L1200,44 L1200,60 Z"
          fill="var(--accent)" opacity="0.32" />

      </svg>
    </div>);

}

/* ---------- Illustrated scenes (stand-in artwork until real photos are ready) ---------- */
const FOLIAGE = '#7c8a63';
const FOLIAGE_DARK = '#5e6c49';
const WATER = '#7f97a3';

function hillsPath(seed, amplitude, baseY) {
  let d = `M0,300 L0,${baseY.toFixed(1)}`;
  for (let i = 0; i <= 12; i++) {
    const x = (i / 12) * 400;
    const y = baseY - amplitude * Math.sin((i + seed) * 0.9) - amplitude * 0.4 * Math.sin((i + seed) * 2.3);
    d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d + ' L400,300 Z';
}

function TreeCluster({ x, y, scale = 1, color }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <circle cx="-9" cy="1" r="9" fill={color} opacity="0.9" />
      <circle cx="6" cy="-5" r="12" fill={color} />
      <circle cx="15" cy="2" r="7" fill={color} opacity="0.88" />
    </g>);

}

function ChapelSilhouette({ x, y, scale = 1, color }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <path d="M-22,2 L-22,-28 L0,-46 L22,-28 L22,2 Z" fill={color} />
      <rect x="-4" y="-64" width="8" height="20" fill={color} />
      <rect x="-2" y="-72" width="4" height="9" fill={color} />
      <rect x="-5" y="-10" width="10" height="12" fill="var(--card)" opacity="0.55" />
    </g>);

}

function Monument({ x, y, scale = 1, color }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <rect x="-6" y="-38" width="12" height="38" fill={color} />
      <path d="M-6,-38 L0,-50 L6,-38 Z" fill={color} />
    </g>);

}

function MarkerRow({ y, count, color, spacing = 44 }) {
  const start = (400 - count * spacing) / 2 + spacing / 2 - 9;
  return (
    <>
      {Array.from({ length: count }).map((_, i) =>
      <rect key={i} x={start + i * spacing} y={y} width="18" height="9" rx="2" fill={color} opacity="0.85" />
      )}
    </>);

}

function WaterBand({ y, height }) {
  return (
    <g>
      <rect x="0" y={y} width="400" height={height} fill={WATER} opacity="0.55" />
      {[0, 1, 2, 3].map((i) =>
      <rect key={i} x={16 + i * 95} y={y + height * 0.35 + i * 2.5} width="58" height="3" rx="2" fill="#ffffff" opacity="0.22" />
      )}
    </g>);

}

/* ---------- Hero signature: the soul's passage ----------
   Palawan's Tabon Caves hold the oldest funerary art in the Philippines —
   carved boats guiding the soul onward, the same motif later immortalized
   in the Manunggul jar. This hero scene draws on that lineage directly:
   karst cliffs at dusk, a wooden outrigger under a rising moon, and the
   bioluminescent plankton that light Palawan's bays after dark. */
function HeroVoyageScene() {
  return (
    <svg className="scene-svg" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="voyage-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c2e2a" />
          <stop offset="55%" stopColor="#5c5236" />
          <stop offset="100%" stopColor="#caa15a" />
        </linearGradient>
        <linearGradient id="voyage-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a7548" />
          <stop offset="35%" stopColor="#4d564c" />
          <stop offset="100%" stopColor="#182420" />
        </linearGradient>
      </defs>

      <rect width="400" height="340" fill="url(#voyage-sky)" />
      <circle cx="300" cy="80" r="50" fill="#f7ecd1" opacity="0.12" />
      <circle cx="300" cy="80" r="24" fill="#f7ecd1" opacity="0.9" />

      {/* distant karst, then nearer karst — Palawan's limestone cliffline, not rolling hills */}
      <path d="M0,230 L0,210 L25,180 L45,205 L70,150 L95,195 L120,140 L150,190 L175,120 L205,185 L230,145 L260,195 L290,130 L320,190 L350,150 L375,200 L400,170 L400,340 L0,340 Z"
        fill="var(--accent)" opacity="0.22" />
      <path d="M0,260 L20,230 L40,250 L65,190 L85,240 L110,170 L140,235 L165,150 L195,225 L220,160 L250,230 L275,180 L305,220 L330,175 L360,230 L385,195 L400,215 L400,340 L0,340 Z"
        fill="var(--ink)" opacity="0.55" />

      <rect x="0" y="330" width="400" height="170" fill="url(#voyage-water)" />
      <ellipse cx="300" cy="345" rx="66" ry="2.5" fill="#f6dfa8" opacity="0.3" />
      <ellipse cx="292" cy="360" rx="80" ry="3" fill="#f6dfa8" opacity="0.2" />
      <ellipse cx="280" cy="380" rx="96" ry="3.5" fill="#f6dfa8" opacity="0.12" />

      <g className="voyage-specks">
        {[[64,368,2.2,.6],[92,392,1.7,.8],[118,410,2.4,.5],[150,430,2,.9],[175,405,2.2,.6],
          [205,450,1.8,.7],[230,420,2.3,.5],[255,465,1.9,.8],[280,440,2.2,.6],[310,470,1.8,.7],
          [335,415,2.4,.5],[105,445,1.7,.7],[190,460,2,.6]].map(([cx,cy,r,op], i) =>
          <circle key={i} cx={cx} cy={cy} r={r} fill="#8fe3c9" opacity={op}
            style={{ animationDelay: `${(i % 5) * 0.6}s` }} />
        )}
      </g>

      <g className="voyage-boat">
        <ellipse cx="110" cy="382" rx="18" ry="3" fill="none" stroke="#f6f1e8" strokeWidth="1" opacity="0.22" />
        <ellipse cx="94" cy="387" rx="27" ry="3" fill="none" stroke="#f6f1e8" strokeWidth="1" opacity="0.13" />
        <path d="M120,378 C150,368 230,368 260,378 C245,388 215,392 190,392 C165,392 135,388 120,378 Z" fill="var(--ink)" />
        <path d="M258,378 C270,368 278,352 274,338 C266,352 258,364 250,373 Z" fill="var(--ink)" />
        <path d="M122,378 C112,370 106,358 108,348 C114,358 120,368 128,374 Z" fill="var(--ink)" />
        <ellipse cx="225" cy="362" rx="6" ry="14" fill="var(--ink)" />
        <circle cx="225" cy="345" r="5" fill="var(--ink)" />
        <line x1="232" y1="355" x2="246" y2="391" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="165" cy="364" rx="6" ry="13" fill="var(--ink)" />
        <circle cx="165" cy="348" r="5" fill="var(--ink)" />
        <line x1="158" y1="358" x2="140" y2="392" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
      </g>

      <rect x="0" y="470" width="400" height="30" fill="var(--ink)" opacity="0.1" />
    </svg>);
}

const SCENE_CONFIG = {
  'hero-aerial': { sky: ['#fdf6e6', '#f3e2ba'], sun: [320, 60, 'var(--gold)'], seed: 1, water: false, trees: [{ x: 60, y: 232, scale: 1.3 }, { x: 340, y: 236, scale: 1.1 }, { x: 200, y: 240, scale: 0.9 }] },
  entrance: { sky: ['#fbeed2', '#e9c88a'], sun: [90, 50, 'var(--gold)'], seed: 2, water: false, trees: [{ x: 40, y: 228, scale: 1.2 }, { x: 360, y: 228, scale: 1.2 }], chapel: { x: 200, scale: 0.85 } },
  lake: { sky: ['#eef1e4', '#d8e0cc'], sun: [340, 45, '#fff6dc'], seed: 5, water: true, trees: [{ x: 40, y: 224, scale: 1.1 }, { x: 370, y: 226, scale: 0.9 }] },
  'chapel-facade': { sky: ['#faefd6', '#e7cf9c'], sun: [70, 55, 'var(--gold)'], seed: 3, water: false, trees: [{ x: 320, y: 230, scale: 1 }], chapel: { x: 190, scale: 1.25 } },
  'family-pathway': { sky: ['#f4efe0', '#dfd9b8'], sun: [330, 55, 'var(--terracotta)'], seed: 4, water: false, trees: [{ x: 50, y: 226, scale: 1.1 }, { x: 300, y: 230, scale: 1 }, { x: 210, y: 234, scale: 0.8 }], markers: 5 },
  'mausoleum-row': { sky: ['#f0e9d6', '#d9c79f'], sun: [60, 50, 'var(--gold)'], seed: 6, water: false, trees: [{ x: 30, y: 226, scale: 0.9 }], monuments: [90, 175, 260, 340] },
  'aerial-map': { sky: ['#fbf6ea', '#e4dcb9'], sun: [230, 40, 'var(--gold)'], seed: 7, water: true, trees: [{ x: 60, y: 220, scale: 1 }, { x: 130, y: 232, scale: 0.8 }, { x: 300, y: 224, scale: 1 }] },
  aborlan: { sky: ['#eef4ea', '#d5e2c9'], sun: [70, 42, '#fff2cf'], seed: 8, water: true, trees: [{ x: 40, y: 220, scale: 1.3 }, { x: 90, y: 232, scale: 1 }, { x: 330, y: 222, scale: 1.2 }, { x: 370, y: 234, scale: 0.9 }] },
  roxas: { sky: ['#f6f0dc', '#e3d3a2'], sun: [330, 48, 'var(--gold)'], seed: 9, water: true, trees: [{ x: 45, y: 224, scale: 1.4 }, { x: 360, y: 226, scale: 1.2 }] },
  lawn: { sky: ['#f6efdd', '#e3d6ac'], sun: [70, 46, 'var(--gold)'], seed: 10, water: false, trees: [{ x: 320, y: 230, scale: 1 }], markers: 3 },
  'premium-lawn': { sky: ['#eef3e6', '#d7e1c6'], sun: [330, 46, '#fff2cf'], seed: 11, water: true, trees: [{ x: 50, y: 224, scale: 1.2 }], markers: 2 },
  family: { sky: ['#f5efdc', '#e0d2a4'], sun: [60, 48, 'var(--gold)'], seed: 12, water: false, trees: [{ x: 340, y: 228, scale: 1 }], markers: 4 },
  niche: { sky: ['#f7f0dd', '#e5d6a8'], sun: [90, 42, 'var(--gold)'], seed: 13, water: false, trees: [], chapel: { x: 200, scale: 0.9 } },
  'premium-niche': { sky: ['#f7f0dd', '#ecd68f'], sun: [90, 46, 'var(--gold)'], seed: 14, water: false, trees: [], chapel: { x: 200, scale: 1.05 } },
  mausoleum: { sky: ['#f2ead2', '#dcc079'], sun: [70, 50, 'var(--gold)'], seed: 15, water: false, trees: [{ x: 60, y: 228, scale: 0.9 }], chapel: { x: 220, scale: 1.15 }, monuments: [90] },
  // Per-plot images for the price-list form's order summary + confirmation email —
  // one unique scene per real plot, richer as the price tier goes up.
  'regular':        { sky: ['#f6efdd', '#e3d6ac'], sun: [70, 46, 'var(--gold)'], seed: 10, water: false, trees: [{ x: 320, y: 230, scale: 1 }], markers: 3 },
  'premium':        { sky: ['#f2ecd8', '#ddd0a0'], sun: [100, 44, '#c9a355'], seed: 16, water: false, trees: [{ x: 60, y: 226, scale: 1.1 }, { x: 330, y: 228, scale: 0.9 }], markers: 3 },
  'corner-premium': { sky: ['#eef1de', '#d9d3a0'], sun: [300, 42, '#c9a355'], seed: 18, water: false, trees: [{ x: 50, y: 224, scale: 1 }, { x: 340, y: 230, scale: 1.1 }], monuments: [200], markers: 2 },
  'garden-regular': { sky: ['#eef4e5', '#d7e4c4'], sun: [80, 44, 'var(--gold)'], seed: 20, water: false, trees: [{ x: 70, y: 222, scale: 1.2 }, { x: 150, y: 230, scale: 0.9 }, { x: 330, y: 224, scale: 1.1 }], markers: 3 },
  'garden-premium': { sky: ['#eaf2e2', '#cfe0bd'], sun: [310, 44, '#fff2cf'], seed: 22, water: true, trees: [{ x: 50, y: 222, scale: 1.2 }, { x: 130, y: 232, scale: 0.9 }, { x: 320, y: 224, scale: 1.1 }], markers: 2 },
  'garden-corner':  { sky: ['#e7f1de', '#c9ddb5'], sun: [320, 42, '#fff2cf'], seed: 24, water: true, trees: [{ x: 40, y: 220, scale: 1.3 }, { x: 100, y: 230, scale: 1 }, { x: 300, y: 222, scale: 1.2 }, { x: 360, y: 232, scale: 0.9 }], monuments: [200], markers: 2 },
  'family-vault':   { sky: ['#f5efdc', '#e0d2a4'], sun: [60, 48, 'var(--gold)'], seed: 12, water: false, trees: [{ x: 340, y: 228, scale: 1 }], chapel: { x: 190, scale: 0.7 }, markers: 4 }
};

function Scene({ variant }) {
  if (variant === 'hero-voyage') return <HeroVoyageScene />;
  const cfg = SCENE_CONFIG[variant] || SCENE_CONFIG.lawn;
  const gid = `sky-${variant}`;
  return (
    <svg className="scene-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.sky[0]} />
          <stop offset="100%" stopColor={cfg.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${gid})`} />
      <circle cx={cfg.sun[0]} cy={cfg.sun[1]} r="44" fill={cfg.sun[2]} opacity="0.3" />
      <rect x="0" y="150" width="400" height="70" fill={cfg.sun[2]} opacity="0.1" />
      <path d={hillsPath(cfg.seed, 16, 188)} fill="var(--accent)" opacity="0.15" />
      <path d={hillsPath(cfg.seed + 3, 13, 208)} fill={FOLIAGE_DARK} opacity="0.55" />
      <path d={hillsPath(cfg.seed + 1, 9, 228)} fill={FOLIAGE} />
      {cfg.water && <WaterBand y={226} height={30} />}
      {(cfg.monuments || []).map((mx, i) => <Monument key={i} x={mx} y={230} scale={1} color="var(--ink)" />)}
      {cfg.chapel && <ChapelSilhouette x={cfg.chapel.x} y={230} scale={cfg.chapel.scale} color="var(--ink)" />}
      {(cfg.trees || []).map((t, i) => <TreeCluster key={i} {...t} color={i % 2 ? FOLIAGE_DARK : FOLIAGE} />)}
      {cfg.markers && <MarkerRow y={234} count={cfg.markers} color="var(--card)" />}
      <rect x="0" y="270" width="400" height="30" fill="var(--ink)" opacity="0.06" />
    </svg>);

}
function CountUp({ text }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    setDisplay(text);
    const match = text.match(/\d+/);
    if (!match || !ref.current) return;
    const target = parseInt(match[0], 10);
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    let started = false;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !started) {
          started = true;
          const start = performance.now();
          const dur = 900;
          const tick = (now) => {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(`${before}${Math.round(target * eased)}${after}`);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [text]);

  return <span className="count-num" ref={ref}>{display}</span>;
}

/* ---------- App ---------- */
function App() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  const [baseTiers, setBaseTiers] = useState(BASE_TIERS);
  const [selectedTierId, setSelectedTierId] = useState(null);

  // Load products from Firestore (falls back to hardcoded BASE_TIERS if DB is empty)
  useEffect(() => {
    if (!window.db) return;
    window.db.collection('products').orderBy('sortOrder').get()
      .then(snap => {
        if (!snap.empty) {
          setBaseTiers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      })
      .catch(err => console.warn('[GH] Using default products (DB not set up yet):', err));
  }, []);

  // Apply palette CSS vars to :root
  useEffect(() => {
    const key = Array.isArray(t.palette) ? t.palette[0] : t.palette;
    const vars = PALETTES[key] || PALETTES['#2f5d4c'];
    Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  }, [t.palette]);

  const priceMult = t.priceMultiplier / 100;

  // Apply tier prices
  const tiers = useMemo(() => baseTiers.map((tier) => ({
    ...tier,
    price: tier.price * priceMult
  })), [baseTiers, priceMult]);

  // Scroll fade-in
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {if (e.isIntersecting) e.target.classList.add('in');});
    }, { threshold: 0.1 });
    document.querySelectorAll('.fade-up').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [t.showInvestment]);

  return (
    <PlanSelectionContext.Provider value={{ selectedTierId, selectTier: setSelectedTierId }}>
      <LightboxRoot>
        <Utility />
        <Header />
        <main>
          <Hero />
          <Tiers tiers={tiers} />
          <PaymentPlans tiers={tiers} />
          <Mausoleum />
          {t.showInvestment && <Investment />}
          {t.showInvestment && <CliffDivider dark flip />}
          <PrePostNeed />
          <Gallery />
          <CliffDivider flip />
          <About />
          <FAQ />
          <Brochure tiers={tiers} />
        </main>
        <Footer />
        <Tweaks t={t} setTweak={setTweak} priceMult={priceMult} />
      </LightboxRoot>
    </PlanSelectionContext.Provider>);

}

/* ---------- Utility bar ---------- */
function Utility() {
  return (
    <div className="utility">
      <div className="wrap row">
        <div className="links">
          <a href="#brochure">📍 Palawan, Philippines</a>
        </div>
        <div className="links">
          <a href="tel:+639171234567">+63 917 123 4567</a>
          <a href="#brochure" className="pill">Free price list →</a>
        </div>
      </div>
    </div>);

}

/* ---------- Header ---------- */
function Header() {
  return (
    <header className="site">
      <div className="wrap row">
        <a href="#" className="brand">
          <div className="brand-mark">G</div>
          <div className="brand-text">
            <div className="name">Golden Harmonic</div>
            <div className="sub">Memorial Park · Palawan</div>
          </div>
        </a>
        <nav className="primary">
          <a href="#tiers">Plots & Pricing</a>
          <a href="#plans">Payment Plans</a>
          <a href="#mausoleum">Mausoleum</a>
          <a href="#invest">Investment</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a href="#brochure" className="btn btn-primary" style={{ gap: "1.5px" }}>Get the Price List</a>
      </div>
    </header>);

}

/* ---------- Hero ---------- */
function Hero() {
  return (
    <section className="hero">
      <div className="hero-atmosphere"></div>
      <div className="wrap hero-grid">
        <div className="fade-up in">
          <span className="eyebrow mono">9°29′N 118°30′E · Palawan, Philippines</span>
          <h1>A sanctuary of peace,<br />heritage, and <em>remembrance</em>.</h1>
          <p className="lede">
            Your legacy, our sacred care. Twenty-five hectares of garden, riverside groves, and family estates cut into Palawan's own limestone coastline — designed for its families to remember well, for generations.
          </p>
          <div className="cta-row">
            <a href="#brochure" className="btn btn-primary">Request the full price list</a>
            <a href="#tiers" className="btn btn-ghost">View plots & pricing →</a>
          </div>
          <div className="meta">
            <div>
              <div className="label">Family-owned since</div>
              <div className="value">1998</div>
            </div>
            <div>
              <div className="label">Total hectares</div>
              <div className="value">25 ha</div>
            </div>
            <div>
              <div className="label">Plots under perpetual care</div>
              <div className="value">12,400+</div>
            </div>
          </div>
        </div>
        <div className="fade-up in">
          <Photo aspect="aspect-hero" scene="hero-voyage" label="the soul's passage — after Palawan's Tabon Cave funerary boats"
            items={[{ label: 'the soul\'s passage', caption: 'A motif carried from the Tabon Caves — Palawan\'s earliest funerary art, and the same lineage later carved into the Manunggul jar.' }]} />
        </div>
      </div>
    </section>);

}

/* ---------- Trust strip ---------- */
function Trust() {
  const items = [
  { big: '28 yrs', lbl: 'Family-owned & operated' },
  { big: 'DHSUD', lbl: 'Licensed & permit-cleared' },
  { big: '100%', lbl: 'Perpetual care fund' },
  { big: '8–12%', lbl: 'Annual lot appreciation' }];

  return (
    <div className="trust">
      <div className="wrap row">
        {items.map((i, idx) =>
        <div className="item fade-up in" key={i.lbl} style={{ '--stagger': idx }}>
            <div className="big"><CountUp text={i.big} /></div>
            <div className="lbl">{i.lbl}</div>
          </div>
        )}
      </div>
    </div>);

}

/* ---------- Pricing tiers ---------- */
function Tiers({ tiers }) {
  const categories = ['Regular Plots', 'Garden Plots', 'Family Vault'];
  return (
    <section className="block" id="tiers">
      <div className="wrap">
        <div className="section-head fade-up">
          <div>
            <span className="eyebrow">Plots & Pricing</span>
            <h2 style={{ marginTop: 18 }}>Seven ways to plan ahead — from ₱60,000.</h2>
          </div>
          <div className="side">
            Every plot includes perpetual care and all-faiths welcome. No down payment on any installment plan — pay spot cash, or spread the (surcharged) total over 1, 2, 3, or 5 years.
          </div>
        </div>
        {categories.map((cat) => {
          const group = tiers.filter((t) => t.category === cat);
          if (!group.length) return null;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <h3 className="cat-head fade-up">{cat}</h3>
              <div className={`tiers ${group.length === 1 ? 'single' : ''}`}>
                {group.map((tier, i) => <Tier key={tier.id} tier={tier} i={i} allTiers={tiers} />)}
              </div>
            </div>);

        })}
        <p className="small" style={{ marginTop: 22, textAlign: 'center' }}>
          All prices in Philippine Pesos · Includes lot, perpetual care, and standard documentation
        </p>
      </div>
    </section>);

}

function Tier({ tier, i = 0, allTiers = [] }) {
  const { selectedTierId, selectTier } = usePlanSelection();
  const group = allTiers.length ?
  allTiers.map((t) => ({ label: t.label, caption: t.name })) :
  [{ label: tier.label, caption: tier.name }];
  const idx = allTiers.findIndex((t) => t.id === tier.id);
  const isSelected = selectedTierId === tier.id;
  const fiveYear = PLAN_TERMS[4]; // lowest monthly = longest term
  const monthly = tier.price * (1 + fiveYear.surcharge) / fiveYear.months;
  const sceneKey = tier.id === 'family-vault' ? 'family' :
  tier.id === 'regular' || tier.id === 'garden-regular' ? 'lawn' :
  'premium-lawn';
  return (
    <div
      className={`tier fade-up ${isSelected ? 'selected' : ''}`}
      style={{ '--stagger': i % 6 }}>

      <Photo label={tier.label} scene={sceneKey} items={group} index={idx < 0 ? 0 : idx} />
      <div>
        <h3>{tier.name}</h3>
        <div className="desc">{tier.desc}</div>
      </div>
      <div className="price-row">
        <div>
          <div className="from">Spot cash</div>
          <div className="price"><span className="currency">₱</span>{Math.round(tier.price).toLocaleString('en-PH')}</div>
        </div>
      </div>
      <div className="monthly">
        <span>or pay as low as</span>
        <strong>{fmt(monthly)}/mo</strong>
      </div>
      <ul className="feature-list">
        {tier.features.map((f) => <li key={f}>{f}</li>)}
      </ul>
      <a
        href="#plans"
        className="btn btn-primary"
        onClick={() => selectTier(tier.id)}>

        {isSelected ? '✓ Selected — see your plan below' : 'Choose this plan →'}
      </a>
    </div>);

}

/* ---------- Payment calculator ---------- */
function PaymentCalculator({ tiers }) {
  const { selectedTierId, selectTier } = usePlanSelection();
  const [tierId, setTierId] = useState(tiers[0]?.id);
  const [termKey, setTermKey] = useState('1yr');

  // Reflect a plan chosen from the Plots & Pricing cards above
  useEffect(() => {
    if (selectedTierId) setTierId(selectedTierId);
  }, [selectedTierId]);

  const tier = tiers.find((t) => t.id === tierId) || tiers[0];
  const price = tier ? tier.price : 0;
  const term = PLAN_TERMS.find((t) => t.key === termKey) || PLAN_TERMS[0];
  const isCash = term.key === 'cash';
  const total = price * (1 + term.surcharge);
  const monthly = isCash ? 0 : total / term.months;
  const surchargeAmt = total - price;

  return (
    <div className="calc-card fade-up">
      <h3>{selectedTierId ? `Your plan: ${tier?.name || ''}` : 'Build your own plan'}</h3>
      <div className="calc-sub">
        {selectedTierId ?
        'Pick a payment term below — no down payment on any plan.' :
        'Pick a plot and a term — no down payment on any plan.'}
      </div>

      <div className="calc-row">
        <div className="calc-row-head"><label>Plot type</label></div>
        <select className="calc-select" value={tierId} onChange={(e) => { setTierId(e.target.value); selectTier(e.target.value); }}>
          {tiers.map((t) =>
          <option key={t.id} value={t.id}>{t.name} — {fmt(t.price)}</option>
          )}
        </select>
      </div>

      <div className="calc-row">
        <div className="calc-row-head"><label>Payment term</label></div>
        <div className="calc-toggle-row" style={{ flexWrap: 'wrap' }}>
          {PLAN_TERMS.map((tm) =>
          <div key={tm.key} className={`calc-chip ${termKey === tm.key ? 'active' : ''}`} onClick={() => setTermKey(tm.key)}>
              {tm.label}
            </div>
          )}
        </div>
      </div>

      <div className="calc-output">
        {isCash ?
        <>
            <div className="box"><div className="lbl">Spot cash price</div><div className="val">{fmt(price)}</div></div>
            <div className="box"><div className="lbl">Down payment</div><div className="val">None</div></div>
            <div className="box wide"><div className="lbl">Due today</div><div className="val">{fmt(price)}</div></div>
          </> :

        <>
            <div className="box"><div className="lbl">Surcharge ({Math.round(term.surcharge * 100)}%)</div><div className="val">{fmt(surchargeAmt)}</div></div>
            <div className="box"><div className="lbl">Total over {term.months}mo</div><div className="val">{fmt(total)}</div></div>
            <div className="box wide"><div className="lbl">Monthly payment</div><div className="val">{fmt(monthly)}/mo</div></div>
          </>}

      </div>
      <p className="small" style={{ marginTop: 10 }}>No down payment required on any plan. Late payments incur a 2% monthly penalty.</p>
      <a href="#brochure" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
        Lock this plan · Request the price list
      </a>
    </div>);

}

/* ---------- Payment plans ---------- */
function PaymentPlans({ tiers }) {
  return (
    <section className="block" id="plans">
      <div className="wrap">
        <div className="section-head fade-up">
          <div>
            <span className="eyebrow">Payment Plans</span>
            <h2 style={{ marginTop: 18 }}>Own a piece of peace — for as little as ₱1,300 a month.</h2>
          </div>
          <div className="side">
            No down payment on any plan. Choose spot cash, or spread the total over 1, 2, 3, or 5 years — pre-need pricing locks today's rate for life.
          </div>
        </div>
        <div className="plans-grid">
          <table className="plan-table fade-up">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Term</th>
                <th>Surcharge</th>
                <th>Sample monthly*</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Spot Cash</strong></td>
                <td>—</td>
                <td>None</td>
                <td>—</td>
                <td>₱60,000</td>
              </tr>
              <tr>
                <td><strong>1-Year Plan</strong></td>
                <td>12 mo</td>
                <td>10%</td>
                <td>₱5,500</td>
                <td>₱66,000</td>
              </tr>
              <tr>
                <td><strong>2-Year Plan</strong></td>
                <td>24 mo</td>
                <td>15%</td>
                <td>₱2,875</td>
                <td>₱69,000</td>
              </tr>
              <tr>
                <td><strong>3-Year Plan</strong></td>
                <td>36 mo</td>
                <td>20%</td>
                <td>₱2,000</td>
                <td>₱72,000</td>
              </tr>
              <tr>
                <td><strong>5-Year Plan</strong></td>
                <td>60 mo</td>
                <td>30%</td>
                <td>₱1,300</td>
                <td>₱78,000</td>
              </tr>
            </tbody>
          </table>
          <PaymentCalculator tiers={tiers} />
        </div>
        <div className="fade-up" style={{ marginTop: 44, maxWidth: 640 }}>
          <h3 className="display" style={{ fontSize: 24, marginBottom: 12 }}>What "pre-need" really saves you.</h3>
          <p style={{ color: 'var(--ink-2)', marginBottom: 18 }}>
            The average burial lot in Palawan has appreciated 8–12% per year for the past decade. A ₱60,000 lot bought today will likely cost significantly more in ten years. Lock the price now, and your family pays nothing later.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="#brochure" className="btn btn-primary">Get a custom quote</a>
            <a href="tel:+639171234567" className="btn btn-ghost">Talk to a counselor</a>
          </div>
          <p className="small" style={{ marginTop: 18 }}>
            *Table figures shown for a Regular Plot (₱60,000 spot cash). Use the calculator above for any plot type. No down payment on any plan; a 2% monthly penalty applies to late payments.
          </p>
        </div>
      </div>
    </section>);

}

/* ---------- Mausoleum ---------- */
function fmtRange(low, high) {
  return high ? `${fmt(low)} – ${fmt(high)}` : `${fmt(low)}+`;
}

function Mausoleum() {
  return (
    <section className="block" id="mausoleum">
      <div className="wrap">
        <div className="section-head fade-up">
          <div>
            <span className="eyebrow">Mausoleum</span>
            <h2 style={{ marginTop: 18 }}>A permanent family legacy, built to your design.</h2>
          </div>
          <div className="side">
            Mausoleum plots are sold as land only unless bundled into a construction package. Bring your own architect, or work with ours — either way, the plot and design are yours to shape.
          </div>
        </div>

        <h3 className="cat-head fade-up">Plot only</h3>
        <div className="tiers">
          {MAUSOLEUM_PLOTS.map((m, i) =>
          <div className="tier fade-up" key={m.size} style={{ '--stagger': i }}>
              <Photo label={`${m.size} — land only`} scene="mausoleum" items={[{ label: m.size, caption: m.size }]} />
              <div>
                <h3>{m.size}</h3>
                <div className="desc">{m.desc}</div>
              </div>
              <div className="price-row">
                <div>
                  <div className="from">{m.area}</div>
                  <div className="price" style={{ fontSize: 26 }}>{fmtRange(m.low, m.high)}</div>
                </div>
              </div>
              <a href="#brochure" className="btn btn-primary">Request a quote →</a>
            </div>
          )}
        </div>

        <h3 className="cat-head fade-up" style={{ marginTop: 36 }}>All-inclusive construction packages</h3>
        <div className="tiers">
          {MAUSOLEUM_PACKAGES.map((m, i) =>
          <div className="tier fade-up" key={m.size} style={{ '--stagger': i }}>
              <Photo label={m.size} scene="mausoleum-row" items={[{ label: m.size, caption: m.size }]} />
              <div>
                <h3>{m.size}</h3>
                <div className="desc">{m.desc}</div>
              </div>
              <div className="price-row">
                <div>
                  <div className="from">{m.area}</div>
                  <div className="price" style={{ fontSize: 26 }}>{fmtRange(m.low, m.high)}</div>
                </div>
              </div>
              <a href="#brochure" className="btn btn-primary">Request a quote →</a>
            </div>
          )}
        </div>

        <div className="calc-card fade-up" style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
            <div style={{ maxWidth: 480 }}>
              <span className="eyebrow">Two-Story Mausoleum</span>
              <h3 style={{ fontSize: 24, margin: '10px 0' }}>{TWO_STORY_MAUSOLEUM.area}</h3>
              <p style={{ color: 'var(--ink-2)' }}>{TWO_STORY_MAUSOLEUM.desc}</p>
              <p className="small" style={{ marginTop: 12 }}>Payment plans available with a surcharge over 1, 2, 3, or 5 years.</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="calc-row-head"><label>Spot cash</label></div>
              <div className="price" style={{ fontSize: 30 }}>{fmtRange(TWO_STORY_MAUSOLEUM.low, TWO_STORY_MAUSOLEUM.high)}</div>
              <a href="#brochure" className="btn btn-gold" style={{ marginTop: 14 }}>Request a consultation →</a>
            </div>
          </div>
        </div>
      </div>
    </section>);

}

/* ---------- Investment ---------- */
function Investment() {
  return (
    <section className="block invest" id="invest">
      <div className="wrap">
        <div className="section-head fade-up">
          <div>
            <span className="eyebrow">Investment angle</span>
            <h2 style={{ marginTop: 18 }}>The only real estate that almost always goes up.</h2>
          </div>
          <div className="side">
            Memorial park lots in the Philippines have outpaced inflation every year since 2012. Many of our investor-clients buy 3–5 lots at a time for resale or family transfer.
          </div>
        </div>
        <div className="invest-grid">
          <div className="chart-card fade-up">
            <h4>Garden Lawn Lot · Price history</h4>
            <div className="chart-meta">Garden Lawn section · 2014 → 2026 · per lot, PHP</div>
            <AppreciationChart />
            <div className="invest-stats">
              <div className="invest-stat">
                <div className="num">+158%</div>
                <div className="lbl">Total appreciation, 2014–2026</div>
              </div>
              <div className="invest-stat">
                <div className="num">10.4%</div>
                <div className="lbl">Compounded annual growth</div>
              </div>
            </div>
          </div>
          <div className="fade-up">
            <h3 className="display" style={{ fontSize: 32, color: '#f6f1e8', marginBottom: 18, lineHeight: 1.15 }}>
              Three reasons resellers buy here.
            </h3>
            <ol style={{ padding: 0, listStyle: 'none', margin: 0 }}>
              {[
              ['Land scarcity.', 'Palawan zoning makes new memorial parks effectively impossible. Supply is fixed; demand grows with population.'],
              ['Transferable title.', 'Every lot comes with a Contract to Sell that can be assigned to any third party for a flat ₱2,500 admin fee.'],
              ['Resale assistance.', 'Our office connects sellers with at-need families directly — most lots resell in under 45 days.']].
              map(([head, body], i) =>
              <li key={i} style={{ display: 'flex', gap: 18, padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
                  <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--gold)', color: '#1f1607', flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  fontFamily: 'Newsreader, serif', fontSize: 18
                }}>{i + 1}</div>
                  <div>
                    <strong style={{ fontFamily: 'Newsreader, serif', fontSize: 20, color: '#f6f1e8', display: 'block', marginBottom: 4 }}>{head}</strong>
                    <span style={{ color: '#b6ad97', fontSize: 14 }}>{body}</span>
                  </div>
                </li>
              )}
            </ol>
            <a href="#brochure" className="btn btn-gold" style={{ marginTop: 28 }}>Get the investor pack</a>
          </div>
        </div>
      </div>
    </section>);

}

function AppreciationChart() {
  // 2014–2026 garden lot price (PHP, thousands)
  const data = [33, 36, 40, 45, 51, 57, 62, 66, 70, 74, 78, 82, 85];
  const years = ['\u201914', '\u201915', '\u201916', '\u201917', '\u201918', '\u201919', '\u201920', '\u201921', '\u201922', '\u201923', '\u201924', '\u201925', '\u201926'];
  const W = 460,H = 220,pad = { l: 36, r: 12, t: 10, b: 26 };
  const max = Math.max(...data) * 1.1;
  const xs = data.map((_, i) => pad.l + i / (data.length - 1) * (W - pad.l - pad.r));
  const ys = data.map((v) => H - pad.b - v / max * (H - pad.t - pad.b));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ');
  const area = `${path} L ${xs[xs.length - 1]} ${H - pad.b} L ${xs[0]} ${H - pad.b} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) =>
      <line key={i}
      x1={pad.l} x2={W - pad.r}
      y1={pad.t + p * (H - pad.t - pad.b)} y2={pad.t + p * (H - pad.t - pad.b)}
      stroke="rgba(255,255,255,.08)" strokeWidth="1" />
      )}
      {/* y labels */}
      {[max, max * 0.75, max * 0.5, max * 0.25, 0].map((v, i) =>
      <text key={i}
      x={pad.l - 8} y={pad.t + i / 4 * (H - pad.t - pad.b) + 4}
      textAnchor="end" fill="#8c8473" fontSize="9" fontFamily="JetBrains Mono, monospace">
          {Math.round(v)}k
        </text>
      )}
      {/* area */}
      <defs>
        <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#b08544" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#b08544" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#g1)" />
      <path d={path} stroke="#b08544" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* points */}
      {xs.map((x, i) =>
      <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="#b08544" />
      )}
      {/* x labels */}
      {years.map((y, i) => i % 2 === 0 &&
      <text key={i} x={xs[i]} y={H - 8} textAnchor="middle" fill="#8c8473" fontSize="9" fontFamily="JetBrains Mono, monospace">{y}</text>
      )}
    </svg>);

}

/* ---------- Pre-need vs At-need ---------- */
function PrePostNeed() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="section-head fade-up">
          <div>
            <span className="eyebrow">Pre-need vs. At-need</span>
            <h2 style={{ marginTop: 18 }}>The single best decision you can make for your family.</h2>
          </div>
          <div className="side">
            Pre-need (planning ahead) typically saves families 40–60% versus at-need pricing — and removes the financial burden during the hardest week of their lives.
          </div>
        </div>
        <div className="compare-grid">
          <div className="compare-card recommended fade-up">
            <div className="tag">Recommended · Plan ahead</div>
            <h3>Pre-Need Plan</h3>
            <div className="save">Save up to 58%</div>
            <div className="price" style={{ fontFamily: 'Newsreader, serif', fontSize: 44 }}>
              ₱85,000<span style={{ fontSize: 16, color: 'var(--ink-2)' }}> /lot</span>
            </div>
            <ul>
              <li><span className="check">✓</span> Lock today's price — protected from yearly increases</li>
              <li><span className="check">✓</span> 0–10% down payment, terms up to 60 months</li>
              <li><span className="check">✓</span> Transferable to any family member or third party</li>
              <li><span className="check">✓</span> Full refund within 30 days of reservation</li>
              <li><span className="check">✓</span> Choice of any open section, including premium blocks</li>
            </ul>
          </div>
          <div className="compare-card fade-up">
            <div className="tag">When the time comes</div>
            <h3>At-Need Pricing</h3>
            <div style={{ height: 28 }}></div>
            <div className="price" style={{ fontFamily: 'Newsreader, serif', fontSize: 44 }}>
              ₱195,000<span style={{ fontSize: 16, color: 'var(--ink-2)' }}> /lot, est. 2030</span>
            </div>
            <ul>
              <li>Same lot, future market price</li>
              <li>Full payment due within 48 hours</li>
              <li>Limited to remaining available sections</li>
              <li>Often during an emotionally difficult week</li>
              <li>Premium blocks usually unavailable</li>
            </ul>
          </div>
        </div>
      </div>
    </section>);

}

/* ---------- Gallery ---------- */
function Gallery() {
  const tiles = [
  'main entrance arch — golden hour, 16:10',
  'lake of remembrance — reflection, 4:5',
  'chapel of light — interior, 1:1',
  'family estate pathway — 1:1',
  'mausoleum row — heritage, 16:10',
  'aerial — full park map, 16:10'];
  const scenes = ['entrance', 'lake', 'chapel-facade', 'family-pathway', 'mausoleum-row', 'aerial-map'];

  return (
    <section className="block" id="gallery">
      <div className="wrap">
        <div className="section-head fade-up">
          <div>
            <span className="eyebrow">The park</span>
            <h2 style={{ marginTop: 18 }}>25 hectares between the river and the gardens.</h2>
          </div>
          <div className="side">
            Designed by landscape architect Maria Suarez (Manila, 1998). Every block opens to either the lake, the chapel, or the western treeline.
          </div>
        </div>
        <div className="gallery-grid">
          {tiles.map((t, i) =>
          <Photo
            key={i}
            label={t}
            scene={scenes[i]}
            className="fade-up"
            style={{ '--stagger': i }}
            items={tiles.map((label) => ({ label, caption: 'Golden Harmonic · the park' }))}
            index={i} />

          )}
        </div>
      </div>
    </section>);

}

/* ---------- About ---------- */
function About() {
  return (
    <section className="block" id="about">
      <div className="wrap">
        <div className="about-grid">
          <Photo aspect="aspect-tall" className="fade-up" label="founders portrait — 1998, sepia 3:4"
            items={[{ label: 'founders portrait — 1998, sepia 3:4', caption: 'The Mañalac family, 1998' }]} />
          <div className="fade-up">
            <span className="eyebrow">About Golden Harmonic</span>
            <h2 style={{ margin: '18px 0 24px', fontSize: 'clamp(30px, 3.5vw, 44px)' }}>
              A family park, built by a Palawan family, for Palawan families.
            </h2>
            <p>
              Golden Harmonic was founded in 1998 by the Mañalac family on a single hectare of lakeside land in Palawan. Twenty-eight years and twelve thousand families later, we still answer the phone ourselves.
            </p>
            <p>
              Every plot we sell contributes to a perpetual care fund — independently audited each year — which guarantees that the gardens you walk through today will look exactly the same in fifty years.
            </p>
            <p>
              We welcome families of every faith. Dedicated sections are available for Catholic, Christian, Muslim, and Chinese-Filipino burial customs.
            </p>
            <div className="faiths">
              {['Catholic section', 'Christian section', 'Muslim section', 'Chinese-Filipino section', 'Non-denominational'].map((f) =>
              <span className="faith-chip" key={f}>{f}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>);

}

/* ---------- FAQ ---------- */
function FAQ() {
  const qs = [
  ['Can I transfer my lot to someone else?', 'Yes. Every plot is sold via a Contract to Sell that is freely transferable. We charge a flat ₱2,500 administrative fee to process the transfer.'],
  ['What does "perpetual care" actually mean?', 'A portion of every lot sale is deposited into an independently-audited trust fund. The fund earns interest in perpetuity and pays for landscaping, security, drainage, and structural maintenance — forever, regardless of ownership changes.'],
  ['What if I move to another province?', 'Your contract is location-independent. You can transfer your reservation to another family member, sell it through our office, or have the lot redeemed for a credit toward funeral services at any partner provider.'],
  ['Is there a refund if I change my mind?', 'Yes. Full refund within 30 days of reservation, less a 5% processing fee. After 30 days, paid principal can be converted to credit, applied to another lot, or sold via our resale program.'],
  ['Do you accept all religions?', 'Yes. We have dedicated sections for Catholic, Christian, Muslim, and Chinese-Filipino burial customs, plus a non-denominational area. Our chapel can be used for any rite.'],
  ['Can I see the park before buying?', 'Of course — and we encourage it. We offer free site visits 7 days a week, with pickup included within Palawan.'],
  ['How does the investment / resale program work?', 'Our resale office matches sellers with at-need families. There is no upfront cost — we collect a 6% commission only when the lot resells. Most lots clear in under 45 days.'],
  ['Is a down payment required?', 'No. None of our payment plans require a down payment — start with spot cash, or any of the 1, 2, 3, or 5-year installment terms.'],
  ['What happens if I miss a payment?', 'A 2% monthly penalty applies to late payments on installment plans. Contact us as early as possible if you expect to be late — we can usually work out a short extension.'],
  ['Can I pay off my plan early?', 'Yes — early payment discounts may be available. Ask your counselor for current terms when you\'re ready to settle the balance.'],
  ['Do I have to buy a mausoleum construction package?', 'No. Mausoleum plots are sold as land only unless you choose one of our all-inclusive construction packages. You\'re free to bring your own architect or contractor, or work with ours.']];

  return (
    <section className="block" id="faq">
      <div className="wrap">
        <div className="section-head fade-up">
          <div>
            <span className="eyebrow">Common questions</span>
            <h2 style={{ marginTop: 18 }}>Everything families ask before reserving.</h2>
          </div>
          <div className="side">
            Don't see your question? Call us at <a href="tel:+639171234567" style={{ color: 'var(--accent)', fontWeight: 600 }}>+63 917 123 4567</a> or request the full price list — it includes a 20-page Q&A booklet.
          </div>
        </div>
        <div className="faq-grid fade-up">
          {qs.map(([q, a], i) =>
          <details className="faq-item" key={i}>
              <summary>
                <span>{q}</span>
                <span className="toggle">+</span>
              </summary>
              <div className="answer">{a}</div>
            </details>
          )}
        </div>
      </div>
    </section>);

}

/* ---------- Brochure / contact form ---------- */
function Brochure({ tiers = [] }) {
  const [sent, setSent]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [form, setForm]     = useState({
    firstName: '', lastName: '', email: '', phone: '',
    interest: 'Pre-need (planning ahead)', planId: ''
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const chosenPlan = tiers.find(t => t.id === form.planId);
  const planImageFile = (planId) => `plot-${planId}.png`;
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (window.db) {
        const ts   = firebase.firestore.FieldValue.serverTimestamp();
        const base = {
          firstName:         form.firstName,
          lastName:          form.lastName,
          fullName:          `${form.firstName} ${form.lastName}`,
          email:             form.email,
          phone:             form.phone,
          interest:          form.interest,
          source:            'website',
          createdAt:         ts,
          ...(chosenPlan ? { planId: chosenPlan.id, planName: chosenPlan.name, planPrice: chosenPlan.price } : {})
        };
        // 1. Save inquiry
        const inquiryRef = await window.db.collection('inquiries').add({
          ...base,
          type:   'brochure_request',
          status: 'new'
        });
        // 2. Save customer / lead
        await window.db.collection('customers').add({
          ...base,
          status:     'lead',
          inquiryIds: [inquiryRef.id],
          ...(chosenPlan ? {
            interestedPlanId:    chosenPlan.id,
            interestedPlanName:  chosenPlan.name,
            interestedPlanPrice: chosenPlan.price
          } : {})
        });
      }

      // 3. Send the customer a confirmation email (best-effort — if EmailJS
      // isn't configured yet, this just quietly does nothing so the form
      // still works while you're setting it up).
      if (window.emailjs && window.EMAILJS_CONFIG && window.EMAILJS_CONFIG.PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
        emailjs.send(window.EMAILJS_CONFIG.SERVICE_ID, window.EMAILJS_CONFIG.TEMPLATE_ID, {
          to_email:   form.email,
          first_name: form.firstName,
          last_name:  form.lastName,
          interest:   form.interest,
          phone:      form.phone,
          plan_name:  chosenPlan ? chosenPlan.name : 'Not chosen yet',
          plan_price: chosenPlan ? fmt(chosenPlan.price) : '—',
          plan_image: chosenPlan ? `${window.location.origin}/${planImageFile(chosenPlan.id)}` : ''
        }).catch(err => console.error('[GH] Email send error:', err));
      }

      setSent(true);
    } catch (err) {
      console.error('[GH] Save error:', err);
      setError('Could not send your request. Please call us at +63 917 123 4567.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="brochure" id="brochure">
      <div className="wrap brochure-grid">
        <div className="fade-up">
          <span className="eyebrow">Get the full price list</span>
          <h2 style={{ marginTop: 18 }}>The complete 24-page brochure — yours in under a minute.</h2>
          <p className="lede">
            Send us your details and we'll email the full price list with every section, every plan, and current promos. No salesperson will call unless you ask.
          </p>
          <div className="perks">
            <div><span className="ico">1</span><span><strong>Full price tables</strong> for every garden section.</span></div>
            <div><span className="ico">2</span><span><strong>All payment plan options</strong> with sample computations.</span></div>
            <div><span className="ico">3</span><span><strong>20-page Q&A booklet</strong> covering transfers, refunds, and resale.</span></div>
            <div><span className="ico">4</span><span><strong>Free 7-day reservation hold</strong> on any plot you choose.</span></div>
          </div>
        </div>
        <form className="form-card fade-up" onSubmit={submit}>
          {sent ? (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)',
                color: 'var(--accent-ink)', margin: '0 auto 20px',
                display: 'grid', placeItems: 'center', fontSize: 30
              }}>✓</div>
              <h3 style={{ marginBottom: 8 }}>Brochure on its way.</h3>
              <p style={{ color: 'var(--ink-2)', fontSize: 14, marginBottom: 24 }}>
                Check your inbox in the next 5 minutes. We've also reserved a 7-day hold on any plot you're interested in — just reply to the email to claim it.
              </p>

              <div style={{
                textAlign: 'left', border: '1px solid var(--line)', borderRadius: 12,
                overflow: 'hidden', background: 'var(--card)'
              }}>
                {chosenPlan && (
                  <div className="ph" style={{ aspectRatio: '16/7', margin: 0, borderRadius: 0 }}>
                    <Scene variant={chosenPlan.id} />
                  </div>
                )}
                <div style={{ padding: 18 }}>
                  <div className="label" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 10 }}>
                    Your summary
                  </div>
                  <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--ink-2)' }}>Plot</span>
                      <strong>{chosenPlan ? chosenPlan.name : 'Not chosen yet'}</strong>
                    </div>
                    {chosenPlan && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--ink-2)' }}>Spot cash price</span>
                        <strong>{fmt(chosenPlan.price)}</strong>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--ink-2)' }}>Interested in</span>
                      <strong>{form.interest}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--ink-2)' }}>Name</span>
                      <strong>{form.firstName} {form.lastName}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--ink-2)' }}>Email</span>
                      <strong>{form.email}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--ink-2)' }}>Mobile</span>
                      <strong>{form.phone}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <h3>Request the price list</h3>
              <div className="form-sub">Free · No payment required · No salesperson unless you ask</div>
              <div className="field-row">
                <div className="field">
                  <label>First name</label>
                  <input type="text" required placeholder="Maria"
                    value={form.firstName} onChange={set('firstName')} />
                </div>
                <div className="field">
                  <label>Last name</label>
                  <input type="text" required placeholder="Santos"
                    value={form.lastName} onChange={set('lastName')} />
                </div>
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" required placeholder="maria@example.com"
                  value={form.email} onChange={set('email')} />
              </div>
              <div className="field">
                <label>Mobile number</label>
                <input type="tel" required placeholder="+63 917 ..."
                  value={form.phone} onChange={set('phone')} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Which plot interests you?</label>
                  <select value={form.planId} onChange={set('planId')}>
                    <option value="">Not sure yet — send general info</option>
                    {tiers.map(t => (
                      <option key={t.id} value={t.id}>{t.name} — {fmt(t.price)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>I'm interested in</label>
                  <select value={form.interest} onChange={set('interest')}>
                    <option>Pre-need (planning ahead)</option>
                    <option>At-need (immediate)</option>
                    <option>Investment / resale</option>
                    <option>Just exploring</option>
                  </select>
                </div>
              </div>
              {error && (
                <p style={{ color: 'var(--terracotta)', fontSize: 13, marginBottom: 8, fontWeight: 500 }}>
                  ⚠ {error}
                </p>
              )}
              <button className="btn btn-primary" type="submit" disabled={saving}
                style={{ opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Sending…' : 'Send me the price list →'}
              </button>
              <p className="small" style={{ marginTop: 14, textAlign: 'center' }}>
                We respect your privacy. Your info is never shared.
              </p>
            </>
          )}
        </form>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="grid">
          <div>
            <div className="brand" style={{ marginBottom: 18 }}>
              <div className="brand-mark" style={{ background: 'var(--gold)', color: '#1f1607' }}>G</div>
              <div className="brand-text">
                <div className="name">Golden Harmonic</div>
                <div className="sub">Memorial Park · Palawan</div>
              </div>
            </div>
            <p style={{ fontSize: 14, color: '#b6ad97', maxWidth: 320 }}>
              A family-owned memorial park in Palawan — caring for families since 1998.
            </p>
          </div>
          <div>
            <h4>Plots</h4>
            <ul>
              <li><a href="#tiers">Garden Lawn Lots</a></li>
              <li><a href="#tiers">Family Estates</a></li>
              <li><a href="#tiers">Mausoleum Suites</a></li>
              <li><a href="#tiers">Columbarium Niches</a></li>
            </ul>
          </div>
          <div>
            <h4>Services</h4>
            <ul>
              <li><a href="#plans">Payment Plans</a></li>
              <li><a href="#invest">Investment</a></li>
              <li><a href="#">Funeral services</a></li>
              <li><a href="#">Venue rental</a></li>
            </ul>
          </div>
          <div>
            <h4>Visit</h4>
            <ul>
              <li><a href="#brochure">Palawan · 25 ha</a></li>
              <li><a href="tel:+639171234567">+63 917 123 4567</a></li>
              <li><a href="mailto:hello@goldenharmonic.ph">hello@goldenharmonic.ph</a></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <div>© 2026 Golden Harmonic Memorial Park, Inc. · DHSUD LTS-2018-0421 · SEC CS201801234</div>
          <div>Privacy · Terms · Perpetual Care Trust Report</div>
        </div>
      </div>
    </footer>);

}

/* ---------- Tweaks panel ---------- */
function Tweaks({ t, setTweak, priceMult }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Color palette">
        <TweakColor
          label="Theme"
          value={t.palette}
          onChange={(v) => setTweak('palette', v)}
          options={PALETTE_OPTIONS} />

      </TweakSection>
      <TweakSection label="Pricing">
        <TweakSlider
          label="Price level"
          value={t.priceMultiplier}
          onChange={(v) => setTweak('priceMultiplier', v)}
          min={50} max={200} step={5}
          unit="%" />

        <div style={{ fontSize: 11, color: 'rgba(41,38,27,.55)', marginTop: 4, padding: '0 4px', lineHeight: 1.6, fontFamily: 'JetBrains Mono, monospace' }}>
          Regular Plot · {fmt(60000 * priceMult)}<br />
          Family Vault · {fmt(105000 * priceMult)}<br />
          Corner Prime Garden · {fmt(115000 * priceMult)}
        </div>
      </TweakSection>
      <TweakSection label="Sections">
        <TweakToggle
          label="Show investment section"
          value={t.showInvestment}
          onChange={(v) => setTweak('showInvestment', v)} />

      </TweakSection>
    </TweaksPanel>);

}

/* ---------- Mount ---------- */
ReactDOM.createRoot(document.getElementById('root')).render(<App />);