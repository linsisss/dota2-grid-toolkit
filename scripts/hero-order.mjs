import C from './core.mjs';
import { DOTA } from './dota-rendering.mjs';

export function moveHero(values, from, to) {
  const result = [...values];
  if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < values.length)) return result;
  result.splice(to, 0, ...result.splice(from, 1));
  return result;
}

export function heroSlot(group, layout, index) {
  return { x: group.x + layout.left + index % layout.cols * layout.stepX,
    y: group.y + layout.top + Math.floor(index / layout.cols) * layout.stepY };
}

export function heroAt(group, point, layout = C.heroLayout(group)) {
  if (!layout || group.heroIds.length < 2) return -1;
  const column = Math.floor((point.x - group.x - layout.left) / layout.stepX);
  const row = Math.floor((point.y - group.y - layout.top) / layout.stepY);
  if (column < 0 || column >= layout.cols || row < 0 || row >= layout.rows) return -1;
  const index = row * layout.cols + column, slot = heroSlot(group, layout, index);
  return index < group.heroIds.length && point.x <= slot.x + layout.cardW && point.y <= slot.y + layout.cardH ? index : -1;
}

export function heroDropIndex(group, point, layout = C.heroLayout(group)) {
  if (!layout || point.x < group.x || point.x > group.x + group.w ||
      point.y < group.y + DOTA.header || point.y > group.y + DOTA.header + group.h) return -1;
  const column = Math.max(0, Math.min(layout.cols - 1, Math.round((point.x - group.x - layout.left - layout.cardW / 2) / layout.stepX)));
  const row = Math.max(0, Math.min(layout.rows - 1, Math.round((point.y - group.y - layout.top - layout.cardH / 2) / layout.stepY)));
  return Math.min(group.heroIds.length - 1, row * layout.cols + column);
}

// Temporary display coordinates only. The document changes once, on drop.
export function createHeroMotion(group, from, now, layout = C.heroLayout(group)) {
  const slots = group.heroIds.map((_, index) => heroSlot(group, layout, index));
  return { groupId: group.id, ids: [...group.heroIds], layout, slots, from, to: from, active: true, valid: true,
    positions: slots.map(slot => ({ ...slot })), targets: slots.map(slot => ({ ...slot })), lastTime: now };
}

export function targetHeroMotion(motion, to) {
  motion.to = to;
  const order = moveHero(motion.ids.map((_, index) => index), motion.from, to);
  order.forEach((original, slot) => { motion.targets[original] = motion.slots[slot]; });
}

export function advanceHeroMotion(motion, now, reduceMotion = false) {
  const factor = reduceMotion ? 1 : 1 - Math.exp(-Math.max(0, now - motion.lastTime) / 40);
  motion.lastTime = now;
  let moving = false;
  motion.positions.forEach((position, index) => {
    if (motion.active && index === motion.from) return;
    const target = motion.targets[index];
    for (const axis of ['x', 'y']) {
      position[axis] += (target[axis] - position[axis]) * factor;
      if (Math.abs(target[axis] - position[axis]) < 0.08) position[axis] = target[axis];
      else moving = true;
    }
  });
  return moving;
}
