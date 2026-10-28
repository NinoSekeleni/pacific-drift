import fs from 'fs';
import * as topo from 'topojson-client';
const root = '/home/claude/pacific-drift/node_modules/';
const land = JSON.parse(fs.readFileSync(root+'world-atlas/land-10m.json'));
const geo = topo.feature(land, land.objects.land);
let polys = [];
for (const f of geo.features) { const g=f.geometry; if (g.type==='Polygon') polys.push(g.coordinates); else for (const p of g.coordinates) polys.push(p); }
console.log('polys', polys.length);
function inRing(pt, ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>pt[1])!==(yj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi))c=!c;}return c;}
function nearest(lng,lat){let best=1e9,bp=null;for(const p of polys){for(const [x,y] of p[0]){const d=Math.hypot((x-lng)*Math.cos(lat*Math.PI/180),y-lat);if(d<best){best=d;bp=p;}}}return [best*111, bp? bp[0].length:0];}
const tests={Pitcairn:[-130.10,-25.07],Henderson:[-128.32,-24.37],Ducie:[-124.79,-24.67],Oeno:[-130.74,-23.93],Easter:[-109.35,-27.12],SalaYGomez:[-105.36,-26.47],Tahiti:[-149.43,-17.65],Mangareva:[-134.97,-23.12],Rapa:[-144.33,-27.62],Raivavae:[-147.65,-23.87],Tubuai:[-149.48,-23.36],Rarotonga:[-159.78,-21.23],Galapagos:[-90.5,-0.5],JuanFernandez:[-78.83,-33.64],SanFelix:[-80.1,-26.28],Clipperton:[-109.21,10.30],Marotiri:[-143.53,-27.92]};
for (const [k,[x,y]] of Object.entries(tests)) console.log(k, nearest(x,y).map(v=>Math.round(v*10)/10));
const stars = JSON.parse(fs.readFileSync(root+'d3-celestial/data/stars.6.json'));
console.log(stars.features.length, JSON.stringify(stars.features[0]).slice(0,200));
const cl = JSON.parse(fs.readFileSync(root+'d3-celestial/data/constellations.lines.json'));
console.log(cl.features.length, JSON.stringify(cl.features[0]).slice(0,200));
const cn = JSON.parse(fs.readFileSync(root+'d3-celestial/data/constellations.json'));
console.log(cn.features.length, JSON.stringify(cn.features[0]).slice(0,300));
const mw = JSON.parse(fs.readFileSync(root+'d3-celestial/data/mw.json'));
console.log('mw', mw.features.length, mw.features.map(f=>f.id+':'+f.geometry.type+':'+f.geometry.coordinates.length).join(' '));
const sn = JSON.parse(fs.readFileSync(root+'d3-celestial/data/starnames.json'));
console.log(Object.keys(sn).length, JSON.stringify(Object.entries(sn)[0]));
