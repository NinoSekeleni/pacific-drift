// The launch's helm: switches, gauges, radar and chart plotter fed by the voyage itself.
// Nothing on the dash is decorative: every lit screen or needle shows game state, and a screen
// whose switch is off goes dark.
import * as T from 'three';

const NM = 1852;
export const SWITCHES = [
  {id: 'nav', label: 'Navigation lights', def: true},
  {id: 'flood', label: 'Deck floodlight', def: false},
  {id: 'cabin', label: 'Cabin light', def: false},
  {id: 'radar', label: 'Radar', def: true},
  {id: 'plotter', label: 'Chart plotter', def: true},
  {id: 'panel', label: 'Instrument lights', def: true}
];
export const RADAR_RANGE_NM = 12;

export function defaultSwitches() { return Object.fromEntries(SWITCHES.map(s => [s.id, s.def])); }

/** Head-up radar echo for a target at true bearing/distance, or null if out of range. */
export function radarEcho(bearingDeg, distanceM, headingDeg, size = .05, strength = 1, rangeNm = RADAR_RANGE_NM) {
  const r = distanceM / (rangeNm * NM);
  if (!(r < .96) || !(r >= 0)) return null;
  const rel = (bearingDeg - headingDeg) * Math.PI / 180;
  return {x: Math.sin(rel) * r, y: Math.cos(rel) * r, size, strength};
}

export function createLaunchInstruments({uniforms, getSwitches, setSwitch, document: doc = globalThis.document} = {}) {
  const canvas = doc?.createElement('canvas');
  let texture = null, ctx = null, lastDraw = -1, rpm = 0, temp = 0;
  if (canvas) {
    canvas.width = 512; canvas.height = 352;
    ctx = canvas.getContext('2d');
    texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.NoColorSpace; texture.anisotropy = 4;
    uniforms.uChart.value = texture;
  }

  function drawPlotter(v, data) {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height, sw = getSwitches();
    ctx.fillStyle = '#071521'; ctx.fillRect(0, 0, W, H);
    if (!sw.plotter) { texture.needsUpdate = true; return; }
    const cx = W * .5, cy = H * .56, scaleNm = data.scaleNm || 4, pxPerM = (H * .4) / (scaleNm * NM);
    const cosLat = Math.cos(v.lat * Math.PI / 180);
    const toXY = (lat, lng) => [cx + ((lng - v.lng) * 111320 * cosLat) * pxPerM, cy - ((lat - v.lat) * 111320) * pxPerM];
    // grid every nautical mile
    ctx.strokeStyle = 'rgba(120,170,210,.16)'; ctx.lineWidth = 1;
    const step = NM * pxPerM;
    for (let x = cx % step; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = cy % step; y < H; y += step) { if (y < 40) continue; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // nearest land, as a bearing line, when it is off the chart
    if (Number.isFinite(data.landDist) && data.landDist < 400 * NM) {
      const a = (data.landBearing || 0) * Math.PI / 180, inChart = data.landDist * pxPerM < H * .45;
      ctx.strokeStyle = 'rgba(232,206,140,.7)'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(cx, cy);
      const len = Math.min(data.landDist * pxPerM, H); ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); ctx.stroke(); ctx.setLineDash([]);
      if (inChart) { ctx.fillStyle = '#d9c48c'; ctx.beginPath(); ctx.arc(cx + Math.sin(a) * len, cy - Math.cos(a) * len, 7, 0, 7); ctx.fill(); }
    }
    // track
    const track = v.track || [];
    ctx.strokeStyle = '#5fd3ff'; ctx.lineWidth = 2; ctx.beginPath();
    let started = false;
    for (const p of track.slice(-200)) { const [x, y] = toXY(p[1], p[2]); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
    if (started) { ctx.lineTo(cx, cy); ctx.stroke(); }
    // GPS route to the next waypoint
    if (data.route?.points?.length) {
      const leg = Math.min(data.route.points.length - 1, Math.max(1, data.leg || 1)), wp = data.route.points[leg];
      const [x, y] = toXY(wp.lat, wp.lng), d = Math.hypot(x - cx, y - cy), k = Math.min(1, (H * .48) / Math.max(1, d));
      ctx.strokeStyle = '#ff5ad6'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (x - cx) * k, cy + (y - cy) * k); ctx.stroke();
    }
    // the boat and its heading vector
    const h = v.heading * Math.PI / 180;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(h);
    ctx.strokeStyle = 'rgba(255,140,40,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -Math.max(30, Math.abs(v.speed) * 22)); ctx.stroke();
    ctx.fillStyle = '#ff8a28'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(7, 9); ctx.lineTo(0, 5); ctx.lineTo(-7, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
    // readouts
    ctx.fillStyle = 'rgba(4,10,16,.85)'; ctx.fillRect(0, 0, W, 38);
    ctx.fillStyle = '#d8f0ff'; ctx.font = '600 21px system-ui,sans-serif'; ctx.textBaseline = 'middle';
    const kn = Math.abs(v.speed) * 1.944, sog = (data.sog || 0) * 1.944;
    ctx.fillText(`HDG ${String(Math.round(v.heading)).padStart(3, '0')}°`, 10, 19);
    ctx.fillText(`STW ${kn.toFixed(1)}`, 150, 19);
    ctx.fillText(`SOG ${sog.toFixed(1)} kn`, 280, 19);
    ctx.font = '500 16px system-ui,sans-serif'; ctx.fillStyle = '#9fc2d8';
    ctx.fillText(`${Math.abs(v.lat).toFixed(3)}°${v.lat < 0 ? 'S' : 'N'} ${Math.abs(v.lng).toFixed(3)}°${v.lng < 0 ? 'W' : 'E'}`, 10, H - 16);
    const right = data.route?.points?.length && data.navState ? `WPT ${(data.navState.toWaypoint / NM).toFixed(1)} nm · ${String(Math.round(data.navState.course ?? 0)).padStart(3, '0')}°` : Number.isFinite(data.landDist) ? `LAND ${(data.landDist / NM).toFixed(0)} nm` : '';
    ctx.textAlign = 'right'; ctx.fillText(right, W - 10, H - 16); ctx.fillText(`${scaleNm} nm`, W - 10, 56); ctx.textAlign = 'left';
    texture.needsUpdate = true;
  }

  return {
    texture,
    /** Per-frame: needles, LEDs, radar echoes; the plotter redraws twice a second. */
    update(dt, time, voyage, data = {}) {
      const sw = getSwitches(), throttle = data.throttle || 0, steer = data.steer || 0;
      const rpmTarget = 700 + Math.abs(throttle) * 3100;
      rpm += (rpmTarget - rpm) * (1 - Math.exp(-dt * 2.2));
      temp += ((.42 + Math.abs(throttle) * .18) - temp) * (1 - Math.exp(-dt / 40));
      const g = uniforms.uGauge.value;
      g[0] = rpm / 4000;                                   // tachometer, 0-4000 rpm
      g[1] = temp;                                         // coolant temperature
      g[2] = Math.min(1, Math.abs(voyage.speed) * 1.944 / 12); // speed log, 0-12 kn
      g[3] = (14.1 - 10) / 6;                              // charging voltage, 10-16 V
      g[4] = .5 + steer * .45;                             // rudder angle indicator
      uniforms.uSwitches.value.set(+sw.nav, +sw.flood, +sw.cabin, +sw.radar);
      uniforms.uSwitches2.value.set(+sw.plotter, +sw.panel, 0, 0);
      uniforms.uRadarOn.value = sw.radar ? 1 : 0; uniforms.uPlotterOn.value = sw.plotter ? 1 : 0;
      const echoes = uniforms.uEchoes.value; let n = 0;
      for (const e of data.echoes || []) { if (n >= echoes.length) break; echoes[n++].set(e.x, e.y, e.size, e.strength); }
      for (; n < echoes.length; n++) echoes[n].set(0, 0, 0, 0);
      if (time - lastDraw > .5) { lastDraw = time; drawPlotter(voyage, data); }
      return {rpm, temp};
    },
    toggle(id) { const sw = getSwitches(); setSwitch(id, !sw[id]); },
    get rpm() { return rpm; }
  };
}
