import { Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './db.module';

@Injectable()
export class DbWarmupService {
  private readonly logger = new Logger(DbWarmupService.name);

  private ready = false;
  private warming: Promise<boolean> | null = null;
  private lastOkAt: number | null = null;

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  isReady() {
    return this.ready;
  }

  lastReadyAt() {
    return this.lastOkAt;
  }

  /**
   * Ensures DB is awake/connected enough to do reads/writes.
   * Idempotent. Safe to call on every /play.
   */
  async ensureReady(opts?: { timeoutMs?: number; retries?: number; backoffMs?: number }): Promise<boolean> {
    if (this.ready) return true;
    if (this.warming) return this.warming;

    const timeoutMs = opts?.timeoutMs ?? 2500;
    const retries = opts?.retries ?? 2; // total attempts = 1 + retries
    const backoffMs = opts?.backoffMs ?? 400;

    this.warming = this.withTimeout(this.tryPingLoop(retries, backoffMs), timeoutMs)
      .then((ok) => {
        this.ready = ok;
        if (ok) this.lastOkAt = Date.now();
        return ok;
      })
      .catch((e) => {
        this.logger.warn(`DB warmup timed out/failed: ${(e as Error).message}`);
        this.ready = false;
        return false;
      })
      .finally(() => {
        this.warming = null;
      });

    return this.warming;
  }

  private async tryPingLoop(retries: number, backoffMs: number): Promise<boolean> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { error } = await this.supabase.from('rounds').select('id', { head: true, count: 'exact' }).limit(1);
        if (error) throw error;
        this.logger.log(`DB warmup ok (attempt ${attempt + 1})`);
        return true;
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        this.logger.warn(`DB ping failed (attempt ${attempt + 1}/${retries + 1}): ${msg}`);
        if (attempt < retries) await this.sleep(backoffMs * (attempt + 1));
      }
    }
    return false;
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
    let t: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
      t.unref?.();
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (t) clearTimeout(t);
    }
  }
}

