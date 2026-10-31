// Bite scheduling for a float that is in fishable water.
//
// A valid cast always produces a bite. The wait is drawn from a bounded range
// and is measured in *active fishing time*: it only advances while the game
// is playing, the tab is visible and the float is in the water. Pauses, hidden
// tabs, inspection and panels freeze it; retrieving or cancelling the cast
// clears it. A missed strike schedules the next bite from a shorter range, so
// the player never waits longer than BITE.maxWait of active time for a bite.
export const BITE = {
  firstMin: 7,     // seconds after the float settles
  firstMax: 24,
  retryMin: 6,     // after a missed strike
  retryMax: 15,
  strikeWindow: 4, // seconds the float dips before the fish lets go
  maxStep: 0.25,   // longest single frame counted, so a stalled frame cannot skip the wait
  maxWait: 30      // hard ceiling of active time from cast (or miss) to bite
};

export function createBiteTimer(rng = Math.random, config = BITE) {
  let armed = false, waited = 0, due = 0, bites = 0;
  const draw = (min, max) => Math.min(config.maxWait, min + Math.max(0, Math.min(1, rng())) * (max - min));
  return {
    /** The float has landed in fishable water. */
    start() { armed = true; waited = 0; due = draw(config.firstMin, config.firstMax); },
    /** The fish let go without being struck: another will come sooner. */
    missed() { armed = true; waited = 0; due = draw(config.retryMin, config.retryMax); },
    /** Line retrieved, rig changed, rod put away or the boat changed. */
    cancel() { armed = false; waited = 0; due = 0; },
    /**
     * Advance by dt seconds of wall time. `active` is false whenever the
     * player is not actually fishing (paused, hidden tab, a dialog open).
     * Returns true exactly once, on the frame the bite arrives.
     */
    tick(dt, active = true) {
      if (!armed || !active || !(dt > 0)) return false;
      waited += Math.min(config.maxStep, dt);
      if (waited < due) return false;
      armed = false; bites++;
      return true;
    },
    get armed() { return armed; },
    get waited() { return waited; },
    get due() { return due; },
    get remaining() { return armed ? Math.max(0, due - waited) : 0; },
    get bites() { return bites; }
  };
}
