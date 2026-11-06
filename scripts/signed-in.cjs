#!/usr/bin/env node
"use strict";
// Signed-in flows against a small fake API: check-in sync, pull, erase, disconnect, restore, damaged storage and account switching.
// Usage: node scripts/signed-in.cjs [chromium] [webkit]
const assert=require("node:assert/strict");
const {chromium,webkit}=require("playwright");
const {serve}=require("./serve-app.cjs");
const OWNER="owner@example.com",DEVICE="device-1";
const saved=(extra={})=>({moods:[],health:[],events:[],token:"key",deviceId:DEVICE,syncOwnerEmail:OWNER,pairedAt:1,...extra});
const mood=(id,extra={})=>({id,ts:"2026-11-01T10:00:00.000Z",score:3,energy:null,tags:[],note:"",...extra});
const shared={email:OWNER,cursor:"2026-11-02T00:00:00.000Z",moods:[],deleted:[]};

function fakeApi(overrides={}){
 const api={uploaded:[],deleted:[],moods:{...shared},failMoods:false,session:200,me:OWNER,pull:{ok:true,email:OWNER,complete:{health:true,events:true},health:[],events:[],alarms:[]},...overrides};
 api.handle=async route=>{
  const request=route.request(),url=new URL(request.url()),send=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  if(url.pathname==="/api/session"){
   if(api.session!==200)return send({ok:false,code:"signed_out"},api.session);
   return send({ok:true,status:{deviceId:DEVICE,credentialValid:true,...api.status},release:{},calendars:api.calendars||[],settings:{},look:api.look||null,moods:api.moods,reflections:{email:api.moods?.email,cursor:"",reflections:[],deleted:[]}});
  }
  if(url.pathname==="/api/moods"){
   if(api.failMoods)return send({ok:false,code:"unavailable"},503);
   if(request.method()==="GET")return send({ok:true,...api.moods});
   const body=request.postDataJSON();
   api.uploaded.push(...(body.moods||[]));api.deleted.push(...(body.deleted||[]));
   return send({ok:true});
  }
  if(url.pathname==="/api/reflections")return send({ok:true,email:api.moods?.email,cursor:"",reflections:[],deleted:[]});
  if(url.pathname==="/api/look"){api.look=request.postDataJSON().look;return send({ok:true,look:api.look});}
  if(url.pathname==="/api/pull")return send(api.pull);
  if(url.pathname==="/api/user/me")return api.me?send({ok:true,email:api.me,devices:[{id:DEVICE,label:"iPhone"}]}):send({ok:false,code:"signed_out"},401);
  if(url.pathname==="/api/user/erase")return send({ok:true,erased:true});
  return send({ok:true});
 };
 return api;
}
const IPHONE="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
async function open(browser,base,state,api,check,device={}){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block",...(device.iphone?{userAgent:IPHONE}:{})});
 const page=await context.newPage(),errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 await page.addInitScript(([value])=>{if(sessionStorage.getItem("seeded"))return;sessionStorage.setItem("seeded","1");localStorage.setItem("health:v1",value);},[typeof state==="string"?state:JSON.stringify(state)]);
 if(device.installed)await page.addInitScript(()=>Object.defineProperty(navigator,"standalone",{value:true}));
 if(device.midday){const noon=new Date();noon.setHours(12,0,0,0);await page.clock.setFixedTime(noon);}
 await context.route("**/api/**",api.handle);
 await page.goto(base+"/");
 try{
  await check({page,context});
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
}
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem("health:v1")));
const until=(page,fn,arg)=>page.waitForFunction(fn,arg,{timeout:8000});
const goTo=(page,tab)=>page.evaluate(name=>globalThis.App.navigate(name),tab);
const statusIs=(page,text)=>until(page,wanted=>document.getElementById("mood-sync-status").textContent.includes(wanted),text);
const saveCheckIn=async page=>{await page.click('[data-mood="4"]');await page.click("#save-mood");};
const confirm=page=>page.click("#confirm-yes");

const scenarios={
 "a signed-in session loads and says check-ins are synced":async(browser,base)=>{
  const api=fakeApi();
  await open(browser,base,saved(),api,async({page})=>{
   await goTo(page,"data");
   await statusIs(page,"All check-ins and reflections synced");
   assert.equal(await page.isVisible("#pair-connected"),true);
  });
 },
 "a check-in saved offline waits, then uploads when back online":async(browser,base)=>{
  const api=fakeApi();
  await open(browser,base,saved({moodCursor:shared.cursor}),api,async({page,context})=>{
   await statusIsReady(page);
   await context.setOffline(true);
   await until(page,()=>!navigator.onLine);
   await saveCheckIn(page);
   await goTo(page,"data");
   await statusIs(page,"1 check-in waiting. They’ll sync");
   assert.equal(api.uploaded.length,0);
   await context.setOffline(false);
   await statusIs(page,"All check-ins and reflections synced");
   assert.equal(api.uploaded.length,1);
   assert.deepEqual((await stored(page)).pendingMoods,[]);
  });
 },
 "a look previews without saving, saves to the account, and an account's look follows to a new device":async(browser,base)=>{
  const api=fakeApi();
  await open(browser,base,saved(),api,async({page})=>{
   await page.click(".nav-item[data-go=settings]");
   await page.check('#look-names input[value="n5"]',{force:true});
   assert.equal(await page.title(),"Gloaming");
   assert.equal(api.look,undefined);
   await page.click("#look-cancel");
   assert.notEqual(await page.title(),"Gloaming");
   await page.check('#look-names input[value="n2"]',{force:true});
   await page.click("#look-save");
   await until(page,()=>!localStorage.getItem("health-look-waiting"));
   assert.equal(api.look,"n2.i2.p2");
  });
  const next=fakeApi();next.look="n3.i3.p3";
  await open(browser,base,saved(),next,async({page})=>{
   await page.waitForFunction(()=>document.title==="Millpond");
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.palette),"p3");
  });
 },
 "a failed upload says so, keeps the check-in, and Try again sends it":async(browser,base)=>{
  const api=fakeApi({failMoods:true});
  await open(browser,base,saved({moodCursor:shared.cursor}),api,async({page})=>{
   await saveCheckIn(page);
   await goTo(page,"data");
   await statusIs(page,"Couldn’t sync 1 check-in");
   assert.equal((await stored(page)).pendingMoods.length,1);
   api.failMoods=false;
   await page.click("#mood-sync-retry");
   await statusIs(page,"All check-ins and reflections synced");
   assert.equal(api.uploaded.length,1);
  });
 },
 "a deletion or edit from another device arrives, but a waiting edit here isn't overwritten":async(browser,base)=>{
  const api=fakeApi({moods:{...shared,deleted:["gone"],moods:[mood("edited",{score:5}),mood("waiting",{score:1})]}});
  const state=saved({moodCursor:"2026-11-01T00:00:00.000Z",moods:[mood("gone"),mood("edited"),mood("waiting",{score:4})],pendingMoods:["waiting"]});
  await open(browser,base,state,api,async({page})=>{
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).moods.length===2);
   const moods=Object.fromEntries((await stored(page)).moods.map(m=>[m.id,m.score]));
   assert.deepEqual(moods,{edited:5,waiting:4});
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).pendingMoods.length===0);
   assert.equal(api.uploaded[0].score,4);
  });
 },
 "the first full list uploads what the account has never seen":async(browser,base)=>{
  const api=fakeApi({moods:{...shared,moods:[mood("both")]}});
  await open(browser,base,saved({moods:[mood("both"),mood("only-here")]}),api,async({page})=>{
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).pendingMoods?.length===0&&JSON.parse(localStorage.getItem("health:v1")).moodCursor);
   assert.deepEqual(api.uploaded.map(m=>m.id),["only-here"]);
  });
 },
 "a complete pull removes what's gone, and an incomplete one keeps older days":async(browser,base)=>{
  const synced={moods:[mood("m")],moodCursor:shared.cursor,lastSync:null,health:[{date:"2026-01-01",source:"shortcut",steps:1},{date:"2026-10-01",source:"shortcut",steps:2}],events:[{id:"old",start:"2026-01-01T10:00:00.000Z",end:"2026-01-01T11:00:00.000Z",title:"Old",category:"Other",source:"shortcut"}]};
  for(const[complete,health,events]of [[true,1,1],[false,2,2]]){
   const api=fakeApi();
   api.pull={...api.pull,complete:{health:complete,events:complete},health:[{date:"2026-10-01",source:"shortcut",steps:2}],events:[{id:"new",start:"2026-10-01T10:00:00.000Z",end:"2026-10-01T11:00:00.000Z",title:"New",category:"Other",source:"shortcut"}]};
   await open(browser,base,saved(synced),api,async({page})=>{
    await goTo(page,"data");
    await until(page,()=>!document.getElementById("pull-button").disabled);
    await page.click("#pull-button");
    await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).lastSync);
    const state=await stored(page);
    assert.equal(state.health.length,health);assert.equal(state.events.length,events);
   });
  }
 },
 "a pull for another account changes nothing":async(browser,base)=>{
  const api=fakeApi();api.pull={...api.pull,email:"other@example.com",health:[{date:"2026-10-01",source:"shortcut",steps:2}]};
  await open(browser,base,saved({moodCursor:shared.cursor}),api,async({page})=>{
   await goTo(page,"data");
   await until(page,()=>!document.getElementById("pull-button").disabled);
   await page.click("#pull-button");
   await until(page,()=>document.getElementById("pull-button").textContent==="Bring in data");
   assert.equal((await stored(page)).health.length,0);
  });
 },
 "erasing synced data removes check-ins here too":async(browser,base)=>{
  const api=fakeApi();
  await open(browser,base,saved({moods:[mood("m")],moodCursor:shared.cursor}),api,async({page})=>{
   await goTo(page,"data");
   await until(page,()=>document.getElementById("auth-email").textContent.includes("@"));
   await page.evaluate(()=>document.getElementById("erase-remote").click());
   await confirm(page);
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).moods.length===0);
  });
 },
 "a refused session disconnects this device and keeps its records":async(browser,base)=>{
  const api=fakeApi({session:401});
  await open(browser,base,saved({moods:[mood("m")]}),api,async({page})=>{
   await until(page,()=>!JSON.parse(localStorage.getItem("health:v1")).token);
   assert.equal((await stored(page)).moods.length,1);
  });
 },
 "another account's records are never uploaded":async(browser,base)=>{
  const api=fakeApi({me:"other@example.com"});
  await open(browser,base,saved({token:"",deviceId:"",moods:[mood("m")]}),api,async({page})=>{
   await goTo(page,"data");
   await until(page,()=>!document.getElementById("owner-mismatch").hidden);
   assert.equal(api.uploaded.length,0);
   assert.equal((await stored(page)).syncOwnerEmail,OWNER);
  });
 },
 "restore replaces, says what it left out, refuses another account, and uploads again":async(browser,base)=>{
  const api=fakeApi();
  await open(browser,base,saved({moods:[mood("before")],moodCursor:shared.cursor}),api,async({page})=>{
   await statusIsReady(page);
   const file=data=>({name:"backup.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({app:"Health",moods:[],health:[],events:[],...data}))});
   await page.setInputFiles("#restore-input",file({account:"other@example.com",moods:[mood("theirs")]}));
   await until(page,()=>document.body.textContent.includes("belongs to another account"));
   assert.equal((await stored(page)).moods[0].id,"before");
   await page.setInputFiles("#restore-input",file({account:OWNER,moods:[mood("restored")],reflections:[{ts:"bad"}],alarms:[{timeMin:9999,days:[]}]}));
   await confirm(page);
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).moods[0]?.id==="restored");
   await until(page,()=>document.body.textContent.includes("2 damaged items were left out"));
   // A restore clears the cursor so the full list comes back, and the sync that follows sets it again.
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).pendingMoods.length===0);
   await until(page,cursor=>JSON.parse(localStorage.getItem("health:v1")).moodCursor===cursor,shared.cursor);
   assert.ok(api.uploaded.some(m=>m.id==="restored"));
  });
 },
 "turned-off calendars collapse, and turning one on brings it back":async(browser,base)=>{
  const api=fakeApi();api.calendars=[{name:"Work",enabled:true,category:"Work"},{name:"Holidays",enabled:false,category:"Other"},{name:"Birthdays",enabled:false,category:"Other"}];
  await open(browser,base,saved({moodCursor:shared.cursor}),api,async({page})=>{
   await goTo(page,"data");
   await until(page,()=>document.getElementById("calendar-off-count").textContent==="2 calendars off");
   assert.equal(await page.isVisible("#calendar-off-list"),false);
   assert.equal(await page.locator("#calendar-list .calendar-purpose").count(),1);
   await page.click("#calendar-off-count");
   await page.locator("#calendar-off-list input").first().click();
   await until(page,()=>document.getElementById("calendar-off-count").textContent==="1 calendar off");
   assert.equal(await page.locator("#calendar-list .calendar-row").count(),2);
  });
 },
 "a suggestion marked done is logged, and it goes away for today":async(browser,base)=>{
  const moods=[];
  for(let i=1;i<=24;i++){const d=new Date(Date.now()-i*86400000);d.setHours(9,0,0,0);moods.push(mood("t"+i,{ts:d.toISOString(),score:i%2?5:3,stress:i%2?1:4,tags:i%2?["Rest"]:[]}));}
  await open(browser,base,saved({moods,moodCursor:shared.cursor}),fakeApi(),async({page})=>{
   await until(page,()=>document.querySelector(".next-done"));
   await page.evaluate(()=>document.querySelector(".next-done").click());
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).tries.length===1);
   await until(page,()=>!document.querySelector(".next-done"));
  },{midday:true});
 },
 "the sync label says what a tap does":async(browser,base)=>{
  const api=fakeApi();api.status={lastDataUploadAt:new Date(Date.now()-3*3600000).toISOString()};
  await open(browser,base,saved({moodCursor:shared.cursor}),api,async({page,context})=>{
   await until(page,()=>document.getElementById("sync-light").getAttribute("aria-label")==="Synced 3h ago. Run Health Sync.");
   await context.setOffline(true);
   await until(page,()=>document.getElementById("sync-light").getAttribute("aria-label").startsWith("Offline"));
   await page.click("#sync-light");
   await until(page,()=>document.body.textContent.includes("You’re offline"));
  });
 },
 "a hidden event leaves the list and what the app reads, stays hidden after a sync, and comes back":async(browser,base)=>{
  const event=hidden=>({id:"e1",start:"2026-11-04T10:00:00Z",end:"2026-11-04T11:00:00Z",title:"Standup",category:"Other",hidden});
  const api=fakeApi();
  api.pull={...api.pull,events:[event(false)]};
  await open(browser,base,saved({moodCursor:shared.cursor}),api,async({page,context})=>{
   await statusIsReady(page);
   await page.evaluate(()=>App.navigate("data"));
   await page.click("#pull-button");
   await page.waitForSelector("[data-seen]");
   await context.route("**/api/context/changes",route=>route.fulfill({json:{ok:true,results:[{ok:true}]}}));
   await page.click("[data-seen]");
   await until(page,()=>{const s=JSON.parse(localStorage.getItem("health:v1"));return !s.events.length&&s.hiddenEvents.length===1;});
   api.pull={...api.pull,events:[event(true)]};
   await page.click("#pull-button");
   await page.waitForTimeout(300);
   assert.equal((await stored(page)).events.length,0);
   assert.equal((await stored(page)).hiddenEvents.length,1);
   await page.click('input[name="list-view"][value="hidden"]',{force:true});
   await page.click("[data-seen]");
   await until(page,()=>{const s=JSON.parse(localStorage.getItem("health:v1"));return s.events.length===1&&!s.hiddenEvents.length;});
  });
 },
 "a hidden health day leaves what the app reads and comes back":async(browser,base)=>{
  const day=hidden=>({date:"2026-11-04",source:"shortcut",steps:100,hidden});
  const api=fakeApi();
  api.pull={...api.pull,health:[day(false)]};
  await open(browser,base,saved({moodCursor:shared.cursor}),api,async({page,context})=>{
   await statusIsReady(page);
   await page.evaluate(()=>App.navigate("data"));
   await page.click("#pull-button");
   await page.waitForSelector("[data-seen]");
   await context.route("**/api/context/changes",route=>route.fulfill({json:{ok:true,results:[{ok:true}]}}));
   await page.click("[data-seen]");
   await until(page,()=>{const s=JSON.parse(localStorage.getItem("health:v1"));return !s.health.length&&s.hiddenHealth.length===1;});
   await page.click('input[name="list-view"][value="hidden"]',{force:true});
   await page.click("[data-seen]");
   await until(page,()=>{const s=JSON.parse(localStorage.getItem("health:v1"));return s.health.length===1&&!s.hiddenHealth.length;});
  });
 },
 "hiding works offline, reaches the account later, and a sync can't undo it first":async(browser,base)=>{
  const event={id:"e1",start:"2026-11-04T10:00:00Z",end:"2026-11-04T11:00:00Z",title:"Standup",category:"Other",hidden:false};
  const api=fakeApi(),sent=[];
  api.pull={...api.pull,events:[event]};
  await open(browser,base,saved({moodCursor:shared.cursor}),api,async({page,context})=>{
   await context.route("**/api/context/changes",route=>{sent.push(route.request().postDataJSON());return route.fulfill({json:{ok:true,results:[{ok:true}]}});});
   await statusIsReady(page);
   await page.evaluate(()=>App.navigate("data"));
   await page.click("#pull-button");
   await page.waitForSelector("[data-seen]");
   await context.setOffline(true);
   await page.click("[data-seen]");
   await until(page,()=>{const s=JSON.parse(localStorage.getItem("health:v1"));return s.hiddenEvents.length===1&&s.pendingChanges.length===1;});
   assert.equal(sent.length,0);
   await context.setOffline(false);
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).pendingChanges.length===0);
   assert.deepEqual(sent,[{changes:[{op:"hide",kind:"event",id:"e1"}]}]);
   await page.waitForTimeout(150);
   assert.equal((await stored(page)).hiddenEvents.length,1);
  });
 },
 "the list searches, pages, selects everything, hides it with one request, and undoes it":async(browser,base)=>{
  const events=Array.from({length:30},(x,i)=>({id:"e"+i,start:"2026-10-"+String(i%28+1).padStart(2,"0")+"T10:00:00Z",end:"2026-10-"+String(i%28+1).padStart(2,"0")+"T11:00:00Z",title:i===7?"Dentist":"Standup "+i,category:"Other",hidden:false}));
  const api=fakeApi(),sent=[];
  api.pull={...api.pull,events};
  await open(browser,base,saved({moodCursor:shared.cursor}),api,async({page,context})=>{
   await context.route("**/api/context/changes",route=>{sent.push(route.request().postDataJSON());return route.fulfill({json:{ok:true,results:route.request().postDataJSON().changes.map(()=>({ok:true}))}});});
   await statusIsReady(page);
   await page.evaluate(()=>App.navigate("data"));
   await page.click("#pull-button");
   await until(page,()=>document.getElementById("list-page").textContent.includes("of 30"));
   await page.click("#list-next");
   await until(page,()=>document.getElementById("list-page").textContent.startsWith("Page 2"));
   await page.fill("#list-search","dentist");
   await until(page,()=>document.querySelectorAll("[data-open]").length===1);
   await page.click("[data-open]");
   await until(page,()=>document.getElementById("item-sheet").open);
   await page.click("#item-close");
   await page.click("#list-search-clear");
   await page.click("#list-select");
   await page.click("#list-select-all");
   assert.equal(await page.textContent("#list-selected"),"30 selected");
   await page.click("#list-hide");
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).hiddenEvents.length===30);
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).pendingChanges.length===0);
   assert.equal(sent.length,1);
   assert.equal(sent[0].changes.length,30);
   await page.click(".toast-undo");
   await until(page,()=>JSON.parse(localStorage.getItem("health:v1")).events.length===30);
  });
 },
 "damaged storage opens at sign-in":async(browser,base)=>{
  const api=fakeApi({me:""});
  await open(browser,base,"{not json",api,async({page})=>{
   await until(page,()=>document.getElementById("gate-title").textContent==="Sign in");
   assert.equal(await page.isVisible("#gate-privacy"),true);
   assert.equal(await page.isVisible("#main"),false);
   assert.equal(await page.isVisible("#gate-skip"),false);
  });
 },
 "a new iPhone can't pass the Home Screen step, and has no way to put it off":async(browser,base)=>{
  await open(browser,base,"{}",fakeApi({me:""}),async({page})=>{
   await until(page,()=>/Home Screen/.test(document.getElementById("gate-title").textContent));
   assert.equal(await page.isVisible("#gate-skip"),false);
   assert.equal(await page.isVisible(".bottom-nav"),false);
  },{iphone:true});
 },
 "Health Sync can be put off, and the app opens":async(browser,base)=>{
  await open(browser,base,saved({moodCursor:shared.cursor}),fakeApi(),async({page})=>{
   await until(page,()=>document.getElementById("gate-title").textContent==="Add Health Sync");
   await page.click("#gate-skip");
   await until(page,()=>document.getElementById("gate").hidden&&!document.body.classList.contains("gated"));
   assert.equal(await page.isVisible("[data-mood='3']"),true);
   assert.equal(await page.isVisible('.nav-item[data-go="settings"] .nav-badge'),true);
  },{iphone:true,installed:true});
 },
 "signed out with records, a person can back up or erase them":async(browser,base)=>{
  const api=fakeApi({me:""});
  await open(browser,base,saved({token:"",deviceId:"",syncOwnerEmail:"",pairedAt:null,moods:[mood("m")]}),api,async({page})=>{
   await until(page,()=>!document.getElementById("gate-records").hidden);
   await page.click("#gate-erase");
   await confirm(page);
   await until(page,()=>document.getElementById("gate-records").hidden);
  });
 },
 "an expired sign-in or no connection never locks out a connected device":async(browser,base)=>{
  await open(browser,base,saved({moods:[mood("m")],moodCursor:shared.cursor}),fakeApi({me:""}),async({page})=>{
   await until(page,()=>document.getElementById("gate").hidden);
   assert.equal(await page.isVisible("[data-mood='3']"),true);
  });
  await open(browser,base,saved({token:"",deviceId:"",moods:[mood("m")]}),fakeApi({me:""}),async({page,context})=>{
   await until(page,()=>!document.getElementById("gate").hidden);
   await context.setOffline(true);
   await until(page,()=>document.getElementById("gate").hidden);
  });
 },
 "an update waits while a check-in draft is open":async(browser,base)=>{
  const api=fakeApi();
  await open(browser,base,saved({moodCursor:shared.cursor}),api,async({page})=>{
   await page.click('[data-mood="4"]');
   await page.fill("#mood-note","draft");
   await page.evaluate(()=>{navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));document.dispatchEvent(new Event("visibilitychange"));});
   await until(page,()=>!document.getElementById("update-banner").hidden);
   assert.equal(await page.inputValue("#mood-note"),"draft");
  });
 }
};
async function statusIsReady(page){await until(page,()=>globalThis.App&&document.getElementById("mood-sync-status"));}

(async()=>{
 const names=process.argv.slice(2),server=await serve(),base="http://localhost:"+server.address().port;
 let failed=false;
 for(const name of names.length?names:["chromium"]){
  const browser=await {chromium,webkit}[name].launch();
  for(const[title,scenario]of Object.entries(scenarios)){
   try{await scenario(browser,base);console.log(name+" ok: "+title);}
   catch(error){failed=true;console.log(name+" FAILED: "+title+"\n  "+String(error.message).slice(0,400));}
  }
  await browser.close();
 }
 server.close();
 process.exit(failed?1:0);
})().catch(error=>{console.error(error);process.exit(1);});
