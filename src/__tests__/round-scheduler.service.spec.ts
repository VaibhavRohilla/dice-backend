import { RoundSchedulerService } from '../scheduler/round-scheduler.service';
import { SseHubService } from '../realtime/sse-hub.service';
import { RoundsService } from '../rounds/rounds.service';

const dice = [1, 2, 3, 4, 5, 6];

describe('RoundSchedulerService', () => {
  let hub: jest.Mocked<SseHubService>;
  let rounds: jest.Mocked<RoundsService>;
  let service: RoundSchedulerService;

  beforeEach(() => {
    jest.useFakeTimers();
    hub = { emit: jest.fn() } as any;
    rounds = {
      insertStartedRound: jest.fn(),
      setDiceValues: jest.fn(),
      getLatestRound: jest.fn(),
    } as any;
    service = new RoundSchedulerService(hub, rounds);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects invalid dice', () => {
    const res = service.scheduleRound(1, 1, [1]);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('invalid_dice');
  });

  it('prevents double scheduling', () => {
    const first = service.scheduleRound(1, 1, dice);
    const second = service.scheduleRound(1, 1, dice);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('already_scheduled');
  });

  it('schedules, starts, and finalizes a round', async () => {
    rounds.insertStartedRound.mockResolvedValue({ id: 'r1' } as any);
    rounds.setDiceValues.mockResolvedValue(undefined);

    const res = service.scheduleRound(10, 99, dice);
    expect(res.ok).toBe(true);
    expect(hub.emit).toHaveBeenCalledWith(10, 'round.scheduled', expect.any(Object));

    jest.advanceTimersByTime(2000); // trigger start
    await Promise.resolve();
    expect(rounds.insertStartedRound).toHaveBeenCalledTimes(1);
    expect(hub.emit).toHaveBeenCalledWith(
      10,
      'round.started',
      expect.objectContaining({ roundId: 'r1', chatId: 10 }),
    );

    jest.advanceTimersByTime(26000); // trigger end
    await Promise.resolve();

    expect(rounds.setDiceValues).toHaveBeenCalledWith('r1', dice);
    expect(hub.emit).toHaveBeenCalledWith(
      10,
      'round.result',
      expect.objectContaining({ roundId: 'r1', diceValues: dice }),
    );
    expect(service.getScheduled(10)).toBeNull();
  });

  it('cancels before start', () => {
    service.scheduleRound(5, 5, dice);
    const res = service.cancelRound(5);
    expect(res.ok).toBe(true);
    expect(hub.emit).toHaveBeenCalledWith(5, 'round.cancelled', expect.any(Object));
    jest.advanceTimersByTime(2000);
    expect(rounds.insertStartedRound).not.toHaveBeenCalled();
  });
});

