$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem apps/desktop/src-tauri/target/release/bundle/nsis/*-setup.exe | Select-Object -First 1
if (!$installer) { throw 'NSIS installer not found' }
$installation = Start-Process $installer.FullName -ArgumentList '/S' -Wait -PassThru
if ($installation.ExitCode -ne 0) { throw "Installer failed: $($installation.ExitCode)" }
$candidates = @("$env:LOCALAPPDATA/VeloraDesk/VeloraDesk.exe", "$env:LOCALAPPDATA/Programs/VeloraDesk/VeloraDesk.exe")
$executable = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (!$executable) { throw 'Installed application not found' }
$application = Start-Process $executable -PassThru
try {
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 500
    $application.Refresh()
    if ($application.HasExited) { throw 'Application exited before opening its window' }
    if ($application.MainWindowHandle -ne 0) { break }
  }
  if ($application.MainWindowHandle -eq 0) { throw 'No native application window appeared' }
  if ($application.MainWindowTitle -notmatch 'VeloraDesk') { throw 'Unexpected window title' }
  $protocol = Get-ItemProperty 'HKCU:/Software/Classes/veloradesk/shell/open/command'
  if (!$protocol.'(default)') { throw 'Custom-scheme callback is not registered' }
  $second = Start-Process $executable -ArgumentList 'veloradesk://auth/callback?code=smoke&state=smoke' -PassThru
  if (!$second.WaitForExit(10000)) { throw 'Second instance did not forward and exit' }
  $application.Refresh()
  if ($application.HasExited) { throw 'Original instance exited after callback' }
  if (!$application.CloseMainWindow()) { throw 'Application did not accept normal close' }
  if (!$application.WaitForExit(10000)) { throw 'Application did not exit cleanly' }
  if ($application.ExitCode -ne 0) { throw "Application exit code: $($application.ExitCode)" }
  Write-Output 'Per-user install, native window, registered callback, single instance and normal exit passed.'
} finally {
  $application.Refresh()
  if (!$application.HasExited) { Stop-Process -Id $application.Id -Force }
}
