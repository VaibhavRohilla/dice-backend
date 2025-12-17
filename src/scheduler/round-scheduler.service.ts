import { Injectable, Logger } from '@nestjs/common';
import { SseHubService } from '../realtime/sse-hub.service';
import { RoundsService } from '../rounds/rounds.service';
import { ROUND_TIMING } from '../config';

export type ScheduledRound = {
  chatId: number;
  name: string | null;
  createdBy: number;
  createdAt: number; // epoch ms when scheduled
  startAt: number; // epoch ms
  endAt: number; // epoch ms
  diceValues: number[];
  roundId?: string;
  cancelled?: boolean;
  cancelRequestedAt?: number;
  timers: { start?: NodeJS.Timeout; end?: NodeJS.Timeout };
};

type LastOutcome = { diceValues: number[]; updatedAt: number; roundId?: string };

@Injectable()
export class RoundSchedulerService {
  private readonly scheduled = new Map<number, ScheduledRound>();
  private readonly lastOutcome = new Map<number, LastOutcome>();
  private readonly logger = new Logger(RoundSchedulerService.name);

  constructor(
    private readonly hub: SseHubService,
    private readonly rounds: RoundsService,
  ) {}

  getScheduled(chatId: number): { startAt: number; endAt: number; totalMs: number; remainingMs: number } | null {
    const s = this.scheduled.get(chatId);
    if (!s) return null;
    const totalMs = Math.max(0, s.startAt - s.createdAt);
    const remainingMs = Math.max(0, s.startAt - Date.now());
    return { startAt: s.startAt, endAt: s.endAt, totalMs, remainingMs };
  }

  getLastOutcome(chatId: number): LastOutcome | null {
    return this.lastOutcome.get(chatId) ?? null;
  }

  getOrCreateLastOutcome(chatId: number) {
    return this.ensureLastOutcome(chatId);
  }

  scheduleRound(chatId: number, createdBy: number, diceValues: number[], name: string | null = null) {
    if (
      !Array.isArray(diceValues) ||
      diceValues.length !== 6 ||
      diceValues.some((v) => !Number.isInteger(v) || v < 1 || v > 6)
    ) {
      return { ok: false as const, reason: 'invalid_dice' as const };
    }

    if (this.scheduled.has(chatId)) return { ok: false, reason: 'already_scheduled' as const };

    const now = Date.now();
    const startAt = now + ROUND_TIMING.startBufferMs;
    const endAt = startAt + ROUND_TIMING.durationMs;

    const entry: ScheduledRound = { chatId, name, createdBy, createdAt: now, startAt, endAt, diceValues, timers: {} };
    this.scheduled.set(chatId, entry);

    this.hub.emit(chatId, 'round.scheduled', {
      chatId,
      startAt,
      endAt,
      totalMs: ROUND_TIMING.startBufferMs,
      remainingMs: Math.max(0, startAt - Date.now()),
      serverNow: Date.now(),
    });

    entry.timers.start = setTimeout(async () => {
      if (!this.scheduled.has(chatId)) return; // cancelled right before firing
      try {
        const s = this.scheduled.get(chatId);
        if (!s) return;

        const doc = await this.rounds.insertStartedRound({
          chatId,
          name: s.name ?? null,
          createdBy,
          startAt: new Date(startAt),
          endAt: new Date(endAt),
        });

        s.roundId = String(doc.id);

        if (!s.cancelled) {
          this.hub.emit(chatId, 'round.started', {
            roundId: s.roundId,
            chatId,
            startAt,
            endAt,
            totalMs: Math.max(0, endAt - startAt),
            remainingMs: Math.max(0, endAt - Date.now()),
            serverNow: Date.now(),
          });
        }
      } catch (err) {
        this.logger.error(`Failed to insert round for chat ${chatId}`, err as Error);
        this.cleanup(chatId);
      }
    }, Math.max(0, startAt - now));

    entry.timers.end = setTimeout(async () => {
      const s = this.scheduled.get(chatId);
      if (!s || !s.roundId) {
        this.cleanup(chatId);
        return;
      }

      try {
        if (s.cancelled) {
          await this.rounds.markRoundCancelled(s.roundId);
        } else {
          await this.rounds.setDiceValues(s.roundId, s.diceValues);

          this.lastOutcome.set(chatId, {
            diceValues: s.diceValues,
            updatedAt: Date.now(),
            roundId: s.roundId,
          });

          this.hub.emit(chatId, 'round.result', {
            roundId: s.roundId,
            chatId,
            diceValues: s.diceValues,
            serverNow: Date.now(),
          });
        }
      } catch (err) {
        this.logger.error(`Failed to finalize round ${s.roundId} for chat ${chatId}`, err as Error);
      } finally {
        this.cleanup(chatId);
      }
    }, Math.max(0, endAt - now));

    return { ok: true as const, startAt, endAt };
  }

  cancelRound(chatId: number) {
    const s = this.scheduled.get(chatId);
    if (!s) return { ok: false as const, reason: 'nothing_to_cancel' as const };

    const now = Date.now();

    // Round already ended
    if (now >= s.endAt) return { ok: false as const, reason: 'too_late' as const };

    // Cancel before start: behave as before (drop timers, no DB write).
    if (now < s.startAt) {
      this.cleanup(chatId);
      this.hub.emit(chatId, 'round.cancelled', { chatId, serverNow: now });
      return { ok: true as const };
    }

    // Cancel during countdown (after start, before end): mark and persist at end.
    s.cancelled = true;
    s.cancelRequestedAt = now;
    this.hub.emit(chatId, 'round.cancelled', { chatId, serverNow: now });
    return { ok: true as const };
  }

  private cleanup(chatId: number) {
    const s = this.scheduled.get(chatId);
    if (!s) return;
    if (s.timers.start) clearTimeout(s.timers.start);
    if (s.timers.end) clearTimeout(s.timers.end);
    this.scheduled.delete(chatId);
  }

  private ensureLastOutcome(chatId: number): LastOutcome {
    const existing = this.lastOutcome.get(chatId);
    if (existing) return existing;

    const diceValues = Array.from({ length: 6 }, () => 1 + Math.floor(Math.random() * 6));
    const value: LastOutcome = { diceValues, updatedAt: Date.now() };
    this.lastOutcome.set(chatId, value);
    return value;
  }
}
