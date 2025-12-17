import { Controller, Get } from '@nestjs/common';
import { RoundSchedulerService } from '../scheduler/round-scheduler.service';
import { RoundsService } from './rounds.service';
import { CHAT_ID } from '../config';

@Controller('rounds')
export class RoundsController {
  constructor(
    private readonly scheduler: RoundSchedulerService,
    private readonly rounds: RoundsService,
  ) {}

  @Get('current')
  async current() {
    const chatId = CHAT_ID;

    const lastOutcome = this.scheduler.getOrCreateLastOutcome(chatId);
    const scheduled = this.scheduler.getScheduled(chatId);
    if (scheduled) {
      return {
        state: 'SCHEDULED',
        chatId,
        startAt: scheduled.startAt,
        endAt: scheduled.endAt,
        totalMs: scheduled.totalMs,
        remainingMs: scheduled.remainingMs,
        lastOutcome: {
          diceValues: lastOutcome.diceValues,
          updatedAt: lastOutcome.updatedAt,
          roundId: lastOutcome.roundId ?? null,
        },
        serverNow: Date.now(),
      };
    }

    const latest = await this.rounds.getLatestRound(chatId);
    if (latest) {
      return {
        state: 'STARTED_OR_REVEALED',
        chatId,
        round: {
          id: latest.id,
          name: latest.name,
          startAt: latest.startAt.getTime(),
          endAt: latest.endAt.getTime(),
          diceValues: latest.diceValues,
          totalMs: Math.max(0, latest.endAt.getTime() - latest.startAt.getTime()),
          remainingMs: Math.max(0, latest.endAt.getTime() - Date.now()),
        },
        lastOutcome: {
          diceValues: lastOutcome.diceValues,
          updatedAt: lastOutcome.updatedAt,
          roundId: lastOutcome.roundId ?? null,
        },
        serverNow: Date.now(),
      };
    }

    return {
      state: 'IDLE',
      chatId,
      lastOutcome: {
        diceValues: lastOutcome.diceValues,
        updatedAt: lastOutcome.updatedAt,
        roundId: lastOutcome.roundId ?? null,
      },
      serverNow: Date.now(),
    };
  }
}
