
import { fail } from '../lib/errors.js';

export const CUPS = ['A', 'B', 'C', 'D', 'DD', 'E', 'F'];
export const BANDS = [30, 32, 34, 36, 38, 40];

// The same engine the Fit Room page uses — one source of truth on the server.
export function computeFit({ band, cup }){
  if(!BANDS.includes(band)) fail(422, 'VALIDATION_ERROR', `Band must be one of ${BANDS.join(', ')}.`);
  const ci = CUPS.indexOf(cup);
  if(ci < 0) fail(422, 'VALIDATION_ERROR', `Cup must be one of ${CUPS.join(', ')}.`);

  const sisters = [];
  if(BANDS.includes(band - 2) && CUPS[ci + 1]) sisters.push({ band: band - 2, cup: CUPS[ci + 1], label: 'tighter band · fuller cup' });
  if(BANDS.includes(band + 2) && CUPS[ci - 1]) sisters.push({ band: band + 2, cup: CUPS[ci - 1], label: 'roomier band · lighter cup' });

  let recommendation;
  if(ci >= 4){
    recommendation = { productId: 'lune', scale: 70,
      reason: 'For fuller busts, LUNE redistributes weight through the cup wall itself — lift without a single wire.' };
  } else if(ci <= 1){
    recommendation = { productId: 'vela', scale: 34,
      reason: 'Lighter profiles get bias-cut silk that skims instead of scaffolding. VELA was cut for exactly this.' };
  } else {
    recommendation = { productId: 'aerin', scale: 50,
      reason: 'Right in the middle of the range — AERIN\'s bonded sculpt runs true and holds its shape all day.' };
  }

  return { size: `${band}${cup}`, sisters, recommendation, scale: { low: 'runs small', mid: 'true', high: 'generous' } };
}
