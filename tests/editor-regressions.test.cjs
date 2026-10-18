const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const { readGridFiles } = require('../scripts/grid-import.mjs');
const { canvasPoint, hitItem, intersectsInk, selectionOnClick, centerBrushPoints, snapPoint } = require('../scripts/canvas-input.mjs');
const { simplifyArtwork } = require('../scripts/artwork-optimization.mjs');
const { searchSymbols } = require('../scripts/symbol-tools.mjs');
const D = require('../scripts/data.mjs').default;
const measure = (text) => ({ text, advances: Array.from(text, () => 10) });
const ink = () => ({ x: 4, y: 10, w: 4, h: 4 });
const item = (doc, extra = {}) => { const e = C.entity(doc, { type:'symbol', text:'.', x:100, y:100, w:30, h:30, ...extra }); doc.entities.push(e); return e; };

test('legacy zero/negative dimensions recover across every grid without rescaling or mutating input', async () => {
  const source = { version:3, owner:'keep', configs:[0,1].map((i) => ({ config_name:`Old ${i}`, categories:[
    {category_name:'⣿',x_position: -3.25,y_position:104.875,width:0,height:-15,hero_ids:[],foo:42},
    {category_name:'HERO',x_position:40,y_position:50,width:-300,height:0,hero_ids:[127,1]}
  ]})) };
  const before=C.clone(source);
  const [{doc}] = await readGridFiles([{name:'old.backup',size:100,text:async()=>JSON.stringify(source)}]);
  assert.equal(doc.importRepairs.length,4);
  assert.equal(doc.entities[0].x,-3.25); assert.equal(doc.entities[0].y,104.875);
  assert.equal(doc.entities[0].w,30); assert.equal(doc.entities[1].w,300); assert.equal(doc.entities[1].h,195);
  assert.deepEqual(source,before);
  const other=C.switchConfig(C.importProject(doc),1);
  assert.equal(other.entities[0].x,-3.25);
  assert.equal(C.exportDota(other).configs[0].categories[0].foo,42);
  source.configs[1].categories[0].x_position=null;
  assert.throws(()=>C.importDota(source),/Old 1.*категория 1/);
});

test('complex art retains coordinates, proportions and Unicode across old JSON, native save and optional compaction', () => {
  const doc=C.createDocument('Complex');
  for(let y=0;y<45;y++) for(let x=0;x<90;x++) item(doc, { x:12.125+x*10, y:5.625+y*11, text:['⣿','ア','.','◆'][x%4] });
  const before=C.clone(doc), exported=C.exportDota(doc,measure), reopened=C.importDota(exported);
  assert.deepEqual(doc,before);
  const expanded=reopened.entities.flatMap((e)=>C.textGlyphs({...e,textMetrics:measure(e.text)},true));
  const coords=(items)=>items.map((e)=>[e.x,e.y,e.text]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
  assert.deepEqual(coords(expanded),coords(doc.entities));
  assert.deepEqual(C.importProject(doc).entities,doc.entities);
  assert.equal(C.exportDota(doc,measure,{compactRows:false}).configs[0].categories.length,4050);
  assert.ok(exported.configs[0].categories.length<4050);
});

test('canvas mapping stays exact at fractional zoom, scrolling and independently rounded CSS sizes', () => {
  for(const width of [358,775.5,1789.5]) {
    const r={left:-42.25,top:190.75,width,height:width*593/1193+0.4};
    const p=canvasPoint({clientX:r.left+r.width*.4,clientY:r.top+r.height*.7},r,{w:1193,h:593});
    assert.ok(Math.abs(p.x-477.2)<1e-8); assert.ok(Math.abs(p.y-415.1)<1e-8);
  }
  assert.deepEqual(snapPoint({x:19.4,y:22.8},false),{x:19.4,y:22.8});
  assert.deepEqual(snapPoint({x:19.4,y:22.8},true),{x:16,y:24});
});

test('brush hotspot matches the visible glyph center rather than the category box', () => {
  const p=centerBrushPoints([{x:220,y:120,ch:'.'}],ink)[0];
  assert.equal(p.x+4+2,220); assert.equal(p.y+10+2,120);
  // Past the canvas edge since 2026-10-16: not pressed back to the origin.
  const edge=centerBrushPoints([{x:0,y:0,ch:'.'}],ink)[0];
  assert.equal(edge.x,-6); assert.equal(edge.y,-12);
});

test('dense art selects the nearest visible symbol; empty category boxes and locked layers do not steal hits', () => {
  const doc=C.createDocument(), first=item(doc), second=item(doc,{x:106});
  assert.equal(hitItem(doc,{x:106,y:112},ink,1).id,first.id);
  assert.equal(hitItem(doc,{x:112,y:112},ink,1).id,second.id);
  assert.equal(hitItem(doc,{x:103,y:125},ink,1),null);
  assert.equal(intersectsInk(first,{x:103,y:109,w:7,h:7},ink),true);
  assert.equal(intersectsInk(first,{x:100,y:125,w:30,h:4},ink),false);
  doc.layers.find((l)=>l.id==='decor').locked=true;
  assert.equal(hitItem(doc,{x:106,y:112},ink),null);
  assert.deepEqual([...selectionOnClick(new Set([1,2]),2,true)],[1]);
  assert.deepEqual([...selectionOnClick(new Set([1,2]),2)],[1,2]);
});

test('spatial thinning is deterministic, undoable and preserves hero/text/hidden/locked data and retained coordinates', () => {
  const doc=C.createDocument();
  for(let y=0;y<20;y++)for(let x=0;x<30;x++)item(doc,{x:x*12,y:y*11});
  const protectedItems=[item(doc,{type:'text',text:'TITLE'}),item(doc,{type:'heroes',heroIds:[127,1],w:340,h:195}),item(doc,{layer:'background'})];
  doc.layers.find((l)=>l.id==='background').locked=true;
  const before=C.clone(doc), result=simplifyArtwork(doc,40);
  assert.equal(result.after,240); assert.equal(result.removed,360);
  assert.deepEqual(doc,before); assert.deepEqual(result,simplifyArtwork(doc,40));
  for(const e of result.doc.entities) assert.deepEqual(e,doc.entities.find((old)=>old.id===e.id));
  for(const e of protectedItems) assert.ok(result.doc.entities.some((other)=>other.id===e.id));
  assert.deepEqual(C.bounds(result.doc.entities.slice(0,240)),C.bounds(doc.entities.slice(0,600)));
  assert.deepEqual(simplifyArtwork(doc,100).doc,doc);
  const h=new C.History(); h.push(doc); assert.deepEqual(h.undo(result.doc),before);
});

test('symbol search finds literal glyphs, categories, names and Unicode codepoints', () => {
  assert.deepEqual(searchSymbols(D.symbols,'U+2605'),['★']);
  assert.deepEqual(searchSymbols(D.symbols,'♡'),['♡']);
  assert.ok(searchSymbols(D.symbols,'звезд').includes('☆'));
  assert.deepEqual(searchSymbols(D.symbols,'катакана'),D.symbols['Катакана']);
  assert.deepEqual(searchSymbols(D.symbols,'not-a-symbol'),[]);
});

test('frame style wins over multi-character brushes and reversed drags retain all corners', () => {
  const {drawingPoints,BRUSH_DEFAULTS}=require('../scripts/drawing.mjs');
  for(const frame of Object.values(D.frames)) {
    const points=drawingPoints('frame',[{x:240,y:200},{x:60,y:60}],{...BRUSH_DEFAULTS,chars:'AB'},1,false,frame);
    assert.ok(points.some((p)=>p.x===60&&p.y===60&&p.ch===frame.tl));
    assert.ok(points.every((p)=>Object.values(frame).includes(p.ch)));
    const doc=C.createDocument(); for(const p of points)item(doc,{x:p.x,y:p.y,text:p.ch});
    const output=C.exportDota(doc,measure,{compactRows:false});
    assert.deepEqual(C.importDota(output).entities.map((e)=>[e.x,e.y,e.text]),doc.entities.map((e)=>[+e.x.toFixed(6),+e.y.toFixed(6),e.text]));
  }
});
