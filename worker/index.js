import BRAND from "../brand/brand.json";
import STABLE from "../brand/stable.json";
import LOOK_NAMES from "../brand/catalog/names.json";
// Account sign-in and owner-scoped device sync.
// All server tokens are generated randomly, stored only as SHA-256 hashes, and revocable.
// /api/user/* needs a signed-in session. All other routes reject
// unauthenticated sync operations unless a valid, unrevoked device token is supplied.
const ICLOUD_SHORTCUT=/^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/i;
async function overLimit(limiter,key){return !!limiter&&!(await limiter.limit({key})).success;}
async function canRelease(env,email){return !!await env.DB.prepare("SELECT 1 AS allowed FROM health_release_emails WHERE email=?").bind(email).first();}
function ownerEmails(env){try{return JSON.parse(env.APPROVED_SYNC_EMAILS||"[]").map(email=>String(email).trim().toLowerCase());}catch(e){return [];}}
async function approved(env,email){
 if(ownerEmails(env).includes(email))return true;
 return !!await env.DB.prepare("SELECT 1 AS allowed FROM health_approved_emails WHERE email=?").bind(email).first();
}
const SECURITY={"X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"};
const METRICS={sleepHours:[0,24],steps:[0,100000],hrv:[0,500],restingHR:[20,250],workoutMin:[0,1440]};
const SEMVER=/^\d{1,3}\.\d{1,3}\.\d{1,3}$/,UTC_OFFSET=/^(Z|[+-]\d{2}:\d{2})$/;
const CATS=["Meeting","Work","Exercise","Social","Family","Rest","Commute","Other"];
// One line per failure, from named fields only, so no body, email, title or key can reach the logs.
const LOG_FIELDS=["route","status","code","error","subscriptions","sent","failed"];
function logEvent(event,fields={}){
 const line={event};
 for(const name of LOG_FIELDS)if(fields[name]!==undefined)line[name]=fields[name];
 console.log(JSON.stringify(line));
}
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
const VERSION_NAME="2.55.3";
function normalEmail(value){return String(value||"").trim().toLowerCase();}
async function signinAuth(env,ctx,request){
 const {createAuth}=await import("./signin.mjs");
 // Compared with configured addresses, so a request's Host can never choose the sign-in address.
 const relay=!!request&&!!env.GOOGLE_RELAY_ORIGIN&&new URL(request.url).origin===env.GOOGLE_RELAY_ORIGIN;
 return createAuth(env,{appName:BRAND.name,baseURL:relay?env.GOOGLE_RELAY_ORIGIN:env.PUBLIC_ORIGIN,isApproved:email=>approved(env,email),redeemInstallCode:code=>redeemInstallCode(env,code),deliverCode:(email,code)=>{const sent=sendSigninCode(env,email,code);if(ctx?.waitUntil)ctx.waitUntil(sent);}});
}
// Only a session from the app's sign-in proves who someone is, and approval is checked on every request.
async function authIdentity(request,env,ctx){
 if(!(request.headers.get("cookie")||"").includes("health.session_token"))return null;
 try{
  const session=await (await signinAuth(env,ctx)).api.getSession({headers:request.headers}),identity=session?.user;
  const email=normalEmail(identity?.email);
  return email&&await approved(env,email)?{email,name:String(identity.name||"").trim().slice(0,80),signedInAt:session.session?.createdAt}:null;
 }catch(e){logEvent("sign_in_check_failed",{error:e?.name});return null;}
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
 const device=await env.DB.prepare("SELECT device_id,owner_email,revoked_at,created_at,last_used_at,last_attempt_at,last_seen_at FROM health_devices WHERE token_hash=?").bind(tokenHash).first();
 if(!device||device.revoked_at||!await approved(env,device.owner_email))return null;
 const now=new Date().toISOString(),active=lastActive(device);
 if(active&&Date.now()-Date.parse(active)>DEVICE_EXPIRY_MS){
  await env.DB.prepare("UPDATE health_devices SET revoked_at=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(now,device.device_id,device.owner_email).run();
  return null;
 }
 if(String(device.last_seen_at||"").slice(0,10)!==now.slice(0,10))await env.DB.prepare("UPDATE health_devices SET last_seen_at=? WHERE device_id=?").bind(now,device.device_id).run();
 return {id:device.device_id,owner:device.owner_email};
}
// Everything synced for one person, apart from their account and devices.
function syncedDataStatements(env,owner,keepMoods){
 return [env.DB.prepare("UPDATE health_users SET look=NULL,look_name=NULL WHERE email=?").bind(owner),...(keepMoods?[]:[env.DB.prepare("DELETE FROM health_install_codes WHERE email=?").bind(owner),env.DB.prepare("DELETE FROM health_shared WHERE owner_email=?").bind(owner),env.DB.prepare("DELETE FROM health_moods WHERE owner_email=?").bind(owner),env.DB.prepare("DELETE FROM health_reflections WHERE owner_email=?").bind(owner)]),
  env.DB.prepare("UPDATE health_devices SET last_upload_counts=NULL WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM health_metrics WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM health_hidden_days WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM health_title_rules WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM health_calendar_events WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM health_calendars WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM health_alarms WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM health_push_subscriptions WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM health_names WHERE email=?").bind(owner)
 ];
}
function accountStatements(env,owner){
 return [...syncedDataStatements(env,owner),
  env.DB.prepare("DELETE FROM health_devices WHERE owner_email=?").bind(owner),
  env.DB.prepare("DELETE FROM health_signin_sessions WHERE userId IN (SELECT id FROM health_signin_users WHERE email=?)").bind(owner),
  env.DB.prepare("DELETE FROM health_signin_accounts WHERE userId IN (SELECT id FROM health_signin_users WHERE email=?)").bind(owner),
  env.DB.prepare("DELETE FROM health_signin_users WHERE email=?").bind(owner),
  env.DB.prepare("DELETE FROM health_users WHERE email=?").bind(owner)];
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
const METRIC_KINDS={sleepHours:"sleep",bedtimeMin:"sleep",sleepInBed:"sleep",steps:"steps",restingHR:"restingHR",hrv:"hrv",workoutMin:"workout"};
async function syncOff(env,owner){
 const row=await env.DB.prepare("SELECT sync_off FROM health_users WHERE email=?").bind(owner).first();
 try{return new Set(JSON.parse(row?.sync_off||"[]"));}catch(e){return new Set();}
}
// Matches only turned-off calendars. With none off, it matches nothing.
async function calendarsOffPattern(env,owner){
 const off=await env.DB.prepare("SELECT name FROM health_calendars WHERE owner_email=? AND enabled=0").bind(owner).all();
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
// Sleep arrives as the start and end of each sample. Overlapping samples from more than one device are merged,
// each night is filed under the morning it ends, and daytime naps don't count. Time in bed runs longer than sleep, so it
// only counts for a night with nothing else, and that night is marked. When the Shortcut reached its sample limit,
// the oldest night may be cut off, so it's left as it was.
function sleepNights(text){
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
 return nights;
}
function readSleep(text,samples,limit,inBedText){
 const asleepNights=sleepNights(text),bedNights=sleepNights(inBedText);
 const days=[...new Set([...asleepNights.keys(),...bedNights.keys()])].sort(),cap=Number(limit);
 if(cap>0&&Number(samples)>=cap)days.shift();
 return days.flatMap(day=>{
  const inBed=!asleepNights.has(day),night=inBed?bedNights.get(day):asleepNights.get(day);
  const spans=night.spans.sort((a,b)=>a[0]-b[0]);
  let total=0,[from,to]=spans[0];
  for(const [s,e] of spans.slice(1)){if(s>to){total+=to-from;from=s;to=e;}else if(e>to)to=e;}
  total+=to-from;
  return [{day,metric:"sleepHours",value:Math.round(total/36000)/100},{day,metric:"bedtimeMin",value:night.bed},{day,metric:"sleepInBed",value:inBed?1:0}];
 });
}
// Some locales write decimals with a comma.
function measure(raw){const value=String(raw).trim();return Number(/^\d+,\d+$/.test(value)?value.replace(",","."):value);}
// Each measure can carry its own date, because its latest daily total may be from an earlier day.
function readHealth(x){
 if(!x||typeof x!=="object")return [];
 const base=dateOnly(x.date||x.day),results=[...readBedtimes(x.sleepStarts),...readSleep(x.sleepIntervals,x.sleepSamples,x.sleepLimit,x.sleepInBed)];
 for(const [metric,[low,high]] of Object.entries(METRICS)){
  const raw=x[metric];if(raw===undefined||raw===null||String(raw).trim()==="")continue;
  const day=dateOnly(x[metric+"Date"])||base,value=measure(raw);
  if(day&&Number.isFinite(value)&&value>=low&&value<=high)results.push({day,metric,value});
 }
 // the Shortcut 3.3 and later send up to a week of each measure as day=value pairs.
 for(const [metric,[low,high]] of Object.entries(METRICS)){
  for(const pair of String(x[metric+"Recent"]||"").split("␞").filter(Boolean).slice(0,7)){
   const[rawDay,rawValue]=pair.split("="),day=dateOnly(rawDay),value=measure(rawValue);
   if(day&&Number.isFinite(value)&&value>=low&&value<=high)results.push({day,metric,value});
  }
 }
 return results;
}
// Whether a measure was sent at all, even an invalid one. Average heart rate from older Shortcuts doesn't count, and
// neither do sleep intervals, because a night that may be cut off is left out on purpose rather than rejected.
const CALENDAR_PURPOSES=["Work","Family","Exercise","Social","Rest","Other"];
// English words only. A calendar's purpose fills in what the title doesn't say.
function classifyCalendarTitle(title){
 if(/\b(meeting|call|standup|stand-up|sync|1:1|one on one|interview|review)\b/i.test(title))return "Meeting";
 if(/\b(workout|gym|run|running|training|yoga|pilates|swim|swimming|hike|cycling)\b/i.test(title))return "Exercise";
 if(/\b(coffee|lunch|dinner|brunch|drinks|party)\b/i.test(title))return "Social";
 if(/\b(commute|travel to work)\b/i.test(title))return "Commute";
 return "Other";
}
const normalTitle=title=>String(title||"").normalize("NFC").trim().replace(/\s+/g," ").toLowerCase();
// The one place an event's type is decided: a rule for its title, then the title's words, then its calendar's purpose. A type a person chose for one event stays out of this.
function categoryFor(title,rules,purpose){
 const rule=rules.get(normalTitle(title));
 if(rule)return {category:rule,from:"rule"};
 const found=classifyCalendarTitle(title);
 if(found!=="Other"||!purpose)return {category:found,from:"title"};
 return {category:purpose,from:"calendar"};
}
function readEvent(x){
 if(!x||typeof x!=="object")return null;
 const start=new Date(x.start||x.start_time),end=new Date(x.end||x.end_time);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>172800000)return null;
 const title=String(x.title||"Calendar event").trim().slice(0,100)||"Calendar event";
 const category=CATS.includes(x.category)?x.category:classifyCalendarTitle(title);
 return {start:start.toISOString(),end:end.toISOString(),title,category,calendar:String(x.calendar||"").trim().slice(0,100)||null};
}
// the Shortcut sends upcoming events as records of start, end, calendar and title, so each day it covers arrives complete.
// What the Shortcut reads in one search. It repeats part of the day, so a run can hold more.
const EVENT_LIMIT=150;
function readEventRecords(text){
 const seen=new Set(),events=[];
 for(const record of String(text||"").split("\u241e")){
  if(events.length>=EVENT_LIMIT*2)break;
  const [start="",end="",calendar="",...title]=record.split("\u241f");
  const day=dateOnly(start.trim().slice(0,10)),event=day&&readEvent({start:start.trim(),end:end.trim(),calendar,title:title.join("\u241f")});
  if(!event||seen.has(event.start+"|"+event.end+"|"+event.title))continue;
  seen.add(event.start+"|"+event.end+"|"+event.title);events.push({...event,day});
 }
 return events;
}
async function eventStatement(env,owner,e,at){
 const eventId=(await digest(e.start+"|"+e.end+"|"+e.title)).slice(0,40);
 return env.DB.prepare("INSERT INTO health_calendar_events(owner_email,event_id,start_time,end_time,title,category,calendar,updated_at,category_from) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_email,event_id) DO UPDATE SET title=excluded.title,category=CASE WHEN health_calendar_events.category_from='you' THEN health_calendar_events.category ELSE excluded.category END,category_from=CASE WHEN health_calendar_events.category_from='you' THEN 'you' ELSE excluded.category_from END,calendar=excluded.calendar,updated_at=excluded.updated_at").bind(owner,eventId,e.start,e.end,e.title,e.category,e.calendar,at,e.categoryFrom||null);
}
// Requests within ten minutes belong to one run of the Shortcut, so their counts are kept together.
async function markUpload(env,dev,version,at,counts){
 const claimed=String(version||"").trim(),clientVersion=SEMVER.test(claimed)?claimed:null,sent=JSON.stringify(counts);
 await env.DB.prepare("UPDATE health_devices SET last_used_at=?,last_attempt_at=?,last_error_code=NULL,shortcut_version=COALESCE(?,shortcut_version),last_upload_counts=CASE WHEN last_used_at>? THEN json_patch(COALESCE(last_upload_counts,'{}'),?) ELSE ? END WHERE device_id=? AND owner_email=? AND revoked_at IS NULL")
  .bind(at,at,clientVersion,new Date(Date.parse(at)-600000).toISOString(),sent,sent,dev.id,dev.owner).run();
 return clientVersion;
}
// A name set by a developer comes first, then one given for a release account, then the one from sign-in.
async function displayName(env,email){
 const row=await env.DB.prepare("SELECT (SELECT name FROM health_names WHERE email=?) AS chosen,(SELECT display_name FROM health_release_emails WHERE email=?) AS given,(SELECT name FROM health_users WHERE email=?) AS signin").bind(email,email,email).first();
 return row?.chosen||row?.given||row?.signin||null;
}
function firstName(name){return String(name||"").trim().split(/\s+/)[0]||null;}
function escapeHtml(text){return String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function saveTesterName(env,tester,value,by){
 const name=String(value||"").trim().replace(/[\x00-\x1f]/g,"").slice(0,60);
 if(name)await env.DB.prepare("INSERT INTO health_names(email,name,set_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,set_by=excluded.set_by,updated_at=excluded.updated_at").bind(tester,name,by,new Date().toISOString()).run();
 else await env.DB.prepare("DELETE FROM health_names WHERE email=?").bind(tester).run();
}
async function sendInvite(env,to,from){
 if(!env.RESEND_API_KEY)return false;
 const url=env.PUBLIC_ORIGIN+"/";
 // The same steps, in the same words, as the setup card in the app.
 const steps=["Open the link in Safari on your iPhone. Tap Share (or ••• and then Share), then Add to Home Screen.","Open "+BRAND.name+" from your Home Screen and sign in with this email. We'll send you a one-time code.","Tap Get "+STABLE.sync+", then Run "+STABLE.sync+", to bring in your sleep, activity, calendar and alarms."];
 try{
  const guest=firstName(await displayName(env,to)),host=firstName(await displayName(env,from));
  const opening=(host?host+" invited you":"You've been invited")+" to try "+BRAND.name+", "+BRAND.pitch+".",hello=guest?"Hi "+guest+",":"";
  const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({
   from:BRAND.name+" <"+BRAND.inviteFrom+">",to:[to],subject:host?host+" invited you to try "+BRAND.name:"You're invited to try "+BRAND.name,
   text:(hello?hello+"\n\n":"")+opening+"\n\n"+url+"\n\n"+steps.map((s,i)=>(i+1)+". "+s).join("\n")+"\n\nHow "+BRAND.name+" works: "+url+"whitepaper.html",
   html:(hello?"<p>"+escapeHtml(hello)+"</p>":"")+"<p>"+escapeHtml(opening)+'</p><p><a href="'+url+'">Open '+BRAND.name+'</a></p><ol>'+steps.map(s=>"<li>"+s+"</li>").join("")+'</ol><p><a href="'+url+'whitepaper.html">How '+BRAND.name+' works</a></p>'
  })});
  return sent.ok;
 }catch(e){return false;}
}
async function sendSigninCode(env,to,code){
 if(!env.RESEND_API_KEY)return false;
 try{
  const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({
   from:BRAND.name+" <"+BRAND.codeFrom+">",to:[to],subject:"Your "+BRAND.name+" code: "+code,
   text:"Your code is "+code+". It works for 10 minutes.\n\nIf you didn't ask for it, you can ignore this email.",
   html:"<p>Your code is <strong>"+code+"</strong>. It works for 10 minutes.</p><p>If you didn't ask for it, you can ignore this email.</p>"
  })});
  return sent.ok;
 }catch(e){return false;}
}
const FRESH_SIGN_IN_MS=600000,SENDS_AN_HOUR=5;
const SIGNIN_ROUTES={"POST /install/redeem":true,"POST /email-otp/send-verification-otp":1,"POST /sign-in/email-otp":1,"POST /sign-in/social":1,"GET /callback/google":1,"POST /callback/google":1,"POST /sign-out":1};
// The relay's last step can't tell who started a sign-in, so someone else's link could otherwise sign a person in to the wrong account.
// A random value goes in a cookie on this browser and in the return address, and the two must match.
const GOOGLE_START="__Host-health-google",GOOGLE_PARAM="google";
const RELAY_ROUTE="/callback/google/oauth-proxy";
const googleCookie=(value,age)=>GOOGLE_START+"="+value+"; Path=/; Max-Age="+age+"; HttpOnly; Secure; SameSite=Lax";
const readCookie=(request,name)=>(request.headers.get("cookie")||"").split(/;\s*/).find(part=>part.startsWith(name+"="))?.slice(name.length+1)||"";
async function startGoogle(request){
 const input=await request.json().catch(()=>null);
 if(typeof input?.callbackURL!=="string"||!URL.canParse(input.callbackURL))return {refused:error("That request couldn't be read.",400,"invalid_body")};
 const value=secureRandomHex(),back=new URL(input.callbackURL);
 back.searchParams.set(GOOGLE_PARAM,value);
 return {value,request:new Request(request,{body:JSON.stringify({...input,callbackURL:back.href})})};
}
function googleStartedHere(request){
 const back=new URL(request.url).searchParams.get("callbackURL")||"",value=URL.canParse(back)?new URL(back).searchParams.get(GOOGLE_PARAM):"";
 return !!value&&value===readCookie(request,GOOGLE_START);
}
function withoutGoogleParam(location){
 if(!location||!URL.canParse(location))return location;
 const url=new URL(location);url.searchParams.delete(GOOGLE_PARAM);return url.href;
}
async function signinApi(request,env,ctx,path){
 const route=path.slice("/api/signin".length),relay=!!env.GOOGLE_RELAY_ORIGIN,finishing=relay&&route===RELAY_ROUTE&&request.method==="GET";
 let started=null;
 if(finishing&&!googleStartedHere(request))return new Response(null,{status:303,headers:{...SECURITY,"Location":new URL(request.url).origin+"/?auth=failed#data","Set-Cookie":googleCookie("",0),"Cache-Control":"no-store"}});
 if(relay&&route==="/sign-in/social"&&request.method==="POST"){
  started=await startGoogle(request.clone());
  if(started.refused)return started.refused;
  request=started.request;
 }
 if(route==="/options"&&request.method==="GET")return reply({ok:true,google:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET)});
 if(!SIGNIN_ROUTES[request.method+" "+route]&&!finishing)return error("Not found",404,"not_found");
 if(route==="/install/redeem"&&await overLimit(env.NETWORK_LIMIT,request.headers.get("cf-connecting-ip")||"unknown"))return error("Too many tries. Try again in a minute.",429,"rate_limited");
 if(route==="/email-otp/send-verification-otp"||route==="/sign-in/email-otp"){
  let input;try{input=await request.clone().json();}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const email=normalEmail(input?.email);
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error("Enter a valid email address.",400,"invalid_email");
  if(route==="/sign-in/email-otp"){
   if(await overLimit(env.SIGNIN_LIMIT,email))return error("Too many tries. Try again in a minute.",429,"rate_limited");
  }else{
   // Every limit comes first, so the answers can't be used to find out who's approved.
   if(await overLimit(env.SEND_LIMIT,email))return error("A code was just sent. Check your email.",429,"code_just_sent");
   // The network's address is only a key here, and is never stored.
   if(await overLimit(env.NETWORK_LIMIT,request.headers.get("cf-connecting-ip")||"unknown"))return error("Too many tries. Try again in a minute.",429,"rate_limited");
   const hour=new Date().toISOString().slice(0,13),sends=await env.DB.prepare("INSERT INTO health_service(key,value,updated_at) VALUES(?,'1',?) ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1,updated_at=excluded.updated_at RETURNING value").bind("sends:"+(await digest(email))+":"+hour,new Date().toISOString()).first();
   if(Number(sends?.value)>SENDS_AN_HOUR)return error("Too many codes this hour. Use your latest code, or try again later.",429,"rate_limited");
   if(input.type!=="sign-in"||!await approved(env,email))return reply({success:true});
  }
 }
 const response=await (await signinAuth(env,ctx,request)).handler(request);
 const headers=new Headers(response.headers);
 for(const [name,value] of Object.entries(SECURITY))headers.set(name,value);
 headers.set("Cache-Control","no-store");
 if(started&&response.ok)headers.append("Set-Cookie",googleCookie(started.value,600));
 if(finishing){
  headers.append("Set-Cookie",googleCookie("",0));
  if(headers.has("Location"))headers.set("Location",withoutGoogleParam(headers.get("Location")));
 }
 return new Response(response.body,{status:response.status,headers});
}
async function authApi(request,env,ctx,path){
 const identity=await authIdentity(request,env,ctx),email=identity?.email||null;
 if(!email)return error("Sign in with an approved email.",401,"sign_in_required");
 // Only a signed-in session can erase or delete. A device key alone can't.
 if(path==="/api/user/erase"||path==="/api/user/account/delete"){
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  if(path==="/api/user/erase"){
   // Each check-in keeps only its ID, so every device removes its copy instead of sending it back.
   const at=new Date().toISOString();
   await env.DB.batch([env.DB.prepare("UPDATE health_moods SET ts=?,score=NULL,energy=NULL,stress=NULL,tags=NULL,note=NULL,updated_at=?,deleted_at=? WHERE owner_email=? AND deleted_at IS NULL").bind(at,at,at,email),env.DB.prepare("UPDATE health_reflections SET ts=?,answers=NULL,updated_at=?,deleted_at=? WHERE owner_email=? AND deleted_at IS NULL").bind(at,at,at,email),env.DB.prepare("UPDATE health_shared SET data=NULL,updated_at=?,deleted_at=? WHERE owner_email=? AND deleted_at IS NULL").bind(at,at,email),...syncedDataStatements(env,email,true)]);
   return reply({ok:true,erased:true,email});
  }
  if(Date.now()-Date.parse(identity.signedInAt)>FRESH_SIGN_IN_MS)return error("Sign in again to delete your account.",403,"fresh_sign_in_required");
  await env.DB.batch(accountStatements(env,email));
  return reply({ok:true,deleted:true,email});
 }
 if(path==="/api/user/me"&&request.method==="GET"){
  // Sign-in may supply a name. Testers are listed by it.
  try{
   if(identity.name)await env.DB.prepare("UPDATE health_users SET name=? WHERE email=? AND (name IS NULL OR name<>?)").bind(identity.name,email,identity.name).run();
  }catch(e){logEvent("name_update_failed",{route:path,error:e?.name});}
  const r=await env.DB.prepare("SELECT device_id,label,created_at,last_used_at,last_attempt_at,last_error_code,shortcut_version,revoked_at FROM health_devices WHERE owner_email=? ORDER BY created_at DESC LIMIT 30").bind(email).all();
  const person=firstName(await displayName(env,email));
  const welcome=await env.DB.prepare("SELECT display_name FROM health_release_emails WHERE email=? AND display_name IS NOT NULL AND welcomed_at IS NULL").bind(email).first();
  const release=await canRelease(env,email);
  const service=release?await env.DB.prepare("SELECT updated_at,(SELECT COUNT(*) FROM health_push_subscriptions WHERE last_push_status IS NOT NULL AND (last_push_status<200 OR last_push_status>=300)) AS failing FROM health_service WHERE key=?").bind("last_cron").first():null;
  return reply({ok:true,email,canRelease:release,service:service?{lastCron:service.updated_at,failing:Number(service.failing||0),version:VERSION_NAME}:null,helper:release?await loadHelperLink(env):null,firstName:person,name:await displayName(env,email),welcomeName:welcome?person:null,devices:(r.results||[]).map(d=>({id:d.device_id,label:d.label,createdAt:d.created_at,lastUsedAt:d.last_used_at,lastAttemptAt:d.last_attempt_at,lastErrorCode:d.last_error_code,shortcutVersion:d.shortcut_version,revoked:!!d.revoked_at}))});
 }
 if(path==="/api/user/install-code"){
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  if(request.method!=="POST")return error("Not found",404,"not_found");
  const bytes=crypto.getRandomValues(new Uint8Array(32)),code=[...bytes].map(byte=>byte.toString(16).padStart(2,"0")).join(""),now=new Date();
  await env.DB.batch([
   env.DB.prepare("DELETE FROM health_install_codes WHERE email=? OR expires_at<?").bind(email,now.toISOString()),
   env.DB.prepare("INSERT INTO health_install_codes(code_hash,email,expires_at) VALUES(?,?,?)").bind(await digest(code),email,new Date(now.getTime()+INSTALL_CODE_MS).toISOString())
  ]);
  return reply({ok:true,code});
 }
 if(path==="/api/user/device"){
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const label=String(input.label||"iPhone").trim().replace(/[\x00-\x1f]/g,"").slice(0,64)||"iPhone";
  await env.DB.prepare("UPDATE health_devices SET revoked_at=? WHERE owner_email=? AND revoked_at IS NULL AND COALESCE(last_seen_at,last_used_at,last_attempt_at,created_at)<?").bind(new Date().toISOString(),email,new Date(Date.now()-DEVICE_EXPIRY_MS).toISOString()).run();
  const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM health_devices WHERE owner_email=? AND revoked_at IS NULL").bind(email).first();
  if(Number(count?.count||0)>=10)return error("Ten active devices maximum; revoke one first",429,"device_limit");
  const token=secureRandomHex(),deviceId=crypto.randomUUID(),at=new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO health_users(email,created_at) VALUES(?,?)").bind(email,at).run();
  await env.DB.prepare("INSERT INTO health_devices(token_hash,device_id,owner_email,label,created_at) VALUES(?,?,?,?,?)").bind(await digest(token),deviceId,email,label,at).run();
  return reply({ok:true,email,token,deviceId,label,createdAt:at});
 }
 if(path.startsWith("/api/user/testers")){
  if(!await canRelease(env,email))return error("This account can't manage testers",403,"not_release_account");
  if(path==="/api/user/testers"&&request.method==="GET"){
   const [added,developers,users,chosen]=await Promise.all([
    env.DB.prepare("SELECT email FROM health_approved_emails").bind().all(),
    env.DB.prepare("SELECT email,display_name FROM health_release_emails").bind().all(),
    env.DB.prepare("SELECT email,name FROM health_users").bind().all(),
    env.DB.prepare("SELECT email,name FROM health_names").bind().all()
   ]);
   const chosenNames=new Map((chosen.results||[]).map(r=>[r.email,r.name]));
   const removable=new Set((added.results||[]).map(r=>r.email)),signInNames=new Map((users.results||[]).map(r=>[r.email,r.name])),names=new Map((developers.results||[]).map(r=>[r.email,r.display_name])),signedIn=new Set((users.results||[]).map(r=>r.email));
   ownerEmails(env).forEach(owner=>removable.delete(owner));
   const everyone=[...new Set([...ownerEmails(env),...names.keys(),...(added.results||[]).map(r=>r.email)])].sort();
   const looks=await env.DB.prepare("SELECT look,COUNT(*) AS count FROM health_users WHERE look IS NOT NULL GROUP BY look").bind().all();
   return reply({ok:true,looks:looks.results||[],testers:everyone.map(address=>({email:address,name:chosenNames.get(address)||names.get(address)||signInNames.get(address)||null,signedIn:signedIn.has(address),removable:removable.has(address)}))});
  }
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const tester=String(input?.email||"").trim().toLowerCase();
  if(tester.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tester))return error("Enter a valid email address.",400,"invalid_email");
  if((path==="/api/user/testers"||path==="/api/user/testers/invite")&&await overLimit(env.INVITE_LIMIT,email))return error("That's a lot of invitations at once. Try again in a minute.",429,"rate_limited");
  if(path==="/api/user/testers"){
   await env.DB.prepare("INSERT OR IGNORE INTO health_approved_emails(email,added_by,created_at) VALUES(?,?,?)").bind(tester,email,new Date().toISOString()).run();
   // Saved first, so the invitation greets them by name. Leaving it blank keeps any name already set.
   if(String(input?.name||"").trim())await saveTesterName(env,tester,input.name,email);
   return reply({ok:true,emailed:await sendInvite(env,tester,email)});
  }
  if(path==="/api/user/testers/invite"){
   if(!await approved(env,tester)&&!await canRelease(env,tester))return error("Add this email first.",404,"not_a_tester");
   return reply({ok:true,emailed:await sendInvite(env,tester,email)});
  }
  if(path==="/api/user/testers/name"){
   if(!await approved(env,tester)&&!await canRelease(env,tester))return error("Add this email first.",404,"not_a_tester");
   await saveTesterName(env,tester,input?.name,email);
   return reply({ok:true,name:await displayName(env,tester)});
  }
  if(path==="/api/user/testers/remove"){
   if(ownerEmails(env).includes(tester)||tester===email)return error("This account can't be removed.",400,"not_removable");
   await env.DB.batch([env.DB.prepare("DELETE FROM health_approved_emails WHERE email=?").bind(tester),...accountStatements(env,tester)]);
   return reply({ok:true});
  }
  return error("Not found",404,"not_found");
 }
 if(path==="/api/user/welcomed"){
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  await env.DB.prepare("UPDATE health_release_emails SET welcomed_at=? WHERE email=? AND welcomed_at IS NULL").bind(new Date().toISOString(),email).run();
  return reply({ok:true});
 }
 if(path==="/api/user/device/rename"){
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const deviceId=String(input.deviceId||""),label=String(input.label||"").trim().replace(/[\x00-\x1f]/g,"").slice(0,64);
  if(!/^[\w-]{12,80}$/.test(deviceId))return error("Invalid device identifier",400,"invalid_device");
  if(!label)return error("Enter a name for this device.",400,"invalid_label");
  const result=await env.DB.prepare("UPDATE health_devices SET label=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(label,deviceId,email).run();
  if(!result.meta?.changes)return error("Device not found",404,"device_not_found");
  return reply({ok:true,label});
 }
 if(path==="/api/user/revoke"){
  if(!browserPostAllowed(request))return error("This request isn't allowed.",403,"same_origin_required");
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const deviceId=String(input.deviceId||"");
  if(!/^[\w-]{12,80}$/.test(deviceId))return error("Invalid device identifier",400,"invalid_device");
  const result=await env.DB.prepare("UPDATE health_devices SET revoked_at=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(new Date().toISOString(),deviceId,email).run();
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
// The link The helper last shared, so Set Up Release Helper installs the current helper.
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
 await env.DB.prepare("UPDATE health_devices SET last_attempt_at=?,last_error_code=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL")
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
async function titleRules(env,owner){
 const rows=await env.DB.prepare("SELECT title,category FROM health_title_rules WHERE owner_email=?").bind(owner).all();
 return new Map((rows.results||[]).map(r=>[r.title,r.category]));
}
async function calendarPurposes(env,owner){
 const rows=await env.DB.prepare("SELECT name,category FROM health_calendars WHERE owner_email=?").bind(owner).all();
 return new Map((rows.results||[]).map(c=>[c.name,c.category]));
}
// Retypes stored events from their title and calendar. Types a person chose for one event are left alone.
async function retypeEvents(env,owner,keep){
 const [rules,purposes,rows]=await Promise.all([titleRules(env,owner),calendarPurposes(env,owner),env.DB.prepare("SELECT event_id,title,calendar,category,category_from FROM health_calendar_events WHERE owner_email=?").bind(owner).all()]);
 const updates=[];
 for(const e of rows.results||[]){
  if(e.category_from==="you"||!keep(e))continue;
  const chosen=categoryFor(e.title,rules,purposes.get(e.calendar));
  if(chosen.category!==e.category||chosen.from!==e.category_from)updates.push(env.DB.prepare("UPDATE health_calendar_events SET category=?,category_from=? WHERE owner_email=? AND event_id=?").bind(chosen.category,chosen.from,owner,e.event_id));
 }
 for(let i=0;i<updates.length;i+=50)await env.DB.batch(updates.slice(i,i+50));
}
const RULE_LIMIT=200,CHANGE_LIMIT=100;
// Changes a person made to what a sync wrote. Each answers on its own, and repeating one changes nothing.
async function applyChange(env,owner,change){
 const op=String(change?.op||""),id=String(change?.id||"");
 if(op==="hide"||op==="show"){
  if(change.kind==="event"){
   if(!id||id.length>64)return {ok:false,code:"invalid_change"};
   await env.DB.prepare("UPDATE health_calendar_events SET hidden=? WHERE owner_email=? AND event_id=?").bind(op==="hide"?1:0,owner,id).run();
   return {ok:true};
  }
  if(change.kind==="health"){
   const day=dateOnly(id);
   if(!day)return {ok:false,code:"invalid_change"};
   if(op==="hide")await env.DB.prepare("INSERT OR IGNORE INTO health_hidden_days(owner_email,day) VALUES(?,?)").bind(owner,day).run();
   else await env.DB.prepare("DELETE FROM health_hidden_days WHERE owner_email=? AND day=?").bind(owner,day).run();
   return {ok:true};
  }
  return {ok:false,code:"invalid_change"};
 }
 if(op==="type"){
  if(!id||id.length>64||!CATS.includes(change.category))return {ok:false,code:"invalid_change"};
  await env.DB.prepare("UPDATE health_calendar_events SET category=?,category_from='you' WHERE owner_email=? AND event_id=?").bind(change.category,owner,id).run();
  return {ok:true};
 }
 if(op==="untype"){
  if(!id||id.length>64)return {ok:false,code:"invalid_change"};
  await env.DB.prepare("UPDATE health_calendar_events SET category_from=NULL WHERE owner_email=? AND event_id=?").bind(owner,id).run();
  await retypeEvents(env,owner,e=>e.event_id===id);
  return {ok:true};
 }
 if(op==="rule"||op==="unrule"){
  const label=String(change.title||"").trim().replace(/\s+/g," "),title=normalTitle(label);
  if(!title||label.length>100)return {ok:false,code:"invalid_change"};
  if(op==="unrule"){
   await env.DB.prepare("DELETE FROM health_title_rules WHERE owner_email=? AND title=?").bind(owner,title).run();
  }else{
   if(!CATS.includes(change.category))return {ok:false,code:"invalid_change"};
   const rules=await titleRules(env,owner);
   if(!rules.has(title)&&rules.size>=RULE_LIMIT)return {ok:false,code:"too_many_rules"};
   await env.DB.prepare("INSERT INTO health_title_rules(owner_email,title,label,category,created_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,title) DO UPDATE SET category=excluded.category").bind(owner,title,label,change.category,new Date().toISOString()).run();
  }
  await retypeEvents(env,owner,e=>normalTitle(e.title)===title);
  return {ok:true};
 }
 return {ok:false,code:"invalid_change"};
}
async function enabledEvents(env,owner,events){
 const names=[...new Set(events.map(e=>e.calendar).filter(Boolean))];
 if(!names.length)return events;
 await env.DB.batch(names.map(name=>env.DB.prepare("INSERT OR IGNORE INTO health_calendars(owner_email,name) VALUES(?,?)").bind(owner,name)));
 const saved=await env.DB.prepare("SELECT name,enabled,category FROM health_calendars WHERE owner_email=?").bind(owner).all();
 const calendars=new Map((saved.results||[]).map(c=>[c.name,c]));
 const rules=await titleRules(env,owner);
 return events.filter(e=>calendars.get(e.calendar)?.enabled!==0).map(e=>{const chosen=categoryFor(e.title,rules,calendars.get(e.calendar)?.category);return {...e,category:chosen.category,categoryFrom:chosen.from};});
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
 return JSON.stringify({web_push:8030,mutable:true,...extra,notification:{title:BRAND.name,body,navigate:env.PUBLIC_ORIGIN+path}});
}
// A first name goes only on the messages that start or close the day, or come at a hard moment.
// Each planned item says which part of the day it's in. An app that hasn't updated yet leaves it out, so the clock decides.
function partFromClock(minutes){return minutes<300?"evening":minutes<660?"morning":minutes<840?"midday":minutes<1020?"afternoon":"evening";}
function reminderMessage(minutes,atBedtime,atHardTime,name,part){
 if(atBedtime)return name?"Bedtime soon, "+name+". Take a moment to check in, then rest.":"Bedtime soon. Take a moment to check in, then rest.";
 if(atHardTime)return name?name+", this is often a harder part of your day. How are you doing?":"This is often a harder part of your day. How are you doing?";
 const at=part||partFromClock(minutes);
 if(at==="morning")return name?"Good morning, "+name+". How are you starting the day?":"Good morning. How are you starting the day?";
 if(at==="midday")return "How is your day going so far?";
 if(at==="afternoon")return "Afternoon check-in. How is your energy?";
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
 if(sent.status===404||sent.status===410)await env.DB.prepare("DELETE FROM health_push_subscriptions WHERE endpoint=?").bind(endpoint).run();
 else await env.DB.prepare("UPDATE health_push_subscriptions SET last_push_status=? WHERE endpoint=?").bind(sent.status,endpoint).run();
 return sent;
}
const SMART_QUIET_MS=5400000;
// The phone keeps the same limits (LIMITS in app.js).
const LIMITS={moods:6000,healthDays:1200,events:2000},HEALTH_MEASURES=8;
const SCHEDULE_KINDS=["custom","brief","bedtime","hard","reflection"],SCHEDULE_PARTS=["morning","midday","afternoon","evening"],WEEK_MS=604800000,REMINDER_BATCH=5,SYNC_STALE_MS=72000000,DUE_WINDOW_MS=3600000;
// Sent ahead of an anticipated hard moment. The device fills in the specific message.
async function sendAnticipation(env,key,sub,now){
 const last=sub.last_stress_at?Date.parse(sub.last_stress_at):0;
 const due=JSON.parse(sub.stress_times||"[]").filter(at=>{const t=Date.parse(at);return t<=now.getTime()&&now.getTime()-t<DUE_WINDOW_MS&&t>last;}).sort();
 if(!due.length)return false;
 const at=due[due.length-1];
 const sent=await deliverPush(env,key,sub,now,pushPayload(env,firstName(sub.person)?firstName(sub.person)+", a harder stretch may be coming. Take a minute?":"A harder stretch may be coming. Take a minute?","/?do=reset",{stressAt:at}));
 if(sent.ok)await env.DB.prepare("UPDATE health_push_subscriptions SET last_stress_at=? WHERE endpoint=?").bind(at,sub.endpoint).run();
 return sent.ok;
}
// Only for people who have synced before and haven't lately.
async function sendSyncReminder(env,key,sub,now,local){
 if(!sub.sync_at||sub.last_sync_prompt_day===local.day||!sub.last_used_at)return;
 if(now.getTime()-Date.parse(sub.last_used_at)<SYNC_STALE_MS)return;
 const [hour,minute]=sub.sync_at.split(":").map(Number),at=hour*60+minute;
 if(local.minutes<at||local.minutes-at>=60)return;
 const sent=await deliverPush(env,key,sub,now,pushPayload(env,"Time to sync. Tap to run "+STABLE.sync+".","/?do=sync"));
 if(sent.ok)await env.DB.prepare("UPDATE health_push_subscriptions SET last_sync_prompt_day=? WHERE endpoint=?").bind(local.day,sub.endpoint).run();
}
async function sendReminders(env,now=new Date()){
 const key=pushKey(env);if(!key)return;
 const subs=await env.DB.prepare("SELECT s.endpoint,s.p256dh,s.auth,s.mode,s.sync_at,s.last_sync_prompt_day,s.stress_times,s.last_stress_at,s.schedule,s.last_schedule_at,d.last_used_at,s.time_zone,s.last_check_in_at,COALESCE((SELECT name FROM health_names n WHERE n.email=s.owner_email),(SELECT display_name FROM health_release_emails r WHERE r.email=s.owner_email),(SELECT name FROM health_users u WHERE u.email=s.owner_email)) AS person FROM health_push_subscriptions s JOIN health_devices d ON d.device_id=s.device_id WHERE d.revoked_at IS NULL AND s.p256dh IS NOT NULL AND s.schedule IS NOT NULL").bind().all();
 const rows=subs.results||[];
 let failed=0;
 // A failure stays with its own subscription, and a slow endpoint holds up only its small group.
 for(let i=0;i<rows.length;i+=REMINDER_BATCH){
  await Promise.all(rows.slice(i,i+REMINDER_BATCH).map(async sub=>{
   try{await notifySubscriber(env,key,sub,now);}
   catch(e){failed++;logEvent("notify_failed",{error:e?.name});await env.DB.prepare("UPDATE health_push_subscriptions SET last_push_status=? WHERE endpoint=?").bind(0,sub.endpoint).run().catch(()=>{});}
  }));
 }
 return {subscriptions:rows.length,failed};
}
// At most one notification a run. Whatever else is due goes out on a later run, while it's still within its hour.
async function notifySubscriber(env,key,sub,now){
 const local=localTime(sub.time_zone,now);
 if(await sendAnticipation(env,key,sub,now))return;
 if(await sendScheduled(env,key,sub,now))return;
 await sendSyncReminder(env,key,sub,now,local);
}
// The same local time some weeks later, so a repeat stays put across a clock change.
function sameLocalTime(at,weeks,timeZone){
 const moved=at+weeks*WEEK_MS;
 let shift=localTime(timeZone,new Date(at)).minutes-localTime(timeZone,new Date(moved)).minutes;
 if(shift>720)shift-=1440;
 if(shift<-720)shift+=1440;
 return moved+shift*60000;
}
// The latest dated notification now due. A plan that has run out repeats its last week until the app is next opened.
function dueScheduled(schedule,now,after,timeZone){
 let due=null;
 for(const item of schedule){
  let at=Date.parse(item.at);
  if(at<now-DUE_WINDOW_MS){
   const weeks=Math.max(1,Math.floor((now-DUE_WINDOW_MS-at)/WEEK_MS)),next=sameLocalTime(at,weeks,timeZone);
   at=next<now-DUE_WINDOW_MS?sameLocalTime(at,weeks+1,timeZone):next;
  }
  if(at<=now&&at>after&&(!due||at>due.at))due={at,kind:item.kind,part:item.part};
 }
 return due;
}
async function sendScheduled(env,key,sub,now){
 const due=dueScheduled(JSON.parse(sub.schedule),now.getTime(),sub.last_schedule_at?Date.parse(sub.last_schedule_at):0,sub.time_zone);
 if(!due)return false;
 const quiet=sub.mode==="smart"&&sub.last_check_in_at&&now.getTime()-new Date(sub.last_check_in_at).getTime()<SMART_QUIET_MS;
 const minutes=localTime(sub.time_zone,new Date(due.at)).minutes,custom=sub.mode!=="smart";
 const reflection=due.kind==="reflection",body=reflection?"Your weekly reflection is ready.":custom?"How are you feeling?":reminderMessage(minutes,due.kind==="bedtime",due.kind==="hard",firstName(sub.person),due.part);
 const sent=quiet&&!reflection?{ok:true}:await deliverPush(env,key,sub,now,pushPayload(env,body,reflection?"/?do=reflect":"/#checkin",{brief:due.kind==="brief"}));
 if(sent.ok)await env.DB.prepare("UPDATE health_push_subscriptions SET last_schedule_at=? WHERE endpoint=?").bind(new Date(due.at).toISOString(),sub.endpoint).run();
 return sent.ok&&!quiet;
}
const BUILDS="https://github.com/Bishvili/health/releases/download/shortcut-latest/";
async function latestBuildVersion(name){
 const file=await fetch(BUILDS+name+"-version.txt");
 if(!file.ok)return null;
 const version=(await file.text()).trim();
 return SEMVER.test(version)?version:null;
}
// One lasting link for each build. iOS names an imported Shortcut after its file, and release assets can't hold a space, so the name is set here.
async function shortcutBuild(path){
 const[,role,version]=path.match(/^\/api\/shortcut\/build\/(sync|helper|check)(\/version)?$/)||[];
 if(!role)return error("Not found",404,"not_found");
 const file=await fetch(BUILDS+role+(version?"-version.txt":".shortcut"));
 if(!file.ok)return error("The latest build couldn't be checked",502,"build_unavailable");
 const headers={...SECURITY,"Cache-Control":"no-cache"};
 if(version)return new Response(file.body,{headers:{...headers,"Content-Type":"text/plain; charset=utf-8"}});
 return new Response(file.body,{headers:{...headers,"Content-Type":"application/octet-stream","Content-Disposition":'attachment; filename="'+(role==="sync"?STABLE.sync:role==="check"?"Health Check":STABLE.helper)+'.shortcut"'}});
}
// Published versions can't be edited, so a link only passes if it names the expected Shortcut.
async function shortcutName(link){
 try{
  const record=await fetch("https://www.icloud.com/shortcuts/api/records/"+link.split("/").pop());
  return record.ok?String((await record.json())?.fields?.name?.value||""):"";
 }catch(e){return "";}
}
async function startWorkflow(env,file,inputs){
 const started=await fetch("https://api.github.com/repos/Bishvili/health/actions/workflows/"+file+"/dispatches",{method:"POST",headers:{"Authorization":"Bearer "+env.GITHUB_API_KEY,"Accept":"application/vnd.github+json","Content-Type":"application/json","User-Agent":"health","X-GitHub-Api-Version":"2022-11-28"},body:JSON.stringify({ref:"main",inputs})});
 return started.status===204;
}
async function calendarList(env,owner){
 const r=await env.DB.prepare("SELECT name,enabled,category FROM health_calendars WHERE owner_email=? ORDER BY name").bind(owner).all();
 return (r.results||[]).map(c=>({name:c.name,enabled:!!c.enabled,category:c.category||"Other"}));
}
async function syncChoices(env,owner){
 const off=await syncOff(env,owner);
 return Object.fromEntries(SYNC_KINDS.map(kind=>[kind,!off.has(kind)]));
}
// Only what changed since the app last asked. The cursor is read first, so a change made during this query is sent again rather than missed.
async function syncedMoods(env,owner,since){
 const cursor=new Date().toISOString(),from=Number.isFinite(Date.parse(since))?new Date(since).toISOString():"";
 const rows=await env.DB.prepare("SELECT id,ts,score,energy,stress,tags,note,deleted_at FROM health_moods WHERE owner_email=? AND updated_at>=? ORDER BY ts DESC LIMIT ?").bind(owner,from,LIMITS.moods).all();
 const live=(rows.results||[]).filter(m=>!m.deleted_at);
 return{email:owner,cursor,
  moods:live.map(m=>{let tags=[];try{tags=JSON.parse(m.tags||"[]");}catch(e){/* Unreadable tags read as none. */}return{id:m.id,ts:m.ts,score:m.score,energy:m.energy,stress:m.stress,tags,note:m.note||""};}),
  deleted:(rows.results||[]).filter(m=>m.deleted_at).map(m=>m.id)};
}
const SHARED_KINDS=new Set(["resets","tries","planLog","planMoves","health","events"]),SHARED_LIMIT=12000;
async function syncedShared(env,owner,since){
 const cursor=new Date().toISOString(),from=Number.isFinite(Date.parse(since))?new Date(since).toISOString():"";
 const rows=await env.DB.prepare("SELECT kind,key,data,deleted_at FROM health_shared WHERE owner_email=? AND updated_at>=? LIMIT ?").bind(owner,from,SHARED_LIMIT).all();
 const list=rows.results||[],items=[];
 for(const row of list)if(!row.deleted_at){try{items.push({kind:row.kind,key:row.key,data:JSON.parse(row.data)});}catch(e){/* An unreadable record is left out. */}}
 return {email:owner,cursor,items,deleted:list.filter(row=>row.deleted_at).map(row=>({kind:row.kind,key:row.key}))};
}
const REFLECTION_IDS=["snapped","setOff","recovered","rested"],REFLECTION_LIMIT=520;
function readReflection(x){
 const id=String(x?.id||""),ts=new Date(x?.ts),answers=x?.answers;
 if(!id||id.length>80||!Number.isFinite(ts.getTime())||ts.getTime()>Date.now()+86400000)return null;
 if(!answers||typeof answers!=="object"||Object.keys(answers).length!==REFLECTION_IDS.length)return null;
 if(!REFLECTION_IDS.every(key=>Number.isInteger(answers[key])&&answers[key]>=0&&answers[key]<=4))return null;
 return {id,ts:ts.toISOString(),answers:JSON.stringify(Object.fromEntries(REFLECTION_IDS.map(key=>[key,answers[key]])))};
}
async function syncedReflections(env,owner,since){
 const cursor=new Date().toISOString(),from=Number.isFinite(Date.parse(since))?new Date(since).toISOString():"";
 const rows=await env.DB.prepare("SELECT id,ts,answers,deleted_at FROM health_reflections WHERE owner_email=? AND updated_at>=? ORDER BY ts DESC LIMIT ?").bind(owner,from,REFLECTION_LIMIT).all();
 const list=rows.results||[];
 return {cursor,
  reflections:list.filter(r=>!r.deleted_at).map(r=>{let answers=null;try{answers=JSON.parse(r.answers);}catch(e){/* Unreadable answers are left out. */}return {id:r.id,ts:r.ts,answers};}).filter(r=>r.answers),
  deleted:list.filter(r=>r.deleted_at).map(r=>r.id)};
}
async function deviceStatus(env,dev,owner){
 const [device,h,c,received]=await Promise.all([
  env.DB.prepare("SELECT last_used_at,last_attempt_at,last_error_code,shortcut_version,last_upload_counts FROM health_devices WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(dev.id,owner).first(),
  env.DB.prepare("SELECT COUNT(*) AS count FROM health_metrics WHERE owner_email=?").bind(owner).first(),
  env.DB.prepare("SELECT COUNT(*) AS count FROM health_calendar_events WHERE owner_email=?").bind(owner).first(),
  env.DB.prepare("SELECT metric,MAX(day) AS day,COUNT(*) AS days FROM health_metrics WHERE owner_email=? GROUP BY metric").bind(owner).all()
 ]);
 if(!device)return null;
 let lastUpload=null;
 try{lastUpload=device.last_upload_counts?JSON.parse(device.last_upload_counts):null;}catch(e){/* Unreadable counts read as none. */}
 return{credentialValid:true,deviceId:dev.id,lastDataUploadAt:device.last_used_at||null,
  lastAttemptAt:device.last_attempt_at||null,lastErrorCode:device.last_error_code||null,
  installedShortcutVersion:device.shortcut_version||null,lastUpload,
  healthMetrics:Number(h?.count||0),calendarEvents:Number(c?.count||0),
  measures:Object.fromEntries((received.results||[]).map(m=>[m.metric,{lastDay:m.day,days:Number(m.days||0)}]))};
}
async function syncApi(request,env,path){
 const dev=await validDevice(request,env);
 if(!dev)return error("This iPhone isn't connected. Open "+BRAND.name+", go to Data, and tap Run "+STABLE.sync+".",401,"device_required");
 const owner=dev.owner;
 if(request.method==="POST"&&(path==="/api/ingest"||path.startsWith("/api/push/"))&&await overLimit(env.DEVICE_LIMIT,dev.id))return error("Too many requests. Try again in a minute.",429,"rate_limited");
 if(path==="/api/shortcut/release-state"&&request.method==="GET"){
  if(!await canRelease(env,owner))return error("This account can't publish releases",403,"not_release_account");
  const latest=await latestBuildVersion("sync");
  if(!latest)return error("The latest build couldn't be checked",502,"build_unavailable");
  const device=await env.DB.prepare("SELECT shortcut_version FROM health_devices WHERE device_id=? AND owner_email=?").bind(dev.id,owner).first();
  const published=(await loadShortcutRelease(env))?.version||null,installed=device?.shortcut_version||null;
  const helper=new URL(request.url).searchParams.get("helper")||"";
  // The helper 1 knows only these three states.
  if(!SEMVER.test(helper))return reply({ok:true,state:installed!==latest?"install":published!==latest?"publish":"current",latest,installed,published});
  const [source,latestHelper,shared]=await Promise.all([loadSourceVersions(env),latestBuildVersion("helper").catch(()=>null),loadHelperLink(env)]);
  const state=source.sync&&semverNewer(source.sync,latest)?"building":installed&&semverNewer(installed,latest)?"ahead":installed!==latest?"install":published!==latest?"publish":"current";
  const helperState=latestHelper&&semverNewer(latestHelper,helper)?"update":"current";
  const helperLinkState=helperState==="current"&&!(latestHelper&&semverNewer(helper,latestHelper))&&shared?.version!==helper?"share":"current";
  return reply({ok:true,state,latest,installed,published,helper,helperState,helperLinkState});
 }
 if(path==="/api/shortcut/publish"&&request.method==="POST"){
  if(!await canRelease(env,owner))return error("This account can't publish releases",403,"not_release_account");
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const link=String(input?.link||"").trim();
  if(!ICLOUD_SHORTCUT.test(link))return error("A valid Shortcut link is required",400,"invalid_link");
  if(await shortcutName(link)!==STABLE.sync)return error("That link isn't "+STABLE.sync+", so nothing was published.",400,"wrong_shortcut");
  return await startWorkflow(env,"publish-release.yml",{icloud_link:link})?reply({ok:true}):error("Publishing couldn't start",502,"publish_failed");
 }
 // The helper shares its own link, so Set Up Release Helper installs the current helper.
 if(path==="/api/shortcut/helper-link"&&request.method==="POST"){
  if(!await canRelease(env,owner))return error("This account can't publish releases",403,"not_release_account");
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const link=String(input?.link||"").trim();
  if(!ICLOUD_SHORTCUT.test(link))return error("A valid Shortcut link is required",400,"invalid_link");
  if(await shortcutName(link)!==STABLE.helper)return error("That link isn't "+STABLE.helper+", so nothing was shared.",400,"wrong_shortcut");
  return await startWorkflow(env,"helper-link.yml",{icloud_link:link})?reply({ok:true}):error("Sharing couldn't start",502,"share_failed");
 }
 if(path==="/api/push/key"&&request.method==="GET"){const key=pushKey(env);return reply({ok:true,key:key?pushPublicKey(key):null});}
 if(path==="/api/push/subscribe"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid reminder request",400,"invalid_reminder");}
  const endpoint=pushEndpoint(input?.endpoint),mode=input?.mode,timeZone=String(input?.timeZone||"");
  const p256dh=String(input?.keys?.p256dh||""),auth=String(input?.keys?.auth||"");
  try{if(fromBase64url(p256dh).length!==65||fromBase64url(auth).length!==16)return error("Invalid reminder request",400,"invalid_reminder");}catch(e){return error("Invalid reminder request",400,"invalid_reminder");}
  if(!endpoint||!["smart","custom"].includes(mode))return error("Invalid reminder request",400,"invalid_reminder");
  const syncAt=REMIND_AT.test(String(input?.syncAt||""))?String(input.syncAt):null;
  const scheduled=Array.isArray(input?.schedule)?input.schedule.slice(0,100).filter(x=>SCHEDULE_KINDS.includes(x?.kind)&&Number.isFinite(Date.parse(x?.at))&&(x.part===undefined||SCHEDULE_PARTS.includes(x.part))).map(x=>({at:new Date(x.at).toISOString(),kind:x.kind,...(x.part?{part:x.part}:{})})):null;
  if(!scheduled?.length)return error("Invalid reminder request",400,"invalid_reminder");
  const stressTimes=Array.isArray(input?.stressTimes)?input.stressTimes.slice(0,14).map(String).filter(at=>Number.isFinite(Date.parse(at))):[];
  try{localTime(timeZone,new Date());}catch(e){return error("Invalid reminder request",400,"invalid_reminder");}
  await env.DB.prepare("INSERT INTO health_push_subscriptions(endpoint,owner_email,device_id,mode,time_zone,created_at,p256dh,auth,sync_at,stress_times,schedule) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET schedule=excluded.schedule,sync_at=excluded.sync_at,stress_times=excluded.stress_times,p256dh=excluded.p256dh,auth=excluded.auth,owner_email=excluded.owner_email,device_id=excluded.device_id,mode=excluded.mode,time_zone=excluded.time_zone").bind(endpoint,owner,dev.id,mode,timeZone,new Date().toISOString(),p256dh,auth,syncAt,JSON.stringify(stressTimes),JSON.stringify(scheduled)).run();
  return reply({ok:true});
 }
 if(path==="/api/push/synced"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  // How many Health types the run saw, and how many it could read, tells "no data" from "nothing matched".
  const seen=Number(input?.healthSeen),matched=Number(input?.healthMatched);
  if(Number.isInteger(seen)&&seen>=0&&Number.isInteger(matched)&&matched>=0)await env.DB.prepare("UPDATE health_devices SET last_upload_counts=json_patch(COALESCE(last_upload_counts,'{}'),?) WHERE device_id=? AND owner_email=?").bind(JSON.stringify({healthSeen:seen,healthMatched:matched}),dev.id,owner).run();
  const items=Number(input?.items),key=pushKey(env);
  const sub=key&&await env.DB.prepare("SELECT endpoint,p256dh,auth FROM health_push_subscriptions WHERE device_id=? AND owner_email=? AND p256dh IS NOT NULL").bind(dev.id,owner).first();
  if(!sub||!Number.isInteger(items)||items<0)return reply({ok:true,state:"none"});
  const sent=await deliverPush(env,key,sub,new Date(),pushPayload(env,"Sync finished. Tap to open "+BRAND.name+".","/?sync=1"));
  return reply({ok:true,state:sent.ok?"sent":"none"});
 }
 if(path==="/api/push/check-in"&&request.method==="POST"){
  await env.DB.prepare("UPDATE health_push_subscriptions SET last_check_in_at=? WHERE owner_email=?").bind(new Date().toISOString(),owner).run();
  return reply({ok:true});
 }
 if(path==="/api/push/unsubscribe"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid reminder request",400,"invalid_reminder");}
  await env.DB.prepare("DELETE FROM health_push_subscriptions WHERE endpoint=? AND owner_email=?").bind(String(input?.endpoint||""),owner).run();
  return reply({ok:true});
 }
 if(path==="/api/calendars"&&request.method==="GET"){
  return reply({ok:true,calendars:await calendarList(env,owner)});
 }
 if(path==="/api/calendars"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid calendar request",400,"invalid_calendar");}
  const name=String(input?.name||"");
  if(name&&name.length<=100&&CALENDAR_PURPOSES.includes(input?.category)){
   const label=input.category==="Other"?null:input.category;
   const set=await env.DB.prepare("UPDATE health_calendars SET category=? WHERE owner_email=? AND name=?").bind(label,owner,name).run();
   if(!set.meta?.changes)return error("Calendar not found",404,"calendar_not_found");
   await retypeEvents(env,owner,e=>e.calendar===name);
   return reply({ok:true,category:input.category});
  }
  if(!name||name.length>100||typeof input.enabled!=="boolean")return error("Invalid calendar request",400,"invalid_calendar");
  const updated=await env.DB.prepare("UPDATE health_calendars SET enabled=? WHERE owner_email=? AND name=?").bind(input.enabled?1:0,owner,name).run();
  if(!updated.meta?.changes)return error("Calendar not found",404,"calendar_not_found");
  const saved=input.enabled?null:await env.DB.prepare("SELECT COUNT(*) AS count FROM health_calendar_events WHERE owner_email=? AND calendar=?").bind(owner,name).first();
  return reply({ok:true,savedEvents:Number(saved?.count||0)});
 }
 if(path==="/api/calendars/events/delete"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("Invalid calendar request",400,"invalid_calendar");}
  const name=String(input?.name||"");
  if(!name||name.length>100)return error("Invalid calendar request",400,"invalid_calendar");
  const removed=await env.DB.prepare("DELETE FROM health_calendar_events WHERE owner_email=? AND calendar=?").bind(owner,name).run();
  return reply({ok:true,removed:removed.meta?.changes||0});
 }
 if(path==="/api/context/changes"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const changes=input?.changes;
  if(!Array.isArray(changes)||!changes.length||changes.length>CHANGE_LIMIT)return error("Invalid changes",400,"invalid_changes");
  const results=[];
  for(const change of changes)results.push(await applyChange(env,owner,change));
  return reply({ok:true,results});
 }
 if(path==="/api/profile/name"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const name=String(input?.name||"").trim().replace(/[\x00-\x1f]/g,"").slice(0,60);
  if(name)await env.DB.prepare("INSERT INTO health_names(email,name,set_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,set_by=excluded.set_by,updated_at=excluded.updated_at").bind(owner,name,owner,new Date().toISOString()).run();
  else await env.DB.prepare("DELETE FROM health_names WHERE email=?").bind(owner).run();
  const current=await displayName(env,owner);
  return reply({ok:true,name:current,firstName:firstName(current)});
 }
 if(path==="/api/sync/settings"&&request.method==="GET"){
  return reply({ok:true,settings:await syncChoices(env,owner)});
 }
 if(path==="/api/sync/settings"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  if(!SYNC_KINDS.includes(input?.kind)||typeof input.enabled!=="boolean")return error("That setting couldn't be read.",400,"invalid_setting");
  const off=await syncOff(env,owner);
  if(input.enabled)off.delete(input.kind);else off.add(input.kind);
  await env.DB.prepare("UPDATE health_users SET sync_off=? WHERE email=?").bind(JSON.stringify([...off]),owner).run();
  return reply({ok:true});
 }
 if(path==="/api/moods"&&request.method==="GET"){
  return reply({ok:true,...await syncedMoods(env,owner,new URL(request.url).searchParams.get("since"))});
 }
 if(path==="/api/moods"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const moods=(Array.isArray(input?.moods)?input.moods.slice(0,100):[]).map(readMood).filter(Boolean);
  const deleted=(Array.isArray(input?.deleted)?input.deleted.slice(0,100):[]).map(String).filter(id=>id&&id.length<=80);
  const at=new Date().toISOString(),statements=[];
  moods.forEach(m=>statements.push(env.DB.prepare("INSERT INTO health_moods(owner_email,id,ts,score,energy,stress,tags,note,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_email,id) DO UPDATE SET ts=excluded.ts,score=excluded.score,energy=excluded.energy,stress=excluded.stress,tags=excluded.tags,note=excluded.note,updated_at=excluded.updated_at WHERE health_moods.deleted_at IS NULL").bind(owner,m.id,m.ts,m.score,m.energy,m.stress,m.tags,m.note,at)));
  // A deleted check-in keeps only its ID, so other devices can remove their copy.
  deleted.forEach(id=>statements.push(env.DB.prepare("INSERT INTO health_moods(owner_email,id,ts,updated_at,deleted_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,id) DO UPDATE SET ts=excluded.ts,score=NULL,energy=NULL,stress=NULL,tags=NULL,note=NULL,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at").bind(owner,id,at,at,at)));
  if(statements.length)await env.DB.batch(statements);
  return reply({ok:true,saved:moods.length,deleted:deleted.length});
 }
 if(path==="/api/shared"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const given=Array.isArray(input?.items)?input.items:[],gone=Array.isArray(input?.deleted)?input.deleted:[];
  if(given.length>100||gone.length>100)return error("Too many records",400,"too_many");
  const fine=item=>SHARED_KINDS.has(item?.kind)&&typeof item.key==="string"&&item.key.length>0&&item.key.length<=160;
  const items=given.map(item=>fine(item)&&item.data&&typeof item.data==="object"?{kind:item.kind,key:item.key,data:JSON.stringify(item.data)}:null);
  if(items.some(item=>!item||item.data.length>4000)||!gone.every(fine))return error("That record couldn't be read.",400,"invalid_record");
  const live=await env.DB.prepare("SELECT COUNT(*) AS count FROM health_shared WHERE owner_email=? AND deleted_at IS NULL").bind(owner).first();
  if(items.length&&Number(live?.count||0)+items.length>SHARED_LIMIT)return error("Too many records",400,"shared_limit");
  const at=new Date().toISOString(),statements=[];
  items.forEach(item=>statements.push(env.DB.prepare("INSERT INTO health_shared(owner_email,kind,key,data,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,kind,key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,deleted_at=NULL").bind(owner,item.kind,item.key,item.data,at)));
  gone.forEach(item=>statements.push(env.DB.prepare("INSERT INTO health_shared(owner_email,kind,key,updated_at,deleted_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,kind,key) DO UPDATE SET data=NULL,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at").bind(owner,item.kind,item.key,at,at)));
  if(statements.length)await env.DB.batch(statements);
  return reply({ok:true,saved:items.length,deleted:gone.length});
 }
 if(path==="/api/look"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const chosen=input?.look===null?null:lookFrom(input?.look,input?.name);
  if(chosen===undefined||(chosen===null&&input?.look!==null))return error("That look isn't available.",400,"invalid_look");
  await env.DB.prepare("UPDATE health_users SET look=?,look_name=? WHERE email=?").bind(chosen?.id||null,chosen?.typed||null,owner).run();
  return reply({ok:true,look:chosen?.id||null});
 }
 if(path==="/api/reflections"&&request.method==="GET"){
  return reply({ok:true,email:owner,...await syncedReflections(env,owner,new URL(request.url).searchParams.get("since"))});
 }
 if(path==="/api/reflections"&&request.method==="POST"){
  let input;try{input=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const given=Array.isArray(input?.reflections)?input.reflections:[],gone=Array.isArray(input?.deleted)?input.deleted:[];
  if(given.length>100||gone.length>100)return error("Too many reflections",400,"too_many");
  const reflections=given.map(readReflection);
  if(reflections.some(r=>!r))return error("That reflection couldn't be read.",400,"invalid_reflection");
  const deleted=gone.map(String).filter(id=>id&&id.length<=80);
  const live=await env.DB.prepare("SELECT COUNT(*) AS count FROM health_reflections WHERE owner_email=? AND deleted_at IS NULL").bind(owner).first();
  if(reflections.length&&Number(live?.count||0)+reflections.length>REFLECTION_LIMIT)return error("Too many reflections",400,"reflection_limit");
  const at=new Date().toISOString(),statements=[];
  reflections.forEach(r=>statements.push(env.DB.prepare("INSERT INTO health_reflections(owner_email,id,ts,answers,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,id) DO UPDATE SET ts=excluded.ts,answers=excluded.answers,updated_at=excluded.updated_at,deleted_at=NULL").bind(owner,r.id,r.ts,r.answers,at)));
  deleted.forEach(id=>statements.push(env.DB.prepare("INSERT INTO health_reflections(owner_email,id,ts,updated_at,deleted_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,id) DO UPDATE SET answers=NULL,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at").bind(owner,id,at,at,at)));
  if(statements.length)await env.DB.batch(statements);
  return reply({ok:true,saved:reflections.length,deleted:deleted.length});
 }
 // Everything the app shows about this device and account, so coming back to the app takes one request.
 if(path==="/api/session"&&request.method==="GET"){
  const params=new URL(request.url).searchParams;
  const [shared,look,status,release,calendars,settings,moods,reflections]=await Promise.all([syncedShared(env,owner,params.get("sharedSince")),env.DB.prepare("SELECT look,look_name FROM health_users WHERE email=?").bind(owner).first(),deviceStatus(env,dev,owner),loadShortcutRelease(env),calendarList(env,owner),syncChoices(env,owner),syncedMoods(env,owner,params.get("since")),syncedReflections(env,owner,params.get("reflectionsSince"))]);
  if(!status)return error("This device was revoked",401,"device_revoked");
  return reply({ok:true,status,release,calendars,settings,moods,reflections:{email:owner,...reflections},look:look?.look||null,lookName:look?.look_name||null,shared});
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
  let body;try{body=await payload(request);}catch(e){return error("That request couldn't be read.",400,"invalid_body");}
  const clientVersion=String(body?.shortcutVersion||"").trim();
  if(!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clientVersion))return error("A valid Shortcut version is required",400,"invalid_version");
  const at=new Date().toISOString();
  await env.DB.prepare("UPDATE health_devices SET last_attempt_at=?,last_error_code=NULL,shortcut_version=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL")
   .bind(at,clientVersion,dev.id,owner).run();
  const nights=await env.DB.prepare("SELECT COUNT(*) AS count FROM health_metrics WHERE owner_email=? AND metric='bedtimeMin'").bind(owner).first();
  // the Shortcut 3 learns about a new version here, so it needs no separate request.
  const release=await loadShortcutRelease(env),updateAvailable=!!release&&release.verified&&semverNewer(release.version,clientVersion);
  // the Shortcut reads its settings here, so they take effect with no extra request.
  const off=await syncOff(env,owner),settings=Object.fromEntries(SYNC_KINDS.map(kind=>["sync"+kind[0].toUpperCase()+kind.slice(1),off.has(kind)?"off":"on"]));
  return reply({ok:true,connected:true,state:"connected",shortcutVersion:clientVersion,receivedAt:at,sleepHistory:Number(nights?.count||0)<3?"needed":"complete",updateStatus:updateAvailable?"new_release":"current",...settings,calendarsOff:await calendarsOffPattern(env,owner)});
 }

 if(path==="/api/pull"&&request.method==="GET"){
  const [health,events,alarms,hiddenDays,rules]=await Promise.all([
   env.DB.prepare("SELECT day,metric,value FROM health_metrics WHERE owner_email=? ORDER BY day DESC LIMIT ?").bind(owner,LIMITS.healthDays*HEALTH_MEASURES).all(),
   env.DB.prepare("SELECT event_id,start_time,end_time,title,category,hidden,category_from FROM health_calendar_events WHERE owner_email=? AND (calendar IS NULL OR calendar NOT IN (SELECT name FROM health_calendars WHERE owner_email=? AND enabled=0)) ORDER BY start_time DESC LIMIT ?").bind(owner,owner,LIMITS.events).all(),
   env.DB.prepare("SELECT time_min,days,enabled,label FROM health_alarms WHERE owner_email=? ORDER BY time_min").bind(owner).all(),
   env.DB.prepare("SELECT day FROM health_hidden_days WHERE owner_email=?").bind(owner).all(),
   env.DB.prepare("SELECT label,category FROM health_title_rules WHERE owner_email=? ORDER BY label").bind(owner).all()
  ]);
  const hiddenDay=new Set((hiddenDays.results||[]).map(row=>row.day));
  const grouped={};for(const h of health.results||[]){
   if(!grouped[h.day])grouped[h.day]={date:h.day,source:"shortcut",hidden:hiddenDay.has(h.day)};
   grouped[h.day][h.metric]=h.value;
  }
  // A full page may have cut off older rows, so the app keeps its own older days and events.
  const complete={health:(health.results||[]).length<LIMITS.healthDays*HEALTH_MEASURES,events:(events.results||[]).length<LIMITS.events};
  return reply({ok:true,email:owner,complete,rules:(rules.results||[]).map(r=>({title:r.label,category:r.category})),firstName:firstName(await displayName(env,owner)),name:await displayName(env,owner),health:Object.values(grouped),events:(events.results||[]).map(e=>({id:e.event_id,start:e.start_time,end:e.end_time,title:e.title,category:e.category,hidden:!!e.hidden,categoryFrom:e.category_from||null,source:"shortcut"})),alarms:(alarms.results||[]).map(a=>({timeMin:a.time_min,days:a.days?a.days.split(",").map(Number):[],enabled:a.enabled!==0,label:a.label||null})),syncAt:new Date().toISOString()});
 }
 if(path==="/api/ingest"&&request.method==="POST"){
  let input;
  try{input=await payload(request);}
  catch(e){await recordSyncFailure(env,dev,"invalid_body");return error("This upload couldn't be read.",400,"invalid_body");}
  if(!input||typeof input!=="object"){
   await recordSyncFailure(env,dev,"invalid_body");return error("This upload couldn't be read.",400,"invalid_body");
  }
  const kind=String(input.kind||"").toLowerCase();
  // A setting changed since the handshake still applies to this upload.
  const off=await syncOff(env,owner);
  if((off.has("calendar")&&kind==="calendar_days")||(off.has("alarms")&&kind==="alarms"))return reply({ok:true,state:"accepted",skipped:true});
  if(kind==="calendar_days"){
   const day=dateOnly(input.date),offset=String(input.utcOffset||"").trim();
   if(!day||!UTC_OFFSET.test(offset))return error("Invalid calendar sync details",400,"invalid_calendar_details");
   // the Shortcut says how many days it read, from today. Earlier versions read 2 and don't say.
   const calendarDays=Math.min(8,Math.max(2,Number(input.calendarDays)||2)),included=new Set();
   for(let i=0,next=day;i<calendarDays;i++,next=nextDay(next))included.add(next);
   const records=readEventRecords(input.events),events=await enabledEvents(env,owner,records.filter(e=>included.has(e.day)));
   const at=new Date().toISOString(),statements=await Promise.all(events.map(e=>eventStatement(env,owner,e,at)));
   for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
   // Those days are complete, so anything the run didn't send was edited or deleted. A run cut off at its limit says nothing about the days past its last event.
   const from=new Date(day+"T00:00:00"+offset),last=records.length>=EVENT_LIMIT?Math.max(...records.map(e=>Date.parse(e.start))):Infinity,to=new Date(Math.min(from.getTime()+calendarDays*86400000,last));
   const removed=await env.DB.prepare("DELETE FROM health_calendar_events WHERE owner_email=? AND start_time>=? AND start_time<? AND updated_at<?").bind(owner,from.toISOString(),to.toISOString(),at).run();
   const shortcutVersion=await markUpload(env,dev,input.shortcutVersion,at,{events:events.length});
   return reply({ok:true,state:"accepted",receivedAt:at,calendarEvents:events.length,removed:removed.meta?.changes||0,shortcutVersion});
  }
  if(kind==="alarms"){
   const raw=String(input.alarms||""),alarms=readAlarms(raw),day=dateOnly(input.date);
   if(!day||(raw.trim()&&!alarms.length))return error("Invalid alarm details",400,"invalid_alarm_details");
   const at=new Date().toISOString(),first=firstAlarm(alarms,day);
   const statements=[env.DB.prepare("DELETE FROM health_alarms WHERE owner_email=?").bind(owner)];
   alarms.forEach((a,position)=>statements.push(env.DB.prepare("INSERT INTO health_alarms(owner_email,position,time_min,days,enabled,label,updated_at) VALUES(?,?,?,?,?,?,?)").bind(owner,position,a.timeMin,a.days.join(","),a.enabled,a.label,at)));
   if(first!==null)statements.push(env.DB.prepare("INSERT INTO health_metrics(owner_email,day,metric,value,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,day,metric) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(owner,day,"firstAlarmMin",first,at));
   await env.DB.batch(statements);
   return reply({ok:true,state:"accepted",alarms:alarms.length});
  }
  if(kind!=="health"){
   await recordSyncFailure(env,dev,"invalid_kind");return error("This upload couldn't be read.",400,"invalid_kind");
  }
  const allMetrics=(Array.isArray(input.days)?input.days.slice(0,75):[input]).flatMap(readHealth),metrics=allMetrics.filter(x=>!off.has(METRIC_KINDS[x.metric]));
  if(allMetrics.length&&!metrics.length)return reply({ok:true,state:"accepted",skipped:true});
  if(!metrics.length){
   await recordSyncFailure(env,dev,"no_valid_records");
   return error(NO_VALID_RECORDS,400,"no_valid_records");
  }
  const at=new Date().toISOString(),statements=[];
  metrics.forEach(x=>statements.push(env.DB.prepare("INSERT INTO health_metrics(owner_email,day,metric,value,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_email,day,metric) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(owner,x.day,x.metric,x.value,at)));
  for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
  const clientVersion=await markUpload(env,dev,input.shortcutVersion,at,{health:metrics.length});
  return reply({ok:true,state:"accepted",receivedAt:at,kind,healthMetrics:metrics.length,shortcutVersion:clientVersion});
 }
 if(path==="/api/device/disconnect"&&request.method==="POST"){
  await env.DB.batch([
   env.DB.prepare("DELETE FROM health_push_subscriptions WHERE device_id=? AND owner_email=?").bind(dev.id,owner),
   env.DB.prepare("UPDATE health_devices SET revoked_at=? WHERE device_id=? AND owner_email=? AND revoked_at IS NULL").bind(new Date().toISOString(),dev.id,owner)
  ]);
  return reply({ok:true});
 }
 return error("Not found",404,"not_found");
}
// Installed Shortcuts use their own address, so the app's can move. It serves only what they call, with no second copy of the app.
const SHORTCUT_PATHS=new Set(["/api/shortcut/hello","/api/ingest","/api/push/synced","/api/shortcut/release-state","/api/shortcut/publish","/api/shortcut/helper-link"]);
const onShortcutHost=(request,env)=>!!env.SHORTCUT_ORIGIN&&new URL(request.url).origin===env.SHORTCUT_ORIGIN;
const shortcutPath=(path,env)=>SHORTCUT_PATHS.has(path)||path.startsWith("/api/shortcut/build/")||!!env.GOOGLE_RELAY_ORIGIN&&path==="/api/signin/callback/google";
async function api(request,env,ctx,path){
 if(path==="/api/status"&&request.method==="GET")return reply({ok:true,app:BRAND.name,version:VERSION_NAME,sync:"email-access"});
 if(path.startsWith("/api/shortcut/build/")&&request.method==="GET")return shortcutBuild(path);
 if(path.startsWith("/api/signin/"))return signinApi(request,env,ctx,path);
 if(path.startsWith("/api/user/"))return authApi(request,env,ctx,path);
 return syncApi(request,env,path);
}

// Files come from the deployed version, so code and pages always match. The Worker runs first to add its headers.
async function asset(request,env,path){
 const file=await env.STATIC.fetch(new Request(new URL(path==="/"?"/index.html":path,request.url),request));
 const headers=new Headers(file.headers);
 for(const [name,value] of Object.entries(SECURITY))headers.set(name,value);
 // no-transform also keeps the host from adding its analytics script to pages.
 headers.set("Cache-Control","no-cache, no-transform, max-age=0, must-revalidate");
 if(path==="/sw.js")headers.set("Service-Worker-Allowed","/");
 return new Response(file.body,{status:file.status,headers});
}
// A look from the catalogue, as name.icon.palette. Anything else gets the normal page.
const INSTALL_CODE_MS=30*60*1000;
// One use only, and still only for someone on the approved list.
async function redeemInstallCode(env,code){
 if(!/^[0-9a-f]{64}$/.test(code))return null;
 const row=await env.DB.prepare("DELETE FROM health_install_codes WHERE code_hash=? AND expires_at>? RETURNING email").bind(await digest(code),new Date().toISOString()).first();
 return row&&await approved(env,row.email)?row.email:null;
}
function lookName(value){return String(value||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,24).trim();}
function lookFrom(value,typed){
 const match=/^(nh|n[0-9])\.(i[1-9])\.(p[1-9])$/.exec(value||"");
 if(!match)return null;
 const own=lookName(typed),name=match[1]==="nh"?BRAND:match[1]==="n0"?(own?{name:own,installName:own,tagline:BRAND.tagline}:null):LOOK_NAMES.find(item=>item.id===match[1]);
 return name&&{id:match[0],name,typed:match[1]==="n0"?own:null,icon:"/look-icon-"+match[2]+"-"+match[3]+".png"};
}
// What the address iOS saves with an icon should hold: a look, a one-time sign-in code, or both.
function addressFrom(params){
 const look=lookFrom(params.get("look"),params.get("name")),code=params.get("pass");
 const pass=/^[0-9a-f]{64}$/.test(code||"")?code:null;
 if(!look&&!pass)return null;
 const query=[look&&"look="+look.id,look?.typed&&"name="+encodeURIComponent(look.typed),pass&&"pass="+pass].filter(Boolean).join("&");
 return {look,query};
}
// iOS takes the Home Screen icon and label from the page when the app is added, so this one response carries the look. It is never cached.
async function dressedPage(request,env,{look,query}){
 const file=await asset(request,env,"/");
 if(!file.ok)return file;
 let html=await file.text();
 if(look)html=html
  .replace(/<title>[^<]*<\/title>/,()=>"<title>"+escapeHtml(look.name.name)+"</title>")
  .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*/,(all,start)=>start+escapeHtml(look.name.installName))
  .replace(/(<link rel="apple-touch-icon" href=")[^"]*/,"$1"+look.icon);
 html=html.replace(/(<link rel="manifest" href=")[^"]*/,(all,start)=>start+"/look.webmanifest?"+query.replace(/&/g,"&amp;"));
 const headers=new Headers(file.headers);headers.set("Cache-Control","no-store");
 return new Response(html,{status:200,headers});
}
async function lookManifest(request,env,{look,query}){
 const file=await asset(request,env,"/manifest.webmanifest");
 if(!file.ok)return file;
 const manifest=await file.json(),headers=new Headers(file.headers);headers.set("Cache-Control","no-store");
 return new Response(JSON.stringify({...manifest,...(look?{name:look.name.installName,short_name:look.name.installName,description:look.name.tagline,icons:[{src:look.icon,sizes:"180x180",type:"image/png"}]}:{}),start_url:"/?"+query+"#checkin"}),{status:200,headers});
}
// Records each run, so a stalled schedule can be told from a quiet one.
async function runCron(env){
 const at=new Date().toISOString();
 try{
  const counts=await sendReminders(env);
  logEvent("cron",counts||{});
  await env.DB.prepare("DELETE FROM health_service WHERE key LIKE 'sends:%' AND updated_at<?").bind(new Date(Date.now()-86400000).toISOString()).run();
  await env.DB.prepare("INSERT INTO health_service(key,value,updated_at) VALUES('last_cron',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(counts||{}),at).run();
 }catch(e){logEvent("cron_failed",{error:e?.name});}
}
export default {async fetch(request,env,ctx){
 try{const path=new URL(request.url).pathname;
 if(onShortcutHost(request,env)&&!shortcutPath(path,env))return error("Not found",404,"not_found");
 if(path.startsWith("/api/"))return await api(request,env,ctx,path);
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405,headers:SECURITY});
 const wearing=(path==="/"||path==="/look.webmanifest")&&request.method==="GET"?addressFrom(new URL(request.url).searchParams):null;
 if(wearing)return await (path==="/"?dressedPage:lookManifest)(request,env,wearing);
 return await asset(request,env,path);
 }catch(e){logEvent("request_failed",{route:new URL(request.url).pathname,status:500,error:e?.name});return error("Request could not be processed",500,"server_error");}
},
async scheduled(event,env,ctx){ctx.waitUntil(runCron(env));}};