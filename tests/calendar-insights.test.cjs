"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const original = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function loadAppWithoutStartingUI() {
 const instrumented = original.replace(/init\(\);\s*\}\)\(\);\s*$/, [
  "globalThis.__testApi={buildDemoCalendarScenario,calendarPatternSummary,",
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
 assert.ok(patterns.compared.length>=4,"At least four categories need a control comparison");
 assert.ok(patterns.compared.every(x=>x.withCount>=3&&x.withoutCount>=3));
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
 state.moods.push(...fixture.moods,{id:"personal-test",ts:new Date().toISOString(),score:4,tags:[],energy:4,note:""});
 state.events.push(...fixture.events);
 state.health.push(...fixture.health);
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
