import { Injectable } from '@nestjs/common';
import { Response } from 'express';

@Injectable()
export class SseHubService {
  private readonly groups = new Map<number, Set<Response>>();

  addClient(chatId: number, res: Response) {
    const set = this.groups.get(chatId) ?? new Set<Response>();
    set.add(res);
    this.groups.set(chatId, set);
    res.on('close', () => this.removeClient(chatId, res));
  }

  removeClient(chatId: number, res: Response) {
    const set = this.groups.get(chatId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.groups.delete(chatId);
  }

  emit(chatId: number, event: string, data: unknown) {
    const set = this.groups.get(chatId);
    if (!set || set.size === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of set) {
      try {
        client.write(payload);
      } catch {
        // ignore broken pipes
      }
    }
  }
}
