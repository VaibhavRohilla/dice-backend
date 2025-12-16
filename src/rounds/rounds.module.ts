import { Module, forwardRef } from '@nestjs/common';
import { RoundsService } from './rounds.service';
import { RoundsController } from './rounds.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { DbModule } from '../db/db.module';

@Module({
  imports: [
    DbModule,
    forwardRef(() => SchedulerModule),
  ],
  providers: [RoundsService],
  controllers: [RoundsController],
  exports: [RoundsService],
})
export class RoundsModule {}
