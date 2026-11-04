// Even: Cloudflare Access passwordless login and owner-scoped device sync.
// All server tokens are generated randomly, stored only as SHA-256 hashes, and revocable.
// Only /api/auth/* is protected by Cloudflare Access. All other routes reject
// unauthenticated sync operations unless a valid, unrevoked device token is supplied.
const ACCESS_AUD="b15746656eee885f25c4f4b0605491289c01776b8710cc8339fb507f4574f745";
const ICLOUD_SHORTCUT=/^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/i;
async function canRelease(env,email){return !!await env.DB.prepare("SELECT 1 AS allowed FROM even_release_emails WHERE email=?").bind(email).first();}
function approved(env,email){try{return JSON.parse(env.APPROVED_SYNC_EMAILS||"[]").includes(email);}catch(e){return false;}}
const MIME={"index.html":"text/html; charset=utf-8","styles.css":"text/css; charset=utf-8","app.js":"text/javascript; charset=utf-8","reminders.js":"text/javascript; charset=utf-8","coach.js":"text/javascript; charset=utf-8","refresh.js":"text/javascript; charset=utf-8","sw.js":"text/javascript; charset=utf-8","manifest.webmanifest":"application/manifest+json","icon.svg":"image/svg+xml","icon-192.png":"image/png","icon-512.png":"image/png"};
const SECURITY={"X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"};
const METRICS={sleepHours:[0,24],steps:[0,100000],hrv:[0,500],restingHR:[20,250],heartRate:[20,250],workoutMin:[0,1440]};
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
 const device=await env.DB.prepare("SELECT device_id,owner_email,revoked_at FROM even_devices WHERE token_hash=?").bind(tokenHash).first();
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
 const results=[],bedtime=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(x.bedtime||""));
 if(bedtime)results.push({day,metric:"bedtimeMin",value:Number(bedtime[1])*60+Number(bedtime[2])});
 for(const [metric,[low,high]] of Object.entries(METRICS)){
  const raw=x[metric];if(raw===undefined||raw===null||raw==="")continue;
  const value=Number(raw);
  if(Number.isFinite(value)&&value>=low&&value<=high)results.push({day,metric,value});
 }
 return results;
}
function classifyCalendarTitle(title){
 if(/\b(meeting|call|standup|stand-up)\b/i.test(title))return "Meeting";
 if(/\b(workout|gym|run|running|training)\b/i.test(title))return "Exercise";
 if(/\b(coffee|lunch|dinner|brunch)\b/i.test(title))return "Social";
 if(/\b(commute|travel to work)\b/i.test(title))return "Commute";
 return "Other";
}
function readEvent(x){
 if(!x||typeof x!=="object")return null;
 const start=new Date(x.start||x.start_time),end=new Date(x.end||x.end_time);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>172800000)return null;
 const title=String(x.title||"Calendar event").trim().slice(0,100)||"Calendar event";
 const category=CATS.includes(x.category)?x.category:classifyCalendarTitle(title);
 return {start:start.toISOString(),end:end.toISOString(),title,category,calendar:String(x.calendar||"").trim().slice(0,100)||null};
}
async function authApi(request,env,ctx,path){
 const email=await authIdentity(request,env,ctx);
 if(!email)return error("An approved Cloudflare Access login is required",401);
 if(path==="/api/auth/start"&&request.method==="GET"){
  const url=new URL(request.url);
  return new Response(null,{status:303,headers:{...SECURITY,"Cache-Control":"no-store","Location":url.origin+"/?auth=ready#sync"}});
 }
 if(path==="/api/auth/me"&&request.method==="GET"){
  const r=await env.DB.prepare("SELECT device_id,label,created_at,last_used_at,last_attempt_at,last_error_code,shortcut_version,revoked_at FROM even_devices WHERE owner_email=? ORDER BY created_at DESC LIMIT 30").bind(email).all();
  const welcome=await env.DB.prepare("SELECT display_name FROM even_release_emails WHERE email=? AND display_name IS NOT NULL AND welcomed_at IS NULL").bind(email).first();
  return reply({ok:true,email,canRelease:await canRelease(env,email),welcomeName:welcome?.display_name||null,devices:(r.results||[]).map(d=>({id:d.device_id,label:d.label,createdAt:d.created_at,lastUsedAt:d.last_used_at,lastAttemptAt:d.last_attempt_at,lastErrorCode:d.last_error_code,shortcutVersion:d.shortcut_version,revoked:!!d.revoked_at}))});
 }
 if(path==="/api/auth/device"){
  if(!browserPostAllowed(request))return error("Same-origin JSON POST required",403);
  let input;try{input=await payload(request);}catch(e){return error("Invalid device request",400);}
  const label=String(input.label||"iPhone").trim().replace(/[\x00-\x1f]/g,"").slice(0,64)||"iPhone";
  const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM even_devices WHERE owner_email=? AND revoked_at IS NULL").bind(email).first();
  if(Number(count?.count||0)>=10)return error("Ten active devices maximum; revoke one first",429);
  const token=secureRandomHex(),deviceId=crypto.randomUUID(),at=new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO even_users(email,created_at) VALUES(?,?)").bind(email,at).run();
  await env.DB.prepare("INSERT INTO even_devices(token_hash,device_id,owner_email,label,created_at) VALUES(?,?,?,?,?)").bind(await digest(token),deviceId,email,label,at).run();
  return reply({ok:true,email,token,deviceId,label,createdAt:at});
 }
 if(path==="/api/auth/welcomed"){
  if(!browserPostAllowed(request))return error("Same-origin JSON POST required",403);
  await env.DB.prepare("UPDATE even_release_emails SET welcomed_at=? WHERE email=? AND welcomed_at IS NULL").bind(new Date().toISOString(),email).run();
  return reply({ok:true});
 }
 if(path==="/api/auth/revoke"){
  if(!browserPostAllowed(request))return error("Same-origin JSON POST required",403);
  let input;try{input=await payload(request);}catch(e){return error("Invalid request");}
  const deviceId=String(input.deviceId||"");
  if(!/^[\w-]{12,80}$/.test(deviceId))return error("Invalid device identifier");
  const result=await env.DB.prepare("UPDATE even_devices SET revoked_at=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(new Date().toISOString(),deviceId,email).run();
  return reply({ok:true,revoked:!!result.meta?.changes});
 }
 return error("Not found",404);
}
function cleanShortcutRelease(value){
 if(!value||typeof value!=="object")return null;
 const version=String(value.version||"").trim();
 const url=String(value.url||"").trim();
 if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version))return null;
 if(!ICLOUD_SHORTCUT.test(url))return null;
 return {version,url,publishedAt:String(value.publishedAt||"").slice(0,30),notes:String(value.notes||"").slice(0,180),verified:value.verified===true};
}
async function loadShortcutRelease(env){
 const raw=await env.ASSETS.get("config:shortcut:latest");
 if(!raw)return null;
 try{return cleanShortcutRelease(JSON.parse(raw));}catch(e){return null;}
}
async function recordSyncFailure(env,dev,code){
 const allowed=new Set(["invalid_body","invalid_kind","no_valid_records"]);
 if(!allowed.has(code))return;
 await env.DB.prepare("UPDATE even_devices SET last_attempt_at=?,last_error_code=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL")
  .bind(new Date().toISOString(),code,dev.id,dev.owner).run();
}

function semverNewer(latest,installed){
 if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(latest)||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(installed))return false;
 const a=latest.split(".").map(Number),b=installed.split(".").map(Number);
 for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];
 return false;
}
const NO_VALID_RECORDS="No valid records. Check date, metric values, and event start/end formats";
// Remembers each calendar it sees, then drops events from calendars the owner turned off.
async function enabledEvents(env,owner,events){
 const names=[...new Set(events.map(e=>e.calendar).filter(Boolean))];
 if(!names.length)return events;
 await env.DB.batch(names.map(name=>env.DB.prepare("INSERT OR IGNORE INTO even_calendars(owner_email,name) VALUES(?,?)").bind(owner,name)));
 const off=await env.DB.prepare("SELECT name FROM even_calendars WHERE owner_email=? AND enabled=0").bind(owner).all();
 const disabled=new Set((off.results||[]).map(c=>c.name));
 return events.filter(e=>!disabled.has(e.calendar));
}
const PUSH_HOST=/^(?:[\w-]+\.)*push\.apple\.com$|^fcm\.googleapis\.com$|^updates\.push\.services\.mozilla\.com$|^[\w.-]+\.notify\.windows\.com$/;
const REMIND_AT=/^([01]\d|2[0-3]):[0-5]\d$/;
function pushKey(env){try{const key=JSON.parse(env.VAPID_PRIVATE_KEY||"");return key.d&&key.x&&key.y?key:null;}catch(e){return null;}}
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function fromBase64url(text){return Uint8Array.from(atob(text.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));}
function pushPublicKey(key){return base64url([4,...fromBase64url(key.x),...fromBase64url(key.y)]);}
function pushEndpoint(value){try{const url=new URL(String(value||""));return url.protocol==="https:"&&PUSH_HOST.test(url.hostname)&&url.href.length<=500?url.href:null;}catch(e){return null;}}
function localTime(timeZone,now){
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).formatToParts(now).map(p=>[p.type,p.value]));
 return{day:`${parts.year}-${parts.month}-${parts.day}`,minutes:Number(parts.hour)*60+Number(parts.minute)};
}
// RFC 8291 message encryption. Only the push recipient can read the payload.
async function hkdf(salt,ikm,info,length){
 const key=await crypto.subtle.importKey("raw",ikm,"HKDF",false,["deriveBits"]);
 return new Uint8Array(await crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt,info},key,length*8));
}
function concat(...parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
async function encryptPush(text,p256dh,auth){
 const encoder=new TextEncoder(),receiver=fromBase64url(p256dh);
 const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const sender=new Uint8Array(await crypto.subtle.exportKey("raw",pair.publicKey));
 const peer=await crypto.subtle.importKey("raw",receiver,{name:"ECDH",namedCurve:"P-256"},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:peer},pair.privateKey,256));
 const ikm=await hkdf(fromBase64url(auth),shared,concat(encoder.encode("WebPush: info\0"),receiver,sender),32);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const cek=await hkdf(salt,ikm,encoder.encode("Content-Encoding: aes128gcm\0"),16);
 const nonce=await hkdf(salt,ikm,encoder.encode("Content-Encoding: nonce\0"),12);
 const aes=await crypto.subtle.importKey("raw",cek,"AES-GCM",false,["encrypt"]);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},aes,concat(encoder.encode(text),new Uint8Array([2]))));
 return concat(salt,new Uint8Array([0,0,16,0,sender.length]),sender,cipher);
}
function pushPayload(body,path,extra={}){
 return JSON.stringify({web_push:8030,mutable:true,...extra,notification:{title:"Even",body,navigate:"https://even.bishvili.workers.dev"+path}});
}
function reminderMessage(minutes,atBedtime){
 if(atBedtime)return "Bedtime soon. Take a moment to check in, then rest.";
 if(minutes<660)return "Good morning. How are you starting the day?";
 if(minutes<840)return "How is your day going so far?";
 if(minutes<1020)return "Afternoon check-in. How is your energy?";
 return "How did today go?";
}
async function sendPush(key,sub,now,payload){
 const encoder=new TextEncoder(),text=value=>base64url(encoder.encode(JSON.stringify(value)));
 const unsigned=text({typ:"JWT",alg:"ES256"})+"."+text({aud:new URL(sub.endpoint).origin,exp:Math.floor(now.getTime()/1000)+43200,sub:"https://even.bishvili.workers.dev"});
 const signingKey=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",d:key.d,x:key.x,y:key.y},{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const signature=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},signingKey,encoder.encode(unsigned)));
 return fetch(sub.endpoint,{method:"POST",body:await encryptPush(payload,sub.p256dh,sub.auth),headers:{"Authorization":`vapid t=${unsigned}.${base64url(signature)}, k=${pushPublicKey(key)}`,"Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream","TTL":"3600","Urgency":"high"}});
}
async function deliverPush(env,key,sub,now,payload){
 const sent=await sendPush(key,sub,now,payload);const endpoint=sub.endpoint;
 if(sent.status===404||sent.status===410)await env.DB.prepare("DELETE FROM even_push_subscriptions WHERE endpoint=?").bind(endpoint).run();
 else await env.DB.prepare("UPDATE even_push_subscriptions SET last_push_status=? WHERE endpoint=?").bind(sent.status,endpoint).run();
 return sent;
}
const SMART_QUIET_MS=5400000;
function dueTarget(times,minutes){
 const targets=times.map(t=>{const[h,m]=t.split(":").map(Number);return h*60+m;}).filter(t=>t<=minutes&&minutes-t<60);
 return targets.length?Math.max(...targets):null;
}
async function sendReminders(env,now=new Date()){
 const key=pushKey(env);if(!key)return;
 const subs=await env.DB.prepare("SELECT s.endpoint,s.p256dh,s.auth,s.mode,s.times,s.bedtime_at,s.time_zone,s.last_sent_day,s.last_sent_target,s.last_check_in_at FROM even_push_subscriptions s JOIN even_devices d ON d.device_id=s.device_id WHERE d.revoked_at IS NULL AND s.p256dh IS NOT NULL AND s.times IS NOT NULL").bind().all();
 for(const sub of subs.results||[]){
  const local=localTime(sub.time_zone,now),target=dueTarget(JSON.parse(sub.times),local.minutes);
  if(target===null||(sub.last_sent_day===local.day&&sub.last_sent_target>=target))continue;
  // A smart reminder isn't needed right after a check-in.
  const quiet=sub.mode==="smart"&&sub.last_check_in_at&&now.getTime()-new Date(sub.last_check_in_at).getTime()<SMART_QUIET_MS;
  const [hour,minute]=(sub.bedtime_at||"99:99").split(":").map(Number);
  const smart=sub.mode==="smart",body=smart?reminderMessage(target,hour*60+minute===target):"How are you feeling?";
  const sent=quiet?{ok:true}:await deliverPush(env,key,sub,now,pushPayload(body,"/#checkin",{brief:smart&&target<660}));
  if(sent.ok)await env.DB.prepare("UPDATE even_push_subscriptions SET last_sent_day=?,last_sent_target=? WHERE endpoint=?").bind(local.day,target,sub.endpoint).run();
 }
}
const BUILDS="https://github.com/Bishvili/even/releases/download/shortcut-latest/";
async function latestBuildVersion(){
 const file=await fetch(BUILDS+"Even-Sync-version.txt");
 if(!file.ok)return null;
 const version=(await file.text()).trim();
 return /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version)?version:null;
}
// Published versions can't be edited, so a link only passes if it names Even Sync.
async function linkIsEvenSync(link){
 try{
  const record=await fetch("https://www.icloud.com/shortcuts/api/records/"+link.split("/").pop());
  return record.ok&&(await record.json())?.fields?.name?.value==="Even Sync";
 }catch(e){return false;}
}
async function syncApi(request,env,path){
 const dev=await validDevice(request,env);
 if(!dev)return error("A valid non-revoked device key is required",401);
 const owner=dev.owner;
 if(path==="/api/shortcut/release-state"&&request.method==="GET"){
  if(!await canRelease(env,owner))return error("This account can't publish releases",403);
  const latest=await latestBuildVersion();
  if(!latest)return error("The latest build couldn't be checked",502);
  const device=await env.DB.prepare("SELECT shortcut_version FROM even_devices WHERE device_id=? AND owner_email=?").bind(dev.id,owner).first();
  const published=(await loadShortcutRelease(env))?.version||null,installed=device?.shortcut_version||null;
  return reply({ok:true,state:installed!==latest?"install":published!==latest?"publish":"current",latest,installed,published});
 }
 if(path==="/api/shortcut/publish"&&request.method==="POST"){
  if(!await canRelease(env,owner))return error("This account can't publish releases",403);
  let input;try{input=await payload(request);}catch(e){return error("Invalid release request");}
  const link=String(input?.link||"").trim();
  if(!ICLOUD_SHORTCUT.test(link))return error("A valid Shortcut link is required");
  if(!await linkIsEvenSync(link))return error("That link isn't Even Sync, so nothing was published.");
  const started=await fetch("https://api.github.com/repos/Bishvili/even/actions/workflows/routinehub-publish.yml/dispatches",{method:"POST",headers:{"Authorization":"Bearer "+env.GITHUB_API_KEY,"Accept":"application/vnd.github+json","Content-Type":"application/json","User-Agent":"even","X-GitHub-Api-Version":"2022-11-28"},body:JSON.stringify({ref:"main",inputs:{icloud_link:link}})});
  return started.status===204?reply({ok:true}):error("Publishing couldn't start",502);
 }
 if(path==="/api/push/key"&&request.method==="GET"){const key=pushKey(env);return reply({ok:true,key:key?pushPublicKey(key):null});}
 if(path==="/api/push/subscribe"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid reminder request");}
  const endpoint=pushEndpoint(input?.endpoint),mode=input?.mode,times=input?.times,timeZone=String(input?.timeZone||"");
  const p256dh=String(input?.keys?.p256dh||""),auth=String(input?.keys?.auth||"");
  try{if(fromBase64url(p256dh).length!==65||fromBase64url(auth).length!==16)return error("Invalid reminder request");}catch(e){return error("Invalid reminder request");}
  if(!endpoint||!["smart","custom"].includes(mode)||!Array.isArray(times)||!times.length||times.length>24||!times.every(t=>REMIND_AT.test(String(t))))return error("Invalid reminder request");
  const bedtimeAt=mode==="smart"&&REMIND_AT.test(String(input?.bedtimeAt||""))?String(input.bedtimeAt):null;
  const schedule=JSON.stringify([...new Set(times.map(String))].sort());
  try{localTime(timeZone,new Date());}catch(e){return error("Invalid reminder request");}
  await env.DB.prepare("INSERT INTO even_push_subscriptions(endpoint,owner_email,device_id,mode,times,time_zone,created_at,p256dh,auth,bedtime_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET bedtime_at=excluded.bedtime_at,p256dh=excluded.p256dh,auth=excluded.auth,owner_email=excluded.owner_email,device_id=excluded.device_id,mode=excluded.mode,times=excluded.times,time_zone=excluded.time_zone").bind(endpoint,owner,dev.id,mode,schedule,timeZone,new Date().toISOString(),p256dh,auth,bedtimeAt).run();
  return reply({ok:true});
 }
 if(path==="/api/push/synced"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid request");}
  const items=Number(input?.items),key=pushKey(env);
  const sub=key&&await env.DB.prepare("SELECT endpoint,p256dh,auth FROM even_push_subscriptions WHERE device_id=? AND owner_email=? AND p256dh IS NOT NULL").bind(dev.id,owner).first();
  if(!sub||!Number.isInteger(items)||items<0)return reply({ok:true,state:"none"});
  const sent=await deliverPush(env,key,sub,new Date(),pushPayload("Synced "+items+" item"+(items===1?"":"s")+". Tap to open Even.","/?sync=1"));
  return reply({ok:true,state:sent.ok?"sent":"none"});
 }
 if(path==="/api/push/check-in"&&request.method==="POST"){
  await env.DB.prepare("UPDATE even_push_subscriptions SET last_check_in_at=? WHERE owner_email=?").bind(new Date().toISOString(),owner).run();
  return reply({ok:true});
 }
 if(path==="/api/push/unsubscribe"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid reminder request");}
  await env.DB.prepare("DELETE FROM even_push_subscriptions WHERE endpoint=? AND owner_email=?").bind(String(input?.endpoint||""),owner).run();
  return reply({ok:true});
 }
 if(path==="/api/calendars"&&request.method==="GET"){
  const r=await env.DB.prepare("SELECT name,enabled FROM even_calendars WHERE owner_email=? ORDER BY name").bind(owner).all();
  return reply({ok:true,calendars:(r.results||[]).map(c=>({name:c.name,enabled:!!c.enabled}))});
 }
 if(path==="/api/calendars"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid calendar request");}
  const name=String(input?.name||"");
  if(!name||name.length>100||typeof input.enabled!=="boolean")return error("Invalid calendar request");
  const updated=await env.DB.prepare("UPDATE even_calendars SET enabled=? WHERE owner_email=? AND name=?").bind(input.enabled?1:0,owner,name).run();
  if(!updated.meta?.changes)return error("Calendar not found",404);
  return reply({ok:true});
 }
 if(path==="/api/sync/status"&&request.method==="GET"){
  const [device,h,c]=await Promise.all([
   env.DB.prepare("SELECT last_used_at,last_attempt_at,last_error_code,shortcut_version FROM even_devices WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(dev.id,owner).first(),
   env.DB.prepare("SELECT COUNT(*) AS count FROM even_health_metrics WHERE owner_email=?").bind(owner).first(),
   env.DB.prepare("SELECT COUNT(*) AS count FROM even_calendar_events WHERE owner_email=?").bind(owner).first()
  ]);
  if(!device)return error("This device was revoked",401);
  return reply({ok:true,credentialValid:true,deviceId:dev.id,lastDataUploadAt:device.last_used_at||null,
   lastAttemptAt:device.last_attempt_at||null,lastErrorCode:device.last_error_code||null,
   installedShortcutVersion:device.shortcut_version||null,
   healthMetrics:Number(h?.count||0),calendarEvents:Number(c?.count||0)});
 }
 if(path==="/api/shortcut/release"&&request.method==="GET"){
  const release=await loadShortcutRelease(env);
  if(!release)return error("No Shortcut release is configured",503);
  const installed=new URL(request.url).searchParams.get("current")||"";
  const updateAvailable=release.verified&&semverNewer(release.version,installed);
  return reply({ok:true,release,updateAvailable,updateStatus:updateAvailable?"new_release":"current",automaticReplacement:false});
 }
 if(path==="/api/shortcut/hello"&&request.method==="POST"){
  let body;try{body=await payload(request);}catch(e){return error("Invalid Shortcut handshake",400);}
  const clientVersion=String(body?.shortcutVersion||"").trim();
  if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clientVersion))return error("A valid Shortcut version is required",400);
  const at=new Date().toISOString();
  await env.DB.prepare("UPDATE even_devices SET last_attempt_at=?,last_error_code=NULL,shortcut_version=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL")
   .bind(at,clientVersion,dev.id,owner).run();
  return reply({ok:true,connected:true,state:"connected",shortcutVersion:clientVersion,receivedAt:at});
 }

 if(path==="/api/pull"&&request.method==="GET"){
  const [health,events]=await Promise.all([
   env.DB.prepare("SELECT day,metric,value FROM even_health_metrics WHERE owner_email=? ORDER BY day DESC LIMIT 3000").bind(owner).all(),
   env.DB.prepare("SELECT event_id,start_time,end_time,title,category FROM even_calendar_events WHERE owner_email=? AND (calendar IS NULL OR calendar NOT IN (SELECT name FROM even_calendars WHERE owner_email=? AND enabled=0)) ORDER BY start_time DESC LIMIT 1200").bind(owner,owner).all()
  ]);
  const grouped={};for(const h of health.results||[]){
   if(!grouped[h.day])grouped[h.day]={date:h.day,source:"shortcut"};
   grouped[h.day][h.metric]=h.value;
  }
  return reply({ok:true,email:owner,health:Object.values(grouped),events:(events.results||[]).map(e=>({id:e.event_id,start:e.start_time,end:e.end_time,title:e.title,category:e.category,source:"shortcut"})),syncAt:new Date().toISOString()});
 }
 if(path==="/api/ingest"&&request.method==="POST"){
  let input;
  try{input=await payload(request);}
  catch(e){await recordSyncFailure(env,dev,"invalid_body");return error("Invalid or oversized request body");}
  if(!input||typeof input!=="object"){
   await recordSyncFailure(env,dev,"invalid_body");return error("Expected JSON or form fields");
  }
  const kind=String(input.kind||"").toLowerCase();
  if(kind==="calendar_complete"){
   const day=dateOnly(input.date),offset=String(input.utcOffset||"").trim(),started=new Date(input.startedAt);
   if(!day||!/^(Z|[+-]\d{2}:\d{2})$/.test(offset)||!Number.isFinite(started.getTime())||Date.now()-started.getTime()>21600000)return error("Invalid calendar sync details");
   const from=new Date(day+"T00:00:00"+offset);
   const to=new Date(from.getTime()+86400000);
   const result=await env.DB.prepare("DELETE FROM even_calendar_events WHERE owner_email=? AND start_time>=? AND start_time<? AND updated_at<?").bind(owner,from.toISOString(),to.toISOString(),started.toISOString()).run();
   return reply({ok:true,state:"reconciled",removed:result.meta?.changes||0});
  }
  if(!["health","calendar","batch"].includes(kind)){
   await recordSyncFailure(env,dev,"invalid_kind");return error("Use kind=health, calendar, or batch");
  }
  const healthInput=kind==="batch"?(Array.isArray(input.health)?input.health.slice(0,75):[]):kind==="health"?(Array.isArray(input.days)?input.days.slice(0,75):[input]):[];
  const eventInput=kind==="batch"?(Array.isArray(input.events)?input.events.slice(0,125):[]):kind==="calendar"?(Array.isArray(input.events)?input.events.slice(0,125):[input]):[];
  const metrics=healthInput.flatMap(readHealth);
  const received=eventInput.map(readEvent).filter(Boolean);
  const events=await enabledEvents(env,owner,received);
  if(!metrics.length&&received.length&&!events.length)return reply({ok:true,state:"skipped",error:NO_VALID_RECORDS});
  if(!metrics.length&&!events.length){
   await recordSyncFailure(env,dev,"no_valid_records");
   return error(NO_VALID_RECORDS);
  }
  const at=new Date().toISOString(),statements=[];
  metrics.forEach(x=>statements.push(env.DB.prepare("INSERT INTO even_health_metrics(owner_email,day,metric,value,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,day,metric) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(owner,x.day,x.metric,x.value,at)));
  for(const e of events){
   const eventId=(await digest(e.start+"|"+e.end+"|"+e.title)).slice(0,40);
   statements.push(env.DB.prepare("INSERT INTO even_calendar_events(owner_email,event_id,start_time,end_time,title,category,calendar,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner_email,event_id) DO UPDATE SET title=excluded.title,category=excluded.category,calendar=excluded.calendar,updated_at=excluded.updated_at").bind(owner,eventId,e.start,e.end,e.title,e.category,e.calendar,at));
  }
  for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
  const claimedVersion=String(input.shortcutVersion||"").trim();
  const clientVersion=/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(claimedVersion)?claimedVersion:null;
  await env.DB.prepare("UPDATE even_devices SET last_used_at=?,last_attempt_at=?,last_error_code=NULL,shortcut_version=COALESCE(?,shortcut_version) WHERE device_id=? AND owner_email=? AND revoked_at IS NULL")
    .bind(at,at,clientVersion,dev.id,owner).run();
  return reply({ok:true,state:"accepted",receivedAt:at,kind,healthMetrics:metrics.length,calendarEvents:events.length,shortcutVersion:clientVersion});
 }
 if(path==="/api/erase"&&request.method==="POST"){
  await env.DB.batch([
   env.DB.prepare("DELETE FROM even_health_metrics WHERE owner_email=?").bind(owner),
   env.DB.prepare("DELETE FROM even_calendar_events WHERE owner_email=?").bind(owner),
   env.DB.prepare("DELETE FROM even_calendars WHERE owner_email=?").bind(owner)
  ]);
  return reply({ok:true,erased:true,email:owner});
 }
 return error("Not found",404);
}
async function api(request,env,ctx,path){
 if(path==="/api/status"&&request.method==="GET")return reply({ok:true,app:"Even",version:"2.3.2",sync:"email-access"});
 if(path.startsWith("/api/auth/"))return authApi(request,env,ctx,path);
 return syncApi(request,env,path);
}

// iOS names an imported Shortcut after its file, and release assets can't contain spaces.
const RELEASE_HELPER_PATH="/install/Even%20Release.shortcut";
async function releaseHelper(){
 const file=await fetch(BUILDS+"Even-Release.shortcut");
 if(!file.ok)return new Response("Shortcut unavailable",{status:502,headers:SECURITY});
 return new Response(file.body,{headers:{...SECURITY,"Content-Type":"application/octet-stream","Content-Disposition":'attachment; filename="Even Release.shortcut"',"Cache-Control":"no-store"}});
}
async function asset(path,env){
 const key=path==="/"?"index.html":path.slice(1);
 if(!Object.prototype.hasOwnProperty.call(MIME,key))return new Response("Not found",{status:404,headers:SECURITY});
 const val=await env.ASSETS.get("asset:"+key);if(val===null)return new Response("Asset unavailable",{status:503,headers:SECURITY});
 const data=key.endsWith(".png")?Uint8Array.from(atob(val),x=>x.charCodeAt(0)):val;
 const headers={...SECURITY,"Content-Type":MIME[key],"Cache-Control":"no-cache, max-age=0, must-revalidate"};
 if(key==="sw.js")headers["Service-Worker-Allowed"]="/";
 return new Response(data,{headers});
}
export default {async fetch(request,env,ctx){
 try{const path=new URL(request.url).pathname;if(path===RELEASE_HELPER_PATH&&request.method==="GET")return await releaseHelper();if(path.startsWith("/api/"))return await api(request,env,ctx,path);
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405,headers:SECURITY});
 return await asset(path,env);
 }catch(e){return error("Request could not be processed",500);}
},
async scheduled(event,env,ctx){ctx.waitUntil(sendReminders(env));}};