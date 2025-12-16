import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SseHubService } from './sse-hub.service';
import { RoundSchedulerService } from '../scheduler/round-scheduler.service';

@Controller()
export class SseController {
  constructor(
    private readonly hub: SseHubService,
    private readonly scheduler: RoundSchedulerService,
  ) {}

  @Get('sse')
  sse(@Query('chatId') chatIdRaw: string, @Res() res: Response) {
    const chatId = Number(chatIdRaw);
    if (!Number.isFinite(chatId)) throw new BadRequestException('Invalid chatId');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    this.hub.addClient(chatId, res);

    const ping = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        // ignore
      }
    }, 15000);

    const scheduled = this.scheduler.getScheduled(chatId);
    const outcome = this.scheduler.getOrCreateLastOutcome(chatId);
    this.hub.emit(chatId, 'last.outcome', {
      chatId,
      diceValues: outcome.diceValues,
      updatedAt: outcome.updatedAt,
      roundId: outcome.roundId ?? null,
      serverNow: Date.now(),
    });

    if (scheduled) {
      this.hub.emit(chatId, 'round.scheduled', {
        chatId,
        startAt: scheduled.startAt,
        endAt: scheduled.endAt,
        serverNow: Date.now(),
      });
    }

    res.on('close', () => {
      clearInterval(ping);
      this.hub.removeClient(chatId, res);
      res.end();
    });
  }
}
