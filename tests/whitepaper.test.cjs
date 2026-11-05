"use strict";
// The paper states these rules to clinicians, so a change in behavior must reach it too.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=file=>fs.readFileSync(require("node:path").join(__dirname,"..",file),"utf8");
const paper=read("whitepaper.html"),coach=read("coach.js"),day=read("daycontext.js"),worker=read("worker/index.js");

const RULES=[
 [coach,/MIN_SAMPLES=3\b/,/At least 3 rated check-ins/],
 [coach,/MIN_GAP=0\.4\b/,/at least 0\.4 points above/],
 [day,/evidenceDays:56\b/,/Last 8 weeks/],
 [day,/nearEventMs:5400000\b/,/up to 90 minutes after/],
 [day,/shortSleepFallback:6\.5\b/,/under 6\.5 hours/],
 [coach,/EARLY_ALARM=420\b/,/before 7 AM/],
 [coach,/REFLECTION_DAYS=7\b/,/Offered 7 days after the first check-in/],
 [coach,/ANTICIPATE_GAP=0\.4\b/,/A prompt needs at least 0\.4/],
 [day,/helpSamples:5\b/,/at least 5 check-ins each way/],
 [day,/helpGap:0\.4\b/,/each way and a 0\.4 point difference/],
 [coach,/RESET_WINDOW_MS=7200000\b/,/the 2 hours after a breathing exercise/],
 [coach,/MAX_ANTICIPATED_A_DAY=2\b/,/At most 2 a day/],
 [coach,/<7200000/,/2 hours apart/],
 [coach,/wake\.timeMin\+15/,/15 minutes after the morning alarm/],
 [worker,/SMART_QUIET_MS=5400000\b/,/in the last 90 minutes/],
 [day,/usualDays:28,usualMinimum:7/,/median over the last 28 days, once there are 7/],
 [day,/shortOfUsual:0\.5/,/half an hour under their usual/],
 [day,/from:300,nudge:450/,/Morning runs from 5 AM to 11 AM/],
 [day,/from:660,nudge:630/,/midday from 11 AM to 2 PM/],
 [day,/from:840,nudge:810/,/afternoon from 2 PM to 5 PM/],
 [day,/from:1020,nudge:990/,/evening from 5 PM to 5 AM/],
 [worker,/SYNC_STALE_MS=72000000\b/,/nothing has synced in 20 hours/]
];
test("the paper states the rules the app applies",()=>{
 for(const [source,code,prose] of RULES){
  assert.match(source,code);
  assert.match(paper,prose);
 }
});
test("the paper names every synced health measure",()=>{
 const named={sleepHours:/Hours asleep/,steps:/steps/,hrv:/heart rate variability/,restingHR:/Resting heart rate/,workoutMin:/exercise minutes/};
 const metrics=worker.match(/const METRICS=\{([^}]*)\}/)[1].match(/\w+(?=:\[)/g);
 for(const metric of metrics){
  assert.ok(named[metric],metric+" needs a place in the paper");
  assert.match(paper,named[metric]);
 }
});
test("the paper is reachable and allowed by the page's security policy",()=>{
 assert.doesNotMatch(paper,/<style|<script| style="/);
 assert.match(read("index.html"),/id="whitepaper-link" href="\/whitepaper\.html"/);
 for(const file of ["whitepaper.html","whitepaper.css"]){
  assert.ok(read("sw.js").includes(`"/${file}"`),file);
 }
});

test("the paper and the guide name everything Even Sync uploads",()=>{
 const sync=read("shortcuts/even-sync.cherri"),guide=read("AGENTS.md"),readme=read("README.md");
 const uploads={steps:[/"stepsRecent":/,/steps/i],resting:[/"restingHRRecent":/,/resting heart rate/i],hrv:[/"hrvRecent":/,/heart rate variability|HRV/],exercise:[/"workoutMinRecent":/,/exercise minutes/i],sleep:[/"sleepIntervals":/,/sleep/i],alarms:[/"kind": "alarms"/,/alarms/i],calendar:[/"kind": "calendar_days"/,/events/i]};
 for(const [name,[source,words]] of Object.entries(uploads)){
  assert.match(sync,source,name);
  for(const text of [paper,guide,readme])assert.match(text,words,name);
 }
 assert.match(paper,/Titles are stored/);
});
test("the day model holds the one definition of each shared term",()=>{
 for(const file of ["coach.js","app.js","reminders.js"]){
  const source=read(file);
  assert.doesNotMatch(source,/function median\(/,file+" defines its own median");
  assert.doesNotMatch(source,/20\*3600000/,file+" types its own stale limit");
  assert.doesNotMatch(source,/\["Morning","Midday"/,file+" has its own day parts");
 }
 assert.equal(Number(day.match(/staleHours:(\d+)/)[1])*3600000,Number(worker.match(/SYNC_STALE_MS=(\d+)/)[1]));
});
