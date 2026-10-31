const PAIR_HASH="882d4bc81a9cd49e39e0b469f37d85c638cb469c84bf12515d2cf46d9c4e5d9c";
const MIME={"index.html":"text/html; charset=utf-8","styles.css":"text/css; charset=utf-8","app.js":"text/javascript; charset=utf-8","sw.js":"text/javascript; charset=utf-8","manifest.webmanifest":"application/manifest+json","icon.svg":"image/svg+xml","icon-192.png":"image/png","icon-512.png":"image/png","source.zip":"application/zip"};
const SECURITY={"X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"};
const METRICS={sleepHours:[0,24],steps:[0,100000],hrv:[0,500],restingHR:[20,250],workoutMin:[0,1440]};
const CATS=["Meeting","Work","Exercise","Social","Family","Rest","Commute","Other"];
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{...SECURITY,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function error(message,status=400){return reply({ok:false,error:message},status);}
async function digest(text){const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,"0")).join("");}
async function payload(request){const max=100000;if(Number(request.headers.get("content-length")||"0")>max)throw Error("Too large");const type=request.headers.get("content-type")||"";if(type.includes("multipart/form-data")){const form=await request.formData();return Object.fromEntries(Array.from(form.entries()).map(([k,v])=>[k,typeof v==="string"?v:""]));}const text=await request.text();if(text.length>max)throw Error("Too large");if(type.includes("application/x-www-form-urlencoded"))return Object.fromEntries(new URLSearchParams(text));if(type.includes("application/json"))return JSON.parse(text);try{return JSON.parse(text);}catch(e){return Object.fromEntries(new URLSearchParams(text));}}
async function isAuthed(request,env){const match=(request.headers.get("authorization")||"").match(/^Bearer ([a-f0-9]{64})$/i);if(!match)return false;return !!(await env.DB.prepare("SELECT hash FROM sync_tokens WHERE hash=?").bind(await digest(match[1].toLowerCase())).first());}
function validDay(s){s=String(s||"").trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+"T12:00:00Z");return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:null;}
function healthRows(x){if(!x||typeof x!=="object")return [];const day=validDay(x.date||x.day);if(!day)return [];const rows=[];for(const [k,[low,high]]of Object.entries(METRICS)){const v=x[k];if(v===null||v===undefined||v==="")continue;const n=Number(v);if(Number.isFinite(n)&&n>=low&&n<=high)rows.push({day,metric:k,value:n});}return rows;}
function eventRow(x){if(!x||typeof x!=="object")return null;const start=new Date(x.start||x.start_time),end=new Date(x.end||x.end_time);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>172800000)return null;return {start:start.toISOString(),end:end.toISOString(),title:String(x.title||"Calendar event").trim().slice(0,100)||"Calendar event",category:CATS.includes(x.category)?x.category:"Other"};}
async function api(request,env,path){
 if(path==="/api/status"&&request.method==="GET")return reply({ok:true,app:"Rage Tracker",version:"1.0.1",sync:"available"});
 if(path==="/api/pair"){if(request.method!=="POST")return error("Method not allowed",405);
  let p;try{p=await payload(request);}catch(e){return error("Invalid request");}
  if(!p||typeof p.pairCode!=="string"||p.pairCode.length>150||!/^[a-f0-9]{64}$/i.test(String(p.token||"")))return error("Invalid pairing request");
  if((await digest(p.pairCode.trim()))!==PAIR_HASH)return error("Incorrect pairing code",403);
  await env.DB.prepare("INSERT OR IGNORE INTO sync_tokens(hash,created_at) VALUES(?,?)").bind(await digest(p.token.toLowerCase()),new Date().toISOString()).run();
  return reply({ok:true,paired:true});
 }
 if(!(await isAuthed(request,env)))return error("Not authorized. Pair your device first.",401);
 if(path==="/api/pull"&&request.method==="GET"){
  const [h,e]=await Promise.all([env.DB.prepare("SELECT day,metric,value FROM health_metrics ORDER BY day DESC LIMIT 3000").all(),env.DB.prepare("SELECT id,start_time,end_time,title,category FROM calendar_events ORDER BY start_time DESC LIMIT 1200").all()]);
  const health={};for(const r of h.results||[]){if(!health[r.day])health[r.day]={date:r.day,source:"shortcut"};health[r.day][r.metric]=r.value;}
  return reply({ok:true,health:Object.values(health),events:(e.results||[]).map(r=>({id:r.id,start:r.start_time,end:r.end_time,title:r.title,category:r.category,source:"shortcut"})),syncAt:new Date().toISOString()});
 }
 if(path==="/api/ingest"&&request.method==="POST"){
  let data;try{data=await payload(request);}catch(e){return error("Invalid request body");}
  if(String(data.kind||"").toLowerCase()==="health"){
   const entries=(Array.isArray(data.days)?data.days.slice(0,75):[data]).flatMap(healthRows);
   if(!entries.length)return error("Supply YYYY-MM-DD date and a supported health metric");
   const time=new Date().toISOString(),stmts=entries.map(x=>env.DB.prepare("INSERT INTO health_metrics(day,metric,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(day,metric) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(x.day,x.metric,x.value,time));
   for(let i=0;i<stmts.length;i+=50)await env.DB.batch(stmts.slice(i,i+50));
   return reply({ok:true,kind:"health",metrics:entries.length});
  }
  if(String(data.kind||"").toLowerCase()==="calendar"){
   const entries=(Array.isArray(data.events)?data.events.slice(0,125):[data]).map(eventRow).filter(Boolean);
   if(!entries.length)return error("Supply valid calendar start and end dates");
   const stmts=[],time=new Date().toISOString();
   for(const x of entries){const id=(await digest(x.start+"|"+x.end+"|"+x.title)).slice(0,40);stmts.push(env.DB.prepare("INSERT INTO calendar_events(id,start_time,end_time,title,category,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,updated_at=excluded.updated_at").bind(id,x.start,x.end,x.title,x.category,time));}
   for(let i=0;i<stmts.length;i+=50)await env.DB.batch(stmts.slice(i,i+50));
   return reply({ok:true,kind:"calendar",events:entries.length});
  }
  return error("Use kind=health or kind=calendar");
 }
 if(path==="/api/erase"&&request.method==="POST"){await env.DB.batch([env.DB.prepare("DELETE FROM health_metrics"),env.DB.prepare("DELETE FROM calendar_events")]);return reply({ok:true,erased:true});}
 return error("Not found",404);
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
export default {async fetch(request,env){
 try{const path=new URL(request.url).pathname;if(path.startsWith("/api/"))return await api(request,env,path);
 if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405,headers:SECURITY});
 return await asset(path,env);
 }catch(e){return error("Request could not be processed",500);}
}};