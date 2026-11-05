"use strict";
// Run: node --test tests/sync-auth.test.cjs
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const {TextEncoder}=require("node:util");

const days=(date,records)=>({kind:"calendar_days",date,utcOffset:"+00:00",events:records.map(r=>r.join("\u241f")).join("\u241e")});
function harness({verified=false,buildVersion="2.8.0",helperBuild="2.0.0",sourceVersions=null,helperLink=null}={}){
 const source=fs.readFileSync(path.join(__dirname,"..","worker","index.js"),"utf8");
 const session='{createAuth:()=>({api:{getSession:async({headers})=>{const m=/health\\.session_token=([^;]+)/.exec(headers.get("cookie")||"");if(!m)return null;const user=JSON.parse(decodeURIComponent(m[1]));return{user,session:{createdAt:new Date(user.name==="Old session"?0:Date.now())}};}}})}';
 const loaded=source.replace('await import("./signin.mjs")',session).replace("export default {","globalThis.logEvent = logEvent;globalThis.runCron = runCron;globalThis.sendReminders = sendReminders;globalThis.readBedtimes = readBedtimes;globalThis.readSleep = readSleep;globalThis.reminderMessage = reminderMessage;globalThis.dueScheduled = dueScheduled;globalThis.readAlarms = readAlarms;globalThis.firstAlarm = firstAlarm;globalThis.pushPayload = pushPayload;globalThis.__worker = {");
 assert.notEqual(source,loaded,"Worker ESM export not found");
 const dispatches=[];
 const runtime={crypto:webcrypto,TextEncoder,Response,Request,Headers,URL,atob,btoa,Intl,Uint8Array,console,async fetch(url,init){
  if(String(url).includes("/shortcuts/api/records/")){const id=String(url).split("/").pop();return new Response(JSON.stringify({fields:{name:{value:id==="0".repeat(32)?"Other Shortcut":id==="1".repeat(32)?"Even Release":"Even Sync"}}}));}
  if(String(url).endsWith("Even-Sync-version.txt"))return new Response(buildVersion+"\n");
  if(String(url).endsWith("Even-Release-version.txt"))return helperBuild?new Response(helperBuild+"\n"):new Response("",{status:404});
  if(String(url).endsWith(".shortcut"))return new Response("file");
  dispatches.push({url,init});return new Response(null,{status:204});}};
 vm.runInNewContext(loaded,runtime,{timeout:2500,filename:"worker/index.js"});
 const allowed=["owner-a@example.com","owner-b@example.com"];
 const rows={approved:new Map(),subs:new Map(),calendars:new Map(),users:new Map(),devices:new Map(),health:new Map(),events:new Map()};
 const release=JSON.stringify({version:"1.0.0",url:"https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2",publishedAt:"2026-11-01",notes:"First shared release",verified});
 const allow={async limit(){return{success:true};}};
 const env={PUBLIC_ORIGIN:"https://even.bishvili.org",INVITE_LIMIT:allow,DEVICE_LIMIT:allow,SIGNIN_LIMIT:allow,SEND_LIMIT:allow,NETWORK_LIMIT:allow,GITHUB_API_KEY:"server-only",APPROVED_SYNC_EMAILS:JSON.stringify(allowed),ASSETS:{async get(key){return {"config:shortcut:latest":release,"config:helper:latest":helperLink&&JSON.stringify(helperLink),"config:shortcut:source":sourceVersions&&JSON.stringify(sourceVersions)}[key]||null;}},DB:{
  prepare(sql){return{bind(...args){return {
   async first(){
    if(sql.startsWith("SELECT updated_at,(SELECT COUNT(*) FROM health_push_subscriptions"))return null;
    if(sql.startsWith("SELECT (SELECT name FROM health_names")){const email=args[0];return{chosen:rows.names?.get(email)||null,given:email==="owner-a@example.com"?"Ada Lovelace":null,signin:(rows.userFields?.get(email)||{}).name||null};}
    if(sql.startsWith("SELECT COUNT(*) AS count FROM health_calendar_events WHERE owner_email=? AND calendar=?"))return{count:[...rows.events.values()].filter(d=>d.owner===args[0]&&d.calendar===args[1]).length};
    if(sql.startsWith("SELECT sync_off FROM health_users"))return (rows.userFields?.get(args[0]))||null;
    if(sql.startsWith("INSERT INTO health_service")){rows.sends=(rows.sends||0)+1;return{value:String(rows.sends)};}
    if(sql.includes("FROM health_approved_emails WHERE email"))return rows.approved.has(args[0])?{allowed:1}:null;
    if(sql.includes("SELECT display_name"))return args[0]==="owner-a@example.com"&&!rows.welcomed?{display_name:"Ada"}:null;
    if(sql.startsWith("SELECT endpoint,p256dh,auth FROM health_push_subscriptions")){return [...rows.subs.values()].find(x=>x.device_id===args[0]&&x.owner===args[1])||null;}
    if(sql.startsWith("SELECT shortcut_version FROM health_devices")){const d=[...rows.devices.values()].find(x=>x.device_id===args[0]);return d||null;}
    if(sql.includes("FROM health_release_emails"))return args[0]==="owner-a@example.com"?{allowed:1}:null;
    if(sql.includes("SELECT device_id,owner_email,revoked_at"))return rows.devices.get(args[0])||null;
    if(sql.includes("SELECT last_used_at,last_attempt_at,last_error_code,shortcut_version,last_upload_counts")){const d=[...rows.devices.values()].find(d=>d.device_id===args[0]&&d.owner_email===args[1]&&!d.revoked_at);return d||null;}
    if(sql.includes("SELECT COUNT(*) AS count FROM health_metrics"))return{count:[...rows.health.values()].filter(d=>d.owner===args[0]).length};
    if(sql.includes("SELECT COUNT(*) AS count FROM health_calendar_events"))return{count:[...rows.events.values()].filter(d=>d.owner===args[0]).length};
    if(sql.includes("COUNT(*)"))return {count:[...rows.devices.values()].filter(d=>d.owner_email===args[0]&&!d.revoked_at).length};
    throw new Error("Unexpected first: "+sql);
   },
   async all(){
    if(sql.startsWith("SELECT email FROM health_approved_emails"))return{results:[...rows.approved.keys()].map(email=>({email}))};
    if(sql.startsWith("SELECT email,display_name FROM health_release_emails"))return{results:[{email:"owner-a@example.com",display_name:"Ada"}]};
    if(sql.startsWith("SELECT email,name FROM health_names"))return{results:[...(rows.names||new Map()).entries()].map(([email,name])=>({email,name}))};
    if(sql.startsWith("SELECT email,name FROM health_users"))return{results:[...rows.users.keys()].map(email=>({email,name:(rows.userFields?.get(email)||{}).name}))};
    if(sql.startsWith("SELECT id,ts,score"))return{results:(rows.moods||[]).filter(m=>m.owner===args[0]&&(m.updated_at||"")>=args[1])};
    if(sql.startsWith("SELECT s.endpoint"))return{results:[...rows.subs.values()].filter(s=>[...rows.devices.values()].some(d=>d.device_id===s.device_id&&!d.revoked_at))};
    if(sql.startsWith("SELECT event_id,title FROM health_calendar_events"))return{results:[]};
    if(sql.startsWith("SELECT metric,MAX(day)")){const by={};for(const h of rows.health.values())if(h.owner===args[0]){const m=by[h.metric]||(by[h.metric]={metric:h.metric,day:h.day,days:0});m.days++;if(h.day>m.day)m.day=h.day;}return{results:Object.values(by)};}
    if(sql.startsWith("SELECT name FROM health_calendars"))return{results:[...rows.calendars.values()].filter(c=>c.owner===args[0]&&!c.enabled)};
    if(sql.startsWith("SELECT name,enabled,category FROM health_calendars"))return{results:[...rows.calendars.values()].filter(c=>c.owner===args[0])};
    if(sql.includes("SELECT device_id,label,created_at"))return{results:[...rows.devices.values()].filter(d=>d.owner_email===args[0]).map(d=>({device_id:d.device_id,label:d.label,created_at:d.created_at,last_used_at:d.last_used_at,revoked_at:d.revoked_at}))};
    if(sql.includes("SELECT day,metric,value FROM health_metrics"))return{results:[...rows.health.values()].filter(d=>d.owner===args[0]).map(d=>({day:d.day,metric:d.metric,value:d.value}))};
    if(sql.includes("SELECT event_id,start_time,end_time"))return{results:[...rows.events.values()].filter(d=>d.owner===args[0]&&!(rows.calendars.get(d.owner+"|"+d.calendar)&&!rows.calendars.get(d.owner+"|"+d.calendar).enabled)).map(d=>({event_id:d.id,start_time:d.start_time,end_time:d.end_time,title:d.title,category:d.category}))};
    if(sql.includes("FROM health_alarms"))return{results:[...(rows.alarms||[])].filter(a=>a.owner===args[0])};
    throw new Error("Unexpected all: "+sql);
   },
   async run(){
    if(sql.startsWith("INSERT OR IGNORE INTO health_users")){rows.users.set(args[0],args[1]);return{meta:{changes:1}};}
    if(sql.startsWith("INSERT INTO health_devices")){rows.devices.set(args[0],{device_id:args[1],owner_email:args[2],label:args[3],created_at:args[4],last_used_at:null,last_attempt_at:null,last_error_code:null,shortcut_version:null,revoked_at:null});return{meta:{changes:1}};}
    if(sql.startsWith("UPDATE health_devices SET last_upload_counts=NULL")){for(const d of rows.devices.values())if(d.owner_email===args[0])d.last_upload_counts=null;return{meta:{changes:1}};}
    if(sql.startsWith("INSERT INTO health_service"))return{meta:{changes:1}};
    if(sql.startsWith("UPDATE health_moods SET ts=?")){(rows.moods||[]).forEach(m=>{if(m.owner===args[3]&&!m.deleted_at){m.deleted_at=args[2];m.note=null;}});return{meta:{changes:1}};}
    if(sql.startsWith("UPDATE health_calendars SET category")){const c=rows.calendars.get(args[1]+"|"+args[2]);if(c)c.category=args[0];return{meta:{changes:c?1:0}};}
    if(sql.startsWith("UPDATE health_calendar_events SET category"))return{meta:{changes:1}};
    if(sql.startsWith("DELETE FROM health_signin_"))return{meta:{changes:0}};
    if(sql.startsWith("UPDATE health_devices SET revoked_at")){let changes=0;for(const d of rows.devices.values())if(d.device_id===args[1]&&d.owner_email===args[2]&&!d.revoked_at){d.revoked_at=args[0];changes++;}return{meta:{changes}};}
    if(sql.startsWith("UPDATE health_devices SET last_attempt_at")){for(const d of rows.devices.values())if(d.device_id===args[2]&&d.owner_email===args[3]&&!d.revoked_at){d.last_attempt_at=args[0];if(sql.includes("last_error_code=NULL,shortcut_version=?")){d.last_error_code=null;d.shortcut_version=args[1];}else d.last_error_code=args[1];}return{meta:{changes:1}};}
    if(sql.startsWith("UPDATE health_devices SET last_used_at")){for(const d of rows.devices.values())if(d.device_id===args[6]&&d.owner_email===args[7]&&!d.revoked_at){d.last_upload_counts=d.last_used_at>args[3]?JSON.stringify({...JSON.parse(d.last_upload_counts||"{}"),...JSON.parse(args[4])}):args[5];d.last_used_at=args[0];d.last_attempt_at=args[1];d.last_error_code=null;d.shortcut_version=args[2]||d.shortcut_version;}return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_alarms")){rows.alarms=(rows.alarms||[]).filter(x=>x.owner!==args[0]);return{meta:{changes:1}};}
    if(sql.startsWith("INSERT INTO health_alarms")){(rows.alarms=rows.alarms||[]).push({owner:args[0],time_min:args[2],days:args[3],enabled:args[4],label:args[5]});return{meta:{changes:1}};}
    if(sql.startsWith("UPDATE health_users")){
     const u=(rows.userFields=rows.userFields||new Map());const email=args[args.length>2?1:1];const row=u.get(email)||{};
     if(sql.includes("SET name"))row.name=args[0];if(sql.includes("SET sync_off"))row.sync_off=args[0];
     u.set(email,row);return{meta:{changes:1}};
    }
    if(sql.startsWith("INSERT INTO health_names")){(rows.names=rows.names||new Map()).set(args[0],args[1]);return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_names")){rows.names?.delete(args[0]);return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_moods")){rows.moods=(rows.moods||[]).filter(m=>m.owner!==args[0]);return{meta:{changes:1}};}
    if(sql.startsWith("INSERT INTO health_moods")){
     rows.moods=rows.moods||[];const existing=rows.moods.find(m=>m.owner===args[0]&&m.id===args[1]);
     if(sql.includes("deleted_at) VALUES")){if(existing){Object.assign(existing,{score:null,note:null,deleted_at:args[4]});}else rows.moods.push({owner:args[0],id:args[1],ts:args[2],deleted_at:args[4]});}
     else if(!existing)rows.moods.push({owner:args[0],id:args[1],ts:args[2],score:args[3],energy:args[4],stress:args[5],tags:args[6],note:args[7]});
     else if(!existing.deleted_at)Object.assign(existing,{score:args[3],note:args[7]});
     return{meta:{changes:1}};
    }
    if(sql.startsWith("UPDATE health_devices SET label")){let changes=0;for(const d of rows.devices.values())if(d.device_id===args[1]&&d.owner_email===args[2]&&!d.revoked_at){d.label=args[0];changes++;}return{meta:{changes}};}
    if(sql.startsWith("INSERT INTO health_metrics")){rows.health.set(args[0]+"|"+args[1]+"|"+args[2],{owner:args[0],day:args[1],metric:args[2],value:args[3]});return{meta:{changes:1}};}
    if(sql.startsWith("INSERT INTO health_push_subscriptions")){rows.subs.set(args[0],{endpoint:args[0],owner:args[1],device_id:args[2],mode:args[3],time_zone:args[4],p256dh:args[6],auth:args[7],sync_at:args[8],stress_times:args[9],schedule:args[10],last_check_in_at:null});return{meta:{changes:1}};}
    if(sql.startsWith("INSERT OR IGNORE INTO health_approved_emails")){rows.approved.set(args[0],args[1]);return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_approved_emails")){rows.approved.delete(args[0]);return{meta:{changes:1}};}
    if(sql.includes("SET last_check_in_at")){for(const x of rows.subs.values())if(x.owner===args[1])x.last_check_in_at=args[0];return{meta:{changes:1}};}
    if(sql.includes("SET last_push_status"))return{meta:{changes:1}};
    if(sql.includes("SET last_schedule_at")){rows.subs.get(args[1]).last_schedule_at=args[0];return{meta:{changes:1}};}
    if(sql.includes("SET last_stress_at")){rows.subs.get(args[1]).last_stress_at=args[0];return{meta:{changes:1}};}
    if(sql.includes("SET last_sync_prompt_day")){rows.subs.get(args[1]).last_sync_prompt_day=args[0];return{meta:{changes:1}};}
    if(sql.startsWith("UPDATE health_devices SET last_seen_at")){for(const d of rows.devices.values())if(d.device_id===args[1])d.last_seen_at=args[0];return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_devices")){for(const [k,d] of rows.devices)if(d.owner_email===args[0])rows.devices.delete(k);return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_users")){rows.users.delete(args[0]);return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_push_subscriptions WHERE owner_email")){for(const [k,x] of rows.subs)if(x.owner===args[0])rows.subs.delete(k);return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_push_subscriptions WHERE device_id")){for(const [k,x] of rows.subs)if(x.device_id===args[0]&&x.owner===args[1])rows.subs.delete(k);return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_push_subscriptions WHERE endpoint=? AND owner_email=?")){const s=rows.subs.get(args[0]);if(s&&s.owner===args[1])rows.subs.delete(args[0]);return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_push_subscriptions"))  {rows.subs.delete(args[0]);return{meta:{changes:1}};}
    if(sql.startsWith("UPDATE health_release_emails")){if(args[1]==="owner-a@example.com")rows.welcomed=true;return{meta:{changes:1}};}
    if(sql.startsWith("INSERT OR IGNORE INTO health_calendars")){const k=args[0]+"|"+args[1];if(!rows.calendars.has(k))rows.calendars.set(k,{owner:args[0],name:args[1],enabled:1});return{meta:{changes:1}};}
    if(sql.startsWith("UPDATE health_calendars")){const c=rows.calendars.get(args[1]+"|"+args[2]);if(c)c.enabled=args[0];return{meta:{changes:c?1:0}};}
    if(sql.startsWith("DELETE FROM health_calendars")){for(const [k,c] of rows.calendars)if(c.owner===args[0])rows.calendars.delete(k);return{meta:{changes:1}};}
    if(sql.startsWith("INSERT INTO health_calendar_events")){rows.events.set(args[0]+"|"+args[1],{owner:args[0],id:args[1],start_time:args[2],end_time:args[3],title:args[4],category:args[5],calendar:args[6],start:args[2],updated:args[7]});return{meta:{changes:1}};}
    if(sql.startsWith("DELETE FROM health_metrics")){for(const [k,d] of rows.health)if(d.owner===args[0])rows.health.delete(k);return{meta:{changes:1}};}
    if(sql.includes("updated_at<?")){let changes=0;for(const [k,d] of rows.events)if(d.owner===args[0]&&d.start>=args[1]&&d.start<args[2]&&d.updated<args[3]){rows.events.delete(k);changes++;}return{meta:{changes}};}
    if(sql==="DELETE FROM health_calendar_events WHERE owner_email=? AND calendar=?"){let changes=0;for(const [k,d] of rows.events)if(d.owner===args[0]&&d.calendar===args[1]){rows.events.delete(k);changes++;}return{meta:{changes}};}
    if(sql.startsWith("DELETE FROM health_calendar_events")){for(const [k,d] of rows.events)if(d.owner===args[0])rows.events.delete(k);return{meta:{changes:1}};}
    throw new Error("Unexpected run: "+sql);
   }
  };}};},
  async batch(items){return Promise.all(items.map(s=>s.run()));}
 }};
 const aud="b15746656eee885f25c4f4b0605491289c01776b8710cc8339fb507f4574f745";
 const base="https://even.bishvili.org";
 function ctx(email,audience=aud,name){return{access:{aud:audience,async getIdentity(){return{email,name};}}};}
 async function call(route,{method="GET",body,headers={},context}={}){
  const h=new Headers(headers);
  if(context?.access&&context.access.aud===aud)h.set("Cookie","health.session_token="+encodeURIComponent(JSON.stringify(await context.access.getIdentity())));
  if(body!==undefined){h.set("Content-Type","application/json");if(!h.has("Origin"))h.set("Origin",base);}
  const response=await runtime.__worker.fetch(new Request(base+route,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env,context);
  return{status:response.status,location:response.headers.get("Location"),data:response.status===303?null:await response.json()};
 }
 return{call,ctx,rows,dispatches,env,runtime};
}
const plan=(...times)=>times.map(at=>({at,kind:"custom"}));
test("untrusted identity headers and non-allowlisted Access sessions fail closed",async()=>{
 const {call,ctx}=harness();
 assert.equal((await call("/api/user/me")).status,401);
 assert.equal((await call("/api/user/me",{headers:{"Cf-Access-Jwt-Assertion":"forged"}})).status,401);
 assert.equal((await call("/api/user/me",{context:ctx("owner-a@example.com","wrong")})).status,401);
 assert.equal((await call("/api/user/me",{context:ctx("random@example.com")})).status,401);
 assert.equal((await call("/api/user/me",{context:ctx("owner-a@example.com")})).status,200);
 assert.equal((await call("/api/pair",{method:"POST",body:{pairCode:"old",token:"test"}})).status,401);
});
test("only release accounts with a valid device can start publishing",async()=>{
 const{call,ctx,dispatches}=harness();
 const link="https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2";
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 assert.equal((await call("/api/user/me",{context:ctx("owner-a@example.com")})).data.canRelease,true);
 assert.equal((await call("/api/user/me",{context:ctx("owner-b@example.com")})).data.canRelease,false);
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
test("turned-off calendars are owner-scoped, reversible, and skip new events",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const A={Authorization:"Bearer "+a.data.token},B={Authorization:"Bearer "+b.data.token};
 const event=calendar=>days("2026-11-03",[["2026-11-03T10:00:00Z","2026-11-03T11:00:00Z",calendar,"Private"]]);
 await call("/api/ingest",{method:"POST",body:event("Work"),headers:A});
 await call("/api/ingest",{method:"POST",body:event("Work"),headers:B});
 assert.deepEqual((await call("/api/calendars",{headers:A})).data.calendars.map(c=>[c.name,c.enabled]),[["Work",true]]);
 assert.equal((await call("/api/calendars",{headers:{}})).status,401);
 assert.equal((await call("/api/calendars",{method:"POST",body:{name:"Nope",enabled:false},headers:A})).status,404);
 assert.equal((await call("/api/calendars",{method:"POST",body:{name:"Work",enabled:"no"},headers:A})).status,400);
 assert.equal((await call("/api/calendars",{method:"POST",body:{name:"Work",enabled:false},headers:A})).status,200);
 assert.equal((await call("/api/pull",{headers:A})).data.events.length,0);
 assert.equal((await call("/api/pull",{headers:B})).data.events.length,1);
 const skipped=await call("/api/ingest",{method:"POST",body:event("Work"),headers:A});
 assert.equal(skipped.data.calendarEvents,0);
 await call("/api/calendars",{method:"POST",body:{name:"Work",enabled:true},headers:A});
 await call("/api/ingest",{method:"POST",body:event("Work"),headers:A});
 assert.equal((await call("/api/pull",{headers:A})).data.events.length,1);
 assert.equal((await call("/api/calendars",{headers:B})).data.calendars[0].enabled,true);
});
test("reminders are validated, owner-scoped, sent once a day, and stop when a device is revoked",async()=>{
 const{call,ctx,rows,env,runtime,dispatches}=harness();
 const pair=await webcrypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign"]);
 env.VAPID_PRIVATE_KEY=JSON.stringify(await webcrypto.subtle.exportKey("jwk",pair.privateKey));
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const A={Authorization:"Bearer "+a.data.token},B={Authorization:"Bearer "+b.data.token};
 const device=await webcrypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const devicePublic=new Uint8Array(await webcrypto.subtle.exportKey("raw",device.publicKey)),authSecret=webcrypto.getRandomValues(new Uint8Array(16));
 const endpoint="https://web.push.apple.com/abc",good={endpoint,mode:"custom",schedule:plan("2026-11-04T04:00:00Z"),timeZone:"America/Los_Angeles",keys:{p256dh:Buffer.from(devicePublic).toString("base64url"),auth:Buffer.from(authSecret).toString("base64url")}};
 assert.equal((await call("/api/push/subscribe",{method:"POST",body:{...good,keys:{}},headers:A})).status,400);
 assert.equal((await call("/api/push/subscribe",{method:"POST",body:good})).status,401);
 assert.equal((await call("/api/push/subscribe",{method:"POST",body:{...good,endpoint:"https://attacker.example/x"},headers:A})).status,400);
 assert.equal((await call("/api/push/subscribe",{method:"POST",body:{...good,schedule:[{at:"nonsense",kind:"custom"}]},headers:A})).status,400);
 assert.equal((await call("/api/push/subscribe",{method:"POST",body:{...good,timeZone:"Nowhere/Fake"},headers:A})).status,400);
 assert.equal((await call("/api/push/subscribe",{method:"POST",body:good,headers:A})).status,200);
 await call("/api/push/unsubscribe",{method:"POST",body:{endpoint},headers:B});
 assert.equal(rows.subs.size,1);
 const send=at=>runtime.sendReminders(env,new Date(at));
 await send("2026-11-04T03:00:00Z");
 assert.equal(dispatches.length,0);
 await send("2026-11-04T04:05:00Z");
 await send("2026-11-04T04:20:00Z");
 assert.equal(dispatches.length,1);
 assert.equal(dispatches[0].url,endpoint);
 const message=dispatches[0].init.body,salt=message.slice(0,16),sender=message.slice(21,86);
 const hkdf=async(saltBytes,ikm,info,length)=>new Uint8Array(await webcrypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt:saltBytes,info},await webcrypto.subtle.importKey("raw",ikm,"HKDF",false,["deriveBits"]),length*8));
 const peer=await webcrypto.subtle.importKey("raw",sender,{name:"ECDH",namedCurve:"P-256"},false,[]);
 const shared=new Uint8Array(await webcrypto.subtle.deriveBits({name:"ECDH",public:peer},device.privateKey,256));
 const ikm=await hkdf(authSecret,shared,Buffer.concat([Buffer.from("WebPush: info\0"),devicePublic,sender]),32);
 const cek=await hkdf(salt,ikm,Buffer.from("Content-Encoding: aes128gcm\0"),16),nonce=await hkdf(salt,ikm,Buffer.from("Content-Encoding: nonce\0"),12);
 const plain=new Uint8Array(await webcrypto.subtle.decrypt({name:"AES-GCM",iv:nonce},await webcrypto.subtle.importKey("raw",cek,"AES-GCM",false,["decrypt"]),message.slice(86)));
 assert.equal(plain[plain.length-1],2);
 assert.equal(JSON.parse(Buffer.from(plain.slice(0,-1)).toString()).notification.title,"Even");
 assert.equal(dispatches[0].init.headers["Content-Encoding"],"aes128gcm");
 assert.match(dispatches[0].init.headers.Authorization,/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
 await call("/api/user/revoke",{method:"POST",body:{deviceId:a.data.deviceId},context:ctx("owner-a@example.com")});
 await send("2026-11-05T04:05:00Z");
 assert.equal(dispatches.length,1);
});
test("the first sign-in welcome is per account and stops once seen",async()=>{
 const{call,ctx}=harness();
 const a=ctx("owner-a@example.com"),b=ctx("owner-b@example.com");
 assert.equal((await call("/api/user/me",{context:a})).data.welcomeName,"Ada");
 assert.equal((await call("/api/user/me",{context:b})).data.welcomeName,null);
 assert.equal((await call("/api/user/welcomed",{method:"POST",body:{}})).status,401);
 assert.equal((await call("/api/user/welcomed",{method:"POST",body:{},context:b})).status,200);
 assert.equal((await call("/api/user/me",{context:a})).data.welcomeName,"Ada");
 assert.equal((await call("/api/user/welcomed",{method:"POST",body:{},headers:{Origin:"https://evil.example"},context:a})).status,403);
 assert.equal((await call("/api/user/welcomed",{method:"POST",body:{},context:a})).status,200);
 assert.equal((await call("/api/user/me",{context:a})).data.welcomeName,null);
});
test("several reminder times each send once, and a check-in quiets smart reminders only",async()=>{
 const{call,ctx,rows,env,runtime,dispatches}=harness();
 const pair=await webcrypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign"]);
 env.VAPID_PRIVATE_KEY=JSON.stringify(await webcrypto.subtle.exportKey("jwk",pair.privateKey));
 const device=await webcrypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const keys={p256dh:Buffer.from(await webcrypto.subtle.exportKey("raw",device.publicKey)).toString("base64url"),auth:Buffer.alloc(16,1).toString("base64url")};
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const A={Authorization:"Bearer "+a.data.token},endpoint="https://web.push.apple.com/abc";
 const save=(mode,times)=>call("/api/push/subscribe",{method:"POST",body:{endpoint,keys,mode,schedule:plan(...times.map(x=>"2026-11-04T"+x+":00Z")),timeZone:"UTC"},headers:A});
 assert.equal((await save("other",["09:00"])).status,400);
 assert.equal((await save("custom",[])).status,400);
 assert.equal((await save("custom",["09:00","11:00"])).status,200);
 const send=at=>runtime.sendReminders(env,new Date(at));
 await send("2026-11-04T09:05:00Z");await send("2026-11-04T09:20:00Z");
 assert.equal(dispatches.length,1);
 await send("2026-11-04T11:05:00Z");
 assert.equal(dispatches.length,2);
 await call("/api/push/check-in",{method:"POST",body:{},headers:A});
 await save("smart",["23:30"]);
 const checkedIn=[...rows.subs.values()][0];checkedIn.last_check_in_at="2026-11-04T23:00:00Z";
 await send("2026-11-04T23:35:00Z");
 assert.equal(dispatches.length,2);
 checkedIn.last_check_in_at="2026-11-04T20:00:00Z";checkedIn.last_schedule_at=null;
 await send("2026-11-04T23:35:00Z");
 assert.equal(dispatches.length,3);
});
test("a repeated week keeps its local time across a clock change, in both directions",()=>{
 const{runtime}=harness(),zone="America/Los_Angeles",plan=[{at:"2026-10-29T16:00:00.000Z",kind:"custom"}];
 // 9:00 in daylight time, then 9:00 in standard time.
 assert.equal(runtime.dueScheduled(plan,Date.parse("2026-11-05T17:05:00Z"),0,zone).at,Date.parse("2026-11-05T17:00:00Z"));
 assert.equal(runtime.dueScheduled(plan,Date.parse("2026-11-05T16:05:00Z"),0,zone),null);
 const spring=[{at:"2027-03-11T17:00:00.000Z",kind:"custom"}];
 assert.equal(runtime.dueScheduled(spring,Date.parse("2027-03-18T16:05:00Z"),0,zone).at,Date.parse("2027-03-18T16:00:00Z"));
 assert.match(runtime.reminderMessage(900,false,true),/harder part of your day/);
 assert.equal(runtime.reminderMessage(900,true,true),runtime.reminderMessage(1300,true,false));
});
test("the helper's release state compares installed, latest and published, and wrong links are refused",async()=>{
 const{call,ctx,rows,dispatches}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const A={Authorization:"Bearer "+a.data.token};
 assert.equal((await call("/api/shortcut/release-state")).status,401);
 assert.equal((await call("/api/shortcut/release-state",{headers:{Authorization:"Bearer "+b.data.token}})).status,403);
 const device=[...rows.devices.values()].find(d=>d.owner_email==="owner-a@example.com");
 assert.equal((await call("/api/shortcut/release-state",{headers:A})).data.state,"install");
 device.shortcut_version="2.8.0";
 const state=await call("/api/shortcut/release-state",{headers:A});
 assert.equal(state.data.state,"publish");
 assert.equal(state.data.latest,"2.8.0");
 const wrong=await call("/api/shortcut/publish",{method:"POST",body:{link:"https://www.icloud.com/shortcuts/00000000000000000000000000000000"},headers:A});
 assert.equal(wrong.status,400);
 assert.equal(dispatches.length,0);
});
test("smart messages match the time of day, and a sync notification opens the app",async()=>{
 const{call,ctx,env,runtime,dispatches}=harness();
 const pair=await webcrypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign"]);
 env.VAPID_PRIVATE_KEY=JSON.stringify(await webcrypto.subtle.exportKey("jwk",pair.privateKey));
 assert.match(runtime.reminderMessage(500,false),/morning/i);
 assert.match(runtime.reminderMessage(1200,false),/today/i);
 assert.match(runtime.reminderMessage(500,true),/Bedtime/);
 const device=await webcrypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const keys={p256dh:Buffer.from(await webcrypto.subtle.exportKey("raw",device.publicKey)).toString("base64url"),auth:Buffer.alloc(16,1).toString("base64url")};
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const A={Authorization:"Bearer "+a.data.token};
 assert.equal((await call("/api/push/synced",{method:"POST",body:{items:"2"},headers:A})).data.state,"none");
 await call("/api/push/subscribe",{method:"POST",body:{endpoint:"https://web.push.apple.com/abc",keys,mode:"smart",schedule:plan("2026-11-09T09:00:00Z"),timeZone:"UTC"},headers:A});
 assert.equal((await call("/api/push/synced",{method:"POST",body:{items:"2"}})).status,401);
 assert.equal((await call("/api/push/synced",{method:"POST",body:{items:"2"},headers:A})).data.state,"sent");
 assert.equal(dispatches.length,1);
 assert.equal(JSON.parse(JSON.stringify(runtime.pushPayload(env,"x","/?sync=1"))).includes("/?sync=1"),true);
});
test("a return with no changes sends no check-ins, and a pull says whether it's complete",async()=>{
 const{call,ctx}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")}),A={Authorization:"Bearer "+a.data.token};
 await call("/api/moods",{method:"POST",headers:A,body:{moods:[{id:"m1",ts:"2026-11-04T10:00:00Z",score:4}]}});
 const first=await call("/api/session",{headers:A});
 assert.equal(first.data.moods.moods.length,1);
 const later=new Date(Date.now()+60000).toISOString();
 assert.equal((await call("/api/session?since="+encodeURIComponent(later),{headers:A})).data.moods.moods.length,0);
 assert.equal((await call("/api/moods?since=nonsense",{headers:A})).data.moods.length,1);
 const pull=await call("/api/pull",{headers:A});
 assert.equal(pull.data.complete.health,true);assert.equal(pull.data.complete.events,true);
});
test("a run can fill in a week of each measure, and status reports dates and counts, not values",async()=>{
 const{call,ctx}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")}),A={Authorization:"Bearer "+a.data.token};
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")}),B={Authorization:"Bearer "+b.data.token};
 const week=["2026-11-04=5000","2026-11-03=4200","bad=1","2026-11-02=999999"].map(x=>"␞"+x).join("");
 const up=await call("/api/ingest",{method:"POST",headers:A,body:{kind:"health",date:"2026-11-04",stepsRecent:week,hrvRecent:"␞2026-11-04=40"}});
 assert.equal(up.data.healthMetrics,3);
 const status=await call("/api/session",{headers:A});
 assert.equal(status.data.status.measures.steps.lastDay,"2026-11-04");
 assert.equal(status.data.status.measures.steps.days,2);
 assert.equal(JSON.stringify(status.data.status.measures).includes("5000"),false);
 assert.equal(Object.keys((await call("/api/session",{headers:B})).data.status.measures).length,0);
 assert.equal((await call("/api/ingest",{method:"POST",headers:A,body:{kind:"health",date:"2026-11-04",steps:"7000",stepsDate:"2026-11-04"}})).status,200);
});
test("each night's bedtime is its earliest sleep, ignoring naps and bad values",()=>{
 const{runtime}=harness();
 const rows=runtime.readBedtimes("2026-11-03T07:10 2026-11-03T00:20 2026-11-02T23:40 2026-11-02T15:00 2026-11-02T01:00 2026-11-01T22:50 bad 2026-13-01T22:00");
 const byDay=Object.fromEntries(rows.map(r=>[r.day,r.value]));
 assert.equal(byDay["2026-11-03"],23*60+40);
 assert.equal(byDay["2026-11-02"],22*60+50);
 assert.equal(rows.length,2);
 assert.equal(runtime.readBedtimes("").length,0);
});
test("release accounts manage testers, and removal ends a tester's access",async()=>{
 const{call,ctx,env,dispatches}=harness();
 const a=ctx("owner-a@example.com"),b=ctx("owner-b@example.com"),tester=ctx("new@example.com");
 assert.equal((await call("/api/user/me",{context:tester})).status,401);
 assert.equal((await call("/api/user/testers",{context:b})).status,403);
 assert.equal((await call("/api/user/testers",{method:"POST",body:{email:"new@example.com"},context:b})).status,403);
 assert.equal((await call("/api/user/testers",{method:"POST",body:{email:"new@example.com"}})).status,401);
 assert.equal((await call("/api/user/testers",{method:"POST",body:{email:"nope"},context:a})).status,400);
 assert.equal((await call("/api/user/testers",{method:"POST",body:{email:"New@Example.com"},headers:{Origin:"https://evil.example"},context:a})).status,403);
 assert.equal((await call("/api/user/testers",{method:"POST",body:{email:"New@Example.com"},context:a})).data.emailed,false);
 env.RESEND_API_KEY="server-only";
 assert.equal((await call("/api/user/testers",{method:"POST",body:{email:"New@Example.com"},context:a})).data.emailed,true);
 assert.equal(dispatches.at(-1).url,"https://api.resend.com/emails");
 assert.deepEqual(JSON.parse(dispatches.at(-1).init.body).to,["new@example.com"]);
 const everyone=(await call("/api/user/testers",{context:a})).data.testers;
 assert.deepEqual(everyone.map(t=>t.email),["new@example.com","owner-a@example.com","owner-b@example.com"]);
 assert.equal(everyone[0].removable,true);
 assert.equal(everyone[0].signedIn,false);
 assert.equal(everyone[1].name,"Ada");
 assert.equal(everyone[1].removable,false);
 const before=dispatches.length;
 assert.equal((await call("/api/user/testers/invite",{method:"POST",body:{email:"new@example.com"},context:b})).status,403);
 assert.equal((await call("/api/user/testers/invite",{method:"POST",body:{email:"stranger@example.com"},context:a})).status,404);
 assert.equal((await call("/api/user/testers/invite",{method:"POST",body:{email:"new@example.com"},context:a})).data.emailed,true);
 assert.equal(dispatches.length,before+1);
 assert.equal((await call("/api/user/me",{context:tester})).status,200);
 const device=await call("/api/user/device",{method:"POST",body:{label:"T"},context:tester});
 assert.equal((await call("/api/user/testers",{context:a})).data.testers[0].signedIn,true);
 assert.equal((await call("/api/sync/status",{headers:{Authorization:"Bearer "+device.data.token}})).status,200);
 assert.equal((await call("/api/user/testers/remove",{method:"POST",body:{email:"new@example.com"},context:a})).status,200);
 assert.equal((await call("/api/user/me",{context:tester})).status,401);
 assert.equal((await call("/api/sync/status",{headers:{Authorization:"Bearer "+device.data.token}})).status,401);
});
test("owner A data cannot be read or erased by owner B",async()=>{
 const{call,ctx}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A iPhone"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B iPhone"},context:ctx("owner-b@example.com")});
 assert.equal(a.status,200);assert.equal(b.status,200);
 const keyA={Authorization:"Bearer "+a.data.token},keyB={Authorization:"Bearer "+b.data.token};
 assert.equal((await call("/api/ingest",{method:"POST",body:{kind:"health",date:"2026-10-31",steps:7000},headers:keyA})).status,200);
 assert.equal((await call("/api/ingest",{method:"POST",body:days("2026-10-31",[["2026-10-31T09:00:00-07:00","2026-10-31T10:00:00-07:00","","Private appointment"]]),headers:keyA})).status,200);
 const pullB=await call("/api/pull",{headers:keyB});assert.deepEqual(Array.from(pullB.data.health),[]);assert.deepEqual(Array.from(pullB.data.events),[]);
 const pullA=await call("/api/pull",{headers:keyA});assert.equal(pullA.data.health[0].steps,7000);assert.equal(pullA.data.events[0].title,"Private appointment");
 assert.equal((await call("/api/user/erase",{method:"POST",body:{},context:ctx("owner-b@example.com")})).status,200);
 const after=await call("/api/pull",{headers:keyA});assert.equal(after.data.health[0].steps,7000);
 assert.equal(after.data.events[0].title,"Private appointment");
});
test("device revocation is owner-scoped, and invalidates the bearer",async()=>{
 const{call,ctx}=harness();
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const unauthorized=await call("/api/user/revoke",{method:"POST",body:{deviceId:b.data.deviceId},context:ctx("owner-a@example.com")});
 assert.equal(unauthorized.data.revoked,false);
 assert.equal((await call("/api/sync/status",{headers:{Authorization:"Bearer "+b.data.token}})).status,200);
 const revoked=await call("/api/user/revoke",{method:"POST",body:{deviceId:b.data.deviceId},context:ctx("owner-b@example.com")});
 assert.equal(revoked.data.revoked,true);
 assert.equal((await call("/api/sync/status",{headers:{Authorization:"Bearer "+b.data.token}})).status,401);
});
test("device creation requires a same-origin JSON POST",async()=>{
 const{call,ctx}=harness();
 const request=await call("/api/user/device",{method:"POST",body:{label:"spoof"},headers:{Origin:"https://attacker.invalid"},context:ctx("owner-a@example.com")});
 assert.equal(request.status,403);
});

test("sync diagnostics distinguish a valid device with no uploads from a rejected request",async()=>{
 const {call,ctx}=harness();
 const d=await call("/api/user/device",{method:"POST",body:{label:"Personal iPhone"},context:ctx("owner-a@example.com")});
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
 const d=await call("/api/user/device",{method:"POST",body:{label:"iPhone"},context:ctx("owner-a@example.com")});
 const release=await call("/api/shortcut/release",{headers:{Authorization:"Bearer "+d.data.token}});
 assert.equal(release.status,200);
 assert.equal(release.data.release.version,"1.0.0");
 assert.match(release.data.release.url,/^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/);
 assert.equal(release.data.automaticReplacement,false);
});

test("first-run Shortcut handshake validates an owned token without inventing data",async()=>{
 const {call,ctx}=harness();
 const user=await call("/api/user/device",{method:"POST",body:{label:"iPhone"},context:ctx("owner-a@example.com")});
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
 const d=await call("/api/user/device",{method:"POST",body:{label:"iPhone"},context:ctx("owner-a@example.com")});
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
 const user=await call("/api/user/device",{method:"POST",body:{label:"iPhone"},context:ctx("owner-a@example.com")});
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

test("alarm records parse labels, repeats and on or off state, and bad times are dropped",()=>{
 const{runtime}=harness();
 const parsed=runtime.readAlarms("\u241e06:30\u241fMonday\nTuesday\u241fYes\u241fGym\u241e22:00\u241fNever\u241fNo\u241f10:00 PM\u241ebad\u241fNever\u241f\u241fX\u241e07:15\u241fWeekdays\u241f\u241fAlarm");
 assert.deepEqual(JSON.parse(JSON.stringify(parsed)),[
  {timeMin:390,days:[1,2],enabled:1,label:"Gym"},
  {timeMin:1320,days:[],enabled:0,label:null},
  {timeMin:435,days:[1,2,3,4,5],enabled:null,label:null}
 ]);
 assert.equal(runtime.firstAlarm(parsed,"2026-11-09"),390);
 assert.equal(runtime.firstAlarm(parsed,"2026-11-11"),435);
 assert.equal(runtime.firstAlarm(parsed,"2026-11-07"),null);
});
test("sync reminders need an earlier sync and a stale one, and anticipated pushes send once",async()=>{
 const{call,ctx,env,rows,runtime,dispatches}=harness();
 const pair=await webcrypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign"]);
 env.VAPID_PRIVATE_KEY=JSON.stringify(await webcrypto.subtle.exportKey("jwk",pair.privateKey));
 const{publicKey}=await webcrypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const keys={p256dh:Buffer.from(await webcrypto.subtle.exportKey("raw",publicKey)).toString("base64url"),auth:Buffer.alloc(16,1).toString("base64url")};
 const device=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const headers={Authorization:"Bearer "+device.data.token},endpoint="https://web.push.apple.com/extras";
 const saved=await call("/api/push/subscribe",{method:"POST",headers,body:{endpoint,keys,mode:"custom",schedule:plan("2026-11-09T23:50:00Z"),syncAt:"10:00",stressTimes:["2026-11-09T15:00:00.000Z","nonsense"],timeZone:"UTC"}});
 assert.equal(saved.status,200);
 const sub=rows.subs.get(endpoint);
 assert.deepEqual(JSON.parse(sub.stress_times),["2026-11-09T15:00:00.000Z"]);
 const send=at=>runtime.sendReminders(env,new Date(at));
 await send("2026-11-09T14:50:00Z");
 assert.equal(dispatches.length,0);
 await send("2026-11-09T15:05:00Z");await send("2026-11-09T15:20:00Z");
 assert.equal(dispatches.length,1);
 assert.equal(sub.last_stress_at,"2026-11-09T15:00:00.000Z");
});
test("alarms belong to one owner, replace on each sync, and go with an erase",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const A={Authorization:"Bearer "+a.data.token},B={Authorization:"Bearer "+b.data.token};
 const upload=(alarms,date="2026-11-09")=>call("/api/ingest",{method:"POST",headers:A,body:{kind:"alarms",date,alarms}});
 const first=await upload("\u241e06:30\u241fMonday\u241fYes\u241fGym");assert.equal(first.data.alarms,1);
 assert.equal((await call("/api/pull",{headers:A})).data.alarms[0].label,"Gym");
 assert.equal((await call("/api/pull",{headers:B})).data.alarms.length,0);
 assert.equal(rows.health.get("owner-a@example.com|2026-11-09|firstAlarmMin").value,390);
 assert.equal((await upload("\u241enonsense")).status,400);
 assert.equal((await call("/api/pull",{headers:A})).data.alarms.length,1);
 assert.equal((await upload("")).data.alarms,0);
 assert.equal((await call("/api/pull",{headers:A})).data.alarms.length,0);
 await upload("\u241e06:30\u241fMonday\u241fYes\u241fGym");
 await call("/api/user/erase",{method:"POST",body:{},context:ctx("owner-a@example.com")});
 assert.equal((await call("/api/pull",{headers:A})).data.alarms.length,0);
});

test("a run that says it read a week keeps a week, and earlier Shortcuts still keep two days",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")}),A={Authorization:"Bearer "+a.data.token};
 const record=(start,title)=>[start,start.replace("09:00","10:00"),"Work",title].join("␟");
 const events=["",record("2026-11-04T09:00:00-08:00","Today"),record("2026-11-11T09:00:00-08:00","Last day"),record("2026-11-12T09:00:00-08:00","Too far")].join("␞");
 const week=await call("/api/ingest",{method:"POST",headers:A,body:{...days("2026-11-04",[]),events,calendarDays:"8",utcOffset:"-08:00"}});
 assert.equal(week.data.calendarEvents,2);
 const two=await call("/api/ingest",{method:"POST",headers:A,body:{...days("2026-11-04",[]),events,utcOffset:"-08:00"}});
 assert.equal(two.data.calendarEvents,1);
 const huge=await call("/api/ingest",{method:"POST",headers:A,body:{...days("2026-11-04",[]),events,calendarDays:"500",utcOffset:"-08:00"}});
 assert.equal(huge.data.calendarEvents,2);
 assert.ok(rows.events.size>=1);
});
test("today's and tomorrow's events arrive together, and events the run didn't send are removed",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const A={Authorization:"Bearer "+a.data.token};
 await call("/api/ingest",{method:"POST",body:days("2026-11-01",[["2026-11-01T10:00:00Z","2026-11-01T11:00:00Z","Private","Earlier"]]),headers:A});
 await call("/api/calendars",{method:"POST",body:{name:"Private",enabled:false},headers:A});
 const old=new Date(Date.now()-60000).toISOString();
 rows.events.set("stale",{owner:"owner-a@example.com",start:"2026-11-04T17:00:00.000Z",updated:old});
 rows.events.set("dayAfter",{owner:"owner-a@example.com",start:"2026-11-06T17:00:00.000Z",updated:old});
 rows.events.set("otherOwner",{owner:"owner-b@example.com",start:"2026-11-04T17:00:00.000Z",updated:old});
 const record=(...fields)=>fields.join("␟");
 const events=["",
  record("2026-11-04T09:00:00-08:00","2026-11-04T10:00:00-08:00","Work","Planning meeting"),
  record("2026-11-04T09:00:00-08:00","2026-11-04T10:00:00-08:00","Work","Planning meeting"),
  record("2026-11-05T08:00:00-08:00","2026-11-05T08:30:00-08:00","Home","Gym"),
  record("2026-11-06T08:00:00-08:00","2026-11-06T09:00:00-08:00","Work","Too far ahead"),
  record("2026-11-04T12:00:00-08:00","2026-11-04T13:00:00-08:00","Private","Kept off"),
  record("not a time","2026-11-04T13:00:00-08:00","Work","Broken")
 ].join("␞");
 const sent=await call("/api/ingest",{method:"POST",body:{kind:"calendar_days",date:"2026-11-04",utcOffset:"-08:00",shortcutVersion:"3.0.0",events},headers:A});
 assert.equal(sent.status,200);
 assert.equal(sent.data.state,"accepted");
 assert.equal(sent.data.calendarEvents,2);
 assert.equal(sent.data.removed,1);
 assert.ok(!rows.events.has("stale")&&rows.events.has("dayAfter")&&rows.events.has("otherOwner"));
 const titles=[...rows.events.values()].filter(e=>e.owner==="owner-a@example.com"&&e.title&&e.start>="2026-11-04").map(e=>e.title).sort();
 assert.deepEqual(titles,["Gym","Planning meeting"]);
 const status=await call("/api/sync/status",{headers:A});
 assert.equal(status.data.installedShortcutVersion,"3.0.0");
 assert.ok(status.data.lastDataUploadAt);
 const bad=await call("/api/ingest",{method:"POST",body:{kind:"calendar_days",date:"2026-11-04",utcOffset:"bad",events},headers:A});
 assert.equal(bad.status,400);
 assert.equal(bad.data.code,"invalid_calendar_details");
});
test("Health takes each measure with its own date, and reads comma decimals",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const A={Authorization:"Bearer "+a.data.token};
 const sent=await call("/api/ingest",{method:"POST",body:{kind:"health",shortcutVersion:"3.0.0",date:"2026-11-04",steps:"5200",stepsDate:"2026-11-04",hrv:"45,5",hrvDate:"2026-11-03",restingHR:"",restingHRDate:"",workoutMin:"",workoutMinDate:"",sleepIntervals:"",sleepSamples:"0",sleepLimit:"100"},headers:A});
 assert.equal(sent.data.state,"accepted");
 assert.equal(sent.data.healthMetrics,2);
 assert.equal(rows.health.get("owner-a@example.com|2026-11-04|steps").value,5200);
 assert.equal(rows.health.get("owner-a@example.com|2026-11-03|hrv").value,45.5);
 const bad=await call("/api/ingest",{method:"POST",body:{kind:"health",date:"2026-11-04",steps:"lots"},headers:A});
 assert.equal(bad.status,400);
 assert.equal(bad.data.code,"no_valid_records");
});
test("sleep intervals are merged across devices, filed by the morning they end, and skip naps and a possibly cut-off night",()=>{
 const{runtime}=harness();
 const span=(start,end)=>start+"␟"+end;
 const text=["",
  span("2026-11-03T23:30:00-08:00","2026-11-04T03:00:00-08:00"),
  span("2026-11-04T03:00:00-08:00","2026-11-04T06:30:00-08:00"),
  span("2026-11-03T23:45:00-08:00","2026-11-04T06:00:00-08:00"),
  span("2026-11-04T14:00:00-08:00","2026-11-04T14:40:00-08:00"),
  span("2026-11-02T22:50:00-08:00","2026-11-03T06:00:00-08:00"),
  span("not a time","2026-11-03T06:00:00-08:00")
 ].join("␞");
 const byNight=list=>Object.fromEntries(list.map(r=>[r.day+" "+r.metric,r.value]));
 const complete=byNight(runtime.readSleep(text,"6","100"));
 assert.equal(complete["2026-11-04 sleepHours"],7);
 assert.equal(complete["2026-11-04 bedtimeMin"],23*60+30);
 assert.equal(complete["2026-11-03 sleepHours"],7.17);
 assert.equal(complete["2026-11-03 bedtimeMin"],22*60+50);
 assert.equal(Object.keys(complete).length,4);
 const capped=byNight(runtime.readSleep(text,"100","100"));
 assert.equal(capped["2026-11-03 sleepHours"],undefined);
 assert.equal(capped["2026-11-04 sleepHours"],7);
 assert.deepEqual(Array.from(runtime.readSleep("","0","100")),[]);
});
test("the handshake says when a verified update is ready",async()=>{
 const verified=harness({verified:true});
 const a=await verified.call("/api/user/device",{method:"POST",body:{label:"A"},context:verified.ctx("owner-a@example.com")});
 const A={Authorization:"Bearer "+a.data.token};
 assert.equal((await verified.call("/api/shortcut/hello",{method:"POST",body:{shortcutVersion:"0.9.0"},headers:A})).data.updateStatus,"new_release");
 assert.equal((await verified.call("/api/shortcut/hello",{method:"POST",body:{shortcutVersion:"1.0.0"},headers:A})).data.updateStatus,"current");
 const unverified=harness();
 const b=await unverified.call("/api/user/device",{method:"POST",body:{label:"A"},context:unverified.ctx("owner-a@example.com")});
 assert.equal((await unverified.call("/api/shortcut/hello",{method:"POST",body:{shortcutVersion:"0.9.0"},headers:{Authorization:"Bearer "+b.data.token}})).data.updateStatus,"current");
});
test("Even Release 2 waits for a build being signed, never offers a downgrade, updates itself, and shares its link once",async()=>{
 const shared={version:"1.0.0",url:"https://www.icloud.com/shortcuts/ae34096d23534730ae2f82a99d861414"};
 async function state(options,installed,helper){
  const t=harness(options);
  const a=await t.call("/api/user/device",{method:"POST",body:{label:"A"},context:t.ctx("owner-a@example.com")});
  [...t.rows.devices.values()].find(d=>d.owner_email==="owner-a@example.com").shortcut_version=installed;
  return (await t.call("/api/shortcut/release-state"+(helper?"?helper="+helper:""),{headers:{Authorization:"Bearer "+a.data.token}})).data;
 }
 const building=await state({buildVersion:"2.9.0",sourceVersions:{sync:"3.0.0",release:"2.0.0"},helperLink:shared},"2.9.0","2.0.0");
 assert.equal(building.state,"building");
 assert.equal(building.helperState,"current");
 assert.equal(building.helperLinkState,"share");
 assert.equal((await state({buildVersion:"2.9.0",sourceVersions:{sync:"2.9.0",release:"2.0.0"}},"3.0.0","2.0.0")).state,"ahead");
 assert.equal((await state({buildVersion:"3.0.0",sourceVersions:{sync:"3.0.0",release:"2.0.0"}},"2.9.0","2.0.0")).state,"install");
 const outdated=await state({buildVersion:"2.9.0",helperBuild:"2.1.0"},"2.9.0","2.0.0");
 assert.equal(outdated.helperState,"update");
 assert.equal(outdated.helperLinkState,"current");
 const current=await state({verified:true,buildVersion:"1.0.0",sourceVersions:{sync:"1.0.0",release:"2.0.0"},helperLink:{version:"2.0.0",url:shared.url}},"1.0.0","2.0.0");
 assert.deepEqual([current.state,current.helperState,current.helperLinkState],["current","current","current"]);
 assert.equal((await state({buildVersion:"2.9.0",sourceVersions:{sync:"3.0.0",release:"2.0.0"}},"2.9.0",null)).state,"publish");
});
test("only release accounts can share the helper link, and only a link named Even Release",async()=>{
 const{call,ctx,dispatches}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const link="https://www.icloud.com/shortcuts/"+"1".repeat(32);
 assert.equal((await call("/api/shortcut/helper-link",{method:"POST",body:{link}})).status,401);
 assert.equal((await call("/api/shortcut/helper-link",{method:"POST",body:{link},headers:{Authorization:"Bearer "+b.data.token}})).status,403);
 const A={Authorization:"Bearer "+a.data.token};
 const wrong=await call("/api/shortcut/helper-link",{method:"POST",body:{link:"https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2"},headers:A});
 assert.equal(wrong.status,400);
 assert.equal(wrong.data.code,"wrong_shortcut");
 assert.equal(dispatches.length,0);
 assert.equal((await call("/api/shortcut/helper-link",{method:"POST",body:{link},headers:A})).status,200);
 assert.match(String(dispatches[0].url),/\/workflows\/helper-link\.yml\/dispatches$/);
 assert.equal(JSON.parse(dispatches[0].init.body).inputs.icloud_link,link);
});
test("release accounts get the helper's shared link with their session",async()=>{
 const helperLink={version:"2.0.0",url:"https://www.icloud.com/shortcuts/"+"1".repeat(32)};
 const{call,ctx}=harness({helperLink});
 assert.equal((await call("/api/user/me",{context:ctx("owner-a@example.com")})).data.helper.url,helperLink.url);
 assert.equal((await call("/api/user/me",{context:ctx("owner-b@example.com")})).data.helper,null);
});
test("every error carries a stable code",async()=>{
 const{call,ctx}=harness();
 const missing=await call("/api/pull");
 assert.equal(missing.status,401);
 assert.equal(missing.data.code,"device_required");
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const A={Authorization:"Bearer "+a.data.token};
 assert.equal((await call("/api/ingest",{method:"POST",body:{kind:"mystery"},headers:A})).data.code,"invalid_kind");
 assert.equal((await call("/api/nothing-here",{headers:A})).data.code,"not_found");
 const source=fs.readFileSync(path.join(__dirname,"..","worker","index.js"),"utf8");
 assert.doesNotMatch(source,/\berror\((?:"[^"]*"|NO_VALID_RECORDS)(?:,\d{3})?\)/);
});

test("check-ins always sync, stay with their owner, honor deletes, and an erase removes them from every device",async()=>{
 const{call,ctx}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const A={Authorization:"Bearer "+a.data.token},B={Authorization:"Bearer "+b.data.token};
 const mood={id:"m1",ts:"2026-11-04T10:00:00Z",score:4,energy:3,stress:2,tags:["Rest"],note:"private"};
 assert.equal((await call("/api/moods")).status,401);
 assert.equal((await call("/api/moods",{method:"POST",headers:A,body:{moods:[mood,{id:"bad",ts:"nope",score:9}]}})).data.saved,1);
 const read=await call("/api/moods",{headers:A});
 assert.equal(read.data.moods[0].note,"private");
 assert.deepEqual([...read.data.moods[0].tags],["Rest"]);
 assert.equal((await call("/api/moods",{headers:B})).data.moods.length,0);
 await call("/api/moods",{method:"POST",headers:A,body:{deleted:["m1"]}});
 const after=await call("/api/moods",{headers:A});
 assert.equal(after.data.moods.length,0);
 assert.deepEqual([...after.data.deleted],["m1"]);
 await call("/api/moods",{method:"POST",headers:A,body:{moods:[mood]}});
 assert.equal((await call("/api/moods",{headers:A})).data.moods.length,0);
 await call("/api/moods",{method:"POST",headers:A,body:{moods:[{...mood,id:"m2"}]}});
 assert.equal((await call("/api/user/erase",{method:"POST",headers:A,body:{}})).status,401);
 await call("/api/user/erase",{method:"POST",body:{},context:ctx("owner-a@example.com")});
 const erased=await call("/api/moods",{headers:A});
 assert.equal(erased.data.moods.length,0);
 assert.ok([...erased.data.deleted].includes("m2"));
 await call("/api/moods",{method:"POST",headers:A,body:{moods:[{...mood,id:"m2"}]}});
 assert.equal((await call("/api/moods",{headers:A})).data.moods.length,0);
});
test("a device key can't delete an account, and deleting needs a recent sign-in",async()=>{
 const{call,ctx,rows}=harness(),owner=ctx("owner-a@example.com");
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:owner});
 assert.equal((await call("/api/account/delete",{method:"POST",headers:{Authorization:"Bearer "+a.data.token}})).status,404);
 const stale=await call("/api/user/account/delete",{method:"POST",body:{},context:ctx("owner-a@example.com",undefined,"Old session")});
 assert.equal(stale.data.code,"fresh_sign_in_required");
 assert.equal(rows.users.has("owner-a@example.com"),true);
 assert.equal((await call("/api/user/account/delete",{method:"POST",body:{},context:owner})).status,200);
});
test("sending codes is limited per email, per network and per hour, whoever is asking",async()=>{
 const{call,env}=harness();
 const send=()=>call("/api/signin/email-otp/send-verification-otp",{method:"POST",body:{email:"stranger@example.com",type:"sign-in"}});
 for(let i=0;i<5;i++)assert.equal((await send()).status,200);
 assert.equal((await send()).data.code,"rate_limited");
 env.SEND_LIMIT={limit:async()=>({success:false})};
 assert.equal((await send()).data.code,"code_just_sent");
});
test("a calendar's purpose fills in what titles don't say, and titles still win",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const A={Authorization:"Bearer "+a.data.token};
 assert.equal((await call("/api/calendars",{method:"POST",headers:A,body:{name:"Kids",category:"Family"}})).status,404);
 rows.calendars.set("owner-a@example.com|Kids",{owner:"owner-a@example.com",name:"Kids",enabled:1});
 assert.equal((await call("/api/calendars",{method:"POST",headers:A,body:{name:"Kids",category:"Family"}})).status,200);
 assert.equal(rows.calendars.get("owner-a@example.com|Kids").category,"Family");
 assert.equal((await call("/api/calendars",{method:"POST",headers:A,body:{name:"Kids",category:"Nope"}})).status,400);
});
test("sync settings reach the Shortcut, apply on arrival, and belong to one owner",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const A={Authorization:"Bearer "+a.data.token},B={Authorization:"Bearer "+b.data.token};
 const hello=headers=>call("/api/shortcut/hello",{method:"POST",body:{shortcutVersion:"3.1.0"},headers});
 assert.equal((await hello(A)).data.syncSteps,"on");
 assert.equal((await hello(A)).data.calendarsOff,"(?!)");
 assert.equal((await call("/api/sync/settings",{method:"POST",headers:A,body:{kind:"banana",enabled:false}})).status,400);
 for(const kind of ["steps","alarms"])await call("/api/sync/settings",{method:"POST",headers:A,body:{kind,enabled:false}});
 assert.equal((await hello(A)).data.syncSteps,"off");
 assert.equal((await hello(B)).data.syncSteps,"on");
 assert.equal((await call("/api/sync/settings",{headers:A})).data.settings.alarms,false);
 assert.equal((await call("/api/ingest",{method:"POST",headers:A,body:{kind:"health",date:"2026-11-04",steps:"5000",hrv:"40"}})).status,200);
 assert.equal(rows.health.has("owner-a@example.com|2026-11-04|steps"),false);
 assert.equal(rows.health.has("owner-a@example.com|2026-11-04|hrv"),true);
 assert.equal((await call("/api/ingest",{method:"POST",headers:A,body:{kind:"alarms",date:"2026-11-04",alarms:"\u241e06:30\u241fMonday\u241fYes\u241fGym"}})).data.skipped,true);
 assert.equal((await call("/api/pull",{headers:A})).data.alarms.length,0);
});
test("devices can be renamed only by their owner, and sign-in names label testers",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"My iPhone"},context:ctx("owner-a@example.com")});
 const id=a.data.deviceId;
 assert.equal((await call("/api/user/device/rename",{method:"POST",body:{deviceId:id,label:" Work Mac "},context:ctx("owner-a@example.com")})).data.label,"Work Mac");
 assert.equal((await call("/api/user/device/rename",{method:"POST",body:{deviceId:id,label:"Mine"},context:ctx("owner-b@example.com")})).status,404);
 assert.equal((await call("/api/user/device/rename",{method:"POST",body:{deviceId:id,label:"  "},context:ctx("owner-a@example.com")})).status,400);
 assert.equal([...rows.devices.values()].find(d=>d.device_id===id).label,"Work Mac");
 await call("/api/user/testers",{method:"POST",body:{email:"new@example.com"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 assert.ok(b.data.deviceId);
 await call("/api/user/me",{context:ctx("owner-b@example.com",undefined,"Sam Lee")});
 const listed=(await call("/api/user/testers",{context:ctx("owner-a@example.com")})).data.testers;
 assert.equal(listed.find(t=>t.email==="owner-b@example.com").name,"Sam Lee");
 assert.equal(listed.find(t=>t.email==="owner-a@example.com").name,"Ada");
});

test("developers can set a tester's name, which outranks sign-in and leaves with the tester",async()=>{
 const{call,ctx,env,dispatches}=harness();
 const a=ctx("owner-a@example.com"),b=ctx("owner-b@example.com");
 env.RESEND_API_KEY="server-only";
 await call("/api/user/testers",{method:"POST",body:{email:"new@example.com"},context:a});
 const name=(email,value,context=a)=>call("/api/user/testers/name",{method:"POST",body:{email,name:value},context});
 assert.equal((await name("new@example.com","Sam Lee",b)).status,403);
 assert.equal((await name("stranger@example.com","Sam")).status,404);
 assert.equal((await name("new@example.com"," Sam Lee ")).data.name,"Sam Lee");
 const listed=async()=>(await call("/api/user/testers",{context:a})).data.testers.find(t=>t.email==="new@example.com");
 assert.equal((await listed()).name,"Sam Lee");
 await call("/api/user/testers/invite",{method:"POST",body:{email:"new@example.com"},context:a});
 const mail=JSON.parse(dispatches.at(-1).init?.body||dispatches.at(-1).body);
 assert.match(mail.subject,/^Ada invited you/);
 assert.match(mail.text,/^Hi Sam,/);
 assert.equal((await name("new@example.com","<b>Sam</b>")).status,200);
 await call("/api/user/testers/invite",{method:"POST",body:{email:"new@example.com"},context:a});
 const escaped=JSON.parse(dispatches.at(-1).init?.body||dispatches.at(-1).body);
 assert.doesNotMatch(escaped.html,/<b>Sam/);
 assert.equal((await name("new@example.com","")).data.name,null);
 assert.equal((await listed()).name,null);
 await name("new@example.com","Sam");
 await call("/api/user/testers/remove",{method:"POST",body:{email:"new@example.com"},context:a});
 await call("/api/user/testers",{method:"POST",body:{email:"new@example.com"},context:a});
 assert.equal((await listed()).name,null);
});
test("a first name appears only on messages that start or close the day, or at a hard moment",()=>{
 const{runtime}=harness();
 assert.match(runtime.reminderMessage(500,false,false,"Sam"),/^Good morning, Sam\./);
 assert.match(runtime.reminderMessage(1300,true,false,"Sam"),/^Bedtime soon, Sam\./);
 assert.match(runtime.reminderMessage(900,false,true,"Sam"),/^Sam, this is often/);
 assert.doesNotMatch(runtime.reminderMessage(760,false,false,"Sam"),/Sam/);
 assert.doesNotMatch(runtime.reminderMessage(1100,false,false,"Sam"),/Sam/);
 assert.equal(runtime.reminderMessage(500,false,false,null),"Good morning. How are you starting the day?");
});

test("people set their own name, for their account only, and an erase removes it",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-b@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-a@example.com")});
 const A={Authorization:"Bearer "+a.data.token};
 assert.equal((await call("/api/profile/name",{method:"POST",body:{name:"Sam"}})).status,401);
 const saved=await call("/api/profile/name",{method:"POST",headers:A,body:{name:"  Sam Lee ",email:"owner-a@example.com"}});
 assert.equal(saved.data.name,"Sam Lee");
 assert.equal(saved.data.firstName,"Sam");
 assert.equal(rows.names.get("owner-b@example.com"),"Sam Lee");
 assert.equal(rows.names.has("owner-a@example.com"),false);
 assert.equal((await call("/api/pull",{headers:A})).data.firstName,"Sam");
 assert.equal((await call("/api/pull",{headers:{Authorization:"Bearer "+b.data.token}})).data.firstName,"Ada");
 assert.equal((await call("/api/profile/name",{method:"POST",headers:A,body:{name:""}})).data.name,null);
 await call("/api/profile/name",{method:"POST",headers:A,body:{name:"Sam"}});
 await call("/api/user/erase",{method:"POST",body:{},context:ctx("owner-b@example.com")});
 assert.equal(rows.names.has("owner-b@example.com"),false);
});

async function pushHarness(){
 const h=harness();
 const pair=await webcrypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign"]);
 h.env.VAPID_PRIVATE_KEY=JSON.stringify(await webcrypto.subtle.exportKey("jwk",pair.privateKey));
 const{publicKey}=await webcrypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 h.keys={p256dh:Buffer.from(await webcrypto.subtle.exportKey("raw",publicKey)).toString("base64url"),auth:Buffer.alloc(16,1).toString("base64url")};
 return h;
}
test("one failing subscription doesn't stop the others, and is recorded",async()=>{
 const{call,ctx,env,rows,runtime,dispatches,keys}=await pushHarness();
 const save=async(who,endpoint)=>{const d=await call("/api/user/device",{method:"POST",body:{label:who},context:ctx(who)});await call("/api/push/subscribe",{method:"POST",headers:{Authorization:"Bearer "+d.data.token},body:{endpoint,keys,mode:"custom",schedule:plan("2026-11-09T09:00:00Z"),timeZone:"UTC"}});};
 await save("owner-a@example.com","https://web.push.apple.com/broken");
 await save("owner-b@example.com","https://web.push.apple.com/working");
 rows.subs.get("https://web.push.apple.com/broken").schedule="not json";
 await runtime.sendReminders(env,new Date("2026-11-09T09:05:00Z"));
 assert.equal(dispatches.length,1);
 assert.equal(rows.subs.get("https://web.push.apple.com/working").last_schedule_at,"2026-11-09T09:00:00.000Z");
});
test("three notifications due together go out one per run",async()=>{
 const{call,ctx,env,rows,runtime,dispatches,keys}=await pushHarness();
 const d=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const endpoint="https://web.push.apple.com/one";
 await call("/api/push/subscribe",{method:"POST",headers:{Authorization:"Bearer "+d.data.token},body:{endpoint,keys,mode:"custom",schedule:plan("2026-11-09T09:00:00Z"),syncAt:"09:00",stressTimes:["2026-11-09T09:00:00.000Z"],timeZone:"UTC"}});
 rows.subs.get(endpoint).last_used_at="2026-11-01T00:00:00Z";
 const send=at=>runtime.sendReminders(env,new Date(at));
 await send("2026-11-09T09:05:00Z");assert.equal(dispatches.length,1);
 await send("2026-11-09T09:20:00Z");assert.equal(dispatches.length,2);
 await send("2026-11-09T09:35:00Z");assert.equal(dispatches.length,3);
 await send("2026-11-09T09:50:00Z");assert.equal(dispatches.length,3);
});
test("erase leaves only the account and devices, and deleting the account leaves nothing",async()=>{
 const{call,ctx,rows,keys}=await pushHarness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const A={Authorization:"Bearer "+a.data.token},B={Authorization:"Bearer "+b.data.token};
 const fill=async headers=>{
  await call("/api/ingest",{method:"POST",headers,body:{kind:"health",date:"2026-11-04",steps:"5000"}});
  await call("/api/push/subscribe",{method:"POST",headers,body:{endpoint:"https://web.push.apple.com/"+headers.Authorization.slice(-6),keys,mode:"custom",schedule:plan("2026-11-09T09:00:00Z"),timeZone:"UTC"}});
 };
 await fill(A);await fill(B);
 await call("/api/user/erase",{method:"POST",body:{},context:ctx("owner-a@example.com")});
 const owned=(who)=>[...rows.health.values(),...rows.subs.values()].filter(x=>x.owner===who).length;
 assert.equal(owned("owner-a@example.com"),0);
 assert.equal(owned("owner-b@example.com"),2);
 assert.equal((await call("/api/sync/status",{headers:A})).status,200);
 await call("/api/user/account/delete",{method:"POST",body:{},context:ctx("owner-a@example.com")});
 assert.equal([...rows.devices.values()].some(d=>d.owner_email==="owner-a@example.com"),false);
 assert.equal(rows.users.has("owner-a@example.com"),false);
 assert.equal((await call("/api/sync/status",{headers:A})).status,401);
 assert.equal((await call("/api/sync/status",{headers:B})).status,200);
});
test("removing a tester deletes their data and stops their devices, but not an owner's",async()=>{
 const{call,ctx,rows}=harness();
 const a=ctx("owner-a@example.com");
 await call("/api/user/testers",{method:"POST",body:{email:"new@example.com"},context:a});
 const t=await call("/api/user/device",{method:"POST",body:{label:"T"},context:ctx("new@example.com")});
 const T={Authorization:"Bearer "+t.data.token};
 await call("/api/ingest",{method:"POST",headers:T,body:{kind:"health",date:"2026-11-04",steps:"5000"}});
 assert.equal((await call("/api/user/testers/remove",{method:"POST",body:{email:"owner-b@example.com"},context:a})).status,400);
 assert.equal((await call("/api/user/testers/remove",{method:"POST",body:{email:"new@example.com"},context:a})).status,200);
 assert.equal([...rows.health.values()].some(x=>x.owner==="new@example.com"),false);
 assert.equal([...rows.devices.values()].some(d=>d.owner_email==="new@example.com"),false);
 assert.equal((await call("/api/sync/status",{headers:T})).status,401);
});
test("a device can disconnect itself, and long-unused devices stop working",async()=>{
 const{call,ctx,rows}=harness();
 const one=await call("/api/user/device",{method:"POST",body:{label:"1"},context:ctx("owner-a@example.com")});
 const two=await call("/api/user/device",{method:"POST",body:{label:"2"},context:ctx("owner-a@example.com")});
 const One={Authorization:"Bearer "+one.data.token},Two={Authorization:"Bearer "+two.data.token};
 assert.equal((await call("/api/device/disconnect",{method:"POST",headers:One})).status,200);
 assert.equal((await call("/api/sync/status",{headers:One})).status,401);
 const device=[...rows.devices.values()].find(d=>d.device_id===two.data.deviceId);
 assert.equal((await call("/api/sync/status",{headers:Two})).status,200);
 assert.ok(device.last_seen_at);
 device.last_seen_at=new Date(Date.now()-91*86400000).toISOString();
 assert.equal((await call("/api/sync/status",{headers:Two})).status,401);
 assert.ok(device.revoked_at);
});

test("one calendar's saved events can be removed, for that owner and calendar only",async()=>{
 const{call,ctx,rows}=harness();
 const a=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const b=await call("/api/user/device",{method:"POST",body:{label:"B"},context:ctx("owner-b@example.com")});
 const A={Authorization:"Bearer "+a.data.token},B={Authorization:"Bearer "+b.data.token};
 const event=(calendar,hour)=>[`2026-11-04T${hour}:00:00-08:00`,`2026-11-04T${hour}:30:00-08:00`,calendar,calendar+" event"];
 const send=headers=>call("/api/ingest",{method:"POST",headers,body:days("2026-11-04",[event("Work","09"),event("Home","10")])});
 await send(A);await send(B);
 const off=await call("/api/calendars",{method:"POST",headers:A,body:{name:"Work",enabled:false}});
 assert.equal(off.data.savedEvents,1);
 assert.equal((await call("/api/calendars/events/delete",{method:"POST",body:{name:"Work"}})).status,401);
 assert.equal((await call("/api/calendars/events/delete",{method:"POST",headers:A,body:{name:"Work"}})).data.removed,1);
 const left=[...rows.events.values()];
 assert.equal(left.filter(e=>e.owner==="owner-a@example.com").length,1);
 assert.equal(left.filter(e=>e.owner==="owner-b@example.com").length,2);
});

test("a dated plan sends each time once, keeps its kind, and repeats weekly once it runs out",async()=>{
 const{call,ctx,env,rows,runtime,dispatches,keys}=await pushHarness();
 const d=await call("/api/user/device",{method:"POST",body:{label:"A"},context:ctx("owner-a@example.com")});
 const endpoint="https://web.push.apple.com/dated",headers={Authorization:"Bearer "+d.data.token};
 const schedule=[{at:"2026-11-09T09:47:00Z",kind:"custom"},{at:"2026-11-09T22:10:00Z",kind:"bedtime"},{at:"nonsense",kind:"custom"},{at:"2026-11-09T23:00:00Z",kind:"banana"}];
 await call("/api/push/subscribe",{method:"POST",headers,body:{endpoint,keys,mode:"smart",schedule,timeZone:"UTC"}});
 assert.equal(JSON.parse(rows.subs.get(endpoint).schedule).length,2);
 const send=at=>runtime.sendReminders(env,new Date(at));
 await send("2026-11-09T09:45:00Z");assert.equal(dispatches.length,0);
 await send("2026-11-09T09:50:00Z");assert.equal(dispatches.length,1);
 await send("2026-11-09T09:55:00Z");assert.equal(dispatches.length,1);
 await send("2026-11-10T22:10:00Z");assert.equal(dispatches.length,1);
 await send("2026-11-16T09:50:00Z");assert.equal(dispatches.length,2);
 const{dueScheduled}=runtime;
 assert.equal(dueScheduled(schedule.slice(0,2),Date.parse("2026-11-09T22:12:00Z"),0).kind,"bedtime");
});

test("one session request carries the status, release, calendars and choices, and last upload counts one run",async()=>{
 const{call,ctx}=harness(),owner=ctx("owner-a@example.com");
 const device=await call("/api/user/device",{method:"POST",context:owner,body:{label:"iPhone"}});
 const A={Authorization:"Bearer "+device.data.token};
 assert.equal((await call("/api/session")).status,401);
 await call("/api/ingest",{method:"POST",headers:A,body:{kind:"health",shortcutVersion:"3.0.0",date:"2026-11-01",steps:100}});
 let session=await call("/api/session",{headers:A});
 assert.equal(session.status,200);
 assert.equal(session.data.status.deviceId,device.data.deviceId);
 assert.equal(session.data.status.lastUpload.health,1);
 assert.deepEqual(session.data.calendars,[]);
 assert.ok(Object.keys(session.data.settings).length>0);
 assert.deepEqual([...session.data.moods.moods],[]);
 await call("/api/user/erase",{method:"POST",body:{},context:ctx("owner-a@example.com")});
 session=await call("/api/session",{headers:A});
 assert.equal(session.data.status.lastUpload,null);
 await call("/api/user/revoke",{method:"POST",context:owner,body:{deviceId:device.data.deviceId}});
 assert.equal((await call("/api/session",{headers:A})).status,401);
});

test("over the limit, invitations and uploads are refused with a code, and every error has one",async()=>{
 const{call,ctx,env}=harness(),owner=ctx("owner-a@example.com"),refuse={async limit(){return{success:false};}};
 const origin={Origin:"https://even.bishvili.org"};
 const device=await call("/api/user/device",{method:"POST",context:owner,headers:origin,body:{label:"iPhone"}});
 env.INVITE_LIMIT=refuse;env.DEVICE_LIMIT=refuse;
 const invite=await call("/api/user/testers",{method:"POST",context:owner,headers:origin,body:{email:"new@example.com"}});
 assert.equal(invite.status,429);
 assert.equal(invite.data.code,"rate_limited");
 const upload=await call("/api/ingest",{method:"POST",headers:{Authorization:"Bearer "+device.data.token},body:{kind:"health",date:"2026-11-01",steps:100}});
 assert.equal(upload.status,429);
 assert.equal(upload.data.code,"rate_limited");
 assert.doesNotMatch(require("node:fs").readFileSync("worker/index.js","utf8"),/\berror\("[^"]*",\d+\)/);
});
test("the public address is configured once, and owner emails match in any case",async()=>{
 assert.doesNotMatch(require("node:fs").readFileSync("worker/index.js","utf8"),/bishvili\.workers\.dev/);
 assert.doesNotMatch(require("node:fs").readFileSync("invites.js","utf8"),/bishvili\.workers\.dev/);
 assert.match(require("node:fs").readFileSync("wrangler.jsonc","utf8"),/"PUBLIC_ORIGIN": "https:\/\/health\.bishvili\.org"/);
 const{call,ctx,env}=harness();
 env.APPROVED_SYNC_EMAILS=JSON.stringify(["Mixed.Case@Example.com"]);
 assert.equal((await call("/api/user/me",{context:ctx("mixed.case@example.com")})).status,200);
});

test("sign-in answers the same for any email, only opens its own routes, and a cookie proves nothing alone",async()=>{
 const{call}=harness();
 const send=email=>call("/api/signin/email-otp/send-verification-otp",{method:"POST",body:{email,type:"sign-in"}});
 const stranger=await send("stranger@example.com");
 assert.equal(stranger.status,200);
 assert.equal(stranger.data.success,true);
 assert.equal((await send("not an email")).status,400);
 assert.equal((await call("/api/signin/sign-up/email",{method:"POST",body:{}})).status,404);
 assert.equal((await call("/api/signin/options")).data.google,false);
 assert.equal((await call("/api/user/me")).status,401);
 assert.equal((await call("/api/user/me",{headers:{"X-Email":"owner-a@example.com"}})).status,401);
});

test("files come with the security headers, and the root serves the app",async()=>{
 const{env,runtime}=harness();
 const open=path=>runtime.__worker.fetch(new Request("https://even.example"+path),env,{});
 env.STATIC={async fetch(request){const path=new URL(request.url).pathname;return path==="/index.html"||path==="/sw.js"?new Response("ok",{headers:{"Content-Type":"text/html"}}):new Response("missing",{status:404});}};
 const root=await open("/"),page=await root.text();
 assert.equal(page,"ok");
 assert.match(root.headers.get("Content-Security-Policy"),/default-src/);
 assert.match(root.headers.get("Cache-Control"),/no-cache/);
 assert.equal((await open("/sw.js")).headers.get("Service-Worker-Allowed"),"/");
 const missing=await open("/AGENTS.md");
 assert.equal(missing.status,404);
 assert.match(missing.headers.get("Content-Security-Policy"),/default-src/);
});

test("logs carry only named fields, and a failed request logs without changing its answer",async()=>{
 const{runtime,env}=harness(),lines=[];
 runtime.console={log:line=>lines.push(line)};
 runtime.logEvent("x",{route:"/a",error:"TypeError",email:"person@example.com",title:"Private",token:"secret",body:"text"});
 assert.deepEqual(JSON.parse(lines[0]),{event:"x",route:"/a",error:"TypeError"});
 env.STATIC={fetch(){throw new TypeError("boom person@example.com");}};
 const failed=await runtime.__worker.fetch(new Request("https://even.example/"),env,{});
 assert.equal(failed.status,500);
 assert.deepEqual(JSON.parse(lines[1]),{event:"request_failed",route:"/",status:500,error:"TypeError"});
});
