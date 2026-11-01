"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const worker=fs.readFileSync(path.join(__dirname,"..","worker","index.js"),"utf8");
const start=worker.indexOf("function classifyCalendarTitle(");
const end=worker.indexOf("\nasync function ",start);
assert.ok(start>=0&&end>start,"Calendar parser functions must remain grouped");
const source=worker.slice(start,end);
const {classifyCalendarTitle,readEvent}=new Function("CATS",
 source+";return {classifyCalendarTitle,readEvent};"
)(["Meeting","Work","Exercise","Social","Family","Rest","Commute","Other"]);

test("calendar event classification handles common activities",()=>{
 assert.equal(classifyCalendarTitle("Team meeting"),"Meeting");
 assert.equal(classifyCalendarTitle("Sales call"),"Meeting");
 assert.equal(classifyCalendarTitle("Morning workout"),"Exercise");
 assert.equal(classifyCalendarTitle("Evening gym"),"Exercise");
 assert.equal(classifyCalendarTitle("Coffee with Alex"),"Social");
 assert.equal(classifyCalendarTitle("Family brunch"),"Social");
 assert.equal(classifyCalendarTitle("Commute home"),"Commute");
 assert.equal(classifyCalendarTitle("Dentist appointment"),"Other");
 assert.equal(classifyCalendarTitle("Callback debug"),"Other");
});

test("explicit event category takes precedence over inferred title",()=>{
 const fixture={title:"Lunch meeting",start:"2026-11-01T12:00:00-08:00",end:"2026-11-01T12:30:00-08:00",category:"Other"};
 assert.equal(readEvent(fixture).category,"Other");
 assert.equal(readEvent({...fixture,category:"Family"}).category,"Family");
 assert.equal(readEvent({...fixture,category:undefined}).category,"Meeting");
});

test("only plausible event dates and durations are accepted",()=>{
 const base={title:"Team meeting",start:"2026-11-01T10:00:00-08:00",end:"2026-11-01T11:00:00-08:00"};
 assert.equal(readEvent(base).category,"Meeting");
 assert.equal(readEvent(base).start,"2026-11-01T18:00:00.000Z");
 assert.equal(readEvent({...base,end:base.start}),null);
 assert.equal(readEvent({...base,start:"invalid"}),null);
 assert.equal(readEvent({...base,end:"2026-11-04T10:00:00-08:00"}),null);
 assert.equal(readEvent({...base,title:""}).title,"Calendar event");
});
