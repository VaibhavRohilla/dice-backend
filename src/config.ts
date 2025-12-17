/**
 * Single-tenant chat configuration.
 * When only one frontend/backend pair exists, we fix the chat id to keep
 * all SSE streams and DB writes in a single channel.
 */
const rawChatId = process.env.CHAT_ID ?? process.env.SINGLE_CHAT_ID ?? '1';
const parsedChatId = Number(rawChatId);
export const CHAT_ID = Number.isFinite(parsedChatId) ? parsedChatId : 1;

/**
 * Round timing configuration (ms).
 * startBufferMs: delay between scheduling and round start.
 * durationMs: delay between start and result emission.
 */
const startBufferMs = Number(process.env.ROUND_START_BUFFER_MS ?? '1500');
const durationMs = Number(process.env.ROUND_DURATION_MS ?? '25000');

export const ROUND_TIMING = {
  startBufferMs: Number.isFinite(startBufferMs) && startBufferMs > 0 ? startBufferMs : 1500,
  durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 25000,
};
