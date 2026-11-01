"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.join(__dirname,"..");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const worker=fs.readFileSync(path.join(root,"worker","index.js"),"utf8");
const source=fs.readFileSync(path.join(root,"shortcuts","rage-tracker-sync.cherri"),"utf8");
const idSet=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));

function harness(){
 const store={moods:[],events:[],health:[],token:"a".repeat(64),deviceId:"test-device-001",syncOwnerEmail:"test@example.com"};
 const elements=new Map();
 const doc={
  getElementById(id){
   if(!idSet.has(id))throw Error("Unknown DOM ID: "+id);
   if(!elements.has(id)){
    const attrs=new Map();
    elements.set(id,{id,hidden:false,disabled:false,textContent:"",innerHTML:"",value:"",
     classList:{toggle(){}},setAttribute(k,v){attrs.set(k,v);},removeAttribute(k){attrs.delete(k);},
     getAttribute(k){return attrs.get(k)||null;}});
   }
   return elements.get(id);
  },
  querySelectorAll(){return[];}
 };
 const code=app.replace(/init\(\);\s*\}\)\(\);\s*$/,
  "globalThis.__test={renderSync,compareVersions,chooseRelease:x=>shortcutRelease=x,setAuth:x=>authEmail=x,setStatus:x=>shortcutStatus=x};})();");
 assert.notEqual(code,app);
 const env={localStorage:{getItem(){return JSON.stringify(store);},setItem(){}},document:doc,
  location:{origin:"https://rage-tracker.bishvili.workers.dev"},
  navigator:{onLine:true},URL,Date,console,setTimeout,clearTimeout};
 vm.runInNewContext(code,env,{timeout:3000});
 return {api:env.__test,elements,store};
}

test("a signed Shortcut link opens in a new tab and never includes the device key",()=>{
 assert.match(html,/id="install-shortcut"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
 assert.match(html,/id="shortcut-preview"[^>]*target="_blank"/);
 assert.doesNotMatch(html,/Bearer [a-f0-9]{64}/i);
});
test("unverified iCloud release is not presented as a working installation",()=>{
 const t=harness();
 t.api.setAuth("test@example.com");
 t.api.chooseRelease({version:"1.0.0",url:"https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2",verified:false});
 t.api.renderSync();
 const install=t.elements.get("install-shortcut");
 assert.equal(install.getAttribute("aria-disabled"),"true");
 assert.equal(install.getAttribute("href"),null);
 assert.match(t.elements.get("shortcut-install-help").textContent,/does not request your key/);
});
test("verified iCloud release enables new-tab installation",()=>{
 const t=harness();
 t.api.setAuth("test@example.com");
 t.api.chooseRelease({version:"1.1.0",url:"https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2",verified:true});
 t.api.renderSync();
 assert.equal(t.elements.get("install-shortcut").href,"https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2");
 assert.equal(t.elements.get("install-shortcut").getAttribute("aria-disabled"),null);
});
test("a valid Shortcut handshake does not imply accepted Health data",()=>{
 const t=harness();
 t.api.setAuth("test@example.com");
 t.api.setStatus({credentialValid:true,lastAttemptAt:"2026-11-01T17:00:00Z",installedShortcutVersion:"1.1.0",
  lastDataUploadAt:null,healthMetrics:0,calendarEvents:0});
 t.api.renderSync();
 assert.match(t.elements.get("shortcut-last-upload").textContent,/no Health\/Calendar data yet/);
 assert.match(t.elements.get("shortcut-upload-counts").textContent,/0 health/);
});
test("Shortcut template prompts once, stores the key outside the Shortcut, and checks for updates",()=>{
 for(const fragment of ["prompt(","getFile(","saveFile(","/api/profile","/api/shortcut/hello","/api/shortcut/release?current=1.1.0","updateAvailable","openURL("])
  assert.ok(source.includes(fragment),"Missing "+fragment);
 assert.doesNotMatch(source,/#question authorization/);
 assert.doesNotMatch(source,/Bearer [a-f0-9]{64}/i);
 assert.doesNotMatch(source,/@(?:gmail|icloud)\.com/i);
});
test("all app DOM references and network routes are defined",()=>{
 for(const found of app.matchAll(/\$\("([^"]+)"\)/g))assert.ok(idSet.has(found[1]),found[1]);
 assert.match(worker,/\/shortcut\/builder/);
 assert.match(worker,/\/api\/shortcut\/hello/);
 assert.match(worker,/updateAvailable/);
});

test("first-run input is explicitly typed for Cherri text comparisons",()=>{
 assert.match(source,/const rawInput = prompt\("Paste the complete Authorization value from Rage Tracker"\)/);
 assert.match(source,/@entered: text\s+@entered = getText\(rawInput\)\s+if @entered beginsWith "Bearer "/);
 assert.match(source,/@profileAuthorized: bool\s+@profileAuthorized = getValue\(profileData, "ok"\)/);
 assert.doesNotMatch(source,/prompt\("Paste the complete Authorization value from Rage Tracker",\s*"Text"\)/);
 assert.doesNotMatch(source,/\bconst verified\b[\s\S]*@verified\s*=/);
});
