import { Injectable, Logger } from '@nestjs/common';
import { SseHubService } from '../realtime/sse-hub.service';
import { RoundsService } from '../rounds/rounds.service';

export type ScheduledRound = {
  chatId: number;
  createdBy: number;
  startAt: number; // epoch ms
  endAt: number; // epoch ms
  diceValues: number[];
  roundId?: string;
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

  getScheduled(chatId: number): { startAt: number; endAt: number } | null {
    const s = this.scheduled.get(chatId);
    if (!s) return null;
    return { startAt: s.startAt, endAt: s.endAt };
  }

  getLastOutcome(chatId: number): LastOutcome | null {
    return this.lastOutcome.get(chatId) ?? null;
  }

  getOrCreateLastOutcome(chatId: number) {
    return this.ensureLastOutcome(chatId);
  }

  scheduleRound(chatId: number, createdBy: number, diceValues: number[]) {
    if (
      !Array.isArray(diceValues) ||
      diceValues.length !== 6 ||
      diceValues.some((v) => !Number.isInteger(v) || v < 1 || v > 6)
    ) {
      return { ok: false as const, reason: 'invalid_dice' as const };
    }

    if (this.scheduled.has(chatId)) return { ok: false, reason: 'already_scheduled' as const };

    const now = Date.now();
    const startAt = now + 1500;
    const endAt = startAt + 25_000;

    const entry: ScheduledRound = { chatId, createdBy, startAt, endAt, diceValues, timers: {} };
    this.scheduled.set(chatId, entry);

    this.hub.emit(chatId, 'round.scheduled', { chatId, startAt, endAt, serverNow: Date.now() });

    entry.timers.start = setTimeout(async () => {
      if (!this.scheduled.has(chatId)) return; // cancelled right before firing
      try {
        const doc = await this.rounds.insertStartedRound({
          chatId,
          createdBy,
          startAt: new Date(startAt),
          endAt: new Date(endAt),
        });

        const s = this.scheduled.get(chatId);
        if (!s) return;
        s.roundId = String(doc.id);

        this.hub.emit(chatId, 'round.started', {
          roundId: s.roundId,
          chatId,
          startAt,
          endAt,
          serverNow: Date.now(),
        });
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

    if (Date.now() >= s.startAt) return { ok: false as const, reason: 'too_late' as const };

    this.cleanup(chatId);
    this.hub.emit(chatId, 'round.cancelled', { chatId, serverNow: Date.now() });
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
