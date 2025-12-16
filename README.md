## Dice Backend (NestJS + Supabase + SSE)

### Prereqs
- Node 18+ with `pnpm` or `npm`.
- Supabase project (service role key available).

### Database (Supabase/Postgres)
Create the table once in SQL editor (adjust schema/database as needed):
```
create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  created_by bigint not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  dice_values integer[] null,
  created_at timestamptz not null default now()
);

create index if not exists rounds_chat_start_idx on rounds (chat_id, start_at desc);
```
If `gen_random_uuid()` is unavailable, enable the `pgcrypto` extension or switch to `uuid_generate_v4()`.

### Environment
- `SUPABASE_URL` — project URL (e.g. `https://<ref>.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (used server-side only)
- `TELEGRAM_BOT_TOKEN` — bot token (required for Telegram replies)
- `ADMIN_IDS` — comma-separated admin user IDs (empty = allow all)
- `PORT` — optional HTTP port (default 3000)

### Install & Run
- Install deps: `pnpm install` (or `npm install`)
- Dev: `npm run start:dev`
- Build: `npm run build`
- Prod: `npm run start:prod` (uses `dist/main.js`)

### Endpoints
- `GET /sse?chatId=<number>` — Server-Sent Events stream per chat. Heartbeat every 15s.
- `GET /rounds/current?chatId=<number>` — Snapshot for UI.
- `POST /telegram/webhook` — Handles `/play` and `/cancel` Telegram updates.

### SSE events
- `last.outcome` — `{ chatId, diceValues, updatedAt, roundId, serverNow }` (sent on connect)
- `round.scheduled` — `{ chatId, startAt, endAt, serverNow }`
- `round.started` — `{ roundId, chatId, startAt, endAt, serverNow }`
- `round.result` — `{ roundId, chatId, diceValues, serverNow }`
- `round.cancelled` — `{ chatId, serverNow }`

### Snapshot responses
- Scheduled: `{ state: "SCHEDULED", chatId, startAt, endAt, lastOutcome, serverNow }`
- Started/Revealed: `{ state: "STARTED_OR_REVEALED", chatId, round, lastOutcome, serverNow }`
- Idle: `{ state: "IDLE", chatId, lastOutcome, serverNow }` (lastOutcome is generated on first access)

### Telegram commands (group chat)
- `/play 1 2 3 4 5 6` (comma/space mixed ok) schedules a round (1.5s buffer, 25s duration).
- `/cancel` before start cancels the scheduled round (no DB writes).

### Manual test (curl)
1) Connect SSE  
`curl -N "http://localhost:3000/sse?chatId=123"`  
Expect first event `last.outcome`. If a round is scheduled, `round.scheduled` follows.

2) Trigger play  
```
curl -X POST http://localhost:3000/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "/play 1 3 6 2 4 5",
      "chat": { "id": 123 },
      "from": { "id": 999 }
    }
  }'
```
Expected: `round.scheduled` immediately, `round.started` ~1.5s, `round.result` ~26.5s with provided dice. Supabase has the round with `dice_values` filled. `last.outcome` updates to the result.

3) Cancel within 1.5s  
```
curl -X POST http://localhost:3000/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "/cancel",
      "chat": { "id": 123 },
      "from": { "id": 999 }
    }
  }'
```
Expected: `round.cancelled`; no DB insert. Snapshot/SSE continue to show last.outcome.

4) Fresh server, no history  
`GET /rounds/current?chatId=123` returns state `IDLE` with generated `lastOutcome`; SSE connect emits `last.outcome` with same dice.

### Telegram replies (Bot API)
- Set env: `TELEGRAM_BOT_TOKEN=...` and `ADMIN_IDS=123456789,987654321`.
- Expose webhook (ngrok/cloudflare) and set webhook to `/telegram/webhook`.
- In Telegram chat (admin):
  - `/warm` -> bot replies `DB ready ✅` or `DB still warming ❌ try again`.
  - `/play 1 2 3 4 5 6` -> replies `Round scheduled ✅ starting in 1.5s` or errors (usage/DB warm/already scheduled).
  - `/cancel` -> replies `Cancelled ✅` or `Too late ❌ already started` / `No round to cancel`.
- Non-admins are ignored silently. Error replies per chat have a short cooldown to avoid spam. No lifecycle messages (started/result) are posted to Telegram.

### DB warmup checks
- Boot warmup (best effort) runs automatically (logs show warmup ok/fail).
- Before `/play`, DB warmup is invoked; if it fails, scheduling is skipped.
- Manual warm (admin):
```
curl -X POST http://localhost:3000/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "text": "/warm",
      "chat": { "id": 123 },
      "from": { "id": 123456789 }
    }
  }'
```
Expect logs showing warmup attempt/result; no DB writes besides Supabase head query. Configure admin allowlist via `ADMIN_IDS` (comma-separated). If unset, /warm is allowed for any sender.

