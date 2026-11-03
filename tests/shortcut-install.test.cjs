"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.join(__dirname,"..");
const source=fs.readFileSync(path.join(root,"app.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const version="1.0.0";
const icloudUrl="https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2";
const base="https://even.bishvili.workers.dev";

function setup({verified=true,reportedVersion=null}={}){
 const elementIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 const elements=new Map(),urls=[],storageWrites=[];
 const token="a".repeat(64),deviceId="3f6ab11e-37e2-4607-89df-321014f10c39",email="owner-a@example.com";
 function element(id){
  if(!elementIds.has(id))throw Error("Unknown DOM id "+id);
  if(!elements.has(id)){
   const attrs=new Map();
   elements.set(id,{
    disabled:false,hidden:false,textContent:"",innerHTML:"",value:"",href:"",dataset:{},
    setAttribute(k,v){attrs.set(k,String(v));},
    removeAttribute(k){attrs.delete(k);},
    getAttribute(k){return attrs.has(k)?attrs.get(k):null;},
    classList:{toggle(){},add(){},remove(){}}
   });
  }
  return elements.get(id);
 }
 const document={getElementById:element,querySelectorAll(){return[];}};
 const initial={moods:[],health:[],events:[],token,syncOwnerEmail:email,deviceId};
 const localStorage={getItem(){return JSON.stringify(storageWrites.at(-1)||initial);},setItem(k,v){storageWrites.push(JSON.parse(v));}};
 const fetch=async(endpoint,options)=>{
  if(endpoint==="/api/shortcut/release")return {ok:true,async json(){return {ok:true,release:{version,url:icloudUrl,verified},automaticReplacement:false};}};
  if(endpoint==="/api/sync/status")return {ok:true,status:200,async json(){return {ok:true,credentialValid:true,deviceId,lastDataUploadAt:null,lastAttemptAt:reportedVersion?"2026-11-01T17:00:00Z":null,lastErrorCode:null,healthMetrics:0,calendarEvents:0,installedShortcutVersion:reportedVersion};}};
  throw Error("Unexpected request "+endpoint);
 };
 const code=source.replace(/init\(\);\s*\}\)\(\);\s*$/,'globalThis.__appTest={renderSync,loadShortcutRelease,checkShortcutUpload,setAuth:(e,d)=>{authEmail=e;authDevices=d;},getState:()=>state};})();');
 assert.notEqual(code,source,"App boot marker not found");
 const sandbox={
  document,localStorage,fetch,navigator:{onLine:true},location:{origin:base},window:{location:{assign(u){urls.push(u);}}},
  URL,Date,console,setTimeout,clearTimeout,confirm(){return true;}
 };
 vm.runInNewContext(code,sandbox,{filename:"app.js",timeout:3000});
 return {app:sandbox.__appTest,element,token,deviceId,email,urls,storageWrites};
}

test("iCloud installer targets a new tab, not the current PWA window",async()=>{
 const t=setup();
 t.app.setAuth(t.email,[]);
 await t.app.loadShortcutRelease();
 t.app.renderSync();
 const a=t.element("install-shortcut");
 assert.equal(a.href,icloudUrl);
 assert.equal(a.hidden,false);
 assert.match(html,/<a id="install-shortcut"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
 assert.equal(a.getAttribute("aria-disabled"),null);
 assert.equal(a.href.includes(t.token),false);
 assert.deepEqual(t.urls,[]);
});

test("only an active device can open the latest release",async()=>{
 const t=setup();
 await t.app.loadShortcutRelease();
 t.app.setAuth("owner-b@example.com",[]);
 t.app.renderSync();
 assert.equal(t.element("install-shortcut").getAttribute("aria-disabled"),"true");
 assert.equal(t.element("install-shortcut").hidden,true);
 assert.ok(!t.element("install-shortcut").getAttribute("tabindex")||t.element("install-shortcut").getAttribute("tabindex")==="-1");
});

test("an unverified release falls back to the public listing",async()=>{
 const t=setup({verified:false});
 t.app.setAuth(t.email,[]);
 await t.app.loadShortcutRelease();
 t.app.renderSync();
 assert.equal(t.element("install-shortcut").hidden,false);
 assert.equal(t.element("install-shortcut").href,"https://routinehub.co/shortcut/26978/");
 assert.equal(t.element("run-shortcut").hidden,false);
});
test("a valid credential is not mistaken for a successful Health upload",async()=>{
 const t=setup();
 t.app.setAuth(t.email,[]);
 await t.app.loadShortcutRelease();
 await t.app.checkShortcutUpload(false);
 assert.match(t.element("shortcut-sync-diagnostic").textContent,/no data has arrived/i);
 assert.match(t.element("shortcut-last-upload").textContent,/Nothing received yet/);
 assert.match(t.element("shortcut-upload-counts").textContent,/0 health measurements/);
});

test("server-reported Shortcut handshake replaces manual installation confirmation",async()=>{
 const t=setup({reportedVersion:"2.3.3"});
 t.app.setAuth(t.email,[]);
 await t.app.loadShortcutRelease();
 await t.app.checkShortcutUpload(false);
 assert.match(t.element("shortcut-release-version").textContent,/Connected · v2\.3\.3/);
 assert.equal(t.element("run-shortcut").hidden,false);
 assert.match(t.element("shortcut-last-upload").textContent,/no data yet/);
 assert.match(t.element("shortcut-sync-diagnostic").textContent,/no data has arrived/i);
 assert.equal(t.storageWrites.length,0);
});

test("a connected but outdated Shortcut cannot be launched from the PWA",async()=>{
 const t=setup({reportedVersion:"2.2.0"});
 t.app.setAuth(t.email,[]);
 await t.app.checkShortcutUpload(false);
 assert.equal(t.element("run-shortcut").hidden,true);
});

test("all application DOM references resolve to real elements",()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 for(const match of source.matchAll(/\$\("([^"]+)"\)/g))assert.ok(ids.has(match[1]),"Missing "+match[1]);
});

test("a v2.3.0 Shortcut cannot be launched from the PWA",async()=>{
 const t=setup({reportedVersion:"2.3.0"});
 t.app.setAuth(t.email,[]);
 await t.app.checkShortcutUpload(false);
 assert.equal(t.element("run-shortcut").hidden,true);
});
