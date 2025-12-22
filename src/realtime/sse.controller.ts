import { Controller, Get, Res } from '@nestjs/common';
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
  sse(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    this.hub.addClient(res);

    const ping = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        // ignore
        clearInterval(ping);
      }
    }, 15000);

    const scheduled = this.scheduler.getScheduled();
    const outcome = this.scheduler.getOrCreateLastOutcome();
    
    // Send last.outcome only to this new client, not broadcast to all
    const lastOutcomePayload = `event: last.outcome\ndata: ${JSON.stringify({
      diceValues: outcome.diceValues,
      updatedAt: outcome.updatedAt,
      roundId: outcome.roundId ?? null,
      serverNow: Date.now(),
    })}\n\n`;
    res.write(lastOutcomePayload);

    // Check if round is scheduled (before start) or already started (after start, before end)
    if (scheduled) {
      const now = Date.now();
      if (now < scheduled.startAt) {
        // Round is scheduled but not started yet - send scheduled event
        const scheduledPayload = `event: round.scheduled\ndata: ${JSON.stringify({
          startAt: scheduled.startAt,
          endAt: scheduled.endAt,
          totalMs: scheduled.totalMs,
          remainingMs: scheduled.remainingMs,
          serverNow: now,
        })}\n\n`;
        res.write(scheduledPayload);
      } else if (now < scheduled.endAt && scheduled.roundId) {
        // Round has started but not ended - send started event
        const startedPayload = `event: round.started\ndata: ${JSON.stringify({
          roundId: scheduled.roundId,
          startAt: scheduled.startAt,
          endAt: scheduled.endAt,
          totalMs: Math.max(0, scheduled.endAt - scheduled.startAt),
          remainingMs: Math.max(0, scheduled.endAt - now),
          serverNow: now,
        })}\n\n`;
        res.write(startedPayload);
      }
    }

    const cleanup = () => {
      clearInterval(ping);
      this.hub.removeClient(res);
      if (!res.writableEnded) {
        res.end();
      }
    };

    res.on('close', cleanup);
    res.on('error', cleanup);
  }
}
