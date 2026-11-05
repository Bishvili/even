"use strict";
const test=require("node:test"),assert=require("node:assert"),fs=require("node:fs"),path=require("node:path");
require(path.join(__dirname,"..","backup.js"));
const {protect,unprotect,isProtected}=globalThis.EvenBackup;
test("a protected backup opens only with its passphrase, and hides its contents",async()=>{
 const text=JSON.stringify({app:"Even",moods:[{note:"private note"}]}),sealed=await protect(text,"correct horse");
 assert.ok(!sealed.includes("private note"));
 const file=JSON.parse(sealed);
 assert.ok(isProtected(file));
 assert.equal(await unprotect(file,"correct horse"),text);
 await assert.rejects(unprotect(file,"wrong"));
 assert.ok(!isProtected({app:"Even",moods:[]}));
});
test("restore brings back every field a backup holds, and keeps energy empty when it wasn't set",()=>{
 const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8"),restore=app.slice(app.indexOf("async function applyBackup"),app.indexOf("function buildDemoCalendarScenario"));
 for(const field of ["data.moods","data.health","data.events","data.reflections","data.alarms","data.resets"])assert.ok(restore.includes(field),field);
 assert.match(restore,/energy:Number\(x\.energy\)\|\|null/);
});
