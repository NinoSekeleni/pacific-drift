// The ship's log: writes itself as the voyage goes, a line for each day at sea and for the moments
// worth remembering. Kept with the voyage, so it carries across sessions and survives to landfall.
const DAY = 864e5;
const fmtPos = (lat, lng) => {
  const dm = (v) => { const a = Math.abs(v); const d = Math.floor(a); return `${d}° ${String(Math.round((a - d) * 60)).padStart(2, '0')}′`; };
  return `${dm(lat)} ${lat < 0 ? 'S' : 'N'}, ${dm(lng)} ${lng < 0 ? 'W' : 'E'}`;
};
const compass16 = (deg) => ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
const beaufort = (ms) => {
  const b = [[0.5, 'flat calm'], [1.6, 'light airs'], [3.4, 'a light breeze'], [5.5, 'a gentle breeze'], [8, 'a moderate breeze'], [10.8, 'a fresh breeze'], [13.9, 'a strong breeze'], [17.2, 'a near gale'], [20.8, 'a gale'], [24.5, 'a strong gale'], [Infinity, 'a storm']];
  return b.find(([v]) => ms < v)[1];
};

export function createLog() {
  let v = null;
  const state = { lastPrecip: 0, lastSquall: 0, lastStorm: 0, lastWindBand: -1, lastWindNote: 0 };

  function attach(voyage) {
    v = voyage;
    if (!v.log) v.log = [];
    if (!v.logMeta) v.logMeta = { day: dayOf(v.t), dist: v.dist, estDist: v.estDist || 0, windSum: 0, n: 0, maxPrecip: 0, fromSum: [0, 0] };
    if (!v.log.length) add(`Day 1. Set out alone from Point Nemo, ${fmtPos(v.lat, v.lng)}, the place in the ocean farthest from any land.`, 'day', v.start);
  }
  const dayOf = (t) => Math.max(1, Math.floor((t - v.start) / DAY) + 1);

  function add(text, kind = 'note', t = v.t) {
    if (!v) return;
    v.log.push({ t, day: dayOf(t), text, kind });
    if (v.log.length > 600) v.log.splice(1, v.log.length - 600);
  }

  /** Called every frame with the current conditions. */
  function tick(w) {
    if (!v || v.landfall) return;
    const m = v.logMeta;
    m.windSum += w.speed; m.n++;
    m.fromSum[0] += Math.sin((w.from * Math.PI) / 180); m.fromSum[1] += Math.cos((w.from * Math.PI) / 180);
    m.maxPrecip = Math.max(m.maxPrecip, w.precip);
    const day = dayOf(v.t);
    if (day > m.day) daily(day);

    // Weather worth a line
    if (w.precip > 0.35 && state.lastPrecip <= 0.35 && v.t - state.lastSquall > 45 * 60e3) {
      add(`A squall came through from the ${compass16(w.from)}, with rain hard enough to hiss on the water.`, 'weather');
      state.lastSquall = v.t;
    }
    state.lastPrecip = w.precip;
    const band = w.speed < 1.6 ? 0 : w.speed < 10.8 ? 1 : w.speed < 17.2 ? 2 : 3;
    if (band !== state.lastWindBand && v.t - state.lastWindNote > 3 * 3600e3 && state.lastWindBand !== -1) {
      if (band === 0) add('The wind died away to nothing. The sea went glassy and the canoe sat still.', 'weather');
      if (band === 2) add(`The wind rose to ${beaufort(w.speed)} from the ${compass16(w.from)}, with whitecaps all around.`, 'weather');
      if (band === 3) add(`Blowing ${beaufort(w.speed)} from the ${compass16(w.from)}. Big seas, and every wave mattered.`, 'weather');
      state.lastWindNote = v.t;
    }
    state.lastWindBand = band;
  }

  function storm() {
    if (!v || v.t - state.lastStorm < 2 * 3600e3) return;
    state.lastStorm = v.t;
    add('Lightning close by, and thunder rolling over the water.', 'weather');
  }

  function daily(day) {
    const m = v.logMeta;
    const reckon = v.nav && v.est;
    const run = reckon ? (v.estDist || 0) - (m.estDist || 0) : v.dist - m.dist;
    const avg = m.n ? m.windSum / m.n : 0;
    const from = (Math.atan2(m.fromSum[0], m.fromSum[1]) * 180) / Math.PI;
    const pos = reckon ? `By my reckoning ${fmtPos(v.est.lat, v.est.lng)}` : `Position ${fmtPos(v.lat, v.lng)}`;
    const rain = m.maxPrecip > 0.5 ? ' Heavy rain at times.' : m.maxPrecip > 0.2 ? ' Some showers.' : '';
    const since = day - m.day > 1 ? `over the last ${day - m.day} days` : 'since yesterday';
    add(`Day ${day}. ${pos}. Made ${Math.round(run / 1000)} km ${since}, heading ${compass16(v.heading)}. Wind mostly ${beaufort(avg)} from the ${compass16(from)}.${rain}`, 'day');
    Object.assign(m, { day, dist: v.dist, estDist: v.estDist || 0, windSum: 0, n: 0, maxPrecip: 0, fromSum: [0, 0] });
  }

  const heard = new Map();
  function radio(name, country) {
    if (!v) return;
    const key = name.toLowerCase();
    if (v.t - (heard.get(key) || 0) < DAY) return;
    heard.set(key, v.t);
    add(`Tuned the radio to ${name}${country ? ` from ${country}` : ''}.`, 'radio');
  }

  /** Render into a container, newest day first. */
  function render(el) {
    el.innerHTML = '';
    if (!v) return;
    const days = new Map();
    for (const e of v.log) { if (!days.has(e.day)) days.set(e.day, []); days.get(e.day).push(e); }
    const order = [...days.keys()].sort((a, b) => b - a);
    for (const d of order) {
      const sec = document.createElement('section');
      sec.className = 'log-day';
      const h = document.createElement('h3');
      const first = days.get(d)[0];
      h.textContent = `Day ${d}`;
      const date = document.createElement('span');
      date.textContent = new Date(first.t).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
      h.appendChild(date);
      sec.appendChild(h);
      for (const e of days.get(d)) {
        const p = document.createElement('p');
        p.className = `log-entry ${e.kind}`;
        const tm = document.createElement('time');
        tm.textContent = new Date(e.t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        p.append(tm, document.createTextNode(e.text.replace(/^Day \d+\. /, '')));
        sec.appendChild(p);
      }
      el.appendChild(sec);
    }
  }

  return { attach, add, tick, storm, radio, render };
}
