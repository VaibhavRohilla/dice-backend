/**
 * Round timing configuration (ms).
 * startBufferMs: delay between scheduling and round start.
 * durationMs: delay between start and result emission.
 */
const startBufferMs = Number(process.env.ROUND_START_BUFFER_MS ?? "1500");
const durationMs = Number(process.env.ROUND_DURATION_MS ?? "20000");

export const ROUND_TIMING = {
  startBufferMs:
    Number.isFinite(startBufferMs) && startBufferMs > 0 ? startBufferMs : 1500,
  durationMs:
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 20000,
};
