$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem apps/desktop/src-tauri/target/release/bundle/nsis/*-setup.exe | Select-Object -First 1
if (!$installer) { throw 'NSIS installer not found' }
$installation = Start-Process $installer.FullName -ArgumentList '/S' -Wait -PassThru
if ($installation.ExitCode -ne 0) { throw "Installer failed: $($installation.ExitCode)" }
$candidates = @("$env:LOCALAPPDATA/Kimpor Workspace/KimporWorkspace.exe", "$env:LOCALAPPDATA/Programs/Kimpor Workspace/KimporWorkspace.exe")
$executable = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (!$executable) { throw 'Installed application not found' }
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$application = Start-Process $executable -PassThru
$evidence = @{ runner = $env:RUNNER_OS; measured_at = [DateTime]::UtcNow.ToString('o'); installer = $installer.Name }
try {
  for ($attempt = 0; $attempt -lt 150; $attempt++) {
    Start-Sleep -Milliseconds 200
    $application.Refresh()
    if ($application.HasExited) { throw 'Application exited before opening its window' }
    if ($application.MainWindowHandle -ne 0) { break }
  }
  $clock.Stop()
  $evidence.native_window_ms = $clock.ElapsedMilliseconds
  if ($application.MainWindowHandle -eq 0) { throw 'No native application window appeared' }
  if ($application.MainWindowTitle -notmatch 'Kimpor Workspace') { throw 'Unexpected window title' }
  $protocol = Get-ItemProperty 'HKCU:/Software/Classes/kimpor-workspace/shell/open/command'
  if (!$protocol.'(default)') { throw 'Custom-scheme callback is not registered' }
  $second = Start-Process $executable -ArgumentList 'kimpor-workspace://auth/callback?code=smoke&state=smoke' -PassThru
  if (!$second.WaitForExit(10000)) { throw 'Second instance did not forward and exit' }
  $application.Refresh()
  if ($application.HasExited) { throw 'Original instance exited after callback' }
  $evidence.callback_registration = $true
  $evidence.single_instance = $true
  # Aggregate the installed app and its WebView2 descendants, rather than only
  # reporting the small Rust host. Runner metrics do not replace a Windows PC test.
  Start-Sleep -Seconds 3
  function Get-AppProcessTree {
    $all = @(Get-CimInstance Win32_Process)
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    [void]$ids.Add($application.Id)
    do {
      $added = $false
      foreach ($item in $all) {
        if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $added = $true }
      }
    } while ($added)
    @($ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
  }
  $before = @(Get-AppProcessTree)
  $cpuBefore = ($before | Measure-Object CPU -Sum).Sum
  $idleClock = [System.Diagnostics.Stopwatch]::StartNew()
  Start-Sleep -Seconds 5
  $after = @(Get-AppProcessTree)
  $idleClock.Stop()
  $cpuAfter = ($after | Measure-Object CPU -Sum).Sum
  $evidence.idle_working_set_bytes = [long](($after | Measure-Object WorkingSet64 -Sum).Sum)
  $evidence.idle_cpu_percent = [Math]::Round([Math]::Max(0, ($cpuAfter - $cpuBefore)) / $idleClock.Elapsed.TotalSeconds / [Environment]::ProcessorCount * 100, 3)
  $evidence.process_count = $after.Count
  $evidence.budgets = @{ native_window_ms = 2000; idle_working_set_bytes = 150MB; idle_cpu_percent = 2 }
  if (!$application.CloseMainWindow()) { throw 'Application did not accept normal close' }
  if (!$application.WaitForExit(10000)) { throw 'Application did not exit cleanly' }
  if ($application.ExitCode -ne 0) { throw "Application exit code: $($application.ExitCode)" }
  $evidence.normal_exit = $true
  $folder = Split-Path $executable
  $uninstaller = Get-ChildItem $folder -Filter '*uninstall*.exe' | Select-Object -First 1
  if (!$uninstaller) { throw 'Per-user uninstaller not found' }
  $removal = Start-Process $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
  if ($removal.ExitCode -ne 0) { throw "Uninstall failed: $($removal.ExitCode)" }
  for ($attempt = 0; $attempt -lt 30 -and (Test-Path $executable); $attempt++) { Start-Sleep -Milliseconds 200 }
  if (Test-Path $executable) { throw 'Installed application executable remains after uninstall' }
  if (Test-Path 'HKCU:/Software/Classes/kimpor-workspace/shell/open/command') { throw 'Custom-scheme registration remains after uninstall' }
  $evidence.uninstall = $true
  # Enforce published Windows budgets. The native-window metric is a lower bound
  # for full first-render readiness; physical-device checks cover the latter.
  if ($evidence.native_window_ms -gt 2000) { throw 'Native window startup exceeds the 2 second budget.' }
  if ($evidence.idle_working_set_bytes -gt 150MB) { throw 'App and WebView2 idle RAM exceed the 150 MiB budget.' }
  if ($evidence.idle_cpu_percent -gt 2) { throw 'App and WebView2 idle CPU exceed the 2 percent budget.' }
  $evidence.result = 'passed'
  Write-Output 'Per-user install, native window, callback registration, single instance, idle budgets and uninstall passed.'
} catch {
  $evidence.result = 'failed'
  $evidence.error = $_.Exception.Message
  throw
} finally {
  New-Item -ItemType Directory -Force 'docs/evidence' | Out-Null
  $evidence | ConvertTo-Json -Depth 5 | Set-Content 'docs/evidence/windows-smoke.json' -Encoding utf8NoBOM
  $application.Refresh()
  if (!$application.HasExited) { Stop-Process -Id $application.Id -Force }
}
