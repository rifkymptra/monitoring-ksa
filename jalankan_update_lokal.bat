@echo off
chcp 65001 >nul
echo ============================================================================
echo   UPDATE INKREMENTAL LOKAL - DETEKSI DUPLIKASI FOTO UBINAN BPS GARUT
echo ============================================================================
echo.
cd /d "%~dp0"
python run_incremental_github.py
echo.
echo ============================================================================
echo   Proses selesai! Tekan tombol apa saja untuk menutup jendela ini.
echo ============================================================================
pause >nul
