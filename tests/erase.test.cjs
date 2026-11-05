"use strict";
// Anything personal a device keeps has to be cleared by Erase all data on this device.
const test=require("node:test"),assert=require("node:assert"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=f=>fs.readFileSync(path.join(root,f),"utf8");
const scripts=["app.js","coach.js","reminders.js","onboarding.js","intake.js","refresh.js","invites.js","signin-sheet.js","backup.js"];
test("every key and cache written is on the erase list",()=>{
 const app=read("app.js"),list=app.match(/DEVICE_KEYS=\[([^\]]*)\],DEVICE_CACHES=\[([^\]]*)\]/);
 assert.ok(list);
 const keys=list[1],names=list[2];
 assert.match(keys,/STORAGE_KEY/);
 const constants={"app.js":"health:v1","onboarding.js":"health-setup","reminders.js":"health-reminder"};
 for(const file of scripts){
  const source=read(file);
  for(const [,key] of source.matchAll(/localStorage\.setItem\(([^,]+),/g)){
   const value=/^["']/.test(key)?key.replace(/["']/g,""):constants[file];
   assert.ok(value,file+" writes "+key);
   if(value!=="health:v1")assert.ok(keys.includes(value),file+" writes "+value);
  }
  for(const [,name] of source.matchAll(/caches\.open\(([^)]+)\)/g)){
   assert.ok(names.includes("health-brief")&&(name==='"health-brief"'||name==="BRIEF_CACHE"),file+" opens "+name);
  }
 }
});
test("the erase confirmation says what goes and what stays",()=>{
 const app=read("app.js");
 assert.match(app,/Delete everything on this device: check-ins, notes, health and calendar data, notification settings and setup progress/);
 assert.match(app,/Synced data in your account stays/);
});
