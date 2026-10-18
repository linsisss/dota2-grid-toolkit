// Windows installers: PowerShell scripts fetched by a command (`irm <address> | iex`) for the hero grid
// (gridScript), the menu background (backgroundScript) and the font (fontScript). The background and
// font scripts find Dota 2 by themselves: Steam's path from the registry, every library from
// steamapps/libraryfolders.vdf, the library whose "dota 2 beta" has game/dota/gameinfo.gi; if that
// fails they ask for the folder. Nothing is downloaded or run besides copying; whatever they replace is
// kept for the remove command. The messages follow the page's language (scripts/i18n.mjs).
import { lang } from './i18n.mjs';
import { CUSTOMIZE_LIST } from './customize-pack.mjs';

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

// The console's texts. PowerShell takes typographic quotes (‘ ’ “ ”) for its own, so the English
// ones use none of them, nor apostrophes.
const TEXTS = {
  ru: {
    findFailed: 'Не нашёл Dota 2 автоматически. Выбери папку "dota 2 beta" в окне.',
    folderDialog: 'Папка "dota 2 beta" (Steam -> Dota 2 -> Свойства -> Установленные файлы -> Обзор)',
    notDota: 'Это не папка Dota 2: в ней нет game\\dota\\gameinfo.gi.',
    running: 'Dota 2 запущена. Закрой её и нажми Enter',
    error: 'Ошибка: ',
    background: {
      title: 'фон главного меню Dota 2',
      restored: 'Вернул файл, который был до фона.', removed: 'Фон удалён. Перезапусти Dota 2.',
      kept: ['Старый ', ' сохранён рядом как .gridstudio-backup.'], done: 'Готово: ',
      audio: 'Язык озвучки Dota теперь русский: Dota читает фон только из папки dota_russian. Интерфейс не меняется; если русской озвучки нет, герои говорят по-английски.',
      audioBack: 'Вернул прежний язык озвучки Dota.',
      launch: 'Если в Steam в параметрах запуска Dota 2 есть -language (кроме -language russian), убери его: с ним Dota не читает dota_russian.',
      downloading: 'Скачиваю фон с GridStudio…', expired: 'Команда устарела: она работает 7 дней. Собери фон на сайте ещё раз и скопируй новую команду.',
      offline: 'Не получилось скачать фон. Проверь интернет и вставь команду ещё раз.', broken: 'Фон скачался с ошибкой. Вставь команду ещё раз.',
      restart: 'Перезапусти Dota 2.', back: 'Убрать фон — вставь в PowerShell: '
    },
    grid: {
      title: 'сетка героев Dota 2',
      noSteam: 'Не нашёл Steam. Поставь сетку вручную: на сайте выбери «Файлом вручную».',
      noAccount: 'В Steam нет аккаунтов. Войди в Steam и вставь команду снова.',
      lastAccount: 'Steam закрыт или аккаунт в нём не открыт: ставлю сетку в аккаунт, который был открыт последним.',
      several: 'В этом Steam несколько аккаунтов. Выбери свой:', pick: 'Номер аккаунта',
      account: 'Аккаунт Steam: ', friendCode: 'код друга ',
      kept: 'Прежние сетки сохранены: ', done: 'Готово: ',
      after: 'Запусти Dota 2, открой «Герои» и выбери сетку в списке «Сортировка» внизу слева.',
      back: 'Вернуть прежние сетки — вставь в PowerShell: ',
      noBackup: 'Копий нет: до установки из GridStudio в Dota не было файла с сетками.',
      restored: 'Вернул прежние сетки из копии ', restoredAfter: 'Запусти Dota 2. Вставишь команду ещё раз — вернётся копия ещё раньше, если она есть.',
      broken: 'Сетка скачалась с ошибкой. Вставь команду ещё раз.',
      expired: 'Эта команда устарела: она работает 7 дней. Открой GridStudio и скопируй новую.',
      downloading: 'Скачиваю сетку с GridStudio…', offline: 'Не получилось скачать сетку. Проверь интернет и вставь команду ещё раз.'
    },
    font: {
      title: 'шрифт Dota 2',
      noBackup: 'Нет резервной копии. Верни шрифты проверкой целостности файлов в Steam.', restored: 'Вернул шрифты Dota. Перезапусти Dota 2.',
      saved: 'Шрифты Dota сохранены в panorama\\fonts\\gridstudio-backup.', done: ['Готово, файлов: ', '. Папка: '],
      downloading: 'Скачиваю шрифт с GridStudio…', expired: 'Команда устарела: она работает 7 дней. Скачай шрифт на сайте ещё раз и скопируй новую команду.',
      offline: 'Не получилось скачать шрифт. Проверь интернет и вставь команду ещё раз.', broken: 'Шрифт скачался с ошибкой. Вставь команду ещё раз.', empty: 'В архиве нет шрифтов.',
      after: 'Запусти Dota 2.', back: 'Вернуть шрифты Dota — вставь в PowerShell: '
    },
    all: {
      title: 'фон, интерфейс и шрифт Dota 2',
      downloading: 'Скачиваю сборку с GridStudio…', expired: 'Команда устарела: она работает 7 дней. Собери файл на сайте ещё раз и скопируй новую команду.',
      offline: 'Не получилось скачать сборку. Проверь интернет и вставь команду ещё раз.', broken: 'Сборка скачалась с ошибкой. Вставь команду ещё раз.',
      audio: 'Язык озвучки Dota теперь русский: Dota читает моды только из папки dota_russian. Интерфейс не меняется; если русской озвучки нет, герои говорят по-английски.',
      audioBack: 'Вернул прежний язык озвучки Dota.',
      gone: 'Убрал то, чего больше нет в сборке: ', fonts: 'Шрифты Dota сохранены в panorama\\fonts\\gridstudio-backup.', fontsBack: 'Вернул шрифты Dota.',
      done: 'Готово. Файлов поставлено: ', launch: 'Если в Steam в параметрах запуска Dota 2 есть -language (кроме -language russian), убери его: с ним Dota не читает dota_russian.',
      restart: 'Перезапусти Dota 2.', back: 'Вернуть всё как было — вставь в PowerShell: ',
      removed: 'Всё от GridStudio убрано, файлы Dota на месте. Перезапусти Dota 2.', nothing: 'Нечего убирать: сборка GridStudio не ставилась этой командой.'
    }
  },
  en: {
    findFailed: 'Could not find Dota 2 by itself. Pick the "dota 2 beta" folder in the window.',
    folderDialog: 'The "dota 2 beta" folder (Steam -> Dota 2 -> Properties -> Installed Files -> Browse)',
    notDota: 'This is not the Dota 2 folder: there is no game\\dota\\gameinfo.gi in it.',
    running: 'Dota 2 is running. Close it and press Enter',
    error: 'Error: ',
    background: {
      title: 'Dota 2 main menu background',
      restored: 'Put back the file that was there before the background.', removed: 'Background removed. Restart Dota 2.',
      kept: ['The old ', ' is kept next to it as .gridstudio-backup.'], done: 'Done: ',
      audio: 'Dota audio language is now Russian: Dota reads the background only from the dota_russian folder. The interface stays as it was; without the Russian voice pack, heroes keep speaking English.',
      audioBack: 'Put back the Dota audio language from before.',
      launch: 'If Dota 2 has -language in its Steam launch options (other than -language russian), remove it: with it, Dota does not read dota_russian.',
      downloading: 'Downloading the background from GridStudio...', expired: 'This command is out of date: it works for 7 days. Build the background on the site again and copy the new command.',
      offline: 'Could not download the background. Check the internet connection and paste the command again.', broken: 'The background arrived damaged. Paste the command again.',
      restart: 'Restart Dota 2.', back: 'To remove the background, paste into PowerShell: '
    },
    grid: {
      title: 'Dota 2 hero grid',
      noSteam: 'Could not find Steam. Install the grid by hand: on the site, choose "File by hand".',
      noAccount: 'There are no accounts in Steam. Sign in to Steam and paste the command again.',
      lastAccount: 'Steam is closed or no account is open in it: installing into the account that was open last.',
      several: 'This Steam has several accounts. Pick yours:', pick: 'Account number',
      account: 'Steam account: ', friendCode: 'friend code ',
      kept: 'The previous grids are kept: ', done: 'Done: ',
      after: 'Start Dota 2, open Heroes and pick the grid in the Sort list at the bottom left.',
      back: 'To bring the previous grids back, paste into PowerShell: ',
      noBackup: 'There are no copies: Dota had no grid file before the GridStudio install.',
      restored: 'Brought the previous grids back from the copy ', restoredAfter: 'Start Dota 2. Paste the command again to go one more copy back, if there is one.',
      broken: 'The grid arrived damaged. Paste the command again.',
      expired: 'This command is out of date: it works for 7 days. Open GridStudio and copy a new one.',
      downloading: 'Downloading the grid from GridStudio...', offline: 'Could not download the grid. Check the internet connection and paste the command again.'
    },
    font: {
      title: 'Dota 2 font',
      noBackup: 'There is no backup. Get the fonts back with Verify integrity of game files in Steam.', restored: 'Dota fonts are back. Restart Dota 2.',
      saved: 'Dota fonts are saved in panorama\\fonts\\gridstudio-backup.', done: ['Done, files: ', '. Folder: '],
      downloading: 'Downloading the font from GridStudio...', expired: 'This command is out of date: it works for 7 days. Download the font on the site again and copy the new command.',
      offline: 'Could not download the font. Check the internet connection and paste the command again.', broken: 'The font arrived damaged. Paste the command again.', empty: 'There are no fonts in the archive.',
      after: 'Start Dota 2.', back: 'To get the Dota fonts back, paste into PowerShell: '
    },
    all: {
      title: 'Dota 2 background, interface and font',
      downloading: 'Downloading the build from GridStudio...', expired: 'This command is out of date: it works for 7 days. Make the file on the site again and copy the new command.',
      offline: 'Could not download the build. Check the internet connection and paste the command again.', broken: 'The build arrived damaged. Paste the command again.',
      audio: 'Dota audio language is now Russian: Dota reads mods only from the dota_russian folder. The interface stays as it was; without the Russian voice pack, heroes keep speaking English.',
      audioBack: 'Put back the Dota audio language from before.',
      gone: 'Took away what is no longer in the build: ', fonts: 'Dota fonts are saved in panorama\\fonts\\gridstudio-backup.', fontsBack: 'Dota fonts are back.',
      done: 'Done. Files installed: ', launch: 'If Dota 2 has -language in its Steam launch options (other than -language russian), remove it: with it, Dota does not read dota_russian.',
      restart: 'Restart Dota 2.', back: 'To put everything back, paste into PowerShell: ',
      removed: 'Everything from GridStudio is gone, the Dota files are back. Restart Dota 2.', nothing: 'Nothing to take away: no GridStudio build was installed by this command.'
    }
  }
};
const texts = (language) => TEXTS[language === 'en' ? 'en' : 'ru'];

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

// The hero grid by a PowerShell command (the editor's download window, the workshop's «Как
// установить»; docs/steam-folder.md): the page stores the grid on the server for a week
// (server/grid-installs.mjs) and copies GRID_COMMAND(address); the address serves gridScript with the
// grid inside. The script runs in its own scope (& { … }), so the user's PowerShell keeps its
// settings. The account is the one signed in to Steam now (HKCU\Software\Valve\Steam\ActiveProcess
// ActiveUser, a DWORD that can read negative), else the last one that signed in
// (config/loginusers.vdf MostRecent), else the only one in userdata, else the user picks. The file
// goes to userdata/<account>/570/remote/cfg as Dota keeps it; the one it replaces is copied to
// userdata/<account>/570/gridstudio-backup (outside the folder Steam Cloud syncs), and the restore
// command puts the newest copy back. Nothing is downloaded or started.
// Windows PowerShell 5.1 may offer only old TLS versions; the site needs 1.2.
export const installCommand = (url) => `[Net.ServicePointManager]::SecurityProtocol = 'Tls12'; irm ${url} | iex`;
const GRID_STEAM = (m, g) => String.raw`
function Find-Steam {
  $roots = @()
  foreach ($key in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam') {
    $item = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
    if ($item) { foreach ($value in @($item.SteamPath, $item.InstallPath)) { if ($value) { $roots += ($value -replace '/', '\') } } }
  }
  if (${'${env:ProgramFiles(x86)}'}) { $roots += (Join-Path ${'${env:ProgramFiles(x86)}'} 'Steam') }
  foreach ($root in $roots) { if (Test-Path -LiteralPath (Join-Path $root 'userdata')) { return $root } }
  throw ${quote(g.noSteam)}
}
function Read-SteamUsers($steam) {
  $users = @{}
  $vdf = Join-Path $steam 'config\loginusers.vdf'
  if (-not (Test-Path -LiteralPath $vdf)) { return $users }
  $text = [IO.File]::ReadAllText($vdf)
  foreach ($match in [regex]::Matches($text, '"(\d{17})"\s*\{([^}]*)\}')) {
    $id = [string]([int64]$match.Groups[1].Value - [int64]76561197960265728)
    $body = $match.Groups[2].Value
    $name = [regex]::Match($body, '(?i)"PersonaName"\s+"([^"]*)"').Groups[1].Value
    $users[$id] = @{ Name = $name; Recent = ($body -match '(?i)"MostRecent"\s+"1"') }
  }
  return $users
}
function Find-Account($steam, $users) {
  $process = Get-ItemProperty -Path 'HKCU:\Software\Valve\Steam\ActiveProcess' -ErrorAction SilentlyContinue
  $active = [int64]0
  if ($process -and $process.ActiveUser) { $active = [int64]$process.ActiveUser; if ($active -lt 0) { $active += [int64]4294967296 } }
  if ($active -gt 0) { return [string]$active }
  foreach ($id in @($users.Keys)) { if ($users[$id].Recent) { Write-Host ${quote(g.lastAccount)}; return $id } }
  $folders = @(Get-ChildItem -LiteralPath (Join-Path $steam 'userdata') -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^[1-9][0-9]*$' })
  if ($folders.Count -eq 0) { throw ${quote(g.noAccount)} }
  if ($folders.Count -eq 1) { return $folders[0].Name }
  Write-Host ${quote(g.several)}
  for ($i = 0; $i -lt $folders.Count; $i++) {
    $id = $folders[$i].Name
    $label = ''
    if ($users.ContainsKey($id) -and $users[$id].Name) { $label = $users[$id].Name + ' - ' }
    Write-Host ('  ' + ($i + 1) + ') ' + $label + ${quote(g.friendCode)} + $id)
  }
  while ($true) {
    $pick = Read-Host ${quote(g.pick)}
    if ($pick -match '^[0-9]+$' -and [int]$pick -ge 1 -and [int]$pick -le $folders.Count) { return $folders[[int]$pick - 1].Name }
  }
}
function Start-Grid([scriptblock]$work) {
  try {
    $steam = Find-Steam
    $users = Read-SteamUsers $steam
    $account = Find-Account $steam $users
    $label = ''
    if ($users.ContainsKey($account) -and $users[$account].Name) { $label = $users[$account].Name + ' - ' }
    Write-Host ('Steam: ' + $steam)
    Write-Host (${quote(g.account)} + $label + ${quote(g.friendCode)} + $account)
    while (Get-Process -Name dota2 -ErrorAction SilentlyContinue) { Read-Host ${quote(m.running)} | Out-Null }
    $root = Join-Path $steam ('userdata\' + $account + '\570')
    & $work (Join-Path $root 'remote\cfg') (Join-Path $root 'gridstudio-backup')
  } catch {
    Write-Host ''
    Write-Host (${quote(m.error)} + $_.Exception.Message) -ForegroundColor Red
  }
}`;
const gridFrame = (g, body) => `# GridStudio — ${g.title}. https://gridstudio.me
& {
$ErrorActionPreference = 'Stop'
${body}
}
`;

// The install script for one grid (until 03.10.2026 the grid was inside the script, on one line in a
// here-string — a PowerShell that read the page in a wrong encoding broke its letters). Now, as with the
// background, the script downloads the hero_grid_config.json the page sent (server/grid-installs.mjs,
// …/install/file/grid-<id>) as bytes and checks its size and SHA-256 (DOWNLOAD), so the encoding plays no
// part. `restore`: the restore command's address, printed at the end.
export function gridScript({ url, sha256, size }, { restore = '', language = lang } = {}) {
  if (!validDownload(sha256, size, url)) throw new Error('Unknown grid file.');
  const m = texts(language), g = m.grid;
  return gridFrame(g, `${GRID_STEAM(m, g)}
\$ProgressPreference = 'SilentlyContinue'
${DOWNLOAD({ sha256, size, url, ext: 'json' }, g)}
Start-Grid {
  param($cfg, $backups)
  $file = Get-Pack
  try {
    $dest = Join-Path $cfg 'hero_grid_config.json'
    New-Item -ItemType Directory -Force -Path $cfg | Out-Null
    if (Test-Path -LiteralPath $dest) {
      New-Item -ItemType Directory -Force -Path $backups | Out-Null
      $copy = Join-Path $backups ('hero_grid_config-' + (Get-Date -Format 'yyyy-MM-dd_HH-mm-ss') + '.json')
      Copy-Item -LiteralPath $dest -Destination $copy -Force
      Write-Host (${quote(g.kept)} + $copy)
    }
    Copy-Item -LiteralPath $file -Destination $dest -Force
    Write-Host (${quote(g.done)} + $dest) -ForegroundColor Green
    Write-Host ''
    Write-Host ${quote(g.after)}
${restore ? `    Write-Host (${quote(g.back)} + ${quote(installCommand(restore))})\n` : ''}  } finally { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
}`);
}
// Puts the newest copy back (and drops it: the next run goes one copy further back).
export function gridRestoreScript(language = lang) {
  const m = texts(language), g = m.grid;
  return gridFrame(g, `${GRID_STEAM(m, g)}
Start-Grid {
  param($cfg, $backups)
  $dest = Join-Path $cfg 'hero_grid_config.json'
  $last = Get-ChildItem -LiteralPath $backups -Filter 'hero_grid_config-*.json' -File -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
  if (-not $last) { throw ${quote(g.noBackup)} }
  New-Item -ItemType Directory -Force -Path $cfg | Out-Null
  Copy-Item -LiteralPath $last.FullName -Destination $dest -Force
  Remove-Item -LiteralPath $last.FullName -Force
  Write-Host (${quote(g.restored)} + $last.Name) -ForegroundColor Green
  Write-Host ${quote(g.restoredAfter)}
}`);
}
// What an out-of-date address answers: a line that says so, not an error page PowerShell would run.
export function gridExpiredScript(language = lang) {
  return `# GridStudio\nWrite-Host ${quote(texts(language).grid.expired)} -ForegroundColor Red\n`;
}

// The menu background by a PowerShell command (/background, «Командой PowerShell»; until 03.10.2026 the
// page saved the pack and the script looked for it in Downloads): the page uploads the pack to the site
// (server/install-packs.mjs, kept a week) and copies the command; its address carries the pack's SHA-256
// and size. The script downloads exactly that file from GridStudio (DOWNLOAD), checks it, finds Dota
// through Steam, puts it into game/dota_russian as pak02_dir.vpk (a file it replaces is kept as
// .gridstudio-backup), makes Russian the audio language (AUDIO) and deletes the downloaded file.
export const PACK_NAME = (sha256) => `gridstudio-background-${sha256.slice(0, 8)}.vpk`;
// The pack the page uploaded with the command, downloaded into %TEMP%; it counts only with the size and
// SHA-256 the address carries. A gone one (404) means an out-of-date command. Defines Get-Pack, which
// returns the file's path.
const DOWNLOAD = ({ sha256, size, url, ext }, x) => String.raw`function Get-Pack {
  $file = Join-Path ([IO.Path]::GetTempPath()) ('gridstudio-' + [guid]::NewGuid().ToString('N') + '.${ext}')
  Write-Host ${quote(x.downloading)}
  try { Invoke-WebRequest -Uri '${url}' -OutFile $file -UseBasicParsing }
  catch {
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 404) { throw ${quote(x.expired)} }
    throw ${quote(x.offline)}
  }
  if ((Get-Item -LiteralPath $file).Length -ne ${size} -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne '${sha256.toUpperCase()}') {
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
    throw ${quote(x.broken)}
  }
  return $file
}`;
const validDownload = (sha256, size, url) => /^[0-9a-f]{64}$/.test(sha256) && Number.isSafeInteger(size) && size > 0 && /^https?:\/\/[A-Za-z0-9.:-]+\/[A-Za-z0-9/._-]+$/.test(String(url));
// `url`: where the uploaded pack is (…/api/catalog/install/file/bg-<sha256>).
export function backgroundScript({ sha256, size, url }, { remove = '', language = lang } = {}) {
  if (!validDownload(sha256, size, url)) throw new Error('Unknown background file.');
  const m = texts(language), b = m.background;
  return gridFrame(b, String.raw`$ProgressPreference = 'SilentlyContinue'
${FIND_DOTA(m)}
${DOWNLOAD({ sha256, size, url, ext: 'vpk' }, b)}
$pack = $null
try {
  $pack = Get-Pack
  $dota = Find-Dota
  Write-Host ('Dota 2: ' + $dota)
  Wait-DotaClosed
${AUDIO(b)}
  $target = Join-Path $dota 'game\dota_russian'
  $dest = Join-Path $target 'pak02_dir.vpk'
  $backup = $dest + '.gridstudio-backup'
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  if ((Test-Path -LiteralPath $dest) -and -not (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $dest -Destination $backup -Force; Write-Host (${quote(b.kept[0])} + 'pak02_dir.vpk' + ${quote(b.kept[1])}) }
  Copy-Item -LiteralPath $pack -Destination $dest -Force
  Write-Host (${quote(b.done)} + $dest) -ForegroundColor Green
  Set-RussianAudio
  Write-Host ''
  Write-Host ${quote(b.launch)}
  Write-Host ${quote(b.restart)}
${remove ? `  Write-Host (${quote(b.back)} + ${quote(installCommand(remove))})\n` : ''}} catch {
  Write-Host ''
  Write-Host (${quote(m.error)} + $_.Exception.Message) -ForegroundColor Red
} finally { if ($pack) { Remove-Item -LiteralPath $pack -Force -ErrorAction SilentlyContinue } }`);
}
// Takes the background away: the file goes, the one it replaced and the audio language come back.
export function backgroundRemoveScript(language = lang) {
  const m = texts(language), b = m.background;
  return gridFrame(b, String.raw`${FIND_DOTA(m)}
try {
  $dota = Find-Dota
  Write-Host ('Dota 2: ' + $dota)
  Wait-DotaClosed
${AUDIO(b)}
  $dest = Join-Path $dota 'game\dota_russian\pak02_dir.vpk'
  $backup = $dest + '.gridstudio-backup'
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }
  if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $dest -Force; Write-Host ${quote(b.restored)} }
  Restore-Audio
  Write-Host ${quote(b.removed)} -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host (${quote(m.error)} + $_.Exception.Message) -ForegroundColor Red
}`);
}

// The font by a PowerShell command (/background?tab=font, «Командой PowerShell»; it was a zip with .bat
// files until 02.10.2026, found in Downloads until 03.10.2026): as with the background, the page uploads
// the archive (server/install-packs.mjs) and the address carries its SHA-256 and size. The script
// downloads it (DOWNLOAD), finds Dota, and puts every fonts/<name>.otf|ttf
// of the archive over the game's file of that name in game/dota/panorama/fonts; the originals go to
// panorama/fonts/gridstudio-backup once (a second install keeps the first backup). Then fontconfig's
// cache in %TEMP% goes, or it would keep the old fonts (the game rebuilds it).
export const FONT_NAME = (sha256) => `gridstudio-font-${sha256.slice(0, 8)}.zip`;
const FONT_CACHE = String.raw`  if ($env:TEMP) { $cache = Join-Path $env:TEMP 'fontconfig'; if (Test-Path -LiteralPath $cache) { Remove-Item -LiteralPath $cache -Recurse -Force -ErrorAction SilentlyContinue } }`;
// `url`: where the uploaded archive is (…/api/catalog/install/file/font-<sha256>).
export function fontScript({ sha256, size, url }, { remove = '', language = lang } = {}) {
  if (!validDownload(sha256, size, url)) throw new Error('Unknown font archive.');
  const m = texts(language), f = m.font;
  return gridFrame(f, String.raw`$ProgressPreference = 'SilentlyContinue'
${FIND_DOTA(m)}
${DOWNLOAD({ sha256, size, url, ext: 'zip' }, f)}
$pack = $null
try {
  $pack = Get-Pack
  $dota = Find-Dota
  Write-Host ('Dota 2: ' + $dota)
  Wait-DotaClosed
  $fonts = Join-Path $dota 'game\dota\panorama\fonts'
  $backup = Join-Path $fonts 'gridstudio-backup'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($pack)
  try {
    $ours = @($archive.Entries | Where-Object { $_.FullName -match '^fonts/[A-Za-z0-9._-]+\.(otf|ttf)$' })
    if ($ours.Count -eq 0) { throw ${quote(f.empty)} }
    if (-not (Test-Path -LiteralPath $backup)) {
      New-Item -ItemType Directory -Force -Path $backup | Out-Null
      foreach ($entry in $ours) { $original = Join-Path $fonts $entry.Name; if (Test-Path -LiteralPath $original) { Copy-Item -LiteralPath $original -Destination $backup -Force } }
      Write-Host ${quote(f.saved)}
    }
    foreach ($entry in $ours) { [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $fonts $entry.Name), $true) }
  } finally { $archive.Dispose() }
${FONT_CACHE}
  Write-Host (${quote(f.done[0])} + $ours.Count + ${quote(f.done[1])} + $fonts) -ForegroundColor Green
  Write-Host ''
  Write-Host ${quote(f.after)}
${remove ? `  Write-Host (${quote(f.back)} + ${quote(installCommand(remove))})\n` : ''}} catch {
  Write-Host ''
  Write-Host (${quote(m.error)} + $_.Exception.Message) -ForegroundColor Red
} finally { if ($pack) { Remove-Item -LiteralPath $pack -Force -ErrorAction SilentlyContinue } }`);
}
// Puts the game's fonts back from the backup and drops it.
export function fontRemoveScript(language = lang) {
  const m = texts(language), f = m.font;
  return gridFrame(f, String.raw`${FIND_DOTA(m)}
try {
  $dota = Find-Dota
  Write-Host ('Dota 2: ' + $dota)
  Wait-DotaClosed
  $fonts = Join-Path $dota 'game\dota\panorama\fonts'
  $backup = Join-Path $fonts 'gridstudio-backup'
  if (-not (Test-Path -LiteralPath $backup)) { throw ${quote(f.noBackup)} }
  Get-ChildItem -LiteralPath $backup -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $fonts $_.Name) -Force }
  Remove-Item -LiteralPath $backup -Recurse -Force
${FONT_CACHE}
  Write-Host ${quote(f.restored)} -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host (${quote(m.error)} + $_.Exception.Message) -ForegroundColor Red
}`);
}

// The one file of the customization page (scripts/customize-pack.mjs, /background «Командой PowerShell»):
// the zip the page uploaded, by its SHA-256 and size (DOWNLOAD), installed in one go. Files for
// game/dota_russian (pak02, pak03, pak04 of the d2pfx mods, the cursor's) go there — a file one replaces is kept once beside it as
// .gridstudio-backup, as the background's script does — and their list is kept in CUSTOMIZE_LIST: the next
// install takes away the files of the last one it does not have (and puts back what they replaced), so
// what the page shows «как в Dota» is Dota's again. The fonts go over Valve's in game/dota/panorama/fonts,
// each original kept once in gridstudio-backup; Valve's come back for the ones no longer chosen. Russian
// becomes the audio language while anything lies in dota_russian (AUDIO).
const RUSSIAN_PATTERN = "'^(pak0[234]_dir\\.vpk|resource/cursor/[a-z0-9_]+\\.(bmp|res))$'";
const CUSTOMIZE_COMMON = (a) => String.raw`
  $russian = Join-Path $dota 'game\dota_russian'
  $fonts = Join-Path $dota 'game\dota\panorama\fonts'
  $fontBackup = Join-Path $fonts 'gridstudio-backup'
  $list = Join-Path $russian '${CUSTOMIZE_LIST}'
  $pattern = ${RUSSIAN_PATTERN}
  $lines = @()
  if (Test-Path -LiteralPath $list) { $lines = @([IO.File]::ReadAllLines($list)) }
  $before = @($lines | Where-Object { $_ -match $pattern })
  $hadFonts = $lines -contains '#fonts'
  function Remove-Ours([string]$rel) {
    $dest = Join-Path $russian ($rel -replace '/', '\')
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }
    $backup = $dest + '.gridstudio-backup'
    if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $dest -Force }
  }
  function Restore-Fonts([string[]]$keep) {
    if (-not (Test-Path -LiteralPath $fontBackup)) { return }
    Get-ChildItem -LiteralPath $fontBackup -File | Where-Object { $keep -notcontains $_.Name } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $fonts $_.Name) -Force }
    if ($env:TEMP) { $cache = Join-Path $env:TEMP 'fontconfig'; if (Test-Path -LiteralPath $cache) { Remove-Item -LiteralPath $cache -Recurse -Force -ErrorAction SilentlyContinue } }
  }`;
export function customizeScript({ sha256, size, url }, { remove = '', language = lang } = {}) {
  if (!validDownload(sha256, size, url)) throw new Error('Unknown customization file.');
  const m = texts(language), a = m.all;
  return gridFrame(a, String.raw`$ProgressPreference = 'SilentlyContinue'
${FIND_DOTA(m)}
${DOWNLOAD({ sha256, size, url, ext: 'zip' }, a)}
$pack = $null
try {
  $pack = Get-Pack
  $dota = Find-Dota
  Write-Host ('Dota 2: ' + $dota)
  Wait-DotaClosed
${AUDIO(a)}
${CUSTOMIZE_COMMON(a)}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($pack)
  try {
    $mine = @($archive.Entries | Where-Object { $_.FullName.StartsWith('game/dota_russian/') -and $_.FullName.Substring(18) -match $pattern })
    $ourFonts = @($archive.Entries | Where-Object { $_.FullName -match '^game/dota/panorama/fonts/[a-z0-9._-]+\.otf$' })
    $now = @($mine | ForEach-Object { $_.FullName.Substring(18) })
    $gone = @($before | Where-Object { $now -notcontains $_ })
    foreach ($rel in $gone) { Remove-Ours $rel }
    if ($gone.Count -gt 0) { Write-Host (${quote(a.gone)} + ($gone -join ', ')) }
    foreach ($entry in $mine) {
      $rel = $entry.FullName.Substring(18)
      $dest = Join-Path $russian ($rel -replace '/', '\')
      $backup = $dest + '.gridstudio-backup'
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
      if ((Test-Path -LiteralPath $dest) -and ($before -notcontains $rel) -and -not (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $dest -Destination $backup -Force }
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
      Write-Host ('  dota_russian\' + ($rel -replace '/', '\'))
    }
    $fontNames = @($ourFonts | ForEach-Object { $_.Name })
    if ($ourFonts.Count -gt 0 -or $hadFonts) { Restore-Fonts $fontNames }
    if ($ourFonts.Count -gt 0) {
      New-Item -ItemType Directory -Force -Path $fontBackup | Out-Null
      foreach ($entry in $ourFonts) {
        $original = Join-Path $fonts $entry.Name
        $kept = Join-Path $fontBackup $entry.Name
        if ((Test-Path -LiteralPath $original) -and -not (Test-Path -LiteralPath $kept)) { Copy-Item -LiteralPath $original -Destination $kept -Force }
      }
      foreach ($entry in $ourFonts) { [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $fonts $entry.Name), $true) }
      Write-Host ${quote(a.fonts)}
    } elseif ($hadFonts) {
      Remove-Item -LiteralPath $fontBackup -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host ${quote(a.fontsBack)}
    }
  } finally { $archive.Dispose() }
  $kept = @($now)
  if ($ourFonts.Count -gt 0) { $kept += '#fonts' }
  if ($kept.Count -gt 0) { New-Item -ItemType Directory -Force -Path $russian | Out-Null; [IO.File]::WriteAllLines($list, [string[]]$kept) }
  elseif (Test-Path -LiteralPath $list) { Remove-Item -LiteralPath $list -Force }
  if ($now.Count -gt 0) { Set-RussianAudio } elseif ($before.Count -gt 0) { Restore-Audio }
  Write-Host (${quote(a.done)} + ($now.Count + $ourFonts.Count)) -ForegroundColor Green
  Write-Host ''
  if ($now.Count -gt 0) { Write-Host ${quote(a.launch)} }
  Write-Host ${quote(a.restart)}
${remove ? `  Write-Host (${quote(a.back)} + ${quote(installCommand(remove))})\n` : ''}} catch {
  Write-Host ''
  Write-Host (${quote(m.error)} + $_.Exception.Message) -ForegroundColor Red
} finally { if ($pack) { Remove-Item -LiteralPath $pack -Force -ErrorAction SilentlyContinue } }`);
}
// Takes the whole build away: the files of the list go (what they replaced comes back), Valve's fonts and
// the audio language come back.
export function customizeRemoveScript(language = lang) {
  const m = texts(language), a = m.all;
  return gridFrame(a, String.raw`${FIND_DOTA(m)}
try {
  $dota = Find-Dota
  Write-Host ('Dota 2: ' + $dota)
  Wait-DotaClosed
${AUDIO(a)}
${CUSTOMIZE_COMMON(a)}
  if (-not (Test-Path -LiteralPath $list)) { Write-Host ${quote(a.nothing)}; return }
  foreach ($rel in $before) { Remove-Ours $rel }
  if ($hadFonts) { Restore-Fonts @(); Remove-Item -LiteralPath $fontBackup -Recurse -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $list -Force
  Restore-Audio
  Write-Host ${quote(a.removed)} -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host (${quote(m.error)} + $_.Exception.Message) -ForegroundColor Red
}`);
}
