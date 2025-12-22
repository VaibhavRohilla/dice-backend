import { Injectable } from '@nestjs/common';
import { Response } from 'express';

@Injectable()
export class SseHubService {
  private readonly clients = new Set<Response>();

  addClient(res: Response) {
    this.clients.add(res);
    res.on('close', () => this.removeClient(res));
  }

  removeClient(res: Response) {
    this.clients.delete(res);
  }

  emit(event: string, data: unknown) {
    if (this.clients.size === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        // ignore broken pipes
      }
    }
  }
}
