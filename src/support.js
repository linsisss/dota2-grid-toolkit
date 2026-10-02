// Where to support GridStudio («Поддержать разработку», src/SupportDialog.jsx); the addresses were sent
// by the user on 2026-10-02, and tests/support.test.cjs checks each one's checksum, so a slip in an
// edit fails the tests. A coin without an address shows «скоро» instead of a row to copy. Networks are named as wallets name them; a QR
// code holds the bare address, which every wallet's scanner reads.
export const SUPPORT = Object.freeze({
  donationalerts: 'https://www.donationalerts.com/r/linsiss',
  // Who to write after a donation for the «Поддержавший» badge (asked for on 2026-10-02).
  badgeContact: 'https://t.me/dissonance',
  coins: Object.freeze([
    { id: 'ton', name: 'TON', network: 'сеть TON', address: 'UQBCNryQBt0sYfWgAy6j8_5kIiPv9DUEhJwszrIF4CDbXRg0' },
    { id: 'usdt', name: 'USDT', network: 'сеть TRON (TRC-20)', address: 'TMbpszMA4HJtn27D2A16nsgtpGtiaRH61r' },
    { id: 'eth', name: 'ETH', network: 'и любые токены ERC-20', address: '0x1355B3d3eb71da21D3C9C282959dc2d42df0Dd56' },
    { id: 'btc', name: 'BTC', network: 'сеть Bitcoin', address: 'bc1q4jrqzxyv23eqecpawj8fud8y7a39sh69mu7tt6' }
  ])
});
