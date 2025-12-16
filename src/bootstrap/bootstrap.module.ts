import { Module, OnModuleInit } from '@nestjs/common';
import { DbWarmupService } from '../db/db-warmup.service';
import { DbModule } from '../db/db.module';

@Module({
  imports: [DbModule],
})
export class BootstrapModule implements OnModuleInit {
  constructor(private readonly dbWarm: DbWarmupService) {}

  async onModuleInit() {
    // Best effort warmup; do not block startup indefinitely
    await this.dbWarm.ensureReady({ timeoutMs: 1500, retries: 1 });
  }
}

