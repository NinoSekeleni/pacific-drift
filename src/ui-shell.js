// One coordinated place for the voyage's panels. On a desktop the utility panels open one at a
// time in a drawer under the utility bar; on phones and small windows the same panels open in a
// bottom sheet (or a side sheet in landscape) over a scrim, so nothing overlaps and no tap falls
// through to the ocean. True dialogs are modal: the page behind is inert, focus moves into the
// dialog and returns to whatever opened it.
//
// Panels are moved into the drawer once, at registration. The radio is never registered: its
// Spotify iframe must keep its place in the DOM or playback restarts.

export function createUiShell({compact = () => false, onChange = () => {}, label = 'Voyage panels'} = {}) {
  const panels = new Map();
  let current = null, opener = null;

  const bar = document.createElement('nav');
  bar.className = 'utility-bar';
  bar.setAttribute('aria-label', 'Voyage tools');
  const drawer = document.createElement('section');
  drawer.className = 'utility-drawer';
  drawer.hidden = true;
  drawer.setAttribute('aria-label', label);
  drawer.innerHTML = '<header class="drawer-head"><h2 class="drawer-title" tabindex="-1"></h2><button type="button" class="drawer-close" aria-label="Close panel">Close</button></header><div class="drawer-body"></div>';
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  scrim.hidden = true;
  document.body.append(scrim, drawer, bar);
  drawer.querySelector('.drawer-close').onclick = () => close(true);
  scrim.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); close(true); });
  const body = drawer.querySelector('.drawer-body');

  function syncButtons() {
    for (const [id, p] of panels) {
      p.button?.setAttribute('aria-expanded', String(current === id));
      p.button?.classList.toggle('active', current === id);
    }
  }
  function register(id, {title, el, button = true, buttonLabel = title, priority = 1, onShow = null, onHide = null, key = ''} = {}) {
    el.hidden = true;
    el.classList.add('drawer-panel');
    el.dataset.panel = id;
    body.append(el);
    let btn = null;
    if (button) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'utility-btn';
      btn.dataset.priority = String(priority);
      btn.dataset.panel = id;
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = `<span></span>${key ? `<kbd aria-hidden="true">${key}</kbd>` : ''}`;
      btn.querySelector('span').textContent = buttonLabel;
      btn.onclick = () => toggle(id, btn);
      bar.append(btn);
    }
    panels.set(id, {title, el, button: btn, onShow, onHide});
    return btn;
  }
  /** A plain action button in the utility bar (not a panel). */
  function addAction(id, labelText, onClick, {priority = 1, key = ''} = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'utility-btn action';
    btn.dataset.priority = String(priority);
    btn.dataset.action = id;
    btn.innerHTML = `<span></span>${key ? `<kbd aria-hidden="true">${key}</kbd>` : ''}`;
    btn.querySelector('span').textContent = labelText;
    btn.onclick = onClick;
    bar.append(btn);
    return btn;
  }
  function applyMode() {
    const sheet = compact();
    drawer.classList.toggle('as-sheet', sheet);
    document.body.classList.toggle('sheet-open', sheet && !!current);
    document.body.classList.toggle('drawer-open', !!current);
    scrim.hidden = !(sheet && current);
    // A sheet covers the controls beneath it, so the page behind it must not take input.
    for (const el of document.querySelectorAll('[data-sheet-inert]')) el.inert = sheet && !!current;
  }
  function open(id, from = null) {
    const p = panels.get(id); if (!p) return;
    if (current && current !== id) hide(current);
    opener = from || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    current = id;
    p.el.hidden = false;
    drawer.hidden = false;
    drawer.querySelector('.drawer-title').textContent = p.title;
    drawer.dataset.panel = id;
    p.onShow?.();
    applyMode(); syncButtons(); onChange(current);
    if (compact()) drawer.querySelector('.drawer-close').focus({preventScroll: true});
  }
  function hide(id) { const p = panels.get(id); if (!p) return; p.el.hidden = true; p.onHide?.(); }
  function close(restore = false) {
    if (!current) return false;
    hide(current); current = null; drawer.hidden = true;
    applyMode(); syncButtons(); onChange(null);
    if (restore && opener?.isConnected) opener.focus({preventScroll: true});
    opener = null;
    return true;
  }
  function toggle(id, from = null) { if (current === id) close(true); else open(id, from); }

  // Modal dialogs that are not <dialog> elements (the ship's log): inert background, focus, restore.
  const modals = [];
  function openModal(el, {initialFocus = null, onClose = null} = {}) {
    if (modals.some(m => m.el === el)) return;
    const record = {el, onClose, restore: document.activeElement instanceof HTMLElement ? document.activeElement : null, inerted: []};
    for (const child of document.body.children) {
      if (child === el || child.contains(el) || child.inert || child.tagName === 'SCRIPT') continue;
      child.inert = true; record.inerted.push(child);
    }
    el.hidden = false;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    modals.push(record);
    (initialFocus || el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))?.focus({preventScroll: true});
  }
  function closeModal(el = modals.at(-1)?.el) {
    const i = modals.findIndex(m => m.el === el); if (i < 0) return false;
    const [record] = modals.splice(i, 1);
    record.el.hidden = true;
    for (const child of record.inerted) child.inert = false;
    record.onClose?.();
    if (record.restore?.isConnected) record.restore.focus({preventScroll: true});
    return true;
  }

  /**
   * Escape, from the top of the stack down: a native dialog closes itself; then our modal;
   * then the open panel. Returns true when Escape was consumed.
   */
  function escape() {
    if (document.querySelector('dialog[open]')) return true;
    if (modals.length) { closeModal(); return true; }
    if (current) { close(true); return true; }
    return false;
  }

  return {
    bar, drawer, register, addAction, open, close, toggle, escape, openModal, closeModal, applyMode,
    get current() { return current; },
    get modalOpen() { return modals.length > 0 || !!document.querySelector('dialog[open]'); },
    isOpen: id => current === id
  };
}
