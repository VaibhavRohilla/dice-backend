import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RoundsModule } from './rounds/rounds.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TelegramModule } from './telegram/telegram.module';
import { DbModule } from './db/db.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    BootstrapModule,
    RealtimeModule,
    SchedulerModule,
    RoundsModule,
    TelegramModule,
  ],
})
export class AppModule {}
