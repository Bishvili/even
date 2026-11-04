"use strict";
// The paper states these rules to clinicians, so a change in behavior must reach it too.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=file=>fs.readFileSync(require("node:path").join(__dirname,"..",file),"utf8");
const paper=read("whitepaper.html"),coach=read("coach.js"),worker=read("worker/index.js");

const RULES=[
 [coach,/MIN_SAMPLES=3\b/,/At least 3 in each group/],
 [coach,/MIN_GAP=0\.4\b/,/at least 0\.4 points above/],
 [coach,/HISTORY_DAYS=56\b/,/Last 8 weeks/],
 [coach,/NEAR_EVENT_MS=5400000\b/,/up to 90 minutes after/],
 [coach,/SHORT_SLEEP=6\.5\b/,/under 6\.5 hours/],
 [coach,/EARLY_ALARM=420\b/,/before 7 AM/],
 [coach,/r\.gap>=0\.3/,/difference of 0\.3 points/],
 [coach,/ANTICIPATE_GAP=0\.4\b/,/A prompt needs at least 0\.4/],
 [coach,/HELP_SAMPLES=5\b/,/at least 5 check-ins each way/],
 [coach,/HELP_GAP=0\.4\b/,/each way and a 0\.4 point difference/],
 [coach,/RESET_WINDOW_MS=7200000\b/,/the 2 hours after a breathing exercise/],
 [coach,/MAX_ANTICIPATED_A_DAY=2\b/,/At most 2 a day/],
 [coach,/<7200000/,/2 hours apart/],
 [coach,/wake\.timeMin\+15/,/15 minutes after the morning alarm/],
 [worker,/SMART_QUIET_MS=5400000\b/,/in the last 90 minutes/],
 [worker,/SYNC_STALE_MS=72000000\b/,/nothing has synced in 20 hours/]
];
test("the paper states the rules the app applies",()=>{
 for(const [source,code,prose] of RULES){
  assert.match(source,code);
  assert.match(paper,prose);
 }
});
test("the paper names every synced health measure",()=>{
 const named={sleepHours:/Hours asleep/,steps:/steps/,hrv:/heart rate variability/,restingHR:/Resting/,heartRate:/average heart rate/,workoutMin:/exercise minutes/};
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
  assert.ok(read("scripts/deploy.sh").includes(file),file);
  assert.ok(worker.includes(`"${file}":`),file);
 }
});
