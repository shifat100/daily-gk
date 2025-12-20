@echo off
set URL=https://shifat100.github.io/daily-gk/

:: Google Chrome থাকলে App Mode এ ওপেন হবে
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%URL%
    exit
)

if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=%URL%
    exit
)

:: Chrome না থাকলে ডিফল্ট ব্রাউজারে নতুন ট্যাবে ওপেন হবে
start "" %URL%
