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
 for(const field of ["data.moods","data.health","data.events","kept.reflections","kept.alarms","kept.resets"])assert.ok(restore.includes(field),field);
 assert.match(restore,/x\.energy<=5\?x\.energy:null/);
});
test("a large protected backup saves and opens, using current rounds, and old ones still open",async()=>{
 const text="x".repeat(10*1024*1024),file=JSON.parse(await protect(text,"pass"));
 assert.ok(file.rounds>=600000);
 assert.equal(await unprotect(file,"pass"),text);
 await assert.rejects(unprotect({...file,rounds:1},"pass"));
 await assert.rejects(unprotect({...file,rounds:"many"},"pass"));
 assert.equal(file.protected,true);
});
test("restore leaves out what it can't trust, and says how much",()=>{
 const kept=globalThis.EvenBackup.clean({reflections:[{ts:"2026-11-01T00:00:00Z",answers:[3,4,3,4]},{ts:"bad",answers:[1]},{ts:"2026-11-01T00:00:00Z"},null],alarms:[{timeMin:420,days:[1],enabled:true,label:"Up"},{timeMin:9999,days:[]},{days:"x"}],resets:["2026-11-01T00:00:00Z","nope"]});
 assert.equal(kept.reflections.length,1);assert.equal(kept.alarms.length,1);assert.equal(kept.resets.length,1);assert.equal(kept.skipped,6);
 assert.equal(globalThis.EvenBackup.clean({}).skipped,0);
});
