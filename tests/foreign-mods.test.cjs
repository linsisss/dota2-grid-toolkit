const test = require('node:test');
const assert = require('node:assert/strict');

// 2026-10-22: «худ Флаттершай … в доте багнутый худ» and «фоны с грида лагают, а с фонами из pornfx всё
// нормально». Dota reads every pakNN_dir.vpk in dota_russian; another site's pack (Dota2PornFX's VPKMerge
// pak10) mixes its files with ours. The PowerShell command leaves them alone and names them.
test('the one-file command names other mods in dota_russian and touches none of them', async () => {
  const { customizeScript } = await import('../scripts/installer.mjs');
  const sha256 = 'ab'.repeat(32), url = `https://gridstudio.me/api/catalog/install/file/all-${sha256}`;
  for (const language of ['ru', 'en']) {
    const script = customizeScript({ sha256, size: 1234, url }, { language });
    const block = script.slice(script.indexOf('$foreign = '), script.indexOf("Send-Report 'ok'"));
    assert.ok(block.length > 0, language);
    // Only pakNN_dir.vpk, not Valve's pak01 (the Russian voice-over), not ours.
    assert.match(block, /Where-Object \{ \$_\.Name -match '\^pak\\d\+_dir\\\.vpk\$' -and \$_\.Name -notmatch '\^pak01_' -and \$_\.Name -notmatch \$pattern \}/);
    assert.doesNotMatch(block, /Remove-Item|Move-Item|Rename-Item|Copy-Item/, 'nothing of theirs is moved');
    assert.match(block, language === 'ru' ? /моды не от GridStudio/ : /not from GridStudio/);
    assert.doesNotMatch(block, /[‘’“”]/);
    // Told after the install, before the report.
    assert.ok(script.indexOf('$foreign = ') > script.indexOf('ExtractToFile'));
  }
  // The names it lists, the way PowerShell's -match reads them.
  const { RUSSIAN_FILE } = await import('../scripts/customize-pack.mjs');
  const listed = (name) => /^pak\d+_dir\.vpk$/i.test(name) && !/^pak01_/i.test(name) && !RUSSIAN_FILE.test(name);
  assert.deepEqual(['pak01_dir.vpk', 'pak01_000.vpk', 'pak02_dir.vpk', 'pak04_dir.vpk', 'pak05_dir.vpk', 'pak10_dir.vpk', 'pak10_000.vpk', 'pak75_dir.vpk', 'pak02_dir.vpk.gridstudio-backup', 'gridstudio-installed.txt'].filter(listed),
    ['pak10_dir.vpk', 'pak75_dir.vpk']);
});
