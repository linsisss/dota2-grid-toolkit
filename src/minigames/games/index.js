// The nine games of Valve's «Мини-игры для досуга во время поиска» popup (popup_dashboard_games.xml), in
// its order: three rows of three. `node` is the node class there (the icon and its size), `name` the
// Valve string of the label (assets/minigames/picker/strings.*.json). A game with `load` is playable:
// it is a lazy chunk whose default export is the game component (docs/minigames.md, «Модуль игры»).
export const GAMES = [
  { id: 'fishing', name: 'DOTA_Crownfall_Archive_Minigame_Fishing', icon: 'encounter_fish', iconSize: 32, load: () => import('./fishing/Fishing.jsx') },
  { id: 'race', name: 'DOTA_Crownfall_Archive_Minigame_BatRacer', icon: 'encounter_bat', iconSize: 32, load: () => import('./race/Race.jsx') },
  { id: 'fighter', name: 'DOTA_Crownfall_Archive_Minigame_SleetFighter', icon: 'encounter_sleetfighter', iconSize: 38, load: () => import('./fighter/Fighter.jsx') },
  { id: 'chess', name: 'DOTA_Crownfall_Archive_Minigame_DragonChess', icon: 'encounter_match3', iconSize: 38, shift: [-1, -3], load: () => import('./chess/Chess.jsx') },
  { id: 'zaug', name: 'DOTA_Crownfall_Archive_Minigame_ZaugsLair', icon: 'encounter_bullethell', iconSize: 38, load: () => import('./zaug/Zaug.jsx') },
  { id: 'spoon', name: 'DOTA_Crownfall_Archive_Minigame_SpoonMan', icon: 'encounter_spoonman', iconSize: 38, shift: [-2, 0], load: () => import('./spoon/Spoon.jsx') },
  { id: 'castle', name: 'DOTA_Crownfall_Archive_Minigame_CastleCarnage', icon: 'encounter_artillery', iconSize: 36, shift: [0, -2], load: () => import('./castle/Castle.jsx') },
  { id: 'sweeper', name: 'DOTA_Crownfall_Archive_Minigame_SpleenSweeper', icon: 'encounter_minesweeper', iconSize: 38, load: () => import('./sweeper/Sweeper.jsx') },
  { id: 'thorns', name: 'DOTA_Crownfall_Archive_Minigame_NestOfThorns', icon: 'encounter_survivors', iconSize: 38, shift: [0, -6], load: () => import('./thorns/Thorns.jsx') },
];

export const gameById = (id) => GAMES.find((game) => game.id === id);
