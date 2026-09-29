const {test}=require('node:test');
const assert=require('node:assert/strict');
const {IDBFactory}=require('fake-indexeddb');
const modules=Promise.all([import('../scripts/project-storage.mjs'),import('../scripts/workspaces.mjs'),import('../scripts/core.mjs')]);
function memory(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}

test('landing creates a separate blank file and reload resumes it without duplicates',async t=>{
 const f=await fixture(t),registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());
 const old=await registry.create('Existing art',f.C.demoDocument('roles')),session=memory();
 f.spaces.rememberWorkspace({id:old.id,configIndex:0},session);
 const url=new URL('https://gridstudio.me/editor?new=1'),history={state:{test:true},replaceState(state,_,next){assert.equal(state,this.state);this.url=String(next);}};
 const created=await f.spaces.enterWorkspace(registry,null,{url,history,session});
 assert.notEqual(created.id,old.id);assert.equal(created.account,null);assert.equal(created.openConfigIndex,0);
 const storage=await f.storage.createProjectStorage(f.C.importProject,'1.0.0',created.id);t.after(()=>storage.database?.close());
 const saved=await storage.load();assert.equal(saved.doc.source.configs.length,1);assert.equal(saved.doc.entities.length,0);assert.deepEqual(saved.doc.source.configs[0].categories,[]);
 assert.equal(history.url,'https://gridstudio.me/editor');
 assert.equal((await f.spaces.enterWorkspace(registry,null,{url:new URL(history.url),history,session})).id,created.id);
 assert.equal((await registry.list()).length,2);assert.equal((await registry.get(old.id)).name,'Existing art');
});

test('studio links open the file list even after a blank landing file, and reload then resumes the file picked from it',async t=>{
 const f=await fixture(t),registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());
 const art=await registry.create('Existing art',f.C.demoDocument('roles')),session=memory();
 const history={state:{test:true},replaceState(state,_,next){assert.equal(state,this.state);this.url=String(next);}};
 const blank=await f.spaces.enterWorkspace(registry,null,{url:new URL('https://gridstudio.me/editor?new=1'),history,session});
 assert.equal(await f.spaces.enterWorkspace(registry,null,{url:new URL('https://gridstudio.me/editor?files=1&show=grids'),history,session}),null);
 assert.equal(history.url,'https://gridstudio.me/editor?show=grids');assert.equal(session.length,0);
 assert.deepEqual((await registry.list()).map(x=>x.id).sort(),[art.id,blank.id].sort());
 f.spaces.rememberWorkspace({id:art.id,configIndex:0},session);
 assert.equal((await f.spaces.enterWorkspace(registry,null,{url:new URL(history.url),history,session})).id,art.id);
});

test('landing file belongs to the signed-in account and failed creation keeps the current navigation',async t=>{
 const f=await fixture(t),registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());
 const session=memory(),url=new URL('https://gridstudio.me/editor.html?new=1'),history={state:null,replaceState(){}};
 const created=await f.spaces.enterWorkspace(registry,{id:'7'},{url,history,session});
 assert.equal(created.account,'7');assert.equal(created.pendingUpload,true);
 const failedURL=new URL('https://gridstudio.me/editor?new=1');let replacements=0;
 await assert.rejects(f.spaces.enterWorkspace({create:async()=>{throw Error('quota');}},null,{url:failedURL,session,history:{replaceState(){replacements++;}}}),/quota/);
 assert.equal(replacements,0);assert.equal(failedURL.searchParams.get('new'),'1');
 assert.equal((await f.spaces.resumeWorkspace(registry,{id:'7'},session)).id,created.id);
});
test('reload restores each tab independently with current file metadata and selected grid, without rewriting documents',async t=>{
 const f=await fixture(t),registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());
 const first=await registry.create('First',f.C.addConfig(f.C.demoDocument('blank'),'Second grid')),second=await registry.create('Other file');
 const a=memory(),b=memory();f.spaces.rememberWorkspace({id:first.id,configIndex:1},a);f.spaces.rememberWorkspace({id:second.id,configIndex:0},b);
 await registry.update(first.id,{name:'Renamed while open'});
 const before=Array.from({length:f.local.length},(_,i)=>[f.local.key(i),f.local.getItem(f.local.key(i))]);
 const reopened=await f.spaces.resumeWorkspace(registry,null,a);
 assert.equal(reopened.id,first.id);assert.equal(reopened.name,'Renamed while open');assert.equal(reopened.openConfigIndex,1);
 assert.equal((await f.spaces.resumeWorkspace(registry,null,b)).id,second.id);
 assert.deepEqual(Array.from({length:f.local.length},(_,i)=>[f.local.key(i),f.local.getItem(f.local.key(i))]),before);
 f.spaces.rememberWorkspace(null,a);assert.equal(await f.spaces.resumeWorkspace(registry,null,a),null);
 assert.equal((await f.spaces.resumeWorkspace(registry,null,b)).id,second.id);
});
test('resume skips archived, missing, or another account files and tolerates unavailable session storage',async()=>{
 const [,spaces]=await modules,session=memory();let meta={id:'file',name:'Private',account:'7'};
 const registry={get:async()=>meta};
 for(const user of [null,{id:'8'}]){spaces.rememberWorkspace({id:'file',configIndex:0},session);assert.equal(await spaces.resumeWorkspace(registry,user,session),null);assert.equal(session.length,0);}
 spaces.rememberWorkspace({id:'file',configIndex:0},session);assert.equal((await spaces.resumeWorkspace(registry,{id:'7'},session)).id,'file');
 for(const value of [{...meta,archived:true},undefined]){meta=value;spaces.rememberWorkspace({id:'file'},session);assert.equal(await spaces.resumeWorkspace(registry,{id:'7'},session),null);}
 session.setItem('gridstudio.workspace-session.v1','{broken');assert.equal(await spaces.resumeWorkspace(registry,null,session),null);
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('quota');},removeItem(){throw Error('blocked');}};
 assert.doesNotThrow(()=>spaces.rememberWorkspace({id:'file'},blocked));assert.doesNotThrow(()=>spaces.rememberWorkspace(null,blocked));
 assert.equal(await spaces.resumeWorkspace(registry,null,blocked),null);
});
async function fixture(t){const [storage,spaces,C]=await modules;const previous={localStorage:Object.getOwnPropertyDescriptor(globalThis,'localStorage'),indexedDB:Object.getOwnPropertyDescriptor(globalThis,'indexedDB')};
 const local=memory();Object.defineProperty(globalThis,'localStorage',{value:local,configurable:true});Object.defineProperty(globalThis,'indexedDB',{value:new IDBFactory(),configurable:true});
 t.after(()=>{for(const [k,v] of Object.entries(previous)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}});
 return {storage,spaces,C:C.default,local};}
test('workspace namespaces preserve legacy raw autosave and isolate documents and backups',async t=>{
 const f=await fixture(t),legacy=f.C.demoDocument('roles');const raw=JSON.stringify(legacy);f.local.setItem(f.storage.PROJECT_KEY,raw);
 const registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());
 assert.equal((await registry.get('legacy')).name,legacy.name);assert.equal(f.local.getItem(f.storage.PROJECT_KEY),raw);
 const a=await registry.create('A'),b=await registry.create('B');
 const sa=await f.storage.createProjectStorage(f.C.importProject,'1.0.0',a.id),sb=await f.storage.createProjectStorage(f.C.importProject,'1.0.0',b.id);
 t.after(()=>{sa.database?.close();sb.database?.close();});const da=(await sa.load()).doc,db=(await sb.load()).doc;
 assert.deepEqual(da.entities,[]);assert.deepEqual(db.entities,[]);assert.equal(da.source.configs.length,1);assert.deepEqual(da.source.configs[0].categories,[]);
 da.name='ONLY A';await sa.save(da);assert.notEqual((await sb.load()).doc.name,'ONLY A');assert.equal(f.local.getItem(f.storage.PROJECT_KEY),raw);
 const previous=await f.storage.createProjectStorage(f.C.importProject,'1.0.0');t.after(()=>previous.database?.close());assert.equal((await previous.load()).doc.name,legacy.name);
 assert.ok((await sa.records()).every(r=>!r.raw.includes('ONLY B')));assert.deepEqual(db.source,(await sb.load()).doc.source);
});
test('cloud writes are debounced, retain full files, and connection failure leaves recoverable local edits',async t=>{
 const f=await fixture(t),registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());const meta=await registry.create('File',f.C.demoDocument('roles'),'7');
 let server=null,calls=0,offline=false;const statuses=[];
 const api=async(path,options={})=>{if(offline)throw Error('offline');if(options.method==='PUT'){calls++;server={...options.body,revision:(server?.revision||0)+1,archived:false};return {revision:server.revision};}if(!server)throw Object.assign(Error('not found'),{status:404});return server;};
 const opened=await f.spaces.openWorkspace(meta,registry,api,{id:'7'},s=>statuses.push(s),{retryDelay:1});t.after(()=>opened.storage.database?.close());
 const doc=opened.initial.doc;for(let i=0;i<3;i++){doc.name='Edit '+i;await opened.storage.save(doc);}await opened.storage.syncPending();
 assert.equal(calls,1);assert.equal(server.document.name,'Edit 2');assert.equal((await registry.get(meta.id)).dirty,false);
 offline=true;doc.name='Offline edit';await opened.storage.save(doc);await opened.storage.syncPending();assert.equal((await registry.get(meta.id)).dirty,true);assert.match(statuses.at(-1),/Локальная копия/);
 const again=await f.storage.createProjectStorage(f.C.importProject,'1.0.0',meta.id);t.after(()=>again.database?.close());assert.equal((await again.load()).doc.name,'Offline edit');
});
test('an upload lost to an API restart is resent automatically, never over a newer edit',async t=>{
 const f=await fixture(t),registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());const meta=await registry.create('File',f.C.demoDocument('roles'),'7');
 let server=null,failures=0;const sent=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
 // nginx answers 502 while the API restarts; catalogAPI then throws without a status.
 const api=async(path,options={})=>{if(options.method!=='PUT'){if(!server)throw Object.assign(Error('not found'),{status:404});return server;}
  if(failures){failures--;throw Error('Каталог сейчас недоступен.');}sent.push(options.body.document.name);server={...options.body,revision:(server?.revision||0)+1,archived:false};return {revision:server.revision};};
 const opened=await f.spaces.openWorkspace(meta,registry,api,{id:'7'},()=>{},{retryDelay:5});t.after(()=>opened.storage.database?.close());
 const doc=opened.initial.doc;failures=2;doc.name='Last edit before closing';await opened.storage.save(doc);await opened.storage.syncPending();
 assert.equal((await registry.get(meta.id)).dirty,true);assert.deepEqual(sent,[]);
 await wait(150);await opened.storage.syncPending();
 assert.deepEqual(sent,['Last edit before closing']);assert.equal((await registry.get(meta.id)).dirty,false);
 failures=1;doc.name='Lost';await opened.storage.save(doc);await opened.storage.syncPending();
 doc.name='Newer';await opened.storage.save(doc);await opened.storage.syncPending();
 await wait(100);await opened.storage.syncPending();
 assert.deepEqual(sent,['Last edit before closing','Newer']);assert.equal(server.document.name,'Newer');
});
test('newer cloud version never overwrites dirty local data, and another account cannot open the cache',async t=>{
 const f=await fixture(t),registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());const doc=f.C.demoDocument('blank');doc.name='Local work';const meta=await registry.create('File',doc,'7');
 await registry.update(meta.id,{cloudRevision:1,dirty:true});const remote=f.C.demoDocument('roles');remote.name='Other device';let writes=0;
 const api=async(path,options={})=>{if(options.method==='PUT')writes++;return {document:remote,revision:2,name:'Remote',archived:false};};
 const statuses=[],opened=await f.spaces.openWorkspace(await registry.get(meta.id),registry,api,{id:'7'},s=>statuses.push(s));t.after(()=>opened.storage.database?.close());
 assert.equal(opened.initial.doc.name,'Local work');assert.match(statuses[0],/Конфликт/);await opened.storage.save(doc);await opened.storage.syncPending();assert.equal(writes,0);
 await assert.rejects(f.spaces.openWorkspace(meta,registry,api,{id:'8'}),/аккаунт/);
});
test('clean remote hydration protects the previous local document and does not alter other files',async t=>{
 const f=await fixture(t),registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());const old=f.C.demoDocument('blank');old.name='Before cloud';const meta=await registry.create('File',old,'7');
 await registry.update(meta.id,{cloudRevision:1,dirty:false});const remote=f.C.demoDocument('roles');remote.name='After cloud';
 const opened=await f.spaces.openWorkspace(await registry.get(meta.id),registry,async()=>({document:remote,revision:2,name:'Remote',archived:false}),{id:'7'});t.after(()=>opened.storage.database?.close());
 assert.equal(opened.initial.doc.name,'After cloud');assert.ok((await opened.storage.records()).some(r=>r.raw.includes('Before cloud')));
 assert.equal((await registry.get(meta.id)).cloudRevision,2);
});
test('corrupt legacy data remains available for recovery when workspace dashboard opens',async t=>{
 const f=await fixture(t);f.local.setItem(f.storage.PROJECT_KEY,'{broken');const registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());
 assert.ok((await registry.get('legacy')).issue);assert.equal(f.local.getItem(f.storage.PROJECT_KEY),'{broken');await registry.create('Safe new file');assert.equal(f.local.getItem(f.storage.PROJECT_KEY),'{broken');
});

function cloudAPI() {
 const files=new Map();let calls=0;
 return {files,get calls(){return calls;},api:async(path,options={})=>{
  const id=path.split('/').at(-1),old=files.get(id);
  if(options.method!=='PUT'){if(!old)throw Object.assign(Error('missing'),{status:404});return old;}
  calls++;const body=options.body;
  if(old&&JSON.stringify(old.document)===JSON.stringify(body.document)&&old.name===body.name)return {revision:old.revision};
  if(old&&old.revision!==body.revision)throw Object.assign(Error('conflict'),{status:409});
  const next={...structuredClone(body),revision:(old?.revision||0)+1};files.set(id,next);return {revision:next.revision};
 }};
}
test('sign-in attaches guest and archived files in place, preserves legacy keys and never transfers another account',async t=>{
 const f=await fixture(t),raw=JSON.stringify(f.C.demoDocument('roles'));f.local.setItem(f.storage.PROJECT_KEY,raw);
 const registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());
 const guest=await registry.create('Guest'),archived=await registry.create('Archived');await registry.update(archived.id,{archived:true});
 const foreign=await registry.create('Foreign',undefined,'other'),cloud=cloudAPI();
 assert.deepEqual(await f.spaces.attachGuestWorkspaces(registry,cloud.api,{id:'7'}),[]);
 const local=await registry.list();assert.equal(local.length,4);assert.equal(cloud.files.size,3);
 for(const id of ['legacy',guest.id,archived.id]){const m=await registry.get(id);assert.equal(m.account,'7');assert.equal(m.dirty,false);assert.equal(m.pendingUpload,false);}
 assert.equal((await registry.get(foreign.id)).account,'other');assert.equal(cloud.files.get(archived.id).archived,true);
 const legacy=await registry.get('legacy');assert.match(legacy.cloudId,/^[a-f0-9-]{36}$/);assert.equal(f.local.getItem(f.storage.PROJECT_KEY),raw);
 await f.spaces.attachGuestWorkspaces(registry,cloud.api,{id:'7'});assert.equal(cloud.calls,3);
 const opened=await f.spaces.openWorkspace(legacy,registry,cloud.api,{id:'7'});t.after(()=>opened.storage.database?.close());assert.equal(opened.initial.doc.name,JSON.parse(raw).name);
});
test('interrupted automatic transfer retries the same UUID without duplicate files or reassignment',async t=>{
 const f=await fixture(t),registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());const entry=await registry.create('Pending'),cloud=cloudAPI();
 const lost=async(path,options)=>{await cloud.api(path,options);throw Error('response lost');};
 assert.equal((await f.spaces.attachGuestWorkspaces(registry,lost,{id:'7'})).length,1);
 assert.equal((await registry.get(entry.id)).pendingUpload,true);
 await f.spaces.attachGuestWorkspaces(registry,cloud.api,{id:'8'});assert.equal(cloud.calls,1);
 await f.spaces.attachGuestWorkspaces(registry,cloud.api,{id:'7'});assert.equal(cloud.files.size,1);assert.equal((await registry.get(entry.id)).pendingUpload,false);
});
test('an open guest file flushes and connects without leaving the editor, then syncs subsequent edits',async t=>{
 const f=await fixture(t),registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());const entry=await registry.create('Open'),cloud=cloudAPI();
 const opened=await f.spaces.openWorkspace(entry,registry,cloud.api,null);t.after(()=>opened.storage.database?.close());const doc=opened.initial.doc;
 const unregister=f.spaces.registerActiveWorkspace(entry.id,{flush:async()=>{doc.name='Latest live edit';await opened.storage.save(doc);},attach:user=>opened.storage.attachAccount(user)});t.after(unregister);
 assert.deepEqual(await f.spaces.attachGuestWorkspaces(registry,cloud.api,{id:'7'}),[]);assert.equal(cloud.files.get(entry.id).document.name,'Latest live edit');
 doc.name='After sign-in';await opened.storage.save(doc);await opened.storage.syncPending();assert.equal(cloud.files.get(entry.id).document.name,'After sign-in');assert.equal(cloud.files.size,1);
});
test('automatic transfer keeps invalid files local and reports failures without dropping other files',async t=>{
 const f=await fixture(t);f.local.setItem(f.storage.PROJECT_KEY,'{broken');const registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());const valid=await registry.create('Valid'),cloud=cloudAPI();
 const errors=await f.spaces.attachGuestWorkspaces(registry,cloud.api,{id:'7'});assert.equal(errors.length,1);assert.equal((await registry.get('legacy')).account,null);assert.equal(f.local.getItem(f.storage.PROJECT_KEY),'{broken');assert.ok(cloud.files.has(valid.id));
});

test('file previews read all local grids, prefer newer cloud files, and retain the local preview offline',async t=>{
 const f=await fixture(t),{readWorkspacePreview}=await import('../scripts/workspace-preview.mjs');
 const registry=await f.spaces.openWorkspaceRegistry();t.after(()=>registry.database?.close());const doc=f.C.addConfig(f.C.demoDocument('roles'),'Second');const meta=await registry.create('Two grids',doc);
 let calls=0;const remote=f.C.addConfig(doc,'Third');const api=async()=>{calls++;return {document:remote};};
 const local=await readWorkspacePreview(meta,api);assert.equal(local.document.source.configs.length,2);assert.equal(calls,0);
 const stale={...meta,account:'7',cloudRevision:1,remoteRevision:2};
 assert.equal((await readWorkspacePreview(stale,api)).document.source.configs.length,3);assert.equal(calls,1);
 const offline=await readWorkspacePreview(stale,async()=>{throw Error('offline');});assert.equal(offline.offline,true);assert.equal(offline.document.source.configs.length,2);
 assert.equal((await readWorkspacePreview({...stale,dirty:true},api)).document.source.configs.length,2);assert.equal(calls,1);
 const abort=new AbortController();abort.abort();await assert.rejects(readWorkspacePreview(stale,api,abort.signal),{name:'AbortError'});
});
