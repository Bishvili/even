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
 assert.doesNotMatch(html,/Bearer [a-f0-9]{64}/i);
});
test("an unverified iCloud release is not offered, and the listing is used instead",()=>{
 const t=harness();
 t.api.setAuth("test@example.com");
 t.api.chooseRelease({version:"1.0.0",url:"https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2",verified:false});
 t.api.renderSync();
 const install=t.elements.get("install-shortcut");
 assert.equal(install.href,"https://routinehub.co/shortcut/26978/");
 assert.equal(install.getAttribute("aria-disabled"),null);
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
 assert.match(t.elements.get("shortcut-last-upload").textContent,/no data yet/);
 assert.match(t.elements.get("shortcut-upload-counts").textContent,/0 health/);
});
test("main Shortcut reads its saved key before the handshake",()=>{
 const read=source.indexOf("const savedKeyFile = readSavedDeviceKey(keyFolder)");
 const handshake=source.indexOf('jsonRequest("https://rage-tracker.bishvili.workers.dev/api/shortcut/hello"');
 assert.ok(read>=0&&read<handshake);
 assert.doesNotMatch(source,/#question/);
 assert.match(source,/if savedKeyMatchCount == 0/);
});

test("the key file is the only filesystem dependency",()=>{
 assert.equal((source.match(/rage-tracker-device-key\.txt/g)||[]).length,2);
 assert.doesNotMatch(source,/\b(getFolderContents|getFileFromFolder|deleteFiles)\s*\(/);
});

test("the owner-scoped API validates the configured key before collecting data",()=>{
 const binding=source.indexOf("@credential = getText(savedKeyFile)");
 const profile=source.indexOf("getDictionary(handshakeRaw)");
 const failure=source.indexOf('if connectionStatus != "connected"');
 const events=source.indexOf("const events = findEvents(todayEventsFilter)");
 assert.ok(binding>=0&&binding<profile&&profile<failure&&failure<events);
 assert.match(source,/Authorization": "\{@credential\}"/);
 assert.match(source,/alert\("That key didn't work/);
});

test("every accepted upload is acknowledged and versioned",()=>{
 assert.match(source,/getValue\(eventResponse, "state"\)/);
 assert.match(source,/getValue\(healthResponse, "state"\)/);
 assert.match(source,/if eventStatus != "accepted"/);
 assert.match(source,/if healthStatus != "accepted"/);
 assert.match(source,/shortcutVersion": "2\.3\.10"/);
 assert.match(source,/\/api\/shortcut\/release\?current=2\.3\.10/);
 assert.match(source,/showNotification\("Synced \{@acceptedCount\} items\. Skipped \{@skippedCalendarCount\} calendar events\."/);
 assert.doesNotMatch(source,/\bnothing\(\)/);
 assert.doesNotMatch(source,/Bearer [a-f0-9]{64}/i);
 assert.doesNotMatch(source,/@(?:gmail|icloud)\.com/i);
});

test("conditional comparisons use explicit typed text instead of Boolean values",()=>{
 const comparisons=[...source.matchAll(/^\s*if\s+([^\n]+)\{/gm)].map(x=>x[1].trim());
 assert.deepEqual(comparisons,[
  'providedKeyCount == 0',
  'savedKeyMatchCount == 0',
  'connectionStatus != "connected"',
  'retryStatus != "connected"',
  'eventStatus != "accepted"',
  'eventError == "No valid records. Check date, metric values, and event start/end formats"',
  'stepsAvailable >= 1',
  'totalSteps >= 1',
  'healthStatus != "accepted"',
  'restingAvailable >= 1',
  'restingValue >= 1',
  'restingStatus == "accepted"',
  'hrvAvailable >= 1',
  'hrvValue >= 1',
  'hrvStatus == "accepted"',
  'exerciseAvailable >= 1',
  'exerciseValue >= 1',
  'workoutStatus == "accepted"',
  'sleepAvailable >= 1',
  'sleepAge <= 1440',
  'stageCount >= 1',
  '@sleepMinutes >= 1',
  'sleepStatus == "accepted"',
  'updateStatus == "new_release"'
 ]);
 assert.doesNotMatch(source,/if\s+@\w+\s*(==|!=)\s*(true|false)/);
 for(const name of ["connectionStatus","eventStatus","healthStatus","updateStatus"])
  assert.match(source,new RegExp("const "+name+" = getText\\("+name+"Value\\)"));
});

test("calendar classification remains on the backend",()=>{
 assert.doesNotMatch(source,/"category":/);
 assert.match(worker,/function classifyCalendarTitle/);
 assert.match(worker,/classifyCalendarTitle\(title\)/);
});

test("the PWA setup instructions and source agree",()=>{
 assert.match(html,/rage-tracker-device-key\.txt/);
 assert.match(html,/target="_blank"/);
});

test("the malformed v2.2 download is gone",()=>{
 assert.doesNotMatch(worker,/rage-tracker-sync-v2\.2\.shortcut/);
 assert.doesNotMatch(html,/rage-tracker-sync-v2\.2\.shortcut/);
});

test("Run Shortcut uses the Apple-supported URL scheme without a device key",()=>{
 assert.match(html,/id="run-shortcut"[^>]*href="shortcuts:\/\/run-shortcut\?name=Rage%20Tracker%20Sync"/);
 assert.doesNotMatch(html,/Bearer [a-f0-9]{64}/i);
});

test("every application DOM reference maps to an existing ID",()=>{
 for(const match of app.matchAll(/\$\("([^"]+)"\)/g))
  assert.ok(idSet.has(match[1]),"Missing "+match[1]);
});
