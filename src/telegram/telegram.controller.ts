import { Body, Controller, Post } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly tg: TelegramService) {}

  @Post('webhook')
  async webhook(@Body() update: any) {
    await this.tg.handleUpdate(update);
    return { ok: true };
  }
}


