import { Module } from '@nestjs/common';
import { DbWarmupService } from './db-warmup.service';

@Module({
  providers: [DbWarmupService],
  exports: [DbWarmupService],
})
export class DbModule {}

