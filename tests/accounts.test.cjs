const { proof } = require('./captcha-helper.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const modules = Promise.all([import('../server/catalog-store.mjs'), import('../server/accounts.mjs'), import('../server/catalog-api.mjs'), import('../scripts/core.mjs')]);
const from = id => ({ id, first_name: `Игрок ${id}`, username: `test_${id}`, is_bot: false });
const input = x => ({ title: 'Сетка '+x, author: '', tags: ['Аниме'], grid: { version: 3, configs: [{ config_name: 'Test', categories: [{ category_name: '@', x_position:x,y_position:30,width:30,height:30,hero_ids:[] }] }] } });
const identity = { browser: 'test-browser', ip: 'test-ip' };
async function fixture(t) {
  const [{ CatalogStore }, { Accounts },, C] = await modules; let now = Date.now();
  const store = new CatalogStore(':memory:', 'test-salt', () => now), accounts = new Accounts(store); t.after(()=>store.close());
  function login(id = 123) { const r = accounts.begin('ip'+id, 'browser'+id); accounts.candidate(r.id, from(id)); accounts.approve(r.id,id,true); return accounts.finish(r.id,r.verifier,String(id)); }
  return { store, accounts, C:C.default, login, advance: delta => {now+=delta;} };
}
test('bot login is browser-bound, expires, needs confirmation and is consumed once', async t => {
  const {accounts, advance} = await fixture(t), r = accounts.begin('a','b');
  assert.ok(('login_'+r.id).length<=64); assert.equal(r.code,undefined);
  assert.throws(()=>accounts.poll(r.id,'wrong'), e=>e.status===404);
  assert.throws(()=>accounts.finish(r.id,r.verifier,'123'), e=>e.status===409);
  accounts.candidate(r.id,from(123)); assert.throws(()=>accounts.candidate(r.id,from(456)),e=>e.status===409);
  assert.throws(()=>accounts.approve(r.id,456,true),e=>e.status===403);
  accounts.approve(r.id,123,true); assert.throws(()=>accounts.finish(r.id,r.verifier,'456'),e=>e.status===409);
  const session = accounts.finish(r.id,r.verifier,'123'); assert.equal(accounts.user(session.session).id,'123');
  assert.throws(()=>accounts.finish(r.id,r.verifier,'123'),e=>e.status===410);
  accounts.logout(session.session); assert.equal(accounts.user(session.session),null);
  const expired=accounts.begin('c','d'); advance(300001); assert.throws(()=>accounts.candidate(expired.id,from(123)),e=>e.status===410);
});
test('cancelled login cannot create a session; sessions expire and login is rate limited', async t => {
  const f=await fixture(t), r=f.accounts.begin('a','b'); f.accounts.candidate(r.id,from(123)); f.accounts.approve(r.id,123,false);
  assert.throws(()=>f.accounts.finish(r.id,r.verifier,'123'),e=>e.status===410);
  const session=f.login(); f.advance(31*86400000); assert.equal(f.accounts.user(session.session),null);
  for(let i=0;i<5;i++) f.accounts.begin('shared','same'); assert.throws(()=>f.accounts.begin('shared','same'),e=>e.status===429);
});
test('guest publication can be claimed once with ownership proof; a bound key cannot edit as another account', async t => {
  const f=await fixture(t), a=f.login(1), b=f.login(2), work=f.store.save(input(10),identity);
  assert.throws(()=>f.accounts.claim(work.id,'bad',a.user),e=>e.status===404);
  f.accounts.claim(work.id,work.managementToken,a.user);
  assert.equal(f.accounts.publications(a.user).length,1); assert.equal(f.accounts.publications(b.user).length,0);
  assert.throws(()=>f.accounts.claim(work.id,work.managementToken,b.user),e=>e.status===404);
  assert.throws(()=>f.store.ownerView(work.id,work.managementToken),e=>e.status===404);
  assert.equal(f.store.ownerView(work.id,'',a.user.id).linked,true);
});
test('one like per Telegram account, unliking is idempotent, popular sorting excludes private/deleted works', async t => {
  const f=await fixture(t), a=f.login(1), b=f.login(2), first=f.store.save(input(10),identity), second=f.store.save(input(20),identity);
  assert.throws(()=>f.store.like(first.id,a.user.id,true),e=>e.status===404);
  for(const w of [first,second]) f.store.moderate(w.id,{revision:w.revision,action:'approve'});
  assert.throws(()=>f.store.like(first.id,null,true),e=>e.status===401);
  f.store.like(first.id,a.user.id,true); f.store.like(first.id,a.user.id,true); assert.equal(f.store.publicItem(first.id).likes,1);
  f.store.like(second.id,a.user.id,true); f.store.like(second.id,b.user.id,true);
  assert.equal(f.store.list({popular:true}).items[0].id,second.id);
  assert.equal(f.store.publicItem(second.id,a.user.id).liked,true);
  f.store.like(second.id,b.user.id,false); f.store.like(second.id,b.user.id,false); assert.equal(f.store.publicItem(second.id).likes,1);
  f.store.remove(second.id,second.managementToken); assert.equal(f.store.list({popular:true}).total,1);
});
test('private workspaces preserve full native files, use optimistic revisions and isolate accounts', async t => {
  const f=await fixture(t), a=f.login(1), b=f.login(2), id=randomUUID(), doc=f.C.demoDocument('roles');
  const body={account:a.user.id,name:'Мой файл',revision:0,document:doc};
  const saved=f.accounts.saveSpace(id,a.user,body); assert.equal(saved.revision,1);
  assert.equal(f.accounts.saveSpace(id,a.user,body).revision,1); // uncertain-response retry
  assert.deepEqual(f.accounts.space(id,a.user).document,doc);
  assert.throws(()=>f.accounts.space(id,b.user),e=>e.status===404);
  assert.throws(()=>f.accounts.saveSpace(id,b.user,{...body,account:b.user.id}),e=>e.status===404);
  assert.throws(()=>f.accounts.saveSpace(id,a.user,{...body,name:'stale'}),e=>e.status===409);
  f.accounts.saveSpace(id,a.user,{...body,revision:1,name:'Другое имя'});
  assert.equal(f.accounts.listSpaces(a.user)[0].name,'Другое имя');
  assert.throws(()=>f.accounts.archiveSpace(id,a.user,1,true),e=>e.status===409);
  f.accounts.archiveSpace(id,a.user,2,true); assert.equal(f.accounts.listSpaces(a.user).length,0); assert.equal(f.accounts.listSpaces(a.user,true).length,1);
  f.accounts.archiveSpace(id,a.user,3,false); assert.equal(f.accounts.space(id,a.user).revision,4);
  assert.throws(()=>f.accounts.saveSpace(randomUUID(),a.user,{...body,document:{}}),e=>e.status===400);
  const archivedId=randomUUID(),archivedBody={...body,archived:true};
  assert.equal(f.accounts.saveSpace(archivedId,a.user,archivedBody).revision,1);
  assert.equal(f.accounts.saveSpace(archivedId,a.user,archivedBody).revision,1);
  assert.equal(f.accounts.space(archivedId,a.user).archived,1);
});
test('HTTP login cookies, anonymous publication, claims and edit/like/workspace authorization', async t => {
  const [{CatalogStore},,{createCatalogAPI},C] = await modules;
  const store=new CatalogStore(':memory:','test-salt'), config={origin:'http://127.0.0.1:4173',development:true,salt:'test-salt',botUsername:'grid_studio_bot'};
  const {server,accounts}=createCatalogAPI(config,{store}); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));store.close();}); const base=`http://127.0.0.1:${server.address().port}/api/catalog`; let cookie='';
  async function call(path,method='GET',body,extra={}) {
    const r=await fetch(base+path,{method,headers:{Origin:config.origin,Cookie:cookie,'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
    for(const set of r.headers.getSetCookie()){const name=set.split('=')[0];cookie=cookie.split('; ').filter(v=>v&&!v.startsWith(name+'=')).concat(set.split(';')[0]).join('; ');}
    return {status:r.status,body:await r.json(),headers:r.headers};
  }
  const saved=await call('/works','POST',{...input(10),captcha:await proof(call)}); assert.equal(saved.status,201); const id=saved.body.id, token=saved.body.managementToken;
  store.moderate(id,{action:'approve',revision:saved.body.revision});
  assert.equal((await call(`/manage/${id}`,'PATCH',{...input(11),revision:saved.body.revision},{Authorization:'Bearer '+token})).status,401);
  assert.equal((await call(`/works/${id}/like`,'PUT',{liked:true})).status,401);
  assert.equal((await call('/spaces')).status,401);
  const begin=await call('/auth/start','POST',{}); assert.equal(begin.status,201); assert.match(begin.body.url,/grid_studio_bot\?start=login_/); assert.ok(begin.headers.get('set-cookie').includes('HttpOnly'));
  accounts.candidate(begin.body.id,from(7)); accounts.approve(begin.body.id,7,true);
  assert.equal((await call(`/auth/status?id=${begin.body.id}`)).body.state,'approved');
  const finish=await call('/auth/finish','POST',{id:begin.body.id,userId:'7'}); assert.equal(finish.status,200);
  assert.equal((await call('/auth/me')).body.user.id,'7');
  accounts.setAvatar(7,Buffer.from('private-photo'));
  assert.match((await call('/auth/me')).body.user.avatar,/^\/api\/catalog\/auth\/avatar\?v=7-/);
  const photo=await fetch(base+'/auth/avatar',{headers:{Cookie:cookie}});
  assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/png');assert.equal(photo.headers.get('cache-control'),'no-store');assert.equal(await photo.text(),'private-photo');
  assert.equal((await fetch(base+'/auth/avatar')).status,401);
  assert.equal((await call(`/manage/${id}/claim`,'POST',{}, {Authorization:'Bearer '+token})).status,200);
  assert.equal((await call(`/manage/${id}`,'PATCH',{...input(11),revision:saved.body.revision,captcha:await proof(call)})).status,200);
  assert.equal((await call('/mine')).body.items.length,1);
  assert.deepEqual(await call(`/works/${id}/like`,'PUT',{liked:true}).then(r=>[r.status,r.body.error]),[403,'Свою работу лайкнуть нельзя.'],'the claimed grid is now their own');
  const space=randomUUID();assert.equal((await call(`/spaces/${space}`,'PUT',{name:'File',account:'7',revision:0,document:C.default.demoDocument('blank')})).status,200);
  assert.equal((await call('/spaces')).body.items.length,1);
  assert.equal((await call('/auth/logout','POST',{}, {Origin:'https://evil.test'})).status,403);
  await call('/auth/logout','POST',{}); assert.equal((await call(`/manage/${id}`)).status,404); assert.equal((await call('/spaces')).status,401);
});
test('bot login buttons only confirm the same private chat and latest prompt', async t => {
  const f=await fixture(t), {CatalogTelegram}=await import('../server/catalog-telegram.mjs'); const messages=[],answers=[];
  const api={sendMessage:async body=>{messages.push(body);return {message_id:10};},answerCallbackQuery:async body=>answers.push(body),editMessageText:async()=>true};
  const worker=new CatalogTelegram(f.store,{origin:'http://127.0.0.1:4173'},api); worker.botId=42;
  const r=f.accounts.begin('a','b');
  await worker.loginMessage({text:'/start login_'+r.id,chat:{id:7,type:'private'},from:from(7)});assert.match(messages[0].text,/Войти в GridStudio/);assert.equal(messages[0].reply_markup.inline_keyboard[0][0].text,'Войти');
  const q={id:'cb',data:'login:yes:'+r.id,from:from(7),message:{message_id:10,chat:{id:7,type:'private'},from:{id:42}}};
  await worker.loginCallback({...q,from:from(8)});assert.equal(f.accounts.poll(r.id,r.verifier).state,'pending');
  await worker.loginCallback(q);assert.equal(f.accounts.poll(r.id,r.verifier).state,'approved');
});

test('«Студия» on another device: the list names the grids, and each grid is a picture of the account copy', async t => {
  const f = await fixture(t), a = f.login(1), b = f.login(2), id = randomUUID();
  const { renderSpaceThumbnail } = await import('../server/catalog-preview.mjs');
  const doc = f.C.importDota({ version: 3, configs: [{ config_name: 'Первая', categories: [{ category_name: 'A', x_position: 10, y_position: 30, width: 30, height: 30, hero_ids: [] }] },
    { config_name: 'Вторая', categories: [{ category_name: 'Керри', x_position: 10, y_position: 40, width: 120, height: 110, hero_ids: [1] }] }] }, 1);
  f.accounts.saveSpace(id, a.user, { name: 'Файл', account: a.user.id, revision: 0, document: doc });
  const [row] = f.accounts.listSpaces(a.user);
  assert.deepEqual(row.gridNames, ['Первая', 'Вторая']); assert.equal(row.configIndex, 1);
  const image = await f.accounts.spaceThumbnail(id, a.user, 1, renderSpaceThumbnail);
  assert.equal(image.subarray(0, 4).toString(), 'RIFF'); assert.equal(image.subarray(8, 12).toString(), 'WEBP');
  assert.equal(await f.accounts.spaceThumbnail(id, a.user, 1, () => { throw new Error('drawn twice'); }), image, 'one drawing per revision');
  await assert.rejects(async () => f.accounts.spaceThumbnail(id, b.user, 0, renderSpaceThumbnail), (e) => e.status === 404, 'another account');
  await assert.rejects(async () => f.accounts.spaceThumbnail(id, a.user, 2, renderSpaceThumbnail), (e) => e.status === 404, 'no such grid');
});
