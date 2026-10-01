// Windows installers for the /customize downloads: a PowerShell script started by two .bat files
// (install and remove), zipped next to the files they put in place. The script finds Dota 2 by
// itself: Steam's path from the registry, every library from steamapps/libraryfolders.vdf, the
// library whose "dota 2 beta" has game/dota/gameinfo.gi; if that fails it asks for the folder.
// Nothing is downloaded or run besides copying; whatever it replaces is kept for «Удалить».
// The messages and the .bat names follow the site's language when the zip is made (scripts/i18n.mjs).
import { lang } from './i18n.mjs';

const CRLF = (text) => text.replace(/\r?\n/g, '\r\n');
// PowerShell 5 reads a script without a BOM in the system code page; the BOM keeps Russian text.
const withBOM = (text) => new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(CRLF(text))]);
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

// The console's texts. PowerShell takes typographic quotes (‘ ’ “ ”) for its own, so the English
// ones use none of them, nor apostrophes.
const TEXTS = {
  ru: {
    findFailed: 'Не нашёл Dota 2 автоматически. Выбери папку "dota 2 beta" в окне.',
    folderDialog: 'Папка "dota 2 beta" (Steam -> Dota 2 -> Свойства -> Установленные файлы -> Обзор)',
    notDota: 'Это не папка Dota 2: в ней нет game\\dota\\gameinfo.gi.',
    running: 'Dota 2 запущена. Закрой её и нажми Enter',
    started: 'Запускается через «Установить …bat» и «Удалить …bat» рядом. Только копирует файлы, ничего не скачивает.',
    error: 'Ошибка: ',
    close: 'Нажми Enter, чтобы закрыть',
    background: {
      title: 'фон главного меню Dota 2', install: 'Установить фон.bat', remove: 'Удалить фон.bat',
      restored: 'Вернул файл, который был до фона.', removed: 'Фон удалён. Перезапусти Dota 2.',
      kept: ['Старый ', ' сохранён рядом как .gridstudio-backup.'], done: 'Готово: ',
      audio: 'Язык озвучки Dota теперь русский: Dota читает фон только из папки dota_russian. Интерфейс не меняется; если русской озвучки нет, герои говорят по-английски.',
      audioBack: 'Вернул прежний язык озвучки Dota.',
      launch: 'Если в Steam в параметрах запуска Dota 2 есть -language (кроме -language russian), убери его: с ним Dota не читает dota_russian.',
      after: 'Перезапусти Dota 2. Убрать фон: «Удалить фон.bat» из этой папки.'
    },
    font: {
      title: 'шрифт Dota 2', install: 'Установить шрифт.bat', remove: 'Удалить шрифт.bat',
      noBackup: 'Нет резервной копии. Верни шрифты проверкой целостности файлов в Steam.', restored: 'Вернул шрифты Dota.',
      saved: 'Шрифты Dota сохранены в panorama\\fonts\\gridstudio-backup.', done: ['Готово: ', ' файлов в '],
      after: 'Запусти Dota 2. Вернуть шрифты: «Удалить шрифт.bat» из этой папки.'
    }
  },
  en: {
    findFailed: 'Could not find Dota 2 by itself. Pick the "dota 2 beta" folder in the window.',
    folderDialog: 'The "dota 2 beta" folder (Steam -> Dota 2 -> Properties -> Installed Files -> Browse)',
    notDota: 'This is not the Dota 2 folder: there is no game\\dota\\gameinfo.gi in it.',
    running: 'Dota 2 is running. Close it and press Enter',
    started: 'Started by the "Install ….bat" and "Remove ….bat" files next to it. It only copies files and downloads nothing.',
    error: 'Error: ',
    close: 'Press Enter to close',
    background: {
      title: 'Dota 2 main menu background', install: 'Install background.bat', remove: 'Remove background.bat',
      restored: 'Put back the file that was there before the background.', removed: 'Background removed. Restart Dota 2.',
      kept: ['The old ', ' is kept next to it as .gridstudio-backup.'], done: 'Done: ',
      audio: 'Dota audio language is now Russian: Dota reads the background only from the dota_russian folder. The interface stays as it was; without the Russian voice pack, heroes keep speaking English.',
      audioBack: 'Put back the Dota audio language from before.',
      launch: 'If Dota 2 has -language in its Steam launch options (other than -language russian), remove it: with it, Dota does not read dota_russian.',
      after: 'Restart Dota 2. To remove the background, run "Remove background.bat" from this folder.'
    },
    font: {
      title: 'Dota 2 font', install: 'Install font.bat', remove: 'Remove font.bat',
      noBackup: 'There is no backup. Get the fonts back with Verify integrity of game files in Steam.', restored: 'Dota fonts are back.',
      saved: 'Dota fonts are saved in panorama\\fonts\\gridstudio-backup.', done: ['Done: ', ' files in '],
      after: 'Start Dota 2. To get the Dota fonts back, run "Remove font.bat" from this folder.'
    }
  }
};
const texts = (language) => TEXTS[language === 'en' ? 'en' : 'ru'];
// The .bat names of the background ('background') or the font ('font') installer: { install, remove }.
export const installerNames = (what, language = lang) => ({ install: texts(language)[what].install, remove: texts(language)[what].remove });

const FIND_DOTA = (m) => String.raw`
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
  Write-Host ${quote(m.findFailed)}
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = ${quote(m.folderDialog)}
  if ($dialog.ShowDialog() -eq 'OK' -and (Test-Path -LiteralPath (Join-Path $dialog.SelectedPath 'game\dota\gameinfo.gi'))) { return $dialog.SelectedPath }
  throw ${quote(m.notDota)}
}
function Wait-DotaClosed {
  while (Get-Process -Name dota2 -ErrorAction SilentlyContinue) { Read-Host ${quote(m.running)} | Out-Null }
}
`;
const FRAME = (m, title, body) => `# GridStudio — ${title}. https://gridstudio.me/background
# ${m.started}
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
${FIND_DOTA(m)}
try {
${body}
} catch {
  Write-Host ''
  Write-Host ("${m.error}" + $_.Exception.Message) -ForegroundColor Red
}
Write-Host ''
Read-Host ${quote(m.close)} | Out-Null
`;
const launcher = (script, remove = false) => CRLF(`@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${script}"${remove ? ' -Remove' : ''}
`);

// Dota reads game/dota_russian only when its audio language is Russian (docs/customize.md): boot.vcfg
// (KeyValues; Dota reads it at start and writes it on exit, so it is changed while Dota is closed)
// gets "AudioLanguage" "russian"; the value before is kept in boot.vcfg.gridstudio-audio and comes
// back on removal. The interface language (UILanguage) is left alone.
const AUDIO = (b) => String.raw`
$boot = Join-Path $dota 'game\dota\cfg\boot.vcfg'
$audioKept = $boot + '.gridstudio-audio'
$tab = [string][char]9; $nl = [string][char]13 + [char]10
$audioPattern = '"AudioLanguage"\s+"([^"]*)"'
function Set-RussianAudio {
  $text = if (Test-Path -LiteralPath $boot) { [IO.File]::ReadAllText($boot) } else { '' }
  $match = [regex]::Match($text, $audioPattern)
  $was = if ($match.Success) { $match.Groups[1].Value } else { '' }
  if ($was -eq 'russian') { return }
  if (-not (Test-Path -LiteralPath $audioKept)) { [IO.File]::WriteAllText($audioKept, $was) }
  $line = '"AudioLanguage"' + $tab + $tab + '"russian"'
  if ($match.Success) { $text = $text.Remove($match.Index, $match.Length).Insert($match.Index, $line) }
  elseif ($text -match '\}\s*$') { $text = [regex]::Replace($text, '\}\s*$', ($tab + $line + $nl + '}' + $nl)) }
  else { $text = '"boot"' + $nl + '{' + $nl + $tab + $line + $nl + '}' + $nl }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $boot) | Out-Null
  [IO.File]::WriteAllText($boot, $text)
  Write-Host ${quote(b.audio)}
}
function Restore-Audio {
  if (-not (Test-Path -LiteralPath $audioKept)) { return }
  $was = [IO.File]::ReadAllText($audioKept).Trim()
  if (Test-Path -LiteralPath $boot) {
    $text = [IO.File]::ReadAllText($boot)
    if ($was) { $text = [regex]::Replace($text, $audioPattern, ('"AudioLanguage"' + $tab + $tab + '"' + $was + '"')) }
    else { $text = [regex]::Replace($text, '[ \t]*"AudioLanguage"\s+"[^"]*"[ \t]*(\r?\n)?', '') }
    [IO.File]::WriteAllText($boot, $text)
  }
  Remove-Item -LiteralPath $audioKept -Force
  Write-Host ${quote(b.audioBack)}
}
`;

// The menu background: pak02_dir.vpk into dota_russian, beside the Russian voice-over (pak01_dir.vpk),
// and the audio language that makes Dota read the folder (AUDIO).
export function backgroundInstaller({ file, folder }, language = lang) {
  const m = texts(language), b = m.background;
  const script = FRAME(m, b.title, `
  $file = ${quote(file)}; $folder = ${quote(folder)}
  $dota = Find-Dota
  Write-Host ("Dota 2: " + $dota)
  Wait-DotaClosed
${AUDIO(b)}
  $target = Join-Path $dota ('game\\' + $folder)
  $dest = Join-Path $target $file
  $backup = $dest + '.gridstudio-backup'
  if ($Remove) {
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }
    if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $dest -Force; Write-Host ${quote(b.restored)} }
    Restore-Audio
    Write-Host ${quote(b.removed)} -ForegroundColor Green
  } else {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    if ((Test-Path -LiteralPath $dest) -and -not (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $dest -Destination $backup -Force; Write-Host (${quote(b.kept[0])} + $file + ${quote(b.kept[1])}) }
    Copy-Item -LiteralPath (Join-Path $here $file) -Destination $dest -Force
    Write-Host (${quote(b.done)} + $dest) -ForegroundColor Green
    Set-RussianAudio
    Write-Host ''
    Write-Host ${quote(b.launch)}
    Write-Host ${quote(b.after)}
  }`);
  return [
    { name: 'gridstudio-background.ps1', data: withBOM(script) },
    { name: b.install, data: launcher('gridstudio-background.ps1') },
    { name: b.remove, data: launcher('gridstudio-background.ps1', true) }
  ];
}

// The font: every file of ./fonts replaces the game's file of that name; the originals go to
// panorama/fonts/gridstudio-backup once (a second install keeps the first backup).
export function fontInstaller(language = lang) {
  const m = texts(language), f = m.font;
  const script = FRAME(m, f.title, `
  $dota = Find-Dota
  Write-Host ("Dota 2: " + $dota)
  Wait-DotaClosed
  $fonts = Join-Path $dota 'game\\dota\\panorama\\fonts'
  $backup = Join-Path $fonts 'gridstudio-backup'
  if ($Remove) {
    if (-not (Test-Path -LiteralPath $backup)) { throw ${quote(f.noBackup)} }
    Get-ChildItem -LiteralPath $backup -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $fonts $_.Name) -Force }
    Remove-Item -LiteralPath $backup -Recurse -Force
    Write-Host ${quote(f.restored)} -ForegroundColor Green
  } else {
    $ours = Get-ChildItem -LiteralPath (Join-Path $here 'fonts') -File
    if (-not (Test-Path -LiteralPath $backup)) {
      New-Item -ItemType Directory -Force -Path $backup | Out-Null
      foreach ($font in $ours) { $original = Join-Path $fonts $font.Name; if (Test-Path -LiteralPath $original) { Copy-Item -LiteralPath $original -Destination $backup -Force } }
      Write-Host ${quote(f.saved)}
    }
    foreach ($font in $ours) { Copy-Item -LiteralPath $font.FullName -Destination (Join-Path $fonts $font.Name) -Force }
    Write-Host (${quote(f.done[0])} + $ours.Count + ${quote(f.done[1])} + $fonts) -ForegroundColor Green
    Write-Host ${quote(f.after)}
  }
  # fontconfig's cache would keep the old fonts: the game rebuilds it.
  if ($env:TEMP) { $cache = Join-Path $env:TEMP 'fontconfig'; if (Test-Path -LiteralPath $cache) { Remove-Item -LiteralPath $cache -Recurse -Force -ErrorAction SilentlyContinue } }`);
  return [
    { name: 'gridstudio-font.ps1', data: withBOM(script) },
    { name: f.install, data: launcher('gridstudio-font.ps1') },
    { name: f.remove, data: launcher('gridstudio-font.ps1', true) }
  ];
}
