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
test("only the files the service worker lists are published, along with the service worker",()=>{
 const{publicFiles}=require("../scripts/build-assets.cjs"),files=publicFiles(read("sw.js"));
 assert.ok(files.includes("index.html")&&files.includes("sw.js")&&files.includes("icon-512.png"));
 for(const file of files)assert.ok(!/worker|\.md$|schema|\.cherri$/.test(file),file);
});
test("nothing asks a person to paste a device key",()=>{
 assert.doesNotMatch(read("shortcuts/even-sync.cherri"),/prompt\(/);
 assert.doesNotMatch(read("index.html"),/paste/i);
});
test("the helper installs from the link it last shared, and the paper opens in Safari",()=>{
 const html=read("index.html"),app=read("app.js");
 assert.match(html,/id="setup-helper" target="_blank" rel="noopener noreferrer" hidden>/);
 assert.doesNotMatch(html,/id="setup-helper" href=/);
 assert.ok(app.includes('authCanRelease&&data.helper&&/^https:\\/\\/www\\.icloud\\.com\\/shortcuts\\/[a-f0-9]{32}$/i.test(data.helper.url)'));
 assert.match(app,/if\(authHelper\)helper\.href=authHelper;else helper\.removeAttribute\("href"\)/);
 assert.match(app,/navigator\.standalone===true\)\["whitepaper-link","welcome-paper"\]/);
});

test("no script writes an inline style, which the security policy blocks",()=>{
 for(const file of ["app.js","coach.js","reminders.js","onboarding.js","intake.js","invites.js","refresh.js"])assert.doesNotMatch(read(file),/style="/,file);
});
test("each page has its own offline copy, so the app is never replaced",()=>{
 const self={addEventListener(){}},sandbox={self};
 require("node:vm").runInNewContext(read("sw.js")+";this.pageKey=pageKey;",sandbox);
 assert.equal(sandbox.pageKey("/"),"/");
 assert.equal(sandbox.pageKey("/index.html"),"/");
 assert.equal(sandbox.pageKey("/whitepaper.html"),"/whitepaper.html");
 assert.ok(read("sw.js").includes('"/whitepaper.css"'));
});
