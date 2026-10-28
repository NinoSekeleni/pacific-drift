// The canoe's radio: real stations from the Radio Browser directory, received the way they would be
// from a small boat (FM by line of sight, AM further at night, shortwave from anywhere), a turnable
// antenna for direction finding, the WWVH time signal, Taupo Maritime Radio's weather, and a tape deck
// that plays a Spotify playlist.
import { distance, bearing } from './geo.js';
import { marineBulletin } from './weather.js';
import { DEFAULT_PLAYLIST } from './voyage.js';

const HOSTS = ['https://de1.api.radio-browser.info', 'https://fi1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
const BANDS = {
  SW: { min: 5.8, max: 17.9, step: 0.005, bw: 0.006, unit: 'MHz', digits: 3, label: 'Shortwave' },
  MW: { min: 530, max: 1700, step: 10, bw: 6, unit: 'kHz', digits: 0, label: 'Medium wave' },
  FM: { min: 87.5, max: 108, step: 0.1, bw: 0.09, unit: 'MHz', digits: 1, label: 'FM' },
  LIST: { label: 'Tape' }
};
// [name, frequency on this dial (MHz), origin lat, lng, verified https stream or null to look up by exact name]
const SW_BROADCASTERS = [
  ['BBC World Service', 9.41, 51.5, -0.12, 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service'],
  ['RFI Monde', 15.3, 48.85, 2.35, 'https://rfiafrique64k.ice.infomaniak.ch/rfimonde-64.mp3'],
  ['Deutsche Welle', 6.075, 50.73, 7.1, 'https://dw.audiostream.io/dw/1027/mp3/64/dw08'],
  ['ABC Radio Australia', 9.58, -33.9, 151.2, null],
  ['NHK World', 11.815, 35.7, 139.7, null]
];
const HLS_OK = (() => { try { return !!new Audio().canPlayType('application/vnd.apple.mpegurl'); } catch (e) { return false; } })();
const playable = (url) => url.startsWith('https://') && (HLS_OK || !/\.m3u8|\/hls\//i.test(url));
const WWVH = { lat: 21.99, lng: -159.76 };
const TAUPO = { lat: -38.7, lng: 176.1 };

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
function fade(t, seed) {
  const a = Math.sin(t / 7.3 + seed * 40) * 0.5 + Math.sin(t / 2.9 + seed * 17) * 0.3 + Math.sin(t / 19 + seed * 9) * 0.2;
  return 0.5 + 0.5 * a;
}
async function rb(path) {
  for (const host of HOSTS) {
    try {
      const ctl = new AbortController();
      const id = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(host + path, { signal: ctl.signal });
      clearTimeout(id);
      if (r.ok) return await r.json();
    } catch (e) { /* try the next mirror */ }
  }
  return null;
}

export function parsePlaylist(input) {
  if (!input) return null;
  const m = String(input).match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(playlist|album)[/:]([A-Za-z0-9]{10,})/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}

export function createRadio({ audio, getState, onPlaylist, toast }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('radio');
  const dial = $('dial');
  const ctx2d = dial.getContext('2d');
  const freqOut = $('radioFreq');
  const stationOut = $('radioStation');
  const meter = $('radioMeter');
  const antennaOut = $('antennaOut');
  const antennaArrow = $('antennaArrow');
  const powerBtn = $('radioPower');
  const volume = $('radioVolume');
  const listPane = $('tapePane');
  const tunerPane = $('tunerPane');
  const playlistInput = $('playlistInput');
  const stream = new Audio();
  stream.preload = 'none';

  const state = {
    open: false,
    on: false,
    band: 'SW',
    freq: { SW: 9.41, MW: 900, FM: 98.1 },
    antenna: 0, // degrees off the bow, clockwise
    stations: [],
    local: [],
    lastFetch: { lat: 999, lng: 999, t: 0 },
    fetching: false,
    current: null,
    se: 0,
    lastSecond: -1,
    speaking: null,
    nextBulletin: 0
  };

  for (let i = 0; i < 12; i++) meter.appendChild(document.createElement('i'));
  const bars = Array.from(meter.children);

  /* ----- Stations ----- */
  function fixedStations() {
    const list = [];
    for (const f of [5, 10, 15]) list.push({ id: 'wwvh' + f, name: 'WWVH time signal, Kauaʻi', band: 'SW', freq: f, kind: 'wwvh', lat: WWVH.lat, lng: WWVH.lng });
    list.push({ id: 'taupo', name: 'Taupo Maritime Radio, weather', band: 'SW', freq: 8.297, kind: 'bulletin', lat: TAUPO.lat, lng: TAUPO.lng });
    return list;
  }
  state.stations = fixedStations();

  async function loadShortwave() {
    const found = await Promise.all(SW_BROADCASTERS.map(async ([name, freq, lat, lng, fixed]) => {
      if (fixed) return { id: 'sw-' + name, name, band: 'SW', freq, kind: 'sw', url: fixed, lat, lng };
      const res = await rb(`/json/stations/search?name=${encodeURIComponent(name)}&order=clickcount&reverse=true&limit=15&hidebroken=true`);
      if (!res) return null;
      const s = res.find((r) => (r.name || '').toLowerCase().startsWith(name.toLowerCase()) && playable(r.url_resolved || r.url || ''));
      return s ? { id: 'sw-' + s.stationuuid, name, band: 'SW', freq, kind: 'sw', url: s.url_resolved || s.url, lat, lng } : null;
    }));
    for (const s of found) if (s) state.stations.push(s);
  }

  async function loadLocal(lat, lng) {
    if (state.fetching) return;
    state.fetching = true;
    const res = await rb(`/json/stations/search?has_geo_info=true&geo_lat=${lat.toFixed(3)}&geo_long=${lng.toFixed(3)}&geo_distance=2400000&hidebroken=true&order=clickcount&reverse=true&limit=150`);
    state.fetching = false;
    if (!res) return;
    const used = new Set();
    const local = [];
    for (const r of res) {
      const url = r.url_resolved || r.url || '';
      if (!playable(url)) continue;
      const sl = parseFloat(r.geo_lat), sg = parseFloat(r.geo_long);
      if (!Number.isFinite(sl) || !Number.isFinite(sg)) continue;
      const d = distance(lat, lng, sl, sg);
      if (d > 2400000) continue;
      const tagText = `${r.name} ${r.tags || ''}`.toLowerCase();
      const isAM = /\b(am|mw|medium wave)\b/.test(tagText) || /\b\d{3,4}\s?am\b/.test(tagText);
      const band = isAM ? 'MW' : 'FM';
      const B = BANDS[band];
      const slots = Math.round((B.max - B.min) / (band === 'FM' ? 0.2 : 10));
      let k = Math.floor(hashStr(r.stationuuid) * slots);
      while (used.has(band + k)) k = (k + 7) % slots;
      used.add(band + k);
      const freq = band === 'FM' ? 87.7 + k * 0.2 : 540 + k * 10;
      local.push({ id: r.stationuuid, name: (r.name || 'Unnamed station').trim().slice(0, 48), band, freq, kind: 'local', url, lat: sl, lng: sg, country: r.country });
    }
    state.local = local;
  }

  /* ----- Reception ----- */
  function reception(st, s, t, night) {
    const d = distance(s.lat, s.lng, st.lat, st.lng);
    const brg = bearing(s.lat, s.lng, st.lat, st.lng);
    const rel = ((brg - (s.heading + state.antenna)) * Math.PI) / 180;
    const directional = 0.18 + 0.82 * Math.abs(Math.cos(rel));
    const seed = hashStr(st.id);
    let strength;
    if (st.kind === 'local' && st.band === 'FM') strength = Math.exp(-((d / 140000) ** 3)) * directional;
    else if (st.kind === 'local') {
      const R = night ? 2000000 : 340000;
      strength = Math.exp(-((d / R) ** 2)) * directional * (night ? 0.55 + 0.45 * fade(t, seed) : 1);
    } else if (st.kind === 'wwvh') strength = (0.18 + 0.72 * Math.exp(-((d / 9000000) ** 2))) * (0.55 + 0.45 * fade(t, seed)) * (0.8 + 0.2 * Math.abs(Math.cos(rel)));
    else if (st.kind === 'bulletin') strength = (0.2 + 0.65 * Math.exp(-((d / 7000000) ** 2))) * (0.55 + 0.45 * fade(t, seed)) * (0.8 + 0.2 * Math.abs(Math.cos(rel)));
    else strength = (0.22 + (night ? 0.28 : 0.12)) * (0.4 + 0.6 * fade(t, seed)) * (0.85 + 0.15 * Math.abs(Math.cos(rel)));
    return Math.min(1, strength);
  }

  function tuneMatch(st) {
    const B = BANDS[st.band];
    const df = (state.freq[st.band] - st.freq) / B.bw;
    return Math.exp(-df * df);
  }

  /* ----- Dial ----- */
  function drawDial() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = dial.clientWidth, h = dial.clientHeight;
    if (dial.width !== Math.round(w * dpr)) { dial.width = Math.round(w * dpr); dial.height = Math.round(h * dpr); }
    const c = ctx2d;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const B = BANDS[state.band];
    if (!B.unit) return;
    const css = getComputedStyle(panel);
    const ink = css.getPropertyValue('--radio-ink').trim() || '#e9e5dc';
    const faint = css.getPropertyValue('--radio-faint').trim() || 'rgba(233,229,220,0.35)';
    const x = (f) => 8 + ((f - B.min) / (B.max - B.min)) * (w - 16);
    c.strokeStyle = faint;
    c.fillStyle = faint;
    c.lineWidth = 1;
    c.font = '10px Figtree, sans-serif';
    c.textAlign = 'center';
    const major = state.band === 'SW' ? 1 : state.band === 'MW' ? 100 : 2;
    const minor = state.band === 'SW' ? 0.25 : state.band === 'MW' ? 20 : 0.5;
    for (let f = Math.ceil(B.min / minor) * minor; f <= B.max + 1e-6; f += minor) {
      const isMajor = Math.abs(f / major - Math.round(f / major)) < 1e-6;
      c.beginPath();
      c.moveTo(x(f) + 0.5, h - 6);
      c.lineTo(x(f) + 0.5, h - (isMajor ? 18 : 11));
      c.stroke();
      if (isMajor) c.fillText(state.band === 'MW' ? String(Math.round(f)) : String(Math.round(f)), x(f), h - 22);
    }
    // Faint marks where the strongest signals sit, as on a real dial
    const s = getState();
    for (const st of allStations()) {
      if (st.band !== state.band) continue;
      const r = reception(st, s, Date.now() / 1000, s.night);
      if (r < 0.08) continue;
      c.fillStyle = `rgba(233,229,220,${Math.min(0.5, r * 0.6)})`;
      c.fillRect(x(st.freq) - 1, 6, 2, 6);
    }
    c.strokeStyle = ink;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x(state.freq[state.band]), 3);
    c.lineTo(x(state.freq[state.band]), h - 3);
    c.stroke();
  }

  function setFreq(f) {
    const B = BANDS[state.band];
    if (!B.unit) return;
    const q = Math.round((Math.min(B.max, Math.max(B.min, f)) - B.min) / B.step) * B.step + B.min;
    state.freq[state.band] = +q.toFixed(B.digits + 1);
    freqOut.textContent = `${state.freq[state.band].toFixed(B.digits)} ${B.unit}`;
    drawDial();
  }

  let dragging = false;
  function dialFreqAt(clientX) {
    const r = dial.getBoundingClientRect();
    const B = BANDS[state.band];
    return B.min + ((clientX - r.left - 8) / (r.width - 16)) * (B.max - B.min);
  }
  dial.addEventListener('pointerdown', (e) => { dragging = true; dial.setPointerCapture(e.pointerId); setFreq(dialFreqAt(e.clientX)); });
  dial.addEventListener('pointermove', (e) => { if (dragging) setFreq(dialFreqAt(e.clientX)); });
  dial.addEventListener('pointerup', () => { dragging = false; });
  dial.addEventListener('wheel', (e) => {
    e.preventDefault();
    const B = BANDS[state.band];
    setFreq(state.freq[state.band] + Math.sign(e.deltaY || e.deltaX) * B.step * (e.shiftKey ? 1 : 4));
  }, { passive: false });
  $('tuneDown').addEventListener('click', () => nudge(-1));
  $('tuneUp').addEventListener('click', () => nudge(1));
  function nudge(dir, fine) {
    const B = BANDS[state.band];
    if (B.unit) setFreq(state.freq[state.band] + dir * B.step * (fine ? 1 : 4));
  }

  function setAntenna(a) {
    state.antenna = ((Math.round(a) % 360) + 360) % 360;
    const rel = state.antenna > 180 ? state.antenna - 360 : state.antenna;
    antennaOut.textContent = rel === 0 ? 'Pointing ahead' : `${Math.abs(rel)}° to ${rel > 0 ? 'starboard' : 'port'}`;
    antennaArrow.style.transform = `rotate(${state.antenna}deg)`;
  }
  $('antLeft').addEventListener('click', () => setAntenna(state.antenna - 10));
  $('antRight').addEventListener('click', () => setAntenna(state.antenna + 10));
  setAntenna(0);

  /* ----- Bands, power, volume ----- */
  for (const btn of panel.querySelectorAll('[data-band]')) btn.addEventListener('click', () => setBand(btn.dataset.band));
  function setBand(b) {
    state.band = b;
    for (const btn of panel.querySelectorAll('[data-band]')) btn.setAttribute('aria-pressed', String(btn.dataset.band === b));
    const isTape = b === 'LIST';
    listPane.hidden = !isTape;
    tunerPane.hidden = isTape;
    if (isTape) {
      if (!state.on) setPower(true);
      stopStream();
      stopSpeech();
      startTape();
    } else {
      pauseTape();
      setFreq(state.freq[b]);
    }
  }
  function setPower(on) {
    state.on = on;
    powerBtn.setAttribute('aria-pressed', String(on));
    powerBtn.textContent = on ? 'On' : 'Off';
    panel.classList.toggle('is-on', on);
    if (on) audio.start();
    if (!on) { stopStream(); stopSpeech(); pauseTape(); audio.setStatic(0); }
    else if (state.band === 'LIST') startTape();
  }
  powerBtn.addEventListener('click', () => setPower(!state.on));

  /* ----- Streams and speech ----- */
  function stopStream() {
    if (state.current && state.current.url) { stream.pause(); stream.removeAttribute('src'); stream.load(); }
    state.current = null;
  }
  function playStream(st) {
    if (state.current && state.current.id === st.id) return;
    stopStream();
    state.current = st;
    if (!st.url) return;
    stream.src = st.url;
    stream.volume = 0;
    stream.play().catch(() => { st.dead = true; if (state.current === st) state.current = null; });
  }
  stream.addEventListener('error', () => { if (state.current) { state.current.dead = true; state.current = null; } });
  function stopSpeech() {
    if (state.speaking && window.speechSynthesis) window.speechSynthesis.cancel();
    state.speaking = null;
  }
  function speak(text, vol, id) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.volume = Math.max(0.05, Math.min(1, vol));
    u.rate = 0.95;
    u.lang = 'en-NZ';
    u.onend = () => { if (state.speaking === id) state.speaking = null; };
    state.speaking = id;
    window.speechSynthesis.speak(u);
  }

  /* ----- Tape deck: Spotify ----- */
  let controller = null, apiLoading = false, pendingUri = null, tapeUri = null;
  function currentPlaylist() {
    const own = parsePlaylist(getState().playlist);
    return own || DEFAULT_PLAYLIST;
  }
  function ensureController(uri, autoplay) {
    if (controller) {
      if (tapeUri !== uri) { controller.loadUri(uri); tapeUri = uri; }
      if (autoplay) controller.play();
      return;
    }
    pendingUri = uri;
    if (apiLoading) return;
    apiLoading = true;
    window.onSpotifyIframeApiReady = (API) => {
      const el = document.getElementById('spotifyEmbed');
      API.createController(el, { uri: pendingUri, width: '100%', height: 152 }, (c) => {
        controller = c;
        tapeUri = pendingUri;
        if (state.band === 'LIST' && state.on) controller.play();
      });
    };
    const sc = document.createElement('script');
    sc.src = 'https://open.spotify.com/embed/iframe-api/v1';
    sc.async = true;
    sc.onerror = () => { $('tapeNote').textContent = 'Spotify could not load. Check your connection and try the tape deck again.'; apiLoading = false; };
    document.body.appendChild(sc);
  }
  function startTape() { ensureController(currentPlaylist(), true); }
  function pauseTape() { if (controller) controller.pause(); }
  $('playlistForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const uri = parsePlaylist(playlistInput.value);
    if (!uri) { $('tapeNote').textContent = 'That link is not a Spotify playlist or album. Copy the share link from Spotify and paste it here.'; return; }
    onPlaylist(playlistInput.value.trim());
    $('tapeNote').textContent = 'Your playlist is in the tape deck.';
    ensureController(uri, true);
  });
  $('playlistReset').addEventListener('click', () => {
    onPlaylist('');
    playlistInput.value = '';
    $('tapeNote').textContent = 'Back to the Pacific Drift playlist.';
    ensureController(DEFAULT_PLAYLIST, true);
  });

  /* ----- Panel ----- */
  function setOpen(open) {
    state.open = open;
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    if (open) { drawDial(); if (!state.on) setPower(true); }
  }
  $('radioClose').addEventListener('click', () => setOpen(false));

  function allStations() {
    return state.stations.concat(state.local).filter((s) => !s.dead);
  }

  /* ----- Per-frame update ----- */
  let dialTimer = 0;
  function update(dt) {
    const s = getState();
    const now = Date.now();
    if (state.on && (distance(s.lat, s.lng, state.lastFetch.lat, state.lastFetch.lng) > 40000 || now - state.lastFetch.t > 30 * 60e3)) {
      state.lastFetch = { lat: s.lat, lng: s.lng, t: now };
      loadLocal(s.lat, s.lng);
      if (!state.swLoaded) { state.swLoaded = true; loadShortwave(); }
    }
    if (!state.on || state.band === 'LIST') {
      if (state.band !== 'LIST') audio.setStatic(0);
      return;
    }
    const t = now / 1000;
    let best = null, bestSe = 0;
    for (const st of allStations()) {
      if (st.band !== state.band) continue;
      const m = tuneMatch(st);
      if (m < 0.02) continue;
      const se = reception(st, s, t, s.night) * m;
      if (se > bestSe) { bestSe = se; best = st; }
    }
    state.se += (bestSe - state.se) * Math.min(1, dt * 6);
    const vol = Number(volume.value) / 100;
    const clean = Math.min(1, state.se * 1.6);
    audio.setStatic(vol * (0.03 + 0.2 * (1 - clean)));
    if (Math.random() < dt * 10) audio.crackle(vol * 0.25 * (1 - clean * 0.7));

    if (best && bestSe > 0.05 && best.url) {
      playStream(best);
      stream.volume = Math.max(0, Math.min(1, vol * clean));
    } else if (state.current && state.current.url) {
      stopStream();
    }

    // Time signal: 1200 Hz ticks each second (none at :29 and :59), longer tone on the minute, voice at :45
    if (best && best.kind === 'wwvh' && bestSe > 0.05) {
      const sec = Math.floor(t);
      if (sec !== state.lastSecond) {
        state.lastSecond = sec;
        const ss = sec % 60;
        const level = vol * clean * 0.25;
        if (ss === 0) audio.tone(new Date(sec * 1000).getUTCMinutes() === 0 ? 1500 : 1200, 0.8, level);
        else if (ss !== 29 && ss !== 59) audio.tone(1200, 0.005, level);
        if (ss === 45 && !state.speaking) {
          const nx = new Date((sec + 15) * 1000);
          speak(`At the tone, ${nx.getUTCHours()} hours, ${nx.getUTCMinutes()} minutes, Coordinated Universal Time.`, vol * clean, 'wwvh');
        }
      }
    } else if (state.speaking === 'wwvh') stopSpeech();

    if (best && best.kind === 'bulletin' && bestSe > 0.08) {
      if (!state.speaking && now > state.nextBulletin) {
        speak(`This is Taupo Maritime Radio. ${marineBulletin(now)}`, vol * clean, 'bulletin');
        state.nextBulletin = now + 25000;
      }
    } else if (state.speaking === 'bulletin') { stopSpeech(); state.nextBulletin = 0; }

    // Readouts
    const shown = Math.round(state.se * bars.length * 1.15);
    bars.forEach((b, i) => b.classList.toggle('lit', i < shown));
    stationOut.textContent = best && bestSe > 0.12 ? best.name : bestSe > 0.04 ? 'A faint voice under the static' : state.fetching ? 'Listening across the band…' : 'Static';
    dialTimer += dt;
    if (state.open && dialTimer > 1) { dialTimer = 0; drawDial(); }
  }

  /** Keyboard while the radio is open. Returns true when handled. */
  function key(code, shift) {
    if (!state.open) return false;
    if (code === 'Comma') { nudge(-1, shift); return true; }
    if (code === 'Period') { nudge(1, shift); return true; }
    if (code === 'KeyZ') { setAntenna(state.antenna - 10); return true; }
    if (code === 'KeyX') { setAntenna(state.antenna + 10); return true; }
    return false;
  }

  setBand('SW');
  setPower(false);
  return {
    update, key, setOpen,
    toggle() { setOpen(!state.open); },
    get open() { return state.open; },
    resize: drawDial
  };
}
