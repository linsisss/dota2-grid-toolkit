// KeyValues3 text (Source 2's format for decompiled particle systems, materials and model data)
// to plain JavaScript values. Flagged values (resource:"…", soundevent:"…") keep only the value;
// binary blobs (#[ … ]) become { $binary: hex }.
const TOKEN = /\s+|\/\/[^\n]*|<!--[\s\S]*?-->|"""([\s\S]*?)"""|"((?:[^"\\]|\\.)*)"|#\[([0-9A-Fa-f\s]*)\]|([[\]{}=,])|([A-Za-z_][A-Za-z0-9_]*:)|([^\s[\]{}=,"]+)/y;

function* tokens(text) {
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const at = TOKEN.lastIndex, m = TOKEN.exec(text);
    if (!m) throw new Error(`KV3: неожиданный символ на позиции ${at}: ${JSON.stringify(text.slice(at, at + 30))}`);
    if (m[1] !== undefined) yield ['str', m[1]];
    else if (m[2] !== undefined) yield ['str', m[2].replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c)];
    else if (m[3] !== undefined) yield ['bin', m[3].replace(/\s+/g, '')];
    else if (m[4]) yield [m[4]];
    else if (m[5]) yield ['flag'];
    else if (m[6]) yield ['atom', m[6]];
  }
}

export function parseKV3(text) {
  const list = [...tokens(text)];
  let i = 0;
  const value = () => {
    const [type, raw] = list[i++];
    if (type === 'flag') return value();
    if (type === '{') {
      const object = {};
      while (list[i][0] !== '}') {
        const key = list[i++][1];
        if (list[i++][0] !== '=') throw new Error(`KV3: нет «=» после ${key}`);
        object[key] = value();
        if (list[i][0] === ',') i++;
      }
      i++;
      return object;
    }
    if (type === '[') {
      const array = [];
      while (list[i][0] !== ']') { array.push(value()); if (list[i][0] === ',') i++; }
      i++;
      return array;
    }
    if (type === 'str') return raw;
    if (type === 'bin') return { $binary: raw };
    if (type === 'atom') {
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      if (raw === 'null') return null;
      const number = Number(raw);
      return Number.isNaN(number) ? raw : number;
    }
    throw new Error(`KV3: неожиданный токен ${type}`);
  };
  return value();
}
