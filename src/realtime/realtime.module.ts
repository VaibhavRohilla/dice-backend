import { Module, forwardRef } from '@nestjs/common';
import { SseHubService } from './sse-hub.service';
import { SseController } from './sse.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [forwardRef(() => SchedulerModule)],
  providers: [SseHubService],
  controllers: [SseController],
  exports: [SseHubService],
})
export class RealtimeModule {}
