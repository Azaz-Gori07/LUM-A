
import { Products, Variants, Reviews, Carts, Orders, Subscribers, Outbox, Audit } from '../src/repositories/index.js';
import { id, nowIso } from '../src/lib/ids.js';

const reset = process.argv.includes('--reset');
if(reset){
  [Products, Variants, Reviews, Carts, Orders, Subscribers, Outbox, Audit].forEach(c => c.clear());
  console.log('· cleared existing data');
}
if(Products.count() && !reset){
  console.log('· products already seeded — run "npm run seed -- --reset" to start over');
  process.exit(0);
}

const BANDS = [30, 32, 34, 36, 38, 40];
const CUPS = ['A', 'B', 'C', 'D', 'DD', 'E', 'F'];
const ALL_SIZES = BANDS.flatMap(b => CUPS.map(c => `${b}${c}`));

const PRODUCT_SEED = [
  { id: 'aerin', name: 'AERIN', sub: 'The Wireless Sculpt', construction: 'bonded', priceCents: 6800,
    colorways: ['porcelain', 'rose', 'noir'],
    description: 'Bonded seams, zero wiring. A quiet architecture that lifts by cut, not by cage.' },
  { id: 'aerinlong', name: 'AERIN LONG', sub: 'The Wireless Longline', construction: 'bonded', priceCents: 8400,
    colorways: ['noir', 'porcelain'],
    description: 'The Aerin line, extended — a longline band that spreads support across the ribs instead of concentrating it.' },
  { id: 'noe', name: 'NOÉ', sub: 'The Lace Balconette', construction: 'lace', priceCents: 7400,
    colorways: ['rose', 'porcelain', 'noir'],
    description: 'Calais lace laid over a soft scaffold. Sheer where it can be, held where it must be.' },
  { id: 'lune', name: 'LUNE', sub: 'The Seamless Second-Skin', construction: 'knit', priceCents: 7200,
    colorways: ['noir', 'porcelain'],
    description: 'A nude-feel knit that disappears under everything, including expectations.' },
  { id: 'vela', name: 'VELA', sub: 'The Silk Triangle', construction: 'silk', priceCents: 7900,
    colorways: ['champagne', 'rose'],
    description: '22-momme mulberry silk, bias-cut. Barely a bra. Entirely one.' },
  { id: 'lunebody', name: 'LUNE BODY', sub: 'The Second-Skin Body', construction: 'knit', priceCents: 9800,
    colorways: ['porcelain', 'noir'],
    description: 'One piece, zero adjustments. The second-skin extended to the hips, with a silent closure.' }
];

const REVIEW_SEED = [
  ['aerin', 'Camille R.', '32C', 5, 'The first bra I\'ve ever forgotten to take off.'],
  ['lune', 'Nadia K.', '36DD', 5, 'I stopped bracing for the 3 p.m. pinch. It just never came.'],
  ['noe', 'Yuki T.', '34B', 5, 'Bought it in every colorway. Then bought backups.'],
  ['aerin', 'Priya S.', '34C', 5, 'It survived a fourteen-hour flight and a wedding in the same week.'],
  ['vela', 'Mara L.', '30B', 5, 'I dress faster now. One less decision before coffee.'],
  ['lune', 'Elena V.', '38D', 4, 'The straps took a week to settle. Since then — zero adjustments, six months in.'],
  ['noe', 'Sofia M.', '36C', 5, 'Sheer enough to feel like me, structured enough to feel held.'],
  ['aerin', 'Amara J.', '34DD', 5, 'After my surgery, wires were off the table. Support, luckily, wasn\'t.'],
  ['vela', 'Inès F.', '30B', 5, 'The silk one is basically sleepwear that passes as lingerie.'],
  ['aerin', 'Bea C.', '32C', 5, 'I checked at noon out of habit, not need.']
];

let variantCount = 0;
for(const p of PRODUCT_SEED){
  Products.insert({ ...p, sizes: ALL_SIZES, active: true, createdAt: nowIso() });
  for(const colorway of p.colorways){
    for(const size of ALL_SIZES){
      const sku = `${p.id}-${colorway}-${size}`;
      // deterministic, slightly uneven stock — some SKUs land low on purpose
      const stock = ((Number(size.slice(0, 2)) * 7 + size.length * 13 + p.priceCents) % 14) + 2;
      Variants.insert({ id: sku, sku, productId: p.id, productName: p.name, colorway, size, priceCents: p.priceCents, stock, reserved: 0 });
      variantCount++;
    }
  }
}

if(!Reviews.count()){
  REVIEW_SEED.forEach(([productId, name, size, rating, quote], i) => {
    Reviews.insert({
      id: id('rev'), productId, name, size, rating, quote,
      status: 'published',
      createdAt: new Date(Date.now() - i * 3 * 86_400_000).toISOString()
    });
  });
}

console.log(`· seeded ${PRODUCT_SEED.length} products · ${variantCount} SKUs · ${Reviews.count()} published reviews`);
console.log('· next: npm run admin   → create your admin account');
console.log('· then: npm run dev     → http://localhost:8787');
