import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { RoundSchedulerService } from '../scheduler/round-scheduler.service';
import { RoundsService } from './rounds.service';

@Controller('rounds')
export class RoundsController {
  constructor(
    private readonly scheduler: RoundSchedulerService,
    private readonly rounds: RoundsService,
  ) {}

  @Get('current')
  async current(@Query('chatId') chatIdRaw: string) {
    const chatId = Number(chatIdRaw);
    if (!Number.isFinite(chatId)) throw new BadRequestException('Invalid chatId');

    const lastOutcome = this.scheduler.getOrCreateLastOutcome(chatId);
    const scheduled = this.scheduler.getScheduled(chatId);
    if (scheduled) {
      return {
        state: 'SCHEDULED',
        chatId,
        startAt: scheduled.startAt,
        endAt: scheduled.endAt,
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
          id: String(latest._id),
          startAt: latest.startAt.getTime(),
          endAt: latest.endAt.getTime(),
          diceValues: latest.diceValues,
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
