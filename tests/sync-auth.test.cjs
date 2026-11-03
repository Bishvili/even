"use strict";
// Run: node --test tests/sync-auth.test.cjs
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const {TextEncoder}=require("node:util");

function harness({verified=false}={}){
 const source=fs.readFileSync(path.join(__dirname,"..","worker","index.js"),"utf8");
 const loaded=source.replace("export default {","globalThis.__worker = {");
 assert.notEqual(source,loaded,"Worker ESM export not found");
 const dispatches=[];
 const runtime={crypto:webcrypto,TextEncoder,Response,URL,atob,Uint8Array,console,async fetch(url,init){dispatches.push({url,init});return new Response(null,{status:204});}};
 vm.runInNewContext(loaded,runtime,{timeout:2500,filename:"worker/index.js"});
 const allowed=["owner-a@example.com","owner-b@example.com"];
 const rows={calendars:new Map(),users:new Map(),devices:new Map(),health:new Map(),events:new Map()};
 const release=JSON.stringify({version:"1.0.0",url:"https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2",publishedAt:"2026-11-01",notes:"First shared release",verified});
 const env={GITHUB_API_KEY:"server-only",APPROVED_SYNC_EMAILS:JSON.stringify(allowed),ASSETS:{async get(key){return key==="config:shortcut:latest"?release:null;}},DB:{
  prepare(sql){return{bind(...args){return {
   async first(){
    if(sql.includes("FROM rt_release_emails"))return args[0]==="owner-a@example.com"?{allowed:1}:null;
    if(sql.includes("SELECT device_id,owner_email,revoked_at"))return rows.devices.get(args[0])||null;
    if(sql.includes("SELECT last_used_at,last_attempt_at,last_error_code,shortcut_version")){const d=[...rows.devices.values()].find(d=>d.device_id===args[0]&&d.owner_email===args[1]&&!d.revoked_at);return d||null;}
    if(sql.includes("SELECT COUNT(*) AS count FROM rt_health_metrics"))return{count:[...rows.health.values()].filter(d=>d.owner===args[0]).length};
    if(sql.includes("SELECT COUNT(*) AS count FROM rt_calendar_events"))return{count:[...rows.events.values()].filter(d=>d.owner===args[0]).length};
    if(sql.includes("COUNT(*)"))return {count:[...rows.devices.values()].filter(d=>d.owner_email===args[0]&&!d.revoked_at).length};
    throw new Error("Unexpected first: "+sql);
   },
   async all(){
    if(sql.startsWith("SELECT name FROM rt_calendars"))return{results:[...rows.calendars.values()].filter(c=>c.owner===args[0]&&!c.enabled)};
    if(sql.startsWith("SELECT name,enabled FROM rt_calendars"))return{results:[...rows.calendars.values()].filter(c=>c.owner===args[0])};
    if(sql.includes("SELECT device_id,label,created_at"))return{results:[...rows.devices.values()].filter(d=>d.owner_email===args[0]).map(d=>({device_id:d.device_id,label:d.label,created_at:d.created_at,last_used_at:d.last_used_at,revoked_at:d.revoked_at}))};
    if(sql.includes("SELECT day,metric,value FROM rt_health_metrics"))return{results:[...rows.health.values()].filter(d=>d.owner===args[0]).map(d=>({day:d.day,metric:d.metric,value:d.value}))};
    if(sql.includes("SELECT event_id,start_time,end_time"))return{results:[...rows.events.values()].filter(d=>d.owner===args[0]).map(d=>({event_id:d.id,start_time:d.start_time,end_time:d.end_time,title:d.title,category:d.category}))};
    throw new Error("Unexpected all: "+sql);
   },
   async run(){
    if(sql.startsWith("INSERT OR IGNORE INTO rt_users")){rows.users.set(args[0],args[1]);return{meta:{changes:1}};}
    if(sql.startsWith("INSERT INTO rt_devices")){rows.devices.set(args[0],{device_id:args[1],owner_email:args[2],label:args[3],created_at:args[4],last_used_at:null,last_attempt_at:null,last_error_code:null,shortcut_version:null,revoked_at:null});return{meta:{changes:1}};}
    if(sql.startsWith("UPDATE rt_devices SET revoked_at")){let changes=0;for(const d of rows.devices.values())if(d.device_id===args[1]&&d.owner_email===args[2]&&!d.revoked_at){d.revoked_at=args[0];changes++;}return{meta:{changes}};}
    if(sql.startsWith("UPDATE rt_devices SET last_attempt_at")){for(const d of rows.devices.values())if(d.device_id===args[2]&&d.owner_email===args[3]&&!d.revoked_at){d.last_attempt_at=args[0];if(sql.includes("last_error_code=NULL,shortcut_version=?")){d.last_error_code=null;d.shortcut_version=args[1];}else d.last_error_code=args[1];}return{meta:{changes:1}};}
    if(sql.startsWith("UPDATE rt_devices SET last_used_at")){for(const d of rows.devices.values())if(d.device_id===args[3]&&d.owner_email===args[4]&&!d.revoked_at){d.last_used_at=args[0];d.last_attempt_at=args[1];d.last_error_code=null;d.shortcut_version=args[2]||d.shortcut_version;}return{meta:{changes:1}};}
    if(sql.startsWith("INSERT INTO rt_health_metrics")){rows.health.set(args[0]+"|"+args[1]+"|"+args[2],{owner:args[0],day:args[1],metric:args[2],value:args[3]});return{meta:{changes:1}};}
    if(sql.startsWith("INSERT OR IGNORE INTO rt_calendars")){const k=args[0]+"|"+args[1];if(!rows.calendars.has(k))rows.calendars.set(k,{owner:args[0],name:args[1],enabled:1});return{meta:{changes:1}};}
    if(sql.startsWith("UPDATE rt_calendars")){const c=rows.calendars.get(args[1]+"|"+args[2]);if(c)c.enabled=args[0];return{meta:{changes:c?1:0}};}
    if(sql.startsWith("DELETE FROM rt_calendars")){for(const [k,c] of rows.calendars)if(c.owner===args[0])rows.calendars.delete(k);return{meta:{changes:1}};}
    if(sql.includes("AND calendar=?")){for(const [k,d] of rows.events)if(d.owner===args[0]&&d.calendar===args[1])rows.events.delete(k);return{meta:{changes:1}};}
    if(sql.startsWith("INSERT INTO rt_calendar_events")){rows.events.set(args[0]+"|"+args[1],{owner:args[0],id:args[1],start_time:args[2],end_time:args[3],title:args[4],category:args[5],calendar:args[6]});return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM rt_health_metrics")){for(const [k,d] of rows.health)if(d.owner===args[0])rows.health.delete(k);return{meta:{changes:1}};}
    if(sql.includes("updated_at<?")){let changes=0;for(const [k,d] of rows.events)if(d.owner===args[0]&&d.start>=args[1]&&d.start<args[2]&&d.updated<args[3]){rows.events.delete(k);changes++;}return{meta:{changes}};}
    if(sql.startsWith("DELETE FROM rt_calendar_events")){for(const [k,d] of rows.events)if(d.owner===args[0])rows.events.delete(k);return{meta:{changes:1}};}
    throw new Error("Unexpected run: "+sql);
   }
  };}};},
  async batch(items){return Promise.all(items.map(s=>s.run()));}
 }};
 const aud="b15746656eee885f25c4f4b0605491289c01776b8710cc8339fb507f4574f745";
 const base="https://rage-tracker.bishvili.workers.dev";
 function ctx(email,audience=aud){return{access:{aud:audience,async getIdentity(){return{email};}}};}
 async function call(route,{method="GET",body,headers={},context}={}){
  const h=new Headers(headers);
  if(body!==undefined){h.set("Content-Type","application/json");if(!h.has("Origin"))h.set("Origin",base);}
  const response=await runtime.__worker.fetch(new Request(base+route,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env,context);
  return{status:response.status,data:response.status===303?null:await response.json()};
 }
 return{call,ctx,rows,dispatches};
}
test("untrusted identity headers and non-allowlisted Access sessions fail closed",async()=>{
 const {call,ctx}=harness();
 assert.equal((await call("/api/auth/me")).status,401);
 assert.equal((await call("/api/auth/me",{headers:{"Cf-Access-Jwt-Assertion":"forged"}})).status,401);
 assert.equal((await call("/api/auth/me",{context:ctx("owner-a@example.com","wrong")})).status,401);
 assert.equal((await call("/api/auth/me",{context:ctx("random@example.com")})).status,401);
 assert.equal((await call("/api/auth/me",{context:ctx("owner-a@example.com")})).status,200);
 assert.equal((await call("/api/pair",{method:"POST",body:{pairCode:"old",token:"test"}})).status,401);
});
test("only release accounts with a valid device can start publishing",async()=>{
 const{call,ctx,dispatches}=harness();
 const link="https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2";
 const a=await call("/api/auth/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/auth/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 assert.equal((await call("/api/auth/me",{context:ctx("owner-a@example.com")})).data.canRelease,true);
 assert.equal((await call("/api/auth/me",{context:ctx("owner-b@example.com")})).data.canRelease,false);
 assert.equal((await call("/api/shortcut/publish",{method:"POST",body:{link}})).status,401);
 assert.equal((await call("/api/shortcut/publish",{method:"POST",body:{link},headers:{Authorization:"Bearer "+b.data.token}})).status,403);
 assert.equal((await call("/api/shortcut/publish",{method:"POST",body:{link:"https://example.com/x"},headers:{Authorization:"Bearer "+a.data.token}})).status,400);
 assert.equal(dispatches.length,0);
 const started=await call("/api/shortcut/publish",{method:"POST",body:{link},headers:{Authorization:"Bearer "+a.data.token}});
 assert.equal(started.status,200);
 assert.equal(dispatches.length,1);
 assert.equal(JSON.parse(dispatches[0].init.body).inputs.icloud_link,link);
 assert.doesNotMatch(JSON.stringify(started.data),/server-only/);
});
test("turned-off calendars are owner-scoped, purge stored events, and skip new ones",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/auth/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/auth/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const A={Authorization:"Bearer "+a.data.token},B={Authorization:"Bearer "+b.data.token};
 const event=calendar=>({kind:"calendar",title:"Private",calendar,start:"2026-11-03T10:00:00Z",end:"2026-11-03T11:00:00Z"});
 await call("/api/ingest",{method:"POST",body:event("Work"),headers:A});
 await call("/api/ingest",{method:"POST",body:event("Work"),headers:B});
 assert.deepEqual((await call("/api/calendars",{headers:A})).data.calendars.map(c=>[c.name,c.enabled]),[["Work",true]]);
 assert.equal((await call("/api/calendars",{headers:{}})).status,401);
 assert.equal((await call("/api/calendars",{method:"POST",body:{name:"Nope",enabled:false},headers:A})).status,404);
 assert.equal((await call("/api/calendars",{method:"POST",body:{name:"Work",enabled:"no"},headers:A})).status,400);
 assert.equal((await call("/api/calendars",{method:"POST",body:{name:"Work",enabled:false},headers:A})).status,200);
 assert.equal([...rows.events.values()].filter(e=>e.owner==="owner-a@example.com").length,0);
 assert.equal([...rows.events.values()].filter(e=>e.owner==="owner-b@example.com").length,1);
 const skipped=await call("/api/ingest",{method:"POST",body:event("Work"),headers:A});
 assert.equal(skipped.data.state,"skipped");
 assert.equal([...rows.events.values()].filter(e=>e.owner==="owner-a@example.com").length,0);
 assert.equal((await call("/api/calendars",{headers:B})).data.calendars[0].enabled,true);
});
test("owner A data cannot be read or erased by owner B",async()=>{
 const{call,ctx}=harness();
 const a=await call("/api/auth/device",{method:"POST",body:{label:"A iPhone"},context:ctx("owner-a@example.com")});
 const b=await call("/api/auth/device",{method:"POST",body:{label:"B iPhone"},context:ctx("owner-b@example.com")});
 assert.equal(a.status,200);assert.equal(b.status,200);
 const keyA={Authorization:"Bearer "+a.data.token},keyB={Authorization:"Bearer "+b.data.token};
 const input={kind:"batch",health:[{date:"2026-10-31",steps:7000}],events:[{start:"2026-10-31T09:00:00-07:00",end:"2026-10-31T10:00:00-07:00",title:"Private appointment",category:"Other"}]};
 assert.equal((await call("/api/ingest",{method:"POST",body:input,headers:keyA})).status,200);
 const pullB=await call("/api/pull",{headers:keyB});assert.deepEqual(Array.from(pullB.data.health),[]);assert.deepEqual(Array.from(pullB.data.events),[]);
 const pullA=await call("/api/pull",{headers:keyA});assert.equal(pullA.data.health[0].steps,7000);assert.equal(pullA.data.events[0].title,"Private appointment");
 assert.equal((await call("/api/erase",{method:"POST",headers:keyB})).status,200);
 const after=await call("/api/pull",{headers:keyA});assert.equal(after.data.health[0].steps,7000);
 assert.equal(after.data.events[0].title,"Private appointment");
});
test("device revocation is owner-scoped, and invalidates the bearer",async()=>{
 const{call,ctx}=harness();
 const b=await call("/api/auth/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const unauthorized=await call("/api/auth/revoke",{method:"POST",body:{deviceId:b.data.deviceId},context:ctx("owner-a@example.com")});
 assert.equal(unauthorized.data.revoked,false);
 assert.equal((await call("/api/profile",{headers:{Authorization:"Bearer "+b.data.token}})).status,200);
 const revoked=await call("/api/auth/revoke",{method:"POST",body:{deviceId:b.data.deviceId},context:ctx("owner-b@example.com")});
 assert.equal(revoked.data.revoked,true);
 assert.equal((await call("/api/profile",{headers:{Authorization:"Bearer "+b.data.token}})).status,401);
});
test("device creation requires a same-origin JSON POST",async()=>{
 const{call,ctx}=harness();
 const request=await call("/api/auth/device",{method:"POST",body:{label:"spoof"},headers:{Origin:"https://attacker.invalid"},context:ctx("owner-a@example.com")});
 assert.equal(request.status,403);
});

test("sync diagnostics distinguish a valid device with no uploads from a rejected request",async()=>{
 const {call,ctx}=harness();
 const d=await call("/api/auth/device",{method:"POST",body:{label:"Personal iPhone"},context:ctx("owner-a@example.com")});
 const key={Authorization:"Bearer "+d.data.token};
 const initial=await call("/api/sync/status",{headers:key});
 assert.equal(initial.status,200);
 assert.equal(initial.data.credentialValid,true);
 assert.equal(initial.data.lastDataUploadAt,null);
 assert.equal(initial.data.healthMetrics,0);
 assert.equal(initial.data.calendarEvents,0);
 const denied=await call("/api/ingest",{method:"POST",body:{kind:"health",date:"not-a-date",steps:100},headers:key});
 assert.equal(denied.status,400);
 const failure=await call("/api/sync/status",{headers:key});
 assert.equal(failure.data.lastErrorCode,"no_valid_records");
 assert.ok(failure.data.lastAttemptAt);
 assert.equal(failure.data.lastDataUploadAt,null);
 const accepted=await call("/api/ingest",{method:"POST",body:{kind:"health",date:"2026-11-01",steps:4500,shortcutVersion:"1.1.0"},headers:key});
 assert.equal(accepted.status,200);
 assert.equal(accepted.data.state,"accepted");
 const success=await call("/api/sync/status",{headers:key});
 assert.equal(success.data.lastErrorCode,null);
 assert.ok(success.data.lastDataUploadAt);
 assert.equal(success.data.healthMetrics,1);
 assert.equal(success.data.installedShortcutVersion,"1.1.0");
});

test("versioned Shortcut release metadata requires an owned device and a validated iCloud URL",async()=>{
 const {call,ctx}=harness();
 const denied=await call("/api/shortcut/release");
 assert.equal(denied.status,401);
 const d=await call("/api/auth/device",{method:"POST",body:{label:"iPhone"},context:ctx("owner-a@example.com")});
 const release=await call("/api/shortcut/release",{headers:{Authorization:"Bearer "+d.data.token}});
 assert.equal(release.status,200);
 assert.equal(release.data.release.version,"1.0.0");
 assert.match(release.data.release.url,/^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/);
 assert.equal(release.data.automaticReplacement,false);
});

test("first-run Shortcut handshake validates an owned token without inventing data",async()=>{
 const {call,ctx}=harness();
 const user=await call("/api/auth/device",{method:"POST",body:{label:"iPhone"},context:ctx("owner-a@example.com")});
 const auth={Authorization:"Bearer "+user.data.token};
 const invalid=await call("/api/shortcut/hello",{method:"POST",body:{shortcutVersion:"banana"},headers:auth});
 assert.equal(invalid.status,400);
 const accepted=await call("/api/shortcut/hello",{method:"POST",body:{shortcutVersion:"2.3.0"},headers:auth});
 assert.equal(accepted.status,200);
 assert.equal(accepted.data.connected,true);
 assert.equal(accepted.data.state,"connected");
 const status=await call("/api/sync/status",{headers:auth});
 assert.equal(status.status,200);
 assert.equal(status.data.installedShortcutVersion,"2.3.0");
 assert.ok(status.data.lastAttemptAt);
 assert.equal(status.data.lastDataUploadAt,null);
 assert.equal(status.data.healthMetrics,0);
});

test("unverified releases are not advertised as updates",async()=>{
 const {call,ctx}=harness();
 const d=await call("/api/auth/device",{method:"POST",body:{label:"iPhone"},context:ctx("owner-a@example.com")});
 const auth={Authorization:"Bearer "+d.data.token};
 const result=await call("/api/shortcut/release?current=0.0.1",{headers:auth});
 assert.equal(result.status,200);
 assert.equal(result.data.release.verified,false);
 assert.equal(result.data.updateAvailable,false);
 assert.equal(result.data.updateStatus,"current");
 assert.equal(result.data.automaticReplacement,false);
});

test("Shortcut release comparison only offers upgrades",async()=>{
 const {call,ctx}=harness({verified:true});
 const user=await call("/api/auth/device",{method:"POST",body:{label:"iPhone"},context:ctx("owner-a@example.com")});
 const auth={Authorization:"Bearer "+user.data.token};
 const older=await call("/api/shortcut/release?current=0.9.0",{headers:auth});
 assert.equal(older.status,200);
 assert.equal(older.data.updateAvailable,true);
 assert.equal(older.data.updateStatus,"new_release");
 const equal=await call("/api/shortcut/release?current=1.0.0",{headers:auth});
 assert.equal(equal.data.updateAvailable,false);
 assert.equal(equal.data.updateStatus,"current");
 const newer=await call("/api/shortcut/release?current=1.1.0",{headers:auth});
 assert.equal(newer.data.updateAvailable,false);
 assert.equal(newer.data.updateStatus,"current");
});
test("calendar_complete removes only this owner's older events in that day",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/auth/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const auth={Authorization:"Bearer "+a.data.token};
 const started=new Date().toISOString(),old=new Date(Date.now()-60000).toISOString();
 rows.events.set("stale",{owner:"owner-a@example.com",start:"2026-11-02T18:00:00.000Z",updated:old});
 rows.events.set("otherday",{owner:"owner-a@example.com",start:"2026-11-04T18:00:00.000Z",updated:old});
 rows.events.set("otherowner",{owner:"owner-b@example.com",start:"2026-11-02T18:00:00.000Z",updated:old});
 rows.events.set("fresh",{owner:"owner-a@example.com",start:"2026-11-02T19:00:00.000Z",updated:new Date(Date.now()+1000).toISOString()});
 const done=await call("/api/ingest",{method:"POST",headers:auth,body:{kind:"calendar_complete",date:"2026-11-02",utcOffset:"-08:00",startedAt:started}});
 assert.equal(done.status,200);assert.equal(done.data.removed,1);
 assert.deepEqual([...rows.events.keys()].sort(),["fresh","otherday","otherowner"]);
 assert.equal((await call("/api/ingest",{method:"POST",headers:auth,body:{kind:"calendar_complete",date:"2026-11-02",utcOffset:"bad",startedAt:started}})).status,400);
 assert.equal((await call("/api/ingest",{method:"POST",headers:auth,body:{kind:"calendar_complete",date:"2026-11-02",utcOffset:"-08:00",startedAt:"2020-01-01T00:00:00Z"}})).status,400);
});
