const {test}=require('node:test');
const assert=require('node:assert/strict');
const modules=Promise.all([import('../scripts/steam-profile.mjs'),import('../server/steam-profile.mjs')]);
const expected={accountId:'1168402705',steamId64:'76561199128668433'};
const xml=id=>new Response(`<?xml version="1.0"?><profile><steamID64>${id}</steamID64></profile>`);

test('friend codes and numeric profile links resolve exactly without floating point loss',async()=>{
 const [{parseSteamProfile,steamAccount}]=await modules;
 for(const input of ['1168402705',' 1168402705 ','76561199128668433','https://steamcommunity.com/profiles/76561199128668433/','steamcommunity.com/profiles/76561199128668433?l=russian'])
  assert.deepEqual(parseSteamProfile(input),{kind:'account',...expected});
 assert.equal(steamAccount('4294967295').steamId64,'76561202255233023');
 assert.equal(steamAccount('76561197960265729',true).accountId,'1');
 assert.throws(()=>steamAccount(76561199128668433,true));
 assert.deepEqual(parseSteamProfile('https://steamcommunity.com/id/7771/'),{kind:'vanity',vanity:'7771'});
 assert.deepEqual(parseSteamProfile('http://www.steamcommunity.com/id/Test_Name-1/?l=russian'),{kind:'vanity',vanity:'Test_Name-1'});
});

test('invalid accounts and URLs cannot be used to request arbitrary hosts or paths',async()=>{
 const [{parseSteamProfile}]=await modules;
 for(const input of ['',null,{},'0','-1','1e9','4294967296','76561197960265728','103582791429521412','https://steamcommunity.com.evil.test/id/me','https://steamcommunity.com@evil.test/id/me','https://evil.test@steamcommunity.com/id/me','https://steamcommunity.com:444/id/me','file:///etc/passwd','https://steamcommunity.com/id/a/b','https://steamcommunity.com/id/%2e%2e','https://steamcommunity.com/profiles/abc','x'.repeat(257)])
  assert.throws(()=>parseSteamProfile(input),undefined,String(input));
});

test('folder uses the exact account and supports a different Steam installation directory',async()=>{
 const [{steamConfigFolder}]=await modules;
 assert.equal(steamConfigFolder(expected.accountId),'C:\\Program Files (x86)\\Steam\\userdata\\1168402705\\570\\remote\\cfg');
 assert.equal(steamConfigFolder(expected.accountId,' "D:/Games/Steam/" '),'D:\\Games\\Steam\\userdata\\1168402705\\570\\remote\\cfg');
 assert.equal(steamConfigFolder('1','D:\\'),'D:\\userdata\\1\\570\\remote\\cfg');
 assert.match(steamConfigFolder(null),/ID АККАУНТА/);
 assert.throws(()=>steamConfigFolder('1','Steam'));assert.throws(()=>steamConfigFolder('0'));
});

test('resolver uses fixed Steam XML endpoint with bounded request and caches the result',async()=>{
 const [,{SteamProfiles}]=await modules;let requests=0,time=1000;
 const resolver=new SteamProfiles({now:()=>time,fetch:async(url,options)=>{requests++;assert.equal(String(url),'https://steamcommunity.com/id/7771/?xml=1');assert.equal(options.redirect,'error');assert.ok(options.signal);return xml(expected.steamId64);}});
 assert.deepEqual(await resolver.resolve('1168402705'),expected);assert.equal(requests,0);
 assert.deepEqual(await resolver.resolve('https://steamcommunity.com/id/7771/'),expected);
 assert.deepEqual(await resolver.resolve('https://steamcommunity.com/id/7771/?redirect=http://127.0.0.1'),expected);assert.equal(requests,1);
 time+=16*60000;await resolver.resolve('https://steamcommunity.com/id/7771/');assert.equal(requests,2);
 await assert.rejects(resolver.resolve('https://localhost/id/7771/'),e=>e.status===400);assert.equal(requests,2);
});

test('API key stays in server request and XML is a fallback for unavailable API',async()=>{
 const [,{SteamProfiles}]=await modules;const calls=[];
 const resolver=new SteamProfiles({apiKey:'test-only-key',fetch:async url=>{calls.push(String(url));return Response.json({response:{success:1,steamid:expected.steamId64}});}});
 assert.deepEqual(await resolver.resolve('https://steamcommunity.com/id/7771/'),expected);assert.equal(calls.length,1);
 const url=new URL(calls[0]);assert.equal(url.origin,'https://api.steampowered.com');assert.equal(url.searchParams.get('key'),'test-only-key');assert.equal(url.searchParams.get('vanityurl'),'7771');
 let failedCalls=0;const fallback=new SteamProfiles({apiKey:'test-only-key',fetch:async()=>++failedCalls===1?new Response('',{status:403}):xml(expected.steamId64)});
 assert.deepEqual(await fallback.resolve('https://steamcommunity.com/id/7771/'),expected);assert.equal(failedCalls,2);
});

test('not found, upstream errors, unexpected HTML and oversized XML give safe useful errors',async()=>{
 const [,{SteamProfiles}]=await modules;
 for(const [response,status] of [
  [()=>Response.json({response:{success:42}}),404],
  [()=>new Response('<response><error>not found</error></response>'),404],
  [()=>new Response('',{status:429}),503],
  [()=>new Response(`<html><steamID64>${expected.steamId64}</steamID64></html>`),503],
  [()=>new Response('<profile>'+ 'x'.repeat(262145)+'</profile>'),503],
  [()=>xml('103582791429521412'),503],
  [()=>{throw new Error('secret-test-key in upstream error');},503]
 ]) {
  const resolver=new SteamProfiles({apiKey:status===404?'test-only-key':'',fetch:async()=>response()});
  await assert.rejects(resolver.resolve('https://steamcommunity.com/id/7771/'),e=>e.status===status&&!e.message.includes('secret-test-key'));
 }
});

test('simultaneous lookups of one alias reuse one request',async()=>{
 const [,{SteamProfiles}]=await modules;let finish,calls=0;
 const resolver=new SteamProfiles({fetch:async()=>{calls++;return new Promise(r=>finish=r);}});
 const first=resolver.resolve('https://steamcommunity.com/id/7771/'),second=resolver.resolve('https://steamcommunity.com/id/7771/');
 finish(xml(expected.steamId64));assert.deepEqual(await first,expected);assert.deepEqual(await second,expected);assert.equal(calls,1);
});

test('public lookup route does not require login, validates inputs and limits requests',async t=>{
 const [{CatalogStore},{createCatalogAPI},[,{SteamProfiles}]]=await Promise.all([import('../server/catalog-store.mjs'),import('../server/catalog-api.mjs'),modules]);
 const store=new CatalogStore(':memory:','test-only-salt');let calls=0;
 const resolver=new SteamProfiles({fetch:async()=>{calls++;return xml(expected.steamId64);}});
 const {server}=createCatalogAPI({origin:'http://127.0.0.1',development:true,salt:'test-only-salt',steamApiKey:'secret-not-for-clients'}, {store,steamProfiles:resolver});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
 const base=`http://127.0.0.1:${server.address().port}/api/catalog`;
 const lookup=profile=>fetch(`${base}/steam/resolve?${new URLSearchParams({profile})}`);
 const response=await lookup('https://steamcommunity.com/id/7771/');assert.equal(response.status,200);assert.deepEqual(await response.json(),expected);
 assert.equal((await lookup('https://example.com')).status,400);assert.equal(calls,1);
 for(let n=0;n<18;n++) assert.equal((await lookup('1168402705')).status,200);
 assert.equal((await lookup('1168402705')).status,429);
 assert.equal(JSON.stringify(await (await fetch(`${base}/config`)).json()).includes('secret-not-for-clients'),false);
});

test('the shared Steam lookup resolves friend codes locally and custom names through the API, with readable failures', async () => {
  const { findSteamAccount } = await import('../scripts/steam-folder.mjs');
  const original = globalThis.fetch, calls = [];
  let reply;
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return reply(); };
  try {
    let looked = 0;
    assert.equal((await findSteamAccount('123456789', { onLookup: () => looked++ })).accountId, '123456789');
    assert.deepEqual([calls.length, looked], [0, 0]);
    reply = () => ({ ok: true, json: async () => ({ steamId64: '76561198083722517', accountId: '123456789' }) });
    assert.equal((await findSteamAccount(' steamcommunity.com/id/player ', { onLookup: () => looked++ })).accountId, '123456789');
    assert.equal(looked, 1);
    assert.match(calls[0].url, /^\/api\/catalog\/steam\/resolve\?profile=steamcommunity\.com%2Fid%2Fplayer$/);
    reply = () => ({ ok: true, json: async () => ({ steamId64: '76561198083722517', accountId: '1' }) });
    await assert.rejects(findSteamAccount('steamcommunity.com/id/player'), /Введи его вручную/);
    reply = () => ({ ok: false, json: async () => ({ error: 'Профиль не найден.' }) });
    await assert.rejects(findSteamAccount('steamcommunity.com/id/player'), /Профиль не найден/);
    reply = () => { throw new TypeError('fetch failed'); };
    await assert.rejects(findSteamAccount('steamcommunity.com/id/player'), /Steam сейчас недоступен/);
    await assert.rejects(findSteamAccount('https://example.com/id/player'), /steamcommunity\.com/);
  } finally { globalThis.fetch = original; }
});
