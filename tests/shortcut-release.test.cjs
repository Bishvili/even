"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");

const source=fs.readFileSync(path.join(root,"shortcuts","even-sync.cherri"),"utf8");
const worker=fs.readFileSync(path.join(root,"worker","index.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const schema=fs.readFileSync(path.join(root,"db","schema.sql"),"utf8");

test("main sync reads its saved device key before the handshake and uploads",()=>{
 const read=source.indexOf("const savedKeyFile = readSavedDeviceKey(keyFolder)");
 const handshake=source.indexOf('jsonRequest("https://even.bishvili.workers.dev/api/shortcut/hello"');
 const firstUpload=source.indexOf('formRequest("https://even.bishvili.workers.dev/api/ingest"');
 assert.ok(read>=0&&read<handshake&&handshake<firstUpload);
 assert.doesNotMatch(source,/#question/);
 assert.doesNotMatch(source,/Bearer [a-f0-9]{64}/i);
});

test("the Shortcut identifies itself on the handshake, uploads, and update query",()=>{
 assert.match(source,/"shortcutVersion": "2\.4\.1"/);
 assert.equal((source.match(/"shortcutVersion": "2\.4\.1"/g)||[]).length,9);
 assert.match(source,/\/api\/shortcut\/release\?current=2\.4\.1/);
 assert.match(source,/getValue\(handshake, "state"\)/);
 assert.match(source,/if connectionStatus != "connected"/);
});

test("server offers upgrades only for verified releases",()=>{
 assert.match(worker,/release\.verified&&semverNewer\(release\.version,installed\)/);
 assert.match(worker,/automaticReplacement:false/);
 assert.doesNotMatch(worker,/"source\.zip":"application\/zip"/);
});

test("the public listing is offered without a falsely signed release",()=>{
 assert.match(html,/id="run-shortcut"[^>]*href="shortcuts:\/\/run-shortcut\?name=Even%20Sync"/);
 assert.doesNotMatch(worker,/even-sync-v2\.2\.shortcut/);
 assert.doesNotMatch(html,/even-sync-v2\.2\.shortcut/);
 assert.doesNotMatch(app,/markShortcutInstalled/);
});

test("current storage model contains only owner-scoped tables",()=>{
 for(const table of ["even_users","even_devices","even_health_metrics","even_calendar_events"])
  assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS "+table),table);
 assert.doesNotMatch(schema,/CREATE TABLE IF NOT EXISTS (?:sync_tokens|health_metrics|calendar_events)\b/);
 assert.match(worker,/WHERE owner_email=\?/);
 assert.match(worker,/WHERE device_id=\? AND owner_email=\?/);
});
