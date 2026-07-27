#!/bin/bash
# Cloudflare Tunnel 启动脚本

LOG_FILE="/tmp/cloudflared.log"
URL_FILE="/Users/wkk/Desktop/my-AI-workbench/data/tunnel-url.txt"

# 启动 tunnel
cloudflared tunnel --url http://localhost:3000 > "$LOG_FILE" 2>&1 &
PID=$!

# 等待 URL 出现
for i in $(seq 1 15); do
  sleep 1
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1)
  if [ -n "$URL" ]; then
    echo "$URL" > "$URL_FILE"
    echo "Tunnel started: $URL (PID: $PID)"
    wait $PID
    exit 0
  fi
done

echo "ERROR: Tunnel failed to get URL" >&2
exit 1
