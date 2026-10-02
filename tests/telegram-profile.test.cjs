const {test}=require('node:test');
const assert=require('node:assert/strict');

test('Telegram avatar uses the current photo, returns a bounded PNG and keeps the token out of public data',async()=>{
 const {telegramAvatar}=await import('../server/telegram-profile.mjs');const {createCanvas,loadImage}=await import('@napi-rs/canvas');
 const source=createCanvas(160,120);source.getContext('2d').fillRect(0,0,160,120);
 const api={getUserProfilePhotos:async options=>{assert.deepEqual(options,{user_id:7,limit:1});return {photos:[[{file_id:'small',width:40},{file_id:'current',width:160},{file_id:'large',width:640}]]};},getFile:async options=>{assert.equal(options.file_id,'current');return {file_path:'photos/file_1.jpg'};}};
 const bytes=await telegramAvatar(api,'test-token',7,async(url,options)=>{assert.equal(url,'https://api.telegram.org/file/bottest-token/photos/file_1.jpg');assert.equal(options.redirect,'error');return new Response(source.toBuffer('image/png'));});
 const image=await loadImage(bytes);assert.equal(image.width,96);assert.equal(image.height,96);assert.equal(bytes.includes(Buffer.from('test-token')),false);
});
test('hidden/missing Telegram photos produce a fallback, unsafe paths and non-images are rejected',async()=>{
 const {telegramAvatar}=await import('../server/telegram-profile.mjs');
 assert.equal(await telegramAvatar({getUserProfilePhotos:async()=>({photos:[]})},'token',7),null);
 const api={getUserProfilePhotos:async()=>({photos:[[{file_id:'photo',width:160}]]}),getFile:async()=>({file_path:'../token'})};
 await assert.rejects(telegramAvatar(api,'token',7,()=>{throw Error('must not fetch');}),/unavailable/);
 api.getFile=async()=>({file_path:'photos/file.jpg'});await assert.rejects(telegramAvatar(api,'token',7,async()=>new Response('<svg>not an avatar</svg>')),/not a photo/);
 await assert.rejects(telegramAvatar(api,'token',7,async()=>new Response('x',{headers:{'content-length':'3000000'}})),/unavailable/);
});
test('avatar cache belongs to the signed-in user and removing a photo clears the previous one',async t=>{
 const {CatalogStore}=await import('../server/catalog-store.mjs'),{Accounts}=await import('../server/accounts.mjs');const store=new CatalogStore(':memory:','test');t.after(()=>store.close());const accounts=new Accounts(store);
 const request=accounts.begin('ip','browser');accounts.candidate(request.id,{id:7,first_name:'Display name',username:'real_username'});accounts.setAvatar(7,Buffer.from('photo'));accounts.approve(request.id,7,true);const session=accounts.finish(request.id,request.verifier,'7');
 const user=accounts.user(session.session);assert.equal(user.username,'real_username');assert.equal(Buffer.from(accounts.avatar({id:'7'})).toString(),'photo');assert.equal(accounts.avatar({id:'8'}),undefined);
 // The site shows the profile's pattern until its owner picks the Telegram photo (server/profiles.mjs).
 assert.match(user.avatar,/\/avatar\?v=p$/);
 await store.profiles.setAvatar(7,'telegram');assert.match(accounts.user(session.session).avatar,/\/avatar\?v=t[0-9a-f]+$/);
 accounts.setAvatar(7,null);assert.equal(accounts.avatar({id:'7'}),undefined);assert.equal(store.profiles.avatar(user.profile).type,'image/svg+xml','the photo is gone: the pattern again');
});
