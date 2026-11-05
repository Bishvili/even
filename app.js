(function () {
"use strict";
var VERSION = "2.32.0";
var STORAGE_KEY = "even:v1";
var HOME_ORIGIN = "https://even.bishvili.org";
var MOOD_NAMES = ["","Rough","Low","Okay","Good","Great"];
var MOOD_EMOJI = ["","😣","😕","😐","🙂","😄"];
var ENERGY_NAMES = ["","Very low","Low","Medium","High","Very high"];
var CALENDAR_PURPOSES = ["Work","Family","Exercise","Social","Rest","Other"];
var CATEGORIES = ["Meeting","Work","Exercise","Social","Family","Rest","Commute","Other"];
var ACTIVITY_LABELS = ["Work","Meeting","Exercise","Social","Family","Rest","Outdoors","Commute","Food"];
var selectedMood = 0, selectedStress = 0, selectedTags = new Set(), insightDays = 30, insightScope = "personal", toastTimer = null;
var state = readState();
var authService = null, authEmail = "", authDevices = [], authChecking = false, authKnown = false, authCanRelease = false, authHelper = "", connecting = false;
var currentView = "", scrollTops = {};
var shortcutRelease = null, shortcutStatus = null, shortcutStatusLoading = false, sessionLoading = false;
function $(id){ return document.getElementById(id); }
function emptyState(){ return {demo:{moods:[],health:[],events:[]},moods:[],health:[],events:[],reflections:[],alarms:[],resets:[],editedMoods:[],deletedMoods:[],firstName:"",name:"",token:"",deviceId:"",syncOwnerEmail:"",pairedAt:null,lastSync:null}; }
// Fictional records live apart from personal ones. Older saved state kept them together, marked demo.
function withDemoApart(loaded,saved){
 var demo={};
 ["moods","health","events"].forEach(function(kind){
  demo[kind]=(saved&&Array.isArray(saved[kind])?saved[kind]:[]).concat(loaded[kind].filter(function(x){return x.demo;}));
  loaded[kind]=loaded[kind].filter(function(x){return !x.demo;});
 });
 loaded.demo=demo;
 return loaded;
}
function readState(){
 try { var raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null"); if(!raw || typeof raw!=="object")return emptyState();
 var owner=typeof raw.syncOwnerEmail==="string"?raw.syncOwnerEmail.toLowerCase():"",deviceId=typeof raw.deviceId==="string"?raw.deviceId:"";
 var loaded={moods:Array.isArray(raw.moods)?raw.moods.slice(-6000):[],health:Array.isArray(raw.health)?raw.health.slice(-1200):[],events:Array.isArray(raw.events)?raw.events.slice(-2000):[],reflections:Array.isArray(raw.reflections)?raw.reflections.slice(-200):[],alarms:Array.isArray(raw.alarms)?raw.alarms.slice(0,40):[],resets:Array.isArray(raw.resets)?raw.resets.slice(-500):[],editedMoods:Array.isArray(raw.editedMoods)?raw.editedMoods:[],lastBackup:typeof raw.lastBackup==="string"?raw.lastBackup:null,deletedMoods:Array.isArray(raw.deletedMoods)?raw.deletedMoods.slice(-500):[],firstName:typeof raw.firstName==="string"?raw.firstName.slice(0,60):"",name:typeof raw.name==="string"?raw.name.slice(0,60):"",token:owner&&deviceId&&typeof raw.token==="string"?raw.token:"",deviceId:deviceId,syncOwnerEmail:owner,pairedAt:raw.pairedAt||null,lastSync:raw.lastSync||null};
 return withDemoApart(loaded,raw.demo);
 } catch(e){return emptyState();}
}
function persist(){ try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true;}catch(e){toast("Storage is full. Export a backup and free device storage.");return false;} }
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function now(){return new Date();}
function dateKey(d){var x=d instanceof Date?d:new Date(d); if(isNaN(x.getTime()))return "";return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");}
function localDateTime(d){var x=new Date(d);return dateKey(x)+"T"+String(x.getHours()).padStart(2,"0")+":"+String(x.getMinutes()).padStart(2,"0");}
function formatDate(d){try{return new Date(d).toLocaleDateString(undefined,{month:"short",day:"numeric"});}catch(e){return "—";}}
function formatTime(d){try{return new Date(d).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});}catch(e){return "—";}}
function formatPrettyDate(d){try{return new Date(d).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});}catch(e){return "Today";}}
function number(n){var v=Number(n);return Number.isFinite(v)?v:NaN;}
function average(xs){return xs.length?xs.reduce(function(a,b){return a+b;},0)/xs.length:NaN;}
function score(n){return Number.isFinite(n)?n.toFixed(1):"—";}
function newId(){return (crypto.randomUUID?crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(36).slice(2));}
function toast(msg){var el=$("toast");el.textContent=msg;el.classList.add("show");if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove("show");},3500);}
function blank(msg){return '<div class="empty">'+esc(msg)+'</div>';}
function plural(n,one,many){return n+" "+(n===1?one:many);}
function isInstalled(){return window.navigator.standalone===true||window.matchMedia("(display-mode: standalone)").matches;}
function isIOS(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);}
function navigate(view){
 // Sources and Sync were merged into Data, and older links still use their names.
 var target=view==="sources"?"data-context":"";
 if(view==="sources"||view==="sync")view="data";
 if(!["checkin","insights","data","settings"].includes(view))view="checkin";
 var top=view===currentView?0:scrollTops[view]||0;
 if(currentView)scrollTops[currentView]=$("page").scrollTop;
 currentView=view;
 document.querySelectorAll(".view").forEach(function(v){v.classList.toggle("active",v.id==="view-"+view);});
 document.querySelectorAll(".nav-item").forEach(function(n){var on=n.dataset.go===view;n.classList.toggle("active",on);if(on)n.setAttribute("aria-current","page");else n.removeAttribute("aria-current");});
 if(location.hash!=="#"+view)history.replaceState(null,"","#"+view);
 resetPageScroll(top);render();
 if(target)$(target).scrollIntoView();
}
function alarmRow(a){
 var names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],row=document.createElement("div"),time=document.createElement("span"),who=document.createElement("div"),title=document.createElement("strong"),when=document.createElement("small"),clock=new Date(2024,0,1);
 clock.setHours(0,a.timeMin,0,0);
 row.className="plan-row";time.className="plan-time";time.textContent=formatTime(clock);
 title.textContent=a.label||"Alarm";
 when.textContent=a.days.length===7?"Every day":a.days.length?a.days.map(function(d){return names[d];}).join(", "):"One time";
 who.appendChild(title);who.appendChild(when);row.appendChild(time);row.appendChild(who);
 return row;
}
function renderAlarms(){
 var on=state.alarms.filter(function(a){return a.enabled!==false;}),off=state.alarms.filter(function(a){return a.enabled===false;});
 $("alarm-empty").hidden=state.alarms.length>0;
 $("alarm-card").hidden=!state.token&&!state.alarms.length;
 [["alarm-list",on],["alarm-off-list",off]].forEach(function(group){var list=$(group[0]);list.textContent="";group[1].forEach(function(a){list.appendChild(alarmRow(a));});});
 $("alarm-off").hidden=!off.length;
 $("alarm-off-count").textContent=off.length+(off.length===1?" alarm off":" alarms off");
}
function applyName(data){
 var first=data.firstName||"",full=data.name||"";
 if(first===state.firstName&&full===state.name)return;
 state.firstName=first;state.name=full;persist();
 if(document.activeElement!==$("your-name"))$("your-name").value=full;
 refreshCoach();
}
async function saveYourName(ev){
 ev.preventDefault();
 if(!state.token){toast("Sign in under Data to set your name.");return;}
 if(!navigator.onLine){toast("Connect to the internet to save your name.");return;}
 var save=$("your-name-save");save.disabled=true;
 try{
  var r=await fetch("/api/profile/name",{method:"POST",headers:{"Authorization":"Bearer "+state.token,"Content-Type":"application/json"},body:JSON.stringify({name:$("your-name").value}),cache:"no-store"});
  if(!r.ok)throw Error();
  var data=await r.json();
  $("your-name").blur();applyName(data);$("your-name").value=data.name||"";
  if(globalThis.EvenReminders)globalThis.EvenReminders.dataChanged();
  toast(data.name?"Name saved.":"Name removed.");
 }catch(e){toast("Couldn’t save your name. Check your connection and try again.");}
 save.disabled=false;
}
// Hiding overflow for a moment stops any momentum, which would otherwise carry into the new tab.
function resetPageScroll(top){
 var page=$("page");
 top=top||0;
 page.style.overflowY="hidden";
 page.scrollTop=top;
 setTimeout(function(){page.style.overflowY="";page.scrollTop=top;},60);
}
function refreshCoach(){renderAlarms();if(globalThis.EvenCoach&&globalThis.EvenCoach.render)globalThis.EvenCoach.render({moods:state.moods,events:state.events,health:state.health,demo:state.demo,reflections:state.reflections,alarms:state.alarms,resets:state.resets,firstName:state.firstName,connected:!!state.token,lastUpload:shortcutStatus&&shortcutStatus.lastDataUploadAt,notifyPrefs:globalThis.EvenReminders?globalThis.EvenReminders.preferences():{from:"09:00",to:"21:00",weekends:true},scope:insightScope});}
function render(){
 $("date-label").textContent=formatPrettyDate(now());
 $("current-time").textContent=formatTime(now());
 renderStats();renderRecent();renderSources();renderSync();renderSettings();
 if($("view-insights").classList.contains("active"))renderInsights();
 refreshCoach();
}
function getRecent(days,moods){var cutoff=Date.now()-days*86400000;return (moods||state.moods).filter(function(m){return m.ts&&new Date(m.ts).getTime()>=cutoff&&m.score>=1&&m.score<=5;});}
function renderStats(){
 var personal=state.moods, today=dateKey(now()), cutoff=Date.now()-7*86400000;
 var counts=personal.filter(function(m){return new Date(m.ts).getTime()>=cutoff;}), days=new Set(personal.map(function(m){return dateKey(m.ts);}));
 var todayCount=personal.filter(function(m){return dateKey(m.ts)===today;}).length;
 $("stat-today").textContent=todayCount;$("stat-today-unit").textContent=todayCount===1?"check-in":"check-ins";
 $("stat-average").textContent=score(average(counts.map(function(m){return m.score;})));
 var d=new Date();d.setHours(12,0,0,0);
 if(!days.has(dateKey(d)))d.setDate(d.getDate()-1);
 var streak=0;while(days.has(dateKey(d))&&streak<3650){streak++;d.setDate(d.getDate()-1);}
 $("stat-streak").textContent=streak;$("stat-streak-unit").textContent=streak===1?"day":"days";
}
function renderRecent(){
 var moods=state.moods.slice().sort(function(a,b){return new Date(b.ts)-new Date(a.ts);});
 $("entries-count").textContent=plural(moods.length,"personal entry","personal entries");
 $("recent-list").innerHTML=moods.length?moods.slice(0,12).map(function(m){
 var tags=(m.tags||[]).join(" · "),sub=formatDate(m.ts)+" at "+formatTime(m.ts)+(tags?" · "+tags:"");
 return '<div class="entry"><span class="entry-emoji">'+MOOD_EMOJI[m.score]+'</span><div class="entry-main"><strong>'+MOOD_NAMES[m.score]+(m.note?" · "+esc(m.note):"")+'</strong><small>'+esc(sub)+'</small></div><div class="entry-side">'+m.score+'/5</div><button class="entry-delete" aria-label="Edit check-in from '+esc(formatDate(m.ts)+" at "+formatTime(m.ts))+'" data-edit-mood="'+esc(m.id)+'">✎</button><button class="entry-delete" aria-label="Delete check-in from '+esc(formatDate(m.ts)+" at "+formatTime(m.ts))+'" data-delete-mood="'+esc(m.id)+'">×</button></div>';
 }).join(""):blank("Your first check-in will appear here. It takes less than ten seconds.");
}
function renderSources(){
 $("health-count").textContent=state.health.length+" health day"+(state.health.length===1?"":"s");
 $("calendar-count").textContent=state.events.length+" calendar event"+(state.events.length===1?"":"s");
 var hs=state.health.map(function(h){return {kind:"health",ts:h.date+"T12:00:00",h:h};});
 var cs=state.events.map(function(e){return {kind:"event",ts:e.start,e:e};});
 var all=hs.concat(cs).filter(function(x){return !isNaN(new Date(x.ts).getTime());}).sort(function(a,b){return new Date(b.ts)-new Date(a.ts);});
 $("context-count").textContent=plural(all.length,"item","items");
 $("context-list").innerHTML=all.length?all.slice(0,12).map(function(x){
 if(x.kind==="health"){var h=x.h, summary=[h.sleepHours!=null?Math.round(h.sleepHours*10)/10+"h sleep":"",h.steps!=null?h.steps.toLocaleString()+" steps":"",h.hrv!=null?Math.round(h.hrv)+" ms HRV":"",h.restingHR!=null?Math.round(h.restingHR)+" bpm resting":"",h.workoutMin!=null?Math.round(h.workoutMin)+" min exercise":""].filter(Boolean).join(" · ");
 return '<div class="entry"><span class="entry-emoji" aria-hidden="true">♥︎</span><div class="entry-main"><strong>Health · '+esc(h.date)+'</strong><small>'+esc(summary||"Health day")+'</small></div><button class="entry-delete" aria-label="Delete health day" data-delete-health="'+esc(h.date)+'">×</button></div>';}
 var e=x.e;
 return '<div class="entry"><span class="entry-emoji" aria-hidden="true">▦︎</span><div class="entry-main"><strong>'+esc(e.title||"Calendar event")+'</strong><small>'+esc(formatDate(e.start)+" "+formatTime(e.start)+" · "+e.category)+'</small></div><button class="entry-delete" aria-label="Delete calendar event" data-delete-event="'+esc(e.id)+'">×</button></div>';
 }).join(""):blank(state.token?"Nothing here yet. Run Even Sync, or add a day or event below.":"Nothing here yet. Sign in to bring in your data, or add a day or event below.");
}
function compareVersions(left,right){
 if(!/^\d+\.\d+\.\d+$/.test(left||"")||!/^\d+\.\d+\.\d+$/.test(right||""))return 0;
 var a=left.split(".").map(Number),b=right.split(".").map(Number);
 for(var i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;
 return 0;
}
function countsLabel(health,events){return plural(health,"health measurement","health measurements")+" · "+plural(events,"calendar event","calendar events");}
// The app's own confirmation, which states the scope of what's about to happen.
function askConfirm(text,action){
 return new Promise(function(resolve){
  var sheet=$("confirm-sheet");
  if(sheet.open){resolve(false);return;}
  $("confirm-text").textContent=text;$("confirm-yes").textContent=action||"Continue";
  sheet.returnValue="";
  sheet.addEventListener("close",function(){resolve(sheet.returnValue==="yes");},{once:true});
  sheet.showModal();
 });
}
// The header says how fresh the data is, and what to do when there's nothing to show.
function renderSyncLight(paired){
 var last=Date.parse(shortcutStatus&&shortcutStatus.lastDataUploadAt)||state.lastSync||0,age=Date.now()-last,minutes=Math.floor(age/60000);
 var text=!navigator.onLine?"Offline":!authEmail&&!paired?"Sign in":!paired?"Connect":!last?"Set up sync":minutes<2?"Synced just now":minutes<60?"Synced "+minutes+"m ago":minutes<1440?"Synced "+Math.floor(minutes/60)+"h ago":"Synced "+Math.floor(minutes/1440)+"d ago";
 $("sync-light-text").textContent=text;
 $("sync-light").classList.toggle("connected",navigator.onLine&&paired&&!!last&&minutes<1440);
}
function renderSync(){
 $("release-card").hidden=!authCanRelease;
 // The helper shares its own link, so this always installs the current one.
 var svc=authService,line=$("service-line");line.hidden=!svc;if(svc)line.textContent="Notifications last checked "+formatDate(svc.lastCron)+" at "+formatTime(svc.lastCron)+" · "+plural(svc.failing,"failing","failing")+" · Version "+svc.version;
 var helper=$("setup-helper");helper.hidden=!authHelper;if(authHelper)helper.href=authHelper;else helper.removeAttribute("href");
 var paired=!!state.token&&!!state.syncOwnerEmail&&!!state.deviceId;
 var mismatch=!!authEmail&&!!state.syncOwnerEmail&&authEmail!==state.syncOwnerEmail;
 $("sign-out").hidden=!authEmail;
 $("login-panel").hidden=!!authEmail;$("login-ready").hidden=!authEmail;
 $("login-text").textContent=paired?"Sign in again to manage your devices. This iPhone keeps syncing.":"Sign in with your email or Google.";
 $("auth-email").textContent=authEmail||"—";
 $("owner-mismatch").hidden=!mismatch;
 $("need-device").hidden=!authEmail||paired||mismatch;
 $("pair-connected").hidden=!paired;
 $("pair-status").textContent=paired?"Connected · "+state.syncOwnerEmail:authEmail?"Signed in":"Not signed in";
 $("pair-badge").textContent=paired?"On":"Off";
 $("pair-badge").classList.toggle("on",paired);
 $("account-banner").hidden=paired;
 renderSyncLight(paired);
 $("last-sync").textContent=state.lastSync?"Last synced "+formatDate(state.lastSync)+" at "+formatTime(state.lastSync):"Not synced yet";
 $("shortcut-setup").hidden=!!(shortcutStatus&&shortcutStatus.lastDataUploadAt);
 var signedOut=!authEmail&&!paired;
 $("shortcut-card").hidden=signedOut;$("device-details").hidden=signedOut;
 var install=$("install-shortcut"),link=shortcutLink(),canInstall=!!link;
 var publishedRelease=shortcutRelease&&shortcutRelease.url&&shortcutRelease.verified?shortcutRelease:null;
 install.hidden=!canInstall;
 $("run-shortcut").hidden=!paired||mismatch;
 if(canInstall){install.href=link;install.removeAttribute("aria-disabled");install.removeAttribute("tabindex");}
 else{install.removeAttribute("href");install.setAttribute("aria-disabled","true");install.setAttribute("tabindex","-1");}
 $("shortcut-release-version").textContent=shortcutStatus&&shortcutStatus.installedShortcutVersion?"Connected · v"+shortcutStatus.installedShortcutVersion:"Not connected";
 $("shortcut-install-help").textContent=canInstall
  ?"Then tap Run Even Sync to connect it."
  :mismatch?"Sign in with this iPhone’s account to continue."
  :paired&&!navigator.onLine?"Connect to the internet to get Even Sync."
  :paired?"Even Sync isn’t available right now. Try again soon."
  :"Sign in to get Even Sync.";
 $("check-shortcut-upload").disabled=shortcutStatusLoading;
 var installed=shortcutStatus&&shortcutStatus.installedShortcutVersion||"";
 $("shortcut-update-badge").hidden=!(canInstall&&publishedRelease&&installed&&compareVersions(publishedRelease.version,installed)>0);
 var last=shortcutStatus&&shortcutStatus.lastDataUploadAt;
 $("shortcut-last-upload").textContent=last
  ?"Received "+formatDate(last)+" at "+formatTime(last)
  :paired&&shortcutStatus&&shortcutStatus.lastAttemptAt&&shortcutStatus.installedShortcutVersion
    ?"Connected "+formatDate(shortcutStatus.lastAttemptAt)+" · no data yet"
  :"Nothing received yet";
 var sent=shortcutStatus&&shortcutStatus.lastUpload;
 $("shortcut-upload-counts").textContent=sent?countsLabel(sent.health||0,sent.events||0):"";
 $("shortcut-stored").textContent=shortcutStatus?"Stored in your account: "+countsLabel(shortcutStatus.healthMetrics,shortcutStatus.calendarEvents):"";
 $("calendar-card").hidden=!state.token;
 renderDevices();
 if(globalThis.EvenOnboarding)globalThis.EvenOnboarding.render();
}
// The verified iCloud link. Empty when there is none or this iPhone can't install.
function shortcutLink(){
 var paired=!!state.token&&!!state.syncOwnerEmail&&!!state.deviceId,accountMatches=!authEmail||authEmail===state.syncOwnerEmail;
 if(!paired||!accountMatches||!navigator.onLine)return "";
 return shortcutRelease&&shortcutRelease.url&&shortcutRelease.verified?shortcutRelease.url:"";
}
function renderDevices(){
 var el=$("device-list");
 if(!authEmail){el.innerHTML=blank("Sign in to see your devices.");return;}
 if(!authDevices.length){el.innerHTML=blank("No devices yet.");return;}
 function row(d){
  var revoked=!!d.revoked,own=d.id===state.deviceId;
  return '<div class="device-row"><div class="device-row-main"><strong>'+esc(d.label||"iPhone")+(own?" · This device":"")+'</strong><small>'+esc(d.revoked?"Disconnected":d.lastUsedAt?"Used "+formatDate(d.lastUsedAt):"Not used yet")+'</small></div>'+(revoked?'<span class="muted">Disconnected</span>':'<button class="icon-action" type="button" data-rename-device="'+esc(d.id)+'" aria-label="Rename '+esc(d.label||"device")+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></button><button class="small-action" type="button" data-revoke-device="'+esc(d.id)+'">Disconnect</button>')+'</div>';
 }
 var active=authDevices.filter(function(d){return !d.revoked;}),old=authDevices.filter(function(d){return d.revoked;});
 el.innerHTML=(active.map(row).join("")||blank("No connected devices."))+'<p class="muted">Devices unused for 90 days disconnect automatically.</p>'+(old.length?'<details class="device-old"><summary>'+old.length+' disconnected</summary>'+old.map(row).join("")+'</details>':"");
}

// Safari can clear a site's data after 7 days without a visit, unless storage is persistent.
async function keepStorage(){try{if(navigator.storage&&navigator.storage.persist)await navigator.storage.persist();}catch(e){/* Not every browser allows this; the note below says what happened. */}renderStorageNote();}
async function renderStorageNote(){
 var kept=null;
 try{if(navigator.storage&&navigator.storage.persisted)kept=await navigator.storage.persisted();}catch(e){/* Unknown; the note stays empty. */}
 $("storage-note").textContent=kept===true?"This device won’t clear your data on its own.":kept===false?"This browser can clear your data if you don’t use Even for a while. Keep a backup, or add Even to your Home Screen.":"";
}
function renderSettings(){
 $("demo-button").textContent=hasDemoData()?"Refresh the calendar demo":"Load 28-day calendar demo";
 $("storage-summary").textContent=state.moods.length+" mood check-ins · "+state.health.length+" health days · "+state.events.length+" calendar events"+(hasDemoData()?" · Demo month loaded":"");
 var backedUp=state.lastBackup?Date.parse(state.lastBackup):0,stale=state.moods.length>0&&Date.now()-backedUp>30*86400000;
 $("backup-note").textContent=backedUp?(stale?"Your last backup is over a month old. Save a new one.":"Last backup "+formatDate(state.lastBackup)+"."):stale?"You haven’t saved a backup yet.":"";
 renderStorageNote();
 $("version").textContent=VERSION;
}
function hasDemoData(){return state.demo.moods.length>0;}
function renderInsights(){
 var demoAvailable=hasDemoData();
 if(!demoAvailable)insightScope="personal";
 $("insight-scope-controls").hidden=!demoAvailable;
 document.querySelectorAll("[data-scope]").forEach(function(b){
  var selected=b.dataset.scope===insightScope;
  b.classList.toggle("selected",selected);b.setAttribute("aria-pressed",String(selected));
 });
 $("demo-insight-note").hidden=insightScope!=="demo";
 var isDemo=insightScope==="demo";
 var source=isDemo?state.demo:state;
 var moods=getRecent(insightDays,source.moods).sort(function(a,b){return new Date(a.ts)-new Date(b.ts);});
 var events=source.events;
 $("insight-average").textContent=score(average(moods.map(function(m){return m.score;})))+"/5";
 refreshCoach();
 $("insight-samples").textContent=moods.length+" "+(isDemo?"fictional":"personal")+" check-ins over "+insightDays+" days";
 drawTrend(moods);drawTimes(moods);drawCalendar(moods,events);
}
function drawTrend(moods){
 var byDay={};moods.forEach(function(m){var k=dateKey(m.ts);(byDay[k]||(byDay[k]=[])).push(m.score);});
 var keys=Object.keys(byDay).sort();var points=keys.map(function(k){return {date:k,v:average(byDay[k])};});
 if(points.length<2){$("trend-chart").innerHTML=blank("Two different days of mood check-ins will reveal your trend.");$("trend-note").textContent="Try checking in morning and evening.";return;}
 var start=Date.now()-(insightDays-1)*86400000, end=Date.now();
 var line=points.map(function(p){var x=20+(new Date(p.date+"T12:00:00").getTime()-start)/(end-start)*560,y=13+(5-p.v)/4*118;return [Math.max(20,Math.min(580,x)),y];});
 var path=line.map(function(x){return x[0].toFixed(1)+","+x[1].toFixed(1);}).join(" ");
 var dots=line.map(function(p){return '<circle class="chart-dot" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="4.1"/>';}).join("");
 var best=points.reduce(function(a,b){return b.v>a.v?b:a;}),overall=average(moods.map(function(m){return m.score;}));
 var summary="Mood averaged "+score(overall)+" out of 5 across "+points.length+" days, highest on "+formatDate(best.date+"T12:00:00")+".";
 var grid=[13,72,131].map(function(y){return '<line class="chart-grid" x1="20" y1="'+y+'" x2="580" y2="'+y+'"/>';}).join("");
 $("trend-chart").innerHTML='<svg viewBox="0 0 600 153" role="img" aria-label="'+esc(summary)+'">'+grid+'<polyline class="chart-line" points="'+path+'"/>'+dots+'<text class="chart-value" x="0" y="153">1</text><text class="chart-value" x="0" y="20">5</text></svg><div class="chart-axis" aria-hidden="true"><span>'+esc(formatDate(new Date(start)))+'</span><span>'+esc(formatDate(new Date(end)))+'</span></div>';
 $("trend-note").textContent=points.length+" days with check-ins · Daily averages (1–5)";
}
function timeGroup(ts){var h=new Date(ts).getHours();return h>=5&&h<11?0:h>=11&&h<15?1:h>=15&&h<20?2:3;}
// Averages need at least 5 check-ins. Bars are SVG, because the security policy blocks inline styles.
function timeRows(moods){
 return ["Morning","Midday","Afternoon","Evening"].map(function(name,i){
  var scores=moods.filter(function(m){return timeGroup(m.ts)===i;}).map(function(m){return m.score;});
  return {name:name,count:scores.length,average:scores.length>=5?average(scores):null};
 });
}
function drawTimes(moods){
 $("time-insights").innerHTML=moods.length?timeRows(moods).map(function(row){
  var known=row.average!==null,bar=known?'<svg class="bar-chart" width="100%" height="10" aria-hidden="true"><rect class="bar-back" width="100%" height="10" rx="5"/><rect class="bar-value" width="'+((row.average/5)*100).toFixed(1)+'%" height="10" rx="5"/></svg>':'<span class="bar-empty">Not enough check-ins</span>';
  return '<div class="bar-row"><div class="bar-name">'+row.name+'<span class="bar-sub">'+plural(row.count,"check-in","check-ins")+'</span></div><div>'+bar+'</div><div class="bar-number">'+(known?row.average.toFixed(1):"—")+'</div></div>';
 }).join("")+'<p class="muted">Each time of day needs at least 5 check-ins.</p>':blank("Log moods at different times to see when you tend to feel better.");
}
// Each event's closest check-in before and after, with the same minimum and smallest difference as every other comparison.
function calendarPatternSummary(moods,events){
 var windowMs=90*60000;
 var samples=moods.map(function(m){return {time:new Date(m.ts).getTime(),score:m.score};})
  .filter(function(m){return Number.isFinite(m.time)&&m.score>=1&&m.score<=5;});
 var valid=events.map(function(e){
  return {category:e.category,start:new Date(e.start).getTime(),end:new Date(e.end).getTime()};
 }).filter(function(e){return CATEGORIES.includes(e.category)&&Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>e.start;});
 var paired=[];
 CATEGORIES.filter(function(c){return c!=="Other";}).forEach(function(category){
  var before=[],after=[];
  valid.filter(function(e){return e.category===category;}).forEach(function(e){
   var pre=null,post=null;
   samples.forEach(function(m){
    if(m.time>=e.start-windowMs&&m.time<e.start&&(!pre||m.time>pre.time))pre=m;
    if(m.time>=e.end&&m.time<=e.end+windowMs&&(!post||m.time<post.time))post=m;
   });
   if(pre&&post){before.push(pre.score);after.push(post.score);}
  });
  if(before.length<5)return;
  var delta=average(after)-average(before);
  if(Math.abs(delta)>=0.4)paired.push({category:category,count:before.length,before:average(before),after:average(after),delta:delta});
 });
 paired.sort(function(a,b){return Math.abs(b.delta)-Math.abs(a.delta);});
 return {paired:paired,eventCount:valid.length};
}
function signedScore(delta){return (delta>0?"+":"")+delta.toFixed(1);}
function drawCalendar(moods,events){
 var patterns=calendarPatternSummary(moods,events);
 if(!patterns.paired.length){
  $("calendar-insights").innerHTML=blank("Needs at least 5 events of the same type, each with a check-in within 90 minutes before it starts and after it ends.");
  return;
 }
 $("calendar-insights").innerHTML=patterns.paired.map(function(r){
  var cls=r.delta>0?"positive":"negative";
  return '<div class="calendar-pair"><div class="calendar-pair-label"><strong>'+esc(r.category)+'</strong><small>'+plural(r.count,"paired event","paired events")+'</small></div><div class="calendar-pair-scores">'+score(r.before)+' <span aria-hidden="true">→</span> '+score(r.after)+'</div><span class="calendar-delta '+cls+'">'+signedScore(r.delta)+'</span></div>';
 }).join("")+'<p class="calendar-explainer">These are associations, not proof of cause. Overlapping events can share check-ins.</p>';
}
function selectMood(n){selectedMood=n;document.querySelectorAll("[data-mood]").forEach(function(b){b.setAttribute("aria-pressed",String(Number(b.dataset.mood)===n));});$("save-mood").classList.toggle("save-ready",!!n);}
var energyTouched=false;
function setEnergyText(){$("energy-label").textContent=energyTouched?$("energy").value+" · "+ENERGY_NAMES[Number($("energy").value)]:"Not set";}
function selectStress(n){selectedStress=n;document.querySelectorAll("[data-stress]").forEach(function(b){var on=Number(b.dataset.stress)===n;b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});}
// Check-ins sync only when the account has turned it on. Each device uploads what the account lacks and removes what another device deleted.
var moodSyncing=false;
async function moodRequest(body){
 var r=await fetch("/api/moods",{method:"POST",headers:{"Authorization":"Bearer "+state.token,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
 if(!r.ok)throw Error("Check-ins didn’t sync");
}
// The session already carries the check-ins when the app comes back, so this only fetches after a change here.
async function syncMoods(given){
 if(!state.token||!navigator.onLine||moodSyncing)return;
 moodSyncing=true;
 try{
  var body=given;
  if(!body){
   var r=await fetch("/api/moods",{headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
   if(!r.ok)return;
   body=await r.json();
  }
  if(!body.email||body.email!==state.syncOwnerEmail)return;
  var before=JSON.stringify([state.moods,state.editedMoods,state.deletedMoods]);
  var edited=state.moods.filter(function(m){return state.editedMoods.indexOf(m.id)>=0;});
  var justEdited={};edited.forEach(function(m){justEdited[m.id]=true;});
  if(edited.length){await moodRequest({moods:edited});state.editedMoods=[];}
  var pending=state.deletedMoods.slice();
  for(var i=0;i<pending.length;i+=100)await moodRequest({deleted:pending.slice(i,i+100)});
  state.deletedMoods=state.deletedMoods.filter(function(id){return pending.indexOf(id)<0;});
  var gone={},remote={},local={};
  body.deleted.concat(pending).forEach(function(id){gone[id]=true;});
  body.moods.forEach(function(m){remote[m.id]=true;});
  state.moods=state.moods.filter(function(m){return !gone[m.id];});
  state.moods.forEach(function(m){local[m.id]=true;});
  body.moods.forEach(function(m){
   if(gone[m.id]||justEdited[m.id])return;
   var item={id:m.id,ts:m.ts,score:m.score,energy:m.energy||null,tags:m.tags||[],note:m.note||""};
   if(m.stress)item.stress=m.stress;
   // The account's copy wins, so an edit on one device reaches the others.
   if(local[m.id])state.moods=state.moods.map(function(x){return x.id===m.id?item:x;});
   else state.moods.push(item);
  });
  state.moods.sort(function(a,b){return new Date(a.ts)-new Date(b.ts);});
  if(JSON.stringify([state.moods,state.editedMoods,state.deletedMoods])!==before){persist();render();}
  var missing=state.moods.filter(function(m){return !remote[m.id];});
  for(var n=0;n<missing.length;n+=100)await moodRequest({moods:missing.slice(n,n+100)});
 }catch(e){/* Offline or refused; the next return to the app tries again. */}
 finally{moodSyncing=false;}
}
var SYNC_SETTING_NAMES={calendar:"Calendar events",sleep:"Sleep",steps:"Steps",restingHR:"Resting heart rate",hrv:"Heart rate variability",workout:"Exercise minutes",alarms:"Alarms"};
function renderSyncSettings(settings){
 var list=$("sync-settings");
 list.textContent="";
 Object.keys(SYNC_SETTING_NAMES).forEach(function(kind){
  var row=document.createElement("label"),name=document.createElement("span"),box=document.createElement("input");
  row.className="calendar-row";name.textContent=SYNC_SETTING_NAMES[kind];box.type="checkbox";box.setAttribute("role","switch");box.checked=settings[kind]!==false;
  box.addEventListener("change",function(){setSyncSetting(kind,box);});
  row.appendChild(name);row.appendChild(box);list.appendChild(row);
 });
}
async function setSyncSetting(kind,box){
 var enabled=box.checked;box.disabled=true;
 try{
  var r=await fetch("/api/sync/settings",{method:"POST",headers:{"Authorization":"Bearer "+state.token,"Content-Type":"application/json"},body:JSON.stringify({kind:kind,enabled:enabled}),cache:"no-store"});
  if(!r.ok)throw Error();
 }catch(e){box.checked=!enabled;toast("Couldn’t change that. Check your connection and try again.");}
 box.disabled=false;
}
function openRenameDevice(id){
 var device=authDevices.filter(function(d){return d.id===id;})[0];if(!device)return;
 var dialog=$("rename-device-dialog");dialog.dataset.device=id;$("rename-device-input").value=device.label||"";dialog.showModal();
}
async function renameDevice(ev){
 ev.preventDefault();
 var dialog=$("rename-device-dialog"),label=$("rename-device-input").value.trim();
 if(!label){toast("Enter a name for this device.");return;}
 var save=$("rename-device-save");save.disabled=true;
 try{
  var r=await fetch(accountPath("device/rename"),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId:dialog.dataset.device,label:label}),cache:"no-store"});
  if(!r.ok)throw Error();
  dialog.close();await refreshAuth();render();toast("Device renamed.");
 }catch(e){toast("Couldn’t rename this device. Check your connection and try again.");}
 save.disabled=false;
}
function thisDeviceName(){var ua=navigator.userAgent;return /iPhone/.test(ua)?"iPhone":/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?"iPad":/Macintosh/.test(ua)?"Mac":/Windows/.test(ua)?"Windows computer":"Device";}
function localInputValue(ts){var d=new Date(ts);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+"T"+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}
function openEdit(id){
 var m=state.moods.filter(function(x){return x.id===id;})[0];if(!m)return;
 var sheet=$("edit-sheet");sheet.dataset.mood=id;
 $("edit-score").value=String(m.score);$("edit-when").value=localInputValue(m.ts);$("edit-when").max=localInputValue(new Date());$("edit-note").value=m.note||"";
 sheet.showModal();
}
function saveEdit(ev){
 ev.preventDefault();
 var id=$("edit-sheet").dataset.mood,when=new Date($("edit-when").value);
 if(isNaN(when.getTime())||when>new Date(Date.now()+60000)){toast("Choose a time that has already passed.");return;}
 state.moods=state.moods.map(function(m){return m.id===id?Object.assign({},m,{score:Number($("edit-score").value),ts:when.toISOString(),note:$("edit-note").value.trim().slice(0,400)}):m;}).sort(function(a,b){return new Date(a.ts)-new Date(b.ts);});
 if(state.editedMoods.indexOf(id)<0)state.editedMoods.push(id);
 if(!persist())return;
 $("edit-sheet").close();render();toast("Check-in updated.");syncMoods();
}
function handleMoodSave(){
 if(!selectedMood){toast("Choose how you’re feeling first.");return;}
 state.moods.push({id:newId(),ts:new Date().toISOString(),score:selectedMood,energy:energyTouched?Number($("energy").value):null,tags:Array.from(selectedTags),note:$("mood-note").value.trim().slice(0,400)});
 if(selectedStress)state.moods[state.moods.length-1].stress=selectedStress;
 if(!persist())return;if(state.moods.length===1)keepStorage();selectMood(0);selectStress(0);selectedTags.clear();document.querySelectorAll("[data-tag]").forEach(function(b){b.classList.remove("selected");b.setAttribute("aria-pressed","false");});$("mood-note").value="";$("energy").value="3";energyTouched=false;setEnergyText();render();toast("Check-in saved. Thanks for checking in.");if(globalThis.EvenReminders)globalThis.EvenReminders.checkedIn();syncMoods();
}
function normalizeHealth(h,source){
 if(!h||typeof h!=="object")return null;
 var date=String(h.date||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||dateKey(date+"T12:00:00")!==date)return null;
 var item={date:date,source:source||h.source||"manual"};
 [["sleepHours",0,24],["steps",0,100000],["hrv",0,500],["restingHR",20,250],["bedtimeMin",0,1439],["workoutMin",0,1440],["firstAlarmMin",0,719]].forEach(function(t){if(h[t[0]]!==undefined&&h[t[0]]!==null&&h[t[0]]!==""){var n=number(h[t[0]]);if(Number.isFinite(n)&&n>=t[1]&&n<=t[2])item[t[0]]=n;}});
 return Object.keys(item).some(function(k){return ["sleepHours","steps","hrv","restingHR","workoutMin"].includes(k);})?item:null;
}
function upsertHealth(h){var idx=state.health.findIndex(function(x){return x.date===h.date;});if(idx<0)state.health.push(h);else state.health[idx]=Object.assign({},state.health[idx],h);}
function normalizeEvent(e,source){
 if(!e||typeof e!=="object")return null;
 var st=new Date(e.start),en=new Date(e.end);
 if(!Number.isFinite(st.getTime())||!Number.isFinite(en.getTime())||en<=st||en-st>86400000*2)return null;
 var title=String(e.title||"Calendar event").trim().slice(0,100);var cat=CATEGORIES.includes(e.category)?e.category:"Other";
 var id=String(e.id||("event:"+st.toISOString()+"|"+en.toISOString()+"|"+title)).slice(0,220);
 return {id:id,start:st.toISOString(),end:en.toISOString(),title:title,category:cat,source:source||e.source||"manual"};
}
function upsertEvent(e){var idx=state.events.findIndex(function(x){return x.id===e.id||x.start===e.start&&x.end===e.end&&x.title===e.title;});if(idx<0)state.events.push(e);else state.events[idx]=Object.assign({},state.events[idx],e);}
function handleHealthForm(ev){
 ev.preventDefault();var h=normalizeHealth({date:$("health-date").value,sleepHours:$("health-sleep").value,steps:$("health-steps").value,hrv:$("health-hrv").value,workoutMin:$("health-workout").value},"manual");
 if(!h){toast("Enter a valid date and at least one health metric.");return;}
 upsertHealth(h);persist();render();toast("Health day saved locally.");
}
function handleCalendarForm(ev){
 ev.preventDefault();var e=normalizeEvent({title:$("cal-title").value,start:$("cal-start").value,end:$("cal-end").value,category:$("cal-category").value},"manual");
 if(!e){toast("Please enter a valid event and end time after start.");return;}
 upsertEvent(e);persist();render();$("cal-title").value="";toast("Calendar event saved locally.");
}
function parseCSV(str){
 var rows=[],row=[],val="",quoted=false;str=str.replace(/^\uFEFF/,"");
 for(var i=0;i<str.length;i++){var c=str[i];if(c==='"'){if(quoted&&str[i+1]==='"'){val+='"';i++;}else quoted=!quoted;}
 else if(c===","&&!quoted){row.push(val);val="";}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&str[i+1]==="\n")i++;row.push(val);val="";if(row.some(function(x){return x.trim();}))rows.push(row);row=[];}else val+=c;}
 row.push(val);if(row.some(function(x){return x.trim();}))rows.push(row);
 if(!rows.length)return [];
 var headers=rows.shift().map(function(x){return x.trim().toLowerCase().replace(/[^a-z0-9]/g,"");});
 return rows.slice(0,2500).map(function(r){var obj={};headers.forEach(function(h,i){obj[h]=r[i]||"";});return obj;});
}
function zonedTimeToISO(Y,M,D,h,mi,sec,zone){
 var wall=Date.UTC(Y,M,D,h,mi,sec),format;
 try{format=new Intl.DateTimeFormat("en-US",{timeZone:zone,hourCycle:"h23",year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"numeric",second:"numeric"});}
 catch(e){return new Date(Y,M,D,h,mi,sec).toISOString();}
 var offsetAt=function(ms){var p={};format.formatToParts(new Date(ms)).forEach(function(x){p[x.type]=+x.value;});return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-ms;};
 var guess=wall-offsetAt(wall);
 return new Date(wall-offsetAt(guess)).toISOString();
}
function parseICSDate(v,zone){
 var s=String(v||"").trim(),m=s.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/);
 if(!m)return null;
 var Y=+m[1],M=+m[2]-1,D=+m[3],h=+(m[4]||0),mi=+(m[5]||0),sec=+(m[6]||0);
 if(m[7])return new Date(Date.UTC(Y,M,D,h,mi,sec)).toISOString();
 if(zone&&m[4])return zonedTimeToISO(Y,M,D,h,mi,sec,zone);
 return new Date(Y,M,D,h,mi,sec).toISOString();
}
function parseICS(text){
 var lines=text.replace(/\r\n/g,"\n").replace(/\n[ \t]/g,"").split("\n");var events=[],cur=null;
 lines.forEach(function(line){line=line.replace(/\r$/,"");if(line==="BEGIN:VEVENT"){cur={};return;}if(line==="END:VEVENT"){if(cur)events.push(cur);cur=null;return;}if(!cur)return;var idx=line.indexOf(":");if(idx<0)return;
 var head=line.slice(0,idx).split(";"),name=head[0].toUpperCase(),value=line.slice(idx+1),zoneParam=head.find(function(x){return /^TZID=/i.test(x);}),zone=zoneParam?zoneParam.slice(5).replace(/^"|"$/g,""):"";
 if(name==="DTSTART"){cur.start=parseICSDate(value,zone);cur.allDay=/^\d{8}$/.test(value.trim());}else if(name==="DTEND")cur.end=parseICSDate(value,zone);else if(name==="RECURRENCE-ID")cur.instance=value.trim();else if(name==="SUMMARY")cur.title=value.replace(/\\n/gi," ").replace(/\\,/g,",").replace(/\\\\/g,"\\");else if(name==="UID")cur.id=value;
 });
 return events.slice(0,2500).map(function(x){
  if(x.id&&x.instance)x.id=x.id+"|"+x.instance;
  if(x.start&&!x.end)x.end=new Date(new Date(x.start).getTime()+(x.allDay?86400000:3600000)).toISOString();
  delete x.instance;delete x.allDay;x.category="Other";return x;
 });
}
async function importHealth(file){
 if(!file||file.size>3e6){toast("Use a health CSV under 3 MB.");return;}
 try{var rows=parseCSV(await file.text()),n=0;rows.forEach(function(r){var h=normalizeHealth({date:r.date||r.day,sleepHours:r.sleephours||r.sleep,steps:r.steps,hrv:r.hrv,restingHR:r.restinghr,workoutMin:r.workoutmin||r.workoutminutes},"csv");if(h){upsertHealth(h);n++;}});
 persist();render();toast("Imported "+n+" health days.");
 }catch(e){toast("Could not read the health CSV.");}
}
async function importCalendar(file){
 if(!file||file.size>5e6){toast("Use an ICS or CSV file under 5 MB.");return;}
 try{var text=await file.text(),items=file.name.toLowerCase().endsWith(".ics")?parseICS(text):parseCSV(text).map(function(x){return {title:x.title||x.summary||"Calendar event",start:x.start||x.startdate,end:x.end||x.enddate,category:x.category||"Other"};});
 var n=0;items.forEach(function(x){var e=normalizeEvent(x,"import");if(e){upsertEvent(e);n++;}});
 persist();render();toast("Imported "+n+" calendar events. Check time zones.");
 }catch(e){toast("Could not import the calendar file.");}
}
function openBackup(){
 $("backup-passphrase").value="";$("backup-passphrase-sheet").showModal();
}
// Saves through the share sheet where files can be shared, because a download shows a blank page in the installed app.
async function saveBackup(passphrase){
 var name="even-backup-"+dateKey(now())+".json";
 var text=JSON.stringify({app:"Even",version:VERSION,account:state.syncOwnerEmail||null,exportedAt:new Date().toISOString(),moods:state.moods,health:state.health,events:state.events,reflections:state.reflections,alarms:state.alarms,resets:state.resets},null,2);
 if(passphrase)text=await globalThis.EvenBackup.protect(text,passphrase);
 var file=new File([text],name,{type:"application/json"});
 var done=passphrase?"Backup saved, protected by your passphrase.":"Backup saved. It isn’t encrypted, so keep it somewhere safe.";
 if(navigator.canShare&&navigator.canShare({files:[file]})){
  try{await navigator.share({files:[file]});}
  catch(e){if(e.name==="AbortError"){toast("Backup not saved.");return;}toast("Couldn’t save the backup. Try again.");return;}
 }else{
  var url=URL.createObjectURL(file),a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},2000);
 }
 state.lastBackup=new Date().toISOString();persist();renderSettings();toast(done);
}
var pendingBackup=null;
async function restoreBackup(file){
 if(!file||file.size>7e6){toast("Select a backup under 7 MB.");return;}
 try{
  var data=JSON.parse(await file.text());
  if(globalThis.EvenBackup.isProtected(data)){pendingBackup=data;$("restore-passphrase").value="";$("restore-passphrase-note").hidden=true;$("restore-passphrase-sheet").showModal();return;}
  await applyBackup(data);
 }catch(e){toast("This file is not a valid backup.");}
}
async function openProtectedBackup(ev){
 ev.preventDefault();
 try{var text=await globalThis.EvenBackup.unprotect(pendingBackup,$("restore-passphrase").value);}
 catch(e){$("restore-passphrase-note").hidden=false;return;}
 $("restore-passphrase-sheet").close();pendingBackup=null;
 try{await applyBackup(JSON.parse(text));}catch(e){toast("This file is not a valid backup.");}
}
async function applyBackup(data){
 if(data.app!=="Even"||!Array.isArray(data.moods)||!Array.isArray(data.health)||!Array.isArray(data.events))throw Error("Not a backup");
 if(data.account&&state.syncOwnerEmail&&data.account!==state.syncOwnerEmail){toast("This backup belongs to another account.");return;}
 if(!await askConfirm("Replace the check-ins, health and calendar data on this device with this backup? This can’t be undone. This iPhone stays connected.","Replace"))return;
 state.reflections=Array.isArray(data.reflections)?data.reflections.slice(-200):[];
 state.moods=data.moods.slice(-6000).filter(function(x){return !x.demo&&Number.isInteger(x.score)&&x.score>=1&&x.score<=5&&!isNaN(new Date(x.ts).getTime());}).map(function(x){return {id:String(x.id||newId()),ts:new Date(x.ts).toISOString(),score:x.score,energy:Number(x.energy)||null,tags:Array.isArray(x.tags)?x.tags.filter(function(y){return ACTIVITY_LABELS.includes(y);}).slice(0,10):[],note:String(x.note||"").slice(0,400),stress:Number.isInteger(x.stress)&&x.stress>=1&&x.stress<=5?x.stress:undefined,demo:!!x.demo};});
 state.health=[];data.health.slice(-1200).filter(function(x){return !x.demo;}).forEach(function(x){var h=normalizeHealth(x,x.source);if(h)upsertHealth(h);});
 state.events=[];data.events.slice(-2000).filter(function(x){return !x.demo;}).forEach(function(x){var e=normalizeEvent(x,x.source);if(e)upsertEvent(e);});
 state.alarms=Array.isArray(data.alarms)?data.alarms.filter(function(a){return a&&Number.isInteger(a.timeMin)&&Array.isArray(a.days);}).slice(0,100):[];
 state.resets=Array.isArray(data.resets)?data.resets.filter(function(at){return !isNaN(new Date(at).getTime());}).slice(-500):[];
 persist();render();toast("Backup restored.");
}
function buildDemoCalendarScenario(base){
 var result={moods:[],events:[],health:[]};
 function localAt(day,hour,minute){var d=new Date(day);d.setHours(hour,minute,0,0);return d.toISOString();}
 function checkin(day,index,slot,hour,minute,mood,tags){
  result.moods.push({id:"demo:v2:"+index+":"+slot,ts:localAt(day,hour,minute),score:mood,energy:mood,tags:tags,note:"",stress:6-mood,demo:true});
 }
 function event(day,index,slot,category,title,hour,startMinute,endHour,endMinute){
  result.events.push({id:"demo:v2:event:"+index+":"+slot,start:localAt(day,hour,startMinute),end:localAt(day,endHour,endMinute),title:title,category:category,source:"demo",demo:true});
 }
 var anchor=new Date(base);anchor.setHours(12,0,0,0);
 for(var i=28;i>=1;i--){
  var day=new Date(anchor);day.setDate(day.getDate()-i);
  var date=dateKey(day);
  var sleep=i%5===0?5.9:i%3===0?7.1:7.8,steps=i%4===0?9200:i%4===2?3700:6800;
  result.health.push({date:date,sleepHours:sleep,steps:steps,hrv:33+(i%7)*4,workoutMin:i%4===0?40:0,source:"demo",demo:true});
  var morningBase=sleep<7?2:3,afternoonBase=sleep<7?2:3;
  checkin(day,i,"morning-before",8,15,morningBase,["Work"]);
  if(i%3===0){
   event(day,i,"morning","Meeting","Project stand-up",9,30,10,15);
   checkin(day,i,"morning-after",11,10,Math.max(1,morningBase-1),["Meeting","Work"]);
  }else if(i%3===1){
   event(day,i,"morning","Work","Quiet focus block",9,30,10,15);
   checkin(day,i,"morning-after",11,10,Math.min(5,morningBase+1),["Work"]);
  }else{
   checkin(day,i,"morning-after",11,10,morningBase,["Work"]);
  }
  checkin(day,i,"afternoon-before",15,15,afternoonBase,["Work"]);
  var afternoon=i%4,category=["Exercise","Social","Commute","Rest"][afternoon];
  var title=["Walk or workout","Coffee with a friend","Evening commute","Unstructured rest"][afternoon];
  var shift=[2,1,-1,1][afternoon];
  event(day,i,"afternoon",category,title,16,30,17,15);
  checkin(day,i,"afternoon-after",18,5,Math.max(1,Math.min(5,afternoonBase+shift)),
   afternoon===0?["Exercise","Outdoors"]:afternoon===1?["Social"]:afternoon===2?["Commute"]:["Rest"]);
 }
 return result;
}
function demo(){
 state.demo=buildDemoCalendarScenario(new Date());
 insightScope="demo";
 if(!persist())return;
 navigate("insights");
 toast("28 fictional days loaded. Compare mood before and after calendar events.");
}
function clearDemo(){
 insightScope="personal";
 state.demo={moods:[],health:[],events:[]};
 persist();render();toast("Demo month removed.");
}
function accountPath(route){return "/api/user/"+route;}
function signIn(){globalThis.EvenSignin.open();}
function syncErrorLabel(code){
 var reasons={
  invalid_body:"Even couldn’t read the last upload.",
  invalid_kind:"Even couldn’t read the last upload.",
  no_valid_records:"Some data in the last upload wasn’t valid."
 };
 return reasons[code]||"The last upload didn’t go through.";
}
function renderCalendars(calendars){
 var list=$("calendar-list");
 list.textContent="";
 if(!calendars.length){var empty=document.createElement("p");empty.className="muted";empty.textContent="Calendars appear here after they sync an event.";list.appendChild(empty);return;}
 calendars.forEach(function(calendar){
  var row=document.createElement("label"),name=document.createElement("span"),box=document.createElement("input");
  row.className="calendar-row";name.textContent=calendar.name;box.type="checkbox";box.setAttribute("role","switch");box.checked=calendar.enabled;
  box.addEventListener("change",function(){setCalendar(calendar.name,box);});
  row.appendChild(name);row.appendChild(box);list.appendChild(row);
  var purpose=document.createElement("select");
  purpose.className="calendar-purpose";purpose.setAttribute("aria-label","What "+calendar.name+" is for");
  CALENDAR_PURPOSES.forEach(function(item){var option=document.createElement("option");option.textContent=item==="Other"?"Not set":item;option.value=item;purpose.appendChild(option);});
  purpose.value=calendar.category||"Other";
  purpose.addEventListener("change",function(){setCalendarPurpose(calendar.name,purpose);});
  list.appendChild(purpose);
 });
}
async function setCalendarPurpose(name,select){
 select.disabled=true;
 try{
  var r=await fetch("/api/calendars",{method:"POST",headers:{"Authorization":"Bearer "+state.token,"Content-Type":"application/json"},body:JSON.stringify({name:name,category:select.value}),cache:"no-store"});
  if(!r.ok)throw Error();
  toast(name+" updated.");pull(true);
 }catch(e){toast("Couldn’t update that calendar.");loadSession();}
 finally{select.disabled=false;}
}
async function setCalendar(name,box){
 var enabled=box.checked;box.disabled=true;
 try{
  var r=await fetch("/api/calendars",{method:"POST",headers:{"Authorization":"Bearer "+state.token,"Content-Type":"application/json"},body:JSON.stringify({name:name,enabled:enabled}),cache:"no-store"});
  if(!r.ok)throw Error("Calendar not updated");
  var saved=enabled?0:(await r.json()).savedEvents||0;
  if(saved&&await askConfirm("Also remove "+plural(saved,"saved event","saved events")+" from "+name+" in your account? This can’t be undone.","Remove events")){
   var removed=await fetch("/api/calendars/events/delete",{method:"POST",headers:{"Authorization":"Bearer "+state.token,"Content-Type":"application/json"},body:JSON.stringify({name:name}),cache:"no-store"});
   toast(removed.ok?"Removed "+plural(saved,"saved event","saved events")+" from "+name+".":"Couldn’t remove the saved events from "+name+".");
  }else toast(name+(enabled?" is on.":" is off."));
  pull(true);
 }catch(e){box.checked=!enabled;toast("Couldn’t update that calendar.");}
 finally{box.disabled=false;}
}
function renderSyncDiagnostic(message,type){
 var el=$("shortcut-sync-diagnostic");
 el.hidden=!message;
 el.textContent=message||"";
 el.classList.toggle("sync-error",type==="error");
 el.classList.toggle("sync-success",type==="success");
}
function applyRelease(release){
 try{
  var url=new URL(release.url);
  if(url.origin!=="https://www.icloud.com"||!/^\/shortcuts\/[a-f0-9]{32}$/i.test(url.pathname)||
     !/^\d+\.\d+\.\d+$/.test(release.version))throw Error("Invalid Shortcut release");
  shortcutRelease={url:url.href,version:release.version,verified:release.verified===true};
 }catch(e){shortcutRelease=null;}
}
function deviceDisconnected(){
 shortcutStatus=null;shortcutRelease=null;
 state.token="";state.deviceId="";state.lastSync=null;persist();
}
// One request brings everything the app shows about this device and account.
async function loadSession(){
 if(!state.token||!state.deviceId||!navigator.onLine||sessionLoading)return;
 sessionLoading=true;
 try{
  var r=await fetch("/api/session",{headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
  if(r.status===401){deviceDisconnected();renderSync();return;}
  if(!r.ok)throw Error();
  var data=await r.json();
  if(data.status.deviceId!==state.deviceId)return;
  shortcutStatus=data.status;
  applyRelease(data.release||{});
  renderCalendars(data.calendars||[]);
  renderSyncSettings(data.settings||{});
  renderSync();
  syncMoods(data.moods);
  var uploaded=Date.parse(data.status.lastDataUploadAt);
  if(uploaded&&(!state.lastSync||uploaded>state.lastSync))pull(true);
 }catch(e){
  shortcutRelease=null;renderSync();
  ["calendar-list","sync-settings"].forEach(function(id){
   if($(id).children&&$(id).children.length)return;
   var failed=document.createElement("p");failed.className="muted";failed.textContent="Couldn’t load this. Check your connection.";$(id).appendChild(failed);
  });
 }
 finally{sessionLoading=false;}
}
async function checkShortcutUpload(silent){
 if(!state.token||!state.deviceId){if(!silent)toast("Sign in and connect this device first.");return;}
 if(authEmail&&authEmail!==state.syncOwnerEmail){if(!silent)toast("Switch back to the device owner first.");return;}
 if(shortcutStatusLoading)return;
 var button=$("check-shortcut-upload");
 shortcutStatusLoading=true;button.disabled=true;button.textContent="Checking…";
 try{
  var r=await fetch("/api/sync/status",{headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
  var data=await r.json();
  if(r.status===401){
   deviceDisconnected();
   throw Error("This iPhone was disconnected. Sign in to connect it again.");
  }
  if(!r.ok||!data.credentialValid)throw Error(data.error||"Couldn’t check the connection.");
  if(data.deviceId!==state.deviceId)throw Error("Even couldn’t confirm this iPhone. Sign in to connect it again.");
  shortcutStatus=data;
  if(!silent){
   if(data.lastErrorCode)renderSyncDiagnostic(syncErrorLabel(data.lastErrorCode)+" Run Even Sync again.","error");
   else if(data.lastDataUploadAt)renderSyncDiagnostic("Connected. Last upload "+formatDate(data.lastDataUploadAt)+" at "+formatTime(data.lastDataUploadAt)+". Tap Bring in data to see it.","success");
   else renderSyncDiagnostic("Connected, but no data has arrived yet. Run Even Sync.","error");
  }
 }catch(err){
  if(!silent)renderSyncDiagnostic(err.message||"Couldn’t check the connection. Try again.","error");
 }finally{
  shortcutStatusLoading=false;button.disabled=false;button.textContent="Test connection";renderSync();
 }
}
function showWelcome(name){
 var dialog=$("welcome-dialog");if(dialog.open)return;
 $("welcome-title").textContent="Welcome, "+name+"!";
 $("welcome-improve").href=$("improve-site").href;
 dialog.showModal();
}
function closeWelcome(){
 $("welcome-dialog").close();
 fetch(accountPath("welcomed"),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"}).catch(function(){});
}
async function refreshAuth(){
 if(authChecking||!navigator.onLine)return;
 authChecking=true;
 try{
  // A signed-out request is redirected to sign-in, which is only wanted when someone asks to sign in.
  var r=await fetch(accountPath("me"),{credentials:"same-origin",cache:"no-store",redirect:"manual",headers:{"Accept":"application/json"}});
  if(!r.ok||r.redirected||!(r.headers.get("content-type")||"").includes("application/json"))throw Error("No active login");
  var data=await r.json();if(!data.ok||!data.email)throw Error("Identity unavailable");
  authEmail=String(data.email).toLowerCase();applyName(data);authDevices=Array.isArray(data.devices)?data.devices:[];authCanRelease=data.canRelease===true;authService=authCanRelease&&data.service||null;authHelper=authCanRelease&&data.helper&&/^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/i.test(data.helper.url)?data.helper.url:"";if(data.welcomeName)showWelcome(data.welcomeName);
 }catch(e){authEmail="";authDevices=[];authCanRelease=false;authHelper="";authService=null;}
 finally{authChecking=false;authKnown=true;renderSync();}
 // Connect automatically the first time. After a revoke, connecting again is a deliberate choice.
 if(authEmail&&!state.token&&!state.pairedAt&&!state.syncOwnerEmail)issueDevice();
}
async function accountSafe(email){
 if(state.syncOwnerEmail&&state.syncOwnerEmail!==email){
  toast("This device belongs to "+state.syncOwnerEmail+". Back up your data and erase local records before switching.");
  return false;
 }
 if(!state.syncOwnerEmail){
  var personal=state.moods.length||state.health.length||state.events.length;
  if(personal&&!await askConfirm("This iPhone already has check-ins or other records. Keep them with "+email+"? Choose Cancel if they’re someone else’s.","Keep them"))return false;
 }
 return true;
}
async function issueDevice(){
 if(!authEmail){toast("Sign in with email first.");return;}
 if(connecting||!await accountSafe(authEmail))return;
 var button=$("issue-device");connecting=true;button.disabled=true;button.textContent="Connecting…";renderSync();
 try{
  var r=await fetch(accountPath("device"),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({label:thisDeviceName()+" · "+new Date().toLocaleDateString([],{month:"short",day:"numeric"})}),cache:"no-store"});
  var result=await r.json();if(!r.ok||!result.token)throw Error(result.error||"Couldn’t connect this "+thisDeviceName()+". Try again.");
  if(result.email!==authEmail)throw Error("You signed in with a different account, so this "+thisDeviceName()+" wasn’t connected.");
  state.syncOwnerEmail=authEmail;state.deviceId=result.deviceId;state.token=result.token;state.pairedAt=Date.now();state.lastSync=null;
  if(!persist())return;
  await refreshAuth();await loadSession();render();toast("This "+thisDeviceName()+" is connected.");
 }catch(e){toast(e.message||"Couldn’t connect this "+thisDeviceName()+". Try again.");}
 finally{connecting=false;button.disabled=false;button.textContent="Connect this iPhone";renderSync();}
}
// Signing out ends this browser's session. A connected iPhone keeps syncing.
async function signOut(){
 try{
  var r=await fetch("/api/signin/sign-out",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"});
  if(!r.ok)throw Error();
  await refreshAuth();toast("You’re signed out.");
 }catch(e){toast("Couldn’t sign out. Check your connection and try again.");}
}
async function revokeDevice(id){
 if(!authEmail){toast("Sign in to disconnect a device.");return;}
 var own=id===state.deviceId;
 if(!await askConfirm((own?"Disconnect this iPhone?":"Disconnect this device?")+" Even Sync stops sending data from it. What’s already synced stays in your account.","Disconnect"))return;
 try{
  var r=await fetch(accountPath("revoke"),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId:id}),cache:"no-store"});
  var result=await r.json();if(!r.ok||!result.revoked)throw Error(result.error||"Couldn’t disconnect the device.");
  if(id===state.deviceId){state.token="";state.deviceId="";state.lastSync=null;shortcutStatus=null;shortcutRelease=null;persist();}
  await refreshAuth();render();toast(own?"This iPhone is disconnected. Its records stay on it.":"That device is disconnected.");
 }catch(e){toast(e.message||"Couldn’t disconnect the device.");}
}
var shortcutRunPending=false;
function runShortcut(){shortcutRunPending=true;window.location.href="shortcuts://run-shortcut?name=Even%20Sync&input=text&text="+encodeURIComponent("Bearer "+state.token);}
async function pull(silent){
 if(!state.token){if(!silent)toast("Sign in under Data to bring in your data.");return;}
 var button=$("pull-button");button.disabled=true;button.textContent="Bringing in…";
 try{
  var r=await fetch("/api/pull",{headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
  var body=await r.json();
  if(r.status===401){state.token="";state.deviceId="";shortcutStatus=null;shortcutRelease=null;persist();render();throw Error("This iPhone was disconnected. Sign in to connect it again.");}
  if(!r.ok)throw Error(body.error||"Sync failed");
  if(!body.email||body.email!==state.syncOwnerEmail)throw Error("Account mismatch. Nothing was imported.");
  var serverHealth=body.health||[];if(serverHealth.length<600)state.health=state.health.filter(function(x){return x.source!=="shortcut";});
  var h=0,e=0;serverHealth.forEach(function(x){var v=normalizeHealth(x,"shortcut");if(v){upsertHealth(v);h++;}});
  (body.events||[]).forEach(function(x){var v=normalizeEvent(x,"shortcut");if(v){upsertEvent(v);e++;}});
  var serverEvents=body.events||[],serverIds={},oldest=null;
  serverEvents.forEach(function(x){serverIds[x.id]=true;if(!oldest||x.start<oldest)oldest=x.start;});
  var complete=serverEvents.length<1200;state.events=state.events.filter(function(x){return x.source!=="shortcut"||serverIds[x.id]||(!complete&&x.start<oldest);});
  state.alarms=Array.isArray(body.alarms)?body.alarms:[];applyName(body);
  state.lastSync=Date.parse(body.syncAt)||Date.now();persist();render();if(globalThis.EvenReminders)globalThis.EvenReminders.dataChanged();if(!silent)toast("Synced "+h+" health days and "+e+" calendar events for "+state.syncOwnerEmail+".");
  checkShortcutUpload(true);
 }catch(e){if(!silent)toast(e.message||"Sync unavailable. Local data is unchanged.");}
 finally{button.disabled=false;button.textContent="Bring in data";}
}

async function deleteAccount(){
 if(!authEmail){toast("Sign in first to delete your account.");globalThis.EvenSignin.open();return;}
 if(!navigator.onLine){toast("Connect to the internet to delete your account.");return;}
 if(!await askConfirm("Permanently delete the account for "+authEmail+": all synced data and every connected device? This can’t be undone. Records on this device remain.","Delete account"))return;
 try{
  var r=await fetch(accountPath("account/delete"),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"});
  if(r.status===401||r.status===403){await refreshAuth();toast("Sign in again to delete your account.");globalThis.EvenSignin.open();return;}
  if(!r.ok)throw Error();
  if(globalThis.EvenReminders)globalThis.EvenReminders.turnOff();
  state.token="";state.deviceId="";state.pairedAt=null;state.editedMoods=[];state.deletedMoods=[];shortcutStatus=null;shortcutRelease=null;
  persist();await refreshAuth();render();toast("Account deleted.");
 }catch(e){toast("Couldn’t delete your account. Check your connection and try again.");}
}
// Erasing this device also disconnects it, so no credential is left active.
// Everything personal this device keeps. Anything new that's stored here has to join this list.
var DEVICE_KEYS=[STORAGE_KEY,"even-reminder","even-setup"],DEVICE_CACHES=["even-brief"];
async function eraseDeviceData(){
 try{await fetch("/api/signin/sign-out",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"});}catch(e){/* Offline; the session ends by itself. */}
 if(globalThis.EvenReminders)globalThis.EvenReminders.forget();
 if(globalThis.EvenOnboarding)globalThis.EvenOnboarding.forget();
 DEVICE_KEYS.forEach(function(key){try{localStorage.removeItem(key);}catch(e){/* Nothing to remove if storage is blocked. */}});
 state=emptyState();shortcutRelease=null;shortcutStatus=null;authEmail="";authDevices=[];authCanRelease=false;authHelper="";authService=null;persist();render();
 if("caches" in globalThis)DEVICE_CACHES.forEach(function(name){caches.delete(name).catch(function(){return false;});});
}
async function eraseLocal(){
 if(!await askConfirm("Delete everything on this device: check-ins, notes, health and calendar data, notification settings and setup progress. It also signs out and disconnects this device. Synced data in your account stays until you erase it. This can’t be undone.","Delete"))return;
 var disconnected=!state.token;
 if(state.token&&navigator.onLine){
  try{disconnected=(await fetch("/api/device/disconnect",{method:"POST",headers:{"Authorization":"Bearer "+state.token},cache:"no-store"})).ok;}catch(e){/* Offline; the message below says to remove it from another device. */}
 }
 await eraseDeviceData();
 toast(disconnected?"This device’s records are deleted.":"Records deleted. This device couldn’t be disconnected, so remove it under Devices on another device.");
}
async function eraseRemote(){
 if(!authEmail){toast("Sign in first to erase synced data.");globalThis.EvenSignin.open();return;}
 if(!await askConfirm("Permanently delete everything synced for "+authEmail+": Health, calendar, alarms, your notification schedule, the name you set, and your check-ins and notes on all your devices? This can’t be undone. Health and calendar records already on this device stay.","Erase"))return;
 try{var r=await fetch(accountPath("erase"),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"});if(!r.ok)throw Error("Delete failed");state.moods=[];state.editedMoods=[];state.deletedMoods=[];persist();if(globalThis.EvenReminders)globalThis.EvenReminders.turnOff();render();toast("Synced data erased.");}catch(e){toast("Could not delete cloud data.");}
}
var swRegistration=null;
function checkForUpdate(){if(swRegistration)swRegistration.update().catch(function(){});}
function refresh(){checkForUpdate();pull(false);}
function hasDraft(){return !!selectedMood||!!selectedStress||selectedTags.size>0||!!$("mood-note").value.trim();}
function watchForUpdates(){
 if(!("serviceWorker" in navigator))return;
 var wasControlled=!!navigator.serviceWorker.controller,updateReady=false;
 window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").then(function(r){swRegistration=r;}).catch(function(){});});
 navigator.serviceWorker.addEventListener("controllerchange",function(){
  if(!wasControlled){wasControlled=true;return;}
  updateReady=true;
  if(document.hidden&&!hasDraft())return;
  $("update-banner").hidden=false;
 });
 document.addEventListener("visibilitychange",function(){
  if(document.hidden)return;
  // Reloading while hidden can leave iOS with a stale layout, so wait until the app is back on screen.
  if(updateReady&&!hasDraft()){window.location.reload();return;}
  checkForUpdate();
 });
 $("apply-update").addEventListener("click",function(){window.location.reload();});
}
// A copy with nothing on it goes straight to the permanent address. One holding someone's records stays, with the steps to move them.
function checkAddress(){
 if(location.hostname!=="even.bishvili.workers.dev")return false;
 if(!state.moods.length&&!state.health.length&&!state.events.length&&!state.token){location.replace(HOME_ORIGIN+location.pathname+location.search+location.hash);return true;}
 $("moved-card").hidden=false;
 $("moved-open").href="x-safari-"+HOME_ORIGIN;
 $("moved-backup").addEventListener("click",openBackup);
 return false;
}
function init(){
 if(checkAddress())return;
 $("health-date").value=dateKey(now());var start=new Date();start.setMinutes(0,0,0);start.setHours(start.getHours()+1);var end=new Date(start);end.setHours(end.getHours()+1);$("cal-start").value=localDateTime(start);$("cal-end").value=localDateTime(end);
 document.querySelectorAll("[data-go]").forEach(function(b){b.addEventListener("click",function(ev){ev.preventDefault();navigate(b.dataset.go);$(b.dataset.go+"-title").focus({preventScroll:true});if(b.dataset.go==="data"){refreshAuth();loadSession();}});});
 document.querySelectorAll("[data-mood]").forEach(function(b){b.addEventListener("click",function(){selectMood(Number(b.dataset.mood));});});
 document.querySelectorAll("[data-tag]").forEach(function(b){b.setAttribute("aria-pressed","false");b.addEventListener("click",function(){var s=b.dataset.tag;selectedTags.has(s)?selectedTags.delete(s):selectedTags.add(s);b.classList.toggle("selected",selectedTags.has(s));b.setAttribute("aria-pressed",String(selectedTags.has(s)));});});
 document.querySelectorAll("[data-stress]").forEach(function(b){b.addEventListener("click",function(){var n=Number(b.dataset.stress);selectStress(selectedStress===n?0:n);});});
 $("energy").addEventListener("input",function(){energyTouched=true;setEnergyText();});$("save-mood").addEventListener("click",handleMoodSave);
 $("health-form").addEventListener("submit",handleHealthForm);$("calendar-form").addEventListener("submit",handleCalendarForm);
 $("health-import").addEventListener("change",function(ev){importHealth(ev.target.files[0]);ev.target.value="";});
 $("calendar-import").addEventListener("change",function(ev){importCalendar(ev.target.files[0]);ev.target.value="";});
 $("recent-list").addEventListener("click",function(ev){var e=ev.target.closest("[data-edit-mood]");if(e)openEdit(e.dataset.editMood);});
 $("edit-form").addEventListener("submit",saveEdit);
 $("edit-cancel").addEventListener("click",function(){$("edit-sheet").close();});
 $("recent-list").addEventListener("click",function(ev){var b=ev.target.closest("[data-delete-mood]");if(b)askConfirm("Delete this check-in? This can’t be undone.","Delete").then(function(yes){if(!yes)return;state.moods=state.moods.filter(function(x){return x.id!==b.dataset.deleteMood;});state.deletedMoods.push(b.dataset.deleteMood);persist();render();syncMoods();});});
 $("context-list").addEventListener("click",function(ev){var b=ev.target.closest("[data-delete-health]");if(b)askConfirm("Delete this health day from this device?","Delete").then(function(yes){if(!yes)return;state.health=state.health.filter(function(x){return x.date!==b.dataset.deleteHealth;});persist();render();});
 b=ev.target.closest("[data-delete-event]");if(b)askConfirm("Delete this event from this device?","Delete").then(function(yes){if(!yes)return;state.events=state.events.filter(function(x){return x.id!==b.dataset.deleteEvent;});persist();render();});});
 document.querySelectorAll("[data-days]").forEach(function(b){b.addEventListener("click",function(){insightDays=Number(b.dataset.days);document.querySelectorAll("[data-days]").forEach(function(x){x.classList.toggle("selected",x===b);});renderInsights();});});
 document.querySelectorAll("[data-scope]").forEach(function(b){b.addEventListener("click",function(){insightScope=b.dataset.scope;renderInsights();});});
 $("login-button").addEventListener("click",function(){signIn();});
 $("issue-device").addEventListener("click",issueDevice);
 $("install-shortcut").addEventListener("click",function(e){if(!this.href){e.preventDefault();toast($("shortcut-install-help").textContent);}});
 $("check-shortcut-upload").addEventListener("click",function(){checkShortcutUpload(false);});
 $("device-list").addEventListener("click",function(e){var b=e.target.closest("[data-revoke-device]");if(b)revokeDevice(b.dataset.revokeDevice);});$("device-list").addEventListener("click",function(e){var b=e.target.closest("[data-rename-device]");if(b)openRenameDevice(b.dataset.renameDevice);});$("rename-device-form").addEventListener("submit",renameDevice);$("your-name-form").addEventListener("submit",saveYourName);$("your-name").value=state.name;$("rename-device-cancel").addEventListener("click",function(){$("rename-device-dialog").close();});
 // An installed app can't save downloads, so hand this one to Safari.
 if(navigator.standalone===true)["whitepaper-link","welcome-paper"].forEach(function(id){$(id).href="x-safari-https://"+location.host+"/whitepaper.html";});
 $("run-sync-now").addEventListener("click",function(){$("run-sync-dialog").close();runShortcut();});$("run-sync-later").addEventListener("click",function(){$("run-sync-dialog").close();});$("welcome-close").addEventListener("click",closeWelcome);$("welcome-improve").addEventListener("click",closeWelcome);
 var navTouch=null;
 document.querySelector(".bottom-nav").addEventListener("touchstart",function(ev){var t=ev.changedTouches[0];navTouch={x:t.clientX,y:t.clientY};},{passive:true});
 document.querySelector(".bottom-nav").addEventListener("touchend",function(ev){
  // A tap during momentum scrolling only stops the scroll and produces no click.
  var item=ev.target.closest("[data-go]"),t=ev.changedTouches[0];
  if(!item||!navTouch||Math.abs(t.clientX-navTouch.x)>12||Math.abs(t.clientY-navTouch.y)>12)return;
  ev.preventDefault();item.click();
 });
 $("pull-button").addEventListener("click",function(){pull(false);});$("run-shortcut").addEventListener("click",function(event){event.preventDefault();runShortcut();});
 $("unpair-button").addEventListener("click",function(){if(state.deviceId)revokeDevice(state.deviceId);});
 $("sign-out").addEventListener("click",signOut);
 $("erase-remote").addEventListener("click",eraseRemote);
 $("backup-button").addEventListener("click",openBackup);
 $("backup-form").addEventListener("submit",function(ev){ev.preventDefault();var passphrase=$("backup-passphrase").value;$("backup-passphrase-sheet").close();saveBackup(passphrase);});
 $("backup-cancel").addEventListener("click",function(){$("backup-passphrase-sheet").close();});
 $("restore-form").addEventListener("submit",openProtectedBackup);
 $("restore-cancel").addEventListener("click",function(){pendingBackup=null;$("restore-passphrase-sheet").close();});
 $("restore-input").addEventListener("change",function(ev){restoreBackup(ev.target.files[0]);ev.target.value="";});
 $("erase-local").addEventListener("click",eraseLocal);$("delete-account").addEventListener("click",deleteAccount);
 $("demo-button").addEventListener("click",demo);$("clear-demo-button").addEventListener("click",clearDemo);
 setEnergyText();navigate(location.hash.slice(1)||"checkin");
 window.addEventListener("online",renderSync);window.addEventListener("offline",renderSync);
 if(navigator.onLine)refreshAuth();
 if(state.token&&navigator.onLine)loadSession();
 window.addEventListener("online",foreground);
 document.addEventListener("visibilitychange",function(){if(!document.hidden)foreground();});
 watchForUpdates();
 // iOS can pan the document to reveal a focused field, and the document should never stay scrolled.
 document.addEventListener("focusout",function(){setTimeout(function(){if(window.scrollY)window.scrollTo(0,0);},100);});
 window.addEventListener("load",handleNotificationAction);
 if(new URLSearchParams(location.search).get("auth")==="denied"){var back=location.hash==="#checkin"?"checkin":"data";history.replaceState(null,"","/#"+back);navigate(back);toast("This email isn’t on the list yet. Ask the person who invited you.");}
 if(new URLSearchParams(location.search).get("sync")==="1"){history.replaceState(null,"","/#checkin");navigate("checkin");if(state.token)pull(false);}
}
// A notification can open the app to a specific action.
// Coming back makes one request, plus one more only when there's new data to bring in.
function foreground(){
 if(!state.token){refreshAuth();return;}
 loadSession();
 if(shortcutRunPending){shortcutRunPending=false;if($("run-sync-dialog").open)$("run-sync-dialog").close();pull(false);}
}
function handleNotificationAction(){
 var params=new URLSearchParams(location.search),action=params.get("do");
 if(!action)return;
 history.replaceState(null,"","/#checkin");
 if(action==="reset")globalThis.EvenCoach.openReset();
 if(action==="sync"){
  if(!state.token){navigate("data");toast("Sign in to run Even Sync.");return;}
  $("run-sync-dialog").showModal();
  runShortcut();
 }
}
// What first-run setup needs to know. Synced means an upload arrived or synced records are here.
function setup(){
 var paired=!!state.token&&!!state.syncOwnerEmail&&!!state.deviceId;
 var synced=!!(shortcutStatus&&shortcutStatus.lastDataUploadAt)||state.alarms.length>0||state.health.some(function(h){return h.source==="shortcut";})||state.events.some(function(e){return e.source==="shortcut";});
 return {ios:isIOS(),installed:isInstalled(),deviceName:thisDeviceName(),online:navigator.onLine,signedIn:!!authEmail,authKnown:authKnown,email:authEmail,connected:paired,connectedBefore:!!state.pairedAt,connecting:connecting,moodSync:!!state.moodSync,
  shortcutUrl:shortcutLink(),shortcutConnected:!!(shortcutStatus&&shortcutStatus.installedShortcutVersion),synced:synced,checkedIn:state.moods.length>0};
}
globalThis.EvenApp={askConfirm:askConfirm,accountPath:accountPath,refreshAuth:refreshAuth,firstName:function(){return state.firstName;},navigate:navigate,setup:setup,signIn:signIn,connect:issueDevice,isInstalled:isInstalled,isIOS:isIOS,alarms:function(){return state.alarms;},resets:function(){return state.resets;},logReset:function(){state.resets.push(new Date().toISOString());state.resets=state.resets.slice(-500);persist();},personalEvents:function(){return state.events;},personalHealth:function(){return state.health;},personalMoods:function(){return state.moods;},refresh:refresh,runShortcut:runShortcut,refreshCoach:refreshCoach,addReflection:function(r){state.reflections.push(r);if(persist())render();},toast:toast,formatTime:formatTime,deviceToken:function(){return state.token;}};
init();
})();