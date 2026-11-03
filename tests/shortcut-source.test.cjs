"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const worker=fs.readFileSync(path.join(root,"worker","index.js"),"utf8");
const shortcut=fs.readFileSync(path.join(root,"shortcuts","rage-tracker-sync.cherri"),"utf8");

test("the retired v2.2 download is gone",()=>{
 assert.doesNotMatch(html,/rage-tracker-sync-v2\.2\.shortcut/);
 assert.doesNotMatch(worker,/rage-tracker-sync-v2\.2\.shortcut/);
 assert.doesNotMatch(app,/Signed test build v2\.2/);
});

test("app does not launch old broken Shortcut versions",()=>{
 assert.match(app,/compareVersions\(shortcutStatus\.installedShortcutVersion,"2\.3\.3"\)<0/);
 assert.match(html,/id="run-shortcut"[^>]*href="shortcuts:\/\/run-shortcut\?name=Rage%20Tracker%20Sync"/);
 assert.doesNotMatch(html,/Bearer [a-f0-9]{64}/i);
});

test("API returns text outcomes and release requires verification",()=>{
 assert.match(worker,/state:"connected"/);
 assert.match(worker,/state:"accepted"/);
 assert.match(worker,/updateStatus:updateAvailable\?"new_release":"current"/);
 assert.match(worker,/release\.verified&&semverNewer\(release\.version,installed\)/);
 assert.match(worker,/WHERE owner_email=\?/);
});

test("Shortcut checks explicit typed values",()=>{
 const cond=[...shortcut.matchAll(/^\s*if ([^\n]+)\{$/gm)].map(x=>x[1].trim());
 assert.deepEqual(cond,[
  'savedKeyMatchCount == 0',
  'connectionStatus != "connected"',
  'retryStatus != "connected"',
  'eventStatus != "accepted"',
  'eventError == "No valid records. Check date, metric values, and event start/end formats"',
  'savedTypesLength == 0',
  'totalSteps >= 1',
  'healthStatus != "accepted"',
  'restingChosen >= 1',
  'restingValue >= 1',
  'restingStatus == "accepted"',
  'hrvChosen >= 1',
  'hrvValue >= 1',
  'hrvStatus == "accepted"',
  'exerciseChosen >= 1',
  'exerciseValue >= 1',
  'workoutStatus == "accepted"',
  'updateStatus == "new_release"',
  'choice == "Install update"',
  'sleepChosen >= 1',
  'stageCount >= 1',
  '@sleepMinutes >= 1',
  'sleepStatus == "accepted"'
 ]);
 assert.doesNotMatch(shortcut,/if\s+@\w+\s*==\s*(true|false)/);
 assert.doesNotMatch(shortcut,/Bearer [a-f0-9]{64}/i);
});

test("the release helper holds no credentials and publishes through the app",()=>{
 const helper=fs.readFileSync(path.join(root,"shortcuts","rage-tracker-release.cherri"),"utf8");
 assert.doesNotMatch(helper,/#question/);
 assert.match(helper,/releases\/download\/shortcut-latest\/Rage-Tracker-Sync\.shortcut/);
 assert.match(helper,/\/api\/shortcut\/publish/);
 assert.doesNotMatch(helper,/api\.github\.com/);
 assert.doesNotMatch(helper,/github_pat_[A-Za-z0-9]{10}|ghp_[A-Za-z0-9]{10}/);
});

test("Shortcut filters are references, so the compiler cannot rewrite them",()=>{
 for(const [name,type] of [["stepsFilter","Steps"],["restingFilter","Resting Heart Rate"],["hrvFilter","Heart Rate Variability"],["exerciseFilter","Exercise Minutes"],["sleepFilter","Sleep"]]){
  const filter=JSON.parse(Buffer.from(shortcut.match(new RegExp("^#ref "+name+" (\\S+)$","m"))[1],"base64").toString());
  assert.equal(filter.WFSerializationType,"WFContentPredicateTableTemplate");
  assert.equal(filter.Value.WFActionParameterFilterTemplates[0].Values.Enumeration.Value,type);
 }
 assert.doesNotMatch(shortcut,/\): array \{"WFContentItemFilter"/);
});


test("the developer tools card starts onboarding on this repository",()=>{
 const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
 const link=new URL(html.match(/id="improve-site" href="([^"]+)"/)[1].replaceAll("&amp;","&"));
 assert.equal(link.origin+link.pathname,"https://claude.ai/code/new");
 assert.equal(link.searchParams.get("repo"),"Bishvili/rage-tracker");
 assert.match(link.searchParams.get("q"),/onboarding section of AGENTS\.md/);
});
