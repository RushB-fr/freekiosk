const STEP_MS = 100;

/**
 * Move the brightness from `from` to `to` in small steps over `durationMs`, so the
 * dim screensaver fades out instead of jumping. `isCancelled` is checked right before
 * every step and stops the ramp without another write: a wake sets its own level and
 * must not be overwritten by a late step.
 */
export async function rampBrightness(
  from: number,
  to: number,
  durationMs: number,
  set: (level: number) => Promise<void>,
  isCancelled: () => boolean,
): Promise<void> {
  const steps = Math.max(1, Math.round(durationMs / STEP_MS));
  for (let i = 1; i <= steps; i++) {
    if (steps > 1) await new Promise<void>(resolve => setTimeout(resolve, STEP_MS));
    if (isCancelled()) return;
    await set(i === steps ? to : from + ((to - from) * i) / steps);
  }
}
