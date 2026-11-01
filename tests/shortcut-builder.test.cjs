"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const repoRoot=path.join(__dirname,"..");
const appSource=fs.readFileSync(path.join(repoRoot,"app.js"),"utf8");
const html=fs.readFileSync(path.join(repoRoot,"index.html"),"utf8");
const template=fs.readFileSync(path.join(repoRoot,"shortcuts","rage-tracker-sync.cherri"),"utf8");

function prepareHarness(email="owner-a@example.com"){
 const deviceId="3f6ab11e-37e2-4607-89df-321014f10c39",token="a".repeat(64);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]),elements=new Map(),visited=[];
 const document={
  getElementById(id){
   if(!ids.includes(id))throw Error("Unknown element: "+id);
   if(!elements.has(id))elements.set(id,{innerHTML:"",textContent:"",hidden:false,disabled:false,classList:{toggle(){}},style:{},value:""});
   return elements.get(id);
  },
  querySelectorAll(){return[];}
 };
 const storage={getItem(){return JSON.stringify({moods:[],health:[],events:[],token,syncOwnerEmail:email,deviceId});},setItem(){}};
 const fakeFetch=async(url)=>{
  if(url==="/shortcut.cherri")return {ok:true,async text(){return template;}};
  if(url==="/api/auth/me")return {ok:true,redirected:false,headers:{get(){return "application/json";}},async json(){return{ok:true,email,devices:[{id:deviceId,label:"My iPhone",lastUsedAt:"2026-11-01T17:00:00Z",revoked:false}]};}};
  throw Error("Unexpected URL "+url);
 };
 const code=appSource.replace(/init\(\);\s*\}\)\(\);\s*$/,
  "globalThis.__appTest={renderSync,openShortcutBuilder,checkShortcutUpload,setAuth:s=>{authEmail=s;},getState:()=>state};})();");
 assert.notEqual(code,appSource,"App startup footer not found");
 const sandbox={
  document,localStorage:storage,fetch:fakeFetch,
  navigator:{onLine:true},
  location:{origin:"https://rage-tracker.bishvili.workers.dev"},
  window:{location:{assign(url){visited.push(url);}}},
  console,URL,Date,setTimeout,clearTimeout,
 };
 vm.runInNewContext(code,sandbox,{filename:"app.js",timeout:3000});
 return {app:sandbox.__appTest,elements,visited,deviceId,token,email};
}

test("public template requests a credential only at import",()=>{
 assert.match(template,/#question authorization /);
 assert.match(template,/is\.workflow\.actions\.filter\.health\.quantity/);
 assert.match(template,/is\.workflow\.actions\.filter\.calendarevents/);
 assert.match(template,/\/api\/ingest/);
 assert.match(template,/formRequest\(/);
 assert.doesNotMatch(template,/Bearer [a-f0-9]{64}/i);
 assert.doesNotMatch(template,/@(?:gmail|icloud)\.com/i);
});

test("builder opens public source without leaking the private device credential",async()=>{
 const t=prepareHarness();
 t.app.setAuth(t.email);t.app.renderSync();
 assert.equal(t.elements.get("open-shortcut-builder").disabled,false);
 await t.app.openShortcutBuilder();
 assert.equal(t.visited.length,1);
 const target=new URL(t.visited[0]);
 assert.equal(target.hostname,"playground.cherrilang.org");
 assert.ok(target.searchParams.get("code").includes("#question authorization"));
 assert.equal(t.visited[0].includes(t.token),false);
 assert.equal(target.searchParams.get("code").includes(t.token),false);
 assert.ok(target.toString().length<16000);
});

test("a different signed-in account cannot launch the connected device's builder",async()=>{
 const t=prepareHarness();
 t.app.setAuth("owner-b@example.com");t.app.renderSync();
 assert.equal(t.elements.get("open-shortcut-builder").disabled,true);
 await t.app.openShortcutBuilder();
 assert.equal(t.visited.length,0);
});

test("upload status uses the current device's server-issued last-use timestamp",async()=>{
 const t=prepareHarness();
 t.app.setAuth(t.email);
 await t.app.checkShortcutUpload();
 assert.match(t.elements.get("shortcut-last-upload").textContent,/Received/);
});

test("all app DOM references exist",()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 for(const match of appSource.matchAll(/\$\("([^"]+)"\)/g)){
  assert.ok(ids.has(match[1]),"Missing #"+match[1]);
 }
});
