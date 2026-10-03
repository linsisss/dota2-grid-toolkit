// The sources of visits and sign-ups (server/site-stats.mjs SOURCES): a colour for each, shared by
// «Статистика» and «Пользователи».
export const SOURCE_COLORS = Object.freeze({ telegram: '#2aabee', tiktok: '#ff3b6b', youtube: '#ff5252', google: '#5b8def', yandex: '#fc5a2d', vk: '#3b8bff',
  discord: '#7a83f6', twitch: '#a26bff', steam: '#66c0f4', reddit: '#ff6a2b', bing: '#22b2ef', duckduckgo: '#e2643f', other: '#a39cb4', direct: '#c4b5ed', unknown: '#5d5770' });
export const sourceColor = (key) => SOURCE_COLORS[key] || SOURCE_COLORS.other;
