import { Module, forwardRef } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { DbModule } from '../db/db.module';
import { TelegramApiService } from './telegram-api.service';

@Module({
  imports: [forwardRef(() => SchedulerModule), DbModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramApiService],
})
export class TelegramModule {}
