"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=file=>fs.readFileSync(require("node:path").join(__dirname,"..",file),"utf8");

test("every shell file reports one app version, so a change always reaches installed apps",()=>{
 const version=read("app.js").match(/var VERSION = "(\d+\.\d+\.\d+)"/)[1];
 assert.ok(read("sw.js").includes(`even-shell-v${version}`));
 assert.ok(read("worker/index.js").includes(`version:"${version}"`));
 assert.ok(read("index.html").includes(`>${version}<`));
});
test("the service worker caches every script the page loads",()=>{
 const sw=read("sw.js");
 for(const [,file] of read("index.html").matchAll(/<script src="\/([\w.-]+)"/g))assert.ok(sw.includes(`"/${file}"`),file);
});
test("the deploy script publishes and the Worker serves every script the page loads",()=>{
 const deploy=read("scripts/deploy.sh"),worker=read("worker/index.js");
 for(const [,file] of read("index.html").matchAll(/<script src="\/([\w.-]+)"/g)){
  assert.ok(deploy.includes(file),file);
  assert.ok(worker.includes(`"${file}":`),file);
 }
});
test("nothing asks a person to paste a device key",()=>{
 assert.doesNotMatch(read("shortcuts/even-sync.cherri"),/prompt\(/);
 assert.doesNotMatch(read("index.html"),/paste/i);
});
