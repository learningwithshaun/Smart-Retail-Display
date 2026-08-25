#!/usr/bin/env bash
set -euo pipefail

# Change this to the IP/hostname of the machine running FastAPI if it is remote.
DISPLAY_URL="${DISPLAY_URL:-http://127.0.0.1:8000}"

chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  "$DISPLAY_URL"

