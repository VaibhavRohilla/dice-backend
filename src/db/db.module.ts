import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DbWarmupService } from './db-warmup.service';

export const SUPABASE_CLIENT = Symbol('SUPABASE_CLIENT');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SUPABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): SupabaseClient => {
        const url = cfg.get<string>('SUPABASE_URL');
        const serviceKey = cfg.get<string>('SUPABASE_SERVICE_ROLE_KEY');
        if (!url) throw new Error('SUPABASE_URL is required');
        if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

        return createClient(url, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
          },
        });
      },
    },
    DbWarmupService,
  ],
  exports: [SUPABASE_CLIENT, DbWarmupService],
})
export class DbModule {}

