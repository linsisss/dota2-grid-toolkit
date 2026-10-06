const { test } = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../scripts/hero-search.mjs'), import('../server/dotadle.mjs')]);

// How people type each hero (the first one expected first in the list), then typos, beginnings and Latin.
const CASES = {
  'Anti-Mage': ['антимаг', 'анти маг', 'ам', 'антимейдж', 'магина', 'anti mage', 'антимга'],
  'Axe': ['акс', 'аксе', 'axe', 'топор'],
  'Bane': ['бейн', 'бэйн', 'bane'],
  'Bloodseeker': ['бладсикер', 'блад сикер', 'сикер', 'бс', 'бладсикр'],
  'Crystal Maiden': ['кристал мейден', 'кристал мейдн', 'кристалка', 'цм', 'crystal'],
  'Drow Ranger': ['дроу рейнджер', 'дроу', 'дровка', 'drow'],
  'Earthshaker': ['эртшейкер', 'ертшейкер', 'шейкер', 'бубна', 'earthshaker'],
  'Juggernaut': ['джаггернаут', 'джагернаут', 'джагер', 'джаг', 'jugger'],
  'Mirana': ['мирана', 'мира'],
  'Morphling': ['морфлинг', 'морф', 'морфлин'],
  'Shadow Fiend': ['шадоу финд', 'шедоу финд', 'сф', 'невермор', 'финд', 'канеки', 'shadow fiend'],
  'Phantom Lancer': ['фантом лансер', 'лансер', 'пл'],
  'Puck': ['пак', 'puck'],
  'Pudge': ['пудж', 'пуджж', 'пудге', 'pudge', 'пуд'],
  'Razor': ['разор', 'рейзор', 'razor'],
  'Sand King': ['сенд кинг', 'сэнд кинг', 'санд кинг', 'ск'],
  'Storm Spirit': ['шторм спирит', 'шторм', 'сторм спирит', 'шторм спирт'],
  'Sven': ['свен', 'sven'],
  'Tiny': ['тини', 'тайни', 'tiny'],
  'Vengeful Spirit': ['венжфул спирит', 'венджфул', 'венга'],
  'Windranger': ['виндрейнджер', 'виндранер', 'виндраннер', 'вр', 'виндра'],
  'Zeus': ['зевс', 'зеус'],
  'Kunkka': ['кунка', 'кункка', 'кунк'],
  'Lina': ['лина', 'lina'],
  'Lion': ['лион', 'лайон', 'lion'],
  'Shadow Shaman': ['шадоу шаман', 'шаман', 'раста'],
  'Slardar': ['слардар'],
  'Tidehunter': ['тайдхантер', 'тайд', 'тайдхантр'],
  'Witch Doctor': ['вич доктор', 'витч доктор', 'вд', 'доктор'],
  'Lich': ['лич', 'lich'],
  'Riki': ['рики', 'рикки'],
  'Enigma': ['энигма', 'енигма'],
  'Tinker': ['тинкер', 'тинкр'],
  'Sniper': ['снайпер', 'снайпр', 'кардел'],
  'Necrophos': ['некрофос', 'некр', 'некрофис'],
  'Warlock': ['варлок', 'ворлок'],
  'Beastmaster': ['бистмастер', 'бист мастер', 'бм'],
  'Queen of Pain': ['квин оф пейн', 'квопа', 'акаша', 'квин'],
  'Venomancer': ['веномансер', 'веник', 'веном'],
  'Faceless Void': ['фейслес войд', 'фейслесс войд', 'фв', 'фейслес'],
  'Wraith King': ['врейт кинг', 'рейт кинг', 'вк', 'скелет кинг'],
  'Death Prophet': ['дез профет', 'дэз профет', 'дп'],
  'Phantom Assassin': ['фантом ассасин', 'фантомка', 'па', 'морта', 'фантом асасин'],
  'Pugna': ['пугна'],
  'Templar Assassin': ['темплар ассасин', 'темпларка', 'та', 'ланая', 'темплар'],
  'Viper': ['вайпер', 'випер'],
  'Luna': ['луна'],
  'Dragon Knight': ['драгон найт', 'дк', 'драгон'],
  'Dazzle': ['даззл', 'дазл', 'дазл'],
  'Clockwerk': ['клокверк', 'клок', 'клокворк'],
  'Leshrac': ['лешрак'],
  "Nature's Prophet": ['нейчерс профет', 'натурс профет', 'фура', 'фурион'],
  'Lifestealer': ['лайфстилер', 'гуль', 'лайфстилир'],
  'Dark Seer': ['дарк сир', 'дарксир'],
  'Clinkz': ['клинкз', 'клинкс', 'клинц'],
  'Omniknight': ['омникнайт', 'омник', 'омни'],
  'Enchantress': ['энчантресс', 'энча', 'энчантрес'],
  'Huskar': ['хускар', 'хаскар', 'хуск'],
  'Night Stalker': ['найт сталкер', 'нс', 'сталкер'],
  'Broodmother': ['брудмазер', 'бруда', 'брудмадер'],
  'Bounty Hunter': ['баунти хантер', 'баунти', 'бх'],
  'Weaver': ['вивер', 'уивер'],
  'Jakiro': ['джакиро', 'джак'],
  'Batrider': ['батрайдер', 'бэтрайдер', 'бэт'],
  'Chen': ['чен'],
  'Spectre': ['спектра', 'спектр', 'спектре'],
  'Ancient Apparition': ['эншент апарейшн', 'аа', 'апарат'],
  'Doom': ['дум', 'doom'],
  'Ursa': ['урса'],
  'Spirit Breaker': ['спирит брейкер', 'бара', 'такси', 'пиво', 'брейкер'],
  'Gyrocopter': ['гирокоптер', 'гиро', 'жирокоптер'],
  'Alchemist': ['алхимик', 'алхим', 'алхемист'],
  'Invoker': ['инвокер', 'инвокр', 'карл', 'invoker', 'инвок'],
  'Silencer': ['сайленсер', 'сайленсер', 'силенсер'],
  'Outworld Devourer': ['аутворлд девоурер', 'од', 'аутворлд'],
  'Lycan': ['ликан', 'лайкан'],
  'Brewmaster': ['брюмастер', 'панда', 'бревмастер'],
  'Shadow Demon': ['шадоу демон', 'сд', 'шедоу демон'],
  'Lone Druid': ['лон друид', 'друид', 'лоун друид'],
  'Chaos Knight': ['чаос найт', 'чаос', 'хаос найт', 'хаос', 'цк', 'кеос найт', 'chaos'],
  'Meepo': ['мипо', 'мипа'],
  'Treant Protector': ['трент протектор', 'трент', 'триант'],
  'Ogre Magi': ['огр маги', 'огр', 'огре маги'],
  'Undying': ['андаинг', 'андайинг', 'андед'],
  'Rubick': ['рубик', 'рубикк'],
  'Disruptor': ['дизраптор', 'дисраптор', 'раптор'],
  'Nyx Assassin': ['никс ассасин', 'никс'],
  'Naga Siren': ['нага сирена', 'нага'],
  'Keeper of the Light': ['кипер оф зе лайт', 'котл', 'кипер'],
  'Io': ['ио', 'висп'],
  'Visage': ['визаж', 'визадж'],
  'Slark': ['сларк'],
  'Medusa': ['медуза', 'дуза'],
  'Troll Warlord': ['тролль варлорд', 'тролль', 'трол варлорд', 'трол'],
  'Centaur Warrunner': ['кентавр', 'сентаур', 'кентавр варраннер', 'цента'],
  'Magnus': ['магнус', 'магнус'],
  'Timbersaw': ['тимберсо', 'тимбер', 'пила'],
  'Bristleback': ['бристлбек', 'бб', 'бристл', 'ежик'],
  'Tusk': ['туск', 'таск'],
  'Skywrath Mage': ['скайрат мейдж', 'скай', 'скайрат'],
  'Abaddon': ['абаддон', 'абадон'],
  'Elder Titan': ['элдер титан', 'титан', 'ет'],
  'Legion Commander': ['легион коммандер', 'легионка', 'лк', 'легион'],
  'Techies': ['течис', 'техис', 'минер', 'текис'],
  'Ember Spirit': ['эмбер спирит', 'эмбер'],
  'Earth Spirit': ['ерс спирит', 'эрс спирит', 'ерс'],
  'Underlord': ['андерлорд', 'питлорд'],
  'Terrorblade': ['терроблейд', 'террорблейд', 'тб'],
  'Phoenix': ['феникс', 'финикс'],
  'Oracle': ['оракл', 'оракул'],
  'Winter Wyvern': ['винтер виверн', 'виверна', 'вв'],
  'Arc Warden': ['арк варден', 'арк', 'зет'],
  'Monkey King': ['манки кинг', 'мк', 'обезьяна'],
  'Dark Willow': ['дарк виллоу', 'вилоу', 'виллоу'],
  'Pangolier': ['панголиер', 'панго', 'панголир'],
  'Grimstroke': ['гримстроук', 'грим', 'гримстрок'],
  'Hoodwink': ['худвинк', 'белка'],
  'Void Spirit': ['войд спирит', 'воид спирит'],
  'Snapfire': ['снапфаер', 'снапфайр', 'бабка'],
  'Mars': ['марс'],
  'Ring Master': ['ринг мастер', 'рингмастер'],
  'Dawnbreaker': ['даунбрейкер', 'доунбрейкер', 'дб'],
  'Marci': ['марси'],
  'Primal Beast': ['праймал бист', 'праймал'],
  'Muerta': ['муэрта', 'муерта'],
  'Kez': ['кез'],
  'Largo': ['ларго'],
};

// Nicknames from the community (esports.ru, dota2.ru forum, dota-blog.ru — 2026-10-06): one hero first.
const NICKNAMES = { 'папич': 'Wraith King', 'леорик': 'Wraith King', 'чаос': 'Chaos Knight', 'боник': 'Clinkz', 'вокер': 'Invoker', 'колдун': 'Invoker',
  'селедка': 'Slardar', 'арбуз': 'Tidehunter', 'сало': 'Silencer', 'петух': 'Skywrath Mage', 'гуля': 'Lifestealer', 'найкс': 'Lifestealer', 'лега': 'Legion Commander',
  'котел': 'Keeper of the Light', 'гендальф': 'Keeper of the Light', 'крыса': 'Riki', 'рикимару': 'Riki', 'мортра': 'Phantom Assassin', 'эпилептик': 'Phantom Lancer',
  'буч': 'Pudge', 'мясник': 'Pudge', 'падж': 'Pudge', 'леший': 'Leshrac', 'холодильник': 'Ancient Apparition', 'потма': 'Mirana', 'тракса': 'Drow Ranger',
  'бубна': 'Earthshaker', 'земеля': 'Earth Spirit', 'коза': 'Enchantress', 'феня': 'Phoenix', 'мурлок': 'Slark', 'гном': 'Sniper', 'космобык': 'Spirit Breaker',
  'тимберсау': 'Timbersaw', 'дерево': 'Treant Protector', 'семадог': 'Undying', 'зомби': 'Undying', 'гаргулья': 'Visage', 'ткач': 'Weaver', 'чернокнижник': 'Warlock',
  'врка': 'Windranger', 'макака': 'Monkey King', 'чечен': 'Chen', 'чеснок': 'Dazzle', 'люцифер': 'Doom', 'довакин': 'Dragon Knight', 'часовщик': 'Clockwerk',
  'вертолет': 'Gyrocopter', 'вертолёт': 'Gyrocopter', 'тхд': 'Jakiro', 'джага': 'Juggernaut', 'ёж': 'Bristleback', 'брист': 'Bristleback', 'брудка': 'Broodmother',
  'кент': 'Centaur Warrunner', 'вилка': 'Dark Willow', 'профетка': 'Death Prophet', 'хусик': 'Huskar', 'шар': 'Io', 'ликантроп': 'Lycan', 'магнотавр': 'Magnus',
  'миреска': 'Dark Willow', 'санбриз': 'Dark Willow', 'остарион': 'Wraith King', 'кробелус': 'Death Prophet', 'тресдин': 'Legion Commander', 'беатрикс': 'Snapfire',
  'мортред': 'Phantom Assassin', 'ратлтрап': 'Clockwerk', 'могул хан': 'Axe', 'раигор': 'Earthshaker', 'нортром': 'Silencer', 'эзалор': 'Keeper of the Light', 'инаи': 'Void Spirit', 'валора': 'Dawnbreaker',
  'мипарь': 'Meepo', 'мартышка': 'Monkey King', 'некролит': 'Necrophos', 'скарабей': 'Nyx Assassin', 'паладин': 'Omniknight', 'оракул': 'Oracle', 'рубен': 'Rubick',
  'скорпион': 'Sand King', 'криксалис': 'Sand King', 'снэпка': 'Snapfire', 'течка': 'Techies', 'террор': 'Terrorblade', 'тиник': 'Tiny', 'тусик': 'Tusk', 'зус': 'Zeus' };
// Shared by several heroes: each of them in the list.
const SHARED = { 'птица': ['Skywrath Mage', 'Outworld Devourer', 'Phoenix'], 'жук': ['Nyx Assassin', 'Weaver'], 'змея': ['Medusa', 'Venomancer'],
  'медведь': ['Ursa', 'Lone Druid'], 'бист': ['Beastmaster', 'Primal Beast'], 'ес': ['Earthshaker', 'Earth Spirit'], 'вс': ['Vengeful Spirit', 'Void Spirit'] };

test('community nicknames find their hero', async () => {
  const [{ heroIndex, searchHeroes }, { DOTADLE_HEROES }] = await modules;
  const index = heroIndex(DOTADLE_HEROES), misses = [];
  for (const [query, name] of Object.entries(NICKNAMES)) { const found = searchHeroes(index, query).map((hero) => hero.name); if (found[0] !== name) misses.push(`${query} → ${found.slice(0, 3).join(', ')} (ждали ${name})`); }
  for (const [query, names] of Object.entries(SHARED)) { const found = searchHeroes(index, query).map((hero) => hero.name); for (const name of names) if (!found.includes(name)) misses.push(`${query}: нет ${name} (${found.join(', ')})`); }
  assert.deepEqual(misses, []);
});

test('every hero is found first by how people type it', async () => {
  const [{ heroIndex, searchHeroes }, { DOTADLE_HEROES }] = await modules;
  const index = heroIndex(DOTADLE_HEROES), misses = [];
  assert.equal(Object.keys(CASES).length, DOTADLE_HEROES.length);
  for (const [name, queries] of Object.entries(CASES)) for (const query of queries) {
    const found = searchHeroes(index, query).map((hero) => hero.name);
    if (found[0] !== name) misses.push(`${query} → ${found.slice(0, 3).join(', ') || 'ничего'} (ждали ${name})`);
  }
  assert.deepEqual(misses, []);
});

test('the English name finds the hero first; its beginning keeps it in the list', async () => {
  const [{ heroIndex, searchHeroes }, { DOTADLE_HEROES }] = await modules;
  const index = heroIndex(DOTADLE_HEROES);
  for (const hero of DOTADLE_HEROES) {
    assert.equal(searchHeroes(index, hero.name)[0].name, hero.name, hero.name);
    assert.ok(searchHeroes(index, hero.name.slice(0, 4)).some((found) => found.id === hero.id), hero.name.slice(0, 4));
  }
  assert.deepEqual(searchHeroes(index, ''), []);
  assert.deepEqual(searchHeroes(index, 'йцукенгшщ'), []);
});

test('nothing found: the nearest heroes still show, nonsense gets nothing', async () => {
  const [{ heroIndex, nearestHeroes, searchHeroes }, { DOTADLE_HEROES }] = await modules;
  const index = heroIndex(DOTADLE_HEROES);
  for (const [query, name] of [['шадофиендище', 'Shadow Fiend'], ['инвокерище', 'Invoker'], ['пуджище', 'Pudge']]) {
    assert.deepEqual(searchHeroes(index, query), [], query);
    assert.equal(nearestHeroes(index, query)[0]?.name, name, query);
  }
  assert.deepEqual(nearestHeroes(index, 'йцукенгшщ'), []);
});
