#!/bin/bash
# Script to set up Telegram webhook

# Load token from .env
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "❌ TELEGRAM_BOT_TOKEN not found in .env file"
  exit 1
fi

# Get webhook URL (update this with your actual public URL)
# For local testing, use ngrok or similar
WEBHOOK_URL="${1:-http://localhost:3000/telegram/webhook}"

if [ "$WEBHOOK_URL" = "http://localhost:3000/telegram/webhook" ]; then
  echo "⚠️  Using localhost URL. For production, use a public URL (e.g., https://yourdomain.com/telegram/webhook)"
  echo "   For local testing, expose your server with ngrok: ngrok http 3000"
  echo ""
  read -p "Continue with localhost? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "Setting webhook URL: $WEBHOOK_URL"
echo ""

# Set webhook via Telegram API
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${WEBHOOK_URL}\"}")

echo "Telegram API Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Check webhook info
echo "Getting webhook info..."
WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo")
echo "$WEBHOOK_INFO" | jq '.' 2>/dev/null || echo "$WEBHOOK_INFO"

