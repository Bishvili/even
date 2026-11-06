"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");

const worker=fs.readFileSync(path.join(root,"worker","index.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const schema=fs.readFileSync(path.join(root,"db","schema.sql"),"utf8");

test("server offers upgrades only for verified releases",()=>{
 assert.match(worker,/release\.verified&&semverNewer\(release\.version,installed\)/);
 assert.match(worker,/automaticReplacement:false/);
 assert.doesNotMatch(worker,/"source\.zip":"application\/zip"/);
});

test("the public listing is offered without a falsely signed release",()=>{
 assert.match(html,/id="sync-action"/);assert.match(app,/run-shortcut\?name=\{\{syncUrl\}\}/);
 assert.doesNotMatch(app,/markShortcutInstalled/);
});

test("current storage model contains only owner-scoped tables",()=>{
 for(const table of ["health_users","health_devices","health_metrics","health_calendar_events"])
  assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS "+table),table);
 assert.doesNotMatch(schema,/CREATE TABLE IF NOT EXISTS (?:sync_tokens|calendar_events)\b/);
 assert.match(worker,/WHERE owner_email=\?/);
 assert.match(worker,/WHERE device_id=\? AND owner_email=\?/);
});
