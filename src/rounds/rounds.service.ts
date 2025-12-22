import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../db/db.tokens';
import { RoundRecord, RoundRow } from './rounds.types';

@Injectable()
export class RoundsService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async insertStartedRound(input: {
    name: string | null;
    createdBy: number;
    startAt: Date;
    endAt: Date;
  }): Promise<RoundRecord> {
    const now = new Date();
    const { data, error } = await this.supabase
      .from('rounds')
      .insert([
        {
          chat_id: 0, // Dummy value, not used
          name: input.name,
          created_by: input.createdBy,
          start_at: input.startAt.toISOString(),
          end_at: input.endAt.toISOString(),
          dice_values: null,
          created_at: now.toISOString(),
        },
      ])
      .select()
      .maybeSingle();

    if (error || !data) {
      throw new Error(`insertStartedRound failed: ${error?.message ?? 'no data returned'}`);
    }

    return this.mapRoundRow(data);
  }

  async setDiceValues(roundId: string, diceValues: number[]): Promise<void> {
    const { error } = await this.supabase.from('rounds').update({ dice_values: diceValues }).eq('id', roundId);
    if (error) throw new Error(`setDiceValues failed: ${error.message}`);
  }

  async markRoundCancelled(roundId: string): Promise<void> {
    const { error } = await this.supabase.from('rounds').update({ dice_values: [] }).eq('id', roundId);
    if (error) throw new Error(`markRoundCancelled failed: ${error.message}`);
  }

  async getLatestRound(): Promise<RoundRecord | null> {
    const { data, error } = await this.supabase
      .from('rounds')
      .select('*')
      .order('start_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // PGRST116 => no rows when using maybeSingle
      if (error.code === 'PGRST116') return null;
      throw new Error(`getLatestRound failed: ${error.message}`);
    }

    return data ? this.mapRoundRow(data) : null;
  }

  private mapRoundRow(row: RoundRow): RoundRecord {
    return {
      id: String(row.id),
      name: row.name,
      createdBy: row.created_by,
      startAt: new Date(row.start_at),
      endAt: new Date(row.end_at),
      diceValues: row.dice_values,
      createdAt: new Date(row.created_at),
    };
  }
}
