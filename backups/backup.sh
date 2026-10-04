#!/usr/bin/env bash
# Script sao lưu OLP AI KMA 2026 trên Linux/Ubuntu
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

if command -v python3 &>/dev/null; then
    python3 backup.py "$@"
elif command -v python &>/dev/null; then
    python backup.py "$@"
else
    echo "[!] Không tìm thấy Python. Vui lòng cài đặt python3."
    exit 1
fi
