# Uses the installed release app's Windows accessibility tree and real controls.
# No debugger, alternate webview build, or product test hook is required.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class KimporNativeInput {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public KEYBDINPUT key; [FieldOffset(0)] public MOUSEINPUT mouse; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION data; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  public static void ReplaceText(string text) {
    keybd_event(0x11, 0, 0, UIntPtr.Zero); keybd_event(0x41, 0, 0, UIntPtr.Zero);
    keybd_event(0x41, 0, 2, UIntPtr.Zero); keybd_event(0x11, 0, 2, UIntPtr.Zero);
    foreach (char c in text) {
      var down = new INPUT { type=1, data=new UNION { key=new KEYBDINPUT { wScan=c, dwFlags=4 } } };
      var up = down; up.data.key.dwFlags=6;
      if (SendInput(2, new [] {down,up}, Marshal.SizeOf(typeof(INPUT))) != 2)
        throw new InvalidOperationException("Windows rejected synthetic Unicode input");
    }
  }
}
'@

function Get-WorkspaceControl($Root, [string]$Name, $Type = $null, [switch]$Contains) {
  $condition = if ($Type) {
    [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $Type)
  } else { [System.Windows.Automation.Condition]::TrueCondition }
  foreach ($element in $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)) {
    try {
      $current = $element.Current
      if ($current.IsOffscreen -or !$current.IsEnabled) { continue }
      if (($Contains -and $current.Name.Contains($Name)) -or (!$Contains -and $current.Name -eq $Name)) { return $element }
    } catch { }
  }
}
function Wait-WorkspaceControl($Root, [string]$Name, $Type = $null, [switch]$Contains) {
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $element = Get-WorkspaceControl $Root $Name $Type -Contains:$Contains
    if ($element) { return $element }
    Start-Sleep -Milliseconds 250
  }
  throw "Installed app did not expose the visible control: $Name"
}
function Invoke-WorkspaceControl($Element) {
  $pattern = $null
  if (!$Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { throw 'Visible button has no Invoke pattern' }
  ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
}
function Set-WorkspaceText($Element, [string]$Text, $Application) {
  $pattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern) -and !([System.Windows.Automation.ValuePattern]$pattern).Current.IsReadOnly) {
    ([System.Windows.Automation.ValuePattern]$pattern).SetValue($Text)
  } else {
    [void][KimporNativeInput]::SetForegroundWindow($Application.MainWindowHandle)
    $Element.SetFocus()
    [KimporNativeInput]::ReplaceText($Text)
  }
}
function Get-WorkspaceText($Element) {
  $pattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
    return ([System.Windows.Automation.TextPattern]$pattern).DocumentRange.GetText(-1)
  }
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
    return ([System.Windows.Automation.ValuePattern]$pattern).Current.Value
  }
  throw 'Visible editor has no accessible text or value pattern'
}
function Wait-WorkspaceText($Root, [string]$Name, [string]$Expected) {
  # SendInput queues native messages; UI Automation's text cache can lag them.
  # Wait for the exact input in the editor, rather than the sidebar's always-saved label.
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $element = Get-WorkspaceControl $Root $Name
    if ($element -and (Get-WorkspaceText $element).Contains($Expected)) { return $element }
    Start-Sleep -Milliseconds 250
  }
  throw "Installed editor did not expose the expected text: $Name"
}
function Invoke-InstalledWorkspaceCheck($Application, [string]$Executable, [DateTime]$StartedAt) {
  $button = [System.Windows.Automation.ControlType]::Button
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($Application.MainWindowHandle)
  $null = Wait-WorkspaceControl $root "Today's agenda"
  $renderedMs = ([DateTime]::UtcNow - $StartedAt).TotalMilliseconds
  Invoke-WorkspaceControl (Wait-WorkspaceControl $root 'Notes' $button)
  Invoke-WorkspaceControl (Wait-WorkspaceControl $root 'New note' $button)
  Set-WorkspaceText (Wait-WorkspaceControl $root 'Page title') 'Windows verification note' $Application
  $text = 'Saved in the installed app · ខ្មែរ · 中文'
  Set-WorkspaceText (Wait-WorkspaceControl $root 'Document editor') $text $Application
  $null = Wait-WorkspaceText $root 'Document editor' $text
  Invoke-WorkspaceControl (Wait-WorkspaceControl $root 'Today' $button)
  $null = Wait-WorkspaceControl $root "Today's agenda"
  if (!$Application.CloseMainWindow() -or !$Application.WaitForExit(10000) -or $Application.ExitCode -ne 0) { throw 'Installed app did not close normally before persistence check' }
  $next = Start-Process $Executable -PassThru
  try {
    for ($attempt = 0; $attempt -lt 100; $attempt++) {
      $next.Refresh()
      if ($next.HasExited) { throw 'Installed app exited during restart' }
      if ($next.MainWindowHandle -ne 0) { break }
      Start-Sleep -Milliseconds 200
    }
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($next.MainWindowHandle)
    $null = Wait-WorkspaceControl $root "Today's agenda"
    Invoke-WorkspaceControl (Wait-WorkspaceControl $root 'Notes' $button)
    Invoke-WorkspaceControl (Wait-WorkspaceControl $root 'Windows verification note' $button -Contains)
    $null = Wait-WorkspaceText $root 'Document editor' $text
      @{
      date = [DateTime]::UtcNow.ToString('o'); source_commit = $env:GITHUB_SHA
      mode = 'Installed Windows release app through UI Automation; synthetic Unicode input, no physical-device, IME or screen-reader claim'
      rendered = $true; rendered_today_ms = [Math]::Round($renderedMs)
      multilingual_note_restart = $true
    } | ConvertTo-Json -Depth 4 | Set-Content 'docs/evidence/windows-ui.json' -Encoding utf8NoBOM
    return $next
  } catch { if (!$next.HasExited) { Stop-Process -Id $next.Id -Force }; throw }
}
