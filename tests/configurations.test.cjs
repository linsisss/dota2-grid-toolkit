const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;

function file() {
  return {
    version: 3,
    extra: 'file metadata',
    configs: ['One', 'Two', 'Three', 'Four'].map((name, index) => ({
      config_name: name,
      extra: index,
      categories: [
        {
          category_name: 'Group ' + index,
          x_position: 20.125,
          y_position: 30,
          width: 300,
          height: 150,
          hero_ids: [1, 5],
          extra: 'category metadata'
        }
      ]
    }))
  };
}

test('adding a grid appends to the open file and preserves all four existing grids', () => {
  const original = file();
  let doc = C.importDota(original, 2);
  doc.fileName = 'my-grids.json';
  const before = C.clone(doc);
  doc = C.addConfig(doc, 'My new grid');
  assert.deepEqual(before.source, original);
  assert.equal(doc.fileName, 'my-grids.json');
  assert.equal(doc.configIndex, 4);
  assert.equal(doc.entities.length, 0);
  doc.entities.push(
    C.entity(doc, { type: 'heroes', name: 'New group', heroIds: [2, 9], layer: 'heroes' })
  );
  const output = C.exportDota(doc);
  assert.deepEqual(output.configs.slice(0, 4), original.configs);
  assert.equal(output.extra, original.extra);
  assert.equal(output.configs[4].config_name, 'My new grid');
  assert.deepEqual(output.configs[4].categories[0].hero_ids, [2, 9]);
  assert.doesNotThrow(() => C.importDota(output));
});

test('edits across grids and hidden artwork survive adding templates, switching and native save', () => {
  let doc = C.importDota(file());
  doc.fileName = 'hero_grid_config.json';
  doc.name = 'Renamed';
  doc.entities[0].x = 99;
  const art = C.addArtwork(doc, [{ type: 'symbol', text: '*', w: 30, h: 30 }], 'image');
  art.layer.visible = false;
  art.layer.locked = true;
  doc = C.switchConfig(doc, 1);
  doc.entities[0].heroIds.push(8);
  doc = C.addConfig(doc, 'From template', 'roles');
  assert.equal(doc.entities.filter((e) => e.type === 'heroes').length, 5);
  assert.deepEqual(
    C.configurations(doc).map((c) => c.name),
    ['Renamed', 'Two', 'Three', 'Four', 'From template']
  );
  doc = C.importProject(JSON.parse(JSON.stringify(doc)));
  doc = C.switchConfig(doc, 0);
  assert.equal(doc.name, 'Renamed');
  assert.equal(doc.entities[0].x, 99);
  assert.equal(doc.layers.find((l) => l.id === art.layer.id).visible, false);
  assert.equal(doc.layers.find((l) => l.id === art.layer.id).locked, true);
  assert.equal(doc.fileName, 'hero_grid_config.json');
  const output = C.exportDota(doc);
  assert.deepEqual(output.configs[1].categories[0].hero_ids, [1, 5, 8]);
  assert.equal(output.configs[0].categories.length, 1);
  assert.equal(output.configs[4].categories.length, 6);
});

test('grid creation is a single undoable transaction and existing names get unique defaults', () => {
  let doc = C.importDota(file());
  const history = new C.History(5),
    original = C.clone(doc);
  history.push(doc);
  doc = C.addConfig(doc, 'One');
  assert.equal(doc.name, 'One (2)');
  const created = C.clone(doc);
  doc = history.undo(doc);
  assert.deepEqual(doc, original);
  doc = history.redo(doc);
  assert.deepEqual(doc, created);
  doc = C.addConfig(doc, 'One');
  assert.equal(doc.name, 'One (3)');
});

test('invalid additions leave the original document intact and enforce file limits', () => {
  const doc = C.importDota(file()),
    before = C.clone(doc);
  for (const name of ['', '   ', null, 'a'.repeat(201)])
    assert.throws(() => C.addConfig(doc, name));
  assert.throws(() => C.addConfig(doc, 'Valid', 'unknown'));
  assert.throws(() => C.switchConfig(doc, 99));
  assert.deepEqual(doc, before);
  const full = C.createDocument();
  full.source.configs = Array.from({ length: C.MAX_CONFIGS }, (_, i) => ({
    config_name: String(i),
    categories: []
  }));
  assert.throws(() => C.addConfig(full));
  assert.equal(full.source.configs.length, C.MAX_CONFIGS);
});

test('deleting a grid keeps every other grid, its edits and the file metadata', () => {
  let doc = C.importDota(file(), 0);
  doc.fileName = 'my-grids.json';
  doc.entities[0].name = 'Edited One';
  doc = C.switchConfig(doc, 2);
  doc.entities[0].name = 'Edited Three';
  doc = C.switchConfig(doc, 3);
  doc = C.renameConfig(doc, 3, 'Renamed Four');
  const before = JSON.stringify(doc);

  // Deleting a grid before the active one shifts the active index but not the content.
  let next = C.removeConfig(doc, 1);
  assert.equal(JSON.stringify(doc), before);
  assert.deepEqual(C.configurations(next).map((grid) => grid.name), ['One', 'Three', 'Renamed Four']);
  assert.equal(next.configIndex, 2);
  assert.equal(next.name, 'Renamed Four');
  assert.equal(next.fileName, 'my-grids.json');
  assert.equal(next.source.extra, 'file metadata');
  assert.equal(next.source.configs[1].extra, 2);
  assert.equal(C.switchConfig(next, 0).entities[0].name, 'Edited One');
  assert.equal(C.switchConfig(next, 1).entities[0].name, 'Edited Three');

  // Deleting the open grid opens its neighbour with that grid's own edits.
  next = C.removeConfig(C.switchConfig(doc, 2), 2);
  assert.deepEqual(C.configurations(next).map((grid) => grid.name), ['One', 'Two', 'Renamed Four']);
  assert.equal(next.configIndex, 2);
  assert.equal(next.name, 'Renamed Four');
  next = C.removeConfig(next, 2);
  assert.equal(next.configIndex, 1);
  assert.equal(next.name, 'Two');
  assert.equal(C.switchConfig(next, 0).entities[0].name, 'Edited One');

  // Export keeps the remaining grids only, and the last grid cannot be deleted.
  assert.deepEqual(C.exportDota(next).configs.map((grid) => grid.config_name), ['One', 'Two']);
  const single = C.importDota({ version: 3, configs: [file().configs[0]] }, 0);
  assert.throws(() => C.removeConfig(single, 0), /хотя бы одна/);
  assert.throws(() => C.removeConfig(doc, 9), /не найдена/);
});
