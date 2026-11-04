"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../coach.js");
const {outlook,patterns,brief,hardStretch,steadiness,reflectionDue,smartTimes,repeatTimes}=globalThis.EvenCoach;
const today=new Date(2026,10,3,12);// a Tuesday
const at=(daysAgo,hour=12)=>{const d=new Date(today);d.setDate(d.getDate()-daysAgo);d.setHours(hour);return d.toISOString();};

test("the outlook needs three rated check-ins for a weekday before naming a pattern",()=>{
 const moods=[{ts:at(7),stress:5},{ts:at(14),stress:5},{ts:at(1),stress:1}];
 assert.deepEqual(outlook(moods,today).map(d=>d.level),Array(7).fill("unknown"));
});
test("the outlook compares each weekday with the person's own average and ignores unrated check-ins",()=>{
 const moods=[7,14,21].map(n=>({ts:at(n),stress:5})).concat([1,8,15,2,9,16].map(n=>({ts:at(n),stress:2})),[{ts:at(28),score:1}]);
 const days=outlook(moods,today);
 assert.equal(days[0].name,"Tuesday");
 assert.equal(days[0].level,"harder");
 assert.equal(days[0].samples,3);
 assert.equal(days.find(d=>d.name==="Monday").level,"easier");
});
test("history older than eight weeks is left out",()=>{
 const moods=[70,77,84].map(n=>({ts:at(n),stress:5}));
 assert.equal(outlook(moods,today)[0].samples,0);
});
test("patterns need samples on both sides, show only higher stress, and rank by gap",()=>{
 const moods=[];
 for(let i=0;i<4;i++)moods.push({ts:at(i*2),stress:5,tags:["Commute"]},{ts:at(i*2+1),stress:2,tags:[]});
 moods.push({ts:at(20),stress:1,tags:["Rest"]});
 const rows=patterns(moods,[],[]);
 assert.deepEqual(rows.map(r=>r.label),["Commute"]);
 assert.equal(rows[0].withCount,4);
});
test("short sleep is compared against rested days",()=>{
 const moods=[],health=[];
 for(let i=0;i<6;i++){moods.push({ts:at(i),stress:i<3?5:2,tags:[]});const d=new Date(at(i));health.push({date:d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"),sleepHours:i<3?5:8});}
 assert.equal(patterns(moods,[],health)[0].label,"After under 6.5 hours of sleep");
});
test("brief language states tendencies and avoids diagnosis or alarm",()=>{
 for(const level of ["harder","easier","typical","unknown"])
  assert.doesNotMatch(brief({name:"Tuesday",level}),/abnormal|at risk|alert|caus|diagnos/i);
});
test("a hard stretch needs high stress on three recent days",()=>{
 assert.equal(hardStretch([0,1].map(n=>({ts:at(n),stress:5})),today),false);
 assert.equal(hardStretch([0,1,2].map(n=>({ts:at(n),stress:4})),today),true);
 assert.equal(hardStretch([10,11,12].map(n=>({ts:at(n),stress:5})),today),false);
});
test("the weekly reflection scores a steadier week higher and rejects incomplete answers",()=>{
 assert.equal(steadiness({snapped:0,setOff:0,recovered:4,rested:4}),100);
 assert.equal(steadiness({snapped:4,setOff:4,recovered:0,rested:0}),0);
 assert.equal(steadiness({snapped:2,setOff:2,recovered:2}),null);
});
test("the reflection is due at first and again after seven days",()=>{
 assert.equal(reflectionDue([],today),true);
 assert.equal(reflectionDue([{ts:at(3)}],today),false);
 assert.equal(reflectionDue([{ts:at(7)}],today),true);
});
test("smart reminders favor usual check-in times and stay inside the window",()=>{
 const local=(hour,minute)=>{const d=new Date(today);d.setHours(hour,minute);return d.toISOString();};
 const moods=[{ts:local(10,5)},{ts:local(10,20)},{ts:local(23,0)}];
 const times=smartTimes(moods,"09:00","21:00",2,today);
 assert.equal(times[0],"10:00");
 assert.equal(times[1],"18:00");
 assert.equal(smartTimes([],"09:00","21:00",3,today).length,3);
 assert.deepEqual(smartTimes([],"21:00","09:00",2,today),[]);
});
test("repeating reminders run every interval through the end of the window",()=>{
 assert.deepEqual(repeatTimes("09:00","15:00",2),["09:00","11:00","13:00","15:00"]);
});
