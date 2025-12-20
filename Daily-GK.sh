#!/bin/bash

URL="https://shifat100.github.io/daily-gk/"

# Google Chrome → App Mode
if command -v google-chrome >/dev/null 2>&1; then
    google-chrome --app="$URL" >/dev/null 2>&1 &
    exit 0
fi

# Chromium → App Mode
if command -v chromium >/dev/null 2>&1; then
    chromium --app="$URL" >/dev/null 2>&1 &
    exit 0
fi

# Firefox → Minimal UI (App-like)
if command -v firefox >/dev/null 2>&1; then
    firefox --new-window "$URL" >/dev/null 2>&1 &
    exit 0
fi

# Fallback → Default browser
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
    exit 0
fi

echo "No supported browser found!"
