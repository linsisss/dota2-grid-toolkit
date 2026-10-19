// The computer's system, for the install steps (2026-10-19: macOS and Linux left at once — the
// PowerShell commands and the Windows paths said nothing to them). 'windows' | 'mac' | 'linux' | 'phone'.
// Dota runs on all three; the commands are PowerShell, so Windows only.
function detect() {
  const nav = globalThis.navigator;
  if (!nav) return 'windows';
  const platform = String(nav.userAgentData?.platform || nav.platform || ''), agent = String(nav.userAgent || '');
  if (/Android|iPhone|iPad|iPod/i.test(agent) || nav.userAgentData?.mobile || (/Mac/i.test(platform) && nav.maxTouchPoints > 1)) return 'phone';
  if (/Win/i.test(platform)) return 'windows';
  if (/Mac/i.test(platform)) return 'mac';
  if (/Linux|X11|CrOS/i.test(platform) || /Linux|X11/.test(agent)) return 'linux';
  return 'windows';
}
export const SYSTEM = detect();
export const SYSTEM_NAMES = { mac: 'macOS', linux: 'Linux' };
// Not Windows on a computer: the files by hand, with this system's folders.
export const BY_HAND = SYSTEM === 'mac' || SYSTEM === 'linux';
