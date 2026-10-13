$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'windows-release.ps1'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ("kimpor-release-test-" + [Guid]::NewGuid())
$originalEnvironment = @{}
foreach ($name in @('IS_RELEASE', 'RELEASE_TAG', 'REPOSITORY')) { $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
New-Item -ItemType Directory -Path $fixture | Out-Null
Push-Location $fixture
try {
  $bundle = 'apps/desktop/src-tauri/target/release/bundle/nsis'
  New-Item -ItemType Directory -Path $bundle -Force | Out-Null
  $original = Join-Path $bundle 'Kimpor Workspace_0.0.4_x64-setup.exe'
  [IO.File]::WriteAllBytes((Join-Path $fixture $original), [byte[]](1, 2, 3))
  $env:IS_RELEASE = 'false'
  & $scriptPath
  if (!(Test-Path -LiteralPath $original)) { throw 'Development installer name changed.' }
  'synthetic signature' | Set-Content -LiteralPath "$original.sig"
  $env:IS_RELEASE = 'true'; $env:RELEASE_TAG = 'v0.0.4'; $env:REPOSITORY = 'KangKimpor/kimpor-workspace'
  & $scriptPath
  $manifest = Get-Content "$bundle/latest.json" -Raw | ConvertFrom-Json
  $name = 'Kimpor.Workspace_0.0.4_x64-setup.exe'
  if ($manifest.version -ne '0.0.4' -or $manifest.platforms.'windows-x86_64'.url -cne "https://github.com/KangKimpor/kimpor-workspace/releases/download/v0.0.4/$name") { throw 'Release feed does not address the uploaded asset.' }
  if ($manifest.platforms.'windows-x86_64'.signature -cne 'synthetic signature') { throw 'Signature changed during renaming.' }
  if (Test-Path -LiteralPath $original) { throw 'Original spaced installer remains.' }
  $checksums = @(Get-Content "$bundle/SHA256SUMS.txt")
  if ($checksums.Count -ne 3) { throw 'Expected installer, signature and manifest checksums.' }
  foreach ($line in $checksums) {
    $hash, $fileName = $line -split '  ', 2
    if ((Get-FileHash -LiteralPath (Join-Path $bundle $fileName) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $hash) { throw "Release checksum mismatch: $fileName" }
  }
  & $scriptPath
  if ((Get-Content "$bundle/latest.json" -Raw | ConvertFrom-Json).platforms.'windows-x86_64'.url -cne $manifest.platforms.'windows-x86_64'.url) { throw 'Already-normalized release name changed.' }
  Remove-Item -LiteralPath (Join-Path $bundle "$name.sig")
  $rejected = $false
  try { & $scriptPath } catch { $rejected = $_.Exception.Message -match 'signature is missing' }
  if (!$rejected) { throw 'Unsigned release was accepted.' }
  Write-Output 'Release asset names, unchanged signature, checksums, repeat run and unsigned refusal passed.'
} finally {
  Pop-Location
  foreach ($name in $originalEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process') }
  $resolvedFixture = [IO.Path]::GetFullPath($fixture)
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (!$resolvedFixture.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedFixture -Leaf) -notlike 'kimpor-release-test-*') { throw 'Refusing cleanup outside the release test fixture.' }
  Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
