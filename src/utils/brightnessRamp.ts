const STEP_MS = 100;

// Bumped by every ramp and every cancel; a ramp whose number is no longer current stops
let generation = 0;

/**
 * Stop a running ramp before its next step. Call it before any other brightness write
 * (a wake sets its own level), so no late step of the ramp overwrites that level.
 */
export function cancelBrightnessRamp(): void {
  generation++;
}

/**
 * Move the brightness to `to` in small steps over `durationMs`, so the dim screensaver
 * fades out instead of jumping. `from` is read only when there is something to ramp.
 * A newer ramp or cancelBrightnessRamp() stops this one without another write; the
 * check comes right before each write, with no await in between.
 */
export async function rampBrightness(
  from: () => Promise<number>,
  to: number,
  durationMs: number,
  set: (level: number) => Promise<void>,
): Promise<void> {
  const run = ++generation;
  const steps = Math.max(1, Math.round(durationMs / STEP_MS));
  const start = steps > 1 ? await from() : to;
  for (let i = 1; i <= steps; i++) {
    if (steps > 1) await new Promise<void>(resolve => setTimeout(resolve, STEP_MS));
    if (run !== generation) return;
    await set(i === steps ? to : start + ((to - start) * i) / steps);
  }
}
