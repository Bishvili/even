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

test("corrected Shortcut is the only downloadable installation path",()=>{
 assert.match(html,/id="shortcut-preview"[^>]*target="_blank"[^>]*href="\/shortcut\/builder"/);
 assert.match(html,/v2\.3\.3 · corrected source/);
 assert.doesNotMatch(html,/rage-tracker-sync-v2\.2\.shortcut/);
 assert.doesNotMatch(worker,/rage-tracker-sync-v2\.2\.shortcut/);
 assert.doesNotMatch(app,/Signed test build v2\.2/);
 assert.match(worker,/\/shortcut\/builder/);
 assert.match(worker,/readSavedDeviceKey\(\)/);
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

test("Shortcut checks nine explicit typed values",()=>{
 const cond=[...shortcut.matchAll(/^\s*if ([^\n]+)\{$/gm)].map(x=>x[1].trim());
 assert.deepEqual(cond,[
  'savedKeyMatchCount == 0',
  'connectionStatus != "connected"',
  'retryStatus != "connected"',
  'eventStatus != "accepted"',
  'eventError == "No valid records. Check date, metric values, and event start/end formats"',
  'sampleCount >= 1',
  'healthStatus != "accepted"',
  'updateStatus == "new_release"',
  'choice == "Install update"'
 ]);
 assert.doesNotMatch(shortcut,/if\s+@\w+\s*==\s*(true|false)/);
 assert.doesNotMatch(shortcut,/Bearer [a-f0-9]{64}/i);
});
