const loaded = (list) => list.length > 0 && list.every((font) => font.status === 'loaded');

// Load before the first canvas labels are drawn; CSS still provides instant fallbacks.
export const gameFontsReady = document.fonts
  .load('600 16px StudioRadiance', 'MID DIFF SUPPORT GRIND /\\|-_')
  .then(loaded)
  .catch(() => false);

// Dota's Korean fallback is 1.2 MB and most grids have no Hangul. The editor
// requests it up front so measured text advances never use a substitute font;
// catalog previews request it only for grids that contain Hangul.
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
export const needsKoreanFont = (text) => HANGUL.test(text);
let koreanFont;
export const koreanFontReady = () =>
  (koreanFont ||= document.fonts
    .load('600 16px StudioDotaKorean', '멈추지')
    .then(loaded)
    .catch(() => false));

export const interfaceFontsReady = Promise.all(
  [400, 500, 700].map((weight) =>
    document.fonts.load(`${weight} 14px "SF Pro Display"`, 'Grid Studio Редактор сетки')
  )
)
  .then((faces) => {
    const loaded =
      faces.flat().every((face) => face.status === 'loaded') &&
      faces.every((list) => list.length > 0);
    if (import.meta.env.DEV)
      console.info(
        `[Grid Studio] SF Pro Display web fonts: ${loaded ? 'loaded (400, 500, 700)' : 'system fallback'}`
      );
    return loaded;
  })
  .catch(() => {
    if (import.meta.env.DEV)
      console.warn('[Grid Studio] Web font unavailable; using system fallback.');
    return false;
  });
