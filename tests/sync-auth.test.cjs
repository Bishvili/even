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
 const runtime={crypto:webcrypto,TextEncoder,Response,URL,atob,Uint8Array,console};
 vm.runInNewContext(loaded,runtime,{timeout:2500,filename:"worker/index.js"});
 const allowed=["owner-a@example.com","owner-b@example.com"];
 const rows={users:new Map(),devices:new Map(),health:new Map(),events:new Map()};
 const release=JSON.stringify({version:"1.0.0",url:"https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2",publishedAt:"2026-11-01",notes:"First shared release",verified});
 const env={APPROVED_SYNC_EMAILS:JSON.stringify(allowed),ASSETS:{async get(key){return key==="config:shortcut:latest"?release:null;}},DB:{
  prepare(sql){return{bind(...args){return {
   async first(){
    if(sql.includes("SELECT device_id,owner_email,revoked_at"))return rows.devices.get(args[0])||null;
    if(sql.includes("SELECT last_used_at,last_attempt_at,last_error_code,shortcut_version")){const d=[...rows.devices.values()].find(d=>d.device_id===args[0]&&d.owner_email===args[1]&&!d.revoked_at);return d||null;}
    if(sql.includes("SELECT COUNT(*) AS count FROM rt_health_metrics"))return{count:[...rows.health.values()].filter(d=>d.owner===args[0]).length};
    if(sql.includes("SELECT COUNT(*) AS count FROM rt_calendar_events"))return{count:[...rows.events.values()].filter(d=>d.owner===args[0]).length};
    if(sql.includes("COUNT(*)"))return {count:[...rows.devices.values()].filter(d=>d.owner_email===args[0]&&!d.revoked_at).length};
    throw new Error("Unexpected first: "+sql);
   },
   async all(){
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
    if(sql.startsWith("INSERT INTO rt_calendar_events")){rows.events.set(args[0]+"|"+args[1],{owner:args[0],id:args[1],start_time:args[2],end_time:args[3],title:args[4],category:args[5]});return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM rt_health_metrics")){for(const [k,d] of rows.health)if(d.owner===args[0])rows.health.delete(k);return{meta:{changes:1}};}
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
 return{call,ctx,rows};
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
