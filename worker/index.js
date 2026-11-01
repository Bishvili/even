// Rage Tracker 1.3: Cloudflare Access passwordless login and owner-scoped device sync.
// All server tokens are generated randomly, stored only as SHA-256 hashes, and revocable.
// Only /api/auth/* is protected by Cloudflare Access. All other routes reject
// unauthenticated sync operations unless a valid, unrevoked device token is supplied.
const ACCESS_AUD="b15746656eee885f25c4f4b0605491289c01776b8710cc8339fb507f4574f745";
function approved(env,email){try{return JSON.parse(env.APPROVED_SYNC_EMAILS||"[]").includes(email);}catch(e){return false;}}
const MIME={"index.html":"text/html; charset=utf-8","styles.css":"text/css; charset=utf-8","app.js":"text/javascript; charset=utf-8","sw.js":"text/javascript; charset=utf-8","manifest.webmanifest":"application/manifest+json","icon.svg":"image/svg+xml","icon-192.png":"image/png","icon-512.png":"image/png","source.zip":"application/zip","shortcut.cherri":"text/plain; charset=utf-8"};
const SECURITY={"X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"};
const METRICS={sleepHours:[0,24],steps:[0,100000],hrv:[0,500],restingHR:[20,250],workoutMin:[0,1440]};
const CATS=["Meeting","Work","Exercise","Social","Family","Rest","Commute","Other"];
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{...SECURITY,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function error(message,status=400){return reply({ok:false,error:message},status);}
async function digest(text){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");}
function secureRandomHex(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");}
async function payload(request){
 const size=Number(request.headers.get("content-length")||"0");if(size>100000)throw Error("Request too large");
 const type=request.headers.get("content-type")||"";
 if(type.includes("multipart/form-data")){const form=await request.formData();return Object.fromEntries(Array.from(form.entries()).map(([key,value])=>[key,typeof value==="string"?value:""]));}
 const text=await request.text();if(text.length>100000)throw Error("Request too large");
 if(type.includes("application/json"))return JSON.parse(text);
 if(type.includes("application/x-www-form-urlencoded"))return Object.fromEntries(new URLSearchParams(text));
 try{return JSON.parse(text);}catch(e){return Object.fromEntries(new URLSearchParams(text));}
}
async function authIdentity(request,env,ctx){
 // Only Cloudflare's validated Access runtime identity counts. Never trust headers.
 if(!ctx?.access||ctx.access.aud!==ACCESS_AUD)return null;
 try{
  const identity=await ctx.access.getIdentity();
  const email=String(identity?.email||"").trim().toLowerCase();
  return approved(env,email)?email:null;
 }catch(e){return null;}
}
function browserPostAllowed(request){
 const u=new URL(request.url),origin=request.headers.get("origin");
 return request.method==="POST"&&origin===u.origin&&
  (request.headers.get("content-type")||"").toLowerCase().includes("application/json");
}
async function validDevice(request,env){
 const auth=request.headers.get("authorization")||"",match=/^Bearer ([a-f0-9]{64})$/i.exec(auth);
 if(!match)return null;
 const tokenHash=await digest(match[1].toLowerCase());
 const device=await env.DB.prepare("SELECT device_id,owner_email,revoked_at FROM rt_devices WHERE token_hash=?").bind(tokenHash).first();
 if(!device||device.revoked_at||!approved(env,device.owner_email))return null;
 return {id:device.device_id,owner:device.owner_email};
}
function dateOnly(value){
 const day=String(value||"").trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const parsed=new Date(day+"T12:00:00Z");
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===day?day:null;
}
function readHealth(x){
 if(!x||typeof x!=="object")return [];
 const day=dateOnly(x.date||x.day);if(!day)return [];
 const results=[];for(const [metric,[low,high]] of Object.entries(METRICS)){
  const raw=x[metric];if(raw===undefined||raw===null||raw==="")continue;
  const value=Number(raw);
  if(Number.isFinite(value)&&value>=low&&value<=high)results.push({day,metric,value});
 }
 return results;
}
function readEvent(x){
 if(!x||typeof x!=="object")return null;
 const start=new Date(x.start||x.start_time),end=new Date(x.end||x.end_time);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>172800000)return null;
 return {start:start.toISOString(),end:end.toISOString(),title:String(x.title||"Calendar event").trim().slice(0,100)||"Calendar event",category:CATS.includes(x.category)?x.category:"Other"};
}
async function authApi(request,env,ctx,path){
 const email=await authIdentity(request,env,ctx);
 if(!email)return error("An approved Cloudflare Access login is required",401);
 if(path==="/api/auth/start"&&request.method==="GET"){
  const url=new URL(request.url);
  return new Response(null,{status:303,headers:{...SECURITY,"Cache-Control":"no-store","Location":url.origin+"/?auth=ready#sync"}});
 }
 if(path==="/api/auth/me"&&request.method==="GET"){
  const r=await env.DB.prepare("SELECT device_id,label,created_at,last_used_at,revoked_at FROM rt_devices WHERE owner_email=? ORDER BY created_at DESC LIMIT 30").bind(email).all();
  return reply({ok:true,email,devices:(r.results||[]).map(d=>({id:d.device_id,label:d.label,createdAt:d.created_at,lastUsedAt:d.last_used_at,revoked:!!d.revoked_at}))});
 }
 if(path==="/api/auth/device"){
  if(!browserPostAllowed(request))return error("Same-origin JSON POST required",403);
  let input;try{input=await payload(request);}catch(e){return error("Invalid device request",400);}
  const label=String(input.label||"iPhone").trim().replace(/[\x00-\x1f]/g,"").slice(0,64)||"iPhone";
  const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM rt_devices WHERE owner_email=? AND revoked_at IS NULL").bind(email).first();
  if(Number(count?.count||0)>=10)return error("Ten active devices maximum; revoke one first",429);
  const token=secureRandomHex(),deviceId=crypto.randomUUID(),at=new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO rt_users(email,created_at) VALUES(?,?)").bind(email,at).run();
  await env.DB.prepare("INSERT INTO rt_devices(token_hash,device_id,owner_email,label,created_at) VALUES(?,?,?,?,?)").bind(await digest(token),deviceId,email,label,at).run();
  return reply({ok:true,email,token,deviceId,label,createdAt:at});
 }
 if(path==="/api/auth/revoke"){
  if(!browserPostAllowed(request))return error("Same-origin JSON POST required",403);
  let input;try{input=await payload(request);}catch(e){return error("Invalid request");}
  const deviceId=String(input.deviceId||"");
  if(!/^[\w-]{12,80}$/.test(deviceId))return error("Invalid device identifier");
  const result=await env.DB.prepare("UPDATE rt_devices SET revoked_at=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(new Date().toISOString(),deviceId,email).run();
  return reply({ok:true,revoked:!!result.meta?.changes});
 }
 return error("Not found",404);
}
async function syncApi(request,env,path){
 if(path==="/api/pair")return error("The old shared pairing code was retired. Sign in through Email login.",410);
 const dev=await validDevice(request,env);
 if(!dev)return error("A valid non-revoked device key is required",401);
 const owner=dev.owner;
 if(path==="/api/profile"&&request.method==="GET")return reply({ok:true,email:owner,deviceId:dev.id});
 if(path==="/api/pull"&&request.method==="GET"){
  const [health,events]=await Promise.all([
   env.DB.prepare("SELECT day,metric,value FROM rt_health_metrics WHERE owner_email=? ORDER BY day DESC LIMIT 3000").bind(owner).all(),
   env.DB.prepare("SELECT event_id,start_time,end_time,title,category FROM rt_calendar_events WHERE owner_email=? ORDER BY start_time DESC LIMIT 1200").bind(owner).all()
  ]);
  const grouped={};for(const h of health.results||[]){
   if(!grouped[h.day])grouped[h.day]={date:h.day,source:"shortcut"};
   grouped[h.day][h.metric]=h.value;
  }
  return reply({ok:true,email:owner,health:Object.values(grouped),events:(events.results||[]).map(e=>({id:e.event_id,start:e.start_time,end:e.end_time,title:e.title,category:e.category,source:"shortcut"})),syncAt:new Date().toISOString()});
 }
 if(path==="/api/ingest"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid or oversized data");}
  if(!input||typeof input!=="object")return error("Invalid data");
  const kind=String(input.kind||"").toLowerCase();
  // A single batch allows one Shortcut to transmit both selected Health and Calendar records.
  if(!["health","calendar","batch"].includes(kind))return error("Use kind=health, calendar or batch");
  const healthInput=kind==="batch"?(Array.isArray(input.health)?input.health.slice(0,75):[]):kind==="health"?(Array.isArray(input.days)?input.days.slice(0,75):[input]):[];
  const eventInput=kind==="batch"?(Array.isArray(input.events)?input.events.slice(0,125):[]):kind==="calendar"?(Array.isArray(input.events)?input.events.slice(0,125):[input]):[];
  const metrics=healthInput.flatMap(readHealth);
  const events=eventInput.map(readEvent).filter(Boolean);
  if(!metrics.length&&!events.length)return error("No valid Health or Calendar records");
  const at=new Date().toISOString(),statements=[];
  metrics.forEach(x=>statements.push(env.DB.prepare("INSERT INTO rt_health_metrics(owner_email,day,metric,value,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,day,metric) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(owner,x.day,x.metric,x.value,at)));
  for(const e of events){
   const eventId=(await digest(e.start+"|"+e.end+"|"+e.title)).slice(0,40);
   statements.push(env.DB.prepare("INSERT INTO rt_calendar_events(owner_email,event_id,start_time,end_time,title,category,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_email,event_id) DO UPDATE SET title=excluded.title,category=excluded.category,updated_at=excluded.updated_at").bind(owner,eventId,e.start,e.end,e.title,e.category,at));
  }
  for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
  await env.DB.prepare("UPDATE rt_devices SET last_used_at=? WHERE device_id=? AND owner_email=?").bind(at,dev.id,owner).run();
  return reply({ok:true,kind,healthMetrics:metrics.length,calendarEvents:events.length});
 }
 if(path==="/api/erase"&&request.method==="POST"){
  await env.DB.batch([
   env.DB.prepare("DELETE FROM rt_health_metrics WHERE owner_email=?").bind(owner),
   env.DB.prepare("DELETE FROM rt_calendar_events WHERE owner_email=?").bind(owner)
  ]);
  return reply({ok:true,erased:true,email:owner});
 }
 return error("Not found",404);
}
async function api(request,env,ctx,path){
 if(path==="/api/status"&&request.method==="GET")return reply({ok:true,app:"Rage Tracker",version:"1.4.0",sync:"email-access"});
 if(path.startsWith("/api/auth/"))return authApi(request,env,ctx,path);
 return syncApi(request,env,path);
}

async function asset(path,env){
 const key=path==="/"?"index.html":path.slice(1);
 if(!Object.prototype.hasOwnProperty.call(MIME,key))return new Response("Not found",{status:404,headers:SECURITY});
 const val=await env.ASSETS.get("asset:"+key);if(val===null)return new Response("Asset unavailable",{status:503,headers:SECURITY});
 const data=(key.endsWith(".png")||key.endsWith(".zip"))?Uint8Array.from(atob(val),x=>x.charCodeAt(0)):val;
 const headers={...SECURITY,"Content-Type":MIME[key],"Cache-Control":"no-cache, max-age=0, must-revalidate"};
 if(key==="sw.js")headers["Service-Worker-Allowed"]="/";if(key==="source.zip")headers["Content-Disposition"]="attachment; filename=\"rage-tracker-source.zip\"";
 return new Response(data,{headers});
}
export default {async fetch(request,env,ctx){
 try{const path=new URL(request.url).pathname;if(path.startsWith("/api/"))return await api(request,env,ctx,path);
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405,headers:SECURITY});
 return await asset(path,env);
 }catch(e){return error("Request could not be processed",500);}
}};