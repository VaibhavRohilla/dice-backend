import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SseHubService } from '../realtime/sse-hub.service';
import { RoundsService } from '../rounds/rounds.service';
import { ROUND_TIMING } from '../config';

export type ScheduledRound = {
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
export class RoundSchedulerService implements OnModuleInit {
  private scheduled: ScheduledRound | null = null;
  private lastOutcome: LastOutcome | null = null;
  private readonly logger = new Logger(RoundSchedulerService.name);
  private scheduleLock: Promise<void> = Promise.resolve();

  constructor(
    private readonly hub: SseHubService,
    private readonly rounds: RoundsService,
  ) {}

  async onModuleInit() {
    // Restore active rounds from database on server restart
    await this.restoreActiveRounds();
  }

  private async restoreActiveRounds() {
    try {
      const now = Date.now();
      const latest = await this.rounds.getLatestRound();
      
      if (!latest) return;
      
      const roundEndAt = latest.endAt.getTime();
      
      // Cleanup rounds that have passed their end time but have no dice values (orphaned)
      if (now >= roundEndAt && !latest.diceValues) {
        this.logger.warn(`Found orphaned round ${latest.id} past end time, marking as cancelled`);
        try {
          await this.retryOperation(() => this.rounds.markRoundCancelled(latest.id), 'markRoundCancelled');
        } catch (err) {
          this.logger.error(`Failed to cleanup orphaned round ${latest.id}`, err as Error);
        }
        return;
      }
      
      // Note: We cannot fully restore rounds in progress because we don't have the dice values
      // (they're only stored in memory in the scheduled entry). The database check in scheduleRound
      // prevents new scheduling while such rounds exist, which is the correct behavior.
      this.logger.log(`Round ${latest.id} exists in database, will prevent new scheduling until it ends`);
    } catch (err) {
      this.logger.error('Failed to restore active rounds on startup', err as Error);
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
    initialDelay: number = 100,
  ): Promise<T> {
    let lastError: Error | unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, attempt); // Exponential backoff
          this.logger.warn(
            `${operationName} failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  getScheduled(): { startAt: number; endAt: number; totalMs: number; remainingMs: number; roundId?: string } | null {
    const s = this.scheduled;
    if (!s) return null;
    const totalMs = Math.max(0, s.startAt - s.createdAt);
    const remainingMs = Math.max(0, s.startAt - Date.now());
    return { startAt: s.startAt, endAt: s.endAt, totalMs, remainingMs, roundId: s.roundId };
  }

  getLastOutcome(): LastOutcome | null {
    return this.lastOutcome;
  }

  getOrCreateLastOutcome() {
    return this.ensureLastOutcome();
  }

  async scheduleRound(createdBy: number, diceValues: number[], name: string | null = null) {
    if (
      !Array.isArray(diceValues) ||
      diceValues.length !== 6 ||
      diceValues.some((v) => !Number.isInteger(v) || v < 1 || v > 6)
    ) {
      return { ok: false as const, reason: 'invalid_dice' as const };
    }

    // Use promise-based lock to prevent concurrent schedule requests
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    
    const previousLock = this.scheduleLock;
    this.scheduleLock = this.scheduleLock.then(() => lockPromise);
    
    await previousLock;

    try {
      // Check if there's already a scheduled round in memory
      if (this.scheduled !== null) {
        return { ok: false, reason: 'already_scheduled' as const };
      }

      // Also check database for active rounds (handles server restart scenarios)
      const latest = await this.rounds.getLatestRound();
      if (latest) {
        const now = Date.now();
        const roundEndAt = latest.endAt.getTime();
        // If there's an active round that hasn't finished yet, reject new scheduling
        if (now < roundEndAt) {
          return { ok: false, reason: 'already_scheduled' as const };
        }
      }
    } finally {
      releaseLock!();
    }

    const now = Date.now();
    const startAt = now + ROUND_TIMING.startBufferMs;
    const endAt = startAt + ROUND_TIMING.durationMs;

    const entry: ScheduledRound = { name, createdBy, createdAt: now, startAt, endAt, diceValues, timers: {} };
    this.scheduled = entry;

    this.hub.emit('round.scheduled', {
      startAt,
      endAt,
      totalMs: ROUND_TIMING.startBufferMs,
      remainingMs: Math.max(0, startAt - Date.now()),
      serverNow: Date.now(),
    });

    entry.timers.start = setTimeout(async () => {
      if (this.scheduled === null) return; // cancelled right before firing
      try {
        const s = this.scheduled;
        if (!s) return;

        const doc = await this.retryOperation(
          () =>
            this.rounds.insertStartedRound({
              name: s.name ?? null,
              createdBy,
              startAt: new Date(startAt),
              endAt: new Date(endAt),
            }),
          'insertStartedRound',
        );

        s.roundId = String(doc.id);

        if (!s.cancelled) {
          this.hub.emit('round.started', {
            roundId: s.roundId,
            startAt,
            endAt,
            totalMs: Math.max(0, endAt - startAt),
            remainingMs: Math.max(0, endAt - Date.now()),
            serverNow: Date.now(),
          });
        }
      } catch (err) {
        this.logger.error(`Failed to insert round`, err as Error);
        this.cleanup();
      }
    }, Math.max(0, startAt - now));

    entry.timers.end = setTimeout(async () => {
      const s = this.scheduled;
      if (!s || !s.roundId) {
        this.cleanup();
        return;
      }

      try {
        const roundId = s.roundId;
        if (!roundId) {
          this.logger.error(`Round has no roundId, cannot finalize`);
          this.cleanup();
          return;
        }
        
        if (s.cancelled) {
          await this.retryOperation(
            () => this.rounds.markRoundCancelled(roundId),
            'markRoundCancelled',
          );
        } else {
          await this.retryOperation(
            () => this.rounds.setDiceValues(roundId, s.diceValues),
            'setDiceValues',
          );

          this.lastOutcome = {
            diceValues: s.diceValues,
            updatedAt: Date.now(),
            roundId: s.roundId,
          };

          this.hub.emit('round.result', {
            roundId: s.roundId,
            diceValues: s.diceValues,
            serverNow: Date.now(),
          });
        }
      } catch (err) {
        this.logger.error(`Failed to finalize round ${s.roundId}`, err as Error);
      } finally {
        this.cleanup();
      }
    }, Math.max(0, endAt - now));

    return { ok: true as const, startAt, endAt };
  }

  cancelRound() {
    const s = this.scheduled;
    if (!s) return { ok: false as const, reason: 'nothing_to_cancel' as const };

    const now = Date.now();

    // Round already ended
    if (now >= s.endAt) return { ok: false as const, reason: 'too_late' as const };

    // Cancel before start: behave as before (drop timers, no DB write).
    if (now < s.startAt) {
      this.cleanup();
      this.hub.emit('round.cancelled', { serverNow: now });
      return { ok: true as const };
    }

    // Cancel during countdown (after start, before end): mark and persist at end.
    s.cancelled = true;
    s.cancelRequestedAt = now;
    this.hub.emit('round.cancelled', { serverNow: now });
    return { ok: true as const };
  }

  private cleanup() {
    const s = this.scheduled;
    if (!s) return;
    if (s.timers.start) clearTimeout(s.timers.start);
    if (s.timers.end) clearTimeout(s.timers.end);
    this.scheduled = null;
  }

  private ensureLastOutcome(): LastOutcome {
    if (this.lastOutcome) return this.lastOutcome;

    const diceValues = Array.from({ length: 6 }, () => 1 + Math.floor(Math.random() * 6));
    const value: LastOutcome = { diceValues, updatedAt: Date.now() };
    this.lastOutcome = value;
    return value;
  }
}
