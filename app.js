(function () {
"use strict";
var VERSION = "1.12.6";
var SHORTCUT_PAGE = "https://routinehub.co/shortcut/26978/";
var STORAGE_KEY = "rage-tracker:v1";
var MOOD_NAMES = ["","Rough","Low","Okay","Good","Great"];
var MOOD_EMOJI = ["","😣","😕","😐","🙂","😄"];
var ENERGY_NAMES = ["","Very low","Low","Medium","High","Very high"];
var CATEGORIES = ["Meeting","Work","Exercise","Social","Family","Rest","Commute","Other"];
var ACTIVITY_LABELS = ["Work","Meeting","Exercise","Social","Family","Rest","Outdoors","Commute","Food"];
var selectedMood = 0, selectedTags = new Set(), insightDays = 30, insightScope = "personal", toastTimer = null;
var state = readState();
var authEmail = "", authDevices = [], authChecking = false, authCanRelease = false;
var shortcutRelease = null, shortcutStatus = null, shortcutStatusLoading = false;
function $(id){ return document.getElementById(id); }
function emptyState(){ return {moods:[],health:[],events:[],token:"",deviceId:"",syncOwnerEmail:"",pairedAt:null,lastSync:null}; }
function readState(){
 try { var raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null"); if(!raw || typeof raw!=="object")return emptyState();
 var owner=typeof raw.syncOwnerEmail==="string"?raw.syncOwnerEmail.toLowerCase():"",deviceId=typeof raw.deviceId==="string"?raw.deviceId:"";
 return {moods:Array.isArray(raw.moods)?raw.moods.slice(-6000):[],health:Array.isArray(raw.health)?raw.health.slice(-1200):[],events:Array.isArray(raw.events)?raw.events.slice(-2000):[],token:owner&&deviceId&&typeof raw.token==="string"?raw.token:"",deviceId:deviceId,syncOwnerEmail:owner,pairedAt:raw.pairedAt||null,lastSync:raw.lastSync||null};
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
function navigate(view){if(!["checkin","insights","sources","sync","settings"].includes(view))view="checkin";
 document.querySelectorAll(".view").forEach(function(v){v.classList.toggle("active",v.id==="view-"+view);});
 document.querySelectorAll(".nav-item").forEach(function(n){n.classList.toggle("active",n.dataset.go===view);});
 if(location.hash!=="#"+view)history.replaceState(null,"","#"+view);
 window.scrollTo(0,0);render();
}
function render(){
 $("date-label").textContent=formatPrettyDate(now()).toUpperCase();
 $("current-time").textContent=formatTime(now());
 renderStats();renderRecent();renderSources();renderSync();renderSettings();
 if($("view-insights").classList.contains("active"))renderInsights();
}
function getRecent(days){var cutoff=Date.now()-days*86400000;return state.moods.filter(function(m){return m.ts&&new Date(m.ts).getTime()>=cutoff&&m.score>=1&&m.score<=5;});}
function renderStats(){
 var personal=state.moods.filter(function(m){return !m.demo;}), today=dateKey(now()), cutoff=Date.now()-7*86400000;
 var counts=personal.filter(function(m){return new Date(m.ts).getTime()>=cutoff;}), days=new Set(personal.map(function(m){return dateKey(m.ts);}));
 $("stat-today").textContent=personal.filter(function(m){return dateKey(m.ts)===today;}).length;
 $("stat-average").textContent=score(average(counts.map(function(m){return m.score;})));
 var d=new Date();d.setHours(12,0,0,0);
 if(!days.has(dateKey(d)))d.setDate(d.getDate()-1);
 var streak=0;while(days.has(dateKey(d))&&streak<3650){streak++;d.setDate(d.getDate()-1);}
 $("stat-streak").textContent=streak;
}
function renderRecent(){
 var moods=state.moods.filter(function(m){return !m.demo;}).sort(function(a,b){return new Date(b.ts)-new Date(a.ts);});
 $("entries-count").textContent=moods.length+" personal entries";
 $("recent-list").innerHTML=moods.length?moods.slice(0,12).map(function(m){
 var tags=(m.tags||[]).join(" · "),sub=formatDate(m.ts)+" at "+formatTime(m.ts)+(tags?" · "+tags:"")+(m.demo?" · DEMO":"");
 return '<div class="entry"><span class="entry-emoji">'+MOOD_EMOJI[m.score]+'</span><div class="entry-main"><strong>'+MOOD_NAMES[m.score]+(m.note?" · "+esc(m.note):"")+'</strong><small>'+esc(sub)+'</small></div><div class="entry-side">'+m.score+'/5</div><button class="entry-delete" aria-label="Delete check-in" data-delete-mood="'+esc(m.id)+'">×</button></div>';
 }).join(""):blank("Your first check-in will appear here. It takes less than ten seconds.");
}
function renderSources(){
 $("health-count").textContent=state.health.length+" health day"+(state.health.length===1?"":"s");
 $("calendar-count").textContent=state.events.length+" calendar event"+(state.events.length===1?"":"s");
 var hs=state.health.map(function(h){return {kind:"health",ts:h.date+"T12:00:00",h:h};});
 var cs=state.events.map(function(e){return {kind:"event",ts:e.start,e:e};});
 var all=hs.concat(cs).filter(function(x){return !isNaN(new Date(x.ts).getTime());}).sort(function(a,b){return new Date(b.ts)-new Date(a.ts);});
 $("context-count").textContent=all.length+" items";
 $("context-list").innerHTML=all.length?all.slice(0,12).map(function(x){
 if(x.kind==="health"){var h=x.h, summary=[h.sleepHours!=null?Math.round(h.sleepHours*10)/10+"h sleep":"",h.steps!=null?h.steps.toLocaleString()+" steps":"",h.hrv!=null?Math.round(h.hrv)+" ms HRV":"",h.restingHR!=null?Math.round(h.restingHR)+" bpm resting":"",h.workoutMin!=null?Math.round(h.workoutMin)+" min exercise":""].filter(Boolean).join(" · ");
 return '<div class="entry"><span class="entry-emoji">♥</span><div class="entry-main"><strong>Health · '+esc(h.date)+'</strong><small>'+esc(summary||"Health day")+(h.demo?" · DEMO":"")+'</small></div><button class="entry-delete" aria-label="Delete health day" data-delete-health="'+esc(h.date)+'">×</button></div>';}
 var e=x.e;
 return '<div class="entry"><span class="entry-emoji">▦</span><div class="entry-main"><strong>'+esc(e.title||"Calendar event")+'</strong><small>'+esc(formatDate(e.start)+" "+formatTime(e.start)+" · "+e.category+(e.demo?" · DEMO":""))+'</small></div><button class="entry-delete" aria-label="Delete calendar event" data-delete-event="'+esc(e.id)+'">×</button></div>';
 }).join(""):blank("No context yet. Add a health day, calendar event, or connect Shortcuts.");
}
function compareVersions(left,right){
 if(!/^\d+\.\d+\.\d+$/.test(left||"")||!/^\d+\.\d+\.\d+$/.test(right||""))return 0;
 var a=left.split(".").map(Number),b=right.split(".").map(Number);
 for(var i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;
 return 0;
}
function renderSync(){
 $("release-card").hidden=!authCanRelease;
 var paired=!!state.token&&!!state.syncOwnerEmail&&!!state.deviceId;
 var mismatch=!!authEmail&&!!state.syncOwnerEmail&&authEmail!==state.syncOwnerEmail;
 $("login-panel").hidden=!!authEmail;$("login-ready").hidden=!authEmail;
 $("auth-email").textContent=authEmail||"—";
 $("owner-mismatch").hidden=!mismatch;
 $("need-device").hidden=!authEmail||paired||mismatch;
 $("pair-connected").hidden=!paired;
 $("pair-status").textContent=paired?"Connected · "+state.syncOwnerEmail:authEmail?"Signed in":"Not signed in";
 $("pair-badge").textContent=paired?"ON":"OFF";
 $("pair-badge").classList.toggle("on",paired);
 $("sync-light").classList.toggle("connected",paired);
 $("sync-light-text").textContent=paired?"Sync ready":"Local only";
 $("sync-token").textContent=paired?"Bearer "+("•".repeat(18))+"…"+state.token.slice(-6):"Generate a device key";
 $("last-sync").textContent=state.lastSync?"Last synced "+formatDate(state.lastSync)+" at "+formatTime(state.lastSync):"Not synced yet";
 var accountMatches=!authEmail||authEmail===state.syncOwnerEmail;
 var install=$("install-shortcut"),release=shortcutRelease;
 var canInstall=paired&&accountMatches&&navigator.onLine;
 var publishedRelease=release&&release.url&&release.verified?release:null;
 install.hidden=!canInstall;
 $("run-shortcut").hidden=!paired||mismatch||!!(shortcutStatus&&shortcutStatus.installedShortcutVersion&&compareVersions(shortcutStatus.installedShortcutVersion,"2.3.3")<0);
 if(canInstall){install.href=publishedRelease?publishedRelease.url:SHORTCUT_PAGE;install.removeAttribute("aria-disabled");install.removeAttribute("tabindex");}
 else{install.removeAttribute("href");install.setAttribute("aria-disabled","true");install.setAttribute("tabindex","-1");}
 $("shortcut-release-version").textContent=shortcutStatus&&shortcutStatus.installedShortcutVersion?"Connected · v"+shortcutStatus.installedShortcutVersion:"Not connected";
 $("shortcut-install-help").textContent=canInstall
  ?"Your device key isn’t included in the Shortcut."
  :mismatch?"Sign in with this iPhone’s account to continue."
  :paired?"Connect to the internet to get the Shortcut."
  :"Generate a device key to get the Shortcut.";
 $("check-shortcut-upload").disabled=!paired||mismatch||shortcutStatusLoading;
 var installed=shortcutStatus&&shortcutStatus.installedShortcutVersion||"";
 $("shortcut-update-badge").hidden=!(canInstall&&publishedRelease&&installed&&compareVersions(publishedRelease.version,installed)>0);
 var last=shortcutStatus&&shortcutStatus.lastDataUploadAt;
 $("shortcut-last-upload").textContent=last
  ?"Received "+formatDate(last)+" at "+formatTime(last)
  :paired&&shortcutStatus&&shortcutStatus.lastAttemptAt&&shortcutStatus.installedShortcutVersion
    ?"Connected "+formatDate(shortcutStatus.lastAttemptAt)+" · no data yet"
  :"Nothing received yet";
 $("shortcut-upload-counts").textContent=shortcutStatus
  ?shortcutStatus.healthMetrics+" health measurements · "+shortcutStatus.calendarEvents+" calendar events"
  :"No steps or events yet";
 renderDevices();
}
function renderDevices(){
 var el=$("device-list");
 if(!authEmail){el.innerHTML=blank("Sign in to see your devices.");return;}
 if(!authDevices.length){el.innerHTML=blank("No devices yet. Generate a key to connect this iPhone.");return;}
 el.innerHTML=authDevices.map(function(d){
  var revoked=!!d.revoked,own=d.id===state.deviceId;
  return '<div class="device-row"><div class="device-row-main"><strong>'+esc(d.label||"iPhone")+(own?" · This device":"")+'</strong><small>'+esc(d.revoked?"Revoked":d.lastUsedAt?"Used "+formatDate(d.lastUsedAt):"Not used yet")+'</small></div>'+(revoked?'<span class="muted">Revoked</span>':'<button class="small-action" type="button" data-revoke-device="'+esc(d.id)+'">Revoke</button>')+'</div>';
 }).join("");
}

function renderSettings(){
 $("demo-button").textContent=hasDemoData()?"Refresh the calendar demo":"Load 28-day calendar demo";
 $("storage-summary").textContent=state.moods.length+" mood check-ins · "+state.health.length+" health days · "+state.events.length+" calendar events";
 $("version").textContent=VERSION;
}
function hasDemoData(){return state.moods.some(function(m){return !!m.demo;});}
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
 var moods=getRecent(insightDays).filter(function(m){return !!m.demo===isDemo;}).sort(function(a,b){return new Date(a.ts)-new Date(b.ts);});
 var events=state.events.filter(function(e){return !!e.demo===isDemo;});
 var health=state.health.filter(function(h){return !!h.demo===isDemo;});
 $("insight-average").textContent=score(average(moods.map(function(m){return m.score;})))+"/5";
 $("insight-samples").textContent=moods.length+" "+(isDemo?"fictional":"personal")+" check-ins over "+insightDays+" days";
 drawTrend(moods);drawTimes(moods);drawActivity(moods);drawCalendar(moods,events);drawHealth(moods,health);
}
function drawTrend(moods){
 var byDay={};moods.forEach(function(m){var k=dateKey(m.ts);(byDay[k]||(byDay[k]=[])).push(m.score);});
 var keys=Object.keys(byDay).sort();var points=keys.map(function(k){return {date:k,v:average(byDay[k])};});
 if(points.length<2){$("trend-chart").innerHTML=blank("Two different days of mood check-ins will reveal your trend.");$("trend-note").textContent="Try checking in morning and evening.";return;}
 var start=Date.now()-(insightDays-1)*86400000, end=Date.now(), W=600,H=153;
 var line=points.map(function(p){var x=20+(new Date(p.date+"T12:00:00").getTime()-start)/(end-start)*560,y=13+(5-p.v)/4*118;return [Math.max(20,Math.min(580,x)),y];});
 var path=line.map(function(x){return x[0].toFixed(1)+","+x[1].toFixed(1);}).join(" ");
 var dots=line.map(function(p){return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="4.1" fill="#e9d29b" stroke="#163e3b" stroke-width="1.5"/>';}).join("");
 $("trend-chart").innerHTML='<svg viewBox="0 0 600 153" role="img" aria-label="Mood average by day from 1 to 5"><line x1="20" y1="13" x2="580" y2="13" stroke="#57756b" stroke-dasharray="3 5"/><line x1="20" y1="72" x2="580" y2="72" stroke="#57756b" stroke-dasharray="3 5"/><line x1="20" y1="131" x2="580" y2="131" stroke="#57756b" stroke-dasharray="3 5"/><polyline points="'+path+'" fill="none" stroke="#a1d9c1" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'+dots+'<text x="0" y="149" font-size="12" fill="#a3c0b5">1</text><text x="0" y="17" font-size="12" fill="#a3c0b5">5</text></svg>';
 $("trend-note").textContent=points.length+" days with check-ins · Daily averages (1–5)";
}
function timeGroup(ts){var h=new Date(ts).getHours();return h>=5&&h<11?0:h>=11&&h<15?1:h>=15&&h<20?2:3;}
function drawTimes(moods){
 var names=["Morning · 5–11","Midday · 11–3","Afternoon · 3–8","Evening · 8–5"];
 $("time-insights").innerHTML=moods.length?names.map(function(name,i){var group=moods.filter(function(m){return timeGroup(m.ts)===i;}),avg=average(group.map(function(m){return m.score;}));return '<div class="bar-row"><div class="bar-name">'+name.split(" · ")[0]+'<span class="bar-sub">'+group.length+' check-ins</span></div><div class="bar-track"><div class="bar-fill" style="width:'+(group.length?((avg/5)*100).toFixed(1):0)+'%"></div></div><div class="bar-number">'+score(avg)+'</div></div>';}).join("")+'<p class="muted">Compare time buckets only after each has several check-ins.</p>':blank("Log moods at different times to see when you tend to feel better.");
}
function diffHtml(label,yes,no){
 var d=average(yes)-average(no),cls=d>0.05?"positive":d<-0.05?"negative":"",v=(d>0?"+":"")+d.toFixed(1);
 return '<div class="diff-row"><div><strong>'+esc(label)+'</strong><p>'+yes.length+' with · '+no.length+' without</p></div><div class="diff '+cls+'">'+v+' / 5</div></div>';
}
function drawActivity(moods){
 var rows=[];
 ACTIVITY_LABELS.forEach(function(tag){var yes=moods.filter(function(m){return (m.tags||[]).includes(tag);}).map(function(m){return m.score;}),no=moods.filter(function(m){return !(m.tags||[]).includes(tag);}).map(function(m){return m.score;});if(yes.length>=3&&no.length>=3)rows.push({tag:tag,yes:yes,no:no,d:average(yes)-average(no)});});
 rows.sort(function(a,b){return Math.abs(b.d)-Math.abs(a.d);});
 $("activity-insights").innerHTML=rows.length?rows.slice(0,6).map(function(r){return diffHtml(r.tag,r.yes,r.no);}).join(""):blank("Add activity tags to at least 3 check-ins, with at least 3 others for comparison.");
}
function calendarPatternSummary(moods,events){
 var windowMs=90*60000;
 var samples=moods.map(function(m){return {time:new Date(m.ts).getTime(),ts:m.ts,score:m.score};})
  .filter(function(m){return Number.isFinite(m.time)&&m.score>=1&&m.score<=5;});
 var valid=events.map(function(e){
  return {category:e.category,start:new Date(e.start).getTime(),end:new Date(e.end).getTime()};
 }).filter(function(e){return CATEGORIES.includes(e.category)&&Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>e.start;});
 var unaffected=samples.filter(function(m){return !valid.some(function(e){return m.time>=e.start&&m.time<=e.end+windowMs;});});
 var paired=[],compared=[];
 CATEGORIES.forEach(function(category){
  var relevant=valid.filter(function(e){return e.category===category;});
  if(!relevant.length)return;
  var before=[],after=[];
  relevant.forEach(function(e){
   var pre=null,post=null;
   samples.forEach(function(m){
    if(m.time>=e.start-windowMs&&m.time<e.start&&(!pre||m.time>pre.time))pre=m;
    if(m.time>=e.end&&m.time<=e.end+windowMs&&(!post||m.time<post.time))post=m;
   });
   if(pre&&post){before.push(pre.score);after.push(post.score);}
  });
  if(before.length>=3){
   paired.push({category:category,count:before.length,before:average(before),after:average(after),delta:average(after)-average(before)});
  }
  var exposed=samples.filter(function(m){return relevant.some(function(e){return m.time>=e.start&&m.time<=e.end+windowMs;});});
  if(exposed.length>=3){
   var buckets=new Set(exposed.map(function(m){return timeGroup(m.ts);}));
   var controls=unaffected.filter(function(m){return buckets.has(timeGroup(m.ts));});
   if(controls.length>=3)compared.push({category:category,withCount:exposed.length,withoutCount:controls.length,withMood:average(exposed.map(function(m){return m.score;})),withoutMood:average(controls.map(function(m){return m.score;})),delta:average(exposed.map(function(m){return m.score;}))-average(controls.map(function(m){return m.score;}))});
  }
 });
 paired.sort(function(a,b){return Math.abs(b.delta)-Math.abs(a.delta);});
 compared.sort(function(a,b){return Math.abs(b.delta)-Math.abs(a.delta);});
 return {paired:paired,compared:compared,eventCount:valid.length};
}
function signedScore(delta){return (delta>0?"+":"")+delta.toFixed(1);}
function drawCalendar(moods,events){
 if(!moods.length||!events.length){
  $("calendar-insights").innerHTML=blank("Log mood before and after calendar events, or load the fictional calendar scenario in Settings.");
  return;
 }
 var patterns=calendarPatternSummary(moods,events);
 var html='<div class="calendar-analysis-header"><span class="mini-heading">MOOD BEFORE → AFTER AN EVENT</span><span class="muted">90-minute windows</span></div>';
 if(patterns.paired.length){
  html+=patterns.paired.map(function(r){
   var cls=r.delta>0.05?"positive":r.delta<-0.05?"negative":"";
   return '<div class="calendar-pair"><div class="calendar-pair-label"><strong>'+esc(r.category)+'</strong><small>'+r.count+' paired event'+(r.count===1?"":"s")+'</small></div><div class="calendar-pair-scores">'+score(r.before)+' <span aria-hidden="true">→</span> '+score(r.after)+'</div><span class="calendar-delta '+cls+'">'+signedScore(r.delta)+'</span></div>';
  }).join("");
 }else html+='<p class="muted calendar-empty">Need at least 3 events of the same type with a check-in within 90 minutes before the start and within 90 minutes after the end.</p>';
 html+='<div class="calendar-subsection"><div class="calendar-analysis-header"><span class="mini-heading">NEAR EVENTS VS OTHER CHECK-INS</span><span class="muted">5-point mood scale</span></div>';
 if(patterns.compared.length){
  html+=patterns.compared.map(function(r){
   var cls=r.delta>0.05?"positive":r.delta<-0.05?"negative":"";
   return '<div class="diff-row"><div><strong>'+esc(r.category)+'</strong><p>'+r.withCount+' near events · '+r.withoutCount+' other check-ins in similar parts of the day</p></div><span class="diff '+cls+'">'+signedScore(r.delta)+' / 5</span></div>';
  }).join("");
 }else html+='<p class="muted calendar-empty">More check-ins outside calendar events are needed for a same-time-of-day comparison.</p>';
 html+='</div><p class="calendar-explainer">Paired changes compare the closest check-ins before and after an event. “Near” includes the event itself and up to 90 minutes afterward. These are associations, not proof of cause; overlapping events can share check-ins.</p>';
 $("calendar-insights").innerHTML=html;
}
function drawHealth(moods,health){
 var d={};moods.forEach(function(m){(d[dateKey(m.ts)]||(d[dateKey(m.ts)]=[])).push(m.score);});
 var joined=health.filter(function(h){return d[h.date]&&d[h.date].length;}).map(function(h){return {h:h,mood:average(d[h.date])};});
 var comps=[{name:"Sleep 7h or more",key:"sleepHours",test:function(v){return v>=7;}},{name:"6,000+ steps",key:"steps",test:function(v){return v>=6000;}},{name:"Any workout",key:"workoutMin",test:function(v){return v>0;}}];
 var rows=[];
 comps.forEach(function(c){var valid=joined.filter(function(x){return x.h[c.key]!=null&&Number.isFinite(number(x.h[c.key]));}),yes=valid.filter(function(x){return c.test(number(x.h[c.key]));}).map(function(x){return x.mood;}),no=valid.filter(function(x){return !c.test(number(x.h[c.key]));}).map(function(x){return x.mood;});if(yes.length>=3&&no.length>=3)rows.push({name:c.name,yes:yes,no:no});});
 var hrv=joined.filter(function(x){return x.h.hrv!=null&&Number.isFinite(number(x.h.hrv));});
 if(hrv.length>=6){var sorted=hrv.map(function(x){return number(x.h.hrv);}).sort(function(a,b){return a-b;}),med=(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2;
 var yes=hrv.filter(function(x){return number(x.h.hrv)>=med;}).map(function(x){return x.mood;}),no=hrv.filter(function(x){return number(x.h.hrv)<med;}).map(function(x){return x.mood;});if(yes.length>=3&&no.length>=3)rows.push({name:"Higher-than-median HRV",yes:yes,no:no});}
 $("health-insights").innerHTML=rows.length?rows.map(function(r){return diffHtml(r.name,r.yes,r.no);}).join("")+'<p class="muted">One daily mood average per date · '+joined.length+' matched days</p>':blank("To compare sleep or activity, log mood on at least 6 days with health records in both groups.");
}
function selectMood(n){selectedMood=n;document.querySelectorAll("[data-mood]").forEach(function(b){b.setAttribute("aria-pressed",String(Number(b.dataset.mood)===n));});$("save-mood").disabled=!selectedMood;}
function setEnergyText(){$("energy-label").textContent=$("energy").value+" · "+ENERGY_NAMES[Number($("energy").value)];}
function handleMoodSave(){
 if(!selectedMood)return;
 state.moods.push({id:newId(),ts:new Date().toISOString(),score:selectedMood,energy:Number($("energy").value),tags:Array.from(selectedTags),note:$("mood-note").value.trim().slice(0,400)});
 if(!persist())return;selectMood(0);selectedTags.clear();document.querySelectorAll("[data-tag]").forEach(function(b){b.classList.remove("selected");b.setAttribute("aria-pressed","false");});$("mood-note").value="";$("energy").value="3";setEnergyText();render();toast("Check-in saved. Thanks for checking in.");
}
function normalizeHealth(h,source){
 if(!h||typeof h!=="object")return null;
 var date=String(h.date||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||dateKey(date+"T12:00:00")!==date)return null;
 var item={date:date,source:source||h.source||"manual"};if(h.demo)item.demo=true;
 [["sleepHours",0,24],["steps",0,100000],["hrv",0,500],["restingHR",20,250],["workoutMin",0,1440]].forEach(function(t){if(h[t[0]]!==undefined&&h[t[0]]!==null&&h[t[0]]!==""){var n=number(h[t[0]]);if(Number.isFinite(n)&&n>=t[1]&&n<=t[2])item[t[0]]=n;}});
 return Object.keys(item).some(function(k){return ["sleepHours","steps","hrv","restingHR","workoutMin"].includes(k);})?item:null;
}
function upsertHealth(h){var idx=state.health.findIndex(function(x){return x.date===h.date;});if(idx<0)state.health.push(h);else{var merged=Object.assign({},state.health[idx],h);if(!h.demo)delete merged.demo;state.health[idx]=merged;}}
function normalizeEvent(e,source){
 if(!e||typeof e!=="object")return null;
 var st=new Date(e.start),en=new Date(e.end);
 if(!Number.isFinite(st.getTime())||!Number.isFinite(en.getTime())||en<=st||en-st>86400000*2)return null;
 var title=String(e.title||"Calendar event").trim().slice(0,100);var cat=CATEGORIES.includes(e.category)?e.category:"Other";
 var id=String(e.id||("event:"+st.toISOString()+"|"+en.toISOString()+"|"+title)).slice(0,220);
 return {id:id,start:st.toISOString(),end:en.toISOString(),title:title,category:cat,source:source||e.source||"manual",demo:!!e.demo};
}
function upsertEvent(e){var idx=state.events.findIndex(function(x){return x.id===e.id||x.start===e.start&&x.end===e.end&&x.title===e.title;});if(idx<0)state.events.push(e);else{var merged=Object.assign({},state.events[idx],e);if(!e.demo)delete merged.demo;state.events[idx]=merged;}}
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
function exportBackup(){
 var data={app:"Rage Tracker",version:VERSION,account:state.syncOwnerEmail||null,exportedAt:new Date().toISOString(),moods:state.moods,health:state.health,events:state.events};
 var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="rage-tracker-backup-"+dateKey(now())+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},2000);
 toast("Backup downloaded. Store it securely; it is not encrypted.");
}
async function restoreBackup(file){
 if(!file||file.size>7e6){toast("Select a backup under 7 MB.");return;}
 try{var data=JSON.parse(await file.text());if(data.app!=="Rage Tracker"||!Array.isArray(data.moods)||!Array.isArray(data.health)||!Array.isArray(data.events))throw Error("Not a backup");
 if(data.account&&state.syncOwnerEmail&&data.account!==state.syncOwnerEmail)throw Error("This backup belongs to another account");
 if(!confirm("Replace locally saved mood, health and calendar data with this backup? Your sync pairing will remain."))return;
 state.moods=data.moods.slice(-6000).filter(function(x){return Number.isInteger(x.score)&&x.score>=1&&x.score<=5&&!isNaN(new Date(x.ts).getTime());}).map(function(x){return {id:String(x.id||newId()),ts:new Date(x.ts).toISOString(),score:x.score,energy:Number(x.energy)||3,tags:Array.isArray(x.tags)?x.tags.filter(function(y){return ACTIVITY_LABELS.includes(y);}).slice(0,10):[],note:String(x.note||"").slice(0,400),demo:!!x.demo};});
 state.health=[];data.health.slice(-1200).forEach(function(x){var h=normalizeHealth(x,x.source);if(h)upsertHealth(h);});
 state.events=[];data.events.slice(-2000).forEach(function(x){var e=normalizeEvent(x,x.source);if(e)upsertEvent(e);});
 persist();render();toast("Backup restored.");
 }catch(e){toast("This file is not a valid Rage Tracker backup.");}
}
function buildDemoCalendarScenario(base){
 var result={moods:[],events:[],health:[]};
 function localAt(day,hour,minute){var d=new Date(day);d.setHours(hour,minute,0,0);return d.toISOString();}
 function checkin(day,index,slot,hour,minute,mood,tags){
  result.moods.push({id:"demo:v2:"+index+":"+slot,ts:localAt(day,hour,minute),score:mood,energy:mood,tags:tags,note:"",demo:true});
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
 var scenario=buildDemoCalendarScenario(new Date());
 state.moods=state.moods.filter(function(m){return !m.demo;}).concat(scenario.moods);
 state.events=state.events.filter(function(e){return !e.demo;});
 state.health=state.health.filter(function(h){return !h.demo;});
 scenario.health.forEach(function(h){if(!state.health.some(function(existing){return existing.date===h.date;}))upsertHealth(h);});
 scenario.events.forEach(upsertEvent);
 insightScope="demo";
 if(!persist())return;
 navigate("insights");
 toast("28 fictional days loaded. Compare mood before and after calendar events.");
}
function clearDemo(){
 var a=state.moods.length,b=state.events.length,c=state.health.length;
 insightScope="personal";
 state.moods=state.moods.filter(function(x){return !x.demo;});state.events=state.events.filter(function(x){return !x.demo;});state.health=state.health.filter(function(x){return !x.demo;});
 persist();render();toast("Removed "+(a-state.moods.length+b-state.events.length+c-state.health.length)+" demo records.");
}
function arrayToHex(bytes){return Array.from(bytes).map(function(b){return b.toString(16).padStart(2,"0");}).join("");}
function loginWithEmail(){window.location.assign("/api/auth/start");}
function syncErrorLabel(code){
 var reasons={
  invalid_body:"Rage Tracker couldn’t read the last upload.",
  invalid_kind:"Rage Tracker couldn’t read the last upload.",
  no_valid_records:"Some data in the last upload wasn’t valid."
 };
 return reasons[code]||"The last upload didn’t go through.";
}
async function loadCalendars(){
 var card=$("calendar-card"),list=$("calendar-list");
 card.hidden=!state.token;
 if(!state.token||!navigator.onLine)return;
 try{
  var r=await fetch("/api/calendars",{headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
  if(!r.ok)throw Error("Calendars unavailable");
  var calendars=(await r.json()).calendars||[];
  list.textContent="";
  if(!calendars.length){var empty=document.createElement("p");empty.className="muted";empty.textContent="Calendars appear here after they sync an event.";list.appendChild(empty);return;}
  calendars.forEach(function(calendar){
   var row=document.createElement("label"),name=document.createElement("span"),box=document.createElement("input");
   row.className="calendar-row";name.textContent=calendar.name;box.type="checkbox";box.setAttribute("role","switch");box.checked=calendar.enabled;
   box.addEventListener("change",function(){setCalendar(calendar.name,box);});
   row.appendChild(name);row.appendChild(box);list.appendChild(row);
  });
 }catch(e){list.textContent="";var failed=document.createElement("p");failed.className="muted";failed.textContent="Couldn’t load your calendars.";list.appendChild(failed);}
}
async function setCalendar(name,box){
 var enabled=box.checked;box.disabled=true;
 try{
  var r=await fetch("/api/calendars",{method:"POST",headers:{"Authorization":"Bearer "+state.token,"Content-Type":"application/json"},body:JSON.stringify({name:name,enabled:enabled}),cache:"no-store"});
  if(!r.ok)throw Error("Calendar not updated");
  toast(name+(enabled?" is on.":" is off."));pull(true);
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
async function loadShortcutRelease(){
 if(!state.token||!state.deviceId||!navigator.onLine)return;
 try{
  var r=await fetch("/api/shortcut/release",{headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
  if(!r.ok)throw Error("Release unavailable");
  var result=await r.json(),release=result.release||{};
  var url=new URL(release.url);
  if(url.origin!=="https://www.icloud.com"||!/^\/shortcuts\/[a-f0-9]{32}$/i.test(url.pathname)||
     !/^\d+\.\d+\.\d+$/.test(release.version))throw Error("Invalid Shortcut release");
  shortcutRelease={url:url.href,version:release.version,verified:release.verified===true};
 }catch(e){shortcutRelease=null;}
 renderSync();
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
   shortcutStatus=null;shortcutRelease=null;
   state.token="";state.deviceId="";state.lastSync=null;persist();
   throw Error("This device key is no longer valid. Sign in and generate a new one.");
  }
  if(!r.ok||!data.credentialValid)throw Error(data.error||"Couldn’t check your device key.");
  if(data.deviceId!==state.deviceId)throw Error("The server returned a different device.");
  shortcutStatus=data;
  if(!silent){
   if(data.lastErrorCode)renderSyncDiagnostic(syncErrorLabel(data.lastErrorCode)+" Run Rage Tracker Sync again.","error");
   else if(data.lastDataUploadAt)renderSyncDiagnostic("Connected. Last upload "+formatDate(data.lastDataUploadAt)+" at "+formatTime(data.lastDataUploadAt)+". Tap Sync now to bring it in.","success");
   else renderSyncDiagnostic("Connected, but no data has arrived yet. Run Rage Tracker Sync.","error");
  }
 }catch(err){
  if(!silent)renderSyncDiagnostic(err.message||"Couldn’t check the connection. Try again.","error");
 }finally{
  shortcutStatusLoading=false;button.disabled=false;button.textContent="Test connection";renderSync();
 }
}
async function refreshAuth(){
 if(authChecking||!navigator.onLine)return;
 authChecking=true;
 try{
  var r=await fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"}});
  if(!r.ok||r.redirected||!(r.headers.get("content-type")||"").includes("application/json"))throw Error("No active login");
  var data=await r.json();if(!data.ok||!data.email)throw Error("Identity unavailable");
  authEmail=String(data.email).toLowerCase();authDevices=Array.isArray(data.devices)?data.devices:[];authCanRelease=data.canRelease===true;
 }catch(e){authEmail="";authDevices=[];authCanRelease=false;}
 finally{authChecking=false;renderSync();}
}
function accountSafe(email){
 if(state.syncOwnerEmail&&state.syncOwnerEmail!==email){
  toast("This device belongs to "+state.syncOwnerEmail+". Back up your data and erase local records before switching.");
  return false;
 }
 if(!state.syncOwnerEmail){
  var personal=state.moods.some(function(m){return !m.demo;})||state.health.some(function(h){return !h.demo;})||state.events.some(function(e){return !e.demo;});
  if(personal&&!confirm("This phone already has local mood, health or calendar records. Associate those local records with "+email+"? Cancel if they belong to somebody else."))return false;
 }
 return true;
}
async function issueDevice(){
 if(!authEmail){toast("Sign in with email first.");return;}
 if(!accountSafe(authEmail))return;
 var button=$("issue-device");button.disabled=true;button.textContent="Generating key…";
 try{
  var r=await fetch("/api/auth/device",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({label:$("device-label").value.trim()||"My iPhone"}),cache:"no-store"});
  var result=await r.json();if(!r.ok||!result.token)throw Error(result.error||"Could not create a device key");
  if(result.email!==authEmail)throw Error("Account identity changed; key not saved");
  state.syncOwnerEmail=authEmail;state.deviceId=result.deviceId;state.token=result.token;state.pairedAt=Date.now();state.lastSync=null;
  if(!persist())return;
  await refreshAuth();await loadShortcutRelease();await loadCalendars();await checkShortcutUpload(true);render();toast("Device key created for "+authEmail+". Copy it into Shortcuts.");
 }catch(e){toast(e.message||"Could not connect this device.");}
 finally{button.disabled=false;button.textContent="Generate my device key";}
}
async function revokeDevice(id){
 if(!authEmail){toast("Sign in with email to revoke a device.");return;}
 if(!confirm("Revoke this device's sync key? Any Shortcut using the key will stop working."))return;
 try{
  var r=await fetch("/api/auth/revoke",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId:id}),cache:"no-store"});
  var result=await r.json();if(!r.ok||!result.revoked)throw Error(result.error||"Device not revoked");
  if(id===state.deviceId){state.token="";state.deviceId="";state.lastSync=null;shortcutStatus=null;shortcutRelease=null;persist();}
  await refreshAuth();render();toast("Device key revoked. Personal records remain on this iPhone.");
 }catch(e){toast(e.message||"Could not revoke the device.");}
}
var shortcutRunPending=false;
function runShortcut(){shortcutRunPending=true;window.location.href="shortcuts://run-shortcut?name=Rage%20Tracker%20Sync&input=text&text="+encodeURIComponent("Bearer "+state.token);}
function syncNow(){
 if(state.token&&confirm("Run Rage Tracker Sync first to send today’s data?"))runShortcut();
 else pull(false);
}
async function pull(silent){
 if(!state.token){if(!silent)toast("Sign in and generate a device key first.");return;}
 var button=$("pull-button");button.disabled=true;button.textContent="Syncing…";
 try{
  var r=await fetch("/api/pull",{headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
  var body=await r.json();
  if(r.status===401){state.token="";state.deviceId="";shortcutStatus=null;shortcutRelease=null;persist();render();throw Error("Device key expired or revoked. Sign in to reconnect.");}
  if(!r.ok)throw Error(body.error||"Sync failed");
  if(!body.email||body.email!==state.syncOwnerEmail)throw Error("Account mismatch. Nothing was imported.");
  var serverHealth=body.health||[];if(serverHealth.length<600)state.health=state.health.filter(function(x){return x.source!=="shortcut";});
  var h=0,e=0;serverHealth.forEach(function(x){var v=normalizeHealth(x,"shortcut");if(v){upsertHealth(v);h++;}});
  (body.events||[]).forEach(function(x){var v=normalizeEvent(x,"shortcut");if(v){upsertEvent(v);e++;}});
  var serverEvents=body.events||[],serverIds={},oldest=null;
  serverEvents.forEach(function(x){serverIds[x.id]=true;if(!oldest||x.start<oldest)oldest=x.start;});
  var complete=serverEvents.length<1200;state.events=state.events.filter(function(x){return x.source!=="shortcut"||serverIds[x.id]||(!complete&&x.start<oldest);});
  state.lastSync=Date.now();persist();render();if(!silent)toast("Synced "+h+" health days and "+e+" calendar events for "+state.syncOwnerEmail+".");
  checkShortcutUpload(true);
 }catch(e){if(!silent)toast(e.message||"Sync unavailable. Local data is unchanged.");}
 finally{button.disabled=false;button.textContent="↻ Sync now";}
}

function copy(value){if(!value){toast("Generate a private device key first.");return;}
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(function(){toast("Copied to clipboard.");}).catch(function(){fallbackCopy(value);});else fallbackCopy(value);
}
function fallbackCopy(value){var a=document.createElement("textarea");a.value=value;document.body.appendChild(a);a.select();try{document.execCommand("copy");toast("Copied to clipboard.");}catch(e){toast("Clipboard access unavailable.");}a.remove();}
async function eraseRemote(){
 if(!state.token){toast("Connect this device first.");return;}
 if(!confirm("Permanently delete Health and Calendar sync records for "+state.syncOwnerEmail+" only? Local records on this iPhone will remain."))return;
 try{var r=await fetch("/api/erase",{method:"POST",headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});if(!r.ok)throw Error("Delete failed");toast("Synced data erased.");}catch(e){toast("Could not delete cloud data.");}
}
function init(){
 $("health-date").value=dateKey(now());var start=new Date();start.setMinutes(0,0,0);start.setHours(start.getHours()+1);var end=new Date(start);end.setHours(end.getHours()+1);$("cal-start").value=localDateTime(start);$("cal-end").value=localDateTime(end);
 document.querySelectorAll("[data-go]").forEach(function(b){b.addEventListener("click",function(ev){ev.preventDefault();navigate(b.dataset.go);if(b.dataset.go==="sync"){refreshAuth();loadShortcutRelease();loadCalendars();checkShortcutUpload(true);}});});
 document.querySelectorAll("[data-mood]").forEach(function(b){b.addEventListener("click",function(){selectMood(Number(b.dataset.mood));});});
 document.querySelectorAll("[data-tag]").forEach(function(b){b.setAttribute("aria-pressed","false");b.addEventListener("click",function(){var s=b.dataset.tag;selectedTags.has(s)?selectedTags.delete(s):selectedTags.add(s);b.classList.toggle("selected",selectedTags.has(s));b.setAttribute("aria-pressed",String(selectedTags.has(s)));});});
 $("energy").addEventListener("input",setEnergyText);$("save-mood").addEventListener("click",handleMoodSave);
 $("health-form").addEventListener("submit",handleHealthForm);$("calendar-form").addEventListener("submit",handleCalendarForm);
 $("health-import").addEventListener("change",function(ev){importHealth(ev.target.files[0]);ev.target.value="";});
 $("calendar-import").addEventListener("change",function(ev){importCalendar(ev.target.files[0]);ev.target.value="";});
 $("recent-list").addEventListener("click",function(ev){var b=ev.target.closest("[data-delete-mood]");if(b&&confirm("Delete this mood check-in?")){state.moods=state.moods.filter(function(x){return x.id!==b.dataset.deleteMood;});persist();render();}});
 $("context-list").addEventListener("click",function(ev){var b=ev.target.closest("[data-delete-health]");if(b&&confirm("Delete this health day?")){state.health=state.health.filter(function(x){return x.date!==b.dataset.deleteHealth;});persist();render();}
 b=ev.target.closest("[data-delete-event]");if(b&&confirm("Delete this event?")){state.events=state.events.filter(function(x){return x.id!==b.dataset.deleteEvent;});persist();render();}});
 document.querySelectorAll("[data-days]").forEach(function(b){b.addEventListener("click",function(){insightDays=Number(b.dataset.days);document.querySelectorAll("[data-days]").forEach(function(x){x.classList.toggle("selected",x===b);});renderInsights();});});
 document.querySelectorAll("[data-scope]").forEach(function(b){b.addEventListener("click",function(){insightScope=b.dataset.scope;renderInsights();});});
 $("login-button").addEventListener("click",loginWithEmail);
 $("issue-device").addEventListener("click",issueDevice);
 $("refresh-devices").addEventListener("click",refreshAuth);
 $("install-shortcut").addEventListener("click",function(e){if(!state.token||!shortcutRelease||!this.href){e.preventDefault();toast("Connect your device to open the current Shortcut.");}});
 $("check-shortcut-upload").addEventListener("click",function(){checkShortcutUpload(false);});
 $("device-list").addEventListener("click",function(e){var b=e.target.closest("[data-revoke-device]");if(b)revokeDevice(b.dataset.revokeDevice);});
 $("pull-button").addEventListener("click",syncNow);$("run-shortcut").addEventListener("click",function(event){event.preventDefault();runShortcut();});
 $("unpair-button").addEventListener("click",function(){if(state.deviceId)revokeDevice(state.deviceId);});
 document.querySelectorAll("[data-copy]").forEach(function(b){b.addEventListener("click",function(){
  if(b.dataset.copy==="token"&&authEmail&&authEmail!==state.syncOwnerEmail){
   toast("Sign in as the device owner before copying its key.");return;
  }
  copy(state.token?"Bearer "+state.token:"");
 });});
 $("erase-remote").addEventListener("click",eraseRemote);
 $("backup-button").addEventListener("click",exportBackup);$("restore-input").addEventListener("change",function(ev){restoreBackup(ev.target.files[0]);ev.target.value="";});
 $("erase-local").addEventListener("click",function(){if(confirm("Delete ALL local mood check-ins, notes, health/calendar data and this device's sync key? Cloud data must be erased separately. This cannot be undone.")){state=emptyState();shortcutRelease=null;shortcutStatus=null;persist();render();toast("Local records deleted.");}});
 $("demo-button").addEventListener("click",demo);$("clear-demo-button").addEventListener("click",clearDemo);
 setEnergyText();navigate(location.hash.slice(1)||"checkin");
 if(navigator.onLine)refreshAuth();
 if(state.token&&navigator.onLine){loadShortcutRelease();loadCalendars();checkShortcutUpload(true);pull(true);}
 window.addEventListener("online",function(){refreshAuth();if(state.token){loadShortcutRelease();loadCalendars();checkShortcutUpload(true);pull(true);}});
 document.addEventListener("visibilitychange",function(){if(!document.hidden){refreshAuth();if(state.token){loadShortcutRelease();loadCalendars();checkShortcutUpload(true);if(shortcutRunPending){shortcutRunPending=false;pull(false);}else if(!state.lastSync||Date.now()-state.lastSync>900000)pull(true);}}});
 if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){});});}
}
init();
})();