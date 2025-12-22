import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { SseHubService } from './sse-hub.service';
import { RoundSchedulerService } from '../scheduler/round-scheduler.service';
import { CHAT_ID } from '../config';

@Controller()
export class SseController {
  constructor(
    private readonly hub: SseHubService,
    private readonly scheduler: RoundSchedulerService,
  ) {}

  @Get('sse')
  sse(@Res() res: Response) {
    const chatId = CHAT_ID;

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
        clearInterval(ping);
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
        totalMs: scheduled.totalMs,
        remainingMs: scheduled.remainingMs,
        serverNow: Date.now(),
      });
    }

    const cleanup = () => {
      clearInterval(ping);
      this.hub.removeClient(chatId, res);
      if (!res.writableEnded) {
        res.end();
      }
    };

    res.on('close', cleanup);
    res.on('error', cleanup);
  }
}
