// Windows installers for the /customize downloads: a PowerShell script started by two .bat files
// (install and remove), zipped next to the files they put in place. The script finds Dota 2 by
// itself: Steam's path from the registry, every library from steamapps/libraryfolders.vdf, the
// library whose "dota 2 beta" has game/dota/gameinfo.gi; if that fails it asks for the folder.
// Nothing is downloaded or run besides copying; whatever it replaces is kept for «Удалить».

const CRLF = (text) => text.replace(/\r?\n/g, '\r\n');
// PowerShell 5 reads a script without a BOM in the system code page; the BOM keeps Russian text.
const withBOM = (text) => new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(CRLF(text))]);
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

const FIND_DOTA = String.raw`
function Find-Dota {
  $roots = New-Object System.Collections.Generic.List[string]
  foreach ($key in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam') {
    $item = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
    foreach ($value in @($item.SteamPath, $item.InstallPath)) { if ($value) { $roots.Add(($value -replace '/', '\')) } }
  }
  foreach ($root in @($roots)) {
    $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
    if (Test-Path -LiteralPath $vdf) {
      foreach ($match in [regex]::Matches((Get-Content -LiteralPath $vdf -Raw), '"path"\s+"([^"]+)"')) { $roots.Add(($match.Groups[1].Value -replace '\\\\', '\')) }
    }
  }
  foreach ($root in ($roots | Select-Object -Unique)) {
    $dota = Join-Path $root 'steamapps\common\dota 2 beta'
    if (Test-Path -LiteralPath (Join-Path $dota 'game\dota\gameinfo.gi')) { return $dota }
  }
  Write-Host 'Не нашёл Dota 2 автоматически. Выбери папку "dota 2 beta" в окне.'
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = 'Папка "dota 2 beta" (Steam -> Dota 2 -> Свойства -> Установленные файлы -> Обзор)'
  if ($dialog.ShowDialog() -eq 'OK' -and (Test-Path -LiteralPath (Join-Path $dialog.SelectedPath 'game\dota\gameinfo.gi'))) { return $dialog.SelectedPath }
  throw 'Это не папка Dota 2: в ней нет game\dota\gameinfo.gi.'
}
function Wait-DotaClosed {
  while (Get-Process -Name dota2 -ErrorAction SilentlyContinue) { Read-Host 'Dota 2 запущена. Закрой её и нажми Enter' | Out-Null }
}
`;
const FRAME = (title, body) => `# GridStudio — ${title}. https://gridstudio.me/customize
# Запускается через «Установить …bat» и «Удалить …bat» рядом. Только копирует файлы, ничего не скачивает.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
${FIND_DOTA}
try {
${body}
} catch {
  Write-Host ''
  Write-Host ("Ошибка: " + $_.Exception.Message) -ForegroundColor Red
}
Write-Host ''
Read-Host 'Нажми Enter, чтобы закрыть' | Out-Null
`;
const launcher = (script, remove = false) => CRLF(`@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${script}"${remove ? ' -Remove' : ''}
`);

// The menu background: file = pak02_dir.vpk or pak01_dir.vpk, folder = dota_russian or dota_123.
export function backgroundInstaller({ file, folder, launch }) {
  const script = FRAME('фон главного меню Dota 2', `
  $file = ${quote(file)}; $folder = ${quote(folder)}
  $dota = Find-Dota
  Write-Host ("Dota 2: " + $dota)
  Wait-DotaClosed
  $target = Join-Path $dota ('game\\' + $folder)
  $dest = Join-Path $target $file
  $backup = $dest + '.gridstudio-backup'
  if ($Remove) {
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }
    if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $dest -Force; Write-Host 'Вернул файл, который был до фона.' }
    Write-Host 'Фон удалён. Перезапусти Dota 2.' -ForegroundColor Green
  } else {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    if ((Test-Path -LiteralPath $dest) -and -not (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $dest -Destination $backup -Force; Write-Host ('Старый ' + $file + ' сохранён рядом как .gridstudio-backup.') }
    Copy-Item -LiteralPath (Join-Path $here $file) -Destination $dest -Force
    Write-Host ('Готово: ' + $dest) -ForegroundColor Green
    Write-Host ''
    Write-Host ${quote(folder === 'dota_123' ? `Добавь в Steam: Dota 2 -> Свойства -> Параметры запуска: ${launch}` : `Если озвучка в Dota не русская, добавь в Steam: Dota 2 -> Свойства -> Параметры запуска: ${launch}`)}
    Write-Host 'Перезапусти Dota 2. Убрать фон: «Удалить фон.bat» из этой папки.'
  }`);
  return [
    { name: 'gridstudio-background.ps1', data: withBOM(script) },
    { name: 'Установить фон.bat', data: launcher('gridstudio-background.ps1') },
    { name: 'Удалить фон.bat', data: launcher('gridstudio-background.ps1', true) }
  ];
}

// The font: every file of ./fonts replaces the game's file of that name; the originals go to
// panorama/fonts/gridstudio-backup once (a second install keeps the first backup).
export function fontInstaller() {
  const script = FRAME('шрифт Dota 2', `
  $dota = Find-Dota
  Write-Host ("Dota 2: " + $dota)
  Wait-DotaClosed
  $fonts = Join-Path $dota 'game\\dota\\panorama\\fonts'
  $backup = Join-Path $fonts 'gridstudio-backup'
  if ($Remove) {
    if (-not (Test-Path -LiteralPath $backup)) { throw 'Нет резервной копии. Верни шрифты проверкой целостности файлов в Steam.' }
    Get-ChildItem -LiteralPath $backup -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $fonts $_.Name) -Force }
    Remove-Item -LiteralPath $backup -Recurse -Force
    Write-Host 'Вернул шрифты Dota.' -ForegroundColor Green
  } else {
    $ours = Get-ChildItem -LiteralPath (Join-Path $here 'fonts') -File
    if (-not (Test-Path -LiteralPath $backup)) {
      New-Item -ItemType Directory -Force -Path $backup | Out-Null
      foreach ($font in $ours) { $original = Join-Path $fonts $font.Name; if (Test-Path -LiteralPath $original) { Copy-Item -LiteralPath $original -Destination $backup -Force } }
      Write-Host 'Шрифты Dota сохранены в panorama\\fonts\\gridstudio-backup.'
    }
    foreach ($font in $ours) { Copy-Item -LiteralPath $font.FullName -Destination (Join-Path $fonts $font.Name) -Force }
    Write-Host ('Готово: ' + $ours.Count + ' файлов в ' + $fonts) -ForegroundColor Green
    Write-Host 'Запусти Dota 2. Вернуть шрифты: «Удалить шрифт.bat» из этой папки.'
  }
  # fontconfig's cache would keep the old fonts: the game rebuilds it.
  if ($env:TEMP) { $cache = Join-Path $env:TEMP 'fontconfig'; if (Test-Path -LiteralPath $cache) { Remove-Item -LiteralPath $cache -Recurse -Force -ErrorAction SilentlyContinue } }`);
  return [
    { name: 'gridstudio-font.ps1', data: withBOM(script) },
    { name: 'Установить шрифт.bat', data: launcher('gridstudio-font.ps1') },
    { name: 'Удалить шрифт.bat', data: launcher('gridstudio-font.ps1', true) }
  ];
}
