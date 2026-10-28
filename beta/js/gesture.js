// Turns raw button down/up signals into single-click, double-click and long-press gestures.
//
// Bluetooth camera remotes behave like a one-button keyboard. Depending on the model and the
// OS, holding the button produces either one keydown...keyup pair, or a stream of auto-repeated
// keydown (and sometimes keyup) events. `releaseGraceMs` absorbs that: a keyup immediately followed
// by another keydown counts as the button still being held.

export const DEFAULT_TIMING = {
  longPressMs: 800, // hold at least this long for a long press
  doubleClickMs: 400, // max gap between the two clicks of a double click
  releaseGraceMs: 90, // keyup followed by keydown within this window = still held
};

export class GestureRecognizer {
  constructor(onGesture, timing = {}, timers = globalThis) {
    this.onGesture = onGesture;
    this.timing = { ...DEFAULT_TIMING, ...timing };
    this.timers = timers;
    this.down = false;
    this.clicks = 0;
    this.longFired = false;
    this.holdTimer = null;
    this.clickTimer = null;
    this.releaseTimer = null;
  }

  setTiming(timing) {
    this.timing = { ...this.timing, ...timing };
  }

  press() {
    if (this.releaseTimer !== null) {
      // Auto-repeat style remote: the button never really went up.
      this.clear('releaseTimer');
      return;
    }
    if (this.down) return; // keyboard auto-repeat
    this.down = true;
    this.longFired = false;
    this.clear('clickTimer');
    this.holdTimer = this.timers.setTimeout(() => {
      this.holdTimer = null;
      this.longFired = true;
      this.clicks = 0;
      this.onGesture('long');
    }, this.timing.longPressMs);
  }

  release() {
    if (!this.down || this.releaseTimer !== null) return;
    this.releaseTimer = this.timers.setTimeout(() => {
      this.releaseTimer = null;
      this.finishRelease();
    }, this.timing.releaseGraceMs);
  }

  finishRelease() {
    this.down = false;
    this.clear('holdTimer');
    if (this.longFired) return;
    this.clicks++;
    if (this.clicks >= 2) {
      this.clicks = 0;
      this.onGesture('double');
      return;
    }
    this.clickTimer = this.timers.setTimeout(() => {
      this.clickTimer = null;
      this.clicks = 0;
      this.onGesture('single');
    }, this.timing.doubleClickMs);
  }

  reset() {
    this.clear('holdTimer');
    this.clear('clickTimer');
    this.clear('releaseTimer');
    this.down = false;
    this.clicks = 0;
    this.longFired = false;
  }

  clear(name) {
    if (this[name] !== null) {
      this.timers.clearTimeout(this[name]);
      this[name] = null;
    }
  }
}
