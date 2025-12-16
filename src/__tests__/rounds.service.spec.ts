import { RoundsService } from '../rounds/rounds.service';
import { RoundRecord, RoundRow } from '../rounds/rounds.types';

const sampleRow: RoundRow = {
  id: 'abc-123',
  chat_id: 42,
  created_by: 99,
  start_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  end_at: new Date('2024-01-01T00:00:30Z').toISOString(),
  dice_values: [1, 2, 3, 4, 5, 6],
  created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
};

function createSupabaseMock() {
  const insertResult: { data: RoundRow | null; error: { message: string } | null } = {
    data: sampleRow,
    error: null,
  };
  const selectResult: { data: RoundRow | null; error: { code?: string; message: string } | null } = {
    data: sampleRow,
    error: null,
  };
  const updateErrorRef: { value: { message: string } | null } = { value: null };

  const maybeSingle = jest.fn(async () => selectResult);
  const select = jest.fn(() => ({
    eq: jest.fn(() => ({
      order: jest.fn(() => ({
        limit: jest.fn(() => ({ maybeSingle })),
      })),
    })),
  }));

  const update = jest.fn(() => ({
    eq: jest.fn(async () => ({ error: updateErrorRef.value })),
  }));

  const insertMaybeSingle = jest.fn(async () => insertResult);
  const insert = jest.fn(() => ({
    select: jest.fn(() => ({ maybeSingle: insertMaybeSingle })),
  }));

  const from = jest.fn(() => ({ insert, update, select }));

  return {
    supabase: { from } as any,
    fns: { insert, insertMaybeSingle, update, select, maybeSingle },
    controls: { insertResult, selectResult, updateErrorRef },
  };
}

describe('RoundsService (Supabase)', () => {
  it('maps insertStartedRound response correctly', async () => {
    const mock = createSupabaseMock();
    const svc = new RoundsService(mock.supabase);
    const res = await svc.insertStartedRound({
      chatId: 42,
      createdBy: 99,
      startAt: new Date(sampleRow.start_at),
      endAt: new Date(sampleRow.end_at),
    });

    expect(mock.supabase.from).toHaveBeenCalledWith('rounds');
    expect(mock.fns.insert).toHaveBeenCalledTimes(1);
    expect(mock.fns.insertMaybeSingle).toHaveBeenCalledTimes(1);

    expect(res).toMatchObject<Partial<RoundRecord>>({
      id: sampleRow.id,
      chatId: sampleRow.chat_id,
      createdBy: sampleRow.created_by,
      diceValues: sampleRow.dice_values,
    });
    expect(res.startAt.getTime()).toBe(new Date(sampleRow.start_at).getTime());
    expect(res.endAt.getTime()).toBe(new Date(sampleRow.end_at).getTime());
  });

  it('throws on insert error', async () => {
    const mock = createSupabaseMock();
    mock.controls.insertResult.data = null as any;
    mock.controls.insertResult.error = { message: 'boom' };
    const svc = new RoundsService(mock.supabase);

    await expect(
      svc.insertStartedRound({
        chatId: 1,
        createdBy: 2,
        startAt: new Date(),
        endAt: new Date(),
      }),
    ).rejects.toThrow('boom');
  });

  it('updates dice values', async () => {
    const mock = createSupabaseMock();
    const svc = new RoundsService(mock.supabase);

    await svc.setDiceValues('abc', [1, 2, 3, 4, 5, 6]);

    expect(mock.fns.update).toHaveBeenCalledTimes(1);
  });

  it('throws on update error', async () => {
    const mock = createSupabaseMock();
    mock.controls.updateErrorRef.value = { message: 'fail' };
    const svc = new RoundsService(mock.supabase);

    await expect(svc.setDiceValues('id', [1, 2, 3, 4, 5, 6])).rejects.toThrow('fail');
  });

  it('returns null when no latest round', async () => {
    const mock = createSupabaseMock();
    mock.controls.selectResult.data = null;
    mock.controls.selectResult.error = { code: 'PGRST116', message: 'No rows' };
    const svc = new RoundsService(mock.supabase);

    const res = await svc.getLatestRound(42);
    expect(res).toBeNull();
  });

  it('returns mapped latest round', async () => {
    const mock = createSupabaseMock();
    const svc = new RoundsService(mock.supabase);

    const res = await svc.getLatestRound(42);

    expect(mock.fns.select).toHaveBeenCalled();
    expect(res?.id).toBe(sampleRow.id);
    expect(res?.chatId).toBe(sampleRow.chat_id);
    expect(res?.diceValues).toEqual(sampleRow.dice_values);
  });
});

