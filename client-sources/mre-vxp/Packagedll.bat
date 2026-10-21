"C:\MRE-SDK\tools\DllPackage.exe" "G:\Apps\Sources\mre\daily-gk\daily-gk.vcproj"
if %errorlevel% == 0 (
 echo postbuild OK.
  copy daily-gk.vpp ..\..\..\MoDIS_VC9\WIN32FS\DRIVE_E\daily-gk.vpp /y
exit 0
)else (
echo postbuild error
  echo error code: %errorlevel%
  exit 1
)

