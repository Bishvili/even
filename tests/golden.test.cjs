"use strict";
// Records what each fictional person gets. A change here is a change in what people see, so review it like code.
// Rewrite with UPDATE_GOLDEN=1 after listing why it changed.
process.env.TZ="America/Los_Angeles";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
require("../coach.js");
const {TODAY,people}=require("./people.cjs");
const {outlook,findings,whatHelps,anticipate,nextActions,weekSchedule,brief,briefFor}=globalThis.EvenCoach;
const FILE=path.join(__dirname,"golden","people.json");

function record(person){
 const data=JSON.parse(JSON.stringify(person)),{moods,events,health,resets,prefs}=data,days=outlook(moods,TODAY);
 const helps=whatHelps(moods,events,health,resets,TODAY);
 return{
  outlook:days.map(d=>[d.name,d.level,d.samples]),
  findings:findings(moods,events,health,resets,TODAY).map(r=>[r.label,r.effect.name,Number(r.effect.gap.toFixed(3)),r.effect.withCount,r.effect.withoutCount,r.effect.consistent,r.mixed]),
  helps:helps.map(r=>[r.label,r.tip,r.effects[0].name,Number(r.effects[0].gap.toFixed(3))]),
  anticipate:anticipate(moods,events,health,TODAY,{...prefs,resets}).map(a=>[a.at,a.message]),
  actions:nextActions(data,TODAY,prefs).map(a=>[a.text,a.action||""]),
  plan:weekSchedule(moods,health,{...prefs,alarms:data.alarms,events},TODAY).map(s=>[s.at,s.kind]),
  brief:brief(days[0],helps.filter(r=>r.id!=="sleep")[0]),
  briefToday:briefFor(days[0],helps.filter(r=>r.id!=="sleep")[0],"",data,TODAY).text
 };
}
test("each person gets what the record says",()=>{
 const now=Object.fromEntries(Object.entries(people).map(([name,build])=>[name,record(build())]));
 if(process.env.UPDATE_GOLDEN){fs.writeFileSync(FILE,JSON.stringify(now,null,1)+"\n");return;}
 assert.deepEqual(now,JSON.parse(fs.readFileSync(FILE,"utf8")));
});
