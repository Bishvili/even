"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname,"..");
const source = fs.readFileSync(path.join(root,"shortcuts","even-sync.cherri"),"utf8");
const worker = fs.readFileSync(path.join(root,"worker","index.js"),"utf8");
const pattern = "yyyy-MM-dd'T'HH:mm:ssZZZZZ";

test("both Calendar dates use full ISO 8601 timestamps and offsets, not date-only formatting",()=>{
 for (const [name,sourceName] of [["startISO","startDate"],["endISO","endDate"]]){
  assert.ok(source.includes(`const ${name} = formatTimestamp(${sourceName}, "Custom", "None", "${pattern}")`),name);
 }
 assert.doesNotMatch(source,/formatDate\((?:startDate|endDate),\s*"ISO 8601"\)/);
 assert.match(source,/"start": "\{startISO\}"/);
 assert.match(source,/"end": "\{endISO\}"/);
 assert.match(worker,/end-start>172800000/);
});

test("Calendar upload surfaces the actual API error without printing event titles or credentials",()=>{
 assert.match(source,/getValue\(eventResponse, "error"\)/);
 assert.match(source,/Your calendar didn't sync\. \{eventError\}/);
 assert.doesNotMatch(source,/alert\("[^"]*\{title\}/);
});

test("Health data normalizes grouped step totals before uploading",()=>{
 assert.match(source,/const normalizedSteps = replaceText/);
 assert.match(source,/"steps": "\{stepsValue\}"/);
 assert.match(source,/getValue\(healthResponse, "error"\)/);
 assert.doesNotMatch(source,/"steps": "\{totalSteps\}"/);
});

test("the device handshake and every upload report the Shortcut version",()=>{
 assert.equal((source.match(/"shortcutVersion": "2\.4\.1"/g)||[]).length,9);
 assert.match(source,/\/api\/shortcut\/release\?current=2\.4\.1/);
});
