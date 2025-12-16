import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Round, RoundSchema } from './rounds.schema';
import { RoundsService } from './rounds.service';
import { RoundsController } from './rounds.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Round.name, schema: RoundSchema }]),
    forwardRef(() => SchedulerModule),
  ],
  providers: [RoundsService],
  controllers: [RoundsController],
  exports: [RoundsService],
})
export class RoundsModule {}
