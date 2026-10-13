$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'windows-smoke.ps1'
$syntaxErrors = $null
$syntaxTokens = $null
$syntax = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$syntaxTokens, [ref]$syntaxErrors)
if ($syntaxErrors.Count) { throw 'Windows smoke script has syntax errors.' }
$function = $syntax.Find({ param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-AppProcessTree'
}, $true)
if (!$function) { throw 'Process-tree function is missing.' }
# Load only the collector; this test never installs or starts the app.
. ([scriptblock]::Create($function.Extent.Text))
$application = [pscustomobject]@{ Id = 101 }
function Get-CimInstance {
  param($ClassName)
  @(
    [pscustomobject]@{ ProcessId = 104; ParentProcessId = 103 }
    [pscustomobject]@{ ProcessId = 103; ParentProcessId = 102 }
    [pscustomobject]@{ ProcessId = 102; ParentProcessId = 101 }
    [pscustomobject]@{ ProcessId = 101; ParentProcessId = 1 }
    [pscustomobject]@{ ProcessId = 999; ParentProcessId = 1 }
  )
}
function Get-Process {
  [CmdletBinding()] param([int]$Id)
  [pscustomobject]@{
    Id = $Id
    ProcessName = $(if ($Id -eq 101) { 'KimporWorkspace' } else { 'msedgewebview2' })
    WorkingSet64 = [long](($Id - 100) * 10MB)
  }
}
$sample = @(Get-AppProcessTree)
if (($sample.Id | Sort-Object) -join ',' -ne '101,102,103,104') { throw 'Expected host and all nested descendants, excluding the unrelated WebView2 process.' }
if (($sample | Measure-Object WorkingSet64 -Sum).Sum -ne 100MB) { throw 'Expected aggregate resident working set across all four processes.' }
Write-Output 'Process-tree aggregation: host, nested WebView2 descendants and unrelated-process exclusion passed.'
