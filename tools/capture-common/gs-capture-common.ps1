# >>> gs-capture-common (source: tools/capture-common/gs-capture-common.ps1; copied into both watchers by
# `node scripts/sync-capture-common.mjs` — edit the source, not the copies)
# Screen grabbing, shared by the HUD and the main-menu capture watchers (2026-10-17). Steam ignored the
# F12 the watchers injected, so the owner pressed it by hand for minutes; now the watcher grabs Dota's
# window itself: GDI BitBlt SRCCOPY (what CopyFromScreen does) of the client area of dota2.exe's foreground window,
# in physical pixels (the process is made DPI-aware first). Under DWM that is the composed desktop, so it
# works for «Окно без рамок» (borderless windowed); exclusive fullscreen gives black or frozen frames,
# which the watchers detect and explain. The cursor is not in a GDI grab. Bytes are taken as they are
# (BGRA → RGB, no colour conversion) and saved as lossless PNG by the watcher. -Steam keeps the old route.
# Dota's video settings (game/dota/cfg/video.txt): a fullscreen setting is switched to borderless for the
# capture (the file kept as video.txt.gs-capture-backup and put back at the end, like the pak files).
$script:GsGrabSource = @'
using System;
using System.Runtime.InteropServices;

public static class GsGrabV1 {
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L; public int T; public int R; public int B; }
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] struct BITMAPINFOHEADER {
    public uint biSize; public int biWidth; public int biHeight; public ushort biPlanes; public ushort biBitCount; public uint biCompression;
    public uint biSizeImage; public int biXPelsPerMeter; public int biYPelsPerMeter; public uint biClrUsed; public uint biClrImportant;
  }
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out RECT r);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref POINT p);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
  [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, uint rop);
  [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFOHEADER bmi, uint usage, out IntPtr bits, IntPtr section, uint offset);
  const uint SRCCOPY = 0x00CC0020;

  // Physical pixels for every coordinate below (a DPI-unaware process sees scaled ones at 125 % and up):
  // per-monitor aware (Windows 10 1703+), else system aware.
  public static void DpiAware() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch (Exception) { }
    try { SetProcessDPIAware(); } catch (Exception) { }
  }

  // The client area of the foreground window, in screen pixels, when it belongs to one of pids: x, y, w, h.
  public static int[] ForegroundClient(int[] pids) {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || IsIconic(h)) return null;
    uint pid; GetWindowThreadProcessId(h, out pid);
    bool ours = false;
    foreach (int p in pids) if (p == (int)pid) ours = true;
    if (!ours) return null;
    RECT r; if (!GetClientRect(h, out r)) return null;
    POINT o = new POINT(); if (!ClientToScreen(h, ref o)) return null;
    return new int[] { o.X, o.Y, r.R - r.L, r.B - r.T };
  }

  public static int[] Cursor() { POINT p; if (!GetCursorPos(out p)) return null; return new int[] { p.X, p.Y }; }
  public static bool KeyDown(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

  // A screen rectangle as RGB bytes, row-major, top-down: BitBlt (SRCCOPY, what Graphics.CopyFromScreen
  // does, without the drawing library) from the screen into a top-down 32-bit DIB. No cursor, no conversion.
  public static byte[] Grab(int x, int y, int w, int h) {
    IntPtr screen = GetDC(IntPtr.Zero);
    if (screen == IntPtr.Zero) throw new Exception("GetDC failed");
    IntPtr mem = IntPtr.Zero, dib = IntPtr.Zero, old = IntPtr.Zero;
    try {
      mem = CreateCompatibleDC(screen);
      BITMAPINFOHEADER bi = new BITMAPINFOHEADER();
      bi.biSize = (uint)Marshal.SizeOf(typeof(BITMAPINFOHEADER)); bi.biWidth = w; bi.biHeight = -h; bi.biPlanes = 1; bi.biBitCount = 32; bi.biCompression = 0;
      IntPtr bits;
      dib = CreateDIBSection(screen, ref bi, 0, out bits, IntPtr.Zero, 0);
      if (mem == IntPtr.Zero || dib == IntPtr.Zero || bits == IntPtr.Zero) throw new Exception("CreateDIBSection failed");
      old = SelectObject(mem, dib);
      if (!BitBlt(mem, 0, 0, w, h, screen, x, y, SRCCOPY)) throw new Exception("BitBlt failed");
      byte[] row = new byte[w * 4], rgb = new byte[w * h * 3];
      for (int yy = 0; yy < h; yy++) {
        Marshal.Copy(new IntPtr(bits.ToInt64() + (long)yy * w * 4), row, 0, row.Length);
        int o = yy * w * 3;
        for (int xx = 0; xx < w; xx++) { rgb[o + xx * 3] = row[xx * 4 + 2]; rgb[o + xx * 3 + 1] = row[xx * 4 + 1]; rgb[o + xx * 3 + 2] = row[xx * 4]; }
      }
      return rgb;
    } finally {
      if (old != IntPtr.Zero) SelectObject(mem, old);
      if (dib != IntPtr.Zero) DeleteObject(dib);
      if (mem != IntPtr.Zero) DeleteDC(mem);
      ReleaseDC(IntPtr.Zero, screen);
    }
  }
}
'@

function Initialize-GsGrab {
  if (-not $script:OnWindows -or ('GsGrabV1' -as [type])) { return }
  Add-Type -TypeDefinition $script:GsGrabSource
  [GsGrabV1]::DpiAware()
}

# One grab of Dota's window: @{ x; y; w; h; rgb } when dota2.exe is in front ($null otherwise); rgb only at
# the wanted size (a window of another size is reported, not grabbed).
function Invoke-DotaGrab([int]$wantW = 1920, [int]$wantH = 1080) {
  $pids = [int[]]@(Get-Process -Name dota2 -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  if (-not $pids.Count) { return $null }
  $r = [GsGrabV1]::ForegroundClient($pids)
  if ($null -eq $r -or $r[2] -le 0 -or $r[3] -le 0) { return $null }
  $g = @{ x = $r[0]; y = $r[1]; w = $r[2]; h = $r[3]; rgb = $null }
  if ($g.w -eq $wantW -and $g.h -eq $wantH) { $g.rgb = [GsGrabV1]::Grab($g.x, $g.y, $g.w, $g.h) }
  return $g
}

# The cursor relative to a grab's rectangle: @{ x; y } (screen pixels).
function Get-GrabCursor($g) {
  $c = [GsGrabV1]::Cursor()
  if ($null -eq $c -or $null -eq $g) { return $null }
  return @{ x = $c[0] - $g.x; y = $c[1] - $g.y }
}

# F12 pressed since the last call (key state polled every tick; the owner's own key, not Steam's).
$script:F12WasDown = $false
function Test-F12Pressed {
  $down = [GsGrabV1]::KeyDown(0x7B)
  $edge = $down -and -not $script:F12WasDown
  $script:F12WasDown = $down
  return $edge
}

# A cheap look at a grab: a 48 × 27 grid of samples — all black (exclusive fullscreen often grabs as
# black), and a signature (equal signatures in a row while the backdrop must change = a frozen grab).
function Get-GrabLook([byte[]]$rgb, [int]$w, [int]$h) {
  $black = $true; $sig = New-Object System.Text.StringBuilder
  for ($j = 0; $j -lt 27; $j++) {
    $y = [int](($j + 0.5) * $h / 27)
    for ($i = 0; $i -lt 48; $i++) {
      $k = ($y * $w + [int](($i + 0.5) * $w / 48)) * 3
      if ($rgb[$k] -or $rgb[$k + 1] -or $rgb[$k + 2]) { $black = $false }
      [void]$sig.Append([char](65 + (($rgb[$k] + 3 * $rgb[$k + 1] + 7 * $rgb[$k + 2]) % 26)))
    }
  }
  return @{ black = $black; sig = $sig.ToString() }
}

# The per-pack state of the grab checks below.
function New-GrabState { return @{ blackRun = 0; sameRun = 0; lastSig = ''; fsWarnAt = -1000; sizeWarnAt = -1000; grabs = 0; nextGrab = 0; notFgSince = $null } }
# A grab, checked before it counts as a frame: a window of the wrong size (said every 30 s); black or
# frozen grabs — exclusive fullscreen — said every 60 s with the way to borderless. $coded: the frame has
# our pack's marks (a black frame with them is a real K frame). $auto: capturing (frames must change).
# $notes: the pack record's notes. Returns $false when the grab is no frame of ours at all.
function Test-GrabUsable($gs, $g, [bool]$coded, [bool]$auto, [double]$now, $notes) {
  if ($null -eq $g.rgb) {
    if ($now - $gs.sizeWarnAt -gt 30) {
      $gs.sizeWarnAt = $now; & $script:Sys.Beep 'long'
      Say "Окно Dota $($g.w)×$($g.h), а нужно ровно 1920×1080. $script:BorderlessText." 'Red'
      [void]$notes.Add("window $($g.w)x$($g.h)")
    }
    return $false
  }
  $look = Get-GrabLook $g.rgb $g.w $g.h
  $black = $look.black -and -not $coded
  if ($black) { $gs.blackRun++ } else { $gs.blackRun = 0 }
  if ($look.sig -eq $gs.lastSig) { $gs.sameRun++ } else { $gs.sameRun = 0 }
  $gs.lastSig = $look.sig
  $limit = if ($auto) { 6 } else { 15 }
  if (($gs.blackRun -ge $limit -or ($auto -and $gs.sameRun -ge 10)) -and ($now - $gs.fsWarnAt) -gt 60) {
    $gs.fsWarnAt = $now; & $script:Sys.Beep 'long'
    $what = if ($gs.blackRun -ge $limit) { 'чёрный экран' } else { 'застывший кадр' }
    Say "Снимаю Dota, а вижу ${what}: похоже, Dota в полноэкранном режиме. Переключи: $script:BorderlessText. Дальше скрипт сам." 'Red'
    [void]$notes.Add("grab: $what at $([Math]::Round($now)) s")
  }
  return -not $black
}

# Dota's video settings: borderless for the capture, the owner's file back afterwards.
function Get-VideoCfgPath([string]$root) { return (Join-Path (Join-Path (Join-Path (Join-Path $root 'game') 'dota') 'cfg') 'video.txt') }
function Get-VideoSetting([string]$text, [string]$key) {
  $m = [regex]::Match($text, '"setting\.' + [regex]::Escape($key) + '"\s+"([^"]*)"')
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}
function Set-VideoSetting([string]$text, [string]$key, [string]$value) {
  $re = '("setting\.' + [regex]::Escape($key) + '"\s+")[^"]*(")'
  if ([regex]::IsMatch($text, $re)) { return [regex]::Replace($text, $re, ('${1}' + $value + '${2}')) }
  $at = $text.LastIndexOf('}')
  if ($at -lt 0) { return $text }
  return $text.Substring(0, $at) + "`t`"setting.$key`"`t`t`"$value`"`r`n" + $text.Substring($at)
}
# 'switched' (fullscreen → borderless, the owner's file kept), 'borderless' (already), 'windowed', 'missing'.
# res: the resolution in the file ('1920x1080' or $null).
function Set-DotaBorderless([string]$root) {
  $path = Get-VideoCfgPath $root; $bak = "$path.gs-capture-backup"
  if (Test-Path -LiteralPath $bak) { [void](Restore-DotaVideo $root) }
  if (-not (Test-Path -LiteralPath $path)) { return @{ state = 'missing'; res = $null } }
  $text = [IO.File]::ReadAllText($path)
  $w = Get-VideoSetting $text 'defaultres'; $h = Get-VideoSetting $text 'defaultresheight'
  $res = if ($w -and $h) { "${w}x$h" } else { $null }
  $full = Get-VideoSetting $text 'fullscreen'; $border = Get-VideoSetting $text 'nowindowborder'
  if ($full -ne '1') { return @{ state = $(if ($border -eq '1') { 'borderless' } else { 'windowed' }); res = $res } }
  Copy-Item -LiteralPath $path -Destination $bak -Force
  $new = Set-VideoSetting (Set-VideoSetting $text 'fullscreen' '0') 'nowindowborder' '1'
  [IO.File]::WriteAllText($path, $new, (New-Object Text.UTF8Encoding $false))
  return @{ state = 'switched'; res = $res }
}
# The owner's video.txt back (Dota closed: it writes the file when it exits). True when it was put back.
function Restore-DotaVideo([string]$root) {
  $path = Get-VideoCfgPath $root; $bak = "$path.gs-capture-backup"
  if (-not (Test-Path -LiteralPath $bak)) { return $false }
  Move-Item -LiteralPath $bak -Destination $path -Force
  return $true
}
$script:BorderlessText = 'Настройки Dota → Видео → Режим отображения → «Окно без рамок», разрешение 1920×1080'
# <<< gs-capture-common
