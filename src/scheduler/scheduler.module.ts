import { Module, forwardRef } from '@nestjs/common';
import { RoundSchedulerService } from './round-scheduler.service';
import { RoundsModule } from '../rounds/rounds.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [forwardRef(() => RoundsModule), forwardRef(() => RealtimeModule)],
  providers: [RoundSchedulerService],
  exports: [RoundSchedulerService],
})
export class SchedulerModule {}
