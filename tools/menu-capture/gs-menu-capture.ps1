param(
  [switch]$SelfTest,
  [string]$Base = 'https://dev.gridstudio.me/menu-capture',
  [string]$DotaDir = '',
  [string]$ShotsDir = '',
  [string]$OutDir = '',
  [string]$KitDir = '',
  [switch]$Steam
)
# GridStudio main-menu capture watcher (scripts/menu-capture/plan.mjs; the sibling of
# tools/hud-capture/gs-hud-capture.ps1, whose proven parts it reuses: PNG decoder, F12 by SendInput,
# Dota's FATAL ERROR box, Steam folder watching, hash-checked packs, session.json and the zip).
# Run on the owner's PC:
#   iex ([Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://dev.gridstudio.me/menu-capture.ps1')).TrimStart([char]0xFEFF))
# Swaps game\dota_russian\pak02_dir.vpk (the owner's GridStudio menu background) for each capture pack
# and sets his pak03/pak04 aside, so Dota draws Valve's own menu. Every file is kept as
# <name>.gs-menu-backup (or a pak02_dir.vpk.gs-menu-none marker) and ALWAYS put back: try/finally, Ctrl+C,
# and every start restores a leftover first. A fullscreen Dota is switched to borderless for the capture
# (video.txt, put back the same way). The watcher grabs Dota's window itself every ~0.75 s while it is in
# front (GDI, no cursor; tools/capture-common — Steam ignored injected F12), saves lossless PNGs to
# Desktop\gs-menu-capture as <pack>_0001.png…, reads each frame's probe code (C#), starts by itself once it
# sees the menu with a still cursor in the middle, counts coverage and ends each pack by itself; then writes
# session.json and Desktop\gs-menu-capture.zip. -Steam: the old route (Steam's F12 screenshots).
# Windows PowerShell 5.1 and PowerShell 7. -SelfTest runs everything but Win32 against a fake Dota.
# Never use `exit` here: under iex it would close the owner's PowerShell window.

$script:GsVersion = '2026-10-17.1'
$script:OnWindows = ($env:OS -eq 'Windows_NT')

# ---------------------------------------------------------------- C# helpers (C# 5: Windows PowerShell 5.1 compiles with the .NET Framework compiler)
$script:GsMenuProbeSource = @'
using System;
using System.IO;
using System.IO.Compression;
using System.Text;

public class GsMenuFrameV1 {
  public int Width; public int Height; public string Error = "";
  public string Global = "";        // K, W, G (exact at all free points), nK, nW, nG (within 3 levels), T (anything else)
  public int State = -1;            // probe code: schedule state, -1 none
  public int Part = -1;             // 0 core, 1 g1, 2 g2
  public int Pack = 0;              // 1 M1, 2 V1, 0 none
  public int Rows = 0;              // code rows read (0..2)
  public bool RowsAgree = true;
  public int BarBg = -1;            // the top bar's toggle point shows the backdrop exactly: 1, not: 0, unknown: -1
  public int RailBg = -1;           // the same for the rail
}

public static class GsMenuProbeV1 {
  public static int[] Free = new int[] { 560, 300, 1350, 300, 700, 600, 1300, 700 };
  public static int[] Rows = new int[] { 880, 290, 1080, 600 };
  public static int Size = 20, Pitch = 30, Squares = 4;
  public static int[] Toggles = new int[] { 700, 20, 200, 600 };
  public static int Tol = 8;

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

  // The four 3-bit values of a code (scripts/menu-capture/plan.mjs codeSquares).
  public static int[] CodeSquares(int state, int part, int pack) {
    int w = state | (part << 5) | (pack << 7), v0 = w & 7, v1 = (w >> 3) & 7, v2 = (w >> 6) & 7;
    return new int[] { v0, v1, v2, (v0 + 3 * v1 + 5 * v2 + 1) % 8 };
  }
  static int SquareRgb(int v) { return ((v & 1) != 0 ? 0xFF0000 : 0) | ((v & 2) != 0 ? 0x00FF00 : 0) | ((v & 4) != 0 ? 0x0000FF : 0); }

  // A synthetic 1920x1080 menu frame for -SelfTest: backdrop (-1 = a menu without our pack), the probe code
  // (state -1 = none; rowB false = the second row covered), the top bar and the rail on or off.
  public static byte[] Synth(int backdrop, int state, int part, int pack, bool bar, bool rail, bool rowB) {
    return EncodePng(SynthRgb(backdrop, state, part, pack, bar, rail, rowB), 1920, 1080, false);
  }
  public static byte[] SynthRgb(int backdrop, int state, int part, int pack, bool bar, bool rail, bool rowB) {
    int w = 1920, h = 1080;
    byte[] rgb = new byte[w * h * 3];
    Fill(rgb, w, h, 0, 0, w - 1, h - 1, backdrop >= 0 ? backdrop : 0x1A2030);
    if (backdrop < 0) for (int x = 0; x < w; x += 9) Fill(rgb, w, h, x, 0, x, h - 1, 0x303848);
    if (bar) Fill(rgb, w, h, 0, 0, w - 1, 70, 0x14161C);
    if (rail) Fill(rgb, w, h, 32, 100, 397, 989, 0x111111);
    if (state >= 0) {
      int[] sq = CodeSquares(state, part, pack);
      for (int r = 0; r < Rows.Length / 2; r++) {
        if (r == 1 && !rowB) continue;
        for (int i = 0; i < Squares; i++) { int x0 = Rows[2 * r] + i * Pitch, y0 = Rows[2 * r + 1]; Fill(rgb, w, h, x0, y0, x0 + Size - 1, y0 + Size - 1, SquareRgb(sq[i])); }
      }
    }
    return rgb;
  }

  static bool Is(byte[] p, int i, int r, int g, int b, int tol) {
    return Math.Abs(p[i] - r) <= tol && Math.Abs(p[i + 1] - g) <= tol && Math.Abs(p[i + 2] - b) <= tol;
  }
  // Grey #808080 reaches the screen as 129 (Panorama decodes CSS colours with gamma 2.2): 128 or 129 is exact.
  static string Backdrop(byte[] p, int i, int tol) {
    if (Is(p, i, 0, 0, 0, tol)) return "K";
    if (Is(p, i, 255, 255, 255, tol)) return "W";
    if (p[i] == p[i + 1] && p[i + 1] == p[i + 2] && (p[i] == 128 || p[i] == 129)) return "G";
    if (tol > 0 && Is(p, i, 128, 128, 128, tol + 1)) return "G";
    return "T";
  }

  public static GsMenuFrameV1 Analyze(byte[] png) {
    GsMenuFrameV1 f = new GsMenuFrameV1();
    int w, h; byte[] p;
    try { p = DecodePng(png, out w, out h); }
    catch (Exception e) { f.Error = e.Message; return f; }
    f.Width = w; f.Height = h;
    if (w != 1920 || h != 1080) { f.Error = "size " + w + "x" + h; return f; }
    Probe(f, p, w, h);
    return f;
  }

  // A grabbed screen (RGB bytes, row-major), read exactly as a PNG of it would be.
  public static GsMenuFrameV1 AnalyzeRgb(byte[] rgb, int w, int h) {
    GsMenuFrameV1 f = new GsMenuFrameV1();
    f.Width = w; f.Height = h;
    if (rgb == null || rgb.Length < w * h * 3) { f.Error = "no image"; return f; }
    if (w != 1920 || h != 1080) { f.Error = "size " + w + "x" + h; return f; }
    Probe(f, rgb, w, h);
    return f;
  }

  // One code row: the centre pixel of each square, 0/255 per channel; -1 when unreadable or the check fails.
  static int ReadRow(byte[] p, int w, int x0, int y0, out int state, out int part, out int pack) {
    state = -1; part = -1; pack = 0;
    int[] v = new int[Squares];
    for (int i = 0; i < Squares; i++) {
      int x = x0 + i * Pitch + Size / 2, y = y0 + Size / 2, k = (y * w + x) * 3, val = 0;
      for (int c = 0; c < 3; c++) {
        if (p[k + c] >= 255 - Tol) val |= 1 << c; else if (p[k + c] > Tol) return -1;
      }
      v[i] = val;
    }
    int word = v[0] | (v[1] << 3) | (v[2] << 6), s = word & 31, pt = (word >> 5) & 3, pk = word >> 7;
    if (pt > 2 || pk < 1 || (v[0] + 3 * v[1] + 5 * v[2] + 1) % 8 != v[3]) return -1;
    state = s; part = pt; pack = pk;
    return word;
  }

  public static void Probe(GsMenuFrameV1 f, byte[] p, int w, int h) {
    string exact = null, near = null;
    for (int k = 0; k < Free.Length; k += 2) {
      int i = (Free[k + 1] * w + Free[k]) * 3;
      string e = Backdrop(p, i, 0), n = Backdrop(p, i, 3);
      exact = exact == null ? e : (exact == e ? exact : "T");
      near = near == null ? n : (near == n ? near : "T");
    }
    f.Global = exact != "T" ? exact : (near != "T" ? "n" + near : "T");
    int firstWord = -1;
    for (int r = 0; r < Rows.Length / 2; r++) {
      int s, pt, pk;
      int word = ReadRow(p, w, Rows[2 * r], Rows[2 * r + 1], out s, out pt, out pk);
      if (word < 0) continue;
      f.Rows++;
      if (firstWord < 0) { firstWord = word; f.State = s; f.Part = pt; f.Pack = pk; }
      else if (word != firstWord) f.RowsAgree = false;
    }
    if (f.Global == "K" || f.Global == "W" || f.Global == "G") {
      int[] bg = new int[3];
      int c0 = f.Global == "K" ? 0 : f.Global == "W" ? 255 : -1;
      for (int t = 0; t < Toggles.Length; t += 2) {
        int i = (Toggles[t + 1] * w + Toggles[t]) * 3, on;
        if (c0 >= 0) on = (p[i] == c0 && p[i + 1] == c0 && p[i + 2] == c0) ? 1 : 0;
        else on = (p[i] == p[i + 1] && p[i + 1] == p[i + 2] && (p[i] == 128 || p[i] == 129)) ? 1 : 0;
        if (t == 0) f.BarBg = on; else f.RailBg = on;
      }
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

# The same Win32 helpers as the HUD watcher, text for text (a session that ran gs-hud-capture.ps1 already
# has the type, and Add-Type is skipped then).
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
  if (-not ('GsMenuProbeV1' -as [type])) { Add-Type -TypeDefinition $script:GsMenuProbeSource }
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
    'start'  { @(@(988, 140)) }
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
    Cursor         = { param($g) Get-GrabCursor $g }
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

# pak02 is replaced by our packs; pak03 (GridStudio interface) and pak04 (d2pfx mods) are set aside, so the
# menu is Valve's own. The HUD watcher's leftovers (.gs-backup / .gs-none) are another script's: not touched.
function Get-DotaPaths([string]$root) {
  $ru = Join-Path (Join-Path $root 'game') 'dota_russian'
  $pak = Join-Path $ru 'pak02_dir.vpk'
  $aside = @()
  foreach ($n in 'pak03_dir.vpk', 'pak04_dir.vpk') { $f = Join-Path $ru $n; $aside += , @{ name = $n; pak = $f; backup = "$f.gs-menu-backup" } }
  return @{ root = $root; ru = $ru; pak = $pak; backup = "$pak.gs-menu-backup"; none = "$pak.gs-menu-none"; aside = $aside
    boot = (Join-Path (Join-Path (Join-Path (Join-Path $root 'game') 'dota') 'cfg') 'boot.vcfg')
    fonts = (Join-Path (Join-Path (Join-Path (Join-Path (Join-Path $root 'game') 'dota') 'panorama') 'fonts') 'gridstudio-backup') }
}

function Wait-DotaClosed([string]$why) {
  if (-not (& $script:Sys.DotaRunning)) { return }
  Say "Dota запущена. Закрой её полностью — $why." 'Yellow'
  $script:Run.mode = 'waitClose'; $script:Run.since = Get-Now
  while (& $script:Sys.DotaRunning) { & $script:Sys.Sleep 500 }
  & $script:Sys.Sleep 1500   # Dota releases its files a moment after the process ends
  Say 'Dota закрыта.'
}

function Test-Leftover($paths) {
  if ((Test-Path -LiteralPath $paths.backup) -or (Test-Path -LiteralPath $paths.none)) { return $true }
  foreach ($a in $paths.aside) { if (Test-Path -LiteralPath $a.backup) { return $true } }
  return $false
}

# Everything back: pak02 (ours removed, the owner's restored), pak03 and pak04 back from aside.
function Restore-Owner($paths, $ourHashes) {
  if (-not (Test-Leftover $paths)) { return 'nothing' }
  Wait-DotaClosed 'чтобы вернуть твои pak-файлы'
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $result = 'nothing'
  if ((Test-Path -LiteralPath $paths.backup) -or (Test-Path -LiteralPath $paths.none)) {
    if (Test-Path -LiteralPath $paths.pak) {
      $h = Get-Sha $paths.pak
      if (@($ourHashes) -contains $h) { Remove-Item -LiteralPath $paths.pak -Force }
      elseif (Test-Path -LiteralPath $paths.backup) {
        # Not one of our packs (unexpected): keep it aside rather than delete it.
        $aside = $paths.pak + '.gs-replaced-' + $stamp
        Move-Item -LiteralPath $paths.pak -Destination $aside
        Say "Незнакомый pak02_dir.vpk отложен как $(Split-Path -Leaf $aside)." 'Yellow'
      }
    }
    $result = 'removed'
    if (Test-Path -LiteralPath $paths.backup) { Move-Item -LiteralPath $paths.backup -Destination $paths.pak; $result = 'restored' }
    if (Test-Path -LiteralPath $paths.none) { Remove-Item -LiteralPath $paths.none -Force }
  }
  foreach ($a in $paths.aside) {
    if (-not (Test-Path -LiteralPath $a.backup)) { continue }
    if (Test-Path -LiteralPath $a.pak) {
      $other = $a.pak + '.gs-replaced-' + $stamp
      Move-Item -LiteralPath $a.pak -Destination $other
      Say "Незнакомый $($a.name) отложен как $(Split-Path -Leaf $other)." 'Yellow'
    }
    Move-Item -LiteralPath $a.backup -Destination $a.pak
    if ($result -eq 'nothing' -or $result -eq 'removed') { $result = 'restored' }
  }
  return $result
}

function Backup-Owner($paths) {
  if (Test-Leftover $paths) { throw 'Прошлая копия pak-файлов не вернулась на место — ничего не трогаю.' }
  $kept = @()
  if (Test-Path -LiteralPath $paths.pak) { Move-Item -LiteralPath $paths.pak -Destination $paths.backup; $kept += 'pak02_dir.vpk' }
  else { [IO.File]::WriteAllText($paths.none, 'GridStudio menu capture: there was no pak02_dir.vpk here; delete pak02_dir.vpk to restore.') }
  foreach ($a in $paths.aside) { if (Test-Path -LiteralPath $a.pak) { Move-Item -LiteralPath $a.pak -Destination $a.backup; $kept += $a.name } }
  return $kept
}

function Install-Pack($paths, $pack) {
  if (& $script:Sys.DotaRunning) { throw 'Dota запущена — пакет не меняю.' }
  if (-not (Test-Path -LiteralPath $paths.backup) -and -not (Test-Path -LiteralPath $paths.none)) { throw 'Нет копии твоего pak02 — пакет не ставлю.' }
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
    $local = Join-Path $dir 'pak02_dir.vpk'
    $ok = (Test-Path -LiteralPath $local) -and ((Get-Item -LiteralPath $local).Length -eq [int64]$p.bytes) -and ((Get-Sha $local) -eq $p.sha256)
    if (-not $ok) {
      $tmp = "$local.tmp"
      Get-Remote $p.file $tmp
      $len = (Get-Item -LiteralPath $tmp).Length
      $sha = Get-Sha $tmp
      if ($len -ne [int64]$p.bytes -or $sha -ne $p.sha256) { Remove-Item -LiteralPath $tmp -Force; throw "Пакет $($p.id) скачался повреждённым (размер $len, хеш не совпал). Запусти команду ещё раз." }
      Move-Item -LiteralPath $tmp -Destination $local -Force
    }
    $packs[$p.id] = @{ id = $p.id; role = $p.role; local = $local; sha256 = $p.sha256; seconds = $p.seconds }
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
  $pr = $snap.probes
  [GsMenuProbeV1]::Free = [int[]]@($pr.free | ForEach-Object { $_[0]; $_[1] })
  [GsMenuProbeV1]::Rows = [int[]]@($pr.rows | ForEach-Object { $_.x; $_.y })
  [GsMenuProbeV1]::Size = [int]$pr.size; [GsMenuProbeV1]::Pitch = [int]$pr.pitch; [GsMenuProbeV1]::Squares = [int]$pr.squares
  [GsMenuProbeV1]::Toggles = [int[]]@([int]$pr.toggles.bar[0], [int]$pr.toggles.bar[1], [int]$pr.toggles.rail[0], [int]$pr.toggles.rail[1])
  $P = @{ snap = $snap; packs = @{}; interval = [double]$snap.watcher.interval; jitter = [double]$snap.watcher.jitter
    noFrameWarn = [double]$snap.watcher.noFrameWarn; queue = @($snap.queue | Where-Object { $_ }) }
  foreach ($pk in $snap.packs) {
    $w = $(if ($pk.id -eq 'M1') { $snap.watcher.m1 } else { $snap.watcher.v1 })
    $ids = @($pk.states | ForEach-Object { [string]$_.id })
    $P.packs[[string]$pk.id] = @{ id = [string]$pk.id; code = [int]$pk.code; role = [string]$pk.role; period = [double]$pk.period; ids = $ids
      min = [double]$w.min; cap = [double]$w.cap; gRequired = @($w.gRequired | ForEach-Object { [string]$_ })
      toggleAfter = $(if ($pk.id -eq 'M1') { [double]$snap.watcher.toggleAfter } else { [double]$w.cap - 20 }) }
  }
  return $P
}

# ---------------------------------------------------------------- per-pack state and classification
function New-PackState([string]$id) {
  $pp = $script:P.packs[$id]
  $v = [ordered]@{ backdrop = 'wait'; probe = 'wait'; toggles = 'wait' }
  return @{ id = $id; pp = $pp; frames = 0; t0 = $null; coded = 0; wrongPack = 0; disagree = 0
    g = @{ K = 0; W = 0; G = 0; T = 0; nK = 0; nW = 0; nG = 0 }; keys = @{}; noneBg = 0; noneAny = 0; noneSeen = 0; allInk = 0; allSeen = 0
    verdicts = $v; seq = (New-Object System.Collections.ArrayList) }
}

function Add-Key($st, [string]$k) { if ($st.keys.ContainsKey($k)) { $st.keys[$k]++ } else { $st.keys[$k] = 1 } }

# One frame into the pack state. $t: seconds since the pack's first frame. Returns the coverage key or ''.
function Update-PackState($st, $f, [double]$t) {
  $st.frames++
  $g = [string]$f.Global
  if ($st.g.ContainsKey($g)) { $st.g[$g]++ }
  $key = ''
  if ($f.Pack -eq $st.pp.code -and $f.State -ge 0 -and $f.State -lt $st.pp.ids.Count) {
    $st.coded++
    if (-not $f.RowsAgree) { $st.disagree++ }
    $sid = $st.pp.ids[$f.State]
    if ($f.Part -eq 0 -and ($g -eq 'K' -or $g -eq 'W' -or $g -eq 'G')) { $key = "$sid.$g"; Add-Key $st $key }
    # The toggle check, over white: NONE shows the backdrop at the bar's and the rail's points, ALL does not.
    if ($f.Part -eq 0 -and $g -eq 'W') {
      if ($sid -eq 'NONE') { $st.noneSeen++; if ($f.BarBg -eq 1 -and $f.RailBg -eq 1) { $st.noneBg++ }; if ($f.BarBg -eq 1 -or $f.RailBg -eq 1) { $st.noneAny++ } }
      if ($sid -eq 'ALL') { $st.allSeen++; if ($f.BarBg -eq 0 -and $f.RailBg -eq 0) { $st.allInk++ } }
    }
  } elseif ($f.Pack -gt 0) { $st.wrongPack++ }
  [void]$st.seq.Add(@($t, $g, $f.State, $f.Part))
  return $key
}

# Every state's core with K and W (and G for the plan's gRequired states).
function Get-Coverage($st) {
  $need = 0; $have = 0; $missing = @()
  foreach ($sid in $st.pp.ids) {
    $bgs = @('K', 'W'); if ($st.pp.gRequired -contains $sid) { $bgs += 'G' }
    foreach ($bg in $bgs) { $need++; if ($st.keys.ContainsKey("$sid.$bg")) { $have++ } else { $missing += "$sid.$bg" } }
  }
  return @{ need = $need; have = $have; missing = $missing }
}

# Verdicts from the frames so far ($t: seconds since the first frame). Returns the names that changed.
function Update-Verdicts($st, [double]$t) {
  $v = $st.verdicts
  $script:changedVerdicts = @()
  $set = { param($k, $val) if ($v[$k] -ne $val) { $v[$k] = $val; $script:changedVerdicts += $k } }
  if ($v['backdrop'] -eq 'wait') {
    if ($st.g.K -ge 1 -and $st.g.W -ge 1) { & $set 'backdrop' 'ok' }
    elseif ($t -ge 30 -and $st.frames -ge 12) { if ($st.g.nK + $st.g.nW -gt 0) { & $set 'backdrop' 'near' } else { & $set 'backdrop' 'fail' } }
  }
  if ($v['probe'] -eq 'wait') {
    if ($st.coded -ge 1) { & $set 'probe' 'ok' } elseif ($t -ge 30 -and $st.frames -ge 12) { & $set 'probe' 'fail' }
  }
  if ($v['toggles'] -eq 'wait' -or $v['toggles'] -eq 'partial') {
    if ($st.noneBg -ge 1 -and $st.allInk -ge 1) { & $set 'toggles' 'ok' }
    # Only when neither point ever clears is it 'fail' (nothing hides: no use going on); one point clear
    # (say, Dota's blue connection bar over the top) is 'partial', and the capture goes on.
    elseif ($t -ge $st.pp.toggleAfter -and $st.noneSeen -ge 1 -and $st.allSeen -ge 1) { if ($st.allInk -lt 1) { & $set 'toggles' 'noink' } elseif ($st.noneAny -ge 1) { & $set 'toggles' 'partial' } else { & $set 'toggles' 'fail' } }
    elseif ($t -ge $st.pp.toggleAfter -and $v['probe'] -eq 'fail') { & $set 'toggles' 'unknown' }
  }
  return $script:changedVerdicts
}

# Is the pack finished? '' (not yet), 'ok', 'cap' or 'notoggle' (the parts never hide: no use going on).
function Test-PackDone($st, [double]$t) {
  $pp = $st.pp
  if ($t -ge $pp.cap) { return 'cap' }
  if ($pp.role -eq 'main' -and $st.verdicts['toggles'] -eq 'fail') { return 'notoggle' }
  if ($t -lt $pp.min) { return '' }
  if ($st.verdicts['probe'] -eq 'fail') { return '' }
  $c = Get-Coverage $st
  if ($c.have -ge $c.need) { return 'ok' }
  return ''
}

# A frame of our pack: its probe code is the pack's, or (probes unreadable) the backdrop is exact.
function Test-FrameActive($st, $f) {
  if ($f.Pack -eq $st.pp.code) { return $true }
  return ($f.Pack -eq 0 -and ($f.Global -eq 'K' -or $f.Global -eq 'W' -or $f.Global -eq 'G'))
}

function Get-FrameSummary($f) {
  return [ordered]@{ g = $f.Global; state = $f.State; part = $f.Part; pack = $f.Pack; rows = $f.Rows; agree = $f.RowsAgree; bar = $f.BarBg; rail = $f.RailBg }
}

# ---------------------------------------------------------------- owner instructions
$script:CursorText = 'Курсор поставь в пустую середину экрана — между списком друзей и колонкой новостей, примерно в центр (не на кнопки и не на карточки). Мышь больше не трогай.'
function Show-PackIntro([string]$id, [int]$attempt) {
  $again = if ($attempt -gt 1) { " (попытка $attempt)" } else { '' }
  $n = [Array]::IndexOf([string[]]@($script:S.queueAll), $id) + 1
  $of = if ($n -gt 0) { " — запуск $n из $(@($script:S.queueAll).Count)" } else { '' }
  $go = if ($script:UseSteam) { 'Нажми F12 один раз. Короткий сигнал — скрипт начал сам жать F12 (примерно раз в 0,75 с). Не сворачивай Dota.' }
    else { 'F12 жать не надо: как только скрипт увидит меню и неподвижный курсор, он сам начнёт снимать (короткий сигнал). Не сворачивай Dota.' }
  $lines = switch ($id) {
    'M1' { @("СЪЁМКА 1: пакет M1, около 5 минут$of$again",
        '1. Запусти Dota и дождись главного меню. Фон меню будет мигать чёрным, белым и серым, а части меню — по очереди',
        '   пропадать и появляться: так и задумано. Если Dota покажет всплывающее окно — закрой его.',
        '2. Должна быть открыта главная: вкладка с логотипом Dota слева вверху (если открыто другое — нажми на логотип).',
        '   Панель «Играть» не открывай, в чат не пиши, список друзей не прокручивай.',
        "3. $script:CursorText",
        "4. $go",
        '5. Жди ТРОЙНОЙ сигнал (около 5 минут), потом закрой Dota полностью.') }
    'V1' { @("СЪЁМКА 2: пакет V1, около полутора минут$of$again",
        '1. Запусти Dota, главное меню. Теперь на верхней панели нет «Арсенала», «Базы знаний» и кнопки Dota Plus,',
        '   а в колонке новостей может не быть карточки Dark Carnival: так и надо (так их прячет конструктор).',
        '2. Всплывающие окна закрой, открой главную (логотип Dota).',
        "3. $script:CursorText",
        "4. $go",
        '5. ТРОЙНОЙ сигнал (около 1,5 минуты) — закрой Dota.') }
    default { @("Пакет $id$again", 'Запусти Dota, главное меню, курсор в середину экрана.', $go) }
  }
  Say ''
  Say $lines[0] 'Cyan'
  foreach ($l in $lines[1..($lines.Count - 1)]) { Say $l }
}

function Show-CrashMessage([string]$id, [string]$how) {
  & $script:Sys.Beep 'long'
  Say ''
  Say "DOTA НЕ ЗАГРУЗИЛА МЕНЮ С ПАКЕТОМ $id ($how)." 'Red'
  Say 'Твои pak-файлы уже на месте — Dota снова запускается как обычно.' 'Red'
  Say 'Пришли текст ошибки (или скриншот окна ошибки) — пакет поправим. Архив со снимками всё равно соберу.' 'Red'
}

$script:VerdictText = @{
  backdrop = @{ fail = 'фон меню не мигает чёрным/белым (пакет не подхватился?)'; near = 'фон почти чёрный/белый, но не точный (фильтры изображения, HDR или ночной режим?)' }
  probe = @{ fail = 'не вижу квадратики-метки в середине экрана — съёмка пойдёт по времени' }
  toggles = @{ fail = 'части меню не пропадают — наш стиль не дошёл до меню; доснимаю круг и иду дальше'; partial = 'часть меню пропадает не везде (например, синяя полоса подключения сверху) — снимаю дальше'; noink = 'не вижу меню на снимках «всё показано»'; unknown = 'не могу проверить, пропадают ли части меню' }
}

# ---------------------------------------------------------------- one pack, live
# Where frames come from: our own grab of Dota's window when one is due (every ~0.75 s while capturing,
# every second while waiting for the menu), or, with -Steam, Steam's folder of screenshots.
# Each frame: @{ src; file } (Steam) or @{ src; grab = @{ x; y; w; h; rgb } } (grab).
function Get-IncomingFrames($ctx, [double]$now) {
  if ($script:UseSteam) { return @(Get-NewShots $ctx.watch | ForEach-Object { @{ src = [IO.Path]::GetFileName($_); file = $_ } }) }
  $mode = $script:Run.mode
  if (($mode -ne 'auto' -and $mode -ne 'waitFirst') -or $now -lt $ctx.nextGrab) { return @() }
  $ctx.nextGrab = $now + $(if ($mode -eq 'auto') { $script:P.interval + (Get-Random -Minimum (-$script:P.jitter) -Maximum $script:P.jitter) } else { 1.0 })
  $g = & $script:Sys.Grab
  if ($null -eq $g) { if ($null -eq $ctx.notFgSince) { $ctx.notFgSince = $now }; return @() }
  $ctx.notFgSince = $null
  $ctx.grabs++
  if ($mode -eq 'auto') { [void]$script:S.f12.Add([ordered]@{ t = [Math]::Round($now, 3); pack = $ctx.id; attempt = $ctx.attempt; grab = $true }) }
  return @(@{ src = ('grab-{0:000000}' -f $ctx.grabs); grab = $g })
}

function Invoke-Pack($S, [string]$id, [int]$attempt) {
  $paths = $S.paths; $pack = $S.packs[$id]
  Wait-DotaClosed "чтобы поставить пакет $id"
  Install-Pack $paths $pack
  [void]$S.events.Add([ordered]@{ t = (Get-Now); pack = $id; event = 'installed'; attempt = $attempt })
  Show-PackIntro $id $attempt
  $st = New-PackState $id
  $rec = [ordered]@{ id = $id; attempt = $attempt; role = $st.pp.role; source = $(if ($script:UseSteam) { 'steam' } else { 'grab' }); wall = (Get-Date).ToString('o'); installedAt = [Math]::Round((Get-Now), 2); firstFrameAt = $null
    endedAt = $null; frames = 0; result = ''; verdicts = $st.verdicts; coverage = $null; notes = (New-Object System.Collections.ArrayList) }
  [void]$S.packRecords.Add($rec)
  $ctx = New-GrabState
  foreach ($kv in @{ id = $id; attempt = $attempt; watch = $null; inactiveMsgAt = -1000; inactiveSince = $null; inactiveBeeped = $false; cursor = $null; cursorSince = 0; cursorMsgAt = -1000 }.GetEnumerator()) { $ctx[$kv.Key] = $kv.Value }
  if ($script:UseSteam) { $ctx.watch = New-ShotWatch $S.shotsDir }
  $R = $script:Run
  $R.mode = 'waitDota'; $R.since = Get-Now; $R.pack = $id
  $inactive = 0; $nextPress = 0; $lastFrameAt = 0; $presses = New-Object System.Collections.ArrayList
  $silenceWarned = $false; $fgWarned = $false; $lastStatus = 0; $result = $null
  $dotaGoneAt = $null; $badSize = 0; $jpgWarned = $false; $retry = @{}
  $lastFatalCheck = 0; $noFrameWarned = $false; $how = ''
  if ($null -eq $script:NoFrameSeconds) { $script:NoFrameSeconds = $script:P.noFrameWarn }
  if (& $script:Sys.DotaRunning) { $R.mode = 'waitFirst' } else { Say 'Жду запуска Dota…' }
  while ($true) {
    $now = Get-Now
    $running = & $script:Sys.DotaRunning
    if ($R.mode -eq 'waitDota' -and $running) {
      $R.mode = 'waitFirst'; $R.since = $now
      if ($script:UseSteam) { Say 'Dota запущена. Когда будешь в главном меню, с курсором в середине экрана, — нажми F12 один раз.' }
      else { Say 'Dota запущена. Как только увижу меню с мигающим фоном и неподвижный курсор в середине экрана — начну сам.' }
    }
    # A crash on load: Dota's FATAL ERROR box, or Dota gone before the first frame; no frame for a long time.
    if ($R.mode -eq 'waitFirst' -or $R.mode -eq 'auto') {
      if ($running -and ($now - $lastFatalCheck) -ge 2) { $lastFatalCheck = $now; if (& $script:Sys.DotaFatal) { $result = 'crash'; $how = 'окно FATAL ERROR'; break } }
    }
    if ($R.mode -eq 'waitFirst') {
      if (-not $running) { if ($null -eq $dotaGoneAt) { $dotaGoneAt = $now } elseif ($now - $dotaGoneAt -gt 3) { $result = 'crash'; $how = 'Dota закрылась до первого снимка'; break } }
      else { $dotaGoneAt = $null }
      if (-not $noFrameWarned -and ($now - $R.since) -gt $script:NoFrameSeconds) {
        $noFrameWarned = $true; & $script:Sys.Beep 'long'
        Say "Прошло $([int]($script:NoFrameSeconds / 60)) минут, а меню с мигающим фоном я не увидел. Если Dota показала ошибку, зависла или меню пустое —" 'Red'
        Say 'закрой Dota: скрипт сразу вернёт твои pak-файлы. Если просто не успел — открой главное меню и поставь курсор в середину экрана.' 'Red'
      }
    }
    # Steam route only: F12 pressed by the script.
    if ($script:UseSteam -and $R.mode -eq 'auto' -and $now -ge $nextPress) {
      $fg = & $script:Sys.DotaForeground
      if ($fg) {
        $sent = & $script:Sys.SendF12
        [void]$presses.Add($now)
        [void]$S.f12.Add([ordered]@{ t = [Math]::Round($now, 3); pack = $id; attempt = $attempt; sendInput = [bool]$sent })
        $ctx.notFgSince = $null
      } elseif ($null -eq $ctx.notFgSince) { $ctx.notFgSince = $now }
      $nextPress = $now + $script:P.interval + (Get-Random -Minimum (-$script:P.jitter) -Maximum $script:P.jitter)
    }
    if ($R.mode -eq 'auto' -and $null -ne $ctx.notFgSince -and ($now - $ctx.notFgSince) -gt 5 -and -not $fgWarned) {
      Say "Dota не на переднем плане — $(if ($script:UseSteam) { 'F12 не жму' } else { 'экран не снимаю' }). Вернись в игру (не сворачивай её)." 'Yellow'; $fgWarned = $true
    }
    if ($null -eq $ctx.notFgSince) { $fgWarned = $false }
    # New frames.
    foreach ($in in @(Get-IncomingFrames $ctx $now)) {
      $bytes = $null; $g = $null
      if ($in.file) {
        $file = $in.file
        try { $bytes = [GsMenuProbeV1]::ReadShared($file) } catch { Undo-Shot $ctx.watch $file; continue }
        $f = [GsMenuProbeV1]::Analyze($bytes)
        if ($f.Error -match 'truncated') {
          if (-not $retry.ContainsKey($file)) { $retry[$file] = $now }
          if ($now - $retry[$file] -lt 10) { Undo-Shot $ctx.watch $file; continue }
        }
        if ($f.Error) {
          if ($f.Error -like 'size *') {
            $badSize++
            if ($badSize -le 2) { & $script:Sys.Beep 'long'; Say "Скриншот $([IO.Path]::GetFileName($file)) размером $($f.Width)×$($f.Height), а нужен 1920×1080. Поставь в Dota разрешение 1920×1080 (полный экран или окно без рамки)." 'Red' }
          } else { Say "Не читается $([IO.Path]::GetFileName($file)): $($f.Error)" 'Yellow' }
          [void]$rec.notes.Add("bad $([IO.Path]::GetFileName($file)): $($f.Error)")
          continue
        }
      } else {
        $g = $in.grab
        $f = if ($null -ne $g.rgb) { [GsMenuProbeV1]::AnalyzeRgb($g.rgb, $g.w, $g.h) } else { $null }
        if (-not (Test-GrabUsable $ctx $g ($null -ne $f -and $f.Pack -gt 0) ($R.mode -eq 'auto') $now $rec.notes)) { continue }
      }
      if ($R.mode -eq 'waitDota' -or $R.mode -eq 'waitFirst') {
        if (-not (Test-FrameActive $st $f)) {
          $inactive++
          $other = if ($f.Pack -gt 0) { ' (это метка другого пакета: Dota не перезапускалась?)' } else { '' }
          if ($script:UseSteam) {
            Say "Снимок $($in.src) без мигающего фона$other — ещё не в главном меню? Когда будешь готов, нажми F12 ещё раз." 'Yellow'
            if ($inactive -eq 3) {
              & $script:Sys.Beep 'long'
              Say 'Пакет, похоже, не подхватился. Проверь: Dota на русском и с русской озвучкой (иначе папка dota_russian не читается),' 'Red'
              Say 'в параметрах запуска Dota нет -language, Dota перезапущена после установки пакета. Если всё так — закрой Dota и запусти снова.' 'Red'
            }
          } else {
            if ($null -eq $ctx.inactiveSince) { $ctx.inactiveSince = $now }
            if ($now - $ctx.inactiveMsgAt -gt 30) { $ctx.inactiveMsgAt = $now; Say "Вижу Dota, но без мигающего фона$other — жду главное меню (вкладка с логотипом Dota)." 'Yellow' }
            if (-not $ctx.inactiveBeeped -and ($now - $ctx.inactiveSince) -gt 150) {
              $ctx.inactiveBeeped = $true; & $script:Sys.Beep 'long'
              Say 'Пакет, похоже, не подхватился. Проверь: Dota на русском и с русской озвучкой (иначе папка dota_russian не читается),' 'Red'
              Say 'в параметрах запуска Dota нет -language, Dota перезапущена после установки пакета. Если всё так — закрой Dota и запусти снова.' 'Red'
            }
          }
          continue
        }
        if (-not $script:UseSteam) {
          # A hover-free start: the cursor still for 2 s in the empty middle of the menu.
          $c = & $script:Sys.Cursor $g
          if ($null -eq $c -or $null -eq $ctx.cursor -or $c.x -ne $ctx.cursor.x -or $c.y -ne $ctx.cursor.y) { $ctx.cursor = $c; $ctx.cursorSince = $now }
          $mid = ($null -ne $c) -and $c.x -ge 500 -and $c.x -le 1420 -and $c.y -ge 150 -and $c.y -le 900
          if (-not $mid -or ($now - $ctx.cursorSince) -lt 2) {
            if ($now - $ctx.cursorMsgAt -gt 20) { $ctx.cursorMsgAt = $now; Say 'Вижу меню с мигающим фоном. Поставь курсор в пустую середину экрана (между друзьями и новостями) и не двигай мышь — начну сам.' 'Yellow' }
            continue
          }
        }
        $R.mode = 'auto'; $R.since = $now; $st.t0 = $now; $rec.firstFrameAt = [Math]::Round($now, 2); $dotaGoneAt = $null
        $nextPress = $now + $script:P.interval; $ctx.nextGrab = $now + $script:P.interval
        & $script:Sys.Beep 'start'
        Say "Поехали: скрипт снимает сам$(if ($script:UseSteam) { ' (жмёт F12)' } else { '' }). Мышь не трогай, Dota не сворачивай." 'Green'
      }
      $t = $now - $st.t0
      $key = Update-PackState $st $f $t
      if ($null -eq $bytes) { $bytes = [GsMenuProbeV1]::EncodePng($g.rgb, $g.w, $g.h, $false) }
      $S.counters[$id] = 1 + $(if ($S.counters.Contains($id)) { $S.counters[$id] } else { 0 })
      $name = '{0}_{1:0000}.png' -f $id, $S.counters[$id]
      [IO.File]::WriteAllBytes((Join-Path $S.dir $name), $bytes)
      $frameRec = [ordered]@{ file = $name; src = $in.src; pack = $id; attempt = $attempt; t = [Math]::Round($now, 3); rel = [Math]::Round($t, 3); key = $key; probe = (Get-FrameSummary $f) }
      if ($in.file) { $frameRec.mtime = (New-Object IO.FileInfo $in.file).LastWriteTimeUtc.ToString('o') }
      [void]$S.frames.Add($frameRec)
      $rec.frames++; $lastFrameAt = $now; $silenceWarned = $false
      foreach ($k in (Update-Verdicts $st $t)) {
        $val = $st.verdicts[$k]
        [void]$S.events.Add([ordered]@{ t = (Get-Now); pack = $id; verdict = $k; value = $val })
        if ($val -eq 'ok') { continue }
        $txt = $script:VerdictText[$k][$val]
        if ($txt) { Say "Проверка: $txt." 'Yellow' }
        if (($k -eq 'backdrop' -or $k -eq 'probe' -or $k -eq 'toggles') -and $val -ne 'partial') { & $script:Sys.Beep 'long' }
      }
    }
    if ($R.mode -eq 'auto') {
      $t = $now - $st.t0
      $d = Test-PackDone $st $t
      if ($d) { $result = $d; break }
      $recent = @($presses | Where-Object { $_ -gt $now - 10 }).Count
      if ($script:UseSteam -and ($now - [Math]::Max($lastFrameAt, $R.since)) -gt 10 -and $recent -ge 6 -and -not $silenceWarned) {
        $silenceWarned = $true; & $script:Sys.Beep 'long'
        Say 'Скриншоты не появляются. Похоже, Steam не принимает нажатия от скрипта: жми F12 сам примерно раз в секунду, пока не услышишь тройной сигнал.' 'Red'
        Say "Если жмёшь, а счётчик стоит — проверь, что Steam сохраняет копии PNG в папку $($S.shotsDir)." 'Red'
        [void]$rec.notes.Add("silence at $([Math]::Round($t)) s")
      }
      if (-not $running) {
        if ($null -eq $dotaGoneAt) { $dotaGoneAt = $now } elseif ($now - $dotaGoneAt -gt 3) { $result = 'dota-closed'; break }
      } else { $dotaGoneAt = $null }
    }
    if ($script:UseSteam -and $ctx.watch.jpg -ge 2 -and $rec.frames -eq 0 -and -not $jpgWarned) {
      $jpgWarned = $true; & $script:Sys.Beep 'long'
      Say 'В папку приходят только JPG. В Steam → Settings → In Game → Screenshots включи «Save an uncompressed copy» (PNG).' 'Red'
    }
    if ($now - $lastStatus -ge 1) {
      $lastStatus = $now
      if ($R.mode -eq 'auto') { Show-Status (Format-Status $st ($now - $st.t0) $rec) }
    }
    & $script:Sys.Sleep $script:Sys.Tick
  }
  $now = Get-Now
  $rec.endedAt = [Math]::Round($now, 2); $rec.result = $result
  $rec.coverage = Get-Coverage $st
  $rec.counts = [ordered]@{ K = $st.g.K; W = $st.g.W; G = $st.g.G; T = $st.g.T; nK = $st.g.nK; nW = $st.g.nW; nG = $st.g.nG; coded = $st.coded; wrongPack = $st.wrongPack; rowsDisagree = $st.disagree
    noneW = $st.noneSeen; noneBackdrop = $st.noneBg; noneAnyBackdrop = $st.noneAny; allW = $st.allSeen; allInk = $st.allInk; grabs = $ctx.grabs }
  if ($result -eq 'crash') {
    $rec.crash = $how
    [void]$S.events.Add([ordered]@{ t = (Get-Now); pack = $id; event = 'crash'; how = $how })
    if ((& $script:Sys.DotaRunning) -and (& $script:Sys.DotaFatal)) { & $script:Sys.KillDota; Say 'Закрыл зависшую Dota с ошибкой.' 'Yellow' }
    $R.mode = 'crashed'; $R.since = $now
    return @{ result = $result; state = $st; rec = $rec; how = $how }
  }
  $R.mode = 'finished'; $R.since = $now
  switch ($result) {
    'ok' { & $script:Sys.Beep 'triple'; Say "ТРОЙНОЙ СИГНАЛ: пакет $id готов ($($rec.frames) снимков). Закрой Dota полностью." 'Green' }
    'cap' { & $script:Sys.Beep 'triple'; Say "ТРОЙНОЙ СИГНАЛ: пакет ${id} — время вышло ($($rec.frames) снимков, не хватает: $(@($rec.coverage.missing) -join ', ')). Беру что есть. Закрой Dota." 'Yellow' }
    'notoggle' { & $script:Sys.Beep 'triple'; Say "ТРОЙНОЙ СИГНАЛ: пакет $id — части меню не пропадают, дальше снимать без толку ($($rec.frames) снимков). Закрой Dota." 'Yellow' }
    'dota-closed' { & $script:Sys.Beep 'long'; Say "Dota закрылась до конца съёмки пакета $id." 'Yellow' }
  }
  # Steam: late frames (Steam writes a moment after F12). Both: wait until Dota is closed.
  $R.mode = 'waitClose'; $R.since = $now
  $grace = $now + 3
  while ((& $script:Sys.DotaRunning) -or (Get-Now) -lt $grace) {
    if ($script:UseSteam) {
      foreach ($file in (Get-NewShots $ctx.watch)) {
        $bytes = $null; try { $bytes = [GsMenuProbeV1]::ReadShared($file) } catch { continue }
        $f = [GsMenuProbeV1]::Analyze($bytes)
        if ($f.Error) { continue }
        $S.counters[$id] = 1 + $S.counters[$id]
        $name = '{0}_{1:0000}.png' -f $id, $S.counters[$id]
        [IO.File]::WriteAllBytes((Join-Path $S.dir $name), $bytes)
        [void]$S.frames.Add([ordered]@{ file = $name; src = [IO.Path]::GetFileName($file); pack = $id; attempt = $attempt
          t = [Math]::Round((Get-Now), 3); rel = [Math]::Round((Get-Now) - $st.t0, 3); late = $true; key = ''; probe = (Get-FrameSummary $f) })
        $rec.frames++
      }
    }
    & $script:Sys.Sleep 250
  }
  & $script:Sys.Sleep 1500
  return @{ result = $result; state = $st; rec = $rec }
}

function Format-Status($st, [double]$t, $rec) {
  $mm = [int][Math]::Floor($t / 60); $ss = [int][Math]::Floor($t % 60)
  $c = Get-Coverage $st
  $parts = @(('{0} · {1:00}:{2:00} · снимков {3}' -f $st.id, $mm, $ss, $rec.frames))
  $parts += ('готово {0}%' -f [int](100 * $c.have / [Math]::Max(1, $c.need)))
  $parts += ('фон K/W/G {0}/{1}/{2}' -f $st.g.K, $st.g.W, $st.g.G)
  $left = [int][Math]::Max(0, $st.pp.cap - $t)
  $parts += ('не дольше {0}:{1:00}' -f [int][Math]::Floor($left / 60), ($left % 60))
  return ($parts -join ' · ')
}

# ---------------------------------------------------------------- the session
function Save-Session($S, [string]$status) {
  $doc = [ordered]@{
    format = 'gs-menu-capture-session/1'; script = $script:GsVersion; status = $status
    started = $S.started; saved = (Get-Date).ToString('o'); clockStart = 'seconds below are since the script started'
    machine = [ordered]@{ powershell = $PSVersionTable.PSVersion.ToString(); os = [Environment]::OSVersion.VersionString }
    dota = $S.paths.root; source = $(if ($script:UseSteam) { 'steam' } else { 'grab' }); shotsDir = $S.shotsDir; video = $S.video; setAside = @($S.kept); customFont = [bool]$S.customFont
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

function Invoke-GsMenuCapture {
  $ErrorActionPreference = 'Stop'
  $script:UseSteam = [bool]$Steam
  Initialize-GsTypes
  if (-not $script:Sys) { $script:Sys = New-RealSys }
  $script:Run = @{ mode = 'setup'; since = 0; pack = '' }
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
  Say "GridStudio: съёмка главного меню Dota ($script:GsVersion). Окно не закрывай до конца." 'Cyan'
  $desktop = if ($OutDir) { $OutDir } else { [Environment]::GetFolderPath('Desktop') }
  $cache = if ($OutDir) { Join-Path $OutDir 'cache' } else { Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GridStudio\menu-capture' }
  New-Item -ItemType Directory -Force -Path $cache | Out-Null
  $cfgFile = Join-Path $cache 'config.json'
  $cfg = @{}
  if (Test-Path -LiteralPath $cfgFile) { try { $o = [IO.File]::ReadAllText($cfgFile) | ConvertFrom-Json; foreach ($p in $o.PSObject.Properties) { $cfg[$p.Name] = $p.Value } } catch { } }
  # The HUD watcher keeps its settings (the screenshot folder) next door: reuse them.
  $hudCfg = Join-Path (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GridStudio\hud-capture') 'config.json'
  if (-not $OutDir -and -not $cfg.shotsDir -and (Test-Path -LiteralPath $hudCfg)) { try { $o = [IO.File]::ReadAllText($hudCfg) | ConvertFrom-Json; if ($o.shotsDir) { $cfg.shotsDir = $o.shotsDir }; if ($o.dota) { $cfg.dota = $o.dota } } catch { } }

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
  # The HUD watcher's leftovers are its own: it restores them itself.
  $hudLeft = @('pak03_dir.vpk.gs-backup', 'pak03_dir.vpk.gs-none' | Where-Object { Test-Path -LiteralPath (Join-Path $paths.ru $_) })
  if ($hudLeft.Count) { throw "В dota_russian остался файл прошлой съёмки HUD ($($hudLeft -join ', ')). Запусти один раз команду съёмки HUD (hud-capture.ps1) — она вернёт твой pak03 — и потом эту." }
  # Manifest (also gives the hashes of our packs for a safe restore).
  $mf = Get-Manifest $cache
  $ours = @($mf.m.packs | ForEach-Object { $_.sha256 })

  # A leftover from an interrupted run comes back first.
  $r = Restore-Owner $paths $ours
  if ($r -ne 'nothing') { Say 'Твои pak-файлы с прошлого раза вернул на место.' 'Green' }
  if (Test-Path -LiteralPath ((Get-VideoCfgPath $root) + '.gs-capture-backup')) { Wait-DotaClosed 'чтобы вернуть твои настройки видео'; if (Restore-DotaVideo $root) { Say 'Режим экрана Dota с прошлого раза вернул как было.' 'Green' } }

  # A font of the owner's (GridStudio font tool): the capture would carry it, the site wants Valve's.
  $customFont = Test-Path -LiteralPath $paths.fonts
  if ($customFont) {
    & $script:Sys.Beep 'long'
    Say 'У тебя стоит свой шрифт Dota (GridStudio, папка panorama\fonts\gridstudio-backup). Меню снимется с ним, а сайту нужен обычный.' 'Yellow'
    Say 'Лучше верни обычный шрифт (сайт → «Шрифт» → «Вернуть обычный шрифт») и запусти эту команду снова.' 'Yellow'
    if (-not (Test-Yes (Ask 'Снимать всё равно со своим шрифтом? [д/Н]') $false)) { Say 'Хорошо, ничего не менял. Верни шрифт и запусти команду ещё раз.' 'Cyan'; return @{ status = 'font'; zip = $null; dir = $null; session = $null } }
  }

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
  $dir = Join-Path $desktop 'gs-menu-capture'
  $zip = Join-Path $desktop 'gs-menu-capture.zip'
  $S = @{ paths = $paths; packs = $packs; manifest = $mf.m; snap = $mf.snap; shotsDir = $shots; dir = $dir; started = (Get-Date).ToString('o'); kept = @(); customFont = $customFont; video = $null
    queue = (New-Object System.Collections.ArrayList); counters = [ordered]@{}; packRecords = (New-Object System.Collections.ArrayList)
    frames = (New-Object System.Collections.ArrayList); f12 = (New-Object System.Collections.ArrayList); events = (New-Object System.Collections.ArrayList) }
  $script:S = $S
  $resumed = $false
  $old = Join-Path $dir 'session.json'
  if (Test-Path -LiteralPath $old) {
    $prev = $null; try { $prev = [IO.File]::ReadAllText($old, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { }
    $done = @($prev.packs | Where-Object { $_.result -eq 'ok' -or $_.result -eq 'cap' -or $_.result -eq 'notoggle' } | ForEach-Object { $_.id })
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
  if (-not $resumed) { foreach ($q in $(if ($script:InitialQueue) { $script:InitialQueue } elseif ($script:P.queue.Count) { $script:P.queue } else { @('M1', 'V1') })) { [void]$S.queue.Add([string]$q) } }
  $S.queueAll = @($S.queue)
  try {
    $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($dir))
    if ($drive.AvailableFreeSpace -lt 4GB) { Say "Мало места на диске $($drive.Name): нужно около 3–4 ГБ (снимки + архив)." 'Yellow' }
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
    $S.kept = @(Backup-Owner $paths)
    $keptText = if ($S.kept.Count) { "Твои $($S.kept -join ', ') отложены (*.gs-menu-backup)" } else { 'Своих pak02/pak03/pak04 у тебя нет' }
    Say "$keptText и вернутся в конце, даже если прервать скрипт. Пока идёт съёмка, Dota покажет обычное меню Valve." 'Green'
    $attempts = @{}
    while ($S.queue.Count -gt 0) {
      $id = [string]$S.queue[0]
      $attempts[$id] = 1 + $(if ($attempts.ContainsKey($id)) { $attempts[$id] } else { @($S.packRecords | Where-Object { $_.id -eq $id }).Count })
      $out = Invoke-Pack $S $id $attempts[$id]
      $res = $out.result
      if ($res -eq 'ok' -or $res -eq 'cap' -or $res -eq 'notoggle') {
        $S.queue.RemoveAt(0)
      } elseif ($res -eq 'crash') {
        # Dota failed with the pack: the owner's files back at once, then ask.
        $r = Restore-Owner $paths $ours
        Show-CrashMessage $id $out.how
        Save-Session $S 'running'
        $a = Ask "Что дальше? п — повторить $id, д — дальше без него, Enter — закончить съёмку"
        if ($a -match '^(п|p)') { $S.kept = @(Backup-Owner $paths) }
        elseif (Test-Yes $a $false) { $S.kept = @(Backup-Owner $paths); $S.queue.RemoveAt(0) }
        else { $S.queue.Clear(); $status = 'crashed' }
      }
      elseif ($res -eq 'dota-closed') {
        if (-not (Test-Yes (Ask "Повторить пакет $id с начала? [Д/н] (н — принять как есть и идти дальше)"))) { $S.queue.RemoveAt(0) }
      }
      Save-Session $S 'running'
    }
    if ($status -ne 'crashed') { $status = 'done' }
  } finally {
    $script:Run.mode = 'restore'
    $r = 'nothing'
    try { $r = Restore-Owner $paths $ours } catch { Say "Не удалось вернуть pak-файлы: $($_.Exception.Message). Запусти команду ещё раз — она первым делом их вернёт." 'Red' }
    if ($r -eq 'restored') { Say 'Твои pak-файлы вернулись на место.' 'Green' }
    elseif ($r -eq 'removed') { Say 'Тестовый пакет убран (своего pak02_dir.vpk у тебя не было).' 'Green' }
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
  Say "Проверь, что в $($paths.ru) снова лежат твои pak-файлы (фон меню в Dota снова твой)."
  Say 'Загрузи gs-menu-capture.zip на 0807.st как файл и пришли ссылку. Не через Telegram: он пережимает картинки.'
  if ($script:UseSteam) { Say 'JPG-скриншоты в библиотеке Steam после съёмки можно удалить.' }
  if ($status -eq 'done') { & $script:Sys.OpenUrl 'https://0807.st' }
  return @{ status = $status; zip = $zip; dir = $dir; session = $S }
}

# ---------------------------------------------------------------- -SelfTest (Linux/macOS/Windows; no Win32)
function Assert-Gs([bool]$cond, [string]$what) {
  if ($cond) { $script:TestOk++ ; if (-not $script:TestQuietOk) { Write-Host "  ok  $what" -ForegroundColor DarkGreen } }
  else { $script:TestFail++; Write-Host "  FAIL $what" -ForegroundColor Red }
}

# The fake Dota's screen at time $t of a pack: the backdrop and the probe code on their own clocks.
function Get-SynthSpec([string]$packId, [double]$t, $o, [string]$variant) {
  $snap = $script:P.snap
  $mod = { param($a, $m) (($a % $m) + $m) % $m }
  $pk = @($snap.packs | Where-Object { $_.id -eq $packId })[0]
  $bg = @('K', 'W', 'G')[[int][Math]::Floor((& $mod ($t + $o.b) 4.5) / 1.5)]
  $col = @{ K = 0; W = 0xFFFFFF; G = 0x818181 }
  if ($variant -eq 'near') { $col = @{ K = 0x020202; W = 0xFDFDFD; G = 0x7C7C7C } }
  $hold = [double]$snap.hold; $n = @($pk.states).Count
  $x = & $mod ($t + $o.s) ($hold * $n)
  $si = [int][Math]::Floor($x / $hold); $in = $x - $si * $hold
  $part = if ($in -lt [double]$snap.guard) { 1 } elseif ($in -ge $hold - [double]$snap.guard) { 2 } else { 0 }
  $state = @($pk.states)[$si]
  $on = @($state.on)
  $bar = if ($packId -eq 'M1') { $on -contains 'bar' } else { $on -contains 'bar' }
  $rail = if ($packId -eq 'M1') { $on -contains 'rail' } else { $on -contains 'rest' }
  if ($variant -eq 'notoggle') { $bar = $true; $rail = $true }
  if ($variant -eq 'barstuck') { $bar = $true }
  $code = if ($variant -eq 'noprobe') { -1 } else { $si }
  return @{ backdrop = $col[$bg]; state = $code; part = $part; pack = [int]$pk.code; bar = $bar; rail = $rail; rowB = (($si % 5) -ne 3) }
}

function Write-SynthShot([string]$packId, [double]$t, [string]$variant) {
  $sp = Get-SynthSpec $packId $t $script:Fake.off $variant
  $png = [GsMenuProbeV1]::Synth($sp.backdrop, $sp.state, $sp.part, $sp.pack, $sp.bar, $sp.rail, $sp.rowB)
  $script:Fake.n++
  $name = '570_{0:yyyyMMddHHmmss}_{1}.png' -f ([datetime]'2026-10-17').AddSeconds($t + 100000 * $script:Fake.n), $script:Fake.n
  [IO.File]::WriteAllBytes((Join-Path $script:Fake.shots $name), $png)
  if ($script:Fake.n -eq 3) { [IO.File]::WriteAllBytes((Join-Path $script:Fake.shots ('570_x_{0}.jpg' -f $script:Fake.n)), [byte[]](1, 2, 3)) }
}

# The fake owner: launches/closes Dota, presses the first F12.
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
      elseif ($script:UseSteam -and $F.running -and $since -gt 5 -and $now - $F.lastManual -gt 5) {
        $F.lastManual = $now
        if ($F.inactiveLeft -gt 0) { $F.inactiveLeft--; [IO.File]::WriteAllBytes((Join-Path $F.shots ('570_menu_{0}.png' -f $F.inactiveLeft)), [GsMenuProbeV1]::Synth(-1, -1, 0, 0, $true, $true, $true)) }
        else { Write-SynthShot $R.pack ($now - $F.packZero) $F.variant }
      }
    }
    'auto' { if ($F.closeAt -gt 0 -and $since -gt $F.closeAt) { $F.closeAt = 0; $F.running = $false } }
    'finished' { $F.running = $false }
  }
}

function New-FakeSys {
  $script:Fake = @{ now = 0.0; running = $false; n = 0; lastMode = ''; modeAt = 0; lastManual = -100; packZero = 0; variant = ''; answers = (New-Object System.Collections.ArrayList); beeps = (New-Object System.Collections.ArrayList); shots = ''
    off = @{ b = 0.4; s = 37.3 }; inactiveLeft = 0; closeAt = 0; silence = @(); badSize = 0
    crash = ''; fatal = $false; killed = 0; pakPath = ''; pakAtAsk = (New-Object System.Collections.ArrayList); grabs = 0; bordered = $false; cursorAway = 0; sent = 0 }
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
      if ($F.badSize -gt 0) { $F.badSize--; [IO.File]::WriteAllBytes((Join-Path $F.shots '570_small.png'), [GsMenuProbeV1]::EncodePng((New-Object byte[] (64 * 48 * 3)), 64, 48, $false)); return $true }
      if ($F.silence.Count -eq 2 -and $rel -ge $F.silence[0] -and $rel -lt $F.silence[1]) { return $true }
      Write-SynthShot $script:Run.pack ($F.now - $F.packZero) $F.variant; $true
    }
    Beep = { param($kind) [void]$script:Fake.beeps.Add("$($script:Run.pack):$kind") }
    Ask = { param($q) if ($script:Fake.pakPath -and (Test-Path -LiteralPath $script:Fake.pakPath)) { [void]$script:Fake.pakAtAsk.Add((Get-Sha $script:Fake.pakPath)) }; if ($script:Fake.answers.Count) { $a = $script:Fake.answers[0]; $script:Fake.answers.RemoveAt(0); return $a }; return '' }
    OpenUrl = { param($u) }
    # The grab of the fake Dota's window: nothing while it loads or fails; a wrong-size window, Valve's own
    # menu, or (variant 'exclusive') black frames until the owner was told to go borderless.
    Grab = {
      $F = $script:Fake
      if (-not $F.running -or $F.fatal -or $F.crash) { return $null }
      $F.grabs++
      if ($F.badSize -gt 0) { $F.badSize--; return @{ x = 0; y = 0; w = 1280; h = 720; rgb = $null } }
      if ($F.inactiveLeft -gt 0) { $F.inactiveLeft--; return @{ x = 0; y = 0; w = 1920; h = 1080; rgb = [GsMenuProbeV1]::SynthRgb(-1, -1, 0, 0, $true, $true, $true) } }
      if ($F.variant -eq 'exclusive' -and -not $F.bordered) {
        if ((($script:Events | ForEach-Object { $_.text }) -join "`n") -match 'чёрный экран') { $F.bordered = $true }
        else { return @{ x = 0; y = 0; w = 1920; h = 1080; rgb = (New-Object byte[] (1920 * 1080 * 3)) } }
      }
      $sp = Get-SynthSpec $script:Run.pack ($F.now - $F.packZero) $F.off $F.variant
      return @{ x = 0; y = 0; w = 1920; h = 1080; rgb = [GsMenuProbeV1]::SynthRgb($sp.backdrop, $sp.state, $sp.part, $sp.pack, $sp.bar, $sp.rail, $sp.rowB) }
    }
    Cursor = { param($g) if ($script:Fake.cursorAway -gt 0) { $script:Fake.cursorAway--; return @{ x = 100; y = 40 } }; return @{ x = 960; y = 540 } }
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
    foreach ($src in @($script:GsMenuProbeSource, $script:GsWinSource, $script:GsGrabSource)) {
      $pargs = New-Object object[] ($parse.GetParameters().Count)
      $pargs[0] = $src; $pargs[1] = $opt
      for ($i = 2; $i -lt $pargs.Count; $i++) { $pp = $parse.GetParameters()[$i]; $pargs[$i] = if ($pp.HasDefaultValue) { $pp.DefaultValue } else { $null } }
      $tree = $parse.Invoke($null, $pargs)
      $errs = @($tree.GetDiagnostics() | Where-Object { $_.Severity.ToString() -eq 'Error' })
      Assert-Gs ($errs.Count -eq 0) ("C# 5 syntax: " + $(if ($errs.Count) { ($errs | Select-Object -First 3 | ForEach-Object { $_.ToString() }) -join ' | ' } else { 'clean' }))
    }
  } catch { Write-Host "  skip C# 5 syntax check: $($_.Exception.Message)" }
}

function New-FakeDota([string]$tmpRoot) {
  $root = Join-Path $tmpRoot 'Steam/steamapps/common/dota 2 beta'
  foreach ($d in 'game/dota/cfg', 'game/dota_russian', 'game/dota/panorama/fonts') { New-Item -ItemType Directory -Force -Path (Join-Path $root $d) | Out-Null }
  Write-Utf8 (Join-Path $root 'game/dota/gameinfo.gi') 'x'
  [IO.File]::WriteAllText((Get-VideoCfgPath $root), "`"config`"`r`n{`r`n`t`"setting.defaultres`"`t`t`"1920`"`r`n`t`"setting.defaultresheight`"`t`t`"1080`"`r`n`t`"setting.fullscreen`"`t`t`"1`"`r`n`t`"setting.nowindowborder`"`t`t`"0`"`r`n}`r`n")
  return $root
}

function Invoke-GsSelfTest {
  $ErrorActionPreference = 'Stop'
  $script:TestOk = 0; $script:TestFail = 0; $script:TestQuietOk = $false
  Initialize-GsTypes
  $tmpRoot = if ($OutDir) { $OutDir } else { Join-Path ([IO.Path]::GetTempPath()) ('gs-menu-selftest-' + [Guid]::NewGuid().ToString('n').Substring(0, 8)) }
  if (Test-Path -LiteralPath $tmpRoot) { Remove-Item -LiteralPath $tmpRoot -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
  $kit = if ($KitDir) { $KitDir } elseif ($env:GS_MENU_KIT) { $env:GS_MENU_KIT } else { throw 'Нужен -KitDir (папка make-menu-capture.mjs с manifest.json).' }
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
  Assert-Gs ((@($packs.Keys) -join ',') -eq 'M1,V1') "packs downloaded and verified ($(@($packs.Keys) -join ' '))"
  $m1 = Join-Path (Join-Path (Join-Path $cache 'packs') 'M1') 'pak02_dir.vpk'
  $t0 = (Get-Item -LiteralPath $m1).LastWriteTimeUtc
  Start-Sleep -Milliseconds 30
  $null = Sync-Packs $mf.m $cache
  Assert-Gs ((Get-Item -LiteralPath $m1).LastWriteTimeUtc -eq $t0) 'cached packs are not downloaded again'
  $bytes = [IO.File]::ReadAllBytes((Join-Path $srv 'V1/pak02_dir.vpk')); $bytes[100] = $bytes[100] -bxor 0xFF
  [IO.File]::WriteAllBytes((Join-Path $srv 'V1/pak02_dir.vpk'), $bytes)
  Remove-Item -LiteralPath (Join-Path (Join-Path (Join-Path $cache 'packs') 'V1') 'pak02_dir.vpk')
  $threw = $false; try { $null = Sync-Packs $mf.m $cache } catch { $threw = ($_.Exception.Message -match 'V1') }
  Assert-Gs $threw 'a corrupted download is refused (hash)'
  Assert-Gs (-not (Test-Path -LiteralPath (Join-Path (Join-Path (Join-Path $cache 'packs') 'V1') 'pak02_dir.vpk.tmp'))) 'the corrupted temp file is removed'
  Copy-Item -LiteralPath (Join-Path $kit 'V1/pak02_dir.vpk') -Destination (Join-Path $srv 'V1/pak02_dir.vpk') -Force
  $packs = Sync-Packs $mf.m $cache
  $ours = @($mf.m.packs | ForEach-Object { $_.sha256 })
  $script:P = Initialize-Plan $mf.snap
  Assert-Gs ($script:P.packs['M1'].ids.Count -eq 23 -and $script:P.packs['V1'].ids.Count -eq 4 -and $script:P.packs['M1'].ids[0] -eq 'ALL' -and $script:P.packs['M1'].ids[1] -eq 'NONE') 'states from the plan (M1 23, V1 4)'
  Assert-Gs ([GsMenuProbeV1]::Rows[2] -eq 1080 -and [GsMenuProbeV1]::Free[6] -eq 1300 -and [GsMenuProbeV1]::Toggles[3] -eq 600) 'probe geometry from the plan'

  Write-Host '[probe code]'
  $okAll = $true
  foreach ($pk in 1, 2) { foreach ($s in 0..22) { foreach ($pt in 0..2) {
    $f = [GsMenuProbeV1]::Analyze([GsMenuProbeV1]::Synth(0xFFFFFF, $s, $pt, $pk, $false, $false, $true))
    if ($f.State -ne $s -or $f.Part -ne $pt -or $f.Pack -ne $pk -or $f.Rows -ne 2 -or -not $f.RowsAgree -or $f.Global -ne 'W') { $okAll = $false }
  } } }
  Assert-Gs $okAll 'every code of both packs reads back from a frame (two rows, W backdrop)'
  $f = [GsMenuProbeV1]::Analyze([GsMenuProbeV1]::Synth(0x818181, 7, 0, 1, $true, $true, $false))
  Assert-Gs ($f.Global -eq 'G' -and $f.State -eq 7 -and $f.Rows -eq 1 -and $f.BarBg -eq 0 -and $f.RailBg -eq 0) "grey 129 is G; one covered row still reads; bar and rail on ($($f.Global) $($f.State) rows $($f.Rows))"
  $f = [GsMenuProbeV1]::Analyze([GsMenuProbeV1]::Synth(0, 1, 0, 1, $false, $false, $true))
  Assert-Gs ($f.Global -eq 'K' -and $f.BarBg -eq 1 -and $f.RailBg -eq 1) 'NONE over black: both toggle points show the backdrop'
  $f = [GsMenuProbeV1]::Analyze([GsMenuProbeV1]::Synth(-1, -1, 0, 0, $true, $true, $true))
  Assert-Gs ($f.Global -eq 'T' -and $f.State -eq -1 -and $f.Pack -eq 0) 'Valve menu without our pack: no backdrop, no code'
  $f = [GsMenuProbeV1]::Analyze([GsMenuProbeV1]::Synth(0x020202, 3, 0, 1, $false, $false, $true))
  Assert-Gs ($f.Global -eq 'nK') 'near-black backdrop is not exact'
  # A flipped bit fails the check.
  $wd = 0; $ht = 0
  $rgb = [GsMenuProbeV1]::DecodePng([GsMenuProbeV1]::Synth(0, 5, 0, 1, $false, $false, $false), [ref]$wd, [ref]$ht)
  [GsMenuProbeV1]::Fill($rgb, 1920, 1080, 880 + 30, 290, 880 + 30 + 19, 309, 0xFFFFFF)
  $f = [GsMenuProbeV1]::Analyze([GsMenuProbeV1]::EncodePng($rgb, 1920, 1080, $true))
  Assert-Gs ($f.State -eq -1 -and $f.Rows -eq 0) 'a damaged code is refused by its check square (RGBA PNG)'
  $f = [GsMenuProbeV1]::Analyze([GsMenuProbeV1]::EncodePng((New-Object byte[] (64 * 48 * 3)), 64, 48, $false))
  Assert-Gs ($f.Error -eq 'size 64x48') 'wrong resolution is reported'

  Write-Host '[backup / restore]'
  $root = New-FakeDota $tmpRoot
  $paths = Get-DotaPaths $root
  Write-Utf8 $paths.pak 'OWNER PAK02'; Write-Utf8 $paths.aside[0].pak 'OWNER PAK03'; Write-Utf8 $paths.aside[1].pak 'OWNER PAK04'
  $own = @((Get-Sha $paths.pak), (Get-Sha $paths.aside[0].pak), (Get-Sha $paths.aside[1].pak))
  $ownOk = { (Test-Path -LiteralPath $paths.pak) -and (Get-Sha $paths.pak) -eq $own[0] -and (Get-Sha $paths.aside[0].pak) -eq $own[1] -and (Get-Sha $paths.aside[1].pak) -eq $own[2] -and -not (Test-Leftover $paths) }
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'nothing') 'nothing to restore on a clean folder'
  $script:Fake.running = $true
  $threw = $false; try { [void](Backup-Owner $paths); Install-Pack $paths $packs['M1'] } catch { $threw = $true }
  Assert-Gs $threw 'refuses to install a pack while dota2 runs'
  $script:Fake.running = $false
  [void](Restore-Owner $paths $ours)
  Assert-Gs (& $ownOk) 'the refused install left the owner files in place'
  $kept = @(Backup-Owner $paths)
  Assert-Gs (($kept -join ',') -eq 'pak02_dir.vpk,pak03_dir.vpk,pak04_dir.vpk' -and -not (Test-Path -LiteralPath $paths.pak) -and -not (Test-Path -LiteralPath $paths.aside[0].pak)) 'pak02 → .gs-menu-backup, pak03 and pak04 set aside'
  $threw = $false; try { [void](Backup-Owner $paths) } catch { $threw = $true }
  Assert-Gs $threw 'a second backup over a leftover is refused'
  Install-Pack $paths $packs['M1']
  Assert-Gs ((Get-Sha $paths.pak) -eq $packs['M1'].sha256 -and -not (Test-Path -LiteralPath $paths.aside[0].pak)) 'M1 installed as pak02 and verified; no pak03 beside it'
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'restored' -and (& $ownOk)) 'restore puts pak02, pak03 and pak04 back'
  [void](Backup-Owner $paths); Install-Pack $paths $packs['V1']
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'restored' -and (& $ownOk)) 'leftover backup restored first (crash case)'
  [void](Backup-Owner $paths); Write-Utf8 $paths.pak 'SOMETHING ELSE'; Write-Utf8 $paths.aside[0].pak 'NEW PAK03'
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'restored' -and (& $ownOk) -and @(Get-ChildItem -LiteralPath $paths.ru -Filter '*.gs-replaced-*').Count -eq 2) 'unknown files in our places are set aside, the owner ones restored'
  Get-ChildItem -LiteralPath $paths.ru -Filter '*.gs-replaced-*' | Remove-Item
  Move-Item -LiteralPath $paths.pak -Destination (Join-Path $tmpRoot 'owner02.vpk'); Move-Item -LiteralPath $paths.aside[1].pak -Destination (Join-Path $tmpRoot 'owner04.vpk')
  $kept = @(Backup-Owner $paths)
  Assert-Gs (($kept -join ',') -eq 'pak03_dir.vpk' -and (Test-Path -LiteralPath $paths.none)) 'no owner pak02 → .gs-menu-none marker; only pak03 set aside'
  Install-Pack $paths $packs['M1']
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'restored' -and -not (Test-Path -LiteralPath $paths.pak) -and -not (Test-Path -LiteralPath $paths.none) -and (Get-Sha $paths.aside[0].pak) -eq $own[1] -and -not (Test-Path -LiteralPath $paths.aside[1].pak)) 'marker case: our pack removed, pak03 back, nothing invented'
  Move-Item -LiteralPath (Join-Path $tmpRoot 'owner02.vpk') -Destination $paths.pak; Move-Item -LiteralPath (Join-Path $tmpRoot 'owner04.vpk') -Destination $paths.aside[1].pak
  [void](Backup-Owner $paths); Install-Pack $paths $packs['M1']
  $script:Fake.running = $true; $script:Run.mode = 'test'; $script:Fake.lastMode = ''
  Assert-Gs ((Restore-Owner $paths $ours) -eq 'restored' -and -not $script:Fake.running -and (& $ownOk)) 'restore waits until Dota is closed'

  Write-Host '[video settings and grabs]'
  $vpath = Get-VideoCfgPath $root; $ownVideo = [IO.File]::ReadAllText($vpath)
  $v = Set-DotaBorderless $root; $txt = [IO.File]::ReadAllText($vpath)
  Assert-Gs ($v.state -eq 'switched' -and $v.res -eq '1920x1080' -and (Get-VideoSetting $txt 'fullscreen') -eq '0' -and (Get-VideoSetting $txt 'nowindowborder') -eq '1' -and [IO.File]::ReadAllText("$vpath.gs-capture-backup") -eq $ownVideo) 'fullscreen → borderless; the owner''s video.txt kept'
  $v = Set-DotaBorderless $root
  Assert-Gs ($v.state -eq 'switched' -and [IO.File]::ReadAllText("$vpath.gs-capture-backup") -eq $ownVideo) 'a leftover backup is put back before switching again (never overwritten)'
  Assert-Gs ((Restore-DotaVideo $root) -and [IO.File]::ReadAllText($vpath) -eq $ownVideo -and -not (Test-Path -LiteralPath "$vpath.gs-capture-backup") -and -not (Restore-DotaVideo $root)) 'video.txt restored byte for byte'
  $added = Set-VideoSetting "`"config`"`r`n{`r`n`t`"setting.fullscreen`"`t`t`"1`"`r`n}`r`n" 'nowindowborder' '1'
  Assert-Gs ((Get-VideoSetting $added 'nowindowborder') -eq '1' -and (Get-VideoSetting $added 'fullscreen') -eq '1') 'a missing setting is added inside the block'
  [IO.File]::WriteAllText($vpath, ($ownVideo -replace '"setting.fullscreen"(\s+)"1"', '"setting.fullscreen"$1"0"' -replace '"setting.nowindowborder"(\s+)"0"', '"setting.nowindowborder"$1"1"'))
  $v = Set-DotaBorderless $root
  Assert-Gs ($v.state -eq 'borderless' -and -not (Test-Path -LiteralPath "$vpath.gs-capture-backup")) 'already borderless: nothing touched'
  [IO.File]::WriteAllText($vpath, $ownVideo)
  $lk = Get-GrabLook (New-Object byte[] (1920 * 1080 * 3)) 1920 1080
  $l1 = Get-GrabLook ([GsMenuProbeV1]::SynthRgb(0xFFFFFF, 3, 0, 1, $true, $true, $true)) 1920 1080
  $l2 = Get-GrabLook ([GsMenuProbeV1]::SynthRgb(0xFFFFFF, 3, 0, 1, $true, $true, $true)) 1920 1080
  $l3 = Get-GrabLook ([GsMenuProbeV1]::SynthRgb(0, 3, 0, 1, $true, $true, $true)) 1920 1080
  Assert-Gs ($lk.black -and -not $l1.black -and $l1.sig -eq $l2.sig -and $l1.sig -ne $l3.sig) 'grab look: black frames, equal and changing signatures'
  $f = [GsMenuProbeV1]::AnalyzeRgb([GsMenuProbeV1]::SynthRgb(0x818181, 9, 2, 2, $false, $true, $true), 1920, 1080)
  $f2 = [GsMenuProbeV1]::Analyze([GsMenuProbeV1]::Synth(0x818181, 9, 2, 2, $false, $true, $true))
  Assert-Gs ($f.State -eq 9 -and $f.Part -eq 2 -and $f.Pack -eq 2 -and $f.Global -eq 'G' -and $f.BarBg -eq 1 -and $f.RailBg -eq 0 -and $f2.State -eq $f.State -and $f2.Global -eq $f.Global) 'a grab reads exactly like its PNG'
  $png = [GsMenuProbeV1]::EncodePng(([GsMenuProbeV1]::SynthRgb(0, 4, 0, 1, $true, $false, $true)), 1920, 1080, $false); $wd = 0; $ht = 0
  $back = [GsMenuProbeV1]::DecodePng($png, [ref]$wd, [ref]$ht); $orig = [GsMenuProbeV1]::SynthRgb(0, 4, 0, 1, $true, $false, $true)
  Assert-Gs ($wd -eq 1920 -and [Linq.Enumerable]::SequenceEqual([byte[]]$back, [byte[]]$orig)) 'saved PNG holds the grabbed bytes exactly'
  $f = [GsMenuProbeV1]::AnalyzeRgb($null, 1280, 720)
  Assert-Gs ($f.Error -ne '') 'no image is an error, not a frame'

  Write-Host '[folder watching]'
  $shots = Join-Path $tmpRoot 'shots'; New-Item -ItemType Directory -Force -Path $shots | Out-Null
  [IO.File]::WriteAllBytes((Join-Path $shots 'old.png'), [byte[]](1))
  $w = New-ShotWatch $shots
  $png = [GsMenuProbeV1]::Synth(0, 0, 0, 1, $true, $true, $true)
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
  $f = [GsMenuProbeV1]::Analyze($half)
  Assert-Gs ($f.Error -match 'truncated') "a half-written PNG reads as truncated ($($f.Error))"
  Undo-Shot $w $r3[0]
  Assert-Gs (@(Get-NewShots $w).Count -eq 0 -and @(Get-NewShots $w).Count -eq 1) 'a truncated PNG is retried'

  Write-Host '[session simulations]'
  $script:TestQuietOk = $true
  $full = @($mf.snap.queue)
  $scen = @(
    @{ name = 'normal'; variant = ''; expect = $full },
    @{ name = 'noprobe: probe squares never readable (by time)'; variant = 'noprobe'; queue = @('V1'); expect = @('V1'); status = 'done' },
    @{ name = 'notoggle: parts never hide, M1 ends after a cycle'; variant = 'notoggle'; queue = @('M1'); expect = @('M1'); status = 'done' },
    @{ name = 'barstuck: something stays over the top bar (connection bar), M1 goes on'; variant = 'barstuck'; queue = @('M1'); expect = @('M1'); status = 'done' },
    @{ name = 'crash-fatal: FATAL ERROR box on M1, skipped'; queue = @('M1', 'V1'); crash = 'fatal'; answers = @('д'); expect = @('M1', 'V1'); status = 'done' },
    @{ name = 'crash-exit: Dota gone before the first frame of V1, stop'; queue = @('V1'); crash = 'exit'; answers = @(''); expect = @('V1'); status = 'crashed' }
  )
  foreach ($sc in $scen) {
    $out = Join-Path $tmpRoot ('run-' + $sc.name.Split(' ')[0].TrimEnd(':'))
    $shots = Join-Path $out 'shots'; New-Item -ItemType Directory -Force -Path $shots | Out-Null
    Set-Variable -Name Steam -Value ([bool]$sc.steam) -Scope Script
    $script:Sys = New-FakeSys
    $script:Fake.variant = [string]$sc.variant; $script:Fake.shots = $shots; $script:Fake.pakPath = $paths.pak
    $script:Fake.crash = [string]$sc.crash; foreach ($a in @($sc.answers)) { if ($null -ne $a) { [void]$script:Fake.answers.Add($a) } }
    $script:InitialQueue = $sc.queue; $script:NoFrameSeconds = 420
    $script:Events = New-Object System.Collections.ArrayList
    Set-Variable -Name OutDir -Value $out -Scope Script
    Set-Variable -Name DotaDir -Value $root -Scope Script
    Set-Variable -Name ShotsDir -Value $shots -Scope Script
    Set-Variable -Name Base -Value $srv -Scope Script
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $res = Invoke-GsMenuCapture
    $script:InitialQueue = $null
    $S = $res.session
    $ran = @($S.packRecords | ForEach-Object { $_.id })
    $recM = @($S.packRecords | Where-Object { $_.id -eq 'M1' })[-1]
    $recV = @($S.packRecords | Where-Object { $_.id -eq 'V1' })[-1]
    Write-Host ("  [{0}] {1:n0} s real, packs {2}, frames {3}, beeps {4}" -f $sc.name, $sw.Elapsed.TotalSeconds, ($ran -join ','), $S.frames.Count, ($script:Fake.beeps -join ' '))
    Assert-Gs (($ran -join ',') -eq ($sc.expect -join ',')) "[$($sc.name)] pack order $($ran -join ',')"
    Assert-Gs ((& $ownOk) -and [IO.File]::ReadAllText($vpath) -eq $ownVideo -and -not (Test-Path -LiteralPath "$vpath.gs-capture-backup")) "[$($sc.name)] owner pak02/pak03/pak04 and video.txt restored"
    Assert-Gs (Test-Path -LiteralPath $res.zip) "[$($sc.name)] zip written"
    $doc = [IO.File]::ReadAllText((Join-Path $res.dir 'session.json')) | ConvertFrom-Json
    Assert-Gs ($doc.format -eq 'gs-menu-capture-session/1' -and $doc.frames.Count -eq $S.frames.Count -and ($doc.f12.Count -gt 0 -or $sc.crash -eq 'exit') -and (@($doc.setAside) -join ',') -eq 'pak02_dir.vpk,pak03_dir.vpk,pak04_dir.vpk') "[$($sc.name)] session.json: $($doc.frames.Count) frames, $($doc.f12.Count) F12, set aside $(@($doc.setAside) -join ' ')"
    Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
    $z = [IO.Compression.ZipFile]::OpenRead($res.zip)
    try { $names = @($z.Entries | ForEach-Object { $_.FullName }) } finally { $z.Dispose() }
    Assert-Gs ($names -contains 'session.json' -and $names.Count -eq $S.frames.Count + 1) "[$($sc.name)] zip: session.json + $($names.Count - 1) frames"
    $missing = @($S.frames | Where-Object { -not (Test-Path -LiteralPath (Join-Path $res.dir $_.file)) })
    Assert-Gs ($missing.Count -eq 0) "[$($sc.name)] every frame copied under its new name"
    if ($sc.crash) {
      $first = @($S.packRecords)[0]
      Assert-Gs ($first.result -eq 'crash' -and $res.status -eq $sc.status) "[$($sc.name)] crash seen ($($first.crash)), status $($res.status)"
      Assert-Gs ($script:Fake.pakAtAsk.Count -ge 1 -and $script:Fake.pakAtAsk[0] -eq $own[0]) "[$($sc.name)] owner pak02 back before the question"
      Assert-Gs ((($script:Fake.beeps -join ' ') -match 'long') -and (($script:Events | ForEach-Object { $_.text }) -join "`n") -match 'НЕ ЗАГРУЗИЛА МЕНЮ') "[$($sc.name)] long beep and the Russian message"
      if ($sc.crash -eq 'fatal') { Assert-Gs ($script:Fake.killed -eq 1) '[crash-fatal] the hung Dota with the error box is closed' }
    }
    if ($sc.name -eq 'normal') {
      $spanM = $recM.endedAt - $recM.firstFrameAt; $spanV = $recV.endedAt - $recV.firstFrameAt
      Assert-Gs ($res.status -eq 'done' -and $recM.result -eq 'ok' -and $recV.result -eq 'ok') "[normal] M1 $($recM.result), V1 $($recV.result) by coverage"
      Assert-Gs ($spanM -ge 207 -and $spanM -le 290 -and $spanV -ge 48 -and $spanV -le 80) ("[normal] M1 {0:n0} s ({1} frames), V1 {2:n0} s ({3} frames)" -f $spanM, $recM.frames, $spanV, $recV.frames)
      $bad = @($recM.verdicts.Keys | Where-Object { $recM.verdicts[$_] -ne 'ok' }) + @($recV.verdicts.Keys | Where-Object { $recV.verdicts[$_] -ne 'ok' })
      Assert-Gs ($bad.Count -eq 0) "[normal] all verdicts ok ($(($recM.verdicts.Keys | ForEach-Object { "$_=$($recM.verdicts[$_])" }) -join ' '))"
      Assert-Gs ($recM.coverage.have -eq $recM.coverage.need -and $recM.coverage.need -eq 48) "[normal] M1 coverage $($recM.coverage.have)/$($recM.coverage.need)"
      Assert-Gs (($script:Fake.beeps -join ' ') -match 'M1:start' -and ($script:Fake.beeps -join ' ') -match 'M1:triple' -and ($script:Fake.beeps -join ' ') -match 'V1:triple' -and -not (($script:Fake.beeps -join ' ') -match 'long')) '[normal] start and triple beeps, no long beep'
      Assert-Gs (@($S.frames | Where-Object { $_.pack -eq 'M1' -and $_.probe.state -ge 0 }).Count -gt 200) '[normal] frames carry their probe code'
      Assert-Gs (@($S.frames | Where-Object { $_.src -notlike 'grab-*' }).Count -eq 0 -and $recM.source -eq 'grab' -and $doc.source -eq 'grab' -and $doc.video.state -eq 'switched' -and $script:Fake.sent -eq 0) '[normal] grabbed frames, no Steam; Dota switched to borderless for the capture'
      $png1 = [IO.File]::ReadAllBytes((Join-Path $res.dir $S.frames[0].file)); $f1 = [GsMenuProbeV1]::Analyze($png1)
      Assert-Gs ($f1.Error -eq '' -and $f1.Pack -eq 1 -and $f1.State -eq $S.frames[0].probe.state) '[normal] a saved frame reads back as it was classified'
      # Resume: an interrupted session continues from its queue.
      $doc.status = 'aborted'; $doc.queue = @('V1')
      Write-Utf8 (Join-Path $res.dir 'session.json') ($doc | ConvertTo-Json -Depth 10)
      $script:Sys = New-FakeSys; $script:Fake.shots = $shots; [void]$script:Fake.answers.Add('д')
      $res2 = Invoke-GsMenuCapture
      $ran2 = @($res2.session.packRecords | ForEach-Object { $_.id })
      Assert-Gs ($res2.status -eq 'done' -and ($ran2 -join ',') -eq (($full + 'V1') -join ',') -and $res2.session.counters['V1'] -gt $S.counters['V1']) "[resume] continued with V1 only; numbering goes on (V1_$('{0:0000}' -f $res2.session.counters['V1']))"
      Assert-Gs (& $ownOk) '[resume] owner files restored'
    }
    if ($sc.variant -eq 'noprobe') {
      Assert-Gs ($recV.result -eq 'cap' -and $recV.verdicts['probe'] -eq 'fail' -and (($script:Fake.beeps -join ' ') -match 'V1:long')) "[noprobe] V1 runs to its cap ($($recV.result), probe $($recV.verdicts['probe']))"
    }
    if ($sc.variant -eq 'barstuck') {
      Assert-Gs ($recM.result -eq 'ok' -and $recM.verdicts['toggles'] -eq 'partial' -and -not (($script:Fake.beeps -join ' ') -match 'long')) "[barstuck] M1 $($recM.result), toggles $($recM.verdicts['toggles']), no long beep"
    }
    if ($sc.variant -eq 'notoggle') {
      $span = $recM.endedAt - $recM.firstFrameAt
      Assert-Gs ($recM.result -eq 'notoggle' -and $span -lt 160 -and $recM.verdicts['toggles'] -eq 'fail') ("[notoggle] M1 stops after one cycle: {0}, {1:n0} s" -f $recM.result, $span)
    }
  }
  # Grab quirks on V1: a 1280×720 window, Valve's own menu, black frames (exclusive fullscreen) until the
  # owner is told to go borderless, the cursor away from the middle, Dota closed mid-pack.
  $out = Join-Path $tmpRoot 'run-grabquirks'
  Set-Variable -Name Steam -Value $false -Scope Script
  $script:Sys = New-FakeSys; $script:Events = New-Object System.Collections.ArrayList
  $script:Fake.inactiveLeft = 2; $script:Fake.badSize = 1; $script:Fake.variant = 'exclusive'; $script:Fake.cursorAway = 4; $script:Fake.closeAt = 30; [void]$script:Fake.answers.Add('д')
  $script:InitialQueue = @('V1')
  Set-Variable -Name OutDir -Value $out -Scope Script
  $res = Invoke-GsMenuCapture
  $script:InitialQueue = $null
  $msgs = ($script:Events | ForEach-Object { $_.text }) -join "`n"
  $recs = @($res.session.packRecords)
  Write-Host ("  [grab quirks] packs {0}, beeps {1}" -f (($recs | ForEach-Object { "$($_.id)#$($_.attempt):$($_.result)" }) -join ','), ($script:Fake.beeps -join ' '))
  Assert-Gs ($msgs -match '1280×720' -and $msgs -match 'без мигающего фона' -and $msgs -match 'чёрный экран' -and $msgs -match 'Окно без рамок' -and $msgs -match 'Поставь курсор') '[grab quirks] wrong size, Valve''s menu, black grabs and the cursor are explained'
  Assert-Gs ($recs.Count -eq 2 -and $recs[0].result -eq 'dota-closed' -and $recs[1].result -eq 'ok' -and $res.status -eq 'done' -and $script:Fake.sent -eq 0) '[grab quirks] Dota closed mid-pack → retried → done; no F12 sent'
  Assert-Gs (@($res.session.frames | Where-Object { $_.probe.pack -ne 2 }).Count -eq 0 -and (& $ownOk)) '[grab quirks] only frames of the pack saved; owner files restored'
  # Steam route (-Steam) quirks on V1: two frames of Valve's menu first, a wrong-size frame, Steam ignoring F12 for a while, Dota closed mid-pack.
  $out = Join-Path $tmpRoot 'run-quirks'; $shots = Join-Path $out 'shots'; New-Item -ItemType Directory -Force -Path $shots | Out-Null
  Set-Variable -Name Steam -Value $true -Scope Script
  $script:Sys = New-FakeSys; $script:Fake.shots = $shots; $script:Events = New-Object System.Collections.ArrayList
  $script:Fake.inactiveLeft = 2; $script:Fake.badSize = 1; $script:Fake.silence = @(8, 24); $script:Fake.closeAt = 30; [void]$script:Fake.answers.Add('д')
  $script:InitialQueue = @('V1')
  Set-Variable -Name OutDir -Value $out -Scope Script
  Set-Variable -Name ShotsDir -Value $shots -Scope Script
  $res = Invoke-GsMenuCapture
  $script:InitialQueue = $null
  $msgs = ($script:Events | ForEach-Object { $_.text }) -join "`n"
  $recs = @($res.session.packRecords)
  Write-Host ("  [quirks] packs {0}, beeps {1}" -f (($recs | ForEach-Object { "$($_.id)#$($_.attempt):$($_.result)" }) -join ','), ($script:Fake.beeps -join ' '))
  Assert-Gs ($msgs -match 'без мигающего фона' -and $msgs -match 'не подхватился' -eq $false) '[quirks] frames of Valve''s menu are not taken, the owner is told'
  Assert-Gs ($msgs -match '64×48' -and $msgs -match 'Steam не принимает') '[quirks] wrong size and silent Steam are reported'
  Assert-Gs ($recs.Count -eq 2 -and $recs[0].result -eq 'dota-closed' -and $recs[1].result -eq 'ok' -and $res.status -eq 'done') '[quirks] Dota closed mid-pack → retried → done'
  Assert-Gs (@($res.session.frames | Where-Object { $_.src -like '570_menu_*' -or $_.src -eq '570_small.png' }).Count -eq 0 -and (& $ownOk) -and $res.session.packRecords[0].source -eq 'steam') '[quirks] bad frames not copied; owner files restored'
  Set-Variable -Name Steam -Value $false -Scope Script
  # Ctrl+C / error mid-pack (grabbing): finally restores.
  $out = Join-Path $tmpRoot 'run-abort'; $shots = Join-Path $out 'shots'; New-Item -ItemType Directory -Force -Path $shots | Out-Null
  $script:Sys = New-FakeSys; $script:Fake.shots = $shots
  $script:OrigGrab = $script:Sys.Grab
  $script:Sys.Grab = { if ($script:Fake.now - $script:Fake.packZero -gt 40) { throw 'simulated Ctrl+C' }; & $script:OrigGrab }
  Set-Variable -Name OutDir -Value $out -Scope Script
  Set-Variable -Name ShotsDir -Value $shots -Scope Script
  $threw = $false; try { [void](Invoke-GsMenuCapture) } catch { $threw = $true }
  Assert-Gs ($threw -and (& $ownOk) -and [IO.File]::ReadAllText($vpath) -eq $ownVideo) '[abort] interrupted mid-pack: owner files and video.txt restored in finally'
  $doc = [IO.File]::ReadAllText((Join-Path (Join-Path $out 'gs-menu-capture') 'session.json')) | ConvertFrom-Json
  Assert-Gs ($doc.status -eq 'aborted' -and @($doc.queue)[0] -eq 'M1') '[abort] session.json saved as aborted with the queue'
  # The owner's own font: asked, default no → nothing touched.
  $out = Join-Path $tmpRoot 'run-font'; $shots = Join-Path $out 'shots'; New-Item -ItemType Directory -Force -Path $shots | Out-Null
  New-Item -ItemType Directory -Force -Path $paths.fonts | Out-Null
  $script:Sys = New-FakeSys; $script:Fake.shots = $shots; $script:Events = New-Object System.Collections.ArrayList
  Set-Variable -Name OutDir -Value $out -Scope Script
  Set-Variable -Name ShotsDir -Value $shots -Scope Script
  $res = Invoke-GsMenuCapture
  Assert-Gs ($res.status -eq 'font' -and (& $ownOk) -and $script:Fake.beeps.Count -eq 1) '[font] custom font: asked, nothing touched'
  Remove-Item -LiteralPath $paths.fonts -Recurse -Force
  # The HUD watcher's leftover pak03 backup: refused.
  Write-Utf8 (Join-Path $paths.ru 'pak03_dir.vpk.gs-backup') 'HUD LEFTOVER'
  $threw = $false; try { [void](Invoke-GsMenuCapture) } catch { $threw = ($_.Exception.Message -match 'hud-capture') }
  Assert-Gs ($threw -and (& $ownOk)) '[hud leftover] refused, nothing touched'
  Remove-Item -LiteralPath (Join-Path $paths.ru 'pak03_dir.vpk.gs-backup')

  $script:Quiet = $false
  Write-Host ''
  $color = if ($script:TestFail) { 'Red' } else { 'Green' }
  Write-Host ("Self-test: {0} passed, {1} failed. ({2})" -f $script:TestOk, $script:TestFail, $tmpRoot) -ForegroundColor $color
  return $script:TestFail
}

# ---------------------------------------------------------------- entry
if ($SelfTest) { $script:GsSelfTestResult = Invoke-GsSelfTest }
else {
  try { [void](Invoke-GsMenuCapture) }
  catch {
    Write-Host ''
    Write-Host "Ошибка: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Пришли этот текст. Если съёмка прервалась — запусти команду ещё раз: первым делом она вернёт твои pak-файлы.' -ForegroundColor Red
  }
}
