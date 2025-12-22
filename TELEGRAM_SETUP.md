# Telegram Bot Webhook Setup Guide

## Current Status

Your bot token is configured in `.env`:
```
TELEGRAM_BOT_TOKEN=8299008465:AAFLiXz1w1voPx2v2T90mRqmPqElUJy1YWE
```

## The Problem

The "chat not found" error you're seeing means:
- ✅ Your webhook endpoint is working
- ✅ The bot token is being used
- ❌ The chat ID `1` doesn't exist in Telegram (it's a test value)

But more importantly, **Telegram needs to know where to send updates**. You need to configure Telegram to send webhook updates to your server.

## Step 1: Make Your Server Accessible

### Option A: Local Testing with ngrok

1. Install ngrok: https://ngrok.com/download
2. Start your backend server:
   ```bash
   cd dice-backend
   npm run start:dev
   ```
3. In another terminal, expose it:
   ```bash
   ngrok http 3000
   ```
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Option B: Production (Public Server)

Use your actual domain where the backend is hosted.

## Step 2: Set the Webhook URL

### Using the Setup Script

```bash
cd dice-backend
# For ngrok (replace with your ngrok URL)
./setup-telegram-webhook.sh https://your-ngrok-url.ngrok.io/telegram/webhook

# For production
./setup-telegram-webhook.sh https://yourdomain.com/telegram/webhook
```

### Manual Setup (using curl)

```bash
TOKEN="8299008465:AAFLiXz1w1voPx2v2T90mRqmPqElUJy1YWE"
WEBHOOK_URL="https://your-ngrok-url.ngrok.io/telegram/webhook"

curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${WEBHOOK_URL}\"}"
```

### Check Webhook Status

```bash
TOKEN="8299008465:AAFLiXz1w1voPx2v2T90mRqmPqElUJy1YWE"

curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-url.ngrok.io/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

## Step 3: Get Your Real Chat ID

Once the webhook is set up:

1. Send a message to your bot in Telegram (e.g., `/start` or `/warm`)
2. Check your server logs - you'll see the real chat ID in the logs
3. Update your `.env` file:
   ```
   CHAT_ID=<your-real-chat-id>
   ```
4. Restart your server

## Step 4: Test

1. Send `/warm` to your bot in Telegram
2. You should see in server logs:
   ```
   [TelegramService] Update received: ...
   [TelegramApiService] Sending Telegram message to chat=<real-id>
   [TelegramApiService] sendMessage ok to chat=<real-id>
   ```
3. You should receive the reply in Telegram: `DB ready ✅` or `DB still warming ❌ try again`

## Troubleshooting

### "Webhook was set" but not receiving updates

1. Check webhook info: `curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"`
2. Check for errors in the `last_error_message` field
3. Verify your server is accessible from the internet
4. Check server logs for incoming requests

### "chat not found" error

- This means the chat ID in your test doesn't exist
- Use the real chat ID from when you message the bot
- Update `.env` CHAT_ID with the real value

### Bot doesn't respond

1. Verify `ADMIN_IDS` in `.env` includes your Telegram user ID
2. Get your user ID: message @userinfobot on Telegram
3. Update `.env`: `ADMIN_IDS=your-user-id`

## Security Note

⚠️ **Never commit your bot token to git!** It's already in `.env` which should be in `.gitignore`.

