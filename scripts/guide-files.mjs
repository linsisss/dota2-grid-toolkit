import { readVPK } from './vpk.mjs';

// Files a guide may give to download (asked for on 2026-10-03, after a user said their Steam account
// was stolen: «запрети архивы, exe, ps1 и т. д.»): Dota's and GridStudio's files, text, fonts, pictures,
// sound and video — never an archive, a program or a script. The name's ending is not enough: the
// server reads the file itself (guideFileProblem) — a program or an archive under any name is refused,
// a picture, font, sound, video or VPK must really be one, and a VPK may hold no program, script or
// archive. Shared by the server (server/guides.mjs) and the upload button (src/guides/api.js).
export const GUIDE_FILE_EXTENSIONS = Object.freeze(['json', 'txt', 'cfg', 'ini', 'md', 'kv', 'kv3', 'vpk', 'ttf', 'otf', 'woff', 'woff2',
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'psd', 'mp4', 'webm', 'mp3', 'ogg', 'wav']);
export const GUIDE_FILE_REFUSED = 'Такой файл в гайд не добавить: архивы, программы и скрипты нельзя.';

const starts = (bytes, sig, at = 0) => sig.every((byte, i) => bytes[at + i] === byte);
const ascii = (text) => [...text].map((ch) => ch.charCodeAt(0));
// Programs, archives, installers and shortcuts, by their first bytes.
const FORBIDDEN = [
  ['MZ'], ['\x7fELF'], [[0xcf, 0xfa, 0xed, 0xfe]], [[0xce, 0xfa, 0xed, 0xfe]], [[0xfe, 0xed, 0xfa, 0xce]], [[0xfe, 0xed, 0xfa, 0xcf]], [[0xca, 0xfe, 0xba, 0xbe]],
  ['PK\x03\x04'], ['PK\x05\x06'], ['PK\x07\x08'], [[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]], ['Rar!\x1a\x07'], [[0x1f, 0x8b]], ['BZh'],
  [[0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]], [[0x28, 0xb5, 0x2f, 0xfd]], ['MSCF'], ['ISc('], [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  [[0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00]], ['#!'], ['xar!'], ['!<arch>'], ['ustar', 257], ['CD001', 0x8001], ['CD001', 0x8801],
].map(([sig, at = 0]) => [typeof sig === 'string' ? ascii(sig) : sig, at]);
// What the bytes of each kind must begin with.
const MUST = {
  vpk: [[[0x34, 0x12, 0xaa, 0x55]]],
  ttf: [[[0x00, 0x01, 0x00, 0x00]], [ascii('true')], [ascii('OTTO')], [ascii('ttcf')]], otf: [[ascii('OTTO')], [[0x00, 0x01, 0x00, 0x00]]],
  woff: [[ascii('wOFF')]], woff2: [[ascii('wOF2')]], png: [[[0x89, 0x50, 0x4e, 0x47]]], jpg: [[[0xff, 0xd8, 0xff]]], jpeg: [[[0xff, 0xd8, 0xff]]],
  gif: [[ascii('GIF8')]], webp: [[ascii('RIFF')]], psd: [[ascii('8BPS')]], mp4: [[ascii('ftyp'), 4]], webm: [[[0x1a, 0x45, 0xdf, 0xa3]]],
  mp3: [[ascii('ID3')], [[0xff, 0xfb]], [[0xff, 0xf3]], [[0xff, 0xf2]], [[0xff, 0xfa]]], ogg: [[ascii('OggS')]], wav: [[ascii('RIFF')]],
};
const TEXT = new Set(['json', 'txt', 'cfg', 'ini', 'md', 'kv', 'kv3']);
// Inside a VPK: no programs, scripts (Panorama's too) or archives.
const VPK_FORBIDDEN = /\.(exe|dll|sys|scr|com|bat|cmd|ps1|psm1|psd1|vbs|vbe|js|jse|mjs|ts|wsf|wsh|hta|msi|msp|lnk|url|jar|py|sh|lua|vjs_c|vts_c|zip|7z|rar|cab|gz|tgz|xz|iso|vpk)$/i;

const forbidden = (bytes) => FORBIDDEN.some(([sig, at]) => bytes.length >= at + sig.length && starts(bytes, sig, at));

// Why this file may not go into a guide, or '' if it may. `ext`: its name's ending, lower case.
export function guideFileProblem(bytes, ext) {
  if (!GUIDE_FILE_EXTENSIONS.includes(ext)) return GUIDE_FILE_REFUSED;
  if (forbidden(bytes)) return GUIDE_FILE_REFUSED;
  if (TEXT.has(ext)) return bytes.subarray(0, 65536).includes(0) ? 'Это не текстовый файл, хотя называется так.' : '';
  const must = MUST[ext];
  if (must && !must.some(([sig, at = 0]) => starts(bytes, sig, at))) return `Файл не похож на .${ext} — проверь, что это он.`;
  if (ext === 'vpk') {
    let files;
    try { files = readVPK(bytes).files; } catch { return 'VPK не читается — загрузи файл pak…_dir.vpk целиком.'; }
    if (files.some((file) => VPK_FORBIDDEN.test(file.path) || forbidden(file.data || new Uint8Array()))) return 'В VPK есть программа, скрипт или архив — такой файл в гайд не добавить.';
  }
  return '';
}
