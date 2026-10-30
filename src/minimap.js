// Mini chart: where on Earth the canoe is, with its trail, drawn over real coastlines.
import {routeSamples} from './voyage-guidance.js';
const ZOOMS = [5,25,100,400,1500,5000,14000]; // km across

export function createMinimap(canvas, land) {
  const ctx = canvas.getContext('2d');
  let zoom = 5;
  let last = 0;

  function draw(voyage,gps) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W) return;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Navigator mode plots only the dead-reckoning estimate; the true position stays hidden
    const route=gps?.route||voyage.gps?.route;const nav = voyage.nav && voyage.est&&!route;
    const lat0 = nav ? voyage.est.lat : voyage.lat, lng0 = nav ? voyage.est.lng : voyage.lng;
    const kmAcross = ZOOMS[zoom];
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const pxPerDeg = W / (kmAcross / 111.32);
    const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
    const P = (lat, lng) => [W / 2 + wrap(lng - lng0) * kx * pxPerDeg, H / 2 - (lat - lat0) * pxPerDeg];
    const halfLat = H / 2 / pxPerDeg, halfLng = W / 2 / pxPerDeg / Math.max(0.1, kx);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,13,15,0.62)';
    ctx.fillRect(0, 0, W, H);
    // Graticule
    const step = kmAcross > 6000 ? 20 : kmAcross > 1200 ? 10 : 2;
    ctx.strokeStyle = 'rgba(239,234,224,0.08)';
    ctx.lineWidth = 1;
    for (let g = Math.ceil((lng0 - halfLng) / step) * step; g <= lng0 + halfLng; g += step) {
      const [x] = P(lat0, g);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let g = Math.ceil((lat0 - halfLat) / step) * step; g <= lat0 + halfLat; g += step) {
      const [, y] = P(g, lng0);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Land
    ctx.fillStyle = 'rgba(239,234,224,0.55)';
    for (const p of land.polys) {
      const [x0, y0, x1, y1] = p.bbox;
      if (y1 < lat0 - halfLat || y0 > lat0 + halfLat) continue;
      const cx = wrap((x0 + x1) / 2 - lng0);
      const hw = Math.min(180, (x1 - x0) / 2);
      if (Math.abs(cx) - hw > halfLng) continue;
      const n = p.pts.length / 2;
      const stride = n > 4000 ? Math.ceil(n / (kmAcross > 6000 ? 1500 : 4000)) : 1;
      ctx.beginPath();
      let prev = null;
      for (let k = 0; k < n; k += stride) {
        const [px, py] = P(p.pts[k * 2 + 1], p.pts[k * 2]);
        if (prev && Math.abs(px - prev) > W) ctx.moveTo(px, py); else if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        prev = px;
      }
      ctx.closePath();
      ctx.fill();
      // Tiny islands still deserve a dot
      const [dx, dy] = P((y0 + y1) / 2, (x0 + x1) / 2);
      ctx.fillRect(dx - 1, dy - 1, 2, 2);
    }
    // Trail
    const tr = nav ? voyage.est.track : voyage.track;
    if (tr.length) {
      ctx.strokeStyle = 'rgba(239,234,224,0.9)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      tr.forEach(([, la, lo], i) => { const [x, y] = P(la, lo); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.lineTo(W / 2, H / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const [sx, sy] = P(tr[0][1], tr[0][2]);
      ctx.strokeStyle = 'rgba(239,234,224,0.9)';
      ctx.strokeRect(sx - 3, sy - 3, 6, 6);
    }
    if(route?.points?.length){
      const leg=gps?.state?.leg||route.leg||1,points=routeSamples([{lat:lat0,lng:lng0},...route.points.slice(leg)]);ctx.strokeStyle='#efce8c';ctx.lineWidth=2;ctx.beginPath();let prev=null;for(const p of points){const [x,y]=P(p.lat,p.lng);if(!prev||Math.abs(x-prev[0])>W)ctx.moveTo(x,y);else ctx.lineTo(x,y);prev=[x,y];}ctx.stroke();for(let i=leg;i<route.points.length;i++){const [x,y]=P(route.points[i].lat,route.points[i].lng);ctx.fillStyle='#f1d18f';ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();ctx.font='10px sans-serif';ctx.fillText(String(i),x+6,y-5);}
    }
    // Canoe with heading
    const h = (voyage.heading * Math.PI) / 180;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(h);
    ctx.fillStyle = '#efeae0';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(4.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-4.5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Scale bar
    const barKm = kmAcross / 4;
    const barPx = (barKm / 111.32) * pxPerDeg;
    ctx.fillStyle = 'rgba(239,234,224,0.8)';
    ctx.fillRect(10, H - 12, barPx, 2);
    ctx.font = '10px Figtree, sans-serif';
    ctx.fillText(`${barKm.toLocaleString()} km`, 10, H - 17);
  }

  return {
    update(voyage, force, gps) {
      const now = performance.now();
      if (!force && now - last < 1000) return;
      last = now;
      draw(voyage,gps);
    },
    zoom(dir) { zoom = Math.max(0, Math.min(ZOOMS.length - 1, zoom + dir)); last = 0; }
  };
}
