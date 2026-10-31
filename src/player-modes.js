// One input model for every way of being aboard. Each mode gives every key a single meaning;
// main.js asks this module what a key means instead of testing key codes itself.
//
//   row   seated in the rowboat: oars, steering oar and sail
//   walk  standing on the launch's deck: walk, look, interact
//   helm  at the launch's wheel: throttle, steering, leave the helm
//   fish  rod in hand on either boat: one hold/release action casts, strikes and reels
// Inspecting equipment is an overlay with its own controls (drag to rotate, close to return).

export const MODES = ['row', 'walk', 'helm', 'fish'];

const COMMON = {
  KeyV: 'camera', KeyR: 'radio', KeyC: 'stars', KeyL: 'lantern', KeyN: 'map', KeyJ: 'log',
  KeyH: 'help', KeyM: 'sound', KeyI: 'inspect', KeyK: 'journal', KeyP: 'puzzles', Equal: 'mapZoomIn', NumpadAdd: 'mapZoomIn',
  Minus: 'mapZoomOut', NumpadSubtract: 'mapZoomOut'
};
export const KEYMAP = {
  row: {...COMMON, KeyW: 'row', ArrowUp: 'row', KeyA: 'steerLeft', ArrowLeft: 'steerLeft', KeyD: 'steerRight', ArrowRight: 'steerRight', KeyE: 'sail', KeyF: 'inspectPointed', KeyG: 'fish'},
  walk: {...COMMON, KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'brisk', ShiftRight: 'brisk', KeyE: 'interact', KeyF: 'inspectPointed', KeyG: 'fish'},
  helm: {...COMMON, KeyW: 'throttleUp', ArrowUp: 'throttleUp', KeyS: 'throttleDown', ArrowDown: 'throttleDown', KeyA: 'steerLeft', ArrowLeft: 'steerLeft', KeyD: 'steerRight', ArrowRight: 'steerRight', KeyX: 'neutral', KeyE: 'leaveHelm', KeyG: 'fish'},
  fish: {...COMMON, Space: 'fishAction', KeyG: 'stowRod', KeyQ: 'reelIn'}
};

/** The single meaning of a key in a mode, or null. */
export function actionFor(mode, code) { return KEYMAP[mode]?.[code] ?? null; }
/** Is any key bound to this action held? */
export function held(mode, action, keys) {
  const map = KEYMAP[mode]; if (!map) return false;
  for (const code of keys) if (map[code] === action) return true;
  return false;
}

/** Help rows for the current mode, for the controls panel. */
export function helpFor(mode, vessel) {
  const rows = {
    row: [['W', 'row'], ['A D', 'steer'], ['E', 'raise or lower the sail'], ['G', 'take the fishing rod']],
    walk: [['W A S D', 'walk the deck'], ['Shift', 'walk briskly'], ['Drag', 'look around'], ['E', 'take the helm when beside it'], ['G', 'take the rod on the open deck'], ['F', 'inspect what you are looking at']],
    helm: [['W S', 'open or close the throttle'], ['X', 'neutral'], ['A D', 'steer'], ['E', 'stand up and walk the deck'], ['G', 'leave the helm and fish']],
    fish: [['Hold Space', 'wind up, release to cast'], ['Space', 'strike when the float dives'], ['Hold Space', 'reel; release to ease the line'], ['Q', 'reel in the line'], ['G or Esc', 'put the rod away']]
  }[mode] || [];
  const common = [['V', 'change view'], ['L', 'lantern'], ['R', 'radio'], ['N', 'map'], ['C', 'star chart'], ['K', 'catch journal'], ['P', 'puzzle book'], ['J', "ship's log"], ['M', 'sound'], ['I', 'inspect equipment'], ['Esc', mode === 'helm' ? 'leave the helm, or close a panel' : mode === 'fish' ? 'put the rod away, or close a panel' : 'close a panel, or pause']];
  return {title: {row: vessel === 'launch' ? 'Aboard' : 'Rowing', walk: 'On deck', helm: 'At the helm', fish: 'Fishing'}[mode] || 'Controls', rows, common};
}

/** Throttle with a neutral detent: crossing from ahead to astern stops at neutral first. */
export function createThrottle({rate = .55, min = -.5, max = 1} = {}) {
  let value = 0, latched = false;
  return {
    get value() { return value; },
    set(v) { value = Math.max(min, Math.min(max, v)); },
    neutral() { value = 0; latched = false; },
    update(dt, up, down) {
      if (!up && !down) { latched = false; return value; }
      if (latched) return value;
      const dir = (up ? 1 : 0) - (down ? 1 : 0), next = Math.max(min, Math.min(max, value + dir * rate * dt));
      if ((value > 0 && next <= 0) || (value < 0 && next >= 0)) { value = 0; latched = true; } else value = next;
      return value;
    },
    label() {
      if (Math.abs(value) < .02) return 'Neutral';
      return value > 0 ? `Ahead ${Math.round(value * 100)}%` : `Astern ${Math.round(-value / -min * 100)}%`;
    }
  };
}

/**
 * Mode state. `vessel` decides which modes exist: the rowboat is always seated,
 * the launch has walk and helm. Fishing returns to whatever mode it interrupted.
 */
export function createPlayerModes({onChange = () => {}} = {}) {
  let vessel = 'rowboat', mode = 'row', beforeFish = 'row';
  const set = next => { if (next === mode) return; const prev = mode; mode = next; onChange(mode, prev); };
  return {
    get mode() { return mode; },
    get vessel() { return vessel; },
    setVessel(v) { vessel = v === 'launch' ? 'launch' : 'rowboat'; beforeFish = vessel === 'launch' ? 'helm' : 'row'; set(beforeFish); },
    walk() { if (vessel === 'launch') set('walk'); },
    helm() { if (vessel === 'launch') set('helm'); },
    fish() { if (mode !== 'fish') beforeFish = mode === 'helm' ? 'walk' : mode; set('fish'); },
    endFish() { if (mode === 'fish') set(vessel === 'launch' ? (beforeFish === 'helm' ? 'walk' : beforeFish) : 'row'); },
    get walking() { return mode === 'walk'; },
    get driving() { return mode === 'helm'; },
    get fishing() { return mode === 'fish'; }
  };
}
