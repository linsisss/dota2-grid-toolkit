const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const { editLayout, heroAddSlot } = require('../scripts/hero-chrome.mjs');

const group = (heroIds, w = 260, h = 90) => ({ type: 'heroes', x: 100, y: 50, w, h, heroIds, name: 'НОВАЯ КАТЕГОРИЯ' });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const inside = (g, r) => r.x >= g.x && r.y >= g.y + 20 && r.x + r.w <= g.x + g.w + 1e-9 && r.y + r.h <= g.y + 20 + g.h + 1e-9;

test('in edit mode the + is one more item of the hero list, always inside the frame', () => {
  // A wide row: the + simply follows the heroes at the same size, as in Dota.
  const two = group([2, 5]), add = heroAddSlot(two);
  assert.deepEqual([add.w, add.h], [C.heroLayout(two).cardW, C.heroLayout(two).cardH]);
  near(add.x, two.x + editLayout(two).left + 2 * editLayout(two).stepX);
  // An empty group: the + takes the whole first card.
  const empty = group([]), first = C.heroLayout(group([0]));
  near(heroAddSlot(empty).h, first.cardH);
  // Four heroes filling the row: the cards shrink or wrap so the + still fits in the frame.
  for (const g of [group([1, 2, 3, 4], 230, 150), group([1, 2, 3, 4, 5, 6], 120, 180), group(Array(20).fill(1), 300, 120)])
    assert.ok(inside(g, heroAddSlot(g)), JSON.stringify(heroAddSlot(g)));
});
