"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
require("../items.js");
const{mergeHealth,typedKeys,allItems,select,page,grouped,pruneSelection,dayLabel}=globalThis.Items;
const now=new Date("2026-11-05T12:00:00");
const event=(id,start,title,extra)=>({id,start,end:start,title,category:"Other",source:"shortcut",...extra});
const day=(date,extra)=>({date,source:"shortcut",...extra});

test("a typed number stays through any number of pulls, and a synced one follows the account",()=>{
 let rows=[{date:"2026-11-04",source:"manual",workoutMin:30,synced:["steps"],steps:100}];
 rows=mergeHealth(rows,[{date:"2026-11-04",steps:200,workoutMin:99}],true,"2026-11-04");
 assert.equal(rows[0].steps,200);
 assert.equal(rows[0].workoutMin,30);
 rows=mergeHealth(rows,[{date:"2026-11-04",steps:300}],true,"2026-11-04");
 assert.equal(rows[0].steps,300);
 assert.equal(rows[0].workoutMin,30);
 assert.deepEqual(typedKeys(rows[0]),["workoutMin"]);
 rows=mergeHealth(rows,[],true,"");
 assert.equal(rows.length,1,"a row with a typed number stays when the account has nothing");
 assert.equal(rows[0].steps,undefined);
 assert.equal(rows[0].source,"manual");
});
test("a pull removes synced days the account dropped, and keeps older ones when its list is cut short",()=>{
 const old=[day("2026-10-01",{steps:5}),day("2026-11-01",{steps:6})];
 assert.deepEqual(mergeHealth(old,[{date:"2026-11-01",steps:7}],true,"2026-11-01").map(r=>r.date),["2026-11-01"]);
 assert.deepEqual(mergeHealth(old,[{date:"2026-11-01",steps:7}],false,"2026-11-01").map(r=>r.date).sort(),["2026-10-01","2026-11-01"]);
});
test("rows saved before numbers were tracked read as synced if the day was synced",()=>{
 assert.equal(mergeHealth([day("2026-11-01",{steps:6})],[],true,"").length,0);
 assert.equal(mergeHealth([{date:"2026-11-01",source:"manual",steps:6}],[],true,"").length,1);
});
const state={health:[day("2026-11-03",{sleepHours:7,steps:100})],events:[event("a","2026-11-06T10:00:00","Café standup",{category:"Meeting"}),event("b","2026-11-02T10:00:00","Lunch",{source:"manual",categoryFrom:"you"})],hiddenEvents:[event("c","2026-11-01T10:00:00","Secret")],hiddenHealth:[]};
const items=allItems(state);
const titles=list=>list.map(i=>i.raw.title||i.raw.date);
test("search matches every word, ignoring case and accents, across titles, types, sources, measures and dates",()=>{
 const find=query=>titles(select(items,{view:"all",query},now));
 assert.deepEqual(find("CAFE"),["Café standup"]);
 assert.deepEqual(find("standup meeting"),["Café standup"]);
 assert.deepEqual(find("typed"),["Lunch"]);
 assert.deepEqual(find("hidden"),["Secret"]);
 assert.deepEqual(find("sleep"),["2026-11-03"]);
 assert.deepEqual(find("nov 3"),["2026-11-03"]);
 assert.deepEqual(find("2026-11-03"),["2026-11-03"]);
 assert.deepEqual(find("monday"),["Lunch"]);
 assert.deepEqual(find("tomorrow"),["Café standup"]);
 assert.deepEqual(find("standup lunch"),[]);
});
test("views and filters narrow the list, and coming up runs soonest first",()=>{
 assert.equal(select(items,{view:"shown"},now).length,3);
 assert.deepEqual(titles(select(items,{view:"hidden"},now)),["Secret"]);
 assert.equal(select(items,{view:"all"},now).length,4);
 assert.deepEqual(titles(select(items,{view:"all",type:"Meeting"},now)),["Café standup"]);
 assert.deepEqual(titles(select(items,{view:"all",setByYou:true},now)),["Lunch"]);
 assert.deepEqual(titles(select(items,{view:"all",from:"typed"},now)),["Lunch"]);
 assert.deepEqual(titles(select(items,{view:"all",when:"upcoming"},now)),["Café standup"]);
 assert.deepEqual(titles(select(items,{view:"all",kind:"health"},now)),["2026-11-03"]);
 assert.deepEqual(titles(select(items,{view:"all"},now)),["Café standup","2026-11-03","Lunch","Secret"]);
});
test("pages hold 25, and their numbers stay in range",()=>{
 const many=Array.from({length:51},(x,i)=>i);
 assert.deepEqual([page(many,1).from,page(many,1).to,page(many,1).pages],[1,25,3]);
 assert.deepEqual([page(many,3).from,page(many,3).to],[51,51]);
 assert.equal(page(many,9).page,3);
 assert.equal(page(many,0).page,1);
 assert.deepEqual([page([],1).from,page([],1).pages,page([],1).total],[0,1,0]);
 assert.equal(page(many,2).items[0],25);
});
test("days group under plain headers, and a selection forgets what's gone",()=>{
 assert.equal(dayLabel("2026-11-05T01:00:00",now),"Today");
 assert.equal(dayLabel("2026-11-06T23:00:00",now),"Tomorrow");
 assert.equal(dayLabel("2026-11-04T23:00:00",now),"Yesterday");
 assert.equal(dayLabel("2026-11-02T10:00:00",now),"Mon, Nov 2");
 assert.deepEqual(grouped(select(items,{view:"all"},now),now).map(g=>g.label),["Tomorrow","Tue, Nov 3","Mon, Nov 2","Sun, Nov 1"]);
 assert.deepEqual(pruneSelection({"event:a":true,"event:gone":true},items),{"event:a":true});
});
