import sys
lst_path, out_path = sys.argv[1], sys.argv[2]
lst = open(lst_path).read().strip()
ps = r'''# GridStudio: copies pictures, sounds, models and data of four Crownfall minigames out of pak01
# (plus their scene maps, copied whole) into one zip on the Desktop, for gridstudio.me. Only reads the game's files: installs nothing, sends nothing.
$ErrorActionPreference = 'Stop'
$name = 'gridstudio-minigames'
function Find-Dota {
  $candidates = @($PSScriptRoot)
  try { $steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath } catch { $steam = $null }
  if ($steam) {
    $candidates += Join-Path $steam 'steamapps\common\dota 2 beta\game\dota'
    $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) { foreach ($m in [regex]::Matches((Get-Content -Raw $vdf), '"path"\s+"([^"]+)"')) { $candidates += Join-Path ($m.Groups[1].Value -replace '\\\\', '\') 'steamapps\common\dota 2 beta\game\dota' } }
  }
  foreach ($c in $candidates) { if ($c -and (Test-Path (Join-Path $c 'pak01_dir.vpk'))) { return $c } }
  return $null
}
$want = @{}
foreach ($line in (@'
LIST
'@ -split "\n")) { $p = $line.Trim(); if ($p) { $want[$p] = $true } }
try {
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  Write-Host 'GridStudio: ищу Dota...'
  $dota = if ($env:GRIDSTUDIO_DOTA) { $env:GRIDSTUDIO_DOTA } else { Find-Dota }
  if (-not $dota) { $dota = (Read-Host 'Не нашёл Dota. Вставь путь к папке ...\dota 2 beta\game\dota').Trim('" ') }
  Write-Host "Dota: $dota"
  $b = [IO.File]::ReadAllBytes((Join-Path $dota 'pak01_dir.vpk'))
  if ([BitConverter]::ToUInt32($b, 0) -ne 0x55aa1234 -or [BitConverter]::ToUInt32($b, 4) -ne 2) { throw 'pak01_dir.vpk не читается.' }
  $dataStart = 28 + [BitConverter]::ToUInt32($b, 8)
  $utf8 = [Text.Encoding]::UTF8; $script:pos = 28; $found = New-Object System.Collections.ArrayList
  function Read-CStr { $end = [Array]::IndexOf($b, [byte]0, $script:pos); $s = $utf8.GetString($b, $script:pos, $end - $script:pos); $script:pos = $end + 1; return $s }
  Write-Host 'Читаю список файлов игры...'
  while ($true) {
    $ext = Read-CStr; if (-not $ext) { break }
    while ($true) {
      $dir = Read-CStr; if (-not $dir) { break }
      while ($true) {
        $file = Read-CStr; if (-not $file) { break }
        $p0 = $script:pos
        $pre = [BitConverter]::ToUInt16($b, $p0 + 4); $arc = [BitConverter]::ToUInt16($b, $p0 + 6)
        $off = [BitConverter]::ToUInt32($b, $p0 + 8); $len = [BitConverter]::ToUInt32($b, $p0 + 12)
        $full = $(if ($dir -eq ' ') { '' } else { $dir + '/' }) + $file + '.' + $ext
        if ($want.ContainsKey($full)) { [void]$found.Add([pscustomobject]@{ Path = $full; Pre = $p0 + 18; PreLen = $pre; Arc = $arc; Off = $off; Len = $len }) }
        $script:pos = $p0 + 18 + $pre
      }
    }
  }
  Write-Host ("Нашёл {0} из {1} картинок." -f $found.Count, $want.Count)
  if ($env:GRIDSTUDIO_DRY) { return }
  $zipPath = Join-Path ([Environment]::GetFolderPath('Desktop')) "$name.zip"
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  $zip = [IO.Compression.ZipFile]::Open($zipPath, 'Create')
  $archives = @{}
  try {
    foreach ($f in ($found | Sort-Object Arc, Off)) {
      $data = New-Object byte[] ($f.PreLen + $f.Len)
      if ($f.PreLen) { [Array]::Copy($b, $f.Pre, $data, 0, $f.PreLen) }
      if ($f.Len) {
        if ($f.Arc -eq 0x7fff) { [Array]::Copy($b, $dataStart + $f.Off, $data, $f.PreLen, $f.Len) }
        else {
          if (-not $archives.ContainsKey($f.Arc)) { $archives[$f.Arc] = [IO.File]::OpenRead((Join-Path $dota ('pak01_{0:000}.vpk' -f $f.Arc))) }
          $s = $archives[$f.Arc]; [void]$s.Seek($f.Off, 'Begin'); $read = 0
          while ($read -lt $f.Len) { $n = $s.Read($data, $f.PreLen + $read, $f.Len - $read); if ($n -le 0) { throw "Файл обрывается: $($f.Path)" }; $read += $n }
        }
      }
      $entry = $zip.CreateEntry($f.Path, [IO.Compression.CompressionLevel]::Fastest)
      $w = $entry.Open(); $w.Write($data, 0, $data.Length); $w.Close()
    }
    # Scene maps live outside pak01, as files of their own.
    foreach ($m in @('flappy_skywrath_act2', 'flappy_skywrath_act2_bg', 'flappy_skywrath_act2_loop', 'fishing_game_act1')) {
      $file = Join-Path $dota "maps\scenes\crownfall\$m.vpk"
      if (Test-Path $file) { [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file, "maps/scenes/crownfall/$m.vpk", [IO.Compression.CompressionLevel]::Fastest); Write-Host "Карта: $m" }
      else { Write-Host "Нет карты: $m" -ForegroundColor Yellow }
    }
  } finally { $zip.Dispose(); foreach ($s in $archives.Values) { $s.Dispose() } }
  Write-Host ''
  Write-Host "Готово: $zipPath ($([math]::Round((Get-Item $zipPath).Length / 1MB)) МБ)." -ForegroundColor Green
  Write-Host 'Загрузи его на 0807.st (или куда удобно) и пришли ссылку.'
} catch { Write-Host "Ошибка: $($_.Exception.Message)" -ForegroundColor Red }
if (-not $env:GRIDSTUDIO_DOTA) { Read-Host 'Нажми Enter, чтобы закрыть' }
'''.replace('LIST', lst).replace('-split "\\n"', '-split "`n"')
open(out_path, 'w', encoding='utf-8-sig').write(ps)
print(len(ps))
