// Countdown for the official breaks (BWF Law 16.2): up to 60 s when the leading score reaches 11,
// and up to 120 s between games. Like an umpire, it warns 20 s before the end.
// Timing is based on the clock rather than on counting ticks, so a throttled or sleeping
// browser tab still ends the break on time.

export const INTERVAL_SECONDS = 60;
export const BETWEEN_GAMES_SECONDS = 120;
export const WARNING_SECONDS = 20;

export class BreakTimer {
  constructor({ onTick, onWarning, onEnd }, clock = { now: () => Date.now(), setInterval, clearInterval }) {
    this.onTick = onTick;
    this.onWarning = onWarning;
    this.onEnd = onEnd;
    this.clock = clock;
    this.kind = null;
    this.handle = null;
  }

  get running() {
    return this.kind !== null;
  }

  start(kind, seconds) {
    this.stop();
    this.kind = kind;
    this.endsAt = this.clock.now() + seconds * 1000;
    this.warned = seconds <= WARNING_SECONDS;
    this.handle = this.clock.setInterval(() => this.tick(), 250);
    this.tick();
  }

  remaining() {
    return Math.max(0, Math.ceil((this.endsAt - this.clock.now()) / 1000));
  }

  tick() {
    if (!this.running) return;
    const left = this.remaining();
    const kind = this.kind;
    if (left <= 0) {
      this.stop();
      this.onTick?.(0, kind);
      this.onEnd?.(kind);
      return;
    }
    this.onTick?.(left, kind);
    if (!this.warned && left <= WARNING_SECONDS) {
      this.warned = true;
      this.onWarning?.(kind);
    }
  }

  stop() {
    if (this.handle !== null) this.clock.clearInterval(this.handle);
    this.handle = null;
    this.kind = null;
  }
}

export function formatClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
