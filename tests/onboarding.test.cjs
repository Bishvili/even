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

const {gateStep}=globalThis.EvenOnboarding;
const gate=changes=>gateStep(Object.assign({online:true},fresh,changes));
const connected={...app,signedIn:true,connected:true,connectedBefore:true};
test("a new iPhone must add Even to the Home Screen, and putting it off isn't possible",()=>{
 assert.equal(gate({}).id,"install");
 assert.equal(gate({}).variant,"share");
 assert.equal(gate({}).number,1);
 assert.equal(gate({skipped:{install:now}}).id,"install");
 assert.equal(gate({safari:false}).variant,"safari");
});
test("once installed, signing in is required, and the variants follow the state",()=>{
 assert.equal(gate(app).variant,"signin");
 assert.equal(gate({...app,skipped:{signin:now}}).variant,"signin");
 assert.equal(gate({...app,signingIn:true}).variant,"pending");
 assert.equal(gate({...app,signedIn:true}).variant,"connect");
 assert.equal(gate({...app,signedIn:true,connecting:true}).variant,"connecting");
 assert.equal(gate({...app,connectedBefore:true}).variant,"signin");
});
test("records from another account are held until they're dealt with",()=>{
 assert.equal(gate({...connected,otherAccount:true,records:true}).variant,"other");
 assert.equal(gate({...connected,otherAccount:true,records:true}).records,true);
});
test("records on the device are offered from sign-in, and offline opens them",()=>{
 assert.equal(gate({...app,records:true}).records,true);
 assert.equal(gate({...app,records:true,online:false}),null);
 assert.equal(gate({...app,connectedBefore:true,online:false}),null);
 assert.equal(gate({...app,online:false}).id,"signin");
});
test("Even Sync asks until it has run, and Not now brings it back after three days",()=>{
 assert.equal(gate(connected).variant,"get");
 assert.equal(gate({...connected,gotShortcut:true}).variant,"run");
 assert.equal(gate({...connected,shortcutConnected:true}).variant,"again");
 assert.equal(gate({...connected,skipped:{shortcut:now-DAY}}),null);
 assert.equal(gate({...connected,skipped:{shortcut:now-3*DAY}}).id,"shortcut");
 assert.equal(gate({...connected,synced:true}),null);
 assert.equal(gate({...connected,online:false}),null);
});
test("other browsers need only sign-in, and a connected one opens",()=>{
 const desktop={ios:false,installed:false,installable:false,notify:"unavailable"};
 const step=gate(desktop);
 assert.equal(step.id,"signin");assert.equal(step.total,1);
 assert.equal(gate({...desktop,connected:true,signedIn:true}),null);
 assert.deepEqual(at({...desktop,installable:true,notify:"later"}),{id:"install",variant:"prompt",number:1,total:3});
});
test("Check in's card waits for the first check-in, then offers notifications, and setup ends",()=>{
 const synced={...connected,synced:true};
 assert.equal(at({...synced,notify:"ready"}).id,"checkin");
 assert.deepEqual(at({...synced,checkedIn:true,notify:"ready"}),{id:"notifications",variant:"start",number:4,total:4});
 assert.equal(at({...synced,checkedIn:true,notify:"later"}),null);
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

test("the Settings badge stays until every step is really done, even when skipped",()=>{
 const {outstanding}=globalThis.EvenOnboarding,left=changes=>outstanding(Object.assign({},fresh,changes));
 assert.deepEqual(left({notifyOpen:true}),["install","signin","shortcut","checkin","notifications"]);
 assert.deepEqual(left({skipped:{install:now,signin:now,shortcut:now}}),["install","signin","shortcut","checkin"]);
 assert.deepEqual(left({installed:true,installable:false,connected:true,synced:true,checkedIn:true}),[]);
 assert.deepEqual(left({installed:true,installable:false,connectedBefore:true,checkedIn:true}),[]);
});
