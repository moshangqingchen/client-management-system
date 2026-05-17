@echo off
set "APP_DIR=%~dp0.."
cd /d "%APP_DIR%"
start "" "%APP_DIR%\node_modules\electron\dist\electron.exe" .
