// Vengeful Spirit in the arcana (style 1, Servants of Scree'Auk, as the map's portrait_world_unit wears
// it: items 22718.1, 22720, 22721 and the fishing rod 27470) at hero_position, turned to the aim.
const HERO = [-383.745575, -1274.26001, 256];
const play = (name, anim, fps, extra = {}) => [65, 90, 115].map((yaw) => ({ name: `vs_${name}_${yaw}`, anim, fps, cam: 'overhead', at: HERO, yaw, box: [380, 340], anchor: [0.5, 0.78], ...extra }));
window.JOB = { addr: '#vengefulspirit/shoulder=22718.1,head=22720,legs=22721,weapon=27470', alt: true, clips: true, sheets: window.ONLY_SHEETS || [
  ...play('idle', 'vs_arcana_idle_fishing', 10, { loop: true }),
  ...play('cast', 'vs_arcana_cast_rod_fishing', 12),
  ...play('wait', 'vs_arcana_idle_fishing_rod_cast', 8, { loop: true }),
  ...play('reel', 'vs_arcana_reeling_in_fishing', 10, { loop: true }),
  ...play('hook', 'vs_arcana_rod_reel_in_fishing', 12),
  { name: 'vs_defeat_90', anim: 'vs_arc_defeat_fishing', fps: 10, cam: 'overhead', at: HERO, yaw: 90, box: [380, 340], anchor: [0.5, 0.78] },
  { name: 'vs_victory', anim: 'vs_arcana_victory_fishing', fps: 10, cam: 'centered', at: HERO, yaw: 90, box: [460, 560], anchor: [0.5, 0.8] },
  { name: 'vs_menu', anim: 'vs_arcana_idle_fishing', still: true, from: 0.3, cam: 'side', at: [-358, -1336, 322], yaw: 297, box: [520, 760], anchor: [0.5, 0.85] },
] };
