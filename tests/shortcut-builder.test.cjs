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
test("first run creates its folder before reading any saved credential",()=>{
 const create=source.indexOf('createFolder("RageTracker")');
 const folder=source.indexOf('getFile("RageTracker")');
 const listing=source.indexOf('getFolderContents(folder)');
 const scan=source.indexOf('getFileDetail(@saved, "Name")');
 const prompt=source.indexOf('prompt("Paste your Authorization value');
 const validation=source.indexOf('downloadURL("https://rage-tracker.bishvili.workers.dev/api/profile"');
 const save=source.indexOf('saveFile("RageTracker/device-key.txt"');
 assert.ok(create>0&&create<folder&&folder<listing&&listing<scan);
 assert.ok(scan<prompt&&prompt<validation&&validation<save);
 assert.doesNotMatch(source,/getFile\("RageTracker\/device-key\.txt"/);
 assert.doesNotMatch(source,/getFileFromFolder\([^\n]*device-key\.txt/);
 assert.match(source,/if @fileName == "device-key\.txt"/);
});

test("new credentials are verified before saving; every upload is acknowledged",()=>{
 assert.match(source,/if @connected == true \{[\s\S]*if @newConnection == true \{[\s\S]*saveFile/);
 assert.match(source,/getValue\(eventResponse, "ok"\)/);
 assert.match(source,/getValue\(healthResponse, "ok"\)/);
 assert.match(source,/if @eventAccepted == true/);
 assert.match(source,/if @healthAccepted == true/);
 assert.match(source,/showNotification\("Rage Tracker accepted \{@acceptedCount\} updates\."/);
 assert.match(source,/shortcutVersion": "2\.0\.0"/);
 assert.match(source,/\/api\/shortcut\/release\?current=2\.0\.0/);
 assert.doesNotMatch(source,/\/api\/shortcut\/hello/);
 assert.doesNotMatch(source,/\bnothing\(\)/);
 assert.doesNotMatch(source,/Bearer [a-f0-9]{64}/i);
 assert.doesNotMatch(source,/@(?:gmail|icloud)\.com/i);
});

test("calendar classification belongs to the Worker, not the Shortcut",()=>{
 assert.doesNotMatch(source,/"category":/);
 assert.match(worker,/function classifyCalendarTitle/);
 assert.match(worker,/classifyCalendarTitle\(title\)/);
});

test("all app DOM references and network routes are defined",()=>{
 for(const found of app.matchAll(/\$\("([^"]+)"\)/g))assert.ok(idSet.has(found[1]),found[1]);
 assert.match(worker,/\/shortcut\/builder/);
 assert.match(worker,/\/api\/shortcut\/hello/);
 assert.match(worker,/updateAvailable/);
});

test("credential input is verified by the owner-scoped API before persistence",()=>{
 assert.match(source,/@credential = ""/);
 assert.match(source,/@credential = getText\(entered\)/);
 assert.match(source,/if @credential == "" \{[\s\S]*@newConnection = true/);
 assert.match(source,/@connected: bool/);
 assert.match(source,/@connected = getValue\(profile, "ok"\)/);
 assert.doesNotMatch(source,/#question authorization/);
});

test("no extra setup checks or fake success paths",()=>{
 assert.doesNotMatch(source,/if @credential beginsWith/);
 assert.doesNotMatch(source,/if @acceptedCount > 0/);
 assert.doesNotMatch(source,/\/api\/pair/);
 assert.match(source,/showNotification\("Rage Tracker accepted \{@acceptedCount\} updates\."/);
});
