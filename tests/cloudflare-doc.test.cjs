"use strict";
// The setup guide's reset must name every table, so a new table that holds someone's data is either cleared or kept on purpose.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
test("starting the data over names every table in the schema",()=>{
 const guide=read("CLOUDFLARE.md"),tables=[...read("db/schema.sql").matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/g)].map(m=>m[1]);
 const kept=["health_approved_emails","health_release_emails","health_names"],cleared=[...guide.matchAll(/DELETE FROM (\w+)/g)].map(m=>m[1]);
 for(const table of tables)assert.ok(kept.includes(table)!==cleared.includes(table),table+" must be either kept or cleared");
 for(const table of kept)assert.ok(guide.includes("`"+table+"`"),table);
});
