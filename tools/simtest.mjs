import fs from 'fs';
import { Land, distance } from '../src/geo.js';
import { newVoyage, catchUp } from '../src/voyage.js';
import { weatherAt } from '../src/weather.js';
const land = new Land(JSON.parse(fs.readFileSync(new URL('../public/data/land.json', import.meta.url))));
const t0 = Date.parse('2026-10-28T08:00:00Z');
console.log('land at nemo?', !!land.landAt(-48.88,-123.39), 'pitcairn?', land.landAt(-25.07,-130.10)?.name, 'easter?', land.landAt(-27.12,-109.35)?.name, 'tahiti?', land.landAt(-17.65,-149.43)?.name);
for (const [la,lo] of [[-48.9,-123.4],[-35,-120],[-20,-130],[-5,-130],[5,-130],[15,-150],[45,-150]]) {
  const w = weatherAt(la, lo, t0);
  console.log(la, lo, 'wind', w.speed.toFixed(1), 'from', w.from.toFixed(0), 'cover', w.cover.toFixed(2), 'precip', w.precip.toFixed(2), 'swell', w.swellH.toFixed(1));
}
// winds at nemo over 5 days
let line = '';
for (let h = 0; h < 120; h += 6) { const w = weatherAt(-48.9, -123.4, t0 + h * 3600e3); line += w.speed.toFixed(0) + '/' + w.from.toFixed(0) + ' '; }
console.log('nemo 6-hourly', line);
for (const [label, sail, heading] of [['drift', false, 0], ['sail N', true, 0], ['sail NE', true, 30]]) {
  const s = newVoyage(t0); s.sail = sail; s.heading = heading;
  const r = catchUp(s, t0 + 3 * 864e5, land);
  console.log(label, '3 days ->', s.lat.toFixed(2), s.lng.toFixed(2), 'moved', (distance(-48.8767,-123.3933,s.lat,s.lng)/1000).toFixed(0), 'km', 'logged', (s.dist/1000).toFixed(0));
}
const s = newVoyage(t0); s.sail = true; s.heading = 350;
const r = catchUp(s, t0 + 40 * 864e5, land);
console.log('40 days sail 350:', s.lat.toFixed(2), s.lng.toFixed(2), r, s.landfall);
