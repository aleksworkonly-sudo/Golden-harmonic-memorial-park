// Shared by the presale API and the payment service: what each plot number in
// the official site plan (GHMP Sintra, 3,696 plots) is, and what it costs.
// The picture data lives in /presale-plan.json (letters per plot + outlines).
const plan = require('../presale-plan.json');
// The architect's own lot numbers (per park map: VAL = Valor map, REG = Regular map, GAR = Garden map,
// FV = Family Vault map). { MAP: { '<plan lot>': architect number } }. Plots the architect map does not
// number keep their old P-code. Same file the website loads: /architect-lots.json
const arch = require('../architect-lots.json');

const LETTER_TYPE = {
  r: 'regular', v: 'valor', g: 'garden-regular', f: 'family-vault', p: 'premium', q: 'premium-valor',
  h: 'garden-premium', c: 'corner-premium', d: 'corner-premium-valor', e: 'garden-corner', m: 'mausoleum'
};
// Only about half of these are sold in the presale. Staff choose which plots on the map
// (Firestore settings/presaleValor.open = list of plot numbers); all others are held back.
const VALOR_FAMILY = ['valor', 'premium-valor', 'corner-premium-valor'];
// Not reserved online: their down payment is arranged with staff (owners to decide the terms).
const STAFF_ONLY = ['family-vault', 'mausoleum'];
const PLAN_BLOCK = 'P';            // every plot of the plan is saved under block "P"
const TOTAL = plan.t.length;        // 3,696
const LEGACY_BLOCKS = ['A', 'B', 'C', 'D']; // the earlier 40x50 test blocks; kept only so old reservations still show

// Fallback prices. Live prices come from the Firestore 'products' docs (same ids as the website).
// Types with no price here are "not open yet" until the owner sets a price in Products.
// From the owner's price list "WITH 3 TO 10 YEAR PAYMENT PLANS" (regular price per plot).
const DEFAULT_PRICES = {
  regular: 30000, premium: 42500, 'corner-premium': 47500,
  'garden-regular': 37500, 'garden-premium': 47500, 'garden-corner': 57500, 'family-vault': 105000,
  mausoleum: 2200000,
  valor: 40000, 'premium-valor': 52500, 'corner-premium-valor': 57500 // owner's decision; only plots staff switch on are sold (see VALOR_FAMILY)
};
// Pre-selling price = regular price minus this, for SPOT CASH only. Installments use the regular price.
const SPOT_DISCOUNT = {
  regular: 8000, premium: 8000, 'corner-premium': 8000, 'garden-regular': 8000, 'garden-premium': 8000,
  'garden-corner': 8000, mausoleum: 400000, valor: 8000, 'premium-valor': 8000, 'corner-premium-valor': 8000
};
// Installment total = regular price x (1 + surcharge). 3 years +20%, then +5% for every extra year, up to 10 years.
const SURCHARGE = { 3: 0.20, 4: 0.25, 5: 0.30, 6: 0.35, 7: 0.40, 8: 0.45, 9: 0.50, 10: 0.55 };
const TYPE_LABEL = {
  regular: 'Regular', premium: 'Premium', 'corner-premium': 'Corner Premium', valor: 'Valor',
  'garden-regular': 'Garden', 'garden-premium': 'Premium Garden', 'garden-corner': 'Corner Premium Garden',
  'family-vault': 'Family Vault', 'premium-valor': 'Premium Valor', 'corner-premium-valor': 'Corner Premium Valor',
  mausoleum: 'Mausoleum'
};

function typeOfPlot(lot) {
  const ch = plan.t[lot - 1];
  return ch ? LETTER_TYPE[ch] : null;
}
const ARCH_NAME = { VAL: 'Valor', REG: 'Regular', GAR: 'Garden', FV: 'Family Vault' };
const archOf = (lot) => { for (const k of Object.keys(arch)) { const n = arch[k][lot]; if (n) return { map: k, n }; } return null; };
const oldCode = (lot) => `${PLAN_BLOCK}-${String(lot).padStart(4, '0')}`;
const plotCode = (lot) => { const a = archOf(lot); return a ? `${a.map}-${a.n}` : oldCode(lot); };
// Reservations made before the architect numbers keep a stored "P-0037"; show them with the architect number too.
const relabelCode = (code) => { const m = /^P-0*(\d+)$/.exec(String(code || '')); return m ? plotCode(Number(m[1])) : code; };
// "VAL-245" -> "Valor 245" (people-friendly)
const niceCode = (code) => { const m = /^(VAL|REG|GAR|FV)-(\d+)$/.exec(String(relabelCode(code) || '')); return m ? ARCH_NAME[m[1]] + ' ' + m[2] : code; };

module.exports = { STAFF_ONLY, VALOR_FAMILY, PLAN_BLOCK, TOTAL, LEGACY_BLOCKS, DEFAULT_PRICES, SPOT_DISCOUNT, SURCHARGE, TYPE_LABEL, typeOfPlot, plotCode, relabelCode, niceCode, archOf };
