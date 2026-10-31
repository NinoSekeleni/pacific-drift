// The catch journal: one record per landed fish, kept in this browser and shared by both boats.
// The stored format stays a plain array so older releases can still read it; newer fields
// (rig, boat) are optional and missing values are shown as unknown.
const MAX_RECORDS = 400;
const RIG_NAMES = { 2: 'Surface float · 2 m', 40: 'Deep drift · 40 m' };
const BOAT_NAMES = { rowboat: 'Wooden rowboat', launch: 'Fishing launch' };

export function normaliseRecords(raw, FISH) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(r => r && FISH[r.id] && Number.isFinite(r.kg) && r.kg > 0).map(r => ({
    id: r.id,
    kg: r.kg,
    cm: Number.isFinite(r.cm) ? r.cm : null,
    kept: !!r.kept,
    at: Number.isFinite(r.at) ? r.at : null,
    lat: Number.isFinite(r.lat) ? r.lat : null,
    lng: Number.isFinite(r.lng) ? r.lng : null,
    rig: Number.isFinite(r.rig) ? r.rig : null,
    boat: BOAT_NAMES[r.boat] ? r.boat : null
  })).slice(-MAX_RECORDS);
}

export function speciesStats(records, id) {
  const list = records.filter(r => r.id === id);
  if (!list.length) return { count: 0, maxKg: 0, maxCm: null, first: null, latest: null, kept: 0, released: 0, largest: null };
  const largest = list.reduce((a, b) => (b.kg > a.kg ? b : a));
  const dated = list.filter(r => r.at);
  return {
    count: list.length,
    maxKg: largest.kg,
    maxCm: largest.cm,
    largest,
    first: dated.length ? dated.reduce((a, b) => (b.at < a.at ? b : a)) : list[0],
    latest: list[list.length - 1],
    kept: list.filter(r => r.kept).length,
    released: list.filter(r => !r.kept).length
  };
}

export function formatPosition(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'Position not recorded';
  return `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lng).toFixed(2)}° ${lng < 0 ? 'W' : 'E'}`;
}
const formatDate = at => at ? new Date(at).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Date not recorded';
const rigName = rig => RIG_NAMES[rig] || 'Rig not recorded';

export function createFishJournal({ base = './', storageKey = 'pacific-drift-fishing-v1', FISH, storage = globalThis.localStorage } = {}) {
  let records = [];
  try { records = normaliseRecords(JSON.parse(storage?.getItem(storageKey) || '[]'), FISH); } catch { records = []; }
  function save() { try { storage?.setItem(storageKey, JSON.stringify(records.slice(-MAX_RECORDS))); } catch { /* storage unavailable */ } }
  const imageFor = (id, size = 'thumb') => `${base}fish/${id}-${size === 'silhouette' ? 'silhouette' : size === 'full' ? 1024 : 480}.webp`;

  let dialog = null;
  function build() {
    if (dialog || typeof document === 'undefined') return;
    dialog = document.createElement('dialog');
    dialog.className = 'fishing-journal';
    dialog.setAttribute('aria-labelledby', 'journalTitle');
    dialog.innerHTML = `<header class="journal-head"><div><p class="eyebrow">Catch journal</p><h2 id="journalTitle">Fish of the voyage</h2><p class="journal-summary"></p></div><button type="button" class="journal-close" data-close aria-label="Close the journal">Close</button></header>
      <div class="journal-body"><ul class="journal-grid" aria-label="Species"></ul><section class="journal-detail" aria-live="polite" hidden></section></div>
      <p class="journal-note">Illustrations are original artwork made for Pacific Drift. Regional habitats, depths and fish sizes in the game are simplified gameplay approximations, and lengths are estimated from weight. Nothing here is a record of observed fish populations.</p>`;
    document.body.append(dialog);
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  }
  function card(id) {
    const f = FISH[id], s = speciesStats(records, id), found = s.count > 0;
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'journal-card' + (found ? '' : ' undiscovered');
    button.dataset.species = id;
    button.setAttribute('aria-label', found ? `${f.name}, ${s.count} recorded` : `${f.name}, not yet caught`);
    const img = document.createElement('img');
    img.loading = 'lazy'; img.decoding = 'async'; img.width = 480; img.height = 320; img.alt = '';
    img.src = imageFor(id, found ? 'thumb' : 'silhouette');
    img.onerror = () => { img.remove(); button.classList.add('no-image'); };
    const text = document.createElement('span');
    text.className = 'journal-card-text';
    text.innerHTML = `<strong></strong><em></em><small></small>`;
    text.querySelector('strong').textContent = f.name;
    text.querySelector('em').textContent = f.sci;
    text.querySelector('small').textContent = found ? `${s.count} recorded · best ${s.maxKg.toFixed(2)} kg` : 'Not yet caught';
    button.append(img, text);
    button.onclick = () => showDetail(id);
    li.append(button);
    return li;
  }
  function showDetail(id) {
    const f = FISH[id], s = speciesStats(records, id), detail = dialog.querySelector('.journal-detail');
    detail.hidden = false; detail.replaceChildren();
    const head = document.createElement('div'); head.className = 'journal-detail-head';
    const img = document.createElement('img'); img.decoding = 'async'; img.width = 1024; img.height = 683; img.alt = s.count ? `Illustration of a ${f.name}` : '';
    img.src = imageFor(id, s.count ? 'full' : 'silhouette'); img.onerror = () => img.remove();
    const title = document.createElement('div');
    title.innerHTML = '<h3></h3><p class="sci"></p>';
    title.querySelector('h3').textContent = f.name; title.querySelector('.sci').textContent = f.sci;
    head.append(img, title); detail.append(head);
    const dl = document.createElement('dl');
    const add = (k, v) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.append(dt, dd); };
    if (!s.count) {
      add('Status', 'Not yet caught. Its silhouette is shown until you land one.');
    } else {
      add('First recorded', `${formatDate(s.first.at)} · ${formatPosition(s.first.lat, s.first.lng)}`);
      add('Catches', `${s.count} (${s.kept} kept, ${s.released} released)`);
      add('Largest', `${s.maxKg.toFixed(2)} kg${Number.isFinite(s.maxCm) ? ` · about ${Math.round(s.maxCm)} cm (estimated)` : ''}`);
    }
    detail.append(dl);
    if (s.count) {
      const list = document.createElement('ol'); list.className = 'journal-catches'; list.setAttribute('aria-label', `${f.name} catches, newest first`);
      for (const r of records.filter(r => r.id === id).slice().reverse().slice(0, 20)) {
        const li = document.createElement('li');
        li.textContent = `${formatDate(r.at)} · ${r.kg.toFixed(2)} kg${Number.isFinite(r.cm) ? `, about ${Math.round(r.cm)} cm` : ''} · ${formatPosition(r.lat, r.lng)} · ${rigName(r.rig)}${r.boat ? ' · ' + BOAT_NAMES[r.boat] : ''} · ${r.kept ? 'kept' : 'released'}`;
        list.append(li);
      }
      detail.append(list);
    }
    const back = document.createElement('button'); back.type = 'button'; back.className = 'journal-back'; back.textContent = 'All species';
    back.onclick = () => { detail.hidden = true; dialog.querySelector(`[data-species="${id}"]`)?.focus(); };
    detail.prepend(back);
    back.focus();
  }
  function render() {
    build();
    const grid = dialog.querySelector('.journal-grid');
    grid.replaceChildren(...Object.keys(FISH).map(card));
    const found = Object.keys(FISH).filter(id => records.some(r => r.id === id)).length;
    dialog.querySelector('.journal-summary').textContent = records.length ? `${found} of ${Object.keys(FISH).length} species · ${records.length} ${records.length === 1 ? 'catch' : 'catches'} recorded` : `No catches yet. ${Object.keys(FISH).length} species are in the catalogue.`;
    dialog.querySelector('.journal-detail').hidden = true;
  }
  return {
    get records() { return records.slice(); },
    stats: id => speciesStats(records, id),
    imageFor,
    record(entry) {
      const firstOfSpecies = !records.some(r => r.id === entry.id);
      const [clean] = normaliseRecords([{ ...entry, at: entry.at ?? Date.now() }], FISH);
      if (clean) { records.push(clean); save(); }
      return { ...clean, firstOfSpecies };
    },
    open(id) { render(); if (!dialog.open) dialog.showModal(); if (id) showDetail(id); },
    close() { if (dialog?.open) dialog.close(); },
    get isOpen() { return !!dialog?.open; },
    dispose() { dialog?.remove(); dialog = null; }
  };
}
