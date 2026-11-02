"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const start=source.indexOf("function zonedTimeToISO");
const body=source.slice(start,source.indexOf("\n}\n",source.indexOf("function parseICS(text)"))+3);
const {parseICS}=new Function(body+";return {parseICS};")();
const one=lines=>parseICS("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n"+lines.join("\r\n")+"\r\nEND:VEVENT\r\nEND:VCALENDAR")[0];
test("TZID times resolve across daylight saving",()=>{
 assert.equal(one(["DTSTART;TZID=America/New_York:20260110T090000"]).start,"2026-01-10T14:00:00.000Z");
 assert.equal(one(["DTSTART;TZID=America/New_York:20260710T090000"]).start,"2026-07-10T13:00:00.000Z");
 assert.equal(one(["DTSTART;TZID=America/New_York:20260308T033000"]).start,"2026-03-08T07:30:00.000Z");
 assert.equal(one(['DTSTART;TZID="Asia/Tokyo":20260710T090000']).start,"2026-07-10T00:00:00.000Z");
});
test("UTC times stay exact, and missing ends get a default",()=>{
 const e=one(["DTSTART:20260710T090000Z"]);
 assert.equal(e.start,"2026-07-10T09:00:00.000Z");assert.equal(e.end,"2026-07-10T10:00:00.000Z");
});
test("all-day events default to one day",()=>{
 const e=one(["DTSTART;VALUE=DATE:20260710"]);
 assert.equal(new Date(e.end)-new Date(e.start),86400000);
});
test("an unknown zone falls back to device time instead of failing",()=>{
 assert.ok(one(["DTSTART;TZID=Not/AZone:20260710T090000"]).start);
});
test("an edited event keeps its UID, and recurring instances stay distinct",()=>{
 assert.equal(one(["UID:abc","SUMMARY:New title","DTSTART:20260710T090000Z"]).id,"abc");
 assert.equal(one(["UID:abc","RECURRENCE-ID:20260710T090000Z","DTSTART:20260711T090000Z"]).id,"abc|20260710T090000Z");
});
