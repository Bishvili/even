// Even: account sign-in and owner-scoped device sync.
// All server tokens are generated randomly, stored only as SHA-256 hashes, and revocable.
// /api/user/* needs a signed-in session. All other routes reject
// unauthenticated sync operations unless a valid, unrevoked device token is supplied.
const ICLOUD_SHORTCUT=/^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/i;
async function overLimit(limiter,key){return !!limiter&&!(await limiter.limit({key})).success;}
async function canRelease(env,email){return !!await env.DB.prepare("SELECT 1 AS allowed FROM even_release_emails WHERE email=?").bind(email).first();}
function ownerEmails(env){try{return JSON.parse(env.APPROVED_SYNC_EMAILS||"[]").map(email=>String(email).trim().toLowerCase());}catch(e){return [];}}
async function approved(env,email){
 if(ownerEmails(env).includes(email))return true;
 return !!await env.DB.prepare("SELECT 1 AS allowed FROM even_approved_emails WHERE email=?").bind(email).first();
}
const SECURITY={"X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"};
const METRICS={sleepHours:[0,24],steps:[0,100000],hrv:[0,500],restingHR:[20,250],workoutMin:[0,1440]};
const SEMVER=/^\d{1,3}\.\d{1,3}\.\d{1,3}$/,UTC_OFFSET=/^(Z|[+-]\d{2}:\d{2})$/;
const CATS=["Meeting","Work","Exercise","Social","Family","Rest","Commute","Other"];
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{...SECURITY,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function error(message,status,code){return reply({ok:false,error:message,code},status);}
async function digest(text){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");}
function secureRandomHex(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");}
async function payload(request){
 const size=Number(request.headers.get("content-length")||"0");if(size>100000)throw Error("Request too large");
 const type=request.headers.get("content-type")||"";
 if(type.includes("multipart/form-data")){
  // The header can understate the size, so measure what actually arrived.
  const bytes=await request.arrayBuffer();if(bytes.byteLength>100000)throw Error("Request too large");
  const form=await new Response(bytes,{headers:{"Content-Type":type}}).formData();return Object.fromEntries(Array.from(form.entries()).map(([key,value])=>[key,typeof value==="string"?value:""]));
 }
 const text=await request.text();if(text.length>100000)throw Error("Request too large");
 if(type.includes("application/json"))return JSON.parse(text);
 if(type.includes("application/x-www-form-urlencoded"))return Object.fromEntries(new URLSearchParams(text));
 try{return JSON.parse(text);}catch(e){return Object.fromEntries(new URLSearchParams(text));}
}
function normalEmail(value){return String(value||"").trim().toLowerCase();}
async function signinAuth(env,ctx){
 const {createAuth}=await import("./signin.mjs");
 return createAuth(env,{isApproved:email=>approved(env,email),deliverCode:(email,code)=>{const sent=sendSigninCode(env,email,code);if(ctx?.waitUntil)ctx.waitUntil(sent);}});
}
// Only a session from Even's sign-in proves who someone is, and approval is checked on every request.
async function authIdentity(request,env,ctx){
 if(!(request.headers.get("cookie")||"").includes("even.session_token"))return null;
 try{
  const identity=(await (await signinAuth(env,ctx)).api.getSession({headers:request.headers}))?.user;
  const email=normalEmail(identity?.email);
  return email&&await approved(env,email)?{email,name:String(identity.name||"").trim().slice(0,80)}:null;
 }catch(e){return null;}
}
function browserPostAllowed(request){
 const u=new URL(request.url),origin=request.headers.get("origin");
 return request.method==="POST"&&origin===u.origin&&
  (request.headers.get("content-type")||"").toLowerCase().includes("application/json");
}
const DEVICE_EXPIRY_MS=90*86400000;
function lastActive(device){return device.last_seen_at||device.last_used_at||device.last_attempt_at||device.created_at||null;}
async function validDevice(request,env){
 const auth=request.headers.get("authorization")||"",match=/^Bearer ([a-f0-9]{64})$/i.exec(auth);
 if(!match)return null;
 const tokenHash=await digest(match[1].toLowerCase());
 const device=await env.DB.prepare("SELECT device_id,owner_email,revoked_at,created_at,last_used_at,last_attempt_at,last_seen_at FROM even_devices WHERE token_hash=?").bind(tokenHash).first();
 if(!device||device.revoked_at||!await approved(env,device.owner_email))return null;
 const now=new Date().toISOString(),active=lastActive(device);
 if(active&&Date.now()-Date.parse(active)>DEVICE_EXPIRY_MS){
  await env.DB.prepare("UPDATE even_devices SET revoked_at=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(now,device.device_id,device.owner_email).run();
  return null;
 }
 if(String(device.last_seen_at||"").slice(0,10)!==now.slice(0,10))await env.DB.prepare("UPDATE even_devices SET last_seen_at=? WHERE device_id=?").bind(now,device.device_id).run();
 return {id:device.device_id,owner:device.owner_email};
}
// Everything synced for one person, apart from their account and devices.
function syncedDataStatements(env,owner){
 return [
  env.DB.prepare("UPDATE even_devices SET last_upload_counts=NULL WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM even_health_metrics WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM even_calendar_events WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM even_calendars WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM even_alarms WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM even_moods WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM even_push_subscriptions WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM even_names WHERE email=?").bind(owner)
 ];
}
function accountStatements(env,owner){
 return [...syncedDataStatements(env,owner),
  env.DB.prepare("DELETE FROM even_devices WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM even_signin_sessions WHERE userId IN (SELECT id FROM even_signin_users WHERE email=?)").bind(owner),
  env.DB.prepare("DELETE FROM even_signin_accounts WHERE userId IN (SELECT id FROM even_signin_users WHERE email=?)").bind(owner),
  env.DB.prepare("DELETE FROM even_signin_users WHERE email=?").bind(owner),
  env.DB.prepare("DELETE FROM even_users WHERE email=?").bind(owner)];
}
const WEEKDAYS=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
function alarmDays(text){
 const value=String(text||"").toLowerCase();
 if(/every ?day|daily/.test(value))return [0,1,2,3,4,5,6];
 const days=new Set();
 if(/weekdays/.test(value))[1,2,3,4,5].forEach(d=>days.add(d));
 if(/weekends/.test(value))[0,6].forEach(d=>days.add(d));
 WEEKDAYS.forEach((name,day)=>{if(value.includes(name))days.add(day);});
 return [...days].sort();
}
// Records and fields use separator characters, because a repeat list can span several lines.
function readAlarms(text){
 return String(text||"").split("\u241e").map(record=>record.split("\u241f")).flatMap(fields=>{
  const match=/^(\d{2}):(\d{2})$/.exec(String(fields[0]||"").trim());
  if(!match||Number(match[1])>23||Number(match[2])>59)return [];
  const state=String(fields[2]||"").trim().toLowerCase(),name=String(fields[3]||"").trim();
  const enabled=/^(yes|true|on|1)$/.test(state)?1:/^(no|false|off|0)$/.test(state)?0:null;
  const label=!name||/^alarm$/i.test(name)||/^\d{1,2}[:.]\d{2}/.test(name)?null:name.slice(0,60);
  return [{timeMin:Number(match[1])*60+Number(match[2]),days:alarmDays(fields[1]),enabled,label}];
 }).slice(0,40);
}
function firstAlarm(alarms,day){
 const weekday=new Date(day+"T12:00:00Z").getUTCDay();
 const times=alarms.filter(a=>a.enabled!==0&&a.timeMin<720&&(!a.days.length||a.days.includes(weekday))).map(a=>a.timeMin);
 return times.length?Math.min(...times):null;
}
const SYNC_KINDS=["calendar","sleep","steps","restingHR","hrv","workout","alarms"];
const METRIC_KINDS={sleepHours:"sleep",bedtimeMin:"sleep",steps:"steps",restingHR:"restingHR",hrv:"hrv",workoutMin:"workout"};
async function syncOff(env,owner){
 const row=await env.DB.prepare("SELECT sync_off FROM even_users WHERE email=?").bind(owner).first();
 try{return new Set(JSON.parse(row?.sync_off||"[]"));}catch(e){return new Set();}
}
// Matches only turned-off calendars. With none off, it matches nothing.
async function calendarsOffPattern(env,owner){
 const off=await env.DB.prepare("SELECT name FROM even_calendars WHERE owner_email=? AND enabled=0").bind(owner).all();
 const names=(off.results||[]).map(c=>c.name.replace(/[\\^$.*+?()[\]{}|]/g,"\\$&"));
 return names.length?"^(?:"+names.join("|")+")$":"(?!)";
}
function readMood(x){
 const id=String(x?.id||""),ts=new Date(x?.ts),scale=value=>Number.isInteger(value)&&value>=1&&value<=5?value:null;
 if(!id||id.length>80||!Number.isFinite(ts.getTime())||scale(x.score)===null)return null;
 const tags=Array.isArray(x.tags)?x.tags.slice(0,12).map(t=>String(t).slice(0,40)):[];
 return{id,ts:ts.toISOString(),score:x.score,energy:scale(x.energy),stress:scale(x.stress),tags:JSON.stringify(tags),note:String(x.note||"").slice(0,400)};
}
function dateOnly(value){
 const day=String(value||"").trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const parsed=new Date(day+"T12:00:00Z");
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===day?day:null;
}
// Each night's bedtime is its earliest sleep from 6 PM on. Daytime naps don't count.
function readBedtimes(starts){
 const nights=new Map();
 for(const stamp of String(starts||"").trim().split(/\s+/).slice(0,400)){
  const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(stamp),date=match&&dateOnly(match[1]);
  if(!date)continue;
  const hour=Number(match[2]),minute=Number(match[3]);
  if(hour>23||minute>59||(hour>=10&&hour<18))continue;
  const morning=hour<18?date:new Date(new Date(date+"T12:00:00Z").getTime()+86400000).toISOString().slice(0,10);
  const value=hour*60+minute,night=hour<18?value+1440:value;
  if(!nights.has(morning)||night<nights.get(morning).night)nights.set(morning,{night,value});
 }
 return [...nights].map(([day,n])=>({day,metric:"bedtimeMin",value:n.value}));
}
function nextDay(day){return new Date(new Date(day+"T12:00:00Z").getTime()+86400000).toISOString().slice(0,10);}
// Sleep arrives as the start and end of each asleep sample. Overlapping samples from more than one device are merged,
// each night is filed under the morning it ends, and daytime naps don't count. When the Shortcut reached its sample
// limit, the oldest night may be cut off, so it's left as it was.
function readSleep(text,samples,limit){
 const nights=new Map();
 for(const record of String(text||"").split("\u241e").slice(0,1000)){
  const [startText="",endText=""]=record.split("\u241f").map(v=>v.trim());
  const local=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(startText),date=local&&dateOnly(local[1]);
  const start=Date.parse(startText),end=Date.parse(endText);
  if(!date||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>86400000)continue;
  const hour=Number(local[2]),minute=Number(local[3]);
  if(hour>23||minute>59||(hour>=10&&hour<18))continue;
  const morning=hour<18?date:nextDay(date),night=nights.get(morning)||{spans:[],order:Infinity,bed:0};
  const value=hour*60+minute,order=hour<18?value+1440:value;
  if(order<night.order){night.order=order;night.bed=value;}
  night.spans.push([start,end]);nights.set(morning,night);
 }
 const days=[...nights.keys()].sort(),cap=Number(limit);
 if(cap>0&&Number(samples)>=cap)days.shift();
 return days.flatMap(day=>{
  const spans=nights.get(day).spans.sort((a,b)=>a[0]-b[0]);
  let asleep=0,[from,to]=spans[0];
  for(const [s,e] of spans.slice(1)){if(s>to){asleep+=to-from;from=s;to=e;}else if(e>to)to=e;}
  asleep+=to-from;
  return [{day,metric:"sleepHours",value:Math.round(asleep/36000)/100},{day,metric:"bedtimeMin",value:nights.get(day).bed}];
 });
}
// Some locales write decimals with a comma.
function measure(raw){const value=String(raw).trim();return Number(/^\d+,\d+$/.test(value)?value.replace(",","."):value);}
// Each measure can carry its own date, because its latest daily total may be from an earlier day.
function readHealth(x){
 if(!x||typeof x!=="object")return [];
 const base=dateOnly(x.date||x.day),results=[...readBedtimes(x.sleepStarts),...readSleep(x.sleepIntervals,x.sleepSamples,x.sleepLimit)];
 for(const [metric,[low,high]] of Object.entries(METRICS)){
  const raw=x[metric];if(raw===undefined||raw===null||String(raw).trim()==="")continue;
  const day=dateOnly(x[metric+"Date"])||base,value=measure(raw);
  if(day&&Number.isFinite(value)&&value>=low&&value<=high)results.push({day,metric,value});
 }
 return results;
}
// Whether a measure was sent at all, even an invalid one. Average heart rate from older Shortcuts doesn't count, and
// neither do sleep intervals, because a night that may be cut off is left out on purpose rather than rejected.
function sentHealth(x){return !!x&&typeof x==="object"&&[...Object.keys(METRICS),"sleepStarts"].some(k=>x[k]!==undefined&&x[k]!==null&&String(x[k]).trim()!=="");}
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
// Even Sync 3 sends today's and tomorrow's events as records of start, end, calendar and title, so both days arrive complete.
function readEventRecords(text){
 const seen=new Set(),events=[];
 for(const record of String(text||"").split("\u241e")){
  if(events.length>=150)break;
  const [start="",end="",calendar="",...title]=record.split("\u241f");
  const day=dateOnly(start.trim().slice(0,10)),event=day&&readEvent({start:start.trim(),end:end.trim(),calendar,title:title.join("\u241f")});
  if(!event||seen.has(event.start+"|"+event.end+"|"+event.title))continue;
  seen.add(event.start+"|"+event.end+"|"+event.title);events.push({...event,day});
 }
 return events;
}
async function eventStatement(env,owner,e,at){
 const eventId=(await digest(e.start+"|"+e.end+"|"+e.title)).slice(0,40);
 return env.DB.prepare("INSERT INTO even_calendar_events(owner_email,event_id,start_time,end_time,title,category,calendar,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner_email,event_id) DO UPDATE SET title=excluded.title,category=excluded.category,calendar=excluded.calendar,updated_at=excluded.updated_at").bind(owner,eventId,e.start,e.end,e.title,e.category,e.calendar,at);
}
// Requests within ten minutes belong to one run of Even Sync, so their counts are kept together.
async function markUpload(env,dev,version,at,counts){
 const claimed=String(version||"").trim(),clientVersion=SEMVER.test(claimed)?claimed:null,sent=JSON.stringify(counts);
 await env.DB.prepare("UPDATE even_devices SET last_used_at=?,last_attempt_at=?,last_error_code=NULL,shortcut_version=COALESCE(?,shortcut_version),last_upload_counts=CASE WHEN last_used_at>? THEN json_patch(COALESCE(last_upload_counts,'{}'),?) ELSE ? END WHERE device_id=? AND owner_email=? AND revoked_at IS NULL")
  .bind(at,at,clientVersion,new Date(Date.parse(at)-600000).toISOString(),sent,sent,dev.id,dev.owner).run();
 return clientVersion;
}
// A name set by a developer comes first, then one given for a release account, then the one from sign-in.
async function displayName(env,email){
 const row=await env.DB.prepare("SELECT (SELECT name FROM even_names WHERE email=?) AS chosen,(SELECT display_name FROM even_release_emails WHERE email=?) AS given,(SELECT name FROM even_users WHERE email=?) AS signin").bind(email,email,email).first();
 return row?.chosen||row?.given||row?.signin||null;
}
function firstName(name){return String(name||"").trim().split(/\s+/)[0]||null;}
function escapeHtml(text){return String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function sendInvite(env,to,from){
 if(!env.RESEND_API_KEY)return false;
 const url=env.PUBLIC_ORIGIN+"/";
 // The same steps, in the same words, as the setup card in the app.
 const steps=["Open the link in Safari on your iPhone. Tap Share (or ••• and then Share), then Add to Home Screen.","Open Even from your Home Screen and sign in with this email. We'll send you a one-time code.","Tap Get Even Sync, then Run Even Sync, to bring in your sleep, activity, calendar and alarms."];
 try{
  const guest=firstName(await displayName(env,to)),host=firstName(await displayName(env,from));
  const opening=(host?host+" invited you":"You've been invited")+" to try Even, a private way to understand your harder days.",hello=guest?"Hi "+guest+",":"";
  const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({
   from:"Even <hello@bishvili.org>",to:[to],subject:host?host+" invited you to try Even":"You're invited to try Even",
   text:(hello?hello+"\n\n":"")+opening+"\n\n"+url+"\n\n"+steps.map((s,i)=>(i+1)+". "+s).join("\n")+"\n\nHow Even works: "+url+"whitepaper.html",
   html:(hello?"<p>"+escapeHtml(hello)+"</p>":"")+"<p>"+escapeHtml(opening)+'</p><p><a href="'+url+'">Open Even</a></p><ol>'+steps.map(s=>"<li>"+s+"</li>").join("")+'</ol><p><a href="'+url+'whitepaper.html">How Even works</a></p>'
  })});
  return sent.ok;
 }catch(e){return false;}
}
async function sendSigninCode(env,to,code){
 if(!env.RESEND_API_KEY)return false;
 try{
  const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({
   from:"Even <sign-in@bishvili.org>",to:[to],subject:"Your Even code: "+code,
   text:"Your code is "+code+". It works for 10 minutes.\n\nIf you didn't ask for it, you can ignore this email.",
   html:"<p>Your code is <strong>"+code+"</strong>. It works for 10 minutes.</p><p>If you didn't ask for it, you can ignore this email.</p>"
  })});
  return sent.ok;
 }catch(e){return false;}
}
const SIGNIN_ROUTES={"POST /email-otp/send-verification-otp":1,"POST /sign-in/email-otp":1,"POST /sign-in/social":1,"GET /callback/google":1,"POST /callback/google":1,"POST /sign-out":1};
async function signinApi(request,env,ctx,path){
 const route=path.slice("/api/signin".length);
 if(route==="/options"&&request.method==="GET")return reply({ok:true,google:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET)});
 if(!SIGNIN_ROUTES[request.method+" "+route])return error("Not found",404,"not_found");
 if(route==="/email-otp/send-verification-otp"||route==="/sign-in/email-otp"){
  let input;try{input=await request.clone().json();}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const email=normalEmail(input?.email);
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error("Enter a valid email address.",400,"invalid_email");
  if(await overLimit(env.SIGNIN_LIMIT,email))return error("Too many tries. Try again in a minute.",429,"rate_limited");
  // The answer is the same either way, so this can't be used to find out who's approved.
  if(route==="/email-otp/send-verification-otp"&&(input.type!=="sign-in"||!await approved(env,email)))return reply({success:true});
 }
 const response=await (await signinAuth(env,ctx)).handler(request);
 const headers=new Headers(response.headers);
 for(const [name,value] of Object.entries(SECURITY))headers.set(name,value);
 headers.set("Cache-Control","no-store");
 return new Response(response.body,{status:response.status,headers});
}
async function authApi(request,env,ctx,path){
 const identity=await authIdentity(request,env,ctx),email=identity?.email||null;
 if(!email)return error("Sign in with an approved email.",401,"sign_in_required");
 if(path==="/api/user/me"&&request.method==="GET"){
  // Sign-in may supply a name. Testers are listed by it.
  try{
   if(identity.name)await env.DB.prepare("UPDATE even_users SET name=? WHERE email=? AND (name IS NULL OR name<>?)").bind(identity.name,email,identity.name).run();
  }catch(e){}
  const r=await env.DB.prepare("SELECT device_id,label,created_at,last_used_at,last_attempt_at,last_error_code,shortcut_version,revoked_at FROM even_devices WHERE owner_email=? ORDER BY created_at DESC LIMIT 30").bind(email).all();
  const person=firstName(await displayName(env,email));
  const welcome=await env.DB.prepare("SELECT display_name FROM even_release_emails WHERE email=? AND display_name IS NOT NULL AND welcomed_at IS NULL").bind(email).first();
  const release=await canRelease(env,email);
  return reply({ok:true,email,canRelease:release,helper:release?await loadHelperLink(env):null,firstName:person,name:await displayName(env,email),welcomeName:welcome?person:null,devices:(r.results||[]).map(d=>({id:d.device_id,label:d.label,createdAt:d.created_at,lastUsedAt:d.last_used_at,lastAttemptAt:d.last_attempt_at,lastErrorCode:d.last_error_code,shortcutVersion:d.shortcut_version,revoked:!!d.revoked_at}))});
 }
 if(path==="/api/user/device"){
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const label=String(input.label||"iPhone").trim().replace(/[\x00-\x1f]/g,"").slice(0,64)||"iPhone";
  await env.DB.prepare("UPDATE even_devices SET revoked_at=? WHERE owner_email=? AND revoked_at IS NULL AND COALESCE(last_seen_at,last_used_at,last_attempt_at,created_at)<?").bind(new Date().toISOString(),email,new Date(Date.now()-DEVICE_EXPIRY_MS).toISOString()).run();
  const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM even_devices WHERE owner_email=? AND revoked_at IS NULL").bind(email).first();
  if(Number(count?.count||0)>=10)return error("Ten active devices maximum; revoke one first",429,"device_limit");
  const token=secureRandomHex(),deviceId=crypto.randomUUID(),at=new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO even_users(email,created_at) VALUES(?,?)").bind(email,at).run();
  await env.DB.prepare("INSERT INTO even_devices(token_hash,device_id,owner_email,label,created_at) VALUES(?,?,?,?,?)").bind(await digest(token),deviceId,email,label,at).run();
  return reply({ok:true,email,token,deviceId,label,createdAt:at});
 }
 if(path.startsWith("/api/user/testers")){
  if(!await canRelease(env,email))return error("This account can't manage testers",403,"not_release_account");
  if(path==="/api/user/testers"&&request.method==="GET"){
   const [added,developers,users,chosen]=await Promise.all([
    env.DB.prepare("SELECT email FROM even_approved_emails").bind().all(),
    env.DB.prepare("SELECT email,display_name FROM even_release_emails").bind().all(),
    env.DB.prepare("SELECT email,name FROM even_users").bind().all(),
    env.DB.prepare("SELECT email,name FROM even_names").bind().all()
   ]);
   const chosenNames=new Map((chosen.results||[]).map(r=>[r.email,r.name]));
   const removable=new Set((added.results||[]).map(r=>r.email)),signInNames=new Map((users.results||[]).map(r=>[r.email,r.name])),names=new Map((developers.results||[]).map(r=>[r.email,r.display_name])),signedIn=new Set((users.results||[]).map(r=>r.email));
   ownerEmails(env).forEach(owner=>removable.delete(owner));
   const everyone=[...new Set([...ownerEmails(env),...names.keys(),...(added.results||[]).map(r=>r.email)])].sort();
   return reply({ok:true,testers:everyone.map(address=>({email:address,name:chosenNames.get(address)||names.get(address)||signInNames.get(address)||null,signedIn:signedIn.has(address),removable:removable.has(address)}))});
  }
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const tester=String(input?.email||"").trim().toLowerCase();
  if(tester.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tester))return error("Enter a valid email address.",400,"invalid_email");
  if((path==="/api/user/testers"||path==="/api/user/testers/invite")&&await overLimit(env.INVITE_LIMIT,email))return error("That's a lot of invitations at once. Try again in a minute.",429,"rate_limited");
  if(path==="/api/user/testers"){
   await env.DB.prepare("INSERT OR IGNORE INTO even_approved_emails(email,added_by,created_at) VALUES(?,?,?)").bind(tester,email,new Date().toISOString()).run();
   return reply({ok:true,emailed:await sendInvite(env,tester,email)});
  }
  if(path==="/api/user/testers/invite"){
   if(!await approved(env,tester)&&!await canRelease(env,tester))return error("Add this email first.",404,"not_a_tester");
   return reply({ok:true,emailed:await sendInvite(env,tester,email)});
  }
  if(path==="/api/user/testers/name"){
   if(!await approved(env,tester)&&!await canRelease(env,tester))return error("Add this email first.",404,"not_a_tester");
   const name=String(input?.name||"").trim().replace(/[\x00-\x1f]/g,"").slice(0,60);
   if(name)await env.DB.prepare("INSERT INTO even_names(email,name,set_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,set_by=excluded.set_by,updated_at=excluded.updated_at").bind(tester,name,email,new Date().toISOString()).run();
   else await env.DB.prepare("DELETE FROM even_names WHERE email=?").bind(tester).run();
   return reply({ok:true,name:await displayName(env,tester)});
  }
  if(path==="/api/user/testers/remove"){
   if(ownerEmails(env).includes(tester)||tester===email)return error("This account can't be removed.",400,"not_removable");
   await env.DB.batch([env.DB.prepare("DELETE FROM even_approved_emails WHERE email=?").bind(tester),...accountStatements(env,tester)]);
   return reply({ok:true});
  }
  return error("Not found",404,"not_found");
 }
 if(path==="/api/user/welcomed"){
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  await env.DB.prepare("UPDATE even_release_emails SET welcomed_at=? WHERE email=? AND welcomed_at IS NULL").bind(new Date().toISOString(),email).run();
  return reply({ok:true});
 }
 if(path==="/api/user/device/rename"){
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const deviceId=String(input.deviceId||""),label=String(input.label||"").trim().replace(/[\x00-\x1f]/g,"").slice(0,64);
  if(!/^[\w-]{12,80}$/.test(deviceId))return error("Invalid device identifier",400,"invalid_device");
  if(!label)return error("Enter a name for this device.",400,"invalid_label");
  const result=await env.DB.prepare("UPDATE even_devices SET label=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(label,deviceId,email).run();
  if(!result.meta?.changes)return error("Device not found",404,"device_not_found");
  return reply({ok:true,label});
 }
 if(path==="/api/user/revoke"){
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const deviceId=String(input.deviceId||"");
  if(!/^[\w-]{12,80}$/.test(deviceId))return error("Invalid device identifier",400,"invalid_device");
  const result=await env.DB.prepare("UPDATE even_devices SET revoked_at=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(new Date().toISOString(),deviceId,email).run();
  return reply({ok:true,revoked:!!result.meta?.changes});
 }
 return error("Not found",404,"not_found");
}
function cleanShortcutRelease(value){
 if(!value||typeof value!=="object")return null;
 const version=String(value.version||"").trim();
 const url=String(value.url||"").trim();
 if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version))return null;
 if(!ICLOUD_SHORTCUT.test(url))return null;
 return {version,url,publishedAt:String(value.publishedAt||"").slice(0,30),notes:String(value.notes||"").slice(0,180),verified:value.verified===true};
}
async function loadConfig(env,key){try{const raw=await env.ASSETS.get(key);return raw?JSON.parse(raw):null;}catch(e){return null;}}
// The link Even Release last shared, so Set Up Release Helper installs the current helper.
async function loadHelperLink(env){
 const value=await loadConfig(env,"config:helper:latest");
 return value&&SEMVER.test(String(value.version||""))&&ICLOUD_SHORTCUT.test(String(value.url||""))?{version:value.version,url:value.url}:null;
}
// The versions in the source on main, written at deploy, so a build that's still being signed isn't mistaken for current.
async function loadSourceVersions(env){
 const value=await loadConfig(env,"config:shortcut:source")||{};
 return{sync:SEMVER.test(String(value.sync||""))?value.sync:null,release:SEMVER.test(String(value.release||""))?value.release:null};
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
const NO_VALID_RECORDS="Some data in this upload wasn't valid.";
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
function pushPayload(env,body,path,extra={}){
 return JSON.stringify({web_push:8030,mutable:true,...extra,notification:{title:"Even",body,navigate:env.PUBLIC_ORIGIN+path}});
}
// A first name goes only on the messages that start or close the day, or come at a hard moment.
function reminderMessage(minutes,atBedtime,atHardTime,name){
 if(atBedtime)return name?"Bedtime soon, "+name+". Take a moment to check in, then rest.":"Bedtime soon. Take a moment to check in, then rest.";
 if(atHardTime)return name?name+", this is often a harder part of your day. How are you doing?":"This is often a harder part of your day. How are you doing?";
 if(minutes<660)return name?"Good morning, "+name+". How are you starting the day?":"Good morning. How are you starting the day?";
 if(minutes<840)return "How is your day going so far?";
 if(minutes<1020)return "Afternoon check-in. How is your energy?";
 return "How did today go?";
}
async function sendPush(env,key,sub,now,payload){
 const encoder=new TextEncoder(),text=value=>base64url(encoder.encode(JSON.stringify(value)));
 const unsigned=text({typ:"JWT",alg:"ES256"})+"."+text({aud:new URL(sub.endpoint).origin,exp:Math.floor(now.getTime()/1000)+43200,sub:env.PUBLIC_ORIGIN});
 const signingKey=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",d:key.d,x:key.x,y:key.y},{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const signature=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},signingKey,encoder.encode(unsigned)));
 return fetch(sub.endpoint,{method:"POST",body:await encryptPush(payload,sub.p256dh,sub.auth),headers:{"Authorization":`vapid t=${unsigned}.${base64url(signature)}, k=${pushPublicKey(key)}`,"Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream","TTL":"3600","Urgency":"high"}});
}
async function deliverPush(env,key,sub,now,payload){
 const sent=await sendPush(env,key,sub,now,payload);const endpoint=sub.endpoint;
 if(sent.status===404||sent.status===410)await env.DB.prepare("DELETE FROM even_push_subscriptions WHERE endpoint=?").bind(endpoint).run();
 else await env.DB.prepare("UPDATE even_push_subscriptions SET last_push_status=? WHERE endpoint=?").bind(sent.status,endpoint).run();
 return sent;
}
const SMART_QUIET_MS=5400000;
function dueTarget(times,minutes){
 const targets=times.map(t=>{const[h,m]=t.split(":").map(Number);return h*60+m;}).filter(t=>t<=minutes&&minutes-t<60);
 return targets.length?Math.max(...targets):null;
}
const SCHEDULE_KINDS=["custom","brief","bedtime","hard"],WEEK_MS=604800000,REMINDER_BATCH=5,SYNC_STALE_MS=72000000,DUE_WINDOW_MS=3600000;
// Sent ahead of an anticipated hard moment. The device fills in the specific message.
async function sendAnticipation(env,key,sub,now){
 const last=sub.last_stress_at?Date.parse(sub.last_stress_at):0;
 const due=JSON.parse(sub.stress_times||"[]").filter(at=>{const t=Date.parse(at);return t<=now.getTime()&&now.getTime()-t<DUE_WINDOW_MS&&t>last;}).sort();
 if(!due.length)return false;
 const at=due[due.length-1];
 const sent=await deliverPush(env,key,sub,now,pushPayload(env,firstName(sub.person)?firstName(sub.person)+", a harder stretch may be coming. Take a minute?":"A harder stretch may be coming. Take a minute?","/?do=reset",{stressAt:at}));
 if(sent.ok)await env.DB.prepare("UPDATE even_push_subscriptions SET last_stress_at=? WHERE endpoint=?").bind(at,sub.endpoint).run();
 return sent.ok;
}
// Only for people who have synced before and haven't lately.
async function sendSyncReminder(env,key,sub,now,local){
 if(!sub.sync_at||sub.last_sync_prompt_day===local.day||!sub.last_used_at)return;
 if(now.getTime()-Date.parse(sub.last_used_at)<SYNC_STALE_MS)return;
 const [hour,minute]=sub.sync_at.split(":").map(Number),at=hour*60+minute;
 if(local.minutes<at||local.minutes-at>=60)return;
 const sent=await deliverPush(env,key,sub,now,pushPayload(env,"Time to sync. Tap to run Even Sync.","/?do=sync"));
 if(sent.ok)await env.DB.prepare("UPDATE even_push_subscriptions SET last_sync_prompt_day=? WHERE endpoint=?").bind(local.day,sub.endpoint).run();
}
async function sendReminders(env,now=new Date()){
 const key=pushKey(env);if(!key)return;
 const subs=await env.DB.prepare("SELECT s.endpoint,s.p256dh,s.auth,s.mode,s.times,s.bedtime_at,s.brief_at,s.hard_at,s.weekends,s.sync_at,s.last_sync_prompt_day,s.stress_times,s.last_stress_at,s.schedule,s.last_schedule_at,d.last_used_at,s.time_zone,s.last_sent_day,s.last_sent_target,s.last_check_in_at,COALESCE((SELECT name FROM even_names n WHERE n.email=s.owner_email),(SELECT display_name FROM even_release_emails r WHERE r.email=s.owner_email),(SELECT name FROM even_users u WHERE u.email=s.owner_email)) AS person FROM even_push_subscriptions s JOIN even_devices d ON d.device_id=s.device_id WHERE d.revoked_at IS NULL AND s.p256dh IS NOT NULL AND s.times IS NOT NULL").bind().all();
 const rows=subs.results||[];
 // A failure stays with its own subscription, and a slow endpoint holds up only its small group.
 for(let i=0;i<rows.length;i+=REMINDER_BATCH){
  await Promise.all(rows.slice(i,i+REMINDER_BATCH).map(async sub=>{
   try{await notifySubscriber(env,key,sub,now);}
   catch(e){await env.DB.prepare("UPDATE even_push_subscriptions SET last_push_status=? WHERE endpoint=?").bind(0,sub.endpoint).run().catch(()=>{});}
  }));
 }
}
// At most one notification a run. Whatever else is due goes out on a later run, while it's still within its hour.
async function notifySubscriber(env,key,sub,now){
 const local=localTime(sub.time_zone,now);
 if(await sendAnticipation(env,key,sub,now))return;
 if(await sendCheckIn(env,key,sub,now,local))return;
 await sendSyncReminder(env,key,sub,now,local);
}
// The latest dated notification now due. A plan that has run out repeats its last week until the app is next opened.
function dueScheduled(schedule,now,after){
 let due=null;
 for(const item of schedule){
  let at=Date.parse(item.at);
  if(at<now-DUE_WINDOW_MS)at+=Math.ceil((now-DUE_WINDOW_MS-at)/WEEK_MS)*WEEK_MS;
  if(at<=now&&at>after&&(!due||at>due.at))due={at,kind:item.kind};
 }
 return due;
}
async function sendScheduled(env,key,sub,now){
 const due=dueScheduled(JSON.parse(sub.schedule),now.getTime(),sub.last_schedule_at?Date.parse(sub.last_schedule_at):0);
 if(!due)return false;
 const quiet=sub.mode==="smart"&&sub.last_check_in_at&&now.getTime()-new Date(sub.last_check_in_at).getTime()<SMART_QUIET_MS;
 const minutes=localTime(sub.time_zone,new Date(due.at)).minutes,custom=sub.mode!=="smart";
 const body=custom?"How are you feeling?":reminderMessage(minutes,due.kind==="bedtime",due.kind==="hard",firstName(sub.person));
 const sent=quiet?{ok:true}:await deliverPush(env,key,sub,now,pushPayload(env,body,"/#checkin",{brief:due.kind==="brief"}));
 if(sent.ok)await env.DB.prepare("UPDATE even_push_subscriptions SET last_schedule_at=? WHERE endpoint=?").bind(new Date(due.at).toISOString(),sub.endpoint).run();
 return sent.ok&&!quiet;
}
async function sendCheckIn(env,key,sub,now,local){
 if(sub.schedule)return sendScheduled(env,key,sub,now);
 const target=dueTarget(JSON.parse(sub.times),local.minutes);
 if(target===null||(sub.last_sent_day===local.day&&sub.last_sent_target>=target))return false;
 if(sub.weekends===0&&[0,6].includes(new Date(local.day+"T12:00:00Z").getUTCDay()))return false;
 // A smart reminder isn't needed right after a check-in.
 const quiet=sub.mode==="smart"&&sub.last_check_in_at&&now.getTime()-new Date(sub.last_check_in_at).getTime()<SMART_QUIET_MS;
 const isTarget=time=>{if(!time)return false;const[hour,minute]=time.split(":").map(Number);return hour*60+minute===target;};
 const smart=sub.mode==="smart",body=smart?reminderMessage(target,isTarget(sub.bedtime_at),isTarget(sub.hard_at),firstName(sub.person)):"How are you feeling?";
 const sent=quiet?{ok:true}:await deliverPush(env,key,sub,now,pushPayload(env,body,"/#checkin",{brief:smart&&isTarget(sub.brief_at)}));
 if(sent.ok)await env.DB.prepare("UPDATE even_push_subscriptions SET last_sent_day=?,last_sent_target=? WHERE endpoint=?").bind(local.day,target,sub.endpoint).run();
 return sent.ok&&!quiet;
}
const BUILDS="https://github.com/Bishvili/even/releases/download/shortcut-latest/";
async function latestBuildVersion(name){
 const file=await fetch(BUILDS+name+"-version.txt");
 if(!file.ok)return null;
 const version=(await file.text()).trim();
 return SEMVER.test(version)?version:null;
}
// Published versions can't be edited, so a link only passes if it names the expected Shortcut.
async function shortcutName(link){
 try{
  const record=await fetch("https://www.icloud.com/shortcuts/api/records/"+link.split("/").pop());
  return record.ok?String((await record.json())?.fields?.name?.value||""):"";
 }catch(e){return "";}
}
async function startWorkflow(env,file,inputs){
 const started=await fetch("https://api.github.com/repos/Bishvili/even/actions/workflows/"+file+"/dispatches",{method:"POST",headers:{"Authorization":"Bearer "+env.GITHUB_API_KEY,"Accept":"application/vnd.github+json","Content-Type":"application/json","User-Agent":"even","X-GitHub-Api-Version":"2022-11-28"},body:JSON.stringify({ref:"main",inputs})});
 return started.status===204;
}
async function calendarList(env,owner){
 const r=await env.DB.prepare("SELECT name,enabled FROM even_calendars WHERE owner_email=? ORDER BY name").bind(owner).all();
 return (r.results||[]).map(c=>({name:c.name,enabled:!!c.enabled}));
}
async function syncChoices(env,owner){
 const off=await syncOff(env,owner);
 return Object.fromEntries(SYNC_KINDS.map(kind=>[kind,!off.has(kind)]));
}
async function syncedMoods(env,owner){
 const user=await env.DB.prepare("SELECT mood_sync FROM even_users WHERE email=?").bind(owner).first();
 if(!user?.mood_sync)return{email:owner,enabled:false,moods:[],deleted:[]};
 const rows=await env.DB.prepare("SELECT id,ts,score,energy,stress,tags,note,deleted_at FROM even_moods WHERE owner_email=? ORDER BY ts DESC LIMIT 8000").bind(owner).all();
 const live=(rows.results||[]).filter(m=>!m.deleted_at);
 return{email:owner,enabled:true,
  moods:live.map(m=>{let tags=[];try{tags=JSON.parse(m.tags||"[]");}catch(e){}return{id:m.id,ts:m.ts,score:m.score,energy:m.energy,stress:m.stress,tags,note:m.note||""};}),
  deleted:(rows.results||[]).filter(m=>m.deleted_at).map(m=>m.id)};
}
async function deviceStatus(env,dev,owner){
 const [device,h,c]=await Promise.all([
  env.DB.prepare("SELECT last_used_at,last_attempt_at,last_error_code,shortcut_version,last_upload_counts FROM even_devices WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(dev.id,owner).first(),
  env.DB.prepare("SELECT COUNT(*) AS count FROM even_health_metrics WHERE owner_email=?").bind(owner).first(),
  env.DB.prepare("SELECT COUNT(*) AS count FROM even_calendar_events WHERE owner_email=?").bind(owner).first()
 ]);
 if(!device)return null;
 let lastUpload=null;
 try{lastUpload=device.last_upload_counts?JSON.parse(device.last_upload_counts):null;}catch(e){}
 return{credentialValid:true,deviceId:dev.id,lastDataUploadAt:device.last_used_at||null,
  lastAttemptAt:device.last_attempt_at||null,lastErrorCode:device.last_error_code||null,
  installedShortcutVersion:device.shortcut_version||null,lastUpload,
  healthMetrics:Number(h?.count||0),calendarEvents:Number(c?.count||0)};
}
async function syncApi(request,env,path){
 const dev=await validDevice(request,env);
 if(!dev)return error("This iPhone isn't connected. Open Even, go to Data, and tap Run Even Sync.",401,"device_required");
 const owner=dev.owner;
 if(request.method==="POST"&&(path==="/api/ingest"||path.startsWith("/api/push/"))&&await overLimit(env.DEVICE_LIMIT,dev.id))return error("Too many requests. Try again in a minute.",429,"rate_limited");
 if(path==="/api/shortcut/release-state"&&request.method==="GET"){
  if(!await canRelease(env,owner))return error("This account can't publish releases",403,"not_release_account");
  const latest=await latestBuildVersion("Even-Sync");
  if(!latest)return error("The latest build couldn't be checked",502,"build_unavailable");
  const device=await env.DB.prepare("SELECT shortcut_version FROM even_devices WHERE device_id=? AND owner_email=?").bind(dev.id,owner).first();
  const published=(await loadShortcutRelease(env))?.version||null,installed=device?.shortcut_version||null;
  const helper=new URL(request.url).searchParams.get("helper")||"";
  // Even Release 1 knows only these three states.
  if(!SEMVER.test(helper))return reply({ok:true,state:installed!==latest?"install":published!==latest?"publish":"current",latest,installed,published});
  const [source,latestHelper,shared]=await Promise.all([loadSourceVersions(env),latestBuildVersion("Even-Release").catch(()=>null),loadHelperLink(env)]);
  const state=source.sync&&semverNewer(source.sync,latest)?"building":installed&&semverNewer(installed,latest)?"ahead":installed!==latest?"install":published!==latest?"publish":"current";
  const helperState=latestHelper&&semverNewer(latestHelper,helper)?"update":"current";
  const helperLinkState=helperState==="current"&&!(latestHelper&&semverNewer(helper,latestHelper))&&shared?.version!==helper?"share":"current";
  return reply({ok:true,state,latest,installed,published,helper,helperState,helperLinkState});
 }
 if(path==="/api/shortcut/publish"&&request.method==="POST"){
  if(!await canRelease(env,owner))return error("This account can't publish releases",403,"not_release_account");
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const link=String(input?.link||"").trim();
  if(!ICLOUD_SHORTCUT.test(link))return error("A valid Shortcut link is required",400,"invalid_link");
  if(await shortcutName(link)!=="Even Sync")return error("That link isn't Even Sync, so nothing was published.",400,"wrong_shortcut");
  return await startWorkflow(env,"publish-release.yml",{icloud_link:link})?reply({ok:true}):error("Publishing couldn't start",502,"publish_failed");
 }
 // Even Release shares its own link, so Set Up Release Helper installs the current helper.
 if(path==="/api/shortcut/helper-link"&&request.method==="POST"){
  if(!await canRelease(env,owner))return error("This account can't publish releases",403,"not_release_account");
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const link=String(input?.link||"").trim();
  if(!ICLOUD_SHORTCUT.test(link))return error("A valid Shortcut link is required",400,"invalid_link");
  if(await shortcutName(link)!=="Even Release")return error("That link isn't Even Release, so nothing was shared.",400,"wrong_shortcut");
  return await startWorkflow(env,"helper-link.yml",{icloud_link:link})?reply({ok:true}):error("Sharing couldn't start",502,"share_failed");
 }
 if(path==="/api/push/key"&&request.method==="GET"){const key=pushKey(env);return reply({ok:true,key:key?pushPublicKey(key):null});}
 if(path==="/api/push/subscribe"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid reminder request",400,"invalid_reminder");}
  const endpoint=pushEndpoint(input?.endpoint),mode=input?.mode,times=input?.times,timeZone=String(input?.timeZone||"");
  const p256dh=String(input?.keys?.p256dh||""),auth=String(input?.keys?.auth||"");
  try{if(fromBase64url(p256dh).length!==65||fromBase64url(auth).length!==16)return error("Invalid reminder request",400,"invalid_reminder");}catch(e){return error("Invalid reminder request",400,"invalid_reminder");}
  if(!endpoint||!["smart","custom"].includes(mode)||!Array.isArray(times)||!times.length||times.length>24||!times.every(t=>REMIND_AT.test(String(t))))return error("Invalid reminder request",400,"invalid_reminder");
  const smartTime=value=>mode==="smart"&&REMIND_AT.test(String(value||""))?String(value):null;
  const bedtimeAt=smartTime(input?.bedtimeAt),briefAt=smartTime(input?.briefAt),hardAt=smartTime(input?.hardAt),weekends=input?.weekends===false?0:1;
  const syncAt=REMIND_AT.test(String(input?.syncAt||""))?String(input.syncAt):null;
  const scheduled=Array.isArray(input?.schedule)?input.schedule.slice(0,100).filter(x=>SCHEDULE_KINDS.includes(x?.kind)&&Number.isFinite(Date.parse(x?.at))).map(x=>({at:new Date(x.at).toISOString(),kind:x.kind})):null;
  const stressTimes=Array.isArray(input?.stressTimes)?input.stressTimes.slice(0,14).map(String).filter(at=>Number.isFinite(Date.parse(at))):[];
  const schedule=JSON.stringify([...new Set(times.map(String))].sort());
  try{localTime(timeZone,new Date());}catch(e){return error("Invalid reminder request",400,"invalid_reminder");}
  await env.DB.prepare("INSERT INTO even_push_subscriptions(endpoint,owner_email,device_id,mode,times,time_zone,created_at,p256dh,auth,bedtime_at,brief_at,hard_at,weekends,sync_at,stress_times,schedule) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET schedule=excluded.schedule,sync_at=excluded.sync_at,stress_times=excluded.stress_times, bedtime_at=excluded.bedtime_at,brief_at=excluded.brief_at,hard_at=excluded.hard_at,weekends=excluded.weekends,p256dh=excluded.p256dh,auth=excluded.auth,owner_email=excluded.owner_email,device_id=excluded.device_id,mode=excluded.mode,times=excluded.times,time_zone=excluded.time_zone").bind(endpoint,owner,dev.id,mode,schedule,timeZone,new Date().toISOString(),p256dh,auth,bedtimeAt,briefAt,hardAt,weekends,syncAt,JSON.stringify(stressTimes),scheduled?JSON.stringify(scheduled):null).run();
  return reply({ok:true});
 }
 if(path==="/api/push/synced"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const items=Number(input?.items),key=pushKey(env);
  const sub=key&&await env.DB.prepare("SELECT endpoint,p256dh,auth FROM even_push_subscriptions WHERE device_id=? AND owner_email=? AND p256dh IS NOT NULL").bind(dev.id,owner).first();
  if(!sub||!Number.isInteger(items)||items<0)return reply({ok:true,state:"none"});
  const sent=await deliverPush(env,key,sub,new Date(),pushPayload(env,"Sync finished. Tap to open Even.","/?sync=1"));
  return reply({ok:true,state:sent.ok?"sent":"none"});
 }
 if(path==="/api/push/check-in"&&request.method==="POST"){
  await env.DB.prepare("UPDATE even_push_subscriptions SET last_check_in_at=? WHERE owner_email=?").bind(new Date().toISOString(),owner).run();
  return reply({ok:true});
 }
 if(path==="/api/push/unsubscribe"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid reminder request",400,"invalid_reminder");}
  await env.DB.prepare("DELETE FROM even_push_subscriptions WHERE endpoint=? AND owner_email=?").bind(String(input?.endpoint||""),owner).run();
  return reply({ok:true});
 }
 if(path==="/api/calendars"&&request.method==="GET"){
  return reply({ok:true,calendars:await calendarList(env,owner)});
 }
 if(path==="/api/calendars"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid calendar request",400,"invalid_calendar");}
  const name=String(input?.name||"");
  if(!name||name.length>100||typeof input.enabled!=="boolean")return error("Invalid calendar request",400,"invalid_calendar");
  const updated=await env.DB.prepare("UPDATE even_calendars SET enabled=? WHERE owner_email=? AND name=?").bind(input.enabled?1:0,owner,name).run();
  if(!updated.meta?.changes)return error("Calendar not found",404,"calendar_not_found");
  const saved=input.enabled?null:await env.DB.prepare("SELECT COUNT(*) AS count FROM even_calendar_events WHERE owner_email=? AND calendar=?").bind(owner,name).first();
  return reply({ok:true,savedEvents:Number(saved?.count||0)});
 }
 if(path==="/api/calendars/events/delete"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid calendar request",400,"invalid_calendar");}
  const name=String(input?.name||"");
  if(!name||name.length>100)return error("Invalid calendar request",400,"invalid_calendar");
  const removed=await env.DB.prepare("DELETE FROM even_calendar_events WHERE owner_email=? AND calendar=?").bind(owner,name).run();
  return reply({ok:true,removed:removed.meta?.changes||0});
 }
 if(path==="/api/profile/name"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const name=String(input?.name||"").trim().replace(/[\x00-\x1f]/g,"").slice(0,60);
  if(name)await env.DB.prepare("INSERT INTO even_names(email,name,set_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,set_by=excluded.set_by,updated_at=excluded.updated_at").bind(owner,name,owner,new Date().toISOString()).run();
  else await env.DB.prepare("DELETE FROM even_names WHERE email=?").bind(owner).run();
  const current=await displayName(env,owner);
  return reply({ok:true,name:current,firstName:firstName(current)});
 }
 if(path==="/api/sync/settings"&&request.method==="GET"){
  return reply({ok:true,settings:await syncChoices(env,owner)});
 }
 if(path==="/api/sync/settings"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  if(!SYNC_KINDS.includes(input?.kind)||typeof input.enabled!=="boolean")return error("Even couldn't read that setting.",400,"invalid_setting");
  const off=await syncOff(env,owner);
  if(input.enabled)off.delete(input.kind);else off.add(input.kind);
  await env.DB.prepare("UPDATE even_users SET sync_off=? WHERE email=?").bind(JSON.stringify([...off]),owner).run();
  return reply({ok:true});
 }
 if(path==="/api/moods/settings"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  if(typeof input?.enabled!=="boolean")return error("Even couldn't read that setting.",400,"invalid_setting");
  const statements=[env.DB.prepare("UPDATE even_users SET mood_sync=? WHERE email=?").bind(input.enabled?1:0,owner)];
  if(!input.enabled)statements.push(env.DB.prepare("DELETE FROM even_moods WHERE owner_email=?").bind(owner));
  await env.DB.batch(statements);
  return reply({ok:true,enabled:input.enabled});
 }
 if(path==="/api/moods"&&request.method==="GET"){
  return reply({ok:true,...await syncedMoods(env,owner)});
 }
 if(path==="/api/moods"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const user=await env.DB.prepare("SELECT mood_sync FROM even_users WHERE email=?").bind(owner).first();
  if(!user?.mood_sync)return error("Turn on check-in sync first.",409,"mood_sync_off");
  const moods=(Array.isArray(input?.moods)?input.moods.slice(0,100):[]).map(readMood).filter(Boolean);
  const deleted=(Array.isArray(input?.deleted)?input.deleted.slice(0,100):[]).map(String).filter(id=>id&&id.length<=80);
  const at=new Date().toISOString(),statements=[];
  moods.forEach(m=>statements.push(env.DB.prepare("INSERT INTO even_moods(owner_email,id,ts,score,energy,stress,tags,note,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_email,id) DO UPDATE SET ts=excluded.ts,score=excluded.score,energy=excluded.energy,stress=excluded.stress,tags=excluded.tags,note=excluded.note,updated_at=excluded.updated_at WHERE even_moods.deleted_at IS NULL").bind(owner,m.id,m.ts,m.score,m.energy,m.stress,m.tags,m.note,at)));
  // A deleted check-in keeps only its ID, so other devices can remove their copy.
  deleted.forEach(id=>statements.push(env.DB.prepare("INSERT INTO even_moods(owner_email,id,ts,updated_at,deleted_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,id) DO UPDATE SET score=NULL,energy=NULL,stress=NULL,tags=NULL,note=NULL,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at").bind(owner,id,at,at,at)));
  if(statements.length)await env.DB.batch(statements);
  return reply({ok:true,saved:moods.length,deleted:deleted.length});
 }
 // Everything the app shows about this device and account, so coming back to the app takes one request.
 if(path==="/api/session"&&request.method==="GET"){
  const [status,release,calendars,settings,moods]=await Promise.all([deviceStatus(env,dev,owner),loadShortcutRelease(env),calendarList(env,owner),syncChoices(env,owner),syncedMoods(env,owner)]);
  if(!status)return error("This device was revoked",401,"device_revoked");
  return reply({ok:true,status,release,calendars,settings,moods});
 }
 if(path==="/api/sync/status"&&request.method==="GET"){
  const status=await deviceStatus(env,dev,owner);
  if(!status)return error("This device was revoked",401,"device_revoked");
  return reply({ok:true,...status});
 }
 if(path==="/api/shortcut/release"&&request.method==="GET"){
  const release=await loadShortcutRelease(env);
  if(!release)return error("No Shortcut release is configured",503,"no_release");
  const installed=new URL(request.url).searchParams.get("current")||"";
  const updateAvailable=release.verified&&semverNewer(release.version,installed);
  return reply({ok:true,release,updateAvailable,updateStatus:updateAvailable?"new_release":"current",automaticReplacement:false});
 }
 if(path==="/api/shortcut/hello"&&request.method==="POST"){
  let body;try{body=await payload(request);}catch(e){return error("Even couldn't read that request.",400,"invalid_body");}
  const clientVersion=String(body?.shortcutVersion||"").trim();
  if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clientVersion))return error("A valid Shortcut version is required",400,"invalid_version");
  const at=new Date().toISOString();
  await env.DB.prepare("UPDATE even_devices SET last_attempt_at=?,last_error_code=NULL,shortcut_version=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL")
   .bind(at,clientVersion,dev.id,owner).run();
  const nights=await env.DB.prepare("SELECT COUNT(*) AS count FROM even_health_metrics WHERE owner_email=? AND metric='bedtimeMin'").bind(owner).first();
  // Even Sync 3 learns about a new version here, so it needs no separate request.
  const release=await loadShortcutRelease(env),updateAvailable=!!release&&release.verified&&semverNewer(release.version,clientVersion);
  // Even Sync reads its settings here, so they take effect with no extra request.
  const off=await syncOff(env,owner),settings=Object.fromEntries(SYNC_KINDS.map(kind=>["sync"+kind[0].toUpperCase()+kind.slice(1),off.has(kind)?"off":"on"]));
  return reply({ok:true,connected:true,state:"connected",shortcutVersion:clientVersion,receivedAt:at,sleepHistory:Number(nights?.count||0)<3?"needed":"complete",updateStatus:updateAvailable?"new_release":"current",...settings,calendarsOff:await calendarsOffPattern(env,owner)});
 }

 if(path==="/api/pull"&&request.method==="GET"){
  const [health,events,alarms]=await Promise.all([
   env.DB.prepare("SELECT day,metric,value FROM even_health_metrics WHERE owner_email=? ORDER BY day DESC LIMIT 3000").bind(owner).all(),
   env.DB.prepare("SELECT event_id,start_time,end_time,title,category FROM even_calendar_events WHERE owner_email=? AND (calendar IS NULL OR calendar NOT IN (SELECT name FROM even_calendars WHERE owner_email=? AND enabled=0)) ORDER BY start_time DESC LIMIT 1200").bind(owner,owner).all(),
   env.DB.prepare("SELECT time_min,days,enabled,label FROM even_alarms WHERE owner_email=? ORDER BY time_min").bind(owner).all()
  ]);
  const grouped={};for(const h of health.results||[]){
   if(!grouped[h.day])grouped[h.day]={date:h.day,source:"shortcut"};
   grouped[h.day][h.metric]=h.value;
  }
  return reply({ok:true,email:owner,firstName:firstName(await displayName(env,owner)),name:await displayName(env,owner),health:Object.values(grouped),events:(events.results||[]).map(e=>({id:e.event_id,start:e.start_time,end:e.end_time,title:e.title,category:e.category,source:"shortcut"})),alarms:(alarms.results||[]).map(a=>({timeMin:a.time_min,days:a.days?a.days.split(",").map(Number):[],enabled:a.enabled!==0,label:a.label||null})),syncAt:new Date().toISOString()});
 }
 if(path==="/api/ingest"&&request.method==="POST"){
  let input;
  try{input=await payload(request);}
  catch(e){await recordSyncFailure(env,dev,"invalid_body");return error("Even couldn't read this upload.",400,"invalid_body");}
  if(!input||typeof input!=="object"){
   await recordSyncFailure(env,dev,"invalid_body");return error("Even couldn't read this upload.",400,"invalid_body");
  }
  const kind=String(input.kind||"").toLowerCase();
  // A setting changed since the handshake still applies to this upload.
  const off=await syncOff(env,owner);
  if((off.has("calendar")&&kind==="calendar_days")||(off.has("alarms")&&kind==="alarms"))return reply({ok:true,state:"accepted",skipped:true});
  if(kind==="calendar_days"){
   const day=dateOnly(input.date),offset=String(input.utcOffset||"").trim();
   if(!day||!UTC_OFFSET.test(offset))return error("Invalid calendar sync details",400,"invalid_calendar_details");
   const tomorrow=nextDay(day),events=await enabledEvents(env,owner,readEventRecords(input.events).filter(e=>e.day===day||e.day===tomorrow));
   const at=new Date().toISOString(),statements=await Promise.all(events.map(e=>eventStatement(env,owner,e,at)));
   for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
   // Both days are complete, so anything the run didn't send was edited or deleted.
   const from=new Date(day+"T00:00:00"+offset),to=new Date(from.getTime()+172800000);
   const removed=await env.DB.prepare("DELETE FROM even_calendar_events WHERE owner_email=? AND start_time>=? AND start_time<? AND updated_at<?").bind(owner,from.toISOString(),to.toISOString(),at).run();
   const shortcutVersion=await markUpload(env,dev,input.shortcutVersion,at,{events:events.length});
   return reply({ok:true,state:"accepted",receivedAt:at,calendarEvents:events.length,removed:removed.meta?.changes||0,shortcutVersion});
  }
  if(kind==="alarms"){
   const raw=String(input.alarms||""),alarms=readAlarms(raw),day=dateOnly(input.date);
   if(!day||(raw.trim()&&!alarms.length))return error("Invalid alarm details",400,"invalid_alarm_details");
   const at=new Date().toISOString(),first=firstAlarm(alarms,day);
   const statements=[env.DB.prepare("DELETE FROM even_alarms WHERE owner_email=?").bind(owner)];
   alarms.forEach((a,position)=>statements.push(env.DB.prepare("INSERT INTO even_alarms(owner_email,position,time_min,days,enabled,label,updated_at) VALUES(?,?,?,?,?,?,?)").bind(owner,position,a.timeMin,a.days.join(","),a.enabled,a.label,at)));
   if(first!==null)statements.push(env.DB.prepare("INSERT INTO even_health_metrics(owner_email,day,metric,value,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,day,metric) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(owner,day,"firstAlarmMin",first,at));
   await env.DB.batch(statements);
   return reply({ok:true,state:"accepted",alarms:alarms.length});
  }
  if(kind!=="health"){
   await recordSyncFailure(env,dev,"invalid_kind");return error("Even couldn't read this upload.",400,"invalid_kind");
  }
  const allMetrics=(Array.isArray(input.days)?input.days.slice(0,75):[input]).flatMap(readHealth),metrics=allMetrics.filter(x=>!off.has(METRIC_KINDS[x.metric]));
  if(allMetrics.length&&!metrics.length)return reply({ok:true,state:"accepted",skipped:true});
  if(!metrics.length){
   await recordSyncFailure(env,dev,"no_valid_records");
   return error(NO_VALID_RECORDS,400,"no_valid_records");
  }
  const at=new Date().toISOString(),statements=[];
  metrics.forEach(x=>statements.push(env.DB.prepare("INSERT INTO even_health_metrics(owner_email,day,metric,value,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,day,metric) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(owner,x.day,x.metric,x.value,at)));
  for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
  const clientVersion=await markUpload(env,dev,input.shortcutVersion,at,{health:metrics.length});
  return reply({ok:true,state:"accepted",receivedAt:at,kind,healthMetrics:metrics.length,shortcutVersion:clientVersion});
 }
 if(path==="/api/account/delete"&&request.method==="POST"){
  await env.DB.batch(accountStatements(env,owner));
  return reply({ok:true,deleted:true,email:owner});
 }
 if(path==="/api/device/disconnect"&&request.method==="POST"){
  await env.DB.batch([
   env.DB.prepare("DELETE FROM even_push_subscriptions WHERE device_id=? AND owner_email=?").bind(dev.id,owner),
   env.DB.prepare("UPDATE even_devices SET revoked_at=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(new Date().toISOString(),dev.id,owner)
  ]);
  return reply({ok:true});
 }
 if(path==="/api/erase"&&request.method==="POST"){
  await env.DB.batch([...syncedDataStatements(env,owner),env.DB.prepare("UPDATE even_users SET mood_sync=0 WHERE email=?").bind(owner)]);
  return reply({ok:true,erased:true,email:owner});
 }
 return error("Not found",404,"not_found");
}
async function api(request,env,ctx,path){
 if(path==="/api/status"&&request.method==="GET")return reply({ok:true,app:"Even",version:"2.28.0",sync:"email-access"});
 if(path.startsWith("/api/signin/"))return signinApi(request,env,ctx,path);
 if(path.startsWith("/api/user/"))return authApi(request,env,ctx,path);
 return syncApi(request,env,path);
}

// iOS names an imported Shortcut after its file, and release assets can't contain spaces.
// Files come from the deployed version, so code and pages always match. The Worker runs first to add its headers.
async function asset(request,env,path){
 const file=await env.STATIC.fetch(new Request(new URL(path==="/"?"/index.html":path,request.url),request));
 const headers=new Headers(file.headers);
 for(const [name,value] of Object.entries(SECURITY))headers.set(name,value);
 headers.set("Cache-Control","no-cache, max-age=0, must-revalidate");
 if(path==="/sw.js")headers.set("Service-Worker-Allowed","/");
 return new Response(file.body,{status:file.status,headers});
}
export default {async fetch(request,env,ctx){
 try{const path=new URL(request.url).pathname;if(path.startsWith("/api/"))return await api(request,env,ctx,path);
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405,headers:SECURITY});
 return await asset(request,env,path);
 }catch(e){return error("Request could not be processed",500,"server_error");}
},
async scheduled(event,env,ctx){ctx.waitUntil(sendReminders(env));}};