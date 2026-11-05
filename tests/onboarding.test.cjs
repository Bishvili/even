"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
require("../onboarding.js");
const {nextStep}=globalThis.EvenOnboarding;
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

const DAY=86400000,now=Date.UTC(2026,10,4,18);
// A new invited tester on an iPhone, before anything is done.
const fresh={now,ios:true,installed:false,installable:true,signedIn:false,connected:false,connectedBefore:false,connecting:false,
 signingIn:false,synced:false,shortcutConnected:false,gotShortcut:false,checkedIn:false,notify:"later",skipped:{}};
const at=changes=>nextStep(Object.assign({},fresh,changes));
const app={installed:true,installable:false};

test("a new iPhone starts by adding Even to the Home Screen",()=>{
 assert.deepEqual(at({}),{id:"install",variant:"share",number:1,total:4});
});
test("putting off the Home Screen step brings it back after three days",()=>{
 assert.equal(at({skipped:{install:now-DAY}}).id,"signin");
 assert.equal(at({skipped:{install:now-3*DAY}}).id,"install");
});
test("the installed app counts the Home Screen step as done and asks to sign in",()=>{
 assert.deepEqual(at(app),{id:"signin",variant:"signin",number:2,total:4});
 assert.equal(at({...app,signingIn:true}).variant,"pending");
 assert.equal(at({...app,signedIn:true}).variant,"connect");
 assert.equal(at({...app,signedIn:true,connecting:true}).variant,"connecting");
});
test("an iPhone that was connected before is left to Sync, so a disconnect isn't undone",()=>{
 assert.deepEqual(at({...app,connectedBefore:true}),{id:"checkin",number:0,total:4});
});
test("Even Sync is offered once connected: get it, run it, then run it again if nothing arrived",()=>{
 const connected={...app,signedIn:true,connected:true,connectedBefore:true};
 assert.deepEqual(at(connected),{id:"shortcut",variant:"get",number:3,total:4});
 assert.equal(at({...connected,gotShortcut:true}).variant,"run");
 assert.equal(at({...connected,shortcutConnected:true}).variant,"again");
 assert.equal(at({...connected,skipped:{shortcut:now}}).id,"checkin");
 assert.equal(at({...connected,synced:true}).id,"checkin");
});
test("notifications come after the first check-in, and setup then ends",()=>{
 const synced={...app,signedIn:true,connected:true,connectedBefore:true,synced:true};
 assert.equal(at({...synced,notify:"ready"}).id,"checkin");
 assert.deepEqual(at({...synced,checkedIn:true,notify:"ready"}),{id:"notifications",variant:"start",number:4,total:4});
 assert.equal(at({...synced,checkedIn:true,notify:"later"}),null);
});
test("skipping sign-in leaves only the first check-in",()=>{
 assert.equal(at({...app,skipped:{signin:now}}).id,"checkin");
 assert.equal(at({...app,skipped:{signin:now},checkedIn:true}),null);
});
test("a check-in made before setup doesn't skip the setup steps",()=>{
 assert.equal(at({...app,checkedIn:true}).id,"signin");
});
test("other browsers skip the iPhone-only steps and count only what applies",()=>{
 const desktop={ios:false,installed:false,installable:false,notify:"unavailable"};
 assert.deepEqual(at(desktop),{id:"signin",variant:"signin",number:1,total:1});
 assert.deepEqual(at({...desktop,installable:true,notify:"later"}),{id:"install",variant:"prompt",number:1,total:3});
 assert.equal(at({...desktop,connected:true,connectedBefore:true}).id,"checkin");
});

test("the invitation, the setup card and Sync name the same steps",()=>{
 const worker=read("worker/index.js"),invite=worker.slice(worker.indexOf("async function sendInvite"),worker.indexOf("async function authApi"));
 const card=read("onboarding.js"),html=read("index.html"),sync=html.slice(html.indexOf('id="view-data"'),html.indexOf('id="view-settings"'));
 for(const words of ["Share (or ••• and then Share), then Add to Home Screen","one-time code"]){
  assert.ok(invite.includes(words),"invitation: "+words);
  assert.ok(card.includes(words),"card: "+words);
 }
 for(const words of ["Get Even Sync","Run Even Sync"]){
  assert.ok(invite.includes(words),"invitation: "+words);
  assert.ok(card.includes(words)||html.includes('id="setup-link"'),"card: "+words);
  assert.ok(sync.includes(words),"Sync: "+words);
 }
});
test("every element a script looks up exists on the page",()=>{
 const html=read("index.html"),ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 for(const [,file] of html.matchAll(/<script src="\/([\w.-]+)"/g)){
  for(const [,id] of read(file).matchAll(/(?:\$|getElementById)\("([^"]+)"\)/g))assert.ok(ids.has(id),file+" needs #"+id);
 }
});
test("only the security note about the key file mentions a key, and nothing asks to generate one",()=>{
 for(const file of ["index.html","app.js","onboarding.js","reminders.js"]){
  const copy=read(file);
  assert.doesNotMatch(copy,/\bgenerate\b/i,file);
  assert.doesNotMatch(copy.replace(/Your device key is saved as a plain-text file[^<]*/,""),/device key|sync key/i,file);
 }
});
const {replayStep}=globalThis.EvenOnboarding;
const replayDone={ios:true,installed:true,installable:false,connected:true,signedIn:true,synced:true,notify:"later",now:0};
test("going through setup again shows every step, even when all are done",()=>{
 const order=[0,1,2,3].map(n=>replayStep(replayDone,n));
 assert.deepEqual(order.map(s=>s.id),["install","signin","shortcut","notifications"]);
 assert.deepEqual(order.map(s=>s.done),[true,true,true,false]);
 assert.deepEqual(order.map(s=>s.last),[false,false,false,true]);
 assert.equal(replayStep(replayDone,4),null);
 assert.equal(order[1].total,4);
});
test("steps that aren't done keep their usual action",()=>{
 const fresh={ios:true,installed:false,installable:true,connected:false,signedIn:false,synced:false,notify:"later",now:0};
 assert.equal(replayStep(fresh,1).variant,"signin");
 assert.equal(replayStep(fresh,1).done,false);
 assert.equal(replayStep(fresh,0).variant,"share");
});
