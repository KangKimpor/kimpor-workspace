$ErrorActionPreference = 'Stop'
$bundle = 'apps/desktop/src-tauri/target/release/bundle/nsis'
$installers = @(Get-ChildItem "$bundle/*-setup.exe")
if ($installers.Count -ne 1) { throw 'Expected exactly one Windows x64 installer.' }
$installer = $installers[0]
if ($installer.Length -gt 20MB) { throw 'Installer exceeds 20 MiB budget.' }
if ($env:IS_RELEASE -eq 'true') {
  $signaturePath = "$($installer.FullName).sig"
  if (!(Test-Path $signaturePath)) { throw 'Tauri updater signature is missing; refusing to publish an unsigned feed.' }
  $signature = (Get-Content $signaturePath -Raw).Trim()
  if (!$signature) { throw 'Tauri updater signature is empty.' }
  $version = $env:RELEASE_TAG -replace '^v', ''
  $assetUrl = "https://github.com/$($env:REPOSITORY)/releases/download/$($env:RELEASE_TAG)/$([Uri]::EscapeDataString($installer.Name))"
  $manifest = @{
    version = $version
    notes = "Kimpor Workspace $version. Save and sync your work before installing."
    pub_date = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = @{ 'windows-x86_64' = @{ signature = $signature; url = $assetUrl } }
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content "$bundle/latest.json" -Encoding utf8NoBOM
}
$hashes = Get-ChildItem "$bundle/*" -File | Where-Object { $_.Extension -in '.exe', '.sig', '.json' } | ForEach-Object {
  "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.Name)"
}
$hashes | Set-Content "$bundle/SHA256SUMS.txt" -Encoding utf8NoBOM
Write-Output "Installer budget passed: $($installer.Length) bytes. SHA256 checksums recorded."
