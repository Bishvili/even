"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../coach.js");
const {outlook,patterns,brief,hardStretch,steadiness,reflectionDue,smartTimes,repeatTimes,bedtimeReminder,smartPlan}=globalThis.EvenCoach;
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
test("the bedtime reminder uses sleep, then late check-ins, then the window end",()=>{
 const day=n=>{const d=new Date(today);d.setDate(d.getDate()-n);return d;};
 const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
 const sleep=[1,2,3].map(n=>({date:iso(day(n)),bedtimeMin:23*60}));
 assert.equal(bedtimeReminder(sleep,[],"21:00",today),"22:40");
 const afterMidnight=[1,2,3].map(n=>({date:iso(day(n)),bedtimeMin:10}));
 assert.equal(bedtimeReminder(afterMidnight,[],"21:00",today),"23:50");
 const late=[1,2,3,4,5].map(n=>{const d=day(n);d.setHours(21,30,0,0);return{ts:d.toISOString()};});
 assert.equal(bedtimeReminder([],late,"21:00",today),"21:40");
 assert.equal(bedtimeReminder([],[],"21:00",today),"20:40");
});
test("the bedtime reminder counts toward the daily total and stays inside the window",()=>{
 const plan=smartPlan([],[],"09:00","21:00",3,today);
 assert.equal(plan.times.length,3);
 assert.equal(plan.bedtimeAt,"20:40");
 assert.equal(plan.times[2],"20:40");
 assert.deepEqual(smartPlan([],[],"09:00","21:00",1,today).times,["20:40"]);
 const d=new Date(today);d.setDate(d.getDate()-1);
 const iso=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
 const outside=smartPlan([],[{date:iso,bedtimeMin:1400},{date:iso,bedtimeMin:1400},{date:iso,bedtimeMin:1400}],"09:00","21:00",2,today);
 assert.equal(outside.bedtimeAt,null);
 assert.equal(outside.times.length,2);
 assert.ok(outside.times.every(time=>time>="09:00"&&time<="21:00"));
});

test("answers shape the plan and every notification keeps its reason",()=>{
 const plan=smartPlan([],[],"07:00","22:00",4,today,{brief:true,windDown:true,hardest:"afternoon"});
 assert.equal(plan.briefAt,"07:30");
 assert.equal(plan.bedtimeAt,"21:40");
 assert.equal(plan.hardAt,"15:00");
 assert.equal(plan.times.length,4);
 assert.deepEqual([...plan.times].sort(),plan.times);
 assert.equal(plan.slots.find(s=>s.kind==="hard").part,"afternoon");
 assert.equal(plan.slots.filter(s=>s.kind==="spaced").length,1);
 assert.deepEqual(plan.left,[]);
});
test("a small daily total keeps the most useful notifications and names the rest",()=>{
 const plan=smartPlan([],[],"07:00","22:00",1,today,{brief:true,windDown:true,hardest:"afternoon"});
 assert.deepEqual(plan.times,["21:40"]);
 assert.equal(plan.briefAt,null);
 assert.deepEqual(plan.left,["brief","hard"]);
});
test("turning off the wind-down and brief leaves only check-ins",()=>{
 const plan=smartPlan([],[],"09:00","21:00",2,today,{brief:false,windDown:false,hardest:"varies"});
 assert.equal(plan.bedtimeAt,null);
 assert.equal(plan.briefAt,null);
 assert.equal(plan.times.length,2);
});
test("a harder-time check-in stays clear of the brief and outside hours are dropped",()=>{
 const moved=smartPlan([],[],"09:00","21:00",3,today,{brief:true,windDown:true,hardest:"morning"});
 assert.equal(moved.briefAt,"09:30");
 assert.equal(moved.hardAt,"10:30");
 assert.equal(smartPlan([],[],"13:00","21:00",3,today,{brief:false,windDown:true,hardest:"morning"}).hardAt,null);
});

const {anticipate,nextActions,bedtimeForAlarm,morningAlarm}=globalThis.EvenCoach;
const hours=(base,offsetDays,hour)=>{const d=new Date(base);d.setDate(d.getDate()+offsetDays);d.setHours(hour,0,0,0);return d;};
test("alarms move the brief and bring the wind-down forward only when earlier",()=>{
 const monday=new Date("2026-11-09T12:00:00");
 const alarms=[{timeMin:390,days:[1,2],enabled:true,label:"Gym"},{timeMin:600,days:[6],enabled:false,label:null}];
 assert.equal(morningAlarm(alarms,monday).label,"Gym");
 assert.equal(morningAlarm(alarms,new Date("2026-11-14T12:00:00")),null);
 assert.equal(bedtimeForAlarm(alarms,[],monday).bed,"22:30");
 const plan=smartPlan([],[],"07:00","23:30",3,monday,{brief:true,windDown:true,hardest:"varies",alarms});
 assert.equal(plan.briefAt,"06:45");
 assert.equal(plan.bedtimeAt,"22:10");
 assert.equal(plan.slots.find(s=>s.kind==="bedtime").source,"alarm");
 const late=smartPlan([],[],"07:00","21:00",3,monday,{brief:true,windDown:true,hardest:"varies",alarms:[{timeMin:600,days:[2],enabled:true,label:null}]});
 assert.equal(late.bedtimeAt,"20:40");
});
test("a harder moment is anticipated only with evidence, and capped each day",()=>{
 const now=new Date("2026-11-09T08:00:00");
 const prefs={from:"07:00",to:"22:00",weekends:true};
 assert.deepEqual(anticipate([],[],[],now,prefs),[]);
 const moods=[];
 for(let week=1;week<=6;week++){moods.push({ts:hours(now,-7*week,15).toISOString(),stress:5});moods.push({ts:hours(now,-7*week,16).toISOString(),stress:5});moods.push({ts:hours(now,-7*week+1,10).toISOString(),stress:1});}
 const found=anticipate(moods,[],[],now,prefs);
 const monday=found.find(item=>new Date(item.at).getDay()===1);
 assert.ok(monday);
 assert.equal(new Date(monday.at).getHours(),13);
 assert.match(monday.message,/Monday afternoons/);
 const events=[1,2,3].map(n=>({start:hours(now,-n*7-2,11).toISOString(),end:hours(now,-n*7-2,12).toISOString(),category:"Work"}));
 const stressed=events.map(e=>({ts:e.start,stress:5}));
 const calm=[1,2,3].map(n=>({ts:hours(now,-n*7-3,20).toISOString(),stress:1}));
 const soon=[{start:hours(now,0,17).toISOString(),end:hours(now,0,18).toISOString(),category:"Work"}];
 const eventNudge=anticipate(stressed.concat(calm),events.concat(soon),[],now,prefs)[0];
 assert.equal(new Date(eventNudge.at).getHours(),16);
 assert.equal(new Date(eventNudge.at).getMinutes(),45);
 assert.match(eventNudge.why,/points higher/);
 assert.ok(Object.values(found.reduce((c,i)=>{const k=i.at.slice(0,10);c[k]=(c[k]||0)+1;return c;},{})).every(n=>n<=2));
});
test("next actions offer a stale sync and tomorrow's alarm in the evening",()=>{
 const evening=new Date("2026-11-09T19:00:00");
 const alarms=[{timeMin:390,days:[2],enabled:true,label:"Gym"}];
 const actions=nextActions({moods:[],events:[],health:[],alarms,connected:true,lastUpload:"2026-11-08T08:00:00Z"},evening,{from:"07:00",to:"22:00"});
 assert.match(actions[0].text,/Gym/);
 assert.equal(actions[1].action,"sync");
 assert.deepEqual(nextActions({moods:[],events:[],health:[],alarms:[],connected:false},evening,{from:"07:00",to:"22:00"}),[]);
});

const {whatHelps}=globalThis.EvenCoach;
test("what tends to help needs five check-ins each way and names the better outcome",()=>{
 const now=new Date("2026-11-09T09:00:00");
 const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
 const moods=[],health=[];
 for(let n=1;n<=12;n++){
  const day=hours(now,-n,12),active=n%2===0;
  moods.push({ts:day.toISOString(),stress:active?2:4,score:3,energy:3,tags:[]});
  health.push({date:iso(day),workoutMin:active?30:0});
 }
 const rows=whatHelps(moods,[],health,[],now);
 assert.equal(rows[0].id,"workout");
 assert.equal(rows[0].effects[0].name,"lower stress");
 assert.equal(rows[0].effects[0].gap,2);
 assert.equal(rows[0].done,false);
 assert.deepEqual(whatHelps(moods.slice(0,8),[],health,[],now),[]);
 const done=whatHelps(moods,[],health.concat({date:iso(now),workoutMin:20}),[],now);
 assert.equal(done[0].done,true);
 const action=nextActions({moods,events:[],health,alarms:[],resets:[],connected:false},now,{from:"07:00",to:"22:00"});
 assert.match(action[0].text,/Fit in some movement/);
 assert.match(action[0].text,/lower stress/);
 assert.match(action[0].why,/not proof of cause/);
});
test("a recent hard check-in is matched with what has gone with relief, and breathing can be measured",()=>{
 const now=new Date("2026-11-09T10:00:00"),moods=[],resets=[];
 for(let n=1;n<=12;n++){
  const day=hours(now,-n,12),calm=n%2===0;
  if(calm)resets.push(hours(now,-n,11).toISOString());
  moods.push({ts:day.toISOString(),stress:calm?2:4,score:3,energy:3,tags:[]});
 }
 moods.push({ts:hours(now,0,9).toISOString(),stress:5,score:3,energy:3,tags:[]});
 const action=nextActions({moods,events:[],health:[],alarms:[],resets,connected:false},now,{from:"07:00",to:"22:00"})[0];
 assert.match(action.text,/^You noted high stress\. Take a minute\./);
 assert.equal(action.action,"reset");
});
