param(
  [switch]$SelfTest,
  [string]$Base = 'https://dev.gridstudio.me/hud-capture',
  [string]$DotaDir = '',
  [string]$ShotsDir = '',
  [string]$OutDir = '',
  [string]$ProbeDir = '',
  [string]$KitDir = '',
  [switch]$Steam
)
# GridStudio HUD capture watcher (docs/hud-capture/plan.json, plan.implementation "tools/hud-capture").
# Run on the owner's PC:
#   iex ([Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://dev.gridstudio.me/hud-capture.ps1')).TrimStart([char]0xFEFF))
# Swaps game\dota_russian\pak03_dir.vpk for each capture pack (the owner's file is kept as
# pak03_dir.vpk.gs-backup, or a pak03_dir.vpk.gs-none marker when there was none, and is ALWAYS put
# back: try/finally, Ctrl+C, and every start restores a leftover first). Since 2026-10-17 (Steam ignored
# the injected F12) it grabs Dota's window itself every ~0.75 s while dota2.exe is in front (GDI, no
# cursor; tools/capture-common, shared with the menu watcher) once the owner presses F12 (read from the
# keyboard state), a fullscreen Dota switched to borderless for the capture; -Steam keeps the old route
# (F12 sent to Steam, PNGs from its folder). Frames go to Desktop\gs-hud-capture as <pack>_0001.png…,
# classified live (C# pixel probe); it decides phases and fallbacks and finally writes session.json and
# Desktop\gs-hud-capture.zip. The C# types are V2 (V1 of an older run may sit in the same PowerShell).
# Windows PowerShell 5.1 and PowerShell 7. -SelfTest runs everything but Win32 against a fake Dota.
# Never use `exit` here: under iex it would close the owner's PowerShell window.

$script:GsVersion = '2026-10-16.1'
$script:OnWindows = ($env:OS -eq 'Windows_NT')

# ---------------------------------------------------------------- C# helpers (C# 5: Windows PowerShell 5.1 compiles with the .NET Framework compiler)
$script:GsProbeSource = @'
using System;
using System.IO;
using System.IO.Compression;
using System.Text;

public class GsFrameV2 {
  public int Width; public int Height; public string Error = "";
  public string Global = "";          // K, W (exact at all free points), nK, nW (within 3 levels), T (anything else)
  public string Local = "";           // K, W, G (both lower-backdrop probes, ±1) or T
  public int RingRow = -1;            // first row of the marker ring on the ring column, -1 none
  public int RingMark = 0;            // G / 20 (1..7), 0 none
  public int RingPart = -1;           // 0 core (B 0), 1 g1 (B 120), 2 g2 (B 240)
  public int TopL = -2; public int TopR = -2;   // non-backdrop extent on the top row (K/W frames), -1 empty, -2 unknown
  public int LowL = -2; public int LowR = -2;   // the same on the bottom row
  public int ChatMaxX = -2; public int ChatInk = 0; // rightmost ink pixel in the chat box (K frames), -1 none, -2 unknown
  public int Clone = 0;               // 0xRRGGBB at the wash-clone probe
}

public static class GsProbeV2 {
  public static int[] Free = new int[] { 1000, 250, 1100, 520, 1700, 420 };
  public static int[] LowerBg = new int[] { 1500, 800, 1560, 900 };
  public static int RingX = 1500, RingY0 = 350, RingY1 = 900;
  public static int[] ChatBox = new int[] { 40, 200, 840, 445 };
  public static int[] ClonePt = new int[] { 1424, 272 };
  public static int TopY = 12, TopX0 = 300, TopX1 = 1650;
  public static int LowY = 1075, LowX0 = 0, LowX1 = 1919;
  public static int Ink = 60;

  static int BE(byte[] b, int o) { return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; }

  public static byte[] DecodePng(byte[] png, out int w, out int h) {
    w = 0; h = 0;
    byte[] sig = new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 };
    if (png == null || png.Length < 45) throw new Exception("truncated or not a PNG");
    for (int i = 0; i < 8; i++) if (png[i] != sig[i]) throw new Exception("not a PNG");
    int pos = 8, depth = 0, ctype = 0, inter = 0; bool end = false;
    MemoryStream idat = new MemoryStream();
    while (pos + 12 <= png.Length) {
      int len = BE(png, pos);
      if (len < 0 || pos + 12 + len > png.Length) throw new Exception("truncated");
      string type = Encoding.ASCII.GetString(png, pos + 4, 4);
      if (type == "IHDR") { w = BE(png, pos + 8); h = BE(png, pos + 12); depth = png[pos + 16]; ctype = png[pos + 17]; inter = png[pos + 20]; }
      else if (type == "IDAT") idat.Write(png, pos + 8, len);
      else if (type == "IEND") { end = true; break; }
      pos += 12 + len;
    }
    if (!end) throw new Exception("truncated");
    if (depth != 8 || (ctype != 2 && ctype != 6) || inter != 0) throw new Exception("unsupported PNG: depth " + depth + ", colour type " + ctype + ", interlace " + inter);
    if (w <= 0 || h <= 0 || w > 16384 || h > 16384) throw new Exception("bad PNG size");
    int bpp = ctype == 2 ? 3 : 4, stride = w * bpp;
    byte[] raw = new byte[h * (stride + 1)];
    idat.Position = 2;
    using (DeflateStream ds = new DeflateStream(idat, CompressionMode.Decompress)) {
      int got = 0;
      while (got < raw.Length) { int n = ds.Read(raw, got, raw.Length - got); if (n <= 0) break; got += n; }
      if (got < raw.Length) throw new Exception("truncated image data");
    }
    byte[] rgb = new byte[w * h * 3];
    byte[] prev = new byte[stride], cur = new byte[stride];
    for (int y = 0; y < h; y++) {
      int o = y * (stride + 1), f = raw[o]; o++;
      for (int i = 0; i < stride; i++) {
        int x = raw[o + i], a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        switch (f) {
          case 0: break;
          case 1: x += a; break;
          case 2: x += b; break;
          case 3: x += (a + b) >> 1; break;
          case 4: { int p = a + b - c, pa = Math.Abs(p - a), pb = Math.Abs(p - b), pc = Math.Abs(p - c); x += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); break; }
          default: throw new Exception("bad PNG filter");
        }
        cur[i] = (byte)x;
      }
      int d = y * w * 3;
      if (bpp == 3) Buffer.BlockCopy(cur, 0, rgb, d, stride);
      else for (int k = 0; k < w; k++) { rgb[d + k * 3] = cur[k * 4]; rgb[d + k * 3 + 1] = cur[k * 4 + 1]; rgb[d + k * 3 + 2] = cur[k * 4 + 2]; }
      byte[] t = prev; prev = cur; cur = t;
    }
    return rgb;
  }

  static uint[] crcTable;
  static uint Crc(byte[] b, int o, int n) {
    if (crcTable == null) {
      uint[] t = new uint[256];
      for (uint i = 0; i < 256; i++) { uint c = i; for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1; t[i] = c; }
      crcTable = t;
    }
    uint r = 0xFFFFFFFFu;
    for (int i = o; i < o + n; i++) r = crcTable[(r ^ b[i]) & 0xFF] ^ (r >> 8);
    return r ^ 0xFFFFFFFFu;
  }
  static void Chunk(MemoryStream s, string type, byte[] data) {
    byte[] buf = new byte[data.Length + 4];
    Encoding.ASCII.GetBytes(type, 0, 4, buf, 0);
    Buffer.BlockCopy(data, 0, buf, 4, data.Length);
    WriteBE(s, (uint)data.Length); s.Write(buf, 0, buf.Length); WriteBE(s, Crc(buf, 0, buf.Length));
  }
  static void WriteBE(Stream s, uint v) { s.WriteByte((byte)(v >> 24)); s.WriteByte((byte)(v >> 16)); s.WriteByte((byte)(v >> 8)); s.WriteByte((byte)v); }

  // Test frames only (-SelfTest): 8-bit RGB or RGBA, filter 0.
  public static byte[] EncodePng(byte[] rgb, int w, int h, bool alpha) {
    int bpp = alpha ? 4 : 3, stride = w * bpp;
    byte[] row = new byte[stride + 1];
    MemoryStream z = new MemoryStream();
    z.WriteByte(0x78); z.WriteByte(0x01);
    uint a = 1, b = 0;
    using (DeflateStream ds = new DeflateStream(z, CompressionLevel.Fastest, true)) {
      for (int y = 0; y < h; y++) {
        row[0] = 0;
        for (int x = 0; x < w; x++) {
          int s = (y * w + x) * 3, d = 1 + x * bpp;
          row[d] = rgb[s]; row[d + 1] = rgb[s + 1]; row[d + 2] = rgb[s + 2];
          if (alpha) row[d + 3] = 255;
        }
        for (int i = 0; i < row.Length; i++) { a = (a + row[i]) % 65521; b = (b + a) % 65521; }
        ds.Write(row, 0, row.Length);
      }
    }
    WriteBE(z, (b << 16) | a);
    MemoryStream png = new MemoryStream();
    png.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }, 0, 8);
    byte[] ihdr = new byte[13];
    ihdr[0] = (byte)(w >> 24); ihdr[1] = (byte)(w >> 16); ihdr[2] = (byte)(w >> 8); ihdr[3] = (byte)w;
    ihdr[4] = (byte)(h >> 24); ihdr[5] = (byte)(h >> 16); ihdr[6] = (byte)(h >> 8); ihdr[7] = (byte)h;
    ihdr[8] = 8; ihdr[9] = (byte)(alpha ? 6 : 2);
    Chunk(png, "IHDR", ihdr); Chunk(png, "IDAT", z.ToArray()); Chunk(png, "IEND", new byte[0]);
    return png.ToArray();
  }

  public static void Fill(byte[] rgb, int w, int h, int x0, int y0, int x1, int y1, int c) {
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= w) x1 = w - 1; if (y1 >= h) y1 = h - 1;
    byte r = (byte)(c >> 16), g = (byte)(c >> 8), b = (byte)c;
    for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) { int i = (y * w + x) * 3; rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; }
  }

  // A synthetic 1920x1080 frame for -SelfTest: global backdrop, lower local backdrop, ring, HUD bodies, chat ink, clone.
  public static byte[] Synth(int global, int local, int lowerTop, int ringRow, int ringRgb, int topL, int topR, bool lowerBody, int chatMaxX, int clone) {
    return EncodePng(SynthRgb(global, local, lowerTop, ringRow, ringRgb, topL, topR, lowerBody, chatMaxX, clone), 1920, 1080, false);
  }
  public static byte[] SynthRgb(int global, int local, int lowerTop, int ringRow, int ringRgb, int topL, int topR, bool lowerBody, int chatMaxX, int clone) {
    int w = 1920, h = 1080;
    byte[] rgb = new byte[w * h * 3];
    Fill(rgb, w, h, 0, 0, w - 1, h - 1, global >= 0 ? global : 0x285A1E);
    if (global < 0) for (int x = 0; x < w; x += 7) Fill(rgb, w, h, x, 0, x, h - 1, 0x305028);
    if (local >= 0 && lowerTop > 0) Fill(rgb, w, h, 1300, lowerTop, w - 1, h - 1, local);
    if (ringRow >= 0) Fill(rgb, w, h, 1300, ringRow, w - 1, ringRow + 5, ringRgb);
    if (lowerBody) Fill(rgb, w, h, 500, 1000, 1400, h - 1, 0x46403A);
    if (topL >= 0) Fill(rgb, w, h, topL, 0, topR, 40, 0x3C3228);
    if (chatMaxX > 0) Fill(rgb, w, h, 50, 400, chatMaxX, 410, 0xF0F0F0);
    if (clone >= 0) Fill(rgb, w, h, 1400, 260, 1450, 285, clone);
    return rgb;
  }

  static bool Is(byte[] p, int i, int r, int g, int b, int tol) {
    return Math.Abs(p[i] - r) <= tol && Math.Abs(p[i + 1] - g) <= tol && Math.Abs(p[i + 2] - b) <= tol;
  }
  static string Backdrop(byte[] p, int i, int tol) {
    if (Is(p, i, 0, 0, 0, tol)) return "K";
    if (Is(p, i, 255, 255, 255, tol)) return "W";
    return "T";
  }

  public static GsFrameV2 Analyze(byte[] png) {
    GsFrameV2 f = new GsFrameV2();
    int w, h; byte[] p;
    try { p = DecodePng(png, out w, out h); }
    catch (Exception e) { f.Error = e.Message; return f; }
    f.Width = w; f.Height = h;
    if (w != 1920 || h != 1080) { f.Error = "size " + w + "x" + h; return f; }
    Probe(f, p, w, h);
    return f;
  }

  // A grabbed screen (RGB bytes, row-major), read exactly as a PNG of it would be.
  public static GsFrameV2 AnalyzeRgb(byte[] rgb, int w, int h) {
    GsFrameV2 f = new GsFrameV2();
    f.Width = w; f.Height = h;
    if (rgb == null || rgb.Length < w * h * 3) { f.Error = "no image"; return f; }
    if (w != 1920 || h != 1080) { f.Error = "size " + w + "x" + h; return f; }
    Probe(f, rgb, w, h);
    return f;
  }

  public static void Probe(GsFrameV2 f, byte[] p, int w, int h) {
    // Global backdrop at the free points.
    string exact = null, near = null;
    for (int k = 0; k < Free.Length; k += 2) {
      int i = (Free[k + 1] * w + Free[k]) * 3;
      string e = Backdrop(p, i, 0), n = Backdrop(p, i, 3);
      exact = exact == null ? e : (exact == e ? exact : "T");
      near = near == null ? n : (near == n ? near : "T");
    }
    f.Global = exact != "T" ? exact : (near != "T" ? "n" + near : "T");
    // Lower local backdrop.
    string loc = null;
    for (int k = 0; k < LowerBg.Length; k += 2) {
      int i = (LowerBg[k + 1] * w + LowerBg[k]) * 3;
      string v = Is(p, i, 128, 128, 128, 1) ? "G" : Backdrop(p, i, 1);
      loc = loc == null ? v : (loc == v ? loc : "T");
    }
    f.Local = loc;
    // Marker ring: R 255, G = 20 * mark, B 0/120/240; two equal rows in a row.
    int lastMark = 0, lastPart = -1;
    for (int y = Math.Max(0, RingY0); y <= Math.Min(h - 1, RingY1); y++) {
      int i = (y * w + RingX) * 3, r = p[i], g = p[i + 1], b = p[i + 2], m = 0, part = -1;
      if (r >= 250) {
        int mm = (g + 10) / 20;
        if (mm >= 1 && mm <= 7 && Math.Abs(g - 20 * mm) <= 3) m = mm;
        if (b <= 4) part = 0; else if (b >= 116 && b <= 124) part = 1; else if (b >= 236) part = 2;
      }
      if (m > 0 && part >= 0) {
        if (m == lastMark && part == lastPart) { f.RingRow = y - 1; f.RingMark = m; f.RingPart = part; break; }
        lastMark = m; lastPart = part;
      } else { lastMark = 0; lastPart = -1; }
    }
    // Clone probe.
    { int i = (ClonePt[1] * w + ClonePt[0]) * 3; f.Clone = (p[i] << 16) | (p[i + 1] << 8) | p[i + 2]; }
    // Extents over an exact K/W backdrop.
    if (f.Global == "K" || f.Global == "W") {
      int bg = f.Global == "K" ? 0 : 255;
      Extent(p, w, TopY, TopX0, TopX1, bg, out f.TopL, out f.TopR);
      Extent(p, w, LowY, LowX0, LowX1, bg, out f.LowL, out f.LowR);
    }
    if (f.Global == "K") {
      int mx = -1, n = 0;
      for (int y = ChatBox[1]; y <= ChatBox[3]; y++) for (int x = ChatBox[0]; x <= ChatBox[2]; x++) {
        int i = (y * w + x) * 3;
        if (p[i] > Ink || p[i + 1] > Ink || p[i + 2] > Ink) { n++; if (x > mx) mx = x; }
      }
      f.ChatMaxX = mx; f.ChatInk = n;
    }
  }

  static void Extent(byte[] p, int w, int y, int x0, int x1, int bg, out int l, out int r) {
    l = -1; r = -1;
    for (int x = x0; x <= x1; x++) {
      int i = (y * w + x) * 3;
      if (p[i] != bg || p[i + 1] != bg || p[i + 2] != bg) { if (l < 0) l = x; r = x; }
    }
  }

  public static byte[] ReadShared(string path) {
    using (FileStream s = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) {
      byte[] b = new byte[s.Length]; int got = 0;
      while (got < b.Length) { int n = s.Read(b, got, b.Length - got); if (n <= 0) break; got += n; }
      if (got < b.Length) Array.Resize(ref b, got);
      return b;
    }
  }
}
'@

$script:GsWinSource = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class GsWinV1 {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lparam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lparam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  // Titles of the visible top-level windows of one process (Dota's «FATAL ERROR» box among them).
  public static string[] WindowTitles(int pid) {
    List<string> found = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint p; GetWindowThreadProcessId(h, out p);
      if ((int)p == pid && IsWindowVisible(h)) { StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512); if (sb.Length > 0) found.Add(sb.ToString()); }
      return true;
    }, IntPtr.Zero);
    return found.ToArray();
  }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);

  public static int ForegroundPid() {
    IntPtr hwnd = GetForegroundWindow();
    if (hwnd == IntPtr.Zero) return 0;
    uint pid; GetWindowThreadProcessId(hwnd, out pid);
    return (int)pid;
  }
  static bool Key(bool up) {
    INPUT[] a = new INPUT[1];
    a[0].type = 1;
    a[0].u.ki.wVk = 0x7B; a[0].u.ki.wScan = 0x58; a[0].u.ki.dwFlags = up ? 2u : 0u;
    if (SendInput(1, a, Marshal.SizeOf(typeof(INPUT))) == 1) return true;
    keybd_event(0x7B, 0x58, up ? 2u : 0u, UIntPtr.Zero);
    return false;
  }
  // F12 (VK 0x7B, scan 0x58): down, 40 ms, up. False when SendInput was refused and keybd_event was used.
  public static bool PressF12() { bool a = Key(false); Thread.Sleep(40); bool b = Key(true); return a && b; }
}
'@

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

function Initialize-GsTypes {
  if (-not ('GsProbeV2' -as [type])) { Add-Type -TypeDefinition $script:GsProbeSource }
  if ($script:OnWindows -and -not ('GsWinV1' -as [type])) { Add-Type -TypeDefinition $script:GsWinSource }
  if (-not $script:UseSteam) { Initialize-GsGrab }
}

# ---------------------------------------------------------------- output, beeps, system hooks
$script:Events = New-Object System.Collections.ArrayList
$script:StatusShown = $false
$script:Quiet = $false

function Get-Now { & $script:Sys.Now }

function Say([string]$text, [string]$color = 'Gray') {
  [void]$script:Events.Add([ordered]@{ t = [Math]::Round((Get-Now), 2); text = $text })
  if ($script:Quiet) { return }
  if ($script:StatusShown) { Write-Host ''; $script:StatusShown = $false }
  Write-Host $text -ForegroundColor $color
}

function Show-Status([string]$line) {
  if ($script:Quiet) { return }
  $w = 110
  try { $w = [Math]::Max(40, [Console]::WindowWidth - 1) } catch { }
  if ($line.Length -gt $w) { $line = $line.Substring(0, $w) }
  Write-Host -NoNewline ("`r" + $line.PadRight($w))
  $script:StatusShown = $true
}

function Invoke-Beep([string]$kind) {
  $tones = switch ($kind) {
    'double' { @(@(880, 160), @(0, 120), @(880, 160)) }
    'triple' { @(@(1046, 150), @(0, 110), @(1046, 150), @(0, 110), @(1046, 150)) }
    'long'   { @(@(300, 1200)) }
    default  { @(@(660, 120)) }
  }
  foreach ($t in $tones) {
    try { if ($t[0] -eq 0) { Start-Sleep -Milliseconds $t[1] } else { [Console]::Beep($t[0], $t[1]) } } catch { }
  }
}

function Test-DotaForeground {
  $fp = [GsWinV1]::ForegroundPid()
  if ($fp -eq 0) { return $false }
  foreach ($p in @(Get-Process -Name dota2 -ErrorAction SilentlyContinue)) { if ($p.Id -eq $fp) { return $true } }
  return $false
}

# Dota's fatal error box («FATAL ERROR: Unable to load layout file …»): a window of dota2.exe titled so.
function Test-DotaFatal {
  foreach ($p in @(Get-Process -Name dota2 -ErrorAction SilentlyContinue)) {
    foreach ($t in [GsWinV1]::WindowTitles($p.Id)) { if ($t -match '(?i)fatal error|^error$') { return $true } }
  }
  return $false
}

function New-RealSys {
  $script:Clock = [Diagnostics.Stopwatch]::StartNew()
  return @{
    Now            = { $script:Clock.Elapsed.TotalSeconds }
    Sleep          = { param($ms) Start-Sleep -Milliseconds $ms }
    Tick           = 40
    DotaRunning    = { [bool](Get-Process -Name dota2 -ErrorAction SilentlyContinue) }
    DotaForeground = { Test-DotaForeground }
    SendF12        = { [GsWinV1]::PressF12() }
    Grab           = { Invoke-DotaGrab }
    F12Pressed     = { Test-F12Pressed }
    DotaFatal      = { Test-DotaFatal }
    KillDota       = { Stop-Process -Name dota2 -Force -ErrorAction SilentlyContinue }
    Beep           = { param($kind) Invoke-Beep $kind }
    Ask            = { param($q) Read-Host $q }
    OpenUrl        = { param($u) try { Start-Process $u } catch { } }
  }
}

function Ask([string]$q) { $a = & $script:Sys.Ask $q; if ($null -eq $a) { return '' }; return ([string]$a).Trim().Trim('"').Trim() }
function Test-Yes([string]$a, [bool]$default = $true) { if (-not $a) { return $default }; return ($a -match '^(д|да|y|yes|1)$') }

# ---------------------------------------------------------------- paths and files
function Get-Sha([string]$path) { return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }

function Write-Utf8([string]$path, [string]$text) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false)) }

function Find-Dota {
  $roots = New-Object System.Collections.Generic.List[string]
  foreach ($key in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam') {
    $item = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
    if ($item) { foreach ($value in @($item.SteamPath, $item.InstallPath)) { if ($value) { $roots.Add(($value -replace '/', '\')) } } }
  }
  foreach ($root in @($roots)) {
    $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
    if (Test-Path -LiteralPath $vdf) {
      foreach ($m in [regex]::Matches((Get-Content -LiteralPath $vdf -Raw), '"path"\s+"([^"]+)"')) { $roots.Add(($m.Groups[1].Value -replace '\\\\', '\')) }
    }
  }
  foreach ($root in ($roots | Select-Object -Unique)) {
    $dota = Join-Path $root 'steamapps\common\dota 2 beta'
    if (Test-Path -LiteralPath (Join-Path $dota 'game\dota\gameinfo.gi')) { return $dota }
  }
  return $null
}

function Get-DotaPaths([string]$root) {
  $ru = Join-Path (Join-Path $root 'game') 'dota_russian'
  $pak = Join-Path $ru 'pak03_dir.vpk'
  return @{ root = $root; ru = $ru; pak = $pak; backup = "$pak.gs-backup"; none = "$pak.gs-none"
    boot = (Join-Path (Join-Path (Join-Path (Join-Path $root 'game') 'dota') 'cfg') 'boot.vcfg') }
}

function Wait-DotaClosed([string]$why) {
  if (-not (& $script:Sys.DotaRunning)) { return }
  Say "Dota запущена. Закрой её полностью — $why." 'Yellow'
  $script:Run.mode = 'waitClose'; $script:Run.since = Get-Now
  while (& $script:Sys.DotaRunning) { & $script:Sys.Sleep 500 }
  & $script:Sys.Sleep 1500   # Dota releases its files a moment after the process ends
  Say 'Dota закрыта.'
}

# The owner's pak03: kept as .gs-backup (or a .gs-none marker when there was none) while packs are installed.
function Restore-Owner($paths, $ourHashes) {
  if (-not (Test-Path -LiteralPath $paths.backup) -and -not (Test-Path -LiteralPath $paths.none)) { return 'nothing' }
  Wait-DotaClosed 'чтобы вернуть твой pak03_dir.vpk'
  if (Test-Path -LiteralPath $paths.pak) {
    $h = Get-Sha $paths.pak
    if (@($ourHashes) -contains $h) { Remove-Item -LiteralPath $paths.pak -Force }
    elseif (Test-Path -LiteralPath $paths.backup) {
      # Not one of our packs (unexpected): keep it aside rather than delete it.
      $aside = $paths.pak + '.gs-replaced-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
      Move-Item -LiteralPath $paths.pak -Destination $aside
      Say "Незнакомый pak03_dir.vpk отложен как $(Split-Path -Leaf $aside)." 'Yellow'
    }
  }
  $result = 'removed'
  if (Test-Path -LiteralPath $paths.backup) { Move-Item -LiteralPath $paths.backup -Destination $paths.pak; $result = 'restored' }
  if (Test-Path -LiteralPath $paths.none) { Remove-Item -LiteralPath $paths.none -Force }
  return $result
}

function Backup-Owner($paths) {
  if ((Test-Path -LiteralPath $paths.backup) -or (Test-Path -LiteralPath $paths.none)) { throw 'Прошлая копия pak03 не вернулась на место — ничего не трогаю.' }
  if (Test-Path -LiteralPath $paths.pak) { Move-Item -LiteralPath $paths.pak -Destination $paths.backup; return 'backup' }
  [IO.File]::WriteAllText($paths.none, 'GridStudio HUD capture: there was no pak03_dir.vpk here; delete pak03_dir.vpk to restore.')
  return 'none'
}

function Install-Pack($paths, $pack) {
  if (& $script:Sys.DotaRunning) { throw 'Dota запущена — пакет не меняю.' }
  if (-not (Test-Path -LiteralPath $paths.backup) -and -not (Test-Path -LiteralPath $paths.none)) { throw 'Нет копии твоего pak03 — пакет не ставлю.' }
  Copy-Item -LiteralPath $pack.local -Destination $paths.pak -Force
  if ((Get-Sha $paths.pak) -ne $pack.sha256) { throw "Пакет $($pack.id) скопировался с ошибкой." }
}

# ---------------------------------------------------------------- manifest and packs
function Get-Remote([string]$rel, [string]$dest) {
  if ($Base -match '^https?://') {
    $wc = New-Object Net.WebClient
    try { $wc.DownloadFile(($Base.TrimEnd('/') + '/' + $rel), $dest) } finally { $wc.Dispose() }
  } else { Copy-Item -LiteralPath (Join-Path $Base $rel) -Destination $dest -Force }
}

function Get-Manifest([string]$cache) {
  $file = Join-Path $cache 'manifest.json'
  $tmp = "$file.tmp"
  try { Get-Remote 'manifest.json' $tmp; Move-Item -LiteralPath $tmp -Destination $file -Force }
  catch {
    if (-not (Test-Path -LiteralPath $file)) { throw "Не скачался manifest.json: $($_.Exception.Message)" }
    Say 'Сайт не ответил — беру пакеты, скачанные раньше.' 'Yellow'
  }
  $m = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8) | ConvertFrom-Json
  if (-not $m.packs) { throw 'manifest.json без пакетов.' }
  $snap = $m.plan.snapshot
  if (-not $snap) {
    $pf = Join-Path $cache 'plan.json'
    Get-Remote $m.plan.file $pf
    if ($m.plan.sha256 -and (Get-Sha $pf) -ne $m.plan.sha256) { throw 'plan.json повреждён (хеш не совпал).' }
    $snap = [IO.File]::ReadAllText($pf, [Text.Encoding]::UTF8) | ConvertFrom-Json
  }
  return @{ m = $m; snap = $snap }
}

function Sync-Packs($manifest, [string]$cache) {
  $packs = [ordered]@{}
  foreach ($p in $manifest.packs) {
    $dir = Join-Path (Join-Path $cache 'packs') $p.id
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $local = Join-Path $dir 'pak03_dir.vpk'
    $ok = (Test-Path -LiteralPath $local) -and ((Get-Item -LiteralPath $local).Length -eq [int64]$p.bytes) -and ((Get-Sha $local) -eq $p.sha256)
    if (-not $ok) {
      $tmp = "$local.tmp"
      Get-Remote $p.file $tmp
      $len = (Get-Item -LiteralPath $tmp).Length
      $sha = Get-Sha $tmp
      if ($len -ne [int64]$p.bytes -or $sha -ne $p.sha256) { Remove-Item -LiteralPath $tmp -Force; throw "Пакет $($p.id) скачался повреждённым (размер $len, хеш не совпал). Запусти команду ещё раз." }
      Move-Item -LiteralPath $tmp -Destination $local -Force
    }
    $packs[$p.id] = @{ id = $p.id; role = $p.role; local = $local; sha256 = $p.sha256; seconds = $p.seconds; when = $p.when }
  }
  return $packs
}

# ---------------------------------------------------------------- screenshot folder watching
function New-ShotWatch([string]$dir) {
  $w = @{ dir = $dir; seen = (New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)); pending = @{}; jpg = 0 }
  foreach ($f in [IO.Directory]::GetFiles($dir)) { [void]$w.seen.Add($f) }
  return $w
}

# New PNGs whose size held still between two polls; JPGs are counted and ignored.
function Get-NewShots($w) {
  $ready = New-Object System.Collections.ArrayList
  foreach ($f in [IO.Directory]::GetFiles($w.dir)) {
    if ($w.seen.Contains($f)) { continue }
    $ext = [IO.Path]::GetExtension($f).ToLowerInvariant()
    if ($ext -ne '.png') {
      if ($ext -eq '.jpg' -or $ext -eq '.jpeg') { $w.jpg++ }
      [void]$w.seen.Add($f); continue
    }
    $len = -1
    try { $len = (New-Object IO.FileInfo $f).Length } catch { }
    if ($len -gt 0 -and $w.pending.ContainsKey($f) -and $w.pending[$f].len -eq $len) {
      [void]$w.seen.Add($f); $w.pending.Remove($f); [void]$ready.Add($f)
    } elseif ($w.pending.ContainsKey($f)) { $w.pending[$f].len = $len }
    else { $w.pending[$f] = @{ len = $len; at = (Get-Now) } }
  }
  return @($ready | Sort-Object { (New-Object IO.FileInfo $_).LastWriteTimeUtc }, { $_ })
}

# A PNG that failed to decode as truncated goes back for another try (Steam may still be writing).
function Undo-Shot($w, [string]$f) { [void]$w.seen.Remove($f); $w.pending[$f] = @{ len = -1; at = (Get-Now) } }

# ---------------------------------------------------------------- plan-derived tables
function Initialize-Plan($snap) {
  $g = $snap.geometry
  [GsProbeV2]::Free = [int[]]@($g.free | ForEach-Object { $_[0]; $_[1] })
  [GsProbeV2]::LowerBg = [int[]]@($g.lowerBackdrop | ForEach-Object { $_[0]; $_[1] })
  [GsProbeV2]::RingX = [int]$g.ring.x
  [GsProbeV2]::RingY0 = [int]$g.ring.y[0] - 100
  [GsProbeV2]::RingY1 = [int]$g.ring.y[1] + 100
  [GsProbeV2]::ChatBox = [int[]]@($g.chatInk)
  [GsProbeV2]::ClonePt = [int[]]@($g.cloneProbe)
  $P = @{ snap = $snap; markBlock = @{}; sweep = [ordered]@{}; real = @(); scales = @($snap.lower.scales)
    minPhase = [double]$snap.watcher.minPhase; interval = [double]$snap.watcher.interval; jitter = [double]$snap.watcher.jitter
    sMin = $(if ($snap.watcher.sMin) { [double]$snap.watcher.sMin } else { 60 }); sCap = $(if ($snap.watcher.sCap) { [double]$snap.watcher.sCap } else { 100 })
    queue = @($snap.queue | Where-Object { $_ })
    cap = [double]$snap.watcher.cap; lowerPeriod = [double]$snap.lower.period; lowerHeight = [double]$g.lowerHeight; spread = [double]$g.ring.spread }
  foreach ($b in $snap.lower.blocks) {
    if ([int]$b.mark -gt 0) { $P.markBlock[[string][int]$b.mark] = $b.id }
    if ($b.sweep) { $P.sweep[$b.id] = [string]$b.sweep }
    elseif ($b.fixed -eq 'T') { $P.real += $b.id }
  }
  return $P
}

function Get-RingScale([int]$row) {
  # Display only: nearest scale by the emulator geometry (ring top = lower top − spread, both scaled).
  $best = 0; $bd = 1e9
  foreach ($s in $script:P.scales) {
    $y = 1080 - ($script:P.lowerHeight + $script:P.spread) * [double]$s / 100
    if ([Math]::Abs($y - $row) -lt $bd) { $bd = [Math]::Abs($y - $row); $best = $s }
  }
  return $best
}

# ---------------------------------------------------------------- per-pack state and classification
function Get-Role([string]$id) {
  if ($id -eq 'C1' -or $id -eq 'F-bg') { return 'main' }
  if ($id -eq 'C2') { return 'accept' }
  if ($id -like 'S-*') { return 'scale' }
  return 'other'
}

function New-PackState([string]$id) {
  $role = Get-Role $id
  $v = [ordered]@{}
  if ($role -eq 'main') { foreach ($k in 'backdrop', 'ring', 'lowerBackdrop', 'chatInk', 'wash') { $v[$k] = 'wait' } }
  elseif ($role -eq 'scale') { foreach ($k in 'backdrop', 'ring', 'lowerBackdrop', 'chatInk') { $v[$k] = 'wait' } }
  else { $v['backdrop'] = 'wait' }
  return @{ id = $id; role = $role; frames = 0; phase = 1; p2 = $null; t0 = $null
    g = @{ K = 0; W = 0; T = 0; nK = 0; nW = 0 }; keys = @{}; clusters = (New-Object System.Collections.ArrayList)
    tops = (New-Object System.Collections.ArrayList); chatX = (New-Object System.Collections.ArrayList); kFrames = 0; sweepCore = 0
    clones = @{}; ring = 0; seq = (New-Object System.Collections.ArrayList); verdicts = $v; warned = @{} }
}

function Add-Cluster($list, [int]$value, [int]$tol) {
  for ($i = 0; $i -lt $list.Count; $i++) { if ([Math]::Abs($list[$i].v - $value) -le $tol) { $list[$i].n++; return $i } }
  [void]$list.Add(@{ v = $value; n = 1 }); return ($list.Count - 1)
}

function Add-Key($st, [string]$k) { if ($st.keys.ContainsKey($k)) { $st.keys[$k]++ } else { $st.keys[$k] = 1 } }

# One frame into the pack state. $t: seconds since the pack's first frame.
function Update-PackState($st, $f, [double]$t) {
  $st.frames++
  $g = [string]$f.Global
  $st.g[$g]++
  $gKWT = ($g -eq 'K' -or $g -eq 'W' -or $g -eq 'T')
  if ($g -eq 'K') { $st.kFrames++ }
  $key = ''
  if ($f.RingMark -gt 0) {
    $st.ring++
    $cid = Add-Cluster $st.clusters $f.RingRow 2
    $b = $script:P.markBlock[[string]$f.RingMark]
    if ($f.RingPart -eq 0 -and $b) {
      if ($script:P.real -contains $b) { if ($gKWT) { $key = "real.$b.$g" } }
      elseif ($script:P.sweep.Contains($b)) {
        $st.sweepCore++
        Add-Key $st "lowx.$b"
        if ($f.Local -eq 'K' -or $f.Local -eq 'W' -or $f.Local -eq 'G') { $key = "low.$b.$($f.Local)" }
      }
    }
  } elseif ($gKWT) { $key = "hide.$g" }
  if ($key) { Add-Key $st $key }
  if ($g -eq 'K' -and $f.TopL -ge 0) { [void](Add-Cluster $st.tops ($f.TopR - $f.TopL) 3) }
  if ($g -eq 'K' -and $f.ChatMaxX -ge 0) { [void]$st.chatX.Add([int]$f.ChatMaxX) }
  if ($g -eq 'K') { $st.clones['{0:x6}' -f ($f.Clone -band 0xFCFCFC)] = 1 }
  $hid = ($f.TopL -eq -1 -and $f.LowL -eq -1)
  [void]$st.seq.Add(@($t, $g, $hid))
  return $key
}

# Every pack runs one static lower scale (one ring row): each sweep block with each backdrop of its sweep
# (just «seen» if the lower-backdrop probes never read), C1's real views with K/W/T, the hidden lower with K/W/T.
function Get-Coverage($st) {
  $need = 0; $have = 0
  $noLocal = ($st.verdicts['lowerBackdrop'] -eq 'fail')
  foreach ($b in $script:P.sweep.Keys) {
    $bgs = if ($noLocal) { @('x') } else { [char[]]$script:P.sweep[$b] | ForEach-Object { [string]$_ } }
    foreach ($bg in $bgs) { $need++; $k = if ($noLocal) { "lowx.$b" } else { "low.$b.$bg" }; if ($st.keys.ContainsKey($k)) { $have++ } }
  }
  if ($st.role -eq 'main') { foreach ($b in $script:P.real) { foreach ($g in 'K', 'W', 'T') { $need++; if ($st.keys.ContainsKey("real.$b.$g")) { $have++ } } } }
  foreach ($g in 'K', 'W', 'T') { $need++; if ($st.keys.ContainsKey("hide.$g")) { $have++ } }
  return @{ need = $need; have = $have; clusters = $st.clusters.Count }
}

# C2: hide-all windows (K/W frames with no top bar and no bottom row) and T frames inside them.
function Get-HiddenStats($st) {
  $win = 0; $last = -1e9; $kw = @()
  foreach ($s in $st.seq) {
    if ($s[1] -eq 'K' -or $s[1] -eq 'W') { $kw += , $s; if ($s[2]) { if ($s[0] - $last -gt 8) { $win++ }; $last = $s[0] } }
  }
  $ht = 0
  foreach ($s in $st.seq) {
    if ($s[1] -ne 'T') { continue }
    $before = $null; $after = $null
    foreach ($k in $kw) { if ($k[0] -lt $s[0]) { $before = $k } elseif ($null -eq $after) { $after = $k } }
    if ($before -and $after -and $before[2] -and $after[2] -and ($s[0] - $before[0]) -le 3.5 -and ($after[0] - $s[0]) -le 3.5) { $ht++ }
  }
  return @{ windows = $win; hiddenT = $ht }
}

# Verdicts from the frames so far ($t: seconds since the first frame). Returns the names that changed.
function Update-Verdicts($st, [double]$t) {
  $v = $st.verdicts; $changed = @()
  $set = { param($k, $val) if ($v.Contains($k) -and $v[$k] -ne $val) { $v[$k] = $val; $script:changedVerdicts += $k } }
  $script:changedVerdicts = @()
  if ($v.Contains('backdrop') -and $v['backdrop'] -eq 'wait') {
    if ($st.g.K -ge 1 -and $st.g.W -ge 1) { & $set 'backdrop' 'ok' }
    elseif ($t -ge 30 -and $st.frames -ge 12) { if ($st.g.nK + $st.g.nW -gt 0) { & $set 'backdrop' 'near' } else { & $set 'backdrop' 'fail' } }
  }
  if ($v.Contains('ring') -and $v['ring'] -eq 'wait') {
    if ($st.ring -ge 1) { & $set 'ring' 'ok' } elseif ($t -ge 30 -and $st.frames -ge 12) { & $set 'ring' 'fail' }
  }
  if ($v.Contains('lowerBackdrop') -and $v['lowerBackdrop'] -eq 'wait') {
    $any = $false; foreach ($k in $st.keys.Keys) { if ($k -like 'low.*') { $any = $true; break } }
    if ($any) { & $set 'lowerBackdrop' 'ok' } elseif ($st.sweepCore -ge 30) { & $set 'lowerBackdrop' 'fail' } elseif ($v['ring'] -eq 'fail') { & $set 'lowerBackdrop' 'unknown' }
  }
  if ($v.Contains('chatInk') -and ($v['chatInk'] -eq 'wait' -or ($v['chatInk'] -eq 'noink' -and $st.chatX.Count -ge 1))) {
    if ($st.chatX.Count -ge 1) { & $set 'chatInk' 'ok' } elseif ($t -ge 25 -and $st.kFrames -ge 6) { & $set 'chatInk' 'noink' }
  }
  if ($v.Contains('wash') -and $v['wash'] -eq 'wait') {
    if ($st.clones.Count -ge 2) { & $set 'wash' 'ok' } elseif ($t -ge 70 -and $st.kFrames -ge 15) { & $set 'wash' 'fail' }
  }
  return $script:changedVerdicts
}

# Is the pack finished? Returns '' (not yet), 'ok' or 'cap'.
function Test-PackDone($st, [double]$t) {
  switch ($st.role) {
    'main' {
      if ($t -ge $script:P.cap) { return 'cap' }
      if ($st.phase -ne 2 -or $null -eq $st.p2 -or ($t - $st.p2) -lt $script:P.minPhase) { return '' }
      if ($st.verdicts['ring'] -eq 'fail') { if ($t -ge 2 * $script:P.lowerPeriod) { return 'ok' }; return '' }
      $c = Get-Coverage $st
      if ($c.have -ge $c.need) { return 'ok' }
      return ''
    }
    'accept' {
      if ($t -ge 90) { return 'cap' }
      if ($t -lt 60 -or $st.g.K -lt 3 -or $st.g.W -lt 3 -or $st.g.T -lt 3) { return '' }
      $h = Get-HiddenStats $st
      if ($h.windows -ge 2 -and ($h.hiddenT -ge 2 -or $t -ge 81)) { return 'ok' }
      return ''
    }
    'scale' {
      if ($t -ge $script:P.sCap) { return 'cap' }
      if ($t -lt $script:P.sMin) { return '' }
      if ($st.verdicts['ring'] -eq 'fail') { if ($t -ge 75) { return 'ok' }; return '' }
      $c = Get-Coverage $st
      if ($c.have -ge $c.need) { return 'ok' }
      return ''
    }
  }
  if ($t -ge 75) { return 'cap' }
  return ''
}

function Test-FrameActive($st, $f) {
  if ($st.role -eq 'main' -or $st.role -eq 'scale') { return ($f.RingMark -gt 0 -or $f.Global -eq 'K' -or $f.Global -eq 'W') }
  return ($f.Global -eq 'K' -or $f.Global -eq 'W')
}

function Get-FrameSummary($f) {
  return [ordered]@{ g = $f.Global; l = $f.Local; ring = $f.RingRow; mark = $f.RingMark; part = $f.RingPart
    top = @($f.TopL, $f.TopR); low = @($f.LowL, $f.LowR); chat = $f.ChatMaxX; ink = $f.ChatInk; clone = ('{0:x6}' -f $f.Clone) }
}

# ---------------------------------------------------------------- owner instructions (plan.user_instructions_ru, plan.captures[].in_game)
function Show-PackIntro([string]$id, [int]$attempt) {
  $again = if ($attempt -gt 1) { " (попытка $attempt)" } else { '' }
  $n = [Array]::IndexOf([string[]]@($script:S.queueAll), $id) + 1
  $of = if ($n -gt 0) { " — запуск $n из $(@($script:S.queueAll).Count)" } else { '' }
  $chat3 = 'Enter → го рошан → Enter;   Shift+Enter → gg wp → Enter;   Enter → нужна мана → Enter.'
  $lines = switch -Wildcard ($id) {
    'C1' { @("СЪЁМКА 1 (пакет C1, около 6 минут)$of$again",
        '1. Запусти Dota → Герои → Keeper of the Light → «ОПРОБОВАТЬ». Ничего не покупай и способности не изучай:',
        '   жёлтые «+» над способностями должны остаться. Фон под интерфейсом будет мигать, панели иногда пропадать,',
        '   левой панели демо не видно: так и задумано.',
        '2. F9 — пауза. Надпись о паузе скрыта пакетом: проверь по часам вверху, что время встало.',
        '3. Уже на паузе напиши в чат три строки (больше в чат ничего не пиши):',
        "   $chat3",
        '4. Курсор в точку А: у правого края экрана (3–4 см от края), на четверть высоты сверху, над землёй,',
        '   не над юнитами и не над интерфейсом. Мышь и камеру больше не трогай.',
        '5. Нажми F12 один раз. Дальше скрипт снимает сам примерно каждые 0,75 с. Не сворачивай Dota (Alt+Tab).',
        '   Примерно через 2 минуты будет ДВОЙНОЙ сигнал — тогда смотри сюда.') }
    'F-bg' { @("ЗАПАСНАЯ СЪЁМКА F-bg — повтор съёмки 1 целиком$again",
        '1. Запусти Dota → Герои → Keeper of the Light → «ОПРОБОВАТЬ». Ничего не покупай и не изучай.',
        '2. F9 — пауза (часы вверху должны встать).',
        "3. Три строки чата: $chat3",
        '4. Курсор в точку А (у правого края, на четверть высоты сверху, над землёй). Мышь больше не трогай.',
        '5. F12 один раз — дальше скрипт сам. Через ~2 минуты двойной сигнал, как в съёмке 1.') }
    'S-*' {
      $parts = $id -split '-'
      @("СЪЁМКА $id (нижняя панель $($parts[1]) %, верхняя $($parts[2]) %), около 2 минут$of$again",
        '   Панели и шрифт чата будут другого размера — так и надо.',
        '1. Запусти Dota → Keeper of the Light → «ОПРОБОВАТЬ». F9 — пауза.',
        "2. Три строки чата: $chat3",
        '3. Курсор в точку А, F12 один раз. Около минуты до тройного сигнала, потом выйди и закрой Dota.') }
    'C2' { @("СЪЁМКА 2 — проверка (около 3 минут)$of$again",
        '1. Запусти Dota → Keeper of the Light → «ОПРОБОВАТЬ». Интерфейс теперь другой, так и надо: подложка нижней',
        '   панели голубоватая и полупрозрачная, панели другого размера, чат посередине на тёмном фоне.',
        "2. F9, те же три строки чата ($chat3),",
        '   курсор в точку А, F12 один раз.',
        '3. Примерно через минуту — тройной сигнал. Закрой Dota.') }
    default { @("Пакет $id$again", 'Запусти Dota, демо, F9, курсор в точку А, F12 один раз.') }
  }
  Say ''
  Say $lines[0] 'Cyan'
  foreach ($l in $lines[1..($lines.Count - 1)]) { Say $l }
}

function Show-FlipInstructions {
  Say ''
  Say 'ДВОЙНОЙ СИГНАЛ: первая половина готова, скрипт пока не снимает.' 'Cyan'
  Say ' • Открой настройки (шестерёнка вверху слева), в поиске настроек набери «слепоты» и переключи'
  Say '   «Режим цветовой слепоты»: был включён — выключи, был выключен — включи. Закрой настройки.'
  Say ' • Курсор в точку Б: так же у правого края, но на середине высоты экрана. Мышь больше не трогай.'
  Say ' • Нажми F12 один раз — скрипт продолжит сам (ещё примерно 2 минуты).'
}

function Show-CrashMessage([string]$id, [string]$how) {
  & $script:Sys.Beep 'long'
  Say ''
  Say "DOTA НЕ ЗАГРУЗИЛА ИНТЕРФЕЙС С ПАКЕТОМ $id ($how)." 'Red'
  Say 'Твой pak03_dir.vpk уже на месте — Dota снова запускается как обычно.' 'Red'
  Say 'Пришли текст ошибки (или скриншот окна ошибки) — пакет поправим. Архив со снимками всё равно соберу.' 'Red'
}

$script:VerdictText = @{
  backdrop = @{ fail = 'фон под интерфейсом не рисуется (нет чистого чёрного/белого)'; near = 'фон почти чёрный/белый, но не точный (фильтры изображения?)' }
  ring = @{ fail = 'не вижу метку нижней панели — съёмка будет идти по времени' }
  lowerBackdrop = @{ fail = 'не вижу подложку под нижней панелью в точках проверки' }
  chatInk = @{ noink = 'в чате не видно строк' }
  wash = @{ fail = 'тестовая подложка не меняет цвет (это не страшно, просто отмечаю)' }
}

# ---------------------------------------------------------------- one pack, live
function Invoke-Pack($S, [string]$id, [int]$attempt) {
  $paths = $S.paths; $pack = $S.packs[$id]
  Wait-DotaClosed "чтобы поставить пакет $id"
  Install-Pack $paths $pack
  [void]$S.events.Add([ordered]@{ t = (Get-Now); pack = $id; event = 'installed'; attempt = $attempt })
  Show-PackIntro $id $attempt
  $st = New-PackState $id
  $rec = [ordered]@{ id = $id; attempt = $attempt; role = $st.role; wall = (Get-Date).ToString('o'); installedAt = [Math]::Round((Get-Now), 2); firstFrameAt = $null; phase2At = $null; pausedAt = $null
    endedAt = $null; frames = 0; result = ''; verdicts = $st.verdicts; coverage = $null; clusters = @(); notes = (New-Object System.Collections.ArrayList) }
  $rec.source = $(if ($script:UseSteam) { 'steam' } else { 'grab' })
  [void]$S.packRecords.Add($rec)
  $ctx = New-GrabState
  $watch = if ($script:UseSteam) { New-ShotWatch $S.shotsDir } else { $null }
  $R = $script:Run
  $R.mode = 'waitDota'; $R.since = Get-Now; $R.pack = $id
  $inactive = 0; $nextPress = 0; $lastFrameAt = 0; $presses = New-Object System.Collections.ArrayList
  $notFgSince = $null; $silenceWarned = $false; $fgWarned = $false; $lastStatus = 0; $doneAt = $null; $result = $null
  $pausedAt = $null; $lastRemind = 0; $dotaGoneAt = $null; $badSize = 0; $jpgWarned = $false; $retry = @{}
  $lastFatalCheck = 0; $noHudWarned = $false; $how = ''
  if ($null -eq $script:NoHudSeconds) { $script:NoHudSeconds = 420 }
  if (& $script:Sys.DotaRunning) { $R.mode = 'waitFirst' } else { Say 'Жду запуска Dota…' }
  while ($true) {
    $now = Get-Now
    $running = & $script:Sys.DotaRunning
    if ($R.mode -eq 'waitDota' -and $running) { $R.mode = 'waitFirst'; $R.since = $now; Say "Dota запущена. Когда будешь в демо на паузе, с курсором на месте — нажми F12 один раз$(if (-not $script:UseSteam) { ' (скрипт услышит клавишу и начнёт снимать экран сам)' })." }
    # A crash on load: Dota's FATAL ERROR box, or Dota gone before the first frame; no HUD for a long time.
    if ($R.mode -eq 'waitFirst' -or $R.mode -eq 'auto' -or $R.mode -eq 'paused') {
      if ($running -and ($now - $lastFatalCheck) -ge 2) { $lastFatalCheck = $now; if (& $script:Sys.DotaFatal) { $result = 'crash'; $how = 'окно FATAL ERROR'; break } }
    }
    if ($R.mode -eq 'waitFirst') {
      if (-not $running) { if ($null -eq $dotaGoneAt) { $dotaGoneAt = $now } elseif ($now - $dotaGoneAt -gt 3) { $result = 'crash'; $how = 'Dota закрылась до первого снимка'; break } }
      else { $dotaGoneAt = $null }
      if (-not $noHudWarned -and ($now - $R.since) -gt $script:NoHudSeconds) {
        $noHudWarned = $true; & $script:Sys.Beep 'long'
        Say "Прошло $([int]($script:NoHudSeconds / 60)) минут, а снимка с тестовым фоном нет. Если Dota показала ошибку, зависла или в демо нет интерфейса —" 'Red'
        Say 'закрой Dota: скрипт сразу вернёт твой pak03_dir.vpk. Если просто не успел — продолжай, F12 один раз, когда будешь готов.' 'Red'
      }
    }
    # Auto F12 (Steam route only).
    if ($script:UseSteam -and $R.mode -eq 'auto' -and $now -ge $nextPress) {
      $fg = & $script:Sys.DotaForeground
      if ($fg) {
        $sent = & $script:Sys.SendF12
        [void]$presses.Add($now)
        [void]$S.f12.Add([ordered]@{ t = [Math]::Round($now, 3); pack = $id; attempt = $attempt; sendInput = [bool]$sent })
        $notFgSince = $null
      } elseif ($null -eq $notFgSince) { $notFgSince = $now }
      $nextPress = $now + $script:P.interval + (Get-Random -Minimum (-$script:P.jitter) -Maximum $script:P.jitter)
    }
    if ($R.mode -eq 'auto' -and $null -ne $notFgSince -and ($now - $notFgSince) -gt 5 -and -not $fgWarned) {
      Say "Dota не на переднем плане — $(if ($script:UseSteam) { 'F12 не жму' } else { 'экран не снимаю' }). Вернись в игру (не сворачивай её)." 'Yellow'; $fgWarned = $true
    }
    if ($null -eq $notFgSince) { $fgWarned = $false }
    # New frames: Steam's PNGs (-Steam), or our grab of Dota's window — every ~0.75 s while capturing,
    # once per F12 the owner presses while waiting (start, the colour-blind flip).
    $incoming = @()
    if ($script:UseSteam) { $incoming = @(Get-NewShots $watch | ForEach-Object { @{ src = [IO.Path]::GetFileName($_); file = $_ } }) }
    else {
      $due = $false
      if ($R.mode -eq 'auto') { $due = ($now -ge $ctx.nextGrab) }
      elseif (($R.mode -eq 'waitFirst' -or $R.mode -eq 'paused') -and $running) { $due = [bool](& $script:Sys.F12Pressed) }
      if ($due) {
        if ($R.mode -eq 'auto') { $ctx.nextGrab = $now + $script:P.interval + (Get-Random -Minimum (-$script:P.jitter) -Maximum $script:P.jitter) }
        $g = & $script:Sys.Grab
        if ($null -eq $g) {
          if ($R.mode -ne 'auto') { Say 'F12 слышу, но Dota не на переднем плане — вернись в игру и нажми F12 ещё раз.' 'Yellow' }
          elseif ($null -eq $notFgSince) { $notFgSince = $now }
        } else {
          if ($R.mode -eq 'auto') { $notFgSince = $null; [void]$presses.Add($now); [void]$S.f12.Add([ordered]@{ t = [Math]::Round($now, 3); pack = $id; attempt = $attempt; grab = $true }) }
          $ctx.grabs++
          $incoming = @(@{ src = ('grab-{0:000000}' -f $ctx.grabs); grab = $g })
        }
      }
    }
    foreach ($in in $incoming) {
      $bytes = $null; $g = $null; $file = $in.file
      if (-not $file) {
        $g = $in.grab
        $f = if ($null -ne $g.rgb) { [GsProbeV2]::AnalyzeRgb($g.rgb, $g.w, $g.h) } else { $null }
        if (-not (Test-GrabUsable $ctx $g ($null -ne $f -and $f.RingMark -gt 0) ($R.mode -eq 'auto') $now $rec.notes)) { continue }
      } else {
      try { $bytes = [GsProbeV2]::ReadShared($file) } catch { Undo-Shot $watch $file; continue }
      $f = [GsProbeV2]::Analyze($bytes)
      if ($f.Error -match 'truncated') {
        if (-not $retry.ContainsKey($file)) { $retry[$file] = $now }
        if ($now - $retry[$file] -lt 10) { Undo-Shot $watch $file; continue }
      }
      if ($f.Error) {
        if ($f.Error -like 'size *') {
          $badSize++
          if ($badSize -le 2) { & $script:Sys.Beep 'long'; Say "Скриншот $([IO.Path]::GetFileName($file)) размером $($f.Width)×$($f.Height), а нужен 1920×1080. Поставь в Dota разрешение 1920×1080 (полный экран или окно без рамки)." 'Red' }
        } else { Say "Не читается $([IO.Path]::GetFileName($file)): $($f.Error)" 'Yellow' }
        [void]$rec.notes.Add("bad $([IO.Path]::GetFileName($file)): $($f.Error)")
        continue
      }
      }
      if ($R.mode -eq 'waitDota' -or $R.mode -eq 'waitFirst') {
        if (-not (Test-FrameActive $st $f)) {
          $inactive++
          Say "Снимок $($in.src) без тестового фона — ещё не в демо? Когда будешь готов (демо, пауза, курсор), нажми F12 ещё раз." 'Yellow'
          if ($inactive -eq 3) {
            & $script:Sys.Beep 'long'
            Say 'Пакет, похоже, не подхватился. Проверь: Dota на русском и с русской озвучкой (иначе папка dota_russian не читается),' 'Red'
            Say 'в параметрах запуска Dota нет -language, ты в демо Keeper of the Light. Если всё так — закрой Dota и запусти снова.' 'Red'
          }
          continue
        }
        $R.mode = 'auto'; $R.since = $now; $st.t0 = $now; $rec.firstFrameAt = [Math]::Round($now, 2); $dotaGoneAt = $null
        $nextPress = $now + $script:P.interval; $ctx.nextGrab = $now + $script:P.interval
        Say "Поехали: скрипт $(if ($script:UseSteam) { 'жмёт F12' } else { 'снимает экран' }) сам. $(if ($st.role -eq 'main') { 'Мышь не трогай, Dota не сворачивай.' } else { 'Мышь не трогай.' })" 'Green'
      }
      $t = $now - $st.t0
      if ($R.mode -eq 'paused' -and ($now - $pausedAt) -gt 3) {
        $st.phase = 2; $st.p2 = $t; $rec.phase2At = [Math]::Round($now, 2); $R.mode = 'auto'; $R.since = $now
        $nextPress = $now + $script:P.interval; $ctx.nextGrab = $now + $script:P.interval
        Say "Вторая половина пошла (пауза между половинами $([Math]::Round($now - $pausedAt)) с)." 'Green'
      }
      $key = Update-PackState $st $f $t
      if ($null -eq $bytes) { $bytes = [GsProbeV2]::EncodePng($g.rgb, $g.w, $g.h, $false) }
      $S.counters[$id] = 1 + $(if ($S.counters.Contains($id)) { $S.counters[$id] } else { 0 })
      $name = '{0}_{1:0000}.png' -f $id, $S.counters[$id]
      [IO.File]::WriteAllBytes((Join-Path $S.dir $name), $bytes)
      $frameRec = [ordered]@{ file = $name; src = $in.src; pack = $id; attempt = $attempt; phase = $st.phase
        t = [Math]::Round($now, 3); rel = [Math]::Round($t, 3); key = $key; probe = (Get-FrameSummary $f) }
      if ($file) { $frameRec.mtime = (New-Object IO.FileInfo $file).LastWriteTimeUtc.ToString('o') }
      [void]$S.frames.Add($frameRec)
      $rec.frames++; $lastFrameAt = $now; $silenceWarned = $false
      foreach ($k in (Update-Verdicts $st $t)) {
        $val = $st.verdicts[$k]
        [void]$S.events.Add([ordered]@{ t = (Get-Now); pack = $id; verdict = $k; value = $val })
        if ($val -eq 'ok') { continue }
        $txt = $script:VerdictText[$k][$val]
        if ($txt) { Say "Проверка: $txt." 'Yellow' }
        if ($k -eq 'chatInk' -and $val -eq 'noink') {
          & $script:Sys.Beep 'long'
          Say 'Напиши в чат три строки прямо сейчас: Enter → го рошан → Enter; Shift+Enter → gg wp → Enter; Enter → нужна мана → Enter.' 'Yellow'
        }
        if ($k -eq 'ring' -and $val -eq 'fail') { & $script:Sys.Beep 'long' }
        if ($k -eq 'backdrop' -and ($val -eq 'fail' -or $val -eq 'near') -and $st.role -eq 'main') {
          & $script:Sys.Beep 'long'
          $result = if ($id -eq 'C1') { 'switch-bg' } else { 'fatal-bg' }
        }
      }
      if ($result) { break }
    }
    if ($result) { break }
    if ($R.mode -eq 'auto' -or $R.mode -eq 'paused') {
      $t = $now - $st.t0
      # The colour-blind switch: phase 1 → pause → phase 2 on the owner's next F12.
      if ($st.role -eq 'main' -and $st.phase -eq 1 -and $R.mode -eq 'auto' -and $t -ge $script:P.minPhase) {
        $R.mode = 'paused'; $R.since = $now; $pausedAt = $now; $lastRemind = $now; $rec.pausedAt = [Math]::Round($now, 2)
        & $script:Sys.Beep 'double'; Show-FlipInstructions
      }
      if ($R.mode -eq 'paused' -and ($now - $lastRemind) -gt 60) { $lastRemind = $now; & $script:Sys.Beep 'double'; Say 'Жду F12 после переключения «Режима цветовой слепоты» и курсора в точку Б.' 'Yellow' }
      if ($R.mode -eq 'auto') {
        $d = Test-PackDone $st $t
        if ($d) { $result = $d; break }
        $recent = @($presses | Where-Object { $_ -gt $now - 10 }).Count
        if ($script:UseSteam -and ($now - [Math]::Max($lastFrameAt, $R.since)) -gt 10 -and $recent -ge 6 -and -not $silenceWarned) {
          $silenceWarned = $true; & $script:Sys.Beep 'long'
          Say 'Скриншоты не появляются. Похоже, Steam не принимает нажатия от скрипта: жми F12 сам примерно раз в секунду, пока не услышишь сигнал.' 'Red'
          Say "Если жмёшь, а счётчик стоит — проверь, что Steam сохраняет копии PNG в папку $($S.shotsDir)." 'Red'
          [void]$rec.notes.Add("silence at $([Math]::Round($t)) s")
        }
      }
      if (-not $running) {
        if ($null -eq $dotaGoneAt) { $dotaGoneAt = $now } elseif ($now - $dotaGoneAt -gt 3) { $result = 'dota-closed'; break }
      } else { $dotaGoneAt = $null }
    }
    if ($script:UseSteam -and $watch.jpg -ge 2 -and $rec.frames -eq 0 -and -not $jpgWarned) {
      $jpgWarned = $true; & $script:Sys.Beep 'long'
      Say 'В папку приходят только JPG. В Steam → Settings → In Game → Screenshots включи «Save an uncompressed copy» (PNG).' 'Red'
    }
    if ($now - $lastStatus -ge 1) {
      $lastStatus = $now
      if ($R.mode -eq 'auto' -or $R.mode -eq 'paused') { Show-Status (Format-Status $st ($now - $st.t0) $rec) }
    }
    & $script:Sys.Sleep $script:Sys.Tick
  }
  $now = Get-Now
  $t = if ($null -ne $st.t0) { $now - $st.t0 } else { 0 }
  $rec.endedAt = [Math]::Round($now, 2); $rec.result = $result
  $rec.coverage = Get-Coverage $st
  $rec.clusters = @($st.clusters | ForEach-Object { [ordered]@{ row = $_.v; frames = $_.n; scaleGuess = (Get-RingScale $_.v) } })
  $rec.counts = [ordered]@{ K = $st.g.K; W = $st.g.W; T = $st.g.T; nK = $st.g.nK; nW = $st.g.nW; ringFrames = $st.ring; topExtents = $st.tops.Count; chatFrames = $st.chatX.Count; cloneValues = $st.clones.Count }
  if ($st.role -eq 'accept') { $rec.hidden = Get-HiddenStats $st }
  if ($result -eq 'crash') {
    $rec.crash = $how
    [void]$S.events.Add([ordered]@{ t = (Get-Now); pack = $id; event = 'crash'; how = $how })
    if ((& $script:Sys.DotaRunning) -and (& $script:Sys.DotaFatal)) { & $script:Sys.KillDota; Say 'Закрыл зависшую Dota с ошибкой.' 'Yellow' }
    $R.mode = 'crashed'; $R.since = $now
    return @{ result = $result; state = $st; rec = $rec; how = $how }
  }
  $R.mode = 'finished'; $R.since = $now
  switch ($result) {
    'ok' { & $script:Sys.Beep 'triple'; Say "ТРОЙНОЙ СИГНАЛ: пакет $id готов ($($rec.frames) снимков). Выйди из матча и закрой Dota полностью." 'Green' }
    'cap' { & $script:Sys.Beep 'triple'; Say "Пакет ${id}: время вышло ($($rec.frames) снимков), беру что есть. Выйди из матча и закрой Dota." 'Yellow' }
    'switch-bg' { Say 'Фон под интерфейсом не рисуется. Нужна запасная съёмка F-bg (повтор съёмки 1). Выйди из матча и закрой Dota.' 'Red' }
    'fatal-bg' { Say 'Фон не рисуется и в запасном пакете. Сделай один скриншот демо на паузе (F12) и пришли его — дальше разберёмся. Закрой Dota.' 'Red' }
    'dota-closed' { & $script:Sys.Beep 'long'; Say "Dota закрылась до конца съёмки пакета $id." 'Yellow' }
  }
  # Late frames (Steam writes a moment after F12) until Dota is closed.
  $R.mode = 'waitClose'; $R.since = $now
  $grace = $now + 3
  while ((& $script:Sys.DotaRunning) -or (Get-Now) -lt $grace) {
    foreach ($file in $(if ($script:UseSteam) { Get-NewShots $watch } else { @() })) {
      $bytes = $null; try { $bytes = [GsProbeV2]::ReadShared($file) } catch { continue }
      $f = [GsProbeV2]::Analyze($bytes)
      if ($f.Error) { continue }
      $S.counters[$id] = 1 + $S.counters[$id]
      $name = '{0}_{1:0000}.png' -f $id, $S.counters[$id]
      [IO.File]::WriteAllBytes((Join-Path $S.dir $name), $bytes)
      [void]$S.frames.Add([ordered]@{ file = $name; src = [IO.Path]::GetFileName($file); pack = $id; attempt = $attempt; phase = $st.phase
        t = [Math]::Round((Get-Now), 3); rel = [Math]::Round((Get-Now) - $st.t0, 3); late = $true; key = ''; probe = (Get-FrameSummary $f) })
      $rec.frames++
    }
    & $script:Sys.Sleep 250
  }
  & $script:Sys.Sleep 1500
  return @{ result = $result; state = $st; rec = $rec }
}

function Format-Status($st, [double]$t, $rec) {
  $mm = [int][Math]::Floor($t / 60); $ss = [int][Math]::Floor($t % 60)
  $parts = @(('{0} · {1:00}:{2:00} · снимков {3}' -f $st.id, $mm, $ss, $rec.frames))
  if ($st.role -eq 'main') {
    $c = Get-Coverage $st
    $parts += "половина $($st.phase)"
    $parts += ('нижняя панель {0}%' -f [int](100 * $c.have / [Math]::Max(1, $c.need)))
  } elseif ($st.role -eq 'scale') {
    $c = Get-Coverage $st; $parts += ('готово {0}%' -f [int](100 * $c.have / [Math]::Max(1, $c.need)))
  }
  $parts += ('фон K/W/T {0}/{1}/{2}' -f $st.g.K, $st.g.W, $st.g.T)
  if ($script:Run.mode -eq 'paused') { $parts += 'ЖДУ F12' }
  return ($parts -join ' · ')
}

# ---------------------------------------------------------------- the session
function Save-Session($S, [string]$status) {
  $doc = [ordered]@{
    format = 'gs-hud-capture-session/1'; script = $script:GsVersion; status = $status
    started = $S.started; saved = (Get-Date).ToString('o'); clockStart = 'seconds below are since the script started'
    machine = [ordered]@{ powershell = $PSVersionTable.PSVersion.ToString(); os = [Environment]::OSVersion.VersionString }
    dota = $S.paths.root; source = $(if ($script:UseSteam) { 'steam' } else { 'grab' }); video = $S.video; shotsDir = $S.shotsDir
    manifest = [ordered]@{ generated = $S.manifest.generated; plan = $S.snap.plan; base = $Base }
    queue = @($S.queue); counters = $S.counters; packs = @($S.packRecords); frames = @($S.frames); f12 = @($S.f12)
    events = @($S.events); messages = @($script:Events)
  }
  $json = $doc | ConvertTo-Json -Depth 10
  Write-Utf8 (Join-Path $S.dir 'session.json') $json
}

function Get-ShotsDefault($steamRoot) {
  $cands = @()
  if ($steamRoot) {
    $ud = Join-Path $steamRoot 'userdata'
    if (Test-Path -LiteralPath $ud) {
      foreach ($cfg in @(Get-ChildItem -LiteralPath $ud -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'config\localconfig.vdf' })) {
        if (-not (Test-Path -LiteralPath $cfg)) { continue }
        foreach ($m in [regex]::Matches([IO.File]::ReadAllText($cfg), '"\w*Screenshot\w*(?:Path|Folder|Dir)\w*"\s+"([^"]+)"', 'IgnoreCase')) {
          $p = $m.Groups[1].Value -replace '\\\\', '\'
          if ($p -and (Test-Path -LiteralPath $p)) { $cands += $p }
        }
      }
    }
  }
  if ($cands.Count) { return $cands[0] }
  if ($script:OnWindows) { return 'C:\GSShots' }
  return ''
}

function Invoke-GsCapture {
  $ErrorActionPreference = 'Stop'
  $script:UseSteam = [bool]$Steam
  Initialize-GsTypes
  if (-not $script:Sys) { $script:Sys = New-RealSys }
  $script:Run = @{ mode = 'setup'; since = 0; pack = '' }
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
  Say "GridStudio: съёмка интерфейса Dota ($script:GsVersion). Окно не закрывай до конца." 'Cyan'
  $desktop = if ($OutDir) { $OutDir } else { [Environment]::GetFolderPath('Desktop') }
  $cache = if ($OutDir) { Join-Path $OutDir 'cache' } else { Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GridStudio\hud-capture' }
  New-Item -ItemType Directory -Force -Path $cache | Out-Null
  $cfgFile = Join-Path $cache 'config.json'
  $cfg = @{}
  if (Test-Path -LiteralPath $cfgFile) { try { $o = [IO.File]::ReadAllText($cfgFile) | ConvertFrom-Json; foreach ($p in $o.PSObject.Properties) { $cfg[$p.Name] = $p.Value } } catch { } }

  # Dota.
  $root = if ($DotaDir) { $DotaDir } elseif ($cfg.dota -and (Test-Path -LiteralPath (Join-Path $cfg.dota 'game\dota\gameinfo.gi'))) { $cfg.dota } else { Find-Dota }
  while (-not $root -or -not (Test-Path -LiteralPath (Join-Path (Join-Path (Join-Path $root 'game') 'dota') 'gameinfo.gi'))) {
    $root = Ask 'Не нашёл Dota. Вставь путь к папке «dota 2 beta» (…\steamapps\common\dota 2 beta)'
  }
  $paths = Get-DotaPaths $root
  Say "Dota: $root"
  if (-not (Test-Path -LiteralPath $paths.ru)) { throw "Нет папки $($paths.ru). Dota читает пакет только из dota_russian: включи русский язык и русскую озвучку Dota." }
  if (Test-Path -LiteralPath $paths.boot) {
    $m = [regex]::Match([IO.File]::ReadAllText($paths.boot), '"AudioLanguage"\s+"([^"]*)"')
    if ($m.Success -and $m.Groups[1].Value -ne 'russian') { Say "Внимание: язык озвучки Dota — «$($m.Groups[1].Value)». Dota читает dota_russian только с русской озвучкой: поменяй её в настройках Dota, иначе пакет не сработает." 'Yellow' }
  }

  # Manifest (also gives the hashes of our packs for a safe restore).
  $mf = Get-Manifest $cache
  $ours = @($mf.m.packs | ForEach-Object { $_.sha256 })

  # A leftover from an interrupted run comes back first.
  $r = Restore-Owner $paths $ours
  if ($r -ne 'nothing') { Say 'Твой pak03_dir.vpk с прошлого раза вернул на место.' 'Green' }
  if (Test-Path -LiteralPath ((Get-VideoCfgPath $root) + '.gs-capture-backup')) { Wait-DotaClosed 'чтобы вернуть твои настройки видео'; if (Restore-DotaVideo $root) { Say 'Режим экрана Dota с прошлого раза вернул как было.' 'Green' } }

  Say 'Скачиваю и проверяю пакеты…'
  $packs = Sync-Packs $mf.m $cache
  Say "Пакеты на месте: $(@($packs.Keys) -join ', ')."
  $script:P = Initialize-Plan $mf.snap

  # Screenshot folder (Steam route only; by default the watcher grabs the screen itself).
  $shots = $ShotsDir
  if ($script:UseSteam -and -not $shots) {
    $steamRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $root))
    $def = if ($cfg.shotsDir) { $cfg.shotsDir } else { Get-ShotsDefault $steamRoot }
    while (-not $shots) {
      $a = Ask "Папка, куда Steam сохраняет внешние копии скриншотов (PNG)$(if ($def) { " [Enter = $def]" })"
      $shots = if ($a) { $a } else { $def }
    }
  }
  if ($script:UseSteam) {
    if (-not (Test-Path -LiteralPath $shots)) {
      New-Item -ItemType Directory -Force -Path $shots | Out-Null
      Say "Создал папку $shots. Укажи её в Steam: Settings → In Game → Screenshots → «Save an external copy of my screenshots», и включи «Save an uncompressed copy»." 'Yellow'
    }
    $shots = (Resolve-Path -LiteralPath $shots).Path
    $cfg.shotsDir = $shots
  } else { $shots = $null }
  $cfg.dota = $root
  Write-Utf8 $cfgFile ($cfg | ConvertTo-Json)

  # Session folder (resume an unfinished one).
  $dir = Join-Path $desktop 'gs-hud-capture'
  $zip = Join-Path $desktop 'gs-hud-capture.zip'
  $S = @{ paths = $paths; packs = $packs; manifest = $mf.m; snap = $mf.snap; shotsDir = $shots; dir = $dir; started = (Get-Date).ToString('o'); video = $null
    queue = (New-Object System.Collections.ArrayList); counters = [ordered]@{}; packRecords = (New-Object System.Collections.ArrayList)
    frames = (New-Object System.Collections.ArrayList); f12 = (New-Object System.Collections.ArrayList); events = (New-Object System.Collections.ArrayList) }
  $script:S = $S
  $resumed = $false
  $old = Join-Path $dir 'session.json'
  if (Test-Path -LiteralPath $old) {
    $prev = $null; try { $prev = [IO.File]::ReadAllText($old, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { }
    $done = @($prev.packs | Where-Object { $_.result -eq 'ok' -or $_.result -eq 'cap' } | ForEach-Object { $_.id })
    # Only a session of the same plan resumes (a new pack set means a fresh start).
    if ($prev -and $prev.status -ne 'done' -and @($prev.queue).Count -gt 0 -and $prev.manifest.plan -eq $mf.snap.plan -and (Test-Yes (Ask "Нашёл незаконченную съёмку (готово: $(if ($done) { $done -join ', ' } else { 'ничего' }); осталось: $(@($prev.queue) -join ', ')). Продолжить? [Д/н]"))) {
      $resumed = $true
      $S.started = $prev.started
      foreach ($q in $prev.queue) { [void]$S.queue.Add([string]$q) }
      foreach ($p in $prev.counters.PSObject.Properties) { $S.counters[$p.Name] = [int]$p.Value }
      foreach ($x in @($prev.packs)) { [void]$S.packRecords.Add($x) }
      foreach ($x in @($prev.frames)) { [void]$S.frames.Add($x) }
      foreach ($x in @($prev.f12)) { [void]$S.f12.Add($x) }
      foreach ($x in @($prev.events)) { [void]$S.events.Add($x) }
      $script:Events.InsertRange(0, @($prev.messages))
      [void]$S.events.Add([ordered]@{ t = (Get-Now); event = 'resumed'; wall = (Get-Date).ToString('o') })
    } else {
      $aside = "$dir-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
      Move-Item -LiteralPath $dir -Destination $aside
      Say "Прошлая папка съёмки переименована в $(Split-Path -Leaf $aside)."
    }
  } elseif (Test-Path -LiteralPath $dir) {
    Move-Item -LiteralPath $dir -Destination ("$dir-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  }
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  if (-not $resumed) { foreach ($q in $(if ($script:InitialQueue) { $script:InitialQueue } elseif ($script:P.queue.Count) { $script:P.queue } else { @('C1', 'C2') })) { [void]$S.queue.Add([string]$q) } }
  $S.queueAll = @($S.queue)
  try {
    $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($dir))
    if ($drive.AvailableFreeSpace -lt 3GB) { Say "Мало места на диске $($drive.Name): нужно около 2–3 ГБ (снимки + архив)." 'Yellow' }
  } catch { }

  $status = 'aborted'
  try {
    if (& $script:Sys.DotaRunning) { Wait-DotaClosed 'пакеты меняются только при закрытой Dota' }
    if (-not $script:UseSteam) {
      # The grab needs a window under DWM: a fullscreen Dota goes borderless for the capture (put back at the end).
      $S.video = Set-DotaBorderless $root
      if ($S.video.state -eq 'switched') { Say 'Dota стоит в полноэкранном режиме — на время съёмки переключил её в «Окно без рамок». В конце верну как было.' 'Green' }
      if ($S.video.res -and $S.video.res -ne '1920x1080') { & $script:Sys.Beep 'long'; Say "В настройках Dota разрешение $($S.video.res -replace 'x', '×'), а нужно 1920×1080. Поменяй, когда Dota запустится: $script:BorderlessText." 'Yellow' }
    }
    [void](Backup-Owner $paths)
    Say 'Твой pak03_dir.vpk отложен (pak03_dir.vpk.gs-backup) и вернётся в конце, даже если прервать скрипт.' 'Green'
    $attempts = @{}
    while ($S.queue.Count -gt 0) {
      $id = [string]$S.queue[0]
      $attempts[$id] = 1 + $(if ($attempts.ContainsKey($id)) { $attempts[$id] } else { @($S.packRecords | Where-Object { $_.id -eq $id }).Count })
      $out = Invoke-Pack $S $id $attempts[$id]
      $res = $out.result
      if ($res -eq 'ok' -or $res -eq 'cap') {
        $S.queue.RemoveAt(0)
      } elseif ($res -eq 'switch-bg') { $S.queue[0] = 'F-bg' }
      elseif ($res -eq 'fatal-bg') { $S.queue.Clear(); $status = 'stopped' }
      elseif ($res -eq 'crash') {
        # Dota failed with the pack: the owner's pak03 back at once, then ask.
        $r = Restore-Owner $paths $ours
        Show-CrashMessage $id $out.how
        Save-Session $S 'running'
        $a = Ask "Что дальше? п — повторить $id, д — дальше без него, Enter — закончить съёмку"
        if ($a -match '^(п|p)') { [void](Backup-Owner $paths) }
        elseif (Test-Yes $a $false) { [void](Backup-Owner $paths); $S.queue.RemoveAt(0) }
        else { $S.queue.Clear(); $status = 'crashed' }
      }
      elseif ($res -eq 'dota-closed') {
        if (-not (Test-Yes (Ask "Повторить пакет $id с начала? [Д/н] (н — принять как есть и идти дальше)"))) { $S.queue.RemoveAt(0) }
      }
      Save-Session $S 'running'
    }
    if ($status -ne 'stopped' -and $status -ne 'crashed') { $status = 'done' }
  } finally {
    $script:Run.mode = 'restore'
    $r = 'nothing'
    try { $r = Restore-Owner $paths $ours } catch { Say "Не удалось вернуть pak03: $($_.Exception.Message). Запусти команду ещё раз — она первым делом вернёт файл." 'Red' }
    if ($r -eq 'restored') { Say 'Твой pak03_dir.vpk вернулся на место.' 'Green' }
    elseif ($r -eq 'removed') { Say 'Тестовый пакет убран (своего pak03_dir.vpk у тебя не было).' 'Green' }
    try {
      if (Test-Path -LiteralPath ((Get-VideoCfgPath $root) + '.gs-capture-backup')) {
        Wait-DotaClosed 'чтобы вернуть твои настройки видео'
        if (Restore-DotaVideo $root) { Say 'Режим экрана Dota вернул как было.' 'Green' }
      }
    } catch { Say "Не удалось вернуть настройки видео: $($_.Exception.Message). Файл лежит рядом: game\dota\cfg\video.txt.gs-capture-backup." 'Red' }
    try { Save-Session $S $(if ($status -eq 'aborted') { 'aborted' } else { $status }) } catch { }
    if ($status -eq 'aborted') { Say "Съёмка прервана. Снимки остались в $dir. Запусти команду ещё раз — можно будет продолжить." 'Yellow' }
  }

  # The archive.
  Say 'Собираю архив…'
  if (Test-Path -LiteralPath $zip) { Move-Item -LiteralPath $zip -Destination ($zip -replace '\.zip$', ('-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')) }
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::CreateFromDirectory($dir, $zip, [IO.Compression.CompressionLevel]::NoCompression, $false)
  $mb = [Math]::Round((Get-Item -LiteralPath $zip).Length / 1MB)
  Say ''
  Say "Готово: $zip ($mb МБ, снимков $($S.frames.Count))." 'Green'
  Say "Проверь, что в $($paths.ru) снова лежит твой pak03_dir.vpk. «Режим цветовой слепоты» верни, как тебе удобно."
  Say 'Загрузи gs-hud-capture.zip на 0807.st как файл и пришли ссылку. Не через Telegram: он пережимает картинки.'
  if ($script:UseSteam) { Say 'JPG-скриншоты в библиотеке Steam после съёмки можно удалить.' }
  if ($status -eq 'done') { & $script:Sys.OpenUrl 'https://0807.st' }
  return @{ status = $status; zip = $zip; dir = $dir; session = $S }
}

# ---------------------------------------------------------------- -SelfTest (Linux/macOS/Windows; no Win32)
function Assert-Gs([bool]$cond, [string]$what) {
  if ($cond) { $script:TestOk++ ; if (-not $script:TestQuietOk) { Write-Host "  ok  $what" -ForegroundColor DarkGreen } }
  else { $script:TestFail++; Write-Host "  FAIL $what" -ForegroundColor Red }
}

function Get-SynthSpec([string]$packId, [double]$t, $o, [string]$variant) {
  $snap = $script:P.snap
  $mod = { param($a, $m) (($a % $m) + $m) % $m }
  $gl = @('K', 'W', 'T')[[int][Math]::Floor((& $mod ($t + $o.g) 4.5) / 1.5)]
  $col = @{ K = 0; W = 0xFFFFFF; G = 0x808080; T = -1 }
  if ($variant -eq 'near') { $col.K = 0x010101; $col.W = 0xFEFEFE }
  $spec = @{ global = $col[$gl]; local = -1; lowerTop = 0; ringRow = -1; ringRgb = 0; topL = -1; topR = -1; lowerBody = $true; chat = -1; clone = -1 }
  $role = Get-Role $packId
  $kitPack = @($script:Kit.plan.packs | Where-Object { $_.id -eq $packId })[0]
  if ($role -eq 'main' -or $role -eq 'scale') {
    $slots = if ($role -eq 'main') { @($snap.lower.slots) } else { @($kitPack.lower) }
    $period = 1.5 * $slots.Count
    $slot = $slots[[int][Math]::Floor((& $mod ($t + $o.l) $period) / 1.5)]
    if (-not $slot.hidden) {
      $s = [double]$slot.scale
      $lt = [int][Math]::Round(1080 - 506 * $s / 100)
      $spec.lowerTop = $lt
      $spec.ringRow = [int][Math]::Round($lt - 6 * $s / 100)
      $mark = [int](@($snap.lower.blocks | Where-Object { $_.id -eq $slot.block })[0].mark)
      $b = @{ core = 0; g1 = 120; g2 = 240 }[[string]$slot.part]
      $spec.ringRgb = (255 -shl 16) -bor ((20 * $mark) -shl 8) -bor $b
      if ($slot.bg -ne 'T') { $spec.local = $col[[string]$slot.bg] }
    } else { $spec.lowerBody = $false }
    # Top bar at the pack's static scale (C1: hidden 6 s of every 18), the chat at its static font (none while the box is hidden).
    $ts = [double]$kitPack.scale.top; $wd = 830 * $ts / 100
    if ($role -eq 'scale' -or (& $mod ($t + $o.t) 18) -lt 12) { $spec.topL = [int](960 - $wd / 2); $spec.topR = [int](960 + $wd / 2) }
    if ((& $mod ($t + $o.c) 21) -lt 15 -and $variant -ne 'nochat') { $spec.chat = 40 + 10 * [int]$kitPack.chat.font }
    if ($role -eq 'main') { $spec.clone = 0x101010 * (1 + [int][Math]::Floor((& $mod ($t + $o.w) 54) / 6)) }
  } elseif ($role -eq 'accept') {
    if ((& $mod ($t + $o.h) 27) -lt 6) { $spec.lowerBody = $false } else { $spec.topL = 503; $spec.topR = 1417; $spec.chat = 700 }
  }
  return $spec
}

function Write-SynthShot([string]$packId, [double]$t, [string]$variant) {
  $sp = Get-SynthSpec $packId $t $script:Fake.off $variant
  $png = [GsProbeV2]::Synth($sp.global, $sp.local, $sp.lowerTop, $sp.ringRow, $sp.ringRgb, $sp.topL, $sp.topR, $sp.lowerBody, $sp.chat, $sp.clone)
  $script:Fake.n++
  $name = '570_{0:yyyyMMddHHmmss}_{1}.png' -f ([datetime]'2026-10-16').AddSeconds($t + 100000 * $script:Fake.n), $script:Fake.n
  [IO.File]::WriteAllBytes((Join-Path $script:Fake.shots $name), $png)
  if ($script:Fake.n -eq 3) { [IO.File]::WriteAllBytes((Join-Path $script:Fake.shots ('570_x_{0}.jpg' -f $script:Fake.n)), [byte[]](1, 2, 3)) }
}

# The fake owner: launches/closes Dota, presses the first F12, flips colour-blind mode after ~50 s.
function Invoke-FakeOwner {
  $F = $script:Fake; $R = $script:Run; $now = $F.now
  if ($R.mode -ne $F.lastMode) { $F.lastMode = $R.mode; $F.modeAt = $now }
  $since = $now - $F.modeAt
  switch ($R.mode) {
    'waitClose' { if ($since -gt 2) { $F.running = $false } }
    'waitDota' { if ($since -gt 3) { $F.running = $true } }
    'waitFirst' {
      if ($F.crash -eq 'fatal' -and $since -gt 4) { $F.crash = ''; $F.fatal = $true }
      elseif ($F.crash -eq 'exit' -and $since -gt 4) { $F.crash = ''; $F.running = $false }
      elseif ($F.crash -eq 'hang') { if ($since -gt $script:NoHudSeconds + 5) { $F.crash = ''; $F.running = $false } }
      elseif ($F.running -and $since -gt 5 -and $now - $F.lastManual -gt 5) {
        $F.lastManual = $now
        if (-not $script:UseSteam) { if ($F.inactiveLeft -gt 0) { $F.pendingMenu = $true }; $F.f12 = $true }
        elseif ($F.inactiveLeft -gt 0) { $F.inactiveLeft--; [IO.File]::WriteAllBytes((Join-Path $F.shots ('570_menu_{0}.png' -f $F.inactiveLeft)), [GsProbeV2]::Synth(-1, -1, 0, -1, 0, -1, -1, $true, -1, -1)) }
        else { Write-SynthShot $R.pack ($now - $F.packZero) $F.variant }
      }
    }
    'auto' { if ($F.closeAt -gt 0 -and $since -gt $F.closeAt) { $F.closeAt = 0; $F.running = $false } }
    'paused' { if ($since -gt 50 -and $now - $F.lastManual -gt 5) { $F.lastManual = $now; if ($script:UseSteam) { Write-SynthShot $R.pack ($now - $F.packZero) $F.variant } else { $F.f12 = $true } } }
    'finished' { $F.running = $false }
  }
}

function New-FakeSys {
  $script:Fake = @{ now = 0.0; running = $false; n = 0; lastMode = ''; modeAt = 0; lastManual = -100; packZero = 0; variant = ''; answers = (New-Object System.Collections.ArrayList); beeps = (New-Object System.Collections.ArrayList); shots = ''
    off = @{ g = 0.4; l = 37.3; t = 51.1; c = 12.7; w = 3.3; h = 2.2 }; inactiveLeft = 0; closeAt = 0; silence = @(); badSize = 0
    crash = ''; fatal = $false; killed = 0; pakPath = ''; pakAtAsk = (New-Object System.Collections.ArrayList); f12 = $false; pendingMenu = $false; grabs = 0; sent = 0 }
  return @{
    Now = { $script:Fake.now }
    Sleep = { param($ms) $script:Fake.now += $ms / 1000.0; Invoke-FakeOwner }
    Tick = 250
    DotaRunning = { $script:Fake.running }
    DotaForeground = { $true }
    DotaFatal = { $script:Fake.fatal }
    KillDota = { $script:Fake.running = $false; $script:Fake.fatal = $false; $script:Fake.killed++ }
    SendF12 = {
      $F = $script:Fake; $rel = $F.now - $F.modeAt; $F.sent++
      if ($F.badSize -gt 0) { $F.badSize--; [IO.File]::WriteAllBytes((Join-Path $F.shots '570_small.png'), [GsProbeV2]::EncodePng((New-Object byte[] (64 * 48 * 3)), 64, 48, $false)); return $true }
      if ($F.silence.Count -eq 2 -and $rel -ge $F.silence[0] -and $rel -lt $F.silence[1]) { return $true }
      Write-SynthShot $script:Run.pack ($F.now - $F.packZero) $F.variant; $true
    }
    Beep = { param($kind) [void]$script:Fake.beeps.Add("$($script:Run.pack):$kind") }
    Ask = { param($q) if ($script:Fake.pakPath -and (Test-Path -LiteralPath $script:Fake.pakPath)) { [void]$script:Fake.pakAtAsk.Add((Get-Sha $script:Fake.pakPath)) }; if ($script:Fake.answers.Count) { $a = $script:Fake.answers[0]; $script:Fake.answers.RemoveAt(0); return $a }; return '' }
    OpenUrl = { param($u) }
    # The grab of the fake Dota's window (nothing while it loads or fails); a menu frame for an early F12.
    Grab = {
      $F = $script:Fake
      if (-not $F.running -or $F.fatal) { return $null }
      $F.grabs++
      if ($F.pendingMenu) { $F.pendingMenu = $false; $F.inactiveLeft--; return @{ x = 0; y = 0; w = 1920; h = 1080; rgb = [GsProbeV2]::SynthRgb(-1, -1, 0, -1, 0, -1, -1, $true, -1, -1) } }
      if ($F.badSize -gt 0) { $F.badSize--; return @{ x = 0; y = 0; w = 1280; h = 720; rgb = $null } }
      $sp = Get-SynthSpec $script:Run.pack ($F.now - $F.packZero) $F.off $F.variant
      return @{ x = 0; y = 0; w = 1920; h = 1080; rgb = [GsProbeV2]::SynthRgb($sp.global, $sp.local, $sp.lowerTop, $sp.ringRow, $sp.ringRgb, $sp.topL, $sp.topR, $sp.lowerBody, $sp.chat, $sp.clone) }
    }
    F12Pressed = { if ($script:Fake.f12) { $script:Fake.f12 = $false; return $true }; return $false }
  }
}

function Test-CSharp5 {
  # Windows PowerShell 5.1 compiles Add-Type C# with the .NET Framework compiler (C# 5): parse both sources at C# 5 with Roslyn.
  try {
    $asm = [AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq 'Microsoft.CodeAnalysis.CSharp' } | Select-Object -First 1
    if (-not $asm) { Write-Host '  skip C# 5 syntax check (Roslyn not loaded)'; return }
    $optT = $asm.GetType('Microsoft.CodeAnalysis.CSharp.CSharpParseOptions')
    $lvT = $asm.GetType('Microsoft.CodeAnalysis.CSharp.LanguageVersion')
    $kindT = [AppDomain]::CurrentDomain.GetAssemblies() | ForEach-Object { $_.GetType('Microsoft.CodeAnalysis.SourceCodeKind') } | Where-Object { $_ } | Select-Object -First 1
    $opt = [Activator]::CreateInstance($optT, @([Enum]::Parse($lvT, 'CSharp5'), [Enum]::Parse([Microsoft.CodeAnalysis.DocumentationMode], 'Parse'), [Enum]::Parse($kindT, 'Regular'), $null))
    $treeT = $asm.GetType('Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree')
    $parse = $treeT.GetMethods() | Where-Object { $_.Name -eq 'ParseText' -and $_.GetParameters().Count -ge 2 -and $_.GetParameters()[0].ParameterType -eq [string] } | Select-Object -First 1
    foreach ($src in @($script:GsProbeSource, $script:GsWinSource, $script:GsGrabSource)) {
      $pargs = New-Object object[] ($parse.GetParameters().Count)
      $pargs[0] = $src; $pargs[1] = $opt
      for ($i = 2; $i -lt $pargs.Count; $i++) { $pp = $parse.GetParameters()[$i]; $pargs[$i] = if ($pp.HasDefaultValue) { $pp.DefaultValue } else { $null } }
      $tree = $parse.Invoke($null, $pargs)
      $errs = @($tree.GetDiagnostics() | Where-Object { $_.Severity.ToString() -eq 'Error' })
      Assert-Gs ($errs.Count -eq 0) ("C# 5 syntax: " + $(if ($errs.Count) { ($errs | Select-Object -First 3 | ForEach-Object { $_.ToString() }) -join ' | ' } else { 'clean' }))
    }
  } catch { Write-Host "  skip C# 5 syntax check: $($_.Exception.Message)" }
}

function Invoke-GsSelfTest {
  $ErrorActionPreference = 'Stop'
  $script:TestOk = 0; $script:TestFail = 0; $script:TestQuietOk = $false
  Initialize-GsTypes
  $tmpRoot = if ($OutDir) { $OutDir } else { Join-Path ([IO.Path]::GetTempPath()) ('gs-hud-selftest-' + [Guid]::NewGuid().ToString('n').Substring(0, 8)) }
  if (Test-Path -LiteralPath $tmpRoot) { Remove-Item -LiteralPath $tmpRoot -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
  $kit = if ($KitDir) { $KitDir } else { '/tmp/claude-0/-home-code-gridstudio/393fe78e-42d4-4fe6-823d-d9629de18d4f/scratchpad/hud-capture-kit/packs' }
  $probe = if ($ProbeDir) { $ProbeDir } else { '/tmp/claude-0/-home-code-gridstudio/393fe78e-42d4-4fe6-823d-d9629de18d4f/scratchpad/caps/probe/x' }
  Write-Host "Self-test in $tmpRoot (kit $kit)" -ForegroundColor Cyan
  $script:Sys = New-FakeSys
  $script:Run = @{ mode = 'test'; since = 0; pack = '' }
  $script:Quiet = $true

  Write-Host '[C#]'
  Test-CSharp5

  Write-Host '[manifest and packs]'
  $script:Kit = @{ plan = ([IO.File]::ReadAllText((Join-Path $kit 'plan.json')) | ConvertFrom-Json) }
  $srv = Join-Path $tmpRoot 'srv'
  Copy-Item -LiteralPath $kit -Destination $srv -Recurse
  Set-Variable -Name Base -Value $srv -Scope Script
  $cache = Join-Path $tmpRoot 'cache'; New-Item -ItemType Directory -Force -Path $cache | Out-Null
  $mf = Get-Manifest $cache
  Assert-Gs ($mf.snap.plan -eq $script:Kit.plan.plan) 'manifest carries the plan snapshot'
  $packs = Sync-Packs $mf.m $cache
  Assert-Gs (@($packs.Keys).Count -eq @($mf.m.packs).Count -and @($packs.Keys).Count -ge 8) "$(@($packs.Keys).Count) packs downloaded and verified ($(@($packs.Keys) -join ' '))"
  $c1 = Join-Path (Join-Path (Join-Path $cache 'packs') 'C1') 'pak03_dir.vpk'
  $t0 = (Get-Item -LiteralPath $c1).LastWriteTimeUtc
  Start-Sleep -Milliseconds 30
  $null = Sync-Packs $mf.m $cache
  Assert-Gs ((Get-Item -LiteralPath $c1).LastWriteTimeUtc -eq $t0) 'cached packs are not downloaded again'
  # Tampered server copy and tampered cache.
  $bytes = [IO.File]::ReadAllBytes((Join-Path $srv 'C2/pak03_dir.vpk')); $bytes[100] = $bytes[100] -bxor 0xFF
  [IO.File]::WriteAllBytes((Join-Path $srv 'C2/pak03_dir.vpk'), $bytes)
  Remove-Item -LiteralPath (Join-Path (Join-Path (Join-Path $cache 'packs') 'C2') 'pak03_dir.vpk')
  $threw = $false; try { $null = Sync-Packs $mf.m $cache } catch { $threw = ($_.Exception.Message -match 'C2') }
  Assert-Gs $threw 'a corrupted download is refused (hash)'
  Assert-Gs (-not (Test-Path -LiteralPath (Join-Path (Join-Path (Join-Path $cache 'packs') 'C2') 'pak03_dir.vpk.tmp'))) 'the corrupted temp file is removed'
  Copy-Item -LiteralPath (Join-Path $kit 'C2/pak03_dir.vpk') -Destination (Join-Path $srv 'C2/pak03_dir.vpk') -Force
  $packs = Sync-Packs $mf.m $cache
  $ours = @($mf.m.packs | ForEach-Object { $_.sha256 })
  $script:P = Initialize-Plan $mf.snap
  Assert-Gs ($script:P.real -join ',' -eq 'RDEF,RCLR,RCMP' -and @($script:P.sweep.Keys) -join ',' -eq 'HON,AON,AOFF,HOFF') 'blocks from the plan'
  Assert-Gs ([GsProbeV2]::RingY0 -eq 350 -and [GsProbeV2]::Free[4] -eq 1700) 'probe geometry from the plan'

  Write-Host '[backup / restore]'
  $root = Join-Path $tmpRoot 'Steam/steamapps/common/dota 2 beta'
  foreach ($d in 'game/dota/cfg', 'game/dota_russian') { New-Item -ItemType Directory -Force -Path (Join-Path $root $d) | Out-Null }
  Write-Utf8 (Join-Path $root 'game/dota/gameinfo.gi') 'x'
  $vpath = Get-VideoCfgPath $root
  [IO.File]::WriteAllText($vpath, "`"config`"`r`n{`r`n`t`"setting.defaultres`"`t`t`"1920`"`r`n`t`"setting.defaultresheight`"`t`t`"1080`"`r`n`t`"setting.fullscreen`"`t`t`"1`"`r`n`t`"setting.nowindowborder`"`t`t`"0`"`r`n}`r`n")
  $ownVideo = [IO.File]::ReadAllText($vpath)
  $paths = Get-DotaPaths $root
  Write-Utf8 $paths.pak 'OWNER PAK'
  $ownSha = Get-Sha $paths.pak
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'nothing') 'nothing to restore on a clean folder'
  $script:Fake.running = $true
  $threw = $false; try { [void](Backup-Owner $paths); Install-Pack $paths $packs['C1'] } catch { $threw = $true }
  Assert-Gs $threw 'refuses to install a pack while dota2 runs'
  $script:Fake.running = $false
  if (Test-Path -LiteralPath $paths.backup) { Move-Item -LiteralPath $paths.backup -Destination $paths.pak -Force }
  Assert-Gs ((Backup-Owner $paths) -eq 'backup' -and (Test-Path -LiteralPath $paths.backup) -and -not (Test-Path -LiteralPath $paths.pak)) 'owner pak03 → .gs-backup'
  $threw = $false; try { [void](Backup-Owner $paths) } catch { $threw = $true }
  Assert-Gs $threw 'a second backup over a leftover is refused'
  Install-Pack $paths $packs['C1']
  Assert-Gs ((Get-Sha $paths.pak) -eq $packs['C1'].sha256) 'C1 installed and verified'
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'restored' -and (Get-Sha $paths.pak) -eq $ownSha -and -not (Test-Path -LiteralPath $paths.backup)) 'restore puts the owner pak03 back'
  # Leftover from a crash: backup + our pack installed → restored at start.
  [void](Backup-Owner $paths); Install-Pack $paths $packs['S-70-70']
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'restored' -and (Get-Sha $paths.pak) -eq $ownSha) 'leftover backup restored first (crash case)'
  # Unknown file in place of our pack: set aside, never deleted.
  [void](Backup-Owner $paths); Write-Utf8 $paths.pak 'SOMETHING ELSE'
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'restored' -and (Get-Sha $paths.pak) -eq $ownSha -and @(Get-ChildItem -LiteralPath $paths.ru -Filter '*.gs-replaced-*').Count -eq 1) 'an unknown pak03 is set aside, the owner one restored'
  # No owner pak03 at all: marker, then removal.
  Get-ChildItem -LiteralPath $paths.ru -Filter '*.gs-replaced-*' | Remove-Item
  Move-Item -LiteralPath $paths.pak -Destination (Join-Path $tmpRoot 'owner.vpk')
  Assert-Gs ((Backup-Owner $paths) -eq 'none' -and (Test-Path -LiteralPath $paths.none)) 'no owner pak03 → .gs-none marker'
  Install-Pack $paths $packs['C2']
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'removed' -and -not (Test-Path -LiteralPath $paths.pak) -and -not (Test-Path -LiteralPath $paths.none)) 'marker case: our pack removed, nothing left'
  Move-Item -LiteralPath (Join-Path $tmpRoot 'owner.vpk') -Destination $paths.pak
  # Restore waits for Dota to close.
  [void](Backup-Owner $paths); Install-Pack $paths $packs['C1']
  $script:Fake.running = $true; $script:Run.mode = 'test'; $script:Fake.lastMode = ''
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'restored' -and -not $script:Fake.running) 'restore waits until Dota is closed'

  Write-Host '[folder watching]'
  $shots = Join-Path $tmpRoot 'shots'; New-Item -ItemType Directory -Force -Path $shots | Out-Null
  [IO.File]::WriteAllBytes((Join-Path $shots 'old.png'), [byte[]](1))
  $w = New-ShotWatch $shots
  $png = [GsProbeV2]::Synth(0, -1, 0, -1, 0, -1, -1, $false, -1, -1)
  [IO.File]::WriteAllBytes((Join-Path $shots 'a.png'), $png)
  [IO.File]::WriteAllBytes((Join-Path $shots 'b.jpg'), [byte[]](1, 2))
  $half = New-Object byte[] ([int]($png.Length / 2)); [Array]::Copy($png, $half, $half.Length)
  [IO.File]::WriteAllBytes((Join-Path $shots 'c.png'), $half)
  $r1 = @(Get-NewShots $w)
  Assert-Gs ($r1.Count -eq 0) 'a new file is not taken before its size holds still'
  [IO.File]::WriteAllBytes((Join-Path $shots 'c.png'), $png)
  $r2 = @(Get-NewShots $w)
  Assert-Gs ($r2.Count -eq 1 -and (Split-Path -Leaf $r2[0]) -eq 'a.png') 'stable PNG taken; JPG and old files ignored; growing file waits'
  $r3 = @(Get-NewShots $w)
  Assert-Gs ($r3.Count -eq 1 -and (Split-Path -Leaf $r3[0]) -eq 'c.png' -and $w.jpg -eq 1) 'grown file taken once stable; JPG counted'
  $f = [GsProbeV2]::Analyze($half)
  Assert-Gs ($f.Error -match 'truncated') "a half-written PNG reads as truncated ($($f.Error))"
  Undo-Shot $w $r3[0]
  Assert-Gs (@(Get-NewShots $w).Count -eq 0 -and @(Get-NewShots $w).Count -eq 1) 'a truncated PNG is retried'

  Write-Host '[pixel probe on real frames]'
  $real = @(Get-ChildItem -LiteralPath $probe -Filter '*.png' -ErrorAction SilentlyContinue | Sort-Object Name)
  if ($real.Count -ge 2) {
    $fa = [GsProbeV2]::Analyze([IO.File]::ReadAllBytes($real[0].FullName))
    $fb = [GsProbeV2]::Analyze([IO.File]::ReadAllBytes($real[1].FullName))
    Assert-Gs ($fa.Error -eq '' -and $fa.Width -eq 1920 -and $fa.Height -eq 1080) 'Steam PNG decodes (1920×1080)'
    Assert-Gs ($fa.Global -eq 'W' -and $fa.Local -eq 'W' -and $fb.Global -eq 'K' -and $fb.Local -eq 'K') "backdrops: $($real[0].Name) W/W=$($fa.Global)/$($fa.Local), $($real[1].Name) K/K=$($fb.Global)/$($fb.Local)"
    Assert-Gs ($fa.RingMark -eq 0 -and $fb.RingMark -eq 0) 'no ring in the probe pack'
    Assert-Gs ($fa.TopL -eq 546 -and $fa.TopR -eq 1373 -and $fb.TopL -eq 546 -and $fb.TopR -eq 1373) "top bar extent 546..1373 ($($fa.TopL)..$($fa.TopR), $($fb.TopL)..$($fb.TopR))"
    Assert-Gs ($fb.ChatMaxX -eq -1) 'no chat ink in the probe frames'
    # The real K frame with a ring, a grey lower backdrop and chat ink painted in.
    $wd = 0; $ht = 0
    $rgb = [GsProbeV2]::DecodePng([IO.File]::ReadAllBytes($real[1].FullName), [ref]$wd, [ref]$ht)
    [GsProbeV2]::Fill($rgb, 1920, 1080, 1300, 574, 1919, 1079, 0x808080)
    [GsProbeV2]::Fill($rgb, 1920, 1080, 1300, 568, 1919, 573, 0xFF5000)
    [GsProbeV2]::Fill($rgb, 1920, 1080, 60, 420, 333, 432, 0xE0E0E0)
    $fc = [GsProbeV2]::Analyze([GsProbeV2]::EncodePng($rgb, 1920, 1080, $true))
    Assert-Gs ($fc.Global -eq 'K' -and $fc.Local -eq 'G' -and $fc.RingRow -eq 568 -and $fc.RingMark -eq 4 -and $fc.RingPart -eq 0) "RGBA PNG: ring row 568 mark 4 (HOFF) core over local G ($($fc.RingRow)/$($fc.RingMark)/$($fc.RingPart)/$($fc.Local))"
    Assert-Gs ($fc.ChatMaxX -eq 333) "chat ink right edge 333 ($($fc.ChatMaxX))"
    Assert-Gs ((Get-RingScale 568) -eq 100 -and (Get-RingScale 722) -eq 70) 'ring row → scale guess'
  } else { Write-Host '  skip: no real probe frames' }
  $f = [GsProbeV2]::Analyze([GsProbeV2]::Synth(0x010101, -1, 0, -1, 0, -1, -1, $false, -1, -1))
  Assert-Gs ($f.Global -eq 'nK') 'near-black backdrop is not exact'
  $f = [GsProbeV2]::Analyze([GsProbeV2]::Synth(-1, -1, 700, 690, 0xFF8CF0, -1, -1, $true, -1, -1))
  Assert-Gs ($f.Global -eq 'T' -and $f.RingMark -eq 7 -and $f.RingPart -eq 2 -and $f.TopL -eq -2) 'world frame: T, ring RCMP g2'
  $small = New-Object byte[] (64 * 48 * 3)
  $f = [GsProbeV2]::Analyze([GsProbeV2]::EncodePng($small, 64, 48, $false))
  Assert-Gs ($f.Error -eq 'size 64x48') 'wrong resolution is reported'

  Write-Host '[session simulations]'
  $script:TestQuietOk = $true
  $full = @($mf.snap.queue)
  $scen = @(
    @{ name = 'normal'; variant = ''; expect = $full },
    @{ name = 'backdrop never exact'; variant = 'near'; expect = @('C1', 'F-bg') },
    @{ name = 'crash-fatal: FATAL ERROR box on S-70-70, skipped'; queue = @('S-70-70', 'C2'); crash = 'fatal'; answers = @('д'); expect = @('S-70-70', 'C2'); status = 'done' },
    @{ name = 'crash-exit: Dota gone before the first frame of C1, stop'; queue = @('C1', 'C2'); crash = 'exit'; answers = @(''); expect = @('C1'); status = 'crashed' },
    @{ name = 'crash-hang: no HUD frame for long, the owner closes Dota, retry'; queue = @('C2'); crash = 'hang'; nohud = 40; answers = @('п'); expect = @('C2', 'C2'); status = 'done' }
  )
  foreach ($sc in $scen) {
    $out = Join-Path $tmpRoot ('run-' + $sc.name.Split(' ')[0])
    $shots = Join-Path $out 'shots'; New-Item -ItemType Directory -Force -Path $shots | Out-Null
    Set-Variable -Name Steam -Value $false -Scope Script
    $script:Sys = New-FakeSys
    $script:Fake.variant = [string]$sc.variant; $script:Fake.shots = $shots; $script:Fake.pakPath = $paths.pak
    $script:Fake.crash = [string]$sc.crash; foreach ($a in @($sc.answers)) { if ($null -ne $a) { [void]$script:Fake.answers.Add($a) } }
    $script:InitialQueue = $sc.queue; $script:NoHudSeconds = $(if ($sc.nohud) { $sc.nohud } else { 420 })
    $script:Events = New-Object System.Collections.ArrayList
    Set-Variable -Name OutDir -Value $out -Scope Script
    Set-Variable -Name DotaDir -Value $root -Scope Script
    Set-Variable -Name ShotsDir -Value $shots -Scope Script
    Set-Variable -Name Base -Value $srv -Scope Script
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $res = Invoke-GsCapture
    $script:InitialQueue = $null; $script:NoHudSeconds = 420
    $S = $res.session
    $ran = @($S.packRecords | ForEach-Object { $_.id })
    $c1 = @($S.packRecords | Where-Object { $_.id -eq 'C1' })[0]
    Write-Host ("  [{0}] {1:n0} s real, packs {2}, frames {3}, beeps {4}" -f $sc.name, $sw.Elapsed.TotalSeconds, ($ran -join ','), $S.frames.Count, ($script:Fake.beeps -join ' '))
    Assert-Gs (($ran -join ',') -eq ($sc.expect -join ',')) "[$($sc.name)] pack order $($ran -join ',')"
    Assert-Gs ((Get-Sha $paths.pak) -eq $ownSha -and -not (Test-Path -LiteralPath $paths.backup) -and [IO.File]::ReadAllText($vpath) -eq $ownVideo -and -not (Test-Path -LiteralPath "$vpath.gs-capture-backup")) "[$($sc.name)] owner pak03 and video.txt restored"
    Assert-Gs (Test-Path -LiteralPath $res.zip) "[$($sc.name)] zip written"
    $doc = [IO.File]::ReadAllText((Join-Path $res.dir 'session.json')) | ConvertFrom-Json
    Assert-Gs ($doc.frames.Count -eq $S.frames.Count -and ($doc.f12.Count -gt 0 -or $sc.crash -eq 'exit')) "[$($sc.name)] session.json: $($doc.frames.Count) frames, $($doc.f12.Count) F12"
    Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
    $z = [IO.Compression.ZipFile]::OpenRead($res.zip)
    try { $names = @($z.Entries | ForEach-Object { $_.FullName }) } finally { $z.Dispose() }
    Assert-Gs ($names -contains 'session.json' -and $names.Count -eq $S.frames.Count + 1) "[$($sc.name)] zip: session.json + $($names.Count - 1) frames"
    if ($sc.crash) {
      $first = @($S.packRecords)[0]
      Assert-Gs ($first.result -eq 'crash' -and $res.status -eq $sc.status) "[$($sc.name)] crash seen ($($first.crash)), status $($res.status)"
      Assert-Gs ($script:Fake.pakAtAsk.Count -ge 1 -and $script:Fake.pakAtAsk[0] -eq $ownSha) "[$($sc.name)] owner pak03 back before the question"
      Assert-Gs ((($script:Fake.beeps -join ' ') -match 'long') -and (($script:Events | ForEach-Object { $_.text }) -join "`n") -match 'НЕ ЗАГРУЗИЛА ИНТЕРФЕЙС') "[$($sc.name)] long beep and the Russian message"
      if ($sc.crash -eq 'fatal') { Assert-Gs ($script:Fake.killed -eq 1) '[crash-fatal] the hung Dota with the error box is closed' }
      if ($sc.crash -eq 'hang') { Assert-Gs ((($script:Events | ForEach-Object { $_.text }) -join "`n") -match 'снимка с тестовым фоном нет') '[crash-hang] no-HUD warning' }
    }
    $missing = @($S.frames | Where-Object { -not (Test-Path -LiteralPath (Join-Path $res.dir $_.file)) })
    Assert-Gs ($missing.Count -eq 0) "[$($sc.name)] every frame copied under its new name"
    if ($sc.name -eq 'normal') {
      Assert-Gs ($res.status -eq 'done' -and $c1.result -eq 'ok') "[normal] C1 done by coverage ($($c1.result))"
      $span = $c1.endedAt - $c1.firstFrameAt
      Assert-Gs ($c1.phase2At -and ($c1.phase2At - $c1.pausedAt) -gt 45 -and $span -gt 240 -and $span -lt 450) ("[normal] C1 phases: pause {0:n0} s, wall {1:n0} s, {2} frames" -f ($c1.phase2At - $c1.pausedAt), $span, $c1.frames)
      foreach ($r in @($S.packRecords | Where-Object { $_.role -eq 'scale' })) {
        $want = [int](($r.id -split '-')[1])
        Assert-Gs ($r.result -eq 'ok' -and @($r.clusters).Count -eq 1 -and $r.clusters[0].scaleGuess -eq $want -and $r.verdicts['chatInk'] -eq 'ok') ("[normal] {0}: {1}, ring row {2} → {3} %, {4} frames, {5:n0} s" -f $r.id, $r.result, $r.clusters[0].row, $r.clusters[0].scaleGuess, $r.frames, ($r.endedAt - $r.firstFrameAt))
      }
      $bad = @($c1.verdicts.Keys | Where-Object { $c1.verdicts[$_] -ne 'ok' })
      Assert-Gs ($bad.Count -eq 0) "[normal] all C1 verdicts ok ($(($c1.verdicts.Keys | ForEach-Object { "$_=$($c1.verdicts[$_])" }) -join ' '))"
      Assert-Gs (@($c1.clusters).Count -eq 1 -and $c1.clusters[0].scaleGuess -eq 100) "[normal] C1: one ring row at 100 % ($(@($c1.clusters | ForEach-Object { "$($_.row):$($_.scaleGuess)" }) -join ' '))"
      Assert-Gs (($script:Fake.beeps -join ' ') -match 'C1:double' -and ($script:Fake.beeps -join ' ') -match 'C1:triple' -and ($script:Fake.beeps -join ' ') -match 'C2:triple') '[normal] double beep for the switch, triple at the end'
      $c2 = @($S.packRecords | Where-Object { $_.id -eq 'C2' })[0]
      Assert-Gs ($c2.result -eq 'ok' -and $c2.hidden.windows -ge 2) "[normal] C2 done ($($c2.result), hidden windows $($c2.hidden.windows), hidden T $($c2.hidden.hiddenT), $($c2.frames) frames)"
      Assert-Gs (@($S.frames | Where-Object { $_.pack -eq 'C1' -and $_.phase -eq 2 }).Count -gt 100) '[normal] frames carry their phase'
      Assert-Gs (@($S.frames | Where-Object { $_.src -notlike 'grab-*' }).Count -eq 0 -and $script:Fake.sent -eq 0 -and $doc.source -eq 'grab' -and $doc.video.state -eq 'switched') '[normal] grabbed frames (no F12 sent to Steam); Dota switched to borderless for the capture'
      $f1 = [GsProbeV2]::Analyze([IO.File]::ReadAllBytes((Join-Path $res.dir $S.frames[0].file)))
      Assert-Gs ($f1.Error -eq '' -and $f1.Global -eq $S.frames[0].probe.g) '[normal] a saved frame reads back as it was classified'
    }
    if ($sc.variant -eq 'near') {
      Assert-Gs ($c1.result -eq 'switch-bg' -and $res.status -eq 'stopped') "[near] C1 → F-bg → stop (C1 $($c1.result), status $($res.status))"
      Assert-Gs (($script:Fake.beeps -join ' ') -match 'F-bg:long') '[near] long beep on the failure'
    }
    if ($sc.name -eq 'normal') {
      # Resume: an interrupted session continues from its queue.
      $doc.status = 'aborted'; $doc.queue = @('C2')
      Write-Utf8 (Join-Path $res.dir 'session.json') ($doc | ConvertTo-Json -Depth 10)
      $script:Sys = New-FakeSys; $script:Fake.shots = $shots; [void]$script:Fake.answers.Add('д')
      $res2 = Invoke-GsCapture
      $ran2 = @($res2.session.packRecords | ForEach-Object { $_.id })
      Assert-Gs ($res2.status -eq 'done' -and ($ran2 -join ',') -eq (($full + 'C2') -join ',') -and $res2.session.counters['C2'] -gt $S.counters['C2']) "[resume] continued with C2 only; numbering goes on (C2_$('{0:0000}' -f $res2.session.counters['C2']))"
      Assert-Gs ((Get-Sha $paths.pak) -eq $ownSha) '[resume] owner pak03 restored'
    }
  }
  # Grab quirks on C2: an early F12 in the menu, a 1280×720 window, Dota closed mid-pack.
  $out = Join-Path $tmpRoot 'run-grabquirks'
  $script:Sys = New-FakeSys; $script:Events = New-Object System.Collections.ArrayList
  $script:Fake.inactiveLeft = 1; $script:Fake.badSize = 1; $script:Fake.closeAt = 30; [void]$script:Fake.answers.Add('д')
  $script:InitialQueue = @('C2')
  Set-Variable -Name OutDir -Value $out -Scope Script
  $res = Invoke-GsCapture
  $script:InitialQueue = $null
  $msgs = ($script:Events | ForEach-Object { $_.text }) -join "`n"
  $recs = @($res.session.packRecords)
  Write-Host ("  [grab quirks] packs {0}, beeps {1}" -f (($recs | ForEach-Object { "$($_.id)#$($_.attempt):$($_.result)" }) -join ','), ($script:Fake.beeps -join ' '))
  Assert-Gs ($msgs -match 'без тестового фона' -and $msgs -match '1280×720' -and $msgs -match 'Окно без рамок') '[grab quirks] the menu frame and the wrong window size are explained'
  Assert-Gs ($recs.Count -eq 2 -and $recs[0].result -eq 'dota-closed' -and $recs[1].result -eq 'ok' -and $res.status -eq 'done' -and $script:Fake.sent -eq 0 -and (Get-Sha $paths.pak) -eq $ownSha) '[grab quirks] Dota closed mid-pack → retried → done; no F12 sent; owner pak03 restored'
  # Steam route (-Steam) quirks on C2: two frames before the demo, a wrong-size frame, Steam ignoring F12 for a while, Dota closed mid-pack.
  $out = Join-Path $tmpRoot 'run-quirks'; $shots = Join-Path $out 'shots'; New-Item -ItemType Directory -Force -Path $shots | Out-Null
  Set-Variable -Name Steam -Value $true -Scope Script
  $script:Sys = New-FakeSys; $script:Fake.shots = $shots; $script:Events = New-Object System.Collections.ArrayList
  $script:Fake.inactiveLeft = 2; $script:Fake.badSize = 1; $script:Fake.silence = @(8, 24); $script:Fake.closeAt = 30; [void]$script:Fake.answers.Add('д')
  $script:InitialQueue = @('C2')
  Set-Variable -Name OutDir -Value $out -Scope Script
  Set-Variable -Name ShotsDir -Value $shots -Scope Script
  $res = Invoke-GsCapture
  $script:InitialQueue = $null
  $msgs = ($script:Events | ForEach-Object { $_.text }) -join "`n"
  $recs = @($res.session.packRecords)
  Write-Host ("  [quirks] packs {0}, beeps {1}" -f (($recs | ForEach-Object { "$($_.id)#$($_.attempt):$($_.result)" }) -join ','), ($script:Fake.beeps -join ' '))
  Assert-Gs ($msgs -match 'без тестового фона' -and $msgs -match 'не подхватился' -eq $false) '[quirks] frames before the demo are not taken, the owner is told'
  Assert-Gs ($msgs -match '64×48' -and $msgs -match 'Steam не принимает') '[quirks] wrong size and silent Steam are reported'
  Assert-Gs ($recs.Count -eq 2 -and $recs[0].result -eq 'dota-closed' -and $recs[1].result -eq 'ok' -and $res.status -eq 'done') '[quirks] Dota closed mid-pack → retried → done'
  Assert-Gs (@($script:Fake.beeps | Where-Object { $_ -eq 'C2:long' }).Count -ge 3) '[quirks] long beeps for the problems'
  Assert-Gs (@($res.session.frames | Where-Object { $_.src -like '570_menu_*' -or $_.src -eq '570_small.png' }).Count -eq 0 -and (Get-Sha $paths.pak) -eq $ownSha) '[quirks] bad frames not copied; owner pak03 restored'
  # Ctrl+C / error mid-pack: finally restores.
  $out = Join-Path $tmpRoot 'run-abort'; $shots = Join-Path $out 'shots'; New-Item -ItemType Directory -Force -Path $shots | Out-Null
  $script:Sys = New-FakeSys; $script:Fake.shots = $shots
  Set-Variable -Name Steam -Value $false -Scope Script
  $script:OrigGrab = $script:Sys.Grab
  $script:Sys.Grab = { if ($script:Fake.now - $script:Fake.packZero -gt 40) { throw 'simulated Ctrl+C' }; & $script:OrigGrab }
  Set-Variable -Name OutDir -Value $out -Scope Script
  Set-Variable -Name ShotsDir -Value $shots -Scope Script
  $threw = $false; try { [void](Invoke-GsCapture) } catch { $threw = $true }
  Assert-Gs ($threw -and (Get-Sha $paths.pak) -eq $ownSha -and -not (Test-Path -LiteralPath $paths.backup)) '[abort] interrupted mid-pack: owner pak03 restored in finally'
  $doc = [IO.File]::ReadAllText((Join-Path (Join-Path $out 'gs-hud-capture') 'session.json')) | ConvertFrom-Json
  Assert-Gs ($doc.status -eq 'aborted' -and @($doc.queue)[0] -eq 'C1') '[abort] session.json saved as aborted with the queue'

  $script:Quiet = $false
  Write-Host ''
  $color = if ($script:TestFail) { 'Red' } else { 'Green' }
  Write-Host ("Self-test: {0} passed, {1} failed. ({2})" -f $script:TestOk, $script:TestFail, $tmpRoot) -ForegroundColor $color
  return $script:TestFail
}

# ---------------------------------------------------------------- entry
if ($SelfTest) { $script:GsSelfTestResult = Invoke-GsSelfTest }
else {
  try { [void](Invoke-GsCapture) }
  catch {
    Write-Host ''
    Write-Host "Ошибка: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Пришли этот текст. Если съёмка прервалась — запусти команду ещё раз: первым делом она вернёт твой pak03_dir.vpk.' -ForegroundColor Red
  }
}
