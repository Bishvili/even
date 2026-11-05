"use strict";
// Stops a deploy the way a failing test does. Runs wherever the packages are installed.
const test=require("node:test"),assert=require("node:assert"),path=require("node:path"),{spawnSync}=require("node:child_process");
let bin=null;try{bin=require.resolve("eslint/bin/eslint.js");}catch(e){/* Skipped where packages aren't installed. */}
test("the shipped scripts pass lint",{skip:!bin},()=>{
 const run=spawnSync(process.execPath,[bin,"*.js","worker"],{cwd:path.join(__dirname,".."),encoding:"utf8"});
 assert.equal(run.status,0,run.stdout+run.stderr);
});
