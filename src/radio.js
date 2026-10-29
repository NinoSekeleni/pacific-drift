// World Radio: live stations from every country in the Radio Browser directory, all in clear reception
// wherever the canoe is, tuned with a dial, by country or by search. The tape deck plays a Spotify playlist.
import { DEFAULT_PLAYLIST } from './voyage.js';

const HOSTS = ['https://de1.api.radio-browser.info', 'https://fi1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
const PREFS = 'pacific-drift-radio-v1';
const HLS_OK = (() => { try { return !!new Audio().canPlayType('application/vnd.apple.mpegurl'); } catch (e) { return false; } })();
const playable = (url) => url.startsWith('https://') && (HLS_OK || !/\.m3u8|\/hls\//i.test(url));


// The listener's own country, so their home stations sit at the top of the dial. Taken from the
// browser's region, or failing that its time zone.
const TZ_COUNTRY = {
  'Africa/Johannesburg': 'ZA', 'Africa/Maseru': 'LS', 'Africa/Mbabane': 'SZ', 'Africa/Windhoek': 'NA', 'Africa/Gaborone': 'BW',
  'Africa/Harare': 'ZW', 'Africa/Maputo': 'MZ', 'Africa/Lusaka': 'ZM', 'Africa/Nairobi': 'KE', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH',
  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Kampala': 'UG', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Addis_Ababa': 'ET',
  'Africa/Kigali': 'RW', 'Africa/Abidjan': 'CI', 'Africa/Dakar': 'SN', 'Africa/Tunis': 'TN', 'Africa/Algiers': 'DZ',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Lisbon': 'PT', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Athens': 'GR',
  'Europe/Istanbul': 'TR', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Moscow': 'RU', 'Europe/Bucharest': 'RO', 'Europe/Budapest': 'HU',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US',
  'America/Anchorage': 'US', 'Pacific/Honolulu': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Singapore': 'SG', 'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Bangkok': 'TH', 'Asia/Karachi': 'PK',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU',
  'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ', 'Pacific/Tahiti': 'PF'
};
function homeCountry() {
  try {
    for (const l of navigator.languages || [navigator.language]) {
      const m = /[-_]([A-Za-z]{2})$/.exec(l || '');
      if (m && !['US', 'GB'].includes(m[1].toUpperCase())) return m[1].toUpperCase();
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    for (const l of navigator.languages || []) { const m = /[-_]([A-Za-z]{2})$/.exec(l || ''); if (m) return m[1].toUpperCase(); }
  } catch (e) { /* no locale information */ }
  return null;
}
const ALIASES = { 'south africa': 'ZA', sa: 'ZA', rsa: 'ZA', mzansi: 'ZA', uk: 'GB', britain: 'GB', england: 'GB', usa: 'US', us: 'US', america: 'US', uae: 'AE', holland: 'NL' };

async function rb(path) {
  for (const host of HOSTS) {
    try {
      const ctl = new AbortController();
      const id = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(host + path, { signal: ctl.signal });
      clearTimeout(id);
      if (r.ok) return await r.json();
    } catch (e) { /* try the next mirror */ }
  }
  return null;
}

export function parsePlaylist(input) {
  if (!input) return null;
  const m = String(input).match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(playlist|album|track)[/:]([A-Za-z0-9]{10,})/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { /* storage unavailable */ }
}

export function createRadio({ audio, getState, onPlaylist, onStation }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('radio');
  const dial = $('dial');
  const ctx2d = dial.getContext('2d');
  const nameOut = $('radioStation');
  const metaOut = $('radioMeta');
  const stateOut = $('radioState');
  const listEl = $('stationList');
  const countrySel = $('countrySelect');
  const searchForm = $('stationSearch');
  const searchInput = $('stationQuery');
  const powerBtn = $('radioPower');
  const playBtn = $('radioPlay');
  const volume = $('radioVolume');
  const worldPane = $('worldPane');
  const tapePane = $('tapePane');
  const playlistInput = $('playlistInput');
  const stream = new Audio();
  stream.preload = 'none';

  const prefs = loadPrefs();
  const HOME = homeCountry();
  let countries = [];
  let listRequest = 0;
  const state = {
    open: false,
    on: false,
    mode: 'WORLD',
    list: [],
    index: -1,
    source: prefs.source || (HOME ? { type: 'country', code: HOME } : { type: 'top' }),
    loading: false,
    playing: false,
    staticUntil: 0
  };
  if (Number.isFinite(prefs.volume)) volume.value = String(prefs.volume);

  function persist() {
    const cur = state.list[state.index];
    savePrefs({ source: state.source, station: cur ? cur.id : prefs.station, volume: Number(volume.value) });
  }

  /* ----- Station lists ----- */
  function normalise(res) {
    const seen = new Set();
    const out = [];
    for (const r of res || []) {
      const url = r.url_resolved || r.url || '';
      if (!playable(url)) continue;
      const name = (r.name || '').trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: r.stationuuid,
        name: name.slice(0, 60),
        country: r.country || '',
        code: r.countrycode || '',
        tags: (r.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3).join(' · '),
        url
      });
    }
    return out;
  }

  async function loadList(source, keepStationId) {
    const request = ++listRequest;
    state.source = source;
    state.loading = true;
    setStateText('Searching the airwaves…');
    listEl.innerHTML = '';
    let res;
    const base = '&hidebroken=true&order=clickcount&reverse=true&limit=180';
    if (source.type === 'country') res = await rb(`/json/stations/search?countrycode=${encodeURIComponent(source.code)}${base}`);
    else if (source.type === 'search') {
      // A country typed into the search ("South Africa", "SA", "Kenya") brings up its stations first
      const ql = source.q.toLowerCase().trim();
      const codes = new Set();
      if (ALIASES[ql]) codes.add(ALIASES[ql]);
      if (ql.length === 2) codes.add(ql.toUpperCase());
      if (ql.length >= 3) for (const c of countries) if (c.name.toLowerCase().includes(ql)) codes.add(c.iso_3166_1);
      const byCountry = [...codes].slice(0, 3).map((code) => rb(`/json/stations/search?countrycode=${code}${base}`));
      const all = await Promise.all([
        ...byCountry,
        rb(`/json/stations/search?name=${encodeURIComponent(source.q)}${base}`),
        rb(`/json/stations/search?tag=${encodeURIComponent(ql)}${base}`)
      ]);
      res = all.flatMap((r) => r || []);
    } else res = await rb(`/json/stations/search?${base.slice(1)}`);
    if (request !== listRequest) return;
    state.loading = false;
    if (!res) {
      state.list = [];
      setStateText('The station directory could not be reached. Check your connection and try again.');
      renderList();
      drawDial();
      return;
    }
    state.list = normalise(res);
    renderList();
    let i = keepStationId ? state.list.findIndex((s) => s.id === keepStationId) : -1;
    if (i < 0) i = 0;
    if (!state.list.length) {
      setStateText(source.type === 'search' ? `No stations found for “${source.q}”.` : 'No stations found here.');
      drawDial();
      return;
    }
    state.index = i;
    drawDial();
    if (state.on && state.mode === 'WORLD') play(i);
    else showStation();
    persist();
  }

  async function loadCountries() {
    const res = await rb('/json/countries?order=stationcount&reverse=true&hidebroken=true');
    if (!res) return;
    countries = res.filter((c) => c.stationcount >= 5 && c.iso_3166_1).sort((a, b) => a.name.localeCompare(b.name));
    const opt = (c, label) => {
      const o = document.createElement('option');
      o.value = c.iso_3166_1;
      o.textContent = label || `${c.name} (${c.stationcount})`;
      return o;
    };
    // Your own country first, then every country A to Z
    const home = countries.find((c) => c.iso_3166_1 === HOME);
    if (home) {
      const g = document.createElement('optgroup');
      g.label = 'Your country';
      g.appendChild(opt(home, `${home.name} (${home.stationcount})`));
      countrySel.appendChild(g);
    }
    const g = document.createElement('optgroup');
    g.label = 'All countries';
    for (const c of countries) if (c !== home) g.appendChild(opt(c));
    countrySel.appendChild(g);
    if (state.source.type === 'country') countrySel.value = state.source.code;
  }

  function renderList() {
    listEl.innerHTML = '';
    state.list.forEach((s, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'station-row';
      b.setAttribute('aria-current', String(i === state.index));
      const n = document.createElement('span');
      n.className = 'sr-name';
      n.textContent = s.name;
      const c = document.createElement('span');
      c.className = 'sr-country';
      c.textContent = s.code || '—';
      b.append(n, c);
      b.addEventListener('click', () => { if (!state.on) setPower(true); play(i); });
      li.appendChild(b);
      listEl.appendChild(li);
    });
  }
  function markCurrent() {
    [...listEl.querySelectorAll('.station-row')].forEach((b, i) => b.setAttribute('aria-current', String(i === state.index)));
    const cur = listEl.querySelectorAll('.station-row')[state.index];
    if (cur && state.open) cur.scrollIntoView({ block: 'nearest' });
  }

  /* ----- Playback ----- */
  function setStateText(t) { stateOut.textContent = t; }
  function showStation() {
    const s = state.list[state.index];
    nameOut.textContent = s ? s.name : 'World Radio';
    metaOut.textContent = s ? [s.country, s.tags].filter(Boolean).join(' · ') : '';
    markCurrent();
  }
  function stopStream() {
    stream.pause();
    stream.removeAttribute('src');
    stream.load();
    state.playing = false;
    playBtn.textContent = 'Play';
  }
  let attempt = 0;
  function play(i, dir = 1) {
    if (!state.list.length) return;
    state.index = ((i % state.list.length) + state.list.length) % state.list.length;
    const s = state.list[state.index];
    showStation();
    drawDial();
    persist();
    stopStream();
    const my = ++attempt;
    state.staticUntil = performance.now() + 900;
    setStateText('Tuning in…');
    stream.src = s.url;
    stream.volume = Number(volume.value) / 100;
    stream.play().then(() => {
      if (my !== attempt) return;
      state.playing = true;
      playBtn.textContent = 'Pause';
      setStateText('On air');
      if (onStation) onStation(s.name, s.country);
    }).catch(() => {
      if (my !== attempt) return;
      skipDead(dir);
    });
  }
  function skipDead(dir) {
    const s = state.list[state.index];
    if (s) s.dead = true;
    const alive = state.list.filter((x) => !x.dead).length;
    if (!alive) { setStateText('None of these stations are on air right now.'); return; }
    setStateText('That station is off air. Trying the next one…');
    let j = state.index;
    do { j = (j + dir + state.list.length) % state.list.length; } while (state.list[j].dead);
    setTimeout(() => play(j, dir), 500);
  }
  stream.addEventListener('error', () => { if (state.on && state.mode === 'WORLD' && stream.getAttribute('src')) skipDead(1); });
  stream.addEventListener('waiting', () => { if (state.playing) setStateText('Buffering…'); });
  stream.addEventListener('playing', () => { setStateText('On air'); });

  function next(dir) { if (state.list.length) play(state.index + dir, dir); }
  $('radioPrev').addEventListener('click', () => { if (!state.on) setPower(true); next(-1); });
  $('radioNext').addEventListener('click', () => { if (!state.on) setPower(true); next(1); });
  playBtn.addEventListener('click', () => {
    if (!state.on) { setPower(true); return; }
    if (state.playing) { stopStream(); setStateText('Paused'); }
    else play(state.index < 0 ? 0 : state.index);
  });
  $('radioShuffle').addEventListener('click', async () => {
    if (!state.on) setPower(true);
    countrySel.value = '';
    searchInput.value = '';
    state.staticUntil = performance.now() + 1500;
    setStateText('Spinning the dial across the world…');
    const offset = Math.floor(Math.random() * 3000);
    const res = await rb(`/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=60&offset=${offset}`);
    if (!res) { setStateText('The station directory could not be reached. Check your connection and try again.'); return; }
    state.source = { type: 'top', offset };
    state.list = normalise(res).sort(() => Math.random() - 0.5);
    renderList();
    play(0);
  });
  countrySel.addEventListener('change', () => {
    searchInput.value = '';
    loadList(countrySel.value ? { type: 'country', code: countrySel.value } : { type: 'top' });
  });
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    countrySel.value = '';
    loadList({ type: 'search', q });
  });
  volume.addEventListener('input', () => { stream.volume = Number(volume.value) / 100; persist(); });

  /* ----- Dial: one mark per station in the current list ----- */
  function drawDial() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = dial.clientWidth, h = dial.clientHeight;
    if (!w) return;
    if (dial.width !== Math.round(w * dpr)) { dial.width = Math.round(w * dpr); dial.height = Math.round(h * dpr); }
    const c = ctx2d;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const css = getComputedStyle(panel);
    const ink = css.getPropertyValue('--radio-ink').trim() || '#efeae0';
    const faint = css.getPropertyValue('--radio-faint').trim() || 'rgba(239,234,224,0.38)';
    const n = state.list.length;
    c.strokeStyle = faint;
    c.lineWidth = 1;
    for (let i = 0; i <= 60; i++) {
      const x = 8 + (i / 60) * (w - 16);
      c.beginPath();
      c.moveTo(x + 0.5, h - 6);
      c.lineTo(x + 0.5, h - (i % 10 === 0 ? 20 : i % 5 === 0 ? 14 : 10));
      c.stroke();
    }
    if (!n) return;
    c.fillStyle = faint;
    for (let i = 0; i < n; i++) {
      const x = 8 + (n === 1 ? 0.5 : i / (n - 1)) * (w - 16);
      c.fillRect(x - 0.5, 6, 1, state.list[i].dead ? 3 : 7);
    }
    if (state.index >= 0) {
      const x = 8 + (n === 1 ? 0.5 : state.index / (n - 1)) * (w - 16);
      c.strokeStyle = ink;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, 3);
      c.lineTo(x, h - 3);
      c.stroke();
    }
  }
  let dragging = false, dragTimer = 0;
  function indexAt(clientX) {
    const r = dial.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left - 8) / (r.width - 16)));
    return Math.round(f * Math.max(0, state.list.length - 1));
  }
  function dialTo(i) {
    if (!state.list.length || i === state.index) return;
    state.index = i;
    showStation();
    drawDial();
    stopStream();
    state.staticUntil = performance.now() + 600;
    setStateText('Tuning…');
    clearTimeout(dragTimer);
    dragTimer = setTimeout(() => { if (state.on) play(state.index); }, 450);
  }
  dial.addEventListener('pointerdown', (e) => { if (!state.on) setPower(true); dragging = true; dial.setPointerCapture(e.pointerId); dialTo(indexAt(e.clientX)); });
  dial.addEventListener('pointermove', (e) => { if (dragging) dialTo(indexAt(e.clientX)); });
  dial.addEventListener('pointerup', () => { dragging = false; });
  dial.addEventListener('wheel', (e) => { e.preventDefault(); if (state.list.length) dialTo(((state.index + Math.sign(e.deltaY || e.deltaX)) % state.list.length + state.list.length) % state.list.length); }, { passive: false });

  /* ----- Modes and power ----- */
  for (const btn of panel.querySelectorAll('[data-mode]')) btn.addEventListener('click', () => setMode(btn.dataset.mode));
  function setMode(m) {
    state.mode = m;panel.setAttribute('aria-label',m==='TAPE'?'Spotify Walkman':'World radio');panel.querySelector('.radio-title').textContent=m==='TAPE'?'Walkman · Spotify':'Radio';
    for (const btn of panel.querySelectorAll('[data-mode]')) btn.setAttribute('aria-pressed', String(btn.dataset.mode === m));
    worldPane.hidden = m !== 'WORLD';
    tapePane.hidden = m !== 'TAPE';
    if (m === 'TAPE') {
      stopStream();
      if (!state.on) setPower(true); else startTape();
    } else {
      pauseTape();
      if (state.on && state.list.length) play(state.index < 0 ? 0 : state.index);
      else if(state.on&&!state.loading)loadList(state.source,prefs.station);
      drawDial();
    }
  }
  function setPower(on) {
    state.on = on;
    panel.querySelector('.spotify-wrap').inert=!on;
    powerBtn.setAttribute('aria-pressed', String(on));
    powerBtn.textContent = on ? 'On' : 'Off';
    panel.classList.toggle('is-on', on);
    if (on) {
      audio.start();
      if (state.mode === 'TAPE') startTape();
      else if (!state.list.length && !state.loading) loadList(state.source, prefs.station);
      else if (state.list.length) play(state.index < 0 ? 0 : state.index);
    } else {
      stopStream();
      pauseTape();
      audio.setStatic(0);
      setStateText('Off');
    }
  }
  powerBtn.addEventListener('click', () => setPower(!state.on));

  /* ----- Tape deck: Spotify ----- */
  let controller = null, apiLoading = false, pendingUri = null, tapeUri = null;
  const tapeState={ready:false,isPaused:true,isBuffering:false,position:0,duration:0,error:false};
  const currentPlaylist = () => parsePlaylist(getState().playlist) || DEFAULT_PLAYLIST;
  function ensureController(uri, autoplay) {
    if (controller) {
      if (tapeUri !== uri) { tapeState.isPaused=true;tapeState.position=0;tapeState.isBuffering=true;$('spotifyPlaybackState').textContent='Loading your Spotify music…';controller.loadUri(uri); tapeUri = uri; }
      if (autoplay) controller.play();
      return;
    }
    tapeState.error=false;pendingUri = uri;
    if (apiLoading) return;
    apiLoading = true;$('spotifyPlaybackState').textContent='Connecting to Spotify…';
    window.onSpotifyIframeApiReady = (API) => {
      API.createController(document.getElementById('spotifyEmbed'), { uri: pendingUri, width: '100%', height: 152 }, (c) => {
        controller = c;tapeState.ready=true;tapeState.error=false;$('spotifyPlaybackState').textContent='Spotify ready. Press play to begin.';
        c.addListener('playback_update',event=>{
          const d=event.data||{};
          tapeState.isPaused=d.isPaused!==false;tapeState.isBuffering=!!d.isBuffering;
          tapeState.position=Number.isFinite(d.position)?d.position:0;tapeState.duration=Number.isFinite(d.duration)?d.duration:0;
          const seconds=Math.floor(tapeState.position/1000);$('spotifyPlaybackState').textContent=tapeState.isBuffering?'Spotify buffering…':tapeState.isPaused?'Spotify paused':`Playing on Spotify · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
        });
        tapeUri = pendingUri;
        if (state.mode === 'TAPE' && state.on) controller.play();
      });
    };
    const sc = document.createElement('script');
    sc.src = 'https://open.spotify.com/embed/iframe-api/v1';
    sc.async = true;
    sc.onerror = () => { tapeState.error=true;$('spotifyPlaybackState').textContent='Spotify is unavailable. Check your connection and try again.';$('tapeNote').textContent = 'Spotify could not load. Check your connection and try the tape deck again.'; apiLoading = false; };
    document.body.appendChild(sc);
  }
  function startTape() { ensureController(currentPlaylist(), true); }
  function pauseTape() { if (controller) controller.pause(); }
  $('playlistForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const uri = parsePlaylist(playlistInput.value);
    if (!uri) { $('tapeNote').textContent = 'That link is not a Spotify track, playlist or album. Copy the share link from Spotify and paste it here.'; return; }
    onPlaylist(playlistInput.value.trim());
    $('tapeNote').textContent = 'Your playlist is in the tape deck.';
    if(!state.on)setPower(true);else ensureController(uri, true);
  });
  $('playlistReset').addEventListener('click', () => {
    onPlaylist('');
    playlistInput.value = '';
    $('tapeNote').textContent = 'Back to the Pacific Drift playlist.';
    if(!state.on)setPower(true);else ensureController(DEFAULT_PLAYLIST, true);
  });

  /* ----- Panel ----- */
  let countriesLoaded = false;
  function setOpen(open) {
    state.open = open;
    panel.classList.toggle('open', open);
    document.body.classList.toggle('radio-open', open);
    panel.setAttribute('aria-hidden', String(!open));
    if (open) {
      if (!countriesLoaded) { countriesLoaded = true; loadCountries(); }
      if (!state.on) setPower(true);
      requestAnimationFrame(() => { drawDial(); markCurrent(); });
    }
  }
  $('radioClose').addEventListener('click', () => setOpen(false));

  function update() {
    const now = performance.now();
    if (!state.on || state.mode !== 'WORLD') { audio.setStatic(0); return; }
    const vol = Number(volume.value) / 100;
    audio.setStatic(now < state.staticUntil ? vol * 0.22 : 0);
    if (now < state.staticUntil && Math.random() < 0.3) audio.crackle(vol * 0.2);
  }

  /** Keyboard while the radio is open. Returns true when handled. */
  function key(code) {
    if (!state.open || state.mode !== 'WORLD') return false;
    if (code === 'Comma') { next(-1); return true; }
    if (code === 'Period') { next(1); return true; }
    return false;
  }

  setMode('WORLD');
  setStateText('Off');
  return {
    update, key, setOpen,
    openSource(mode){setMode(mode==='TAPE'?'TAPE':'WORLD');setOpen(true);},
    toggleTape(){if(!state.on){setPower(true);return;}if(!controller){startTape();return;}if(tapeState.isPaused)controller.play();else controller.pause();},
    mediaState(){return {mode:state.mode,on:state.on,station:state.list[state.index]?.name||'',status:stateOut.textContent,spotify:{...tapeState,playing:state.mode==='TAPE'&&state.on&&!tapeState.isPaused}};},
    toggle() { setOpen(!state.open); },
    get open() { return state.open; },
    resize: drawDial
  };
}
