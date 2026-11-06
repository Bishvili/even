const test=require("node:test"),assert=require("node:assert");
globalThis.document=undefined;
require("../daycontext.js");require("../coach.js");
const Coach=globalThis.Coach;
const end="2026-11-08T18:00:00",day=n=>`2026-11-0${n}`;
test("the week in review shows measured figures and says when there is too little",()=>{
 const moods=[{ts:day(2)+"T10:00:00",score:2,stress:4},{ts:day(2)+"T18:00:00",score:4},{ts:day(3)+"T10:00:00",score:4,stress:2}];
 const health=[2,3,4,5,6].map(n=>({date:day(n),sleepHours:7,workoutMin:n%2?30:0}));
 const events=[{start:day(3)+"T09:00:00",end:day(3)+"T10:00:00"},{start:day(3)+"T09:30:00",end:day(3)+"T11:00:00"}];
 const figures=Coach.weekFigures(end,moods,health,events);
 assert.deepEqual(figures,{checkIns:3,hardDays:1,sleepHours:7,sleepNights:5,exerciseDays:2,calendarHours:2});
 const thin=Coach.weekFigures(end,moods,health.slice(0,4),[]);
 assert.equal(thin.sleepHours,null);assert.equal(thin.exerciseDays,null);
 const lines=Coach.weekReview(Coach.weekFigures(end,[moods[0]],health.slice(0,4),[]),[70]);
 assert.equal(lines[0],"1 check-in and 1 hard day.");
 assert.match(lines[1],/Not enough sleep/);assert.equal(lines.length,4);
 assert.match(Coach.weekReview(figures,[60,70]).at(-1),/last 2 weeks: 60, 70/);
});
test("the reminder defaults to Sunday at 6 PM, then follows the usual time, inside notification hours",()=>{
 const moods=[{ts:"2026-10-01T10:00:00",score:3}];
 const first=Coach.reflectionSlot([],moods,"09:00","21:00",new Date("2026-11-03T12:00:00"));
 assert.equal(first.at.getDay(),0);assert.equal(first.at.getHours(),18);
 const usual=["2026-10-13","2026-10-20","2026-10-27"].map(d=>({ts:d+"T20:00:00",answers:{}}));
 const next=Coach.reflectionSlot(usual,moods,"09:00","19:00",new Date("2026-11-03T21:00:00"));
 assert.equal(next.at.getDay(),2);assert.equal(next.at.getHours(),19);
 assert.equal(Coach.reflectionSlot(usual,[],"09:00","19:00",new Date("2026-10-28T09:00:00")),null);
});
