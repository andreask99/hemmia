/**
 * How long loading a model takes, for the progress bar while it loads. Learned from the
 * engine's reported load time; until then estimated from the model's memory size.
 */
const seen = new Map<string, number>();

/** Expected load time in ms (last measured, else about 0.6 s per GB, at least 3 s). */
export function expectedLoadMs(model: string, memoryGiB: number): number {
  return seen.get(model) ?? Math.round(Math.max(3, memoryGiB * 0.6) * 1000);
}

/** Remembers a real load (shorter ones mean the model was already in memory). */
export function recordLoad(model: string, ms: number): void {
  if (ms >= 1000) seen.set(model, ms);
}
