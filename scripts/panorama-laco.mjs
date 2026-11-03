// Dota 2's compiled Panorama resources in the current format (what resourcecompiler writes in 2026,
// Workshop Tools and d2pfx's compiler alike), written without Valve's tools. The classic format
// (scripts/vpk.mjs: a REDI block plus the source text in DATA) still loads, but a layout in it on a
// new path crashes the game once it has an event handler (onactivate=…) or non-ASCII text, while
// compiled layouts with both work. A resource is the usual header and block table, then
//   RED2 — the edit info (inputs, compiler versions, referenced files) as binary KeyValues3;
//   DATA — layouts: a 6-byte stub (the source CRC, no images); styles: the CRC, no images and the
//          minified CSS; scripts: the source text as it is;
//   LaCo — layouts only: the XML's syntax tree as binary KeyValues3;
//   SrMa — styles only: where each piece of the minified CSS came from in the source.
// The binary KeyValues3 layout (version 5) follows Source 2 Viewer's reader; the choices Valve's
// writer makes (string order, which array encoding, the header's counts, when to compress) were read
// off 1633 compiled layouts, 1753 styles and 143 scripts of published mods: decoding and re-encoding
// them gives back their bytes (the check is described in tests/panorama-laco.test.cjs).
//   https://github.com/ValveResourceFormat/ValveResourceFormat (BinaryKV3.cs, PanoramaLayout.cs, ResourceEditInfo2.cs)
//   LZ4 block format: https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md
import { crc32, concat } from './vpk.mjs';

const encoder = new TextEncoder(), decoder = new TextDecoder();
const text = (value) => encoder.encode(value);

// ---------------------------------------------------------------------------------------------
// LZ4 blocks. Valve compresses each KeyValues3 buffer with LZ4HC at its highest level (12: the
// optimal parser, 16384 searches, full update), and the compressor here is lz4hc.c's
// (LZ4HC_compress_optimal, v1.9.4) step for step, because only the same steps give the same bytes
// (liblz4 1.9.4 at level 12 reproduces every buffer of the mods above; lower levels and the fast
// compressor do not).

const MINMATCH = 4, LASTLITERALS = 5, MFLIMIT = 12, MAX_DISTANCE = 65535;
const OPT_NUM = 4096, TRAILING_LITERALS = 3, SEARCHES = 16384, SUFFICIENT_LENGTH = OPT_NUM - 1;
// Positions are indexed from 64 KB on, as a fresh LZ4HC state does, so an empty hash slot (0) is
// out of reach.
const BASE = 65536;

export function lz4Compress(src) {
  const n = src.length, out = new Uint8Array(n + Math.floor(n / 255) + 16);
  const hashTable = new Uint32Array(1 << 15), chainTable = new Uint16Array(1 << 16);
  const read32 = (p) => (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0;
  const hashAt = (p) => Math.imul(read32(p), 2654435761) >>> 17;
  let nextToUpdate = BASE;
  const insert = (ip) => {
    for (let index = nextToUpdate; index < ip + BASE; index++) {
      const h = hashAt(index - BASE);
      chainTable[index & 0xffff] = Math.min(index - hashTable[h], MAX_DISTANCE);
      hashTable[h] = index;
    }
    nextToUpdate = ip + BASE;
  };
  const count = (a, b, limit) => { let k = 0; while (a + k < limit && src[a + k] === src[b + k]) k++; return k; };
  const patternByte = (pattern, k) => (pattern >>> ((k & 3) * 8)) & 0xff;
  const countPattern = (p, limit, pattern) => { let k = 0; while (p + k < limit && src[p + k] === patternByte(pattern, k)) k++; return k; };
  const countPatternBack = (p, pattern) => { let k = 0; while (p - k > 0 && src[p - k - 1] === patternByte(pattern, 3 - k)) k++; return k; };

  // LZ4HC_InsertAndGetWiderMatch as the optimal parser calls it (no look-back, pattern analysis and
  // chain swapping on, no dictionary): the longest match at ip longer than minLength, or null.
  const longerMatch = (ip, limit, minLength) => {
    const ipIndex = ip + BASE, lowest = ipIndex - BASE <= MAX_DISTANCE ? BASE : ipIndex - MAX_DISTANCE, pattern = read32(ip);
    let longest = minLength, matchAt = 0, attempts = SEARCHES, chainOffset = 0, repeat = 0, sourcePattern = 0;
    insert(ip);
    let index = hashTable[hashAt(ip)];
    while (index >= lowest && attempts > 0) {
      attempts--;
      let length = 0;
      const at = index - BASE;
      if (src[ip + longest - 1] === src[at + longest - 1] && src[ip + longest] === src[at + longest] && read32(at) === pattern) {
        length = MINMATCH + count(ip + MINMATCH, at + MINMATCH, limit);
        if (length > longest) { longest = length; matchAt = at; }
      }
      // A match as long as the best: follow whichever of its positions has the farthest next candidate.
      if (length === longest && index + longest <= ipIndex) {
        let distance = 1, step = 1, accel = 16;
        for (let k = 0; k < longest - MINMATCH + 1; k += step) {
          const candidate = chainTable[(index + k) & 0xffff];
          step = accel++ >> 4;
          if (candidate > distance) { distance = candidate; chainOffset = k; accel = 16; }
        }
        if (distance > 1) {
          if (distance > index) break;
          index -= distance;
          continue;
        }
      }
      // Runs of one repeated 1, 2 or 4-byte pattern: jump along the run instead of byte by byte.
      if (chainTable[index & 0xffff] === 1 && chainOffset === 0) {
        const candidate = index - 1;
        if (repeat === 0) {
          if ((pattern & 0xffff) === pattern >>> 16 && (pattern & 0xff) === pattern >>> 24) { repeat = 1; sourcePattern = countPattern(ip + 4, limit, pattern) + 4; }
          else repeat = 2;
        }
        if (repeat === 1 && candidate >= lowest && read32(candidate - BASE) === pattern) {
          const forward = countPattern(candidate - BASE + 4, limit, pattern) + 4;
          const back = candidate - Math.max(candidate - countPatternBack(candidate - BASE, pattern), lowest), segment = back + forward;
          if (segment >= sourcePattern && forward <= sourcePattern) index = candidate + forward - sourcePattern;
          else {
            index = candidate - back;
            const most = Math.min(segment, sourcePattern);
            if (longest < most) {
              if (ipIndex - index > MAX_DISTANCE) break;
              longest = most; matchAt = index - BASE;
            }
            const next = chainTable[index & 0xffff];
            if (next > index) break;
            index -= next;
          }
          continue;
        }
      }
      index -= chainTable[(index + chainOffset) & 0xffff];
    }
    return longest > minLength ? { length: longest, offset: ip - matchAt } : null;
  };

  let op = 0, ip = 0, anchor = 0;
  const length = (value) => { for (; value >= 255; value -= 255) out[op++] = 255; out[op++] = value; };
  const sequence = (matchLength, offset) => {
    const token = op++, literals = ip - anchor;
    if (literals >= 15) { out[token] = 0xf0; length(literals - 15); } else out[token] = literals << 4;
    out.set(src.subarray(anchor, ip), op); op += literals;
    out[op++] = offset & 0xff; out[op++] = offset >> 8;
    if (matchLength - MINMATCH >= 15) { out[token] += 15; length(matchLength - MINMATCH - 15); } else out[token] += matchLength - MINMATCH;
    ip += matchLength; anchor = ip;
  };
  // The parser's table: for each position ahead, the cheapest way found to get there.
  const price = new Int32Array(OPT_NUM + TRAILING_LITERALS), off = new Int32Array(OPT_NUM + TRAILING_LITERALS);
  const mlen = new Int32Array(OPT_NUM + TRAILING_LITERALS), litlen = new Int32Array(OPT_NUM + TRAILING_LITERALS);
  const set = (pos, p, o, m, l) => { price[pos] = p; off[pos] = o; mlen[pos] = m; litlen[pos] = l; };
  const literalsPrice = (count) => count + (count >= 15 ? 1 + Math.floor((count - 15) / 255) : 0);
  const sequencePrice = (literals, matchLength) => 3 + literalsPrice(literals) + (matchLength >= 19 ? 1 + Math.floor((matchLength - 19) / 255) : 0);
  const mflimit = n - MFLIMIT, matchLimit = n - LASTLITERALS;
  while (ip <= mflimit) {
    const literals = ip - anchor, first = longerMatch(ip, matchLimit, MINMATCH - 1);
    if (!first) { ip++; continue; }
    if (first.length > SUFFICIENT_LENGTH) { sequence(first.length, first.offset); continue; }
    for (let pos = 0; pos < MINMATCH; pos++) set(pos, literalsPrice(literals + pos), 0, 1, literals + pos);
    for (let m = MINMATCH; m <= first.length; m++) set(m, sequencePrice(literals, m), first.offset, m, literals);
    let last = first.length, cur = 1, bestLength = 0, bestOffset = 0, encodeNow = false;
    const trailing = () => { for (let k = 1; k <= TRAILING_LITERALS; k++) set(last + k, price[last] + literalsPrice(k), 0, 1, k); };
    trailing();
    for (; cur < last; cur++) {
      if (ip + cur > mflimit) break;
      if (price[cur + 1] <= price[cur] && price[cur + MINMATCH] < price[cur] + 3) continue;
      const found = longerMatch(ip + cur, matchLimit, MINMATCH - 1);
      if (!found) continue;
      if (found.length > SUFFICIENT_LENGTH || found.length + cur >= OPT_NUM) {
        bestLength = found.length; bestOffset = found.offset; last = cur + 1; encodeNow = true;
        break;
      }
      const baseLiterals = litlen[cur];
      for (let k = 1; k < MINMATCH; k++) {
        const p = price[cur] - literalsPrice(baseLiterals) + literalsPrice(baseLiterals + k);
        if (p < price[cur + k]) set(cur + k, p, 0, 1, baseLiterals + k);
      }
      for (let m = MINMATCH; m <= found.length; m++) {
        const pos = cur + m;
        let ll, p;
        if (mlen[cur] === 1) { ll = litlen[cur]; p = (cur > ll ? price[cur - ll] : 0) + sequencePrice(ll, m); }
        else { ll = 0; p = price[cur] + sequencePrice(0, m); }
        if (pos > last + TRAILING_LITERALS || p <= price[pos]) {
          if (m === found.length && last < pos) last = pos;
          set(pos, p, found.offset, m, ll);
        }
      }
      trailing();
    }
    if (!encodeNow) { bestLength = mlen[last]; bestOffset = off[last]; cur = last - bestLength; }
    // Walk back from the end along the cheapest path, then write it forwards.
    for (let pos = cur, m = bestLength, o = bestOffset; ;) {
      const nextLength = mlen[pos], nextOffset = off[pos];
      mlen[pos] = m; off[pos] = o; m = nextLength; o = nextOffset;
      if (nextLength > pos) break;
      pos -= nextLength;
    }
    for (let pos = 0; pos < last;) {
      if (mlen[pos] === 1) { ip++; pos++; continue; }
      const m = mlen[pos], o = off[pos];
      pos += m;
      sequence(m, o);
    }
  }
  const rest = n - anchor;
  if (rest >= 15) { out[op++] = 0xf0; length(rest - 15); } else out[op++] = rest << 4;
  out.set(src.subarray(anchor), op);
  return out.slice(0, op + rest);
}

export function lz4Decompress(src, size) {
  const out = new Uint8Array(size);
  let i = 0, o = 0;
  while (i < src.length) {
    const token = src[i++];
    let literals = token >> 4;
    if (literals === 15) for (let b = 255; b === 255;) { b = src[i++]; literals += b; }
    out.set(src.subarray(i, i + literals), o); i += literals; o += literals;
    if (i >= src.length) break;
    const offset = src[i] | (src[i + 1] << 8); i += 2;
    let matched = token & 15;
    if (matched === 15) for (let b = 255; b === 255;) { b = src[i++]; matched += b; }
    matched += MINMATCH;
    if (!offset || offset > o) throw new Error('LZ4: ссылка за начало данных.');
    for (let k = 0; k < matched; k++, o++) out[o] = out[o - offset];
  }
  if (o !== size) throw new Error(`LZ4: распаковано ${o} байт вместо ${size}.`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Binary KeyValues3, version 5. Plain JavaScript values map to the types Valve's files use most:
// objects, arrays, strings, booleans, null and 32-bit integers (other numbers become doubles). Any
// other type goes through KV3Value (kv3.uint32(0), kv3.int64(0), kv3.resourceName('…')), and the
// reader gives those back the same way, so decoding and encoding again keeps every type.

const T = {
  NULL: 1, BOOLEAN: 2, INT64: 3, UINT64: 4, DOUBLE: 5, STRING: 6, BLOB: 7, ARRAY: 8, OBJECT: 9, ARRAY_TYPED: 10,
  INT32: 11, UINT32: 12, TRUE: 13, FALSE: 14, INT64_ZERO: 15, INT64_ONE: 16, DOUBLE_ZERO: 17, DOUBLE_ONE: 18,
  FLOAT: 19, INT16: 20, UINT16: 21, INT8: 22, UINT8: 23, ARRAY_BYTE_LENGTH: 24, ARRAY_AUXILIARY: 25, UINT32_ZERO: 26, UINT32_ONE: 27
};
// Scalars with a payload: [lane width, DataView setter/getter suffix]. Only these are packed into the
// auxiliary buffer when they fill a typed array.
const PAYLOAD = {
  [T.BOOLEAN]: [1, 'Uint8'], [T.INT8]: [1, 'Int8'], [T.UINT8]: [1, 'Uint8'], [T.INT16]: [2, 'Int16'], [T.UINT16]: [2, 'Uint16'],
  [T.INT32]: [4, 'Int32'], [T.UINT32]: [4, 'Uint32'], [T.FLOAT]: [4, 'Float32'],
  [T.INT64]: [8, 'BigInt64'], [T.UINT64]: [8, 'BigUint64'], [T.DOUBLE]: [8, 'Float64']
};
// Value types without a plain JavaScript counterpart, and the constants Valve writes for 0 and 1.
const TYPED = {
  int8: [T.INT8], uint8: [T.UINT8], int16: [T.INT16], uint16: [T.UINT16], int32: [T.INT32], float: [T.FLOAT],
  uint32: [T.UINT32, T.UINT32_ZERO, T.UINT32_ONE], int64: [T.INT64, T.INT64_ZERO, T.INT64_ONE], uint64: [T.UINT64],
  double: [T.DOUBLE, T.DOUBLE_ZERO, T.DOUBLE_ONE], string: [T.STRING], boolean: [T.BOOLEAN]
};
const TYPE_NAME = Object.fromEntries(Object.entries(TYPED).flatMap(([name, types]) => types.map((type) => [type, name])));
export const KV3_FLAGS = { resource: 1, resource_name: 2, panorama: 3, soundevent: 4, subclass: 5, entity_name: 6 };
// "generic" in Valve's list of KeyValues3 formats ({7412167c-06e9-4698-aff2-e63eb59037e7}); every block here uses it.
const GENERIC_FORMAT = Uint8Array.from([0x7c, 0x16, 0x12, 0x74, 0xe9, 0x06, 0x98, 0x46, 0xaf, 0xf2, 0xe6, 0x3e, 0xb5, 0x90, 0x37, 0xe7]);
const TRAILER = 0xffeedd00;

export class KV3Value {
  constructor(type, value, flag = 0) {
    if (!TYPED[type]) throw new Error(`KV3: неизвестный тип ${type}.`);
    if (typeof flag === 'string' && !KV3_FLAGS[flag]) throw new Error(`KV3: неизвестный флаг ${flag}.`);
    this.type = type; this.value = value; this.flag = (typeof flag === 'string' ? KV3_FLAGS[flag] : flag) || 0;
  }
}
export const kv3 = Object.fromEntries(Object.keys(TYPED).map((type) => [type, (value, flag) => new KV3Value(type, value, flag)]));
kv3.resourceName = (value) => new KV3Value('string', value, 'resource_name');

// The binary type of a value: { type, flag, value } — value is what goes into a lane, if anything.
function classify(value) {
  if (value === null) return { type: T.NULL, flag: 0 };
  if (value === true) return { type: T.TRUE, flag: 0 };
  if (value === false) return { type: T.FALSE, flag: 0 };
  if (typeof value === 'string') return { type: T.STRING, flag: 0, value };
  if (typeof value === 'number') return Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff ? { type: T.INT32, flag: 0, value } : { type: T.DOUBLE, flag: 0, value };
  if (typeof value === 'bigint') return { type: T.INT64, flag: 0, value };
  if (value instanceof KV3Value) {
    if (value.type === 'boolean') return { type: value.value ? T.TRUE : T.FALSE, flag: value.flag };
    const [type, zero, one] = TYPED[value.type], number = typeof value.value === 'bigint' ? Number(value.value) : value.value;
    if (zero && number === 0 && !Object.is(number, -0)) return { type: zero, flag: value.flag };
    if (one && number === 1) return { type: one, flag: value.flag };
    return { type, flag: value.flag, value: value.value };
  }
  if (Array.isArray(value)) return { type: T.ARRAY, flag: 0, value };
  if (value instanceof Uint8Array) throw new Error('KV3: двоичные блоки не поддерживаются.');
  if (typeof value === 'object') return { type: T.OBJECT, flag: 0, value };
  throw new Error(`KV3: значение ${String(value)} не записать.`);
}

// A growing little-endian lane of one width.
class Lane {
  constructor(width) { this.width = width; this.bytes = new Uint8Array(64); this.view = new DataView(this.bytes.buffer); this.length = 0; }
  put(kind, value) {
    if (this.length + this.width > this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2); grown.set(this.bytes);
      this.bytes = grown; this.view = new DataView(grown.buffer);
    }
    if (kind.startsWith('Big')) value = BigInt(value);
    this.view[`set${kind}`](this.length, value, true);
    this.length += this.width;
  }
  get data() { return this.bytes.subarray(0, this.length); }
}
const lanes = () => ({ 1: new Lane(1), 2: new Lane(2), 4: new Lane(4), 8: new Lane(8) });

// compression: 'lz4' (Valve's choice; buffers under 256 bytes in all are stored as they are, as in
// Valve's files: the largest stored one has 255, the smallest compressed one 281) or 'none'.
export function kv3Encode(root, { compression = 'lz4' } = {}) {
  const strings = new Map(), main = lanes(), aux = lanes(), types = [], objectLengths = [];
  const count = { members: 0, objects: 0, arrays: 0, auxiliary: 0, elements: 0 };
  const stringId = (value) => {
    if (value === '') return -1;
    if (!strings.has(value)) strings.set(value, strings.size);
    return strings.get(value);
  };
  // The encoding of an array: typed when every element has the same binary type (packed in the
  // auxiliary buffer for numbers, a byte for the length under 256), a list of typed elements when
  // empty or mixed.
  const arrayType = (items) => {
    if (!items.length) return { kind: T.ARRAY };
    const first = typeOf(items[0]);
    for (let i = 1; i < items.length; i++) { const next = typeOf(items[i]); if (next.type !== first.type || next.flag !== first.flag) return { kind: T.ARRAY }; }
    return { kind: items.length >= 256 ? T.ARRAY_TYPED : PAYLOAD[first.type] ? T.ARRAY_AUXILIARY : T.ARRAY_BYTE_LENGTH, element: first };
  };
  const arrays = new WeakMap();
  const typeOf = (value) => {
    if (!Array.isArray(value)) return classify(value);
    if (!arrays.has(value)) { const { kind, element } = arrayType(value); arrays.set(value, { type: kind, flag: 0, element }); }
    return arrays.get(value);
  };
  const putType = ({ type, flag }) => { if (flag) types.push(type | 0x80, flag); else types.push(type); };
  // Writes a value's payload (its type is already written) into `lane` (the main or auxiliary lanes).
  const payload = (value, info, lane) => {
    if (PAYLOAD[info.type]) { const [width, kind] = PAYLOAD[info.type]; lane[width].put(kind, info.type === T.BOOLEAN ? (info.value ? 1 : 0) : info.value); return; }
    switch (info.type) {
      case T.STRING: main[4].put('Int32', stringId(info.value)); return;
      case T.OBJECT: {
        const entries = Object.entries(value);
        count.objects++; count.members += entries.length;
        objectLengths.push(entries.length);
        for (const [key, member] of entries) {
          main[4].put('Int32', stringId(key));
          const memberInfo = typeOf(member);
          putType(memberInfo);
          payload(member, memberInfo, main);
        }
        return;
      }
      case T.ARRAY: case T.ARRAY_TYPED: case T.ARRAY_BYTE_LENGTH: case T.ARRAY_AUXILIARY: {
        if (info.type === T.ARRAY_AUXILIARY) count.auxiliary++;
        else { count.arrays++; count.elements += Math.max(1, value.length); }
        if (info.type === T.ARRAY) {
          main[4].put('Int32', value.length);
          for (const item of value) { const itemInfo = typeOf(item); putType(itemInfo); payload(item, itemInfo, main); }
          return;
        }
        if (info.type === T.ARRAY_TYPED) main[4].put('Int32', value.length); else main[1].put('Uint8', value.length);
        putType(info.element);
        for (const item of value) payload(item, typeOf(item), info.type === T.ARRAY_AUXILIARY ? aux : main);
        return;
      }
    }
  };
  const rootInfo = typeOf(root);
  putType(rootInfo);
  payload(root, rootInfo, main);

  // Buffer 0: the strings, then the auxiliary lanes, the string count leading the 4-byte one.
  // Buffer 1: object member counts, the main lanes, the types and the trailer. Lanes start on their
  // width, empty lanes take no room.
  const stringBytes = concat([...strings.keys()].flatMap((value) => [text(value), new Uint8Array(1)]));
  const auxInts = new Lane(4); auxInts.put('Int32', strings.size);
  const buffer0 = pack([stringBytes, aux[1].data], [aux[2].data, concat([auxInts.data, aux[4].data]), aux[8].data]);
  const lengths = new Uint8Array(objectLengths.length * 4), lengthsView = new DataView(lengths.buffer);
  objectLengths.forEach((value, index) => lengthsView.setInt32(index * 4, value, true));
  const tail = new Uint8Array(types.length + 4);
  tail.set(types); new DataView(tail.buffer).setUint32(types.length, TRAILER, true);
  const buffer1 = pack([lengths, main[1].data], [main[2].data, main[4].data, main[8].data], tail);

  let compressed0 = buffer0, compressed1 = buffer1, method = 0;
  if (compression === 'lz4') {
    if (buffer0.length + buffer1.length >= 256) { compressed0 = lz4Compress(buffer0); compressed1 = lz4Compress(buffer1); method = 1; }
  } else if (compression !== 'none') throw new Error(`KV3: сжатие ${compression} не поддерживается.`);

  const header = new Uint8Array(0x78), view = new DataView(header.buffer);
  const u32 = (at, value) => view.setUint32(at, value, true), u16 = (at, value) => view.setUint16(at, value, true);
  u32(0x00, 0x4b563305);
  header.set(GENERIC_FORMAT, 0x04);
  u32(0x14, method);
  u16(0x18, 0); u16(0x1a, method ? 16384 : 0);              // dictionary id, LZ4 frame size
  u32(0x1c, stringBytes.length + aux[1].length);              // buffer 0 lanes: 1, 4 and 8 bytes
  u32(0x20, 1 + aux[4].length / 4);
  u32(0x24, aux[8].length / 8);
  u32(0x28, types.length);
  u16(0x2c, Math.min(count.objects, 0xffff)); u16(0x2e, Math.min(count.arrays + count.auxiliary, 0xffff));
  u32(0x30, buffer0.length + buffer1.length);
  u32(0x34, compressed0.length + compressed1.length);
  u32(0x38, 0); u32(0x3c, 0);                                 // no binary blobs
  u32(0x40, aux[2].length / 2);
  u32(0x44, 0);
  u32(0x48, buffer0.length); u32(0x4c, method ? compressed0.length : 0);
  u32(0x50, buffer1.length); u32(0x54, method ? compressed1.length : 0);
  u32(0x58, main[1].length); u32(0x5c, main[2].length / 2); u32(0x60, main[4].length / 4); u32(0x64, main[8].length / 8);
  // Allocation hints: the root and every object member; objects; arrays and their elements, an empty
  // one counting one, the auxiliary ones left out of both.
  u32(0x68, 1 + count.members); u32(0x6c, count.objects); u32(0x70, count.arrays); u32(0x74, count.elements);
  return concat([header, compressed0, compressed1]);
}
// Lanes one after another, each aligned to its width ([1-byte parts], [2, 4, 8-byte lanes], tail).
function pack(bytes, wider, tail = new Uint8Array(0)) {
  const parts = [...bytes];
  let size = parts.reduce((sum, part) => sum + part.length, 0);
  wider.forEach((lane, index) => {
    if (!lane.length) return;
    const width = 2 << index, padding = ((size + width - 1) & -width) - size;
    parts.push(new Uint8Array(padding), lane); size += padding + lane.length;
  });
  parts.push(tail);
  return concat(parts);
}

export function kv3Decode(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (at) => view.getUint32(at, true), u16 = (at) => view.getUint16(at, true);
  if (u32(0) !== 0x4b563305) throw new Error('KV3: поддерживается только двоичная версия 5.');
  const method = u32(0x14);
  if (u32(0x38)) throw new Error('KV3: двоичные блоки не поддерживаются.');
  const [d0, c0, d1, c1] = [u32(0x48), u32(0x4c), u32(0x50), u32(0x54)];
  let buffer0, buffer1;
  if (method === 0) { buffer0 = bytes.subarray(0x78, 0x78 + d0); buffer1 = bytes.subarray(0x78 + d0, 0x78 + d0 + d1); }
  else if (method === 1) { buffer0 = lz4Decompress(bytes.subarray(0x78, 0x78 + c0), d0); buffer1 = lz4Decompress(bytes.subarray(0x78 + c0, 0x78 + c0 + c1), d1); }
  else throw new Error(`KV3: сжатие ${method} не поддерживается.`);
  const align = (at, width, count) => (count ? (at + width - 1) & -width : at);
  const cursors = (buffer, at, counts) => {
    const lane = { view: new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength) };
    [1, 2, 4, 8].forEach((width, index) => { at = align(at, width, counts[index]); lane[width] = at; at += counts[index] * width; });
    lane.end = at;
    return lane;
  };
  const auxiliary = cursors(buffer0, 0, [u32(0x1c), u32(0x40), u32(0x20), u32(0x24)]);
  const objects = u32(0x6c), main = cursors(buffer1, objects * 4, [u32(0x58), u32(0x5c), u32(0x60), u32(0x64)]);
  const stringCount = auxiliary.view.getInt32(auxiliary[4], true); auxiliary[4] += 4;
  const strings = [];
  for (let i = 0, at = auxiliary[1]; i < stringCount; i++) {
    const end = buffer0.indexOf(0, at);
    strings.push(decoder.decode(buffer0.subarray(at, end)));
    auxiliary[1] = at = end + 1;
  }
  let typeAt = main.end, objectAt = 0;
  const typesEnd = typeAt + u32(0x28);
  const readType = () => {
    let type = buffer1[typeAt++], flag = 0;
    if (type & 0x80) flag = buffer1[typeAt++];
    if (type & 0x40) typeAt++;
    return [type & 0x3f, flag];
  };
  const read = (lane, width, kind) => { const value = lane.view[`get${kind}`](lane[width], true); lane[width] += width; return value; };
  const value = (type, flag, lane) => {
    const wrap = (name, raw) => new KV3Value(name, typeof raw === 'bigint' && Number.isSafeInteger(Number(raw)) ? Number(raw) : raw, flag);
    if (PAYLOAD[type]) {
      const [width, kind] = PAYLOAD[type], raw = read(lane, width, kind);
      if (type === T.INT32 && !flag) return raw;
      if (type === T.BOOLEAN && !flag) return raw !== 0;
      if (type === T.DOUBLE && !flag && !Number.isInteger(raw)) return raw;
      return wrap(TYPE_NAME[type], type === T.BOOLEAN ? raw !== 0 : raw);
    }
    switch (type) {
      case T.NULL: return null;
      case T.TRUE: case T.FALSE: return flag ? wrap('boolean', type === T.TRUE) : type === T.TRUE;
      case T.INT64_ZERO: case T.INT64_ONE: return wrap('int64', type - T.INT64_ZERO);
      case T.DOUBLE_ZERO: case T.DOUBLE_ONE: return wrap('double', type - T.DOUBLE_ZERO);
      case T.UINT32_ZERO: case T.UINT32_ONE: return wrap('uint32', type - T.UINT32_ZERO);
      case T.STRING: { const id = read(main, 4, 'Int32'), string = id >= 0 && id < strings.length ? strings[id] : ''; return flag ? wrap('string', string) : string; }
      case T.OBJECT: {
        const size = main.view.getInt32(objectAt, true), object = {};
        objectAt += 4;
        for (let i = 0; i < size; i++) {
          const key = strings[read(main, 4, 'Int32')], [memberType, memberFlag] = readType();
          object[key] = value(memberType, memberFlag, main);
        }
        return object;
      }
      case T.ARRAY: {
        const size = read(main, 4, 'Int32'), array = [];
        for (let i = 0; i < size; i++) { const [itemType, itemFlag] = readType(); array.push(value(itemType, itemFlag, main)); }
        return array;
      }
      case T.ARRAY_TYPED: case T.ARRAY_BYTE_LENGTH: case T.ARRAY_AUXILIARY: {
        const size = type === T.ARRAY_TYPED ? read(main, 4, 'Int32') : read(main, 1, 'Uint8');
        const [itemType, itemFlag] = readType(), array = [];
        for (let i = 0; i < size; i++) array.push(value(itemType, itemFlag, type === T.ARRAY_AUXILIARY ? auxiliary : main));
        return array;
      }
      default: throw new Error(`KV3: неизвестный тип ${type}.`);
    }
  };
  const [rootType, rootFlag] = readType();
  const root = value(rootType, rootFlag, main);
  if (typeAt !== typesEnd || main.view.getUint32(typesEnd, true) !== TRAILER) throw new Error('KV3: данные не сошлись с заголовком.');
  return root;
}

// ---------------------------------------------------------------------------------------------
// Resources: the header (file size, header version 12, resource version, block table) and blocks
// on 16 bytes, nothing after the last one.

export function readResource(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = view.getUint32(12, true), blocks = [];
  for (let i = 0; i < count; i++) {
    const at = 16 + i * 12, offset = at + 4 + view.getUint32(at + 4, true);
    blocks.push([decoder.decode(bytes.subarray(at, at + 4)), bytes.subarray(offset, offset + view.getUint32(at + 8, true))]);
  }
  return { version: view.getUint16(6, true), blocks };
}
export function writeResource(version, blocks) {
  const align = (n) => (n + 15) & ~15, places = [];
  let size = 16 + blocks.length * 12;
  for (const [, data] of blocks) { size = align(size); places.push(size); size += data.length; }
  const out = new Uint8Array(size), view = new DataView(out.buffer);
  view.setUint32(0, size, true);
  view.setUint16(4, 12, true);
  view.setUint16(6, version, true);
  view.setUint32(8, 8, true);
  view.setUint32(12, blocks.length, true);
  blocks.forEach(([name, data], index) => {
    const at = 16 + index * 12;
    out.set(text(name), at);
    view.setUint32(at + 4, places[index] - (at + 4), true);
    view.setUint32(at + 8, data.length, true);
    out.set(data, places[index]);
  });
  return out;
}

// The edit info as resourcecompiler writes it for Panorama: the compiled file (optional, missing)
// and its source with the source's CRC, sorted by name; the compiler's version; the files the
// resource refers to, sorted. searchPath is the addon the file was compiled in ('dota_addons/<addon>'
// for Workshop Tools; Valve's own files say 'dota'); the game does not look at any of it (mods ship
// layouts under other names than their RED2 says).
const COMPILERS = {
  layout: { compiled: 'vxml', source: 'xml', resourceVersion: 3, identifier: 'CompilePanorama', versions: { 'Panorama Layout Compiler Version': 16 } },
  style: { compiled: 'vcss', source: 'css', resourceVersion: 3, identifier: 'CompilePanorama', versions: { 'Panorama Style Compiler Version': 11 } },
  script: { compiled: 'vjs', source: 'js', resourceVersion: 4, identifier: 'CompileJavaScript', versions: { 'JavaScript Compiler Version': 4 } },
  // Valve's TypeScript pages (.vts_c, 2026-11-02 for the pick screen's script): the same JavaScript in DATA; the edit
  // info names the TypeScript source. The game reads only DATA (d2pfx's TikTok Overlay rewrites just that block).
  typescript: { compiled: 'vts', source: 'ts', resourceVersion: 4, identifier: 'CompileTypeScript', versions: { 'JavaScript Compiler Version': 4 } }
};
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function editInfo2({ path, kind, sourceCRC, searchPath = 'dota_addons/gridstudio', references = [] }) {
  const compiler = COMPILERS[kind], stem = path.replace(/\.[^./]+$/, '');
  const input = (name, crc, source) => ({
    m_RelativeFilename: name, m_SearchPath: searchPath, m_nFileCRC: kv3.uint32(crc),
    m_bOptional: !source, m_bFileExists: source, m_bIsGameFile: false
  });
  const special = { ...compiler.versions, 'Panorama Preprocessor Presence/Version': 0 };
  return {
    m_InputDependencies: [input(`${stem}.${compiler.compiled}`, 0, false), input(`${stem}.${compiler.source}`, sourceCRC, true)]
      .sort((a, b) => byName(a.m_RelativeFilename, b.m_RelativeFilename)),
    m_AdditionalInputDependencies: [],
    m_ArgumentDependencies: [{ m_ParameterName: '___OverrideInputData___', m_ParameterType: 'BinaryBlobArg', m_nFingerprint: kv3.uint32(0), m_nFingerprintDefault: kv3.uint32(0) }],
    m_SpecialDependencies: Object.keys(special).sort(byName).map((name) => ({
      m_String: name, m_CompilerIdentifier: compiler.identifier, m_nFingerprint: kv3.uint32(special[name]), m_nUserData: kv3.uint32(0)
    })),
    m_SpecialInputDependencies: [],
    m_AdditionalRelatedFiles: [],
    m_ChildResourceList: [],
    m_WeakReferenceList: [...new Set(references)].sort(byName).map(kv3.resourceName),
    m_SearchableUserData: { IsChildResource: kv3.int64(0) },
    m_SubassetReferences: null,
    m_SubassetDefinitions: null
  };
}

// ---------------------------------------------------------------------------------------------
// Layouts. The tree: { m_AST: { m_pRoot } }, nodes { eType, name?, child | vecChildren, sourceLineColumn? }
// — one sub-node goes in `child`, several in `vecChildren`, none in neither. ROOT's children are
// STYLES and SCRIPTS (INCLUDE nodes), SNIPPETS (SNIPPET nodes) and the PANEL; a PANEL's are its
// attributes (PANEL_ATTRIBUTE → PANEL_ATTRIBUTE_VALUE, or REFERENCE_COMPILED for s2r://… and
// REFERENCE_PASSTHROUGH for file://…, the scheme cut off; an empty value has no name) and then its
// child panels, all in source order. Elements carry [line, column] of their tag name, both counted
// from 1, the column in bytes (a tab is one); ROOT carries an empty list, attributes nothing.

// The XML's elements: { name, attributes: [[name, value]], children, line, column }. Comments, the
// declaration and whitespace go; text and inline scripts are refused (Panorama takes text in
// attributes, scripts by include).
function parseXML(source) {
  let at = 0, line = 1, lineStart = 0;
  const fail = (message) => { throw new Error(`XML, строка ${line}: ${message}`); };
  const advance = (to) => {
    for (let i = source.indexOf('\n', at); i >= 0 && i < to; i = source.indexOf('\n', i + 1)) { line++; lineStart = i + 1; }
    at = to;
  };
  const skip = (pattern) => { pattern.lastIndex = at; const m = pattern.exec(source); if (m) advance(at + m[0].length); return m; };
  const entities = (value) => value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (whole, name) => {
    const lower = name.toLowerCase();
    if (lower[0] === '#') return String.fromCodePoint(lower[1] === 'x' ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[lower];
  });
  const stack = [{ children: [] }];
  while (at < source.length) {
    const next = source.indexOf('<', at);
    if (next < 0) { if (source.slice(at).trim()) fail('текст вне элементов.'); break; }
    if (source.slice(at, next).trim()) fail('текст внутри элемента: в Panorama текст пишут в атрибуте text.');
    advance(next);
    if (source.startsWith('<!--', at)) { const end = source.indexOf('-->', at + 4); if (end < 0) fail('незакрытый комментарий.'); advance(end + 3); continue; }
    if (source.startsWith('<?', at) || source.startsWith('<!DOCTYPE', at)) { const end = source.indexOf('>', at); advance(end + 1); continue; }
    if (source.startsWith('<![CDATA[', at)) fail('CDATA не поддерживается: скрипты подключают через include.');
    if (source[at + 1] === '/') {
      const m = skip(/<\/([^\s>]+)\s*>/y);
      if (!m) fail('битый закрывающий тег.');
      const open = stack.pop();
      if (!open.name || open.name !== m[1]) fail(`</${m[1]}> не закрывает <${open.name}>.`);
      continue;
    }
    const tag = /<([A-Za-z_][\w.:-]*)/y; tag.lastIndex = at;
    const m = tag.exec(source);
    if (!m) fail('битый тег.');
    const element = { name: m[1], attributes: [], children: [], line, column: encoder.encode(source.slice(lineStart, at + 1)).length + 1 };
    advance(at + m[0].length);
    for (;;) {
      skip(/\s*/y);
      if (skip(/\/>/y)) { stack[stack.length - 1].children.push(element); break; }
      if (skip(/>/y)) { stack[stack.length - 1].children.push(element); stack.push(element); break; }
      const attribute = skip(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y);
      if (!attribute) fail(`битый атрибут в <${element.name}>.`);
      if (element.attributes.some(([name]) => name === attribute[1])) fail(`атрибут ${attribute[1]} дважды в <${element.name}>.`);
      element.attributes.push([attribute[1], entities(attribute[2] ?? attribute[3])]);
    }
  }
  if (stack.length !== 1) fail(`не закрыт <${stack[stack.length - 1].name}>.`);
  if (stack[0].children.length !== 1) fail('нужен ровно один корневой элемент.');
  return stack[0].children[0];
}

const withChildren = (node, children) => {
  if (children.length === 1) node.child = children[0];
  else if (children.length > 1) node.vecChildren = children;
  return node;
};
const attributeValue = (value) => {
  const scheme = /^(s2r|file):\/\//.exec(value);
  if (scheme) return { eType: scheme[1] === 's2r' ? 'REFERENCE_COMPILED' : 'REFERENCE_PASSTHROUGH', name: value.slice(scheme[0].length) };
  return value ? { eType: 'PANEL_ATTRIBUTE_VALUE', name: value } : { eType: 'PANEL_ATTRIBUTE_VALUE' };
};
const position = (element) => [element.line, element.column];
function panelNode(element) {
  const node = { eType: 'PANEL', name: element.name };
  withChildren(node, [
    ...element.attributes.map(([name, value]) => ({ eType: 'PANEL_ATTRIBUTE', name, child: attributeValue(value) })),
    ...element.children.map(panelNode)]);
  node.sourceLineColumn = position(element);
  return node;
}
// XML text → the tree Valve's layout compiler stores in LaCo.
export function layoutTree(xmlText) {
  const root = parseXML(xmlText);
  if (root.name !== 'root') throw new Error('Корневой элемент разметки — <root>.');
  const children = root.children.map((element) => {
    if (element.name === 'styles' || element.name === 'scripts') {
      const includes = element.children.map((include) => {
        if (include.name !== 'include') throw new Error(`В <${element.name}> бывает только <include>, а не <${include.name}>.`);
        const src = include.attributes.find(([name]) => name === 'src');
        if (!src) throw new Error('<include> без src.');
        return { eType: 'INCLUDE', child: attributeValue(src[1]), sourceLineColumn: position(include) };
      });
      return Object.assign(withChildren({ eType: element.name.toUpperCase() }, includes), { sourceLineColumn: position(element) });
    }
    if (element.name === 'snippets') {
      return Object.assign(withChildren({ eType: 'SNIPPETS' }, element.children.map((snippet) => {
        if (snippet.name !== 'snippet') throw new Error(`В <snippets> бывает только <snippet>, а не <${snippet.name}>.`);
        const name = snippet.attributes.find(([key]) => key === 'name')?.[1];
        const node = name ? { eType: 'SNIPPET', name } : { eType: 'SNIPPET' };
        return Object.assign(withChildren(node, snippet.children.map(panelNode)), { sourceLineColumn: position(snippet) });
      })), { sourceLineColumn: position(element) });
    }
    return panelNode(element);
  });
  return { m_AST: { m_pRoot: Object.assign(withChildren({ eType: 'ROOT' }, children), { sourceLineColumn: [] }) } };
}

// The tree back to XML. positioned: each element at the line and column it came from (blank lines
// and spaces in between), so compiling the text again gives the very same tree.
export function layoutXML(tree, { positioned = false } = {}) {
  const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;');
  const kids = (node) => node.vecChildren ?? (node.child ? [node.child] : []);
  const value = (node) => node.eType === 'REFERENCE_COMPILED' ? `s2r://${node.name}` : node.eType === 'REFERENCE_PASSTHROUGH' ? `file://${node.name}` : node.name ?? '';
  let out = '', line = 1, column = 1;
  const put = (piece) => {
    out += piece;
    const lastBreak = piece.lastIndexOf('\n');
    if (lastBreak >= 0) { line += piece.split('\n').length - 1; column = encoder.encode(piece.slice(lastBreak + 1)).length + 1; }
    else column += encoder.encode(piece).length;
  };
  const place = (node, depth) => {
    const [targetLine, targetColumn] = node.sourceLineColumn ?? [];
    if (positioned && targetLine) {
      if (targetLine > line) put('\n'.repeat(targetLine - line));
      if (targetLine !== line || targetColumn - 1 < column) throw new Error(`Не поставить элемент на ${targetLine}:${targetColumn}.`);
      put(' '.repeat(targetColumn - 1 - column));
    } else put((out ? '\n' : '') + '\t'.repeat(depth));
  };
  const element = (tag, attributes, children, node, depth) => {
    place(node, depth);
    put(`<${tag}${attributes.map(([name, text]) => ` ${name}="${escape(text)}"`).join('')}`);
    if (!children.length) { put(' />'); return; }
    put('>');
    for (const child of children) emit(child, depth + 1);
    if (!positioned) put('\n' + '\t'.repeat(depth));
    put(`</${tag}>`);
  };
  const emit = (node, depth) => {
    switch (node.eType) {
      case 'ROOT': return element('root', [], kids(node), node, depth);
      case 'STYLES': case 'SCRIPTS': case 'SNIPPETS': return element(node.eType.toLowerCase(), [], kids(node), node, depth);
      case 'INCLUDE': return element('include', [['src', value(node.child)]], [], node, depth);
      case 'SNIPPET': return element('snippet', node.name === undefined ? [] : [['name', node.name]], kids(node), node, depth);
      case 'PANEL': {
        const all = kids(node);
        return element(node.name, all.filter((kid) => kid.eType === 'PANEL_ATTRIBUTE').map((kid) => [kid.name, value(kid.child)]), all.filter((kid) => kid.eType !== 'PANEL_ATTRIBUTE'), node, depth);
      }
      default: throw new Error(`Неизвестный узел разметки ${node.eType}.`);
    }
  };
  emit(tree.m_AST.m_pRoot, 0);
  return out + '\n';
}

const referencesOf = (tree) => {
  const found = [];
  const walk = (node) => {
    if (node.eType === 'REFERENCE_COMPILED') found.push(node.name);
    for (const kid of node.vecChildren ?? (node.child ? [node.child] : [])) walk(kid);
  };
  walk(tree.m_AST.m_pRoot);
  return found;
};

// path: the compiled file's path in the game (panorama/layout/x.vxml_c); xmlText: the layout.
export function lacoLayout(path, xmlText, { searchPath } = {}) {
  if (!path.endsWith('.vxml_c')) throw new Error(`Не разметка Panorama: ${path}`);
  const tree = layoutTree(xmlText), sourceCRC = crc32(text(xmlText));
  return compiledLayout(path, tree, { searchPath, sourceCRC });
}
// The same from a tree (lacoRead's), with the source CRC it was compiled from.
export function compiledLayout(path, tree, { searchPath, sourceCRC = 0 } = {}) {
  const stub = new Uint8Array(6);
  new DataView(stub.buffer).setUint32(0, sourceCRC, true);
  const red2 = editInfo2({ path, kind: 'layout', sourceCRC, searchPath, references: referencesOf(tree) });
  return writeResource(COMPILERS.layout.resourceVersion, [['RED2', kv3Encode(red2)], ['DATA', stub], ['LaCo', kv3Encode(tree)]]);
}
// A compiled layout (either format) → { tree, xml, red2 }; the classic format has no tree.
export function lacoRead(bytes) {
  const blocks = Object.fromEntries(readResource(bytes).blocks);
  const red2 = blocks.RED2 ? kv3Decode(blocks.RED2) : null;
  if (!blocks.LaCo) return { tree: null, xml: decoder.decode(blocks.DATA.subarray(6)), red2 };
  const tree = kv3Decode(blocks.LaCo);
  return { tree, xml: layoutXML(tree), red2, sourceCRC: new DataView(blocks.DATA.buffer, blocks.DATA.byteOffset).getUint32(0, true) };
}

// ---------------------------------------------------------------------------------------------
// Styles. resourcecompiler minifies the CSS: comments go, a selector loses its extra whitespace
// (none around commas) and is followed by {, a declaration is `name:` and its value, every
// declaration ends in ;. A value keeps the source's whitespace, each run as one space, and is cut
// into pieces at whitespace, (, ), & and : (a comma stays with the word before it); url( "…" ) is
// `url(`, the string and `)`. SrMa's DBITSLC lists, for each piece, its byte offset in the minified
// text and the line and column (from 1, in bytes) it starts at in the source — ; and } point back
// at their declaration and rule, the ) of url( at the url. The same rules give back the minified
// text and map of all 1742 non-empty styles above (rebuilt from the map, since their sources are
// not published); an empty style has DBITSLC null.
export function minifyStyle(source) {
  const lineStarts = [0];
  for (let i = source.indexOf('\n'); i >= 0; i = source.indexOf('\n', i + 1)) lineStarts.push(i + 1);
  const where = (index) => {
    let low = 0, high = lineStarts.length - 1;
    while (low < high) { const mid = (low + high + 1) >> 1; if (lineStarts[mid] <= index) low = mid; else high = mid - 1; }
    return [low + 1, encoder.encode(source.slice(lineStarts[low], index)).length + 1];
  };
  let css = '', size = 0, i = 0;
  const map = [], n = source.length;
  const emit = (piece, from) => { map.push([size, ...where(from)]); css += piece; size += encoder.encode(piece).length; };
  const space = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  // Whitespace and comments: where they started, or -1.
  const gap = () => {
    const start = i;
    for (;;) {
      if (i < n && space(source[i])) i++;
      else if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; }
      else return i > start ? start : -1;
    }
  };
  const quoted = () => { const quote = source[i++]; while (i < n && source[i] !== quote) i += source[i] === '\\' ? 2 : 1; i++; };
  const tidy = (head) => head.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').replace(/ ?, ?/g, ',').trim();
  // Text up to one of `stops` outside strings, comments and parentheses.
  const upTo = (stops) => {
    const start = i;
    for (let depth = 0; i < n;) {
      const c = source[i];
      if (c === '"' || c === "'") { quoted(); continue; }
      if (source.startsWith('/*', i)) { gap(); continue; }
      if (c === '(') depth++; else if (c === ')') depth--; else if (!depth && stops.includes(c)) break;
      i++;
    }
    return source.slice(start, i);
  };
  const end = () => i >= n || source[i] === ';' || source[i] === '}';
  const value = () => {
    for (;;) {
      const blank = gap();
      if (blank >= 0) emit(' ', blank);
      if (end()) return;
      const at = i, c = source[i];
      if (/^url\(/i.test(source.slice(i, i + 4))) {
        emit(source.slice(i, i + 4), at); i += 4; gap();
        const from = i;
        if (source[i] === '"' || source[i] === "'") quoted(); else while (i < n && source[i] !== ')' && !space(source[i])) i++;
        emit(source.slice(from, i), from); gap();
        if (source[i] === ')') i++;
        emit(')', at);
      } else if ('()&:'.includes(c)) { emit(c, at); i++; }
      else if (c === '"' || c === "'") { quoted(); emit(source.slice(at, i), at); }
      else {
        while (i < n && !space(source[i]) && !'()&:;}"\''.includes(source[i]) && !source.startsWith('/*', i)) i++;
        emit(source.slice(at, i), at);
      }
    }
  };
  const statement = (at, head) => { emit(head, at); value(); emit(';', at); if (source[i] === ';') i++; };
  const declarations = () => {
    for (;;) {
      gap();
      if (i >= n || source[i] === '}') return;
      if (source[i] === ';') { i++; continue; }
      const at = i, name = upTo(':;}');
      if (source[i] === ':') { i++; statement(at, tidy(name) + ':'); }
    }
  };
  const block = (at, head, inside) => { emit(`${tidy(head)}{`, at); i++; inside(); emit('}', at); if (source[i] === '}') i++; };
  const rules = (nested) => {
    for (;;) {
      gap();
      if (i >= n || (nested && source[i] === '}')) return;
      const at = i;
      if (source[i] === '}' || source[i] === ';') { i++; continue; }
      if (source.startsWith('@import', i)) { i += 7; gap(); statement(at, '@import '); continue; }
      if (source.startsWith('@define', i)) {
        const head = upTo(':;{}');
        if (source[i] === ':') { i++; statement(at, tidy(head) + ':'); }
        continue;
      }
      const head = upTo('{};');
      if (source[i] === '{') block(at, head, source[at] === '@' ? () => rules(true) : declarations);
      else if (source[at] === '@') emit(`${tidy(head)};`, at);
    }
  };
  rules(false);
  return { css, map };
}

// path: the compiled file's path (panorama/styles/x.vcss_c); cssText: the style sheet. DATA's CRC is
// the source's CRC xor the minified text's (so it is the source's for an empty style), and the
// referenced files are the s2r:// urls left in the minified text. sourceCRC: only to rebuild a
// compiled file whose exact source is not at hand.
export function newStyle(path, cssText, { searchPath, sourceCRC } = {}) {
  if (!path.endsWith('.vcss_c')) throw new Error(`Не стиль Panorama: ${path}`);
  const { css, map } = minifyStyle(cssText), body = text(css);
  sourceCRC ??= crc32(text(cssText));
  const data = new Uint8Array(6 + body.length);
  new DataView(data.buffer).setUint32(0, (sourceCRC ^ crc32(body)) >>> 0, true);
  data.set(body, 6);
  const references = [...css.matchAll(/s2r:\/\/([^"')\s]+)/g)].map((match) => match[1]);
  const red2 = editInfo2({ path, kind: 'style', sourceCRC, searchPath, references });
  return writeResource(COMPILERS.style.resourceVersion, [['RED2', kv3Encode(red2)], ['DATA', data], ['SrMa', kv3Encode({ DBITSLC: css ? map : null })]]);
}

// ---------------------------------------------------------------------------------------------
// Scripts: resource version 4, where DATA is the source text alone (no CRC, no image table).
export function newScript(path, jsText, { searchPath } = {}) {
  const kind = path.endsWith('.vjs_c') ? 'script' : path.endsWith('.vts_c') ? 'typescript' : null;
  if (!kind) throw new Error(`Не скрипт Panorama: ${path}`);
  const body = text(jsText);
  const red2 = editInfo2({ path, kind, sourceCRC: crc32(body), searchPath });
  return writeResource(COMPILERS[kind].resourceVersion, [['RED2', kv3Encode(red2)], ['DATA', body]]);
}
