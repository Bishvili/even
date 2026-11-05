"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const original = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function loadAppWithoutStartingUI() {
 const instrumented = original.replace(/init\(\);\s*\}\)\(\);\s*$/, [
  "globalThis.__testApi={withDemoApart,upsertHealth,normalizeHealth,renderSettings,drawTimes,buildDemoCalendarScenario,calendarPatternSummary,",
  "renderInsights,renderStats,getState:()=>state,setScope:s=>{insightScope=s;},dateKey};",
  "})();"
 ].join(""));
 assert.notEqual(instrumented, original, "The app startup footer must remain recognizable");
 const elements = new Map();
 const document = {
  getElementById(id) {
   if(!elements.has(id))elements.set(id,{textContent:"",innerHTML:"",hidden:false,classList:{toggle(){}},style:{}});
   return elements.get(id);
  },
  querySelectorAll(){return [];}
 };
 const sandbox = {
  document,
  localStorage:{getItem(){return null;},setItem(){}},
  Date,
  console
 };
 vm.runInNewContext(instrumented,sandbox,{filename:"app.js",timeout:2000});
 return {api:sandbox.__testApi,elements};
}

test("demo creates 28 days and recurring calendar categories", () => {
 const {api} = loadAppWithoutStartingUI();
 const fixture=api.buildDemoCalendarScenario(new Date());
 assert.equal(fixture.moods.length,112);
 assert.equal(fixture.events.length,47);
 assert.equal(fixture.health.length,28);
 assert.equal(new Set(fixture.health.map(x=>x.date)).size,28);
 assert.ok(fixture.moods.every(x=>x.demo===true));
 assert.ok(fixture.events.every(x=>x.demo===true));
 const categories=new Set(fixture.events.map(x=>x.category));
 ["Meeting","Work","Exercise","Social","Commute","Rest"].forEach(x=>assert.ok(categories.has(x)));
});

test("demo event effects are visible and supported by enough paired check-ins", () => {
 const {api}=loadAppWithoutStartingUI();
 const fixture=api.buildDemoCalendarScenario(new Date());
 const patterns=api.calendarPatternSummary(fixture.moods,fixture.events);
 const byCategory=Object.fromEntries(patterns.paired.map(x=>[x.category,x]));
 for(const category of ["Meeting","Work","Exercise","Social","Commute","Rest"]){
  assert.ok(byCategory[category]&&byCategory[category].count>=3,category+" needs enough matches");
 }
 assert.ok(byCategory.Meeting.delta<-.7);
 assert.ok(byCategory.Commute.delta<-.7);
 assert.ok(byCategory.Exercise.delta>1.5);
 assert.ok(byCategory.Social.delta>.7);
});

test("one mood check-in cannot produce a paired calendar effect", () => {
 const {api}=loadAppWithoutStartingUI();
 const f=api.buildDemoCalendarScenario(new Date());
 const patterns=api.calendarPatternSummary([{ts:new Date().toISOString(),score:3}],f.events);
 assert.equal(patterns.paired.length,0);
});

test("personal insights and daily statistics exclude fictional records", () => {
 const {api,elements}=loadAppWithoutStartingUI();
 const fixture=api.buildDemoCalendarScenario(new Date());
 const state=api.getState();
 state.demo=fixture;
 state.moods.push({id:"personal-test",ts:new Date().toISOString(),score:4,tags:[],energy:4,note:""});
 api.setScope("personal");
 api.renderInsights();
 assert.match(elements.get("insight-samples").textContent,/1 personal check-ins/);
 assert.doesNotMatch(elements.get("calendar-insights").innerHTML,/calendar-pair/);
 api.renderStats();
 assert.equal(elements.get("stat-today").textContent,1);
 assert.equal(elements.get("stat-average").textContent,"4.0");
 api.setScope("demo");
 api.renderInsights();
 assert.match(elements.get("insight-samples").textContent,/112 fictional check-ins/);
 assert.match(elements.get("calendar-insights").innerHTML,/Exercise/);
 assert.match(elements.get("calendar-insights").innerHTML,/Meeting/);
});

test("time of day shows an average only from 5 check-ins, with bars to scale",()=>{
 const {api,elements}=loadAppWithoutStartingUI();
 const at=hour=>{const d=new Date();d.setHours(hour,0,0,0);return d.toISOString();};
 const moods=[{ts:at(8),score:5},{ts:at(8),score:5},{ts:at(8),score:5},{ts:at(8),score:5},{ts:at(8),score:5},{ts:at(12),score:1}];
 api.drawTimes(moods);
 const html=elements.get("time-insights").innerHTML;
 assert.match(html,/class="bar-value" width="100\.0%"/);
 assert.match(html,/Not enough check-ins/);
 assert.match(html,/1 check-in</);
 assert.doesNotMatch(html,/style="/);
});

test("fictional records stay apart, and old saved state moves them out once",()=>{
 const {api}=loadAppWithoutStartingUI();
 const moved=api.withDemoApart({moods:[{id:"a",demo:true},{id:"b"}],health:[{date:"2026-01-01",steps:9,demo:true}],events:[]},undefined);
 assert.deepEqual(moved.moods.map(m=>m.id),["b"]);
 assert.equal(moved.health.length,0);
 assert.equal(moved.demo.moods[0].id,"a");
 assert.equal(moved.demo.health[0].steps,9);
 assert.equal(api.withDemoApart({moods:[],health:[],events:[]},{moods:[{id:"kept"}],health:[],events:[]}).demo.moods[0].id,"kept");
});
test("a real health day on a demo date carries nothing over from the demo",()=>{
 const {api}=loadAppWithoutStartingUI();
 const state=api.getState(),fixture=api.buildDemoCalendarScenario(new Date()),date=fixture.health[0].date;
 state.demo=fixture;
 api.upsertHealth(api.normalizeHealth({date,steps:1234},"manual"));
 assert.equal(state.health.length,1);
 assert.equal(state.health[0].steps,1234);
 assert.equal(state.health[0].sleepHours,undefined);
 assert.equal(state.demo.health.find(h=>h.date===date).demo,true);
});
