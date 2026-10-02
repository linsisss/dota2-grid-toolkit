const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

// The donation addresses (src/support.js) are money: each one's checksum is checked, so a slip in an
// edit (a lost or swapped character) fails here instead of sending someone's coins nowhere.
const sha256 = (b) => createHash('sha256').update(b).digest();
// TON user-friendly: 36 bytes = flags, workchain, 32-byte hash, CRC16-XMODEM
function ton(a) {
  const bytes = Buffer.from(a.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (bytes.length !== 36) return 'bad length ' + bytes.length;
  let crc = 0; for (const byte of bytes.subarray(0, 34)) { crc ^= byte << 8; for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff; }
  const ok = crc === bytes.readUInt16BE(34);
  return { ok, testnet: !!(bytes[0] & 0x80), workchain: bytes.readInt8(1) };
}
// TRON: base58check, version 0x41
function tron(a) {
  const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n; for (const c of a) { const i = ALPHA.indexOf(c); if (i < 0) return 'bad char ' + c; n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
  const bytes = Buffer.from(hex, 'hex'); if (bytes.length !== 25) return 'bad length ' + bytes.length;
  const ok = sha256(sha256(bytes.subarray(0, 21))).subarray(0, 4).equals(bytes.subarray(21));
  return { ok, version: bytes[0] };
}
// BTC bech32 / bech32m
function btc(a) {
  const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', s = a.toLowerCase(), pos = s.lastIndexOf('1'), hrp = s.slice(0, pos);
  const data = [...s.slice(pos + 1)].map((c) => CH.indexOf(c)); if (data.includes(-1)) return 'bad char';
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  const polymod = (v) => { let chk = 1; for (const x of v) { const b = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= G[i]; } return chk; };
  const exp = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const pm = polymod([...exp, ...data]);
  return { ok: data[0] === 0 ? pm === 1 : pm === 0x2bc830a3, hrp };
}
// ETH EIP-55 mixed-case checksum (keccak-256, written out)
function keccak256(input) {
  const RC = [1n,0x8082n,0x800000000000808an,0x8000000080008000n,0x808bn,0x80000001n,0x8000000080008081n,0x8000000000008009n,0x8an,0x88n,0x80008009n,0x8000000an,0x8000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,0x800an,0x800000008000000an,0x8000000080008081n,0x8000000000008080n,0x80000001n,0x8000000080008008n];
  const R = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
  const M = (1n << 64n) - 1n, rot = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M;
  const rate = 136, msg = [...input, 0x01]; while (msg.length % rate) msg.push(0); msg[msg.length - 1] |= 0x80;
  const s = Array(25).fill(0n);
  for (let off = 0; off < msg.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) { let v = 0n; for (let j = 7; j >= 0; j--) v = (v << 8n) | BigInt(msg[off + i * 8 + j]); s[i] ^= v; }
    for (let round = 0; round < 24; round++) {
      const C = [0,1,2,3,4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
      const D = [0,1,2,3,4].map((x) => C[(x + 4) % 5] ^ rot(C[(x + 1) % 5], 1));
      for (let i = 0; i < 25; i++) s[i] ^= D[i % 5];
      const B = Array(25);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rot(s[x + 5 * y], R[x + 5 * y]);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y] & M) & B[(x + 2) % 5 + 5 * y]);
      s[0] ^= RC[round];
    }
  }
  const out = []; for (let i = 0; i < 4; i++) { let v = s[i]; for (let j = 0; j < 8; j++) { out.push(Number(v & 0xffn)); v >>= 8n; } }
  return Buffer.from(out).toString('hex');
}
function eth(a) {
  const body = a.slice(2); if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return 'bad format';
  
  const hash = keccak256(Buffer.from(body.toLowerCase()));
  const expected = [...body.toLowerCase()].map((c, i) => (/[a-f]/.test(c) && parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
  return { ok: expected === body };
}

test('donation addresses: each one is a valid mainnet address of its network', async () => {
  assert.equal(keccak256(Buffer.from('')), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470', 'keccak-256 itself');
  const { SUPPORT } = await import('../src/support.js');
  const coin = Object.fromEntries(SUPPORT.coins.map((item) => [item.id, item.address]));
  assert.deepEqual({ ...ton(coin.ton), ok: ton(coin.ton).ok }, { ok: true, testnet: false, workchain: 0 }, 'TON: CRC16, mainnet, workchain 0');
  assert.deepEqual(tron(coin.usdt), { ok: true, version: 0x41 }, 'USDT TRC-20: a TRON base58check address');
  assert.deepEqual(eth(coin.eth), { ok: true }, 'ETH: EIP-55 mixed-case checksum');
  assert.deepEqual(btc(coin.btc), { ok: true, hrp: 'bc' }, 'BTC: bech32 mainnet');
  assert.ok(SUPPORT.donationalerts.startsWith('https://www.donationalerts.com/r/'));
  // A changed character is caught.
  assert.equal(tron(coin.usdt.replace('M', 'N')).ok, false);
  assert.equal(eth(coin.eth.replace('B', 'b')).ok, false);
  assert.equal(btc(coin.btc.replace('4', '5')).ok, false);
  assert.equal(ton(coin.ton.replace('B', 'C')).ok, false);
});
