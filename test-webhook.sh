#!/bin/bash
# Test script for Telegram webhook commands

# Default values (update if needed)
PORT=${PORT:-3000}
CHAT_ID=${CHAT_ID:-1}
# Use ADMIN_IDS from .env if available, otherwise default
ADMIN_ID=${ADMIN_ID:-6038553907}

echo "Testing Telegram webhook on port $PORT"
echo "Using CHAT_ID=$CHAT_ID, ADMIN_ID=$ADMIN_ID"
echo ""

echo "=== Testing /warm command ==="
curl -X POST http://localhost:$PORT/telegram/webhook \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": {
      \"text\": \"/warm\",
      \"chat\": { \"id\": $CHAT_ID },
      \"from\": { \"id\": $ADMIN_ID },
      \"message_id\": 1
    }
  }" \
  -w "\nHTTP Status: %{http_code}\n"

echo ""
echo "=== Test complete ==="
echo "Check server logs to see if DB warmup was successful"
echo "If TELEGRAM_BOT_TOKEN is set, check Telegram chat for reply: 'DB ready ✅' or 'DB still warming ❌ try again'"

