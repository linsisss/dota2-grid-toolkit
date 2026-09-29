import C from './core.mjs';

// Dota's edit mode lays the «+» card out as one more item of the hero list, so a selected
// group shows its heroes and the «+» together inside its frame, the cards shrinking when
// needed. A group that is not selected keeps the game's normal layout. Editor only: the
// exported category is unchanged.
export const editLayout = (group) => C.heroLayout({ ...group, heroIds: [...group.heroIds, 0] });

export function heroAddSlot(group, layout = editLayout(group)) {
  const index = group.heroIds.length;
  return { x: group.x + layout.left + (index % layout.cols) * layout.stepX,
    y: group.y + layout.top + Math.floor(index / layout.cols) * layout.stepY, w: layout.cardW, h: layout.cardH };
}
