// The chart revealed at landfall: your track from Point Nemo, drawn over the real coastlines.
export function drawVoyageChart(canvas, land, voyage) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pts = voyage.track.map(([, lat, lng]) => [lng, lat]);
  if (voyage.landfall) pts.push([voyage.landfall.lng, voyage.landfall.lat]);
  // Unwrap longitudes so a track across the antimeridian stays continuous
  for (let i = 1; i < pts.length; i++) {
    while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360;
    while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360;
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = Math.max(4, (x1 - x0) * 0.25, (y1 - y0) * 0.25);
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const midLat = (y0 + y1) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const sx = (W - 32) / ((x1 - x0) * kx), sy = (H - 32) / (y1 - y0);
  const s = Math.min(sx, sy);
  const ox = (W - (x1 - x0) * kx * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  const P = (lng, lat) => [ox + (lng - x0) * kx * s, oy + (y1 - lat) * s];

  const css = getComputedStyle(canvas);
  const ink = css.getPropertyValue('--chart-ink').trim() || '#1b1d1f';
  const landCol = css.getPropertyValue('--chart-land').trim() || '#cfc8b8';
  const grid = css.getPropertyValue('--chart-grid').trim() || 'rgba(27,29,31,0.12)';

  ctx.clearRect(0, 0, W, H);
  // Graticule every 5 degrees
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.font = '10px Figtree, sans-serif';
  ctx.fillStyle = grid;
  const labelCol = css.getPropertyValue('--chart-label').trim() || 'rgba(27,29,31,0.5)';
  const wrapL = (v) => ((((v + 180) % 360) + 360) % 360) - 180;
  for (let lng = Math.ceil(x0 / 5) * 5; lng <= x1; lng += 5) {
    const [px] = P(lng, 0);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    const L = wrapL(lng);
    ctx.fillStyle = labelCol;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.abs(L)}°${L < 0 ? 'W' : L > 0 ? 'E' : ''}`, px, H - 6);
  }
  for (let lat = Math.ceil(y0 / 5) * 5; lat <= y1; lat += 5) {
    const [, py] = P(0, lat);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    ctx.fillStyle = labelCol;
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.abs(lat)}°${lat < 0 ? 'S' : lat > 0 ? 'N' : ''}`, 6, py - 4);
  }
  ctx.textAlign = 'left';
  // Coastlines in view
  ctx.fillStyle = landCol;
  for (const p of land.polys) {
    for (const off of [-360, 0, 360]) {
      const [bx0, by0, bx1, by1] = p.bbox;
      if (bx1 + off < x0 || bx0 + off > x1 || by1 < y0 || by0 > y1) continue;
      ctx.beginPath();
      const n = p.pts.length / 2;
      for (let k = 0; k < n; k++) {
        const [px, py] = P(p.pts[k * 2] + off, p.pts[k * 2 + 1]);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // Tiny islands still deserve a dot
      const [cx, cy] = P((bx0 + bx1) / 2 + off, (by0 + by1) / 2);
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }
  }
  // Track
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.8;
  ctx.setLineDash([]);
  ctx.beginPath();
  pts.forEach(([x, y], i) => { const [px, py] = P(x, y); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
  ctx.stroke();
  // In navigator mode, the course you reckoned, dashed beside the one you really sailed
  if (voyage.nav && voyage.est && voyage.est.track.length > 1) {
    const ep = voyage.est.track.map(([, la, lo]) => [lo, la]);
    for (let i = 1; i < ep.length; i++) {
      while (ep[i][0] - ep[i - 1][0] > 180) ep[i][0] -= 360;
      while (ep[i][0] - ep[i - 1][0] < -180) ep[i][0] += 360;
    }
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ep.forEach(([x, y], i) => { const [px, py] = P(x, y); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.stroke();
    ctx.setLineDash([]);
    const [lx, ly] = P(ep[ep.length - 1][0], ep[ep.length - 1][1]);
    ctx.fillText('Where you reckoned you were', lx + 8, ly + 4);
  }
  const [sx0, sy0] = P(pts[0][0], pts[0][1]);
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.arc(sx0, sy0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillText('Point Nemo', sx0 + 8, sy0 + 4);
  const last = pts[pts.length - 1];
  const [ex, ey] = P(last[0], last[1]);
  ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.stroke();
}
