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
 assert.match(t.elements.get("shortcut-install-help").textContent,/earlier Shortcut builds are not verified/);
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
test("native authorization setup question is attached to the configured Text action",()=>{
 const question=source.indexOf('#question authorization "Paste the full Authorization value from Rage Tracker > Sync" "Bearer "');
 const status=source.indexOf('downloadURL("https://rage-tracker.bishvili.workers.dev/api/status")');
 const binding=source.indexOf("const credential = text(authorization)");
 const verification=source.indexOf('jsonRequest("https://rage-tracker.bishvili.workers.dev/api/shortcut/hello"');
 assert.ok(question>=0&&question<status&&status<binding&&binding<verification);
 assert.equal((source.match(/^#question /gm)||[]).length,1);
 assert.match(source,/const credential = text\(authorization\)/);
 assert.doesNotMatch(source,/\bprompt\(/);
});

test("fresh installations have no filesystem or saved-credential dependency",()=>{
 assert.doesNotMatch(source,/\b(createFolder|getFile|getFolderContents|getFileFromFolder|saveFile|deleteFiles)\s*\(/);
 assert.doesNotMatch(source,/\bdevice-key\.txt\b/);
 assert.doesNotMatch(source,/#include\s+['"]actions\/documents['"]/);
});

test("the owner-scoped API validates the configured key before collecting data",()=>{
 const binding=source.indexOf("const credential = text(authorization)");
 const profile=source.indexOf("getDictionary(handshakeRaw)");
 const failure=source.indexOf('if connectionStatus != "connected"');
 const events=source.indexOf("const events = findTodayEvents()");
 assert.ok(binding>=0&&binding<profile&&profile<failure&&failure<events);
 assert.match(source,/Authorization": "\{credential\}"/);
 assert.match(source,/alert\("The private device key was not accepted/);
});

test("every accepted upload is acknowledged and versioned",()=>{
 assert.match(source,/getValue\(eventResponse, "state"\)/);
 assert.match(source,/getValue\(healthResponse, "state"\)/);
 assert.match(source,/if eventStatus != "accepted"/);
 assert.match(source,/if healthStatus != "accepted"/);
 assert.match(source,/shortcutVersion": "2\.3\.2"/);
 assert.match(source,/\/api\/shortcut\/release\?current=2\.3\.2/);
 assert.match(source,/showNotification\("Rage Tracker connected\. Accepted \{@acceptedCount\} uploads\. Skipped \{@skippedCalendarCount\} invalid calendar events\."/);
 assert.doesNotMatch(source,/\bnothing\(\)/);
 assert.doesNotMatch(source,/Bearer [a-f0-9]{64}/i);
 assert.doesNotMatch(source,/@(?:gmail|icloud)\.com/i);
});

test("conditional comparisons use explicit typed text instead of Boolean values",()=>{
 const comparisons=[...source.matchAll(/^\s*if\s+([^\n]+)\{/gm)].map(x=>x[1].trim());
 assert.deepEqual(comparisons,[
  'connectionStatus != "connected"',
  'eventStatus != "accepted"',
  'sampleCount >= 1',
  'healthStatus != "accepted"',
  'updateStatus == "new_release"',
  'choice == "Install update"'
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
 assert.match(html,/Customize Shortcut/);
 assert.match(html,/credential-free v2\.3\.2 source/);
 assert.doesNotMatch(html,/device-key\.txt/);
 assert.match(html,/href="\/shortcut\/builder"/);
 assert.match(html,/target="_blank"/);
 assert.match(worker,/#question authorization/);
 assert.match(worker,/text\(authorization\)/);
});

test("corrected v2.3 builder replaces the malformed signed download",()=>{
 assert.match(html,/id="shortcut-preview"[^>]*target="_blank"[^>]*href="\/shortcut\/builder"/);
 assert.match(worker,/\/shortcut\/builder/);
 assert.doesNotMatch(worker,/rage-tracker-sync-v2\.2\.shortcut/);
 assert.doesNotMatch(html,/rage-tracker-sync-v2\.2\.shortcut/);
 assert.match(html,/v2\.3\.2 · corrected source/);
});

test("Run Shortcut uses the Apple-supported URL scheme without a device key",()=>{
 assert.match(html,/id="run-shortcut"[^>]*href="shortcuts:\/\/run-shortcut\?name=Rage%20Tracker%20Sync"/);
 assert.doesNotMatch(html,/Bearer [a-f0-9]{64}/i);
});

test("every application DOM reference maps to an existing ID",()=>{
 for(const match of app.matchAll(/\$\("([^"]+)"\)/g))
  assert.ok(idSet.has(match[1]),"Missing "+match[1]);
});
