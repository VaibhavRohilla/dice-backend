import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TelegramApiService {
  private readonly logger = new Logger(TelegramApiService.name);
  private readonly token = process.env.TELEGRAM_BOT_TOKEN;

  async sendMessage(chatId: number, text: string, replyToMessageId?: number) {
    if (!this.token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN missing; cannot sendMessage');
      return { ok: false as const, error: 'missing_token' };
    }

    this.logger.debug(`Sending Telegram message to chat=${chatId}`);

    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    const payload: any = {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    };
    if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json.ok) {
        this.logger.warn(`sendMessage failed: ${JSON.stringify(json)}`);
        return { ok: false as const, error: 'api_error', details: json };
      }
      this.logger.debug(`sendMessage ok to chat=${chatId}`);
      return { ok: true as const };
    } catch (e) {
      this.logger.warn(`sendMessage exception: ${(e as Error).message}`);
      return { ok: false as const, error: 'exception', details: (e as Error).message };
    }
  }
}

