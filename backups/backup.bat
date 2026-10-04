@echo off
chcp 65001 >nul
title Sao lưu dữ liệu OLP AI KMA 2026
cd /d "%~dp0"
python backup.py %*
if %ERRORLEVEL% NEQ 0 (
    echo [!] Co loi xay ra khi chay backup.py. Vui long kiem tra lai moi truong Python.
)
pause
