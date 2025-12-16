import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { RoundsModule } from './rounds/rounds.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { TelegramModule } from './telegram/telegram.module';
import { DbModule } from './db/db.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        uri: cfg.get<string>('MONGO_URI'),
      }),
    }),
    DbModule,
    BootstrapModule,
    RealtimeModule,
    SchedulerModule,
    RoundsModule,
    TelegramModule,
  ],
})
export class AppModule {}
