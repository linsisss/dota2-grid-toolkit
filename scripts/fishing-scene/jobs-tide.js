// Tidehunter where the map stands him (portrait_world_unit «tidehunter»), idling, turned to the lake as on the videos (the map's yaw 201° shows his face).
const TIDE = [-107.453659, -1276.870483, 256.000427];
window.JOB = { addr: '#tidehunter', sheets: window.ONLY_SHEETS || [
  { name: 'tide_idle', anim: 'idle_anim', fps: 10, loop: true, cam: 'overhead', at: TIDE, yaw: 125, box: [360, 340], anchor: [0.5, 0.75] },
  { name: 'tide_catch', anim: 'idle_anim', fps: 10, loop: true, cam: 'centered', at: TIDE, yaw: 125, box: [520, 620], anchor: [0.5, 0.8] },
  { name: 'tide_menu', anim: 'idle_anim', still: true, cam: 'side', at: [-70, -1366, 290], yaw: 230, box: [600, 800], anchor: [0.5, 0.85] },
] };
