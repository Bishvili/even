"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");

const source=fs.readFileSync(path.join(root,"shortcuts","rage-tracker-sync.cherri"),"utf8");
const worker=fs.readFileSync(path.join(root,"worker","index.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const schema=fs.readFileSync(path.join(root,"db","schema.sql"),"utf8");

test("the install question precedes authenticated requests",()=>{
 const question=source.indexOf("#question authorization");
 const publicCheck=source.indexOf('/api/status');
 const credential=source.indexOf("const credential = text(authorization)");
 const handshake=source.indexOf('jsonRequest("https://rage-tracker.bishvili.workers.dev/api/shortcut/hello"');
 const firstUpload=source.indexOf('formRequest("https://rage-tracker.bishvili.workers.dev/api/ingest"');
 assert.ok(question>=0&&question<publicCheck&&publicCheck<credential&&credential<handshake&&handshake<firstUpload);
 assert.equal((source.match(/^#question /gm)||[]).length,1);
 assert.doesNotMatch(source,/\b(createFolder|getFile|getFolderContents|saveFile)\s*\(/);
 assert.doesNotMatch(source,/Bearer [a-f0-9]{64}/i);
});

test("the Shortcut identifies itself on the handshake, uploads, and update query",()=>{
 assert.match(source,/"shortcutVersion": "2\.3\.0"/);
 assert.equal((source.match(/"shortcutVersion": "2\.3\.0"/g)||[]).length,3);
 assert.match(source,/\/api\/shortcut\/release\?current=2\.3\.0/);
 assert.match(source,/getValue\(handshake, "connected"\)/);
 assert.match(source,/if @connected == false/);
});

test("server offers upgrades only for verified releases",()=>{
 assert.match(worker,/release\.verified&&semverNewer\(release\.version,installed\)/);
 assert.match(worker,/automaticReplacement:false/);
 assert.doesNotMatch(worker,/"source\.zip":"application\/zip"/);
});

test("the signed test build and run action point to correct destinations",()=>{
 assert.match(worker,/"rage-tracker-sync-v2\.2\.shortcut":"application\/octet-stream"/);
 assert.match(html,/href="\/rage-tracker-sync-v2\.2\.shortcut"/);
 assert.match(html,/id="run-shortcut"[^>]*href="shortcuts:\/\/run-shortcut\?name=Rage%20Tracker%20Sync"/);
 assert.match(html,/id="shortcut-preview"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
 assert.doesNotMatch(html,/device-key\.txt/);
 assert.doesNotMatch(app,/markShortcutInstalled/);
});

test("current storage model contains only owner-scoped tables",()=>{
 for(const table of ["rt_users","rt_devices","rt_health_metrics","rt_calendar_events"])
  assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS "+table),table);
 assert.doesNotMatch(schema,/CREATE TABLE IF NOT EXISTS (?:sync_tokens|health_metrics|calendar_events)\b/);
 assert.match(worker,/WHERE owner_email=\?/);
 assert.match(worker,/WHERE device_id=\? AND owner_email=\?/);
});
