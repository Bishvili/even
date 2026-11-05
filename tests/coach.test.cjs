"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../coach.js");
const {outlook,findings,brief,hardStretch,steadiness,reflectionDue,smartTimes,repeatTimes,bedtimeReminder,smartPlan,REFLECTION}=globalThis.EvenCoach;
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
test("findings need 5 check-ins each way and a 0.4 point difference, and name each subject once",()=>{
 const moods=[];
 for(let i=0;i<5;i++)moods.push({ts:at(i*2),stress:5,tags:["Commute"]},{ts:at(i*2+1),stress:2,tags:[]});
 moods.push({ts:at(20),stress:1,tags:["Rest"]});
 const rows=findings(moods,[],[],[],new Date());
 assert.deepEqual(rows.map(r=>r.label),["Commute"]);
 assert.equal(rows[0].effect.withCount,5);
 assert.equal(rows[0].effect.name,"higher stress");
 assert.deepEqual(findings(moods.slice(0,8),[],[],[],new Date()),[]);
});
test("short sleep is compared against rested days, and sleep appears once",()=>{
 const moods=[],health=[];
 for(let i=0;i<12;i++){moods.push({ts:at(i),stress:i<6?5:2,tags:[]});const d=new Date(at(i));health.push({date:d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"),sleepHours:i<6?5:8});}
 const rows=findings(moods,[],health,[],new Date());
 assert.equal(rows.filter(r=>/sleep/.test(r.label)).length,1);
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
test("rewording the reflection keeps what each stored answer means, so earlier scores still compare",()=>{
 assert.deepEqual(REFLECTION.map(q=>[q.id,!!q.reverse,q.options.length]),[["snapped",true,5],["setOff",true,5],["recovered",false,5],["rested",false,5]]);
 for(const q of REFLECTION)assert.equal(new Set(q.options).size,5,q.id+" needs five distinct answers");
});
test("the reflection waits for a week of check-ins, then comes every seven days",()=>{
 assert.equal(reflectionDue([],[],today),false);
 assert.equal(reflectionDue([],[{ts:at(6)},{ts:at(0)}],today),false);
 assert.equal(reflectionDue([],[{ts:at(7)}],today),true);
 assert.equal(reflectionDue([{ts:at(3)}],[{ts:at(20)}],today),false);
 assert.equal(reflectionDue([{ts:at(7)}],[{ts:at(20)}],today),true);
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
 const events=[1,2,3,4,5].map(n=>({start:hours(now,-n*7-2,11).toISOString(),end:hours(now,-n*7-2,12).toISOString(),category:"Work"}));
 const stressed=events.map(e=>({ts:e.start,stress:5}));
 const calm=[1,2,3,4,5].map(n=>({ts:hours(now,-n*7-3,20).toISOString(),stress:1}));
 const soon=[{start:hours(now,0,17).toISOString(),end:hours(now,0,18).toISOString(),category:"Work"}];
 const eventNudge=anticipate(stressed.concat(calm),events.concat(soon),[],now,prefs)[0];
 assert.equal(new Date(eventNudge.at).getHours(),16);
 assert.equal(new Date(eventNudge.at).getMinutes(),40);
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

test("a name opens a hard day's brief and a nudge, and is left out without one",()=>{
 const day={level:"harder",name:"Monday"};
 assert.match(brief(day,null,"Sam"),/^Sam, Mondays have tended/);
 assert.match(brief(day),/^Mondays have tended/);
 assert.doesNotMatch(brief({level:"typical",name:"Monday"},null,"Sam"),/Sam/);
 const now=new Date("2026-11-09T08:00:00"),moods=[];
 for(let week=1;week<=6;week++){moods.push({ts:hours(now,-7*week,15).toISOString(),stress:5});moods.push({ts:hours(now,-7*week,16).toISOString(),stress:5});moods.push({ts:hours(now,-7*week+1,10).toISOString(),stress:1});}
 const found=anticipate(moods,[],[],now,{from:"07:00",to:"22:00",firstName:"Sam"});
 assert.match(found[0].message,/^Sam, Monday afternoons/);
});

test("hard days are counted in calendar days",()=>{
 const noon=new Date("2026-11-09T12:00:00"),day=n=>{const d=new Date(noon);d.setDate(d.getDate()-n);return d.toISOString();};
 assert.equal(hardStretch([0,1,3].map(n=>({ts:day(n),stress:4})),noon),true);
 assert.equal(hardStretch([0,1,4].map(n=>({ts:day(n),stress:4})),noon),false);
});

const {weekSchedule,validDay}=globalThis.EvenCoach;
test("a day can run past midnight, up to 20 hours",()=>{
 assert.equal(validDay("09:00","00:30"),true);
 assert.equal(validDay("22:00","06:00"),true);
 assert.equal(validDay("09:00","08:00"),false);
 const plan=smartPlan([],[],"09:00","00:30",3,new Date("2026-11-09T12:00:00"),{windDown:true});
 assert.equal(plan.bedtimeAt,"00:10");
 assert.equal(plan.times[plan.times.length-1],"00:10");
 assert.deepEqual(repeatTimes("22:00","01:00",1),["22:00","23:00","00:00","01:00"]);
});
test("the week's plan keeps a wind-down on the nights before its alarm",()=>{
 const monday=new Date("2026-11-09T08:00:00");
 const alarms=[{timeMin:360,days:[2],enabled:true,label:"Gym"}];
 const prefs={mode:"smart",from:"07:00",to:"23:30",count:2,windDown:true,brief:false,hardest:"varies",alarms};
 const items=weekSchedule([],[],prefs,monday),beds=items.filter(i=>i.kind==="bedtime").map(i=>new Date(i.at));
 const clock=d=>d.getHours()*60+d.getMinutes();
 const mondayNight=beds.find(d=>d.getDay()===1),wednesdayNight=beds.find(d=>d.getDay()===3);
 assert.equal(clock(mondayNight),21*60+40);
 assert.equal(clock(wednesdayNight),23*60+10);
 assert.ok(items.every(i=>new Date(i.at)>monday));
 assert.equal(new Set(items.map(i=>new Date(i.at).getDate())).size,7);
});
test("the week's plan skips weekends when asked, and places a time after midnight on the next date",()=>{
 const monday=new Date("2026-11-09T08:00:00");
 const off=weekSchedule([],[],{mode:"times",customTimes:["09:00"],weekends:false,from:"09:00",to:"21:00"},monday);
 assert.ok(off.every(i=>![0,6].includes(new Date(i.at).getDay())));
 const late=weekSchedule([],[],{mode:"smart",from:"09:00",to:"00:30",count:1,windDown:true},monday);
 const first=new Date(late[0].at);
 assert.equal(first.getDate(),10);
 assert.equal(first.getHours(),0);
 assert.equal(late[0].kind,"bedtime");
});
test("a nudge before an event is planned 20 minutes ahead",()=>{
 const now=new Date("2026-11-09T08:00:00");
 const events=[1,2,3,4,5].map(n=>({start:hours(now,-n*7-2,11).toISOString(),end:hours(now,-n*7-2,12).toISOString(),category:"Work"}));
 const moods=events.map(e=>({ts:e.start,stress:5})).concat([1,2,3,4,5].map(n=>({ts:hours(now,-n*7-3,20).toISOString(),stress:1})));
 const soon=[{start:hours(now,0,17).toISOString(),end:hours(now,0,18).toISOString(),category:"Work"}];
 const nudge=new Date(anticipate(moods,events.concat(soon),[],now,{from:"07:00",to:"22:00",weekends:true})[0].at);
 assert.equal(nudge.getHours(),16);assert.equal(nudge.getMinutes(),40);
});

// A few fictional people, so a rule change can't silently break them.
const dayKey=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const past=n=>{const d=new Date();d.setDate(d.getDate()-n);d.setHours(12,0,0,0);return d;};
test("someone with history is compared with their own usual, including resting heart rate",()=>{
 const moods=[],health=[];
 for(let i=1;i<=21;i++){const high=i%2===0;moods.push({ts:past(i).toISOString(),stress:high?5:2,score:3,tags:[]});health.push({date:dayKey(past(i)),restingHR:high?70:55,sleepHours:9.5});}
 const rows=findings(moods,[],health,[],new Date());
 const resting=rows.find(r=>r.id==="resting");
 assert.match(resting.label,/above your usual/);
 assert.equal(resting.effect.name,"higher stress");
 assert.ok(resting.effect.consistent);
 assert.doesNotMatch(JSON.stringify(rows),/diagnos|abnormal|at risk/i);
});
test("someone with no Health or calendar data still gets tag patterns, and no invented ones",()=>{
 const moods=[];
 for(let i=1;i<=12;i++)moods.push({ts:past(i).toISOString(),stress:i%2?5:2,tags:i%2?["Commute"]:[]});
 assert.deepEqual(findings(moods,[],[],[],new Date()).map(r=>r.label),["Commute"]);
});
test("a pattern from only recent check-ins is labeled an early sign",()=>{
 const moods=[];
 for(let i=1;i<=24;i++)moods.push({ts:past(i).toISOString(),stress:i<=12?(i%2?5:2):(i%2?1:2),tags:i%2?["Commute"]:[]});
 const row=findings(moods,[],[],[],new Date())[0];
 if(row)assert.equal(row.effect.consistent,false);
});
test("no check-in lands during a calendar event, and tomorrow's first event sets the wind-down",()=>{
 const now=new Date("2026-11-09T07:00:00");
 const prefs={mode:"smart",from:"08:00",to:"22:00",count:8,weekends:true,alarms:[],windDown:true};
 const plain=weekSchedule([],[],prefs,now).filter(i=>i.kind==="custom"&&i.at.startsWith(new Date("2026-11-09T12:00:00").toISOString().slice(0,10)));
 assert.ok(plain.length);
 const when=new Date(plain[0].at),start=new Date(when.getTime()-600000),end=new Date(when.getTime()+1800000);
 const event={start:start.toISOString(),end:end.toISOString(),category:"Work"};
 const moved=weekSchedule([],[],Object.assign({},prefs,{events:[event]}),now);
 assert.ok(moved.filter(i=>i.kind==="custom").every(i=>{const t=Date.parse(i.at);return t<start.getTime()||t>=end.getTime();}));
 const early={start:"2026-11-10T07:00:00",end:"2026-11-10T08:00:00",category:"Work"};
 const withEvent=smartPlan([],[],"08:00","23:30",5,now,{events:[early]}),without=smartPlan([],[],"08:00","23:30",5,now,{});
 assert.equal(withEvent.slots.find(s=>s.kind==="bedtime").source,"event");
 assert.notEqual((without.slots.find(s=>s.kind==="bedtime")||{}).source,"event");
});
test("the plan shown is the plan sent, with spaced check-ins, and an all-day event changes nothing",()=>{
 const now=new Date("2026-11-06T07:00:00"),{smartPlan,weekSchedule}=globalThis.EvenCoach;
 const prefs={mode:"smart",from:"08:00",to:"22:00",count:5,weekends:true,alarms:[],windDown:false};
 const long={start:"2026-11-06T09:30:00",end:"2026-11-06T16:00:00",category:"Work"};
 const shown=smartPlan([],[],"08:00","22:00",5,now,Object.assign({},prefs,{events:[long]}));
 const sent=weekSchedule([],[],Object.assign({},prefs,{events:[long]}),now).filter(i=>new Date(i.at).getDate()===6).map(i=>new Date(i.at).getHours()*60+new Date(i.at).getMinutes());
 assert.deepEqual(sent,shown.slots.map(s=>s.minute));
 const sorted=shown.slots.map(s=>s.minute);
 for(let i=1;i<sorted.length;i++)assert.ok(sorted[i]-sorted[i-1]>=45,sorted.join());
 const allDay={start:"2026-11-07T00:00:00",end:"2026-11-08T00:00:00",category:"Other"},early={start:"2026-11-07T07:00:00",end:"2026-11-07T08:00:00",category:"Work"};
 const plain=smartPlan([],[],"08:00","23:30",5,now,{events:[early]}).slots.find(s=>s.kind==="bedtime");
 const both=smartPlan([],[],"08:00","23:30",5,now,{events:[allDay,early]}).slots.find(s=>s.kind==="bedtime");
 assert.equal(both.source,"event");assert.equal(both.minute,plain.minute);
});
test("one subject appears once, with the rest in its detail, and other events are left out",()=>{
 const moods=[],events=[];
 for(let i=1;i<=20;i++){const on=i%2===0,t=past(i);moods.push({ts:t.toISOString(),stress:on?2:5,tags:on?["Exercise","Outdoors"]:[]});if(on){events.push({start:t.toISOString(),end:new Date(t.getTime()+1800000).toISOString(),category:"Exercise"});}else events.push({start:t.toISOString(),end:new Date(t.getTime()+1800000).toISOString(),category:"Other"});}
 const rows=findings(moods,events,[],[],new Date());
 assert.equal(rows.length,1,JSON.stringify(rows.map(r=>r.label)));
 assert.ok(rows[0].also.length>=2);
 assert.doesNotMatch(JSON.stringify(rows),/other events/i);
});
test("a subject whose comparisons disagree is marked mixed",()=>{
 const moods=[],events=[];
 for(let i=1;i<=24;i++){const t=past(i),tagged=i%4===0||i%4===1,evented=i%4===0||i%4===2;
  moods.push({ts:t.toISOString(),stress:tagged?(evented?3:5):(evented?1:3),tags:tagged?["Work"]:[]});
  if(evented)events.push({start:t.toISOString(),end:new Date(t.getTime()+1800000).toISOString(),category:"Work"});}
 const row=findings(moods,events,[],[],new Date()).find(r=>r.subject==="Work");
 assert.equal(row.mixed,true);
});
