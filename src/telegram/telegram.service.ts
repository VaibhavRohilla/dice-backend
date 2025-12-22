import { Injectable, Logger } from '@nestjs/common';
import { DbWarmupService } from '../db/db-warmup.service';
import { RoundSchedulerService } from '../scheduler/round-scheduler.service';
import { TelegramApiService } from './telegram-api.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly adminIds = this.loadAdminIds();
  private readonly replyCooldownMs = 1500;
  private readonly lastErrorReplyAt = new Map<number, number>(); // chatId -> ts

  constructor(
    private readonly scheduler: RoundSchedulerService,
    private readonly dbWarm: DbWarmupService,
    private readonly tgApi: TelegramApiService,
  ) {}

  async handleUpdate(update: any) {
    this.logger.debug(`Update received: ${JSON.stringify(update)}`);

    // Accept both new messages and edited messages (Telegram may send edits for commands)
    const msg = update?.message ?? update?.edited_message;
    const text: string | undefined = msg?.text;
    const chatId = msg?.chat?.id;
    const fromId = msg?.from?.id;
    const messageId = msg?.message_id;

    if (!Number.isFinite(chatId) || !Number.isFinite(fromId) || typeof text !== 'string') {
      this.logger.debug('Update ignored: missing chat/from/text');
      return;
    }

    if (!this.isAdmin(fromId)) {
      this.logger.debug(`Ignored non-admin userId=${fromId}`);
      return;
    }

    // ---------- /warm ----------
    if (text.startsWith('/warm')) {
      const ok = await this.safeWarm(3000, 3);
      await this.tgApi.sendMessage(
        chatId,
        ok ? 'DB ready ✅' : 'DB still warming ❌ try again',
        Number.isFinite(messageId) ? messageId : undefined,
      );
      this.logger.debug(`/warm reply sent to chat ${chatId}`);
      return;
    }

    // ---------- /play ----------
    if (text.startsWith('/play')) {
      const diceValues = this.parseDiceValues(text);
      if (!diceValues) {
        await this.replyError(chatId, 'Usage: /play 1 2 3 4 5 6', messageId);
        return;
      }

      const ok = await this.safeWarm(2500, 2);
      if (!ok) {
        await this.replyError(chatId, 'DB warming ❌ try again', messageId);
        return;
      }

      // Extract admin name from Telegram message
      const adminName: string | null = this.getAdminName(msg?.from);

      const res = await this.scheduler.scheduleRound(Number(fromId), diceValues, adminName);
      if (!res.ok) {
        const msgText =
          res.reason === 'already_scheduled'
            ? 'Round already active ⏳ Please wait for the current round to end'
            : `Cannot schedule ❌ (${res.reason})`;
        await this.replyError(chatId, msgText, messageId);
        return;
      }
      await this.tgApi.sendMessage(
        chatId,
        'Round scheduled ✅ starting in 1.5s',
        Number.isFinite(messageId) ? messageId : undefined,
      );
      this.logger.debug(`/play scheduled for chat ${chatId}`);
      return;
    }

    // ---------- /cancel ----------
    if (text.startsWith('/cancel')) {
      const res = this.scheduler.cancelRound();
      if (!res.ok) {
        const msgText =
          res.reason === 'too_late'
            ? 'Too late ❌ already started'
            : res.reason === 'nothing_to_cancel'
              ? 'No round to cancel'
              : `Cancel ignored ❌ (${JSON.stringify(res)})`;
        await this.replyError(chatId, msgText, messageId);
        return;
      }
      await this.tgApi.sendMessage(
        chatId,
        'Cancelled ✅',
        Number.isFinite(messageId) ? messageId : undefined,
      );
      this.logger.debug(`/cancel processed for chat ${chatId}`);
    }
  }

  private async safeWarm(timeoutMs: number, retries: number) {
    try {
      return await this.dbWarm.ensureReady({ timeoutMs, retries });
    } catch (e) {
      this.logger.warn(`Warmup error: ${(e as Error).message}`);
      return false;
    }
  }

  private canReplyError(chatId: number) {
    const now = Date.now();
    const last = this.lastErrorReplyAt.get(chatId) ?? 0;
    if (now - last < this.replyCooldownMs) return false;
    this.lastErrorReplyAt.set(chatId, now);
    return true;
  }

  private async replyError(chatId: number, text: string, replyToMessageId?: number) {
    if (!this.canReplyError(chatId)) return;
    await this.tgApi.sendMessage(
      chatId,
      text,
      Number.isFinite(replyToMessageId) ? replyToMessageId : undefined,
    );
  }

  private isAdmin(userId: number): boolean {
    if (this.adminIds.size === 0) return true; // permissive fallback
    return this.adminIds.has(userId);
  }

  private loadAdminIds(): Set<number> {
    const raw = process.env.ADMIN_IDS;
    if (!raw) return new Set();
    return new Set(
      raw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n)),
    );
  }

  private parseDiceValues(text: string): number[] | null {
    const tail = text.replace(/^\/play/i, '').trim();
    const parts = tail.split(/[\s,]+/).filter(Boolean);
    if (parts.length !== 6) return null;

    const dice = parts.map(Number);
    if (dice.some((v) => !Number.isInteger(v) || v < 1 || v > 6)) return null;
    return dice;
  }

  private getAdminName(from: any): string | null {
    if (!from) return null;
    
    // Try first_name + last_name
    if (typeof from.first_name === 'string') {
      const firstName = from.first_name;
      const lastName = typeof from.last_name === 'string' ? from.last_name : '';
      const fullName = lastName ? `${firstName} ${lastName}`.trim() : firstName;
      if (fullName) return fullName;
    }
    
    // Fallback to username
    if (typeof from.username === 'string' && from.username) {
      return from.username;
    }
    
    return null;
  }
}
