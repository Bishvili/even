"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../daycontext.js");
require("../activities.js");
require("../coach.js");
const A=globalThis.Activities,{calmFirst,wakeTime,activityActions,nextActions}=globalThis.Coach;

test("ideas fit the time and energy given, match what lifts the person, and skip what's already saved",()=>{
 const found=A.ideas({kinds:["outside"],minutes:10,energy:1},[]);
 assert.ok(found.length>0&&found.length<=5);
 assert.ok(found.every(i=>i.minutes<=10&&i.energy<=1&&i.kinds.includes("outside")));
 const again=A.ideas({kinds:["outside"],minutes:10,energy:1},[{title:found[0].title}]);
 assert.ok(!again.some(i=>i.title===found[0].title));
 assert.equal(A.ideas({kinds:["people"],minutes:10,energy:1},[]).some(i=>i.energy>1),false);
 // Nothing suggested is vigorous solo exercise like jogging, which can raise anger.
 assert.ok(!A.CATALOG.some(i=>/jog|run\b/i.test(i.title)));
});

test("favorites put what was done first, and a passed planned time is asked about once",()=>{
 const now=new Date(2026,10,6,18);
 const saved=[{id:"a",title:"Walk",at:"2026-11-01T10:00:00Z",planned:[],done:[]},{id:"b",title:"Cook",at:"2026-10-01T10:00:00Z",planned:[new Date(2026,10,6,17).toISOString()],done:["2026-10-02T10:00:00Z"]}];
 assert.deepEqual(A.favorites(saved).map(a=>a.id),["b","a"]);
 assert.equal(A.due(saved,now).activity.id,"b");
 assert.equal(A.due(saved,new Date(2026,10,6,16)),null);
 assert.equal(A.upcoming(saved,new Date(2026,10,6,16)),true);
 assert.equal(A.stamp(new Date(2026,10,7,9,5)),"20261107T0905");
 assert.match(A.calendarAddress("https://h.example","Walk & talk",new Date(2026,10,7,9,0),30,true),/^x-safari-https:\/\/h\.example\/api\/plan\.ics\?title=Walk%20%26%20talk&start=20261107T0900&minutes=30$/);
});

test("planning something is offered on a hard day, once, and not when something is already planned",()=>{
 const now=new Date(2026,10,6,15),hard=[{ts:new Date(2026,10,6,12).toISOString(),score:2,stress:3}];
 const offer=data=>activityActions(Object.assign({moods:hard,activities:[],activityLater:""},data),now);
 assert.equal(offer({})[0].kind,"activities");
 assert.equal(offer({moods:[{ts:new Date(2026,10,6,12).toISOString(),score:4,stress:2}]}).length,0);
 assert.equal(offer({activityLater:"2026-11-06"}).length,0);
 assert.equal(offer({activities:[{id:"a",title:"Walk",at:"2026-11-01T10:00:00Z",planned:[new Date(2026,10,7,10).toISOString()],done:[]}]}).length,0);
 assert.equal(offer({activities:[{id:"a",title:"Walk",at:"2026-11-01T10:00:00Z",planned:[],done:["2026-11-02T10:00:00Z"]}]})[0].picks[0].title,"Walk");
});

test("a very high stress or rough check-in puts calming first, for half an hour",()=>{
 const now=new Date(2026,10,6,15);
 assert.equal(calmFirst([{ts:new Date(2026,10,6,14,45).toISOString(),score:3,stress:5}],now).action,"reset");
 assert.equal(calmFirst([{ts:new Date(2026,10,6,14,45).toISOString(),score:1}],now).action,"reset");
 assert.equal(calmFirst([{ts:new Date(2026,10,6,14,0).toISOString(),score:1}],now),null);
 assert.equal(calmFirst([{ts:new Date(2026,10,6,14,45).toISOString(),score:2,stress:4}],now),null);
 const first=nextActions({moods:[{ts:new Date(2026,10,6,14,45).toISOString(),score:3,stress:5}],events:[],health:[],alarms:[],resets:[],tries:[],activities:[]},now,{from:"09:00",to:"21:00",weekends:true})[0];
 assert.match(first.text,/Slowing your body down/);assert.doesNotMatch(JSON.stringify(first),/let it out|vent it/i);
});

test("one wake time is suggested on Sunday evening only when 6 of 14 days of alarms spread 90 minutes or more",()=>{
 const sunday=new Date(2026,10,8,18),day=n=>{const d=new Date(sunday);d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);};
 const spread=[360,450,420,390,480,400].map((m,i)=>({date:day(i+1),firstAlarmMin:m}));
 const s=wakeTime(spread,sunday);assert.match(s.text,/6:00 AM to 8:00 AM/);assert.match(s.text,/7:00 AM every day/);assert.match(s.why,/less time in bed/);
 assert.equal(wakeTime(spread,new Date(2026,10,8,12)),null);
 assert.equal(wakeTime(spread,new Date(2026,10,9,18)),null);
 assert.equal(wakeTime(spread.slice(0,5),sunday),null);
 assert.equal(wakeTime(spread.map(h=>({...h,firstAlarmMin:420+(h.firstAlarmMin%60)})),sunday),null);
});
