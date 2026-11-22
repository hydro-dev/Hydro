@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "ICPC_FONT=Microsoft YaHei"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-resolver.ps1" %*
set "HGNU_RESOLVER_EXIT=%ERRORLEVEL%"
if not "%HGNU_RESOLVER_EXIT%"=="0" pause
exit /b %HGNU_RESOLVER_EXIT%
