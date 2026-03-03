@echo off
echo Resetting WhatsApp Business Pro...
echo 1. Cleaning Backend Session...
rmdir /s /q backend\.wwebjs_auth
rmdir /s /q backend\.wwebjs_cache
del /f backend\server.log
echo 2. Cleaning Media Cache...
rmdir /s /q backend\media_cache
echo 3. Reset Done! 
echo Please restart the servers to scan the QR code again.
pause
