(function () {
"use strict";
var VERSION = "1.0.1";
var STORAGE_KEY = "rage-tracker:v1";
var MOOD_NAMES = ["","Rough","Low","Okay","Good","Great"];
var MOOD_EMOJI = ["","😣","😕","😐","🙂","😄"];
var ENERGY_NAMES = ["","Very low","Low","Medium","High","Very high"];
var CATEGORIES = ["Meeting","Work","Exercise","Social","Family","Rest","Commute","Other"];
var ACTIVITY_LABELS = ["Work","Meeting","Exercise","Social","Family","Rest","Outdoors","Commute","Food"];
var selectedMood = 0, selectedTags = new Set(), insightDays = 30, toastTimer = null;
var state = readState();
function $(id){ return document.getElementById(id); }
function emptyState(){ return {moods:[],health:[],events:[],token:"",pairedAt:null,lastSync:null}; }
function readState(){
 try { var raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null"); if(!raw || typeof raw!=="object")return emptyState();
 return {moods:Array.isArray(raw.moods)?raw.moods.slice(-6000):[],health:Array.isArray(raw.health)?raw.health.slice(-1200):[],events:Array.isArray(raw.events)?raw.events.slice(-2000):[],token:typeof raw.token==="string"?raw.token:"",pairedAt:raw.pairedAt||null,lastSync:raw.lastSync||null};
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
 var today=dateKey(now()), counts=getRecent(7), days=new Set(state.moods.map(function(m){return dateKey(m.ts);}));
 $("stat-today").textContent=state.moods.filter(function(m){return dateKey(m.ts)===today;}).length;
 $("stat-average").textContent=score(average(counts.map(function(m){return m.score;})));
 var d=new Date();d.setHours(12,0,0,0);
 if(!days.has(dateKey(d)))d.setDate(d.getDate()-1);
 var streak=0;while(days.has(dateKey(d))&&streak<3650){streak++;d.setDate(d.getDate()-1);}
 $("stat-streak").textContent=streak;
}
function renderRecent(){
 var moods=state.moods.slice().sort(function(a,b){return new Date(b.ts)-new Date(a.ts);});
 $("entries-count").textContent=state.moods.length+" entries";
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
 if(x.kind==="health"){var h=x.h, summary=[h.sleepHours!=null?h.sleepHours+"h sleep":"",h.steps!=null?h.steps.toLocaleString()+" steps":"",h.hrv!=null?h.hrv+"ms HRV":""].filter(Boolean).join(" · ");
 return '<div class="entry"><span class="entry-emoji">♥</span><div class="entry-main"><strong>Health · '+esc(h.date)+'</strong><small>'+esc(summary||"Health day")+(h.demo?" · DEMO":"")+'</small></div><button class="entry-delete" aria-label="Delete health day" data-delete-health="'+esc(h.date)+'">×</button></div>';}
 var e=x.e;
 return '<div class="entry"><span class="entry-emoji">▦</span><div class="entry-main"><strong>'+esc(e.title||"Calendar event")+'</strong><small>'+esc(formatDate(e.start)+" "+formatTime(e.start)+" · "+e.category+(e.demo?" · DEMO":""))+'</small></div><button class="entry-delete" aria-label="Delete calendar event" data-delete-event="'+esc(e.id)+'">×</button></div>';
 }).join(""):blank("No context yet. Add a health day, calendar event, or connect Shortcuts.");
}
function renderSync(){
 var paired=!!state.token;
 $("pair-form-wrap").hidden=paired;$("pair-connected").hidden=!paired;
 $("pair-status").textContent=paired?"Paired to this iPhone":"Not connected";
 $("pair-badge").textContent=paired?"ON":"OFF";$("pair-badge").classList.toggle("on",paired);
 $("sync-light").classList.toggle("connected",paired);$("sync-light-text").textContent=paired?"Sync ready":"Local only";
 $("sync-url").textContent=location.origin+"/api/ingest";
 $("sync-token").textContent=paired?"Bearer "+("•".repeat(16))+"…"+state.token.slice(-6):"Pair your device first";
 $("last-sync").textContent=state.lastSync?"Last fetched "+formatDate(state.lastSync)+" at "+formatTime(state.lastSync):"No Shortcuts data fetched yet";
}
function renderSettings(){
 $("storage-summary").textContent=state.moods.length+" mood check-ins · "+state.health.length+" health days · "+state.events.length+" calendar events";
 $("version").textContent=VERSION;
}
function renderInsights(){
 var moods=getRecent(insightDays).sort(function(a,b){return new Date(a.ts)-new Date(b.ts);});
 $("insight-average").textContent=score(average(moods.map(function(m){return m.score;})))+"/5";
 var demo=moods.some(function(m){return m.demo;});
 $("insight-samples").textContent=moods.length+" check-ins over "+insightDays+" days"+(demo?" · INCLUDES DEMO DATA":"");
 drawTrend(moods);drawTimes(moods);drawActivity(moods);drawCalendar(moods);drawHealth(moods);
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
function hasEvent(m,cat){
 var t=new Date(m.ts).getTime();
 return state.events.some(function(e){var st=new Date(e.start).getTime(),en=new Date(e.end).getTime();return e.category===cat && Number.isFinite(st)&&Number.isFinite(en)&&t>=st&&t<=en+3600000;});
}
function drawCalendar(moods){
 var rows=[];
 CATEGORIES.forEach(function(cat){var yes=[],no=[];moods.forEach(function(m){(hasEvent(m,cat)?yes:no).push(m.score);});if(yes.length>=3&&no.length>=3)rows.push({cat:cat,yes:yes,no:no,d:average(yes)-average(no)});});
 rows.sort(function(a,b){return Math.abs(b.d)-Math.abs(a.d);});
 $("calendar-insights").innerHTML=rows.length?rows.map(function(r){return diffHtml(r.cat+" events",r.yes,r.no);}).join(""):blank("Add Calendar events and check in during or within an hour afterward to compare context.");
}
function drawHealth(moods){
 var d={};moods.forEach(function(m){(d[dateKey(m.ts)]||(d[dateKey(m.ts)]=[])).push(m.score);});
 var joined=state.health.filter(function(h){return d[h.date]&&d[h.date].length;}).map(function(h){return {h:h,mood:average(d[h.date])};});
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
function parseICSDate(v){
 var s=String(v||"").trim(),m=s.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/);
 if(!m)return null;
 var Y=+m[1],M=+m[2]-1,D=+m[3],h=+(m[4]||0),mi=+(m[5]||0),sec=+(m[6]||0);
 return m[7]?new Date(Date.UTC(Y,M,D,h,mi,sec)).toISOString():new Date(Y,M,D,h,mi,sec).toISOString();
}
function parseICS(text){
 var lines=text.replace(/\r\n/g,"\n").replace(/\n[ \t]/g,"").split("\n");var events=[],cur=null;
 lines.forEach(function(line){line=line.replace(/\r$/,"");if(line==="BEGIN:VEVENT"){cur={};return;}if(line==="END:VEVENT"){if(cur)events.push(cur);cur=null;return;}if(!cur)return;var idx=line.indexOf(":");if(idx<0)return;
 var name=line.slice(0,idx).split(";")[0].toUpperCase(),value=line.slice(idx+1);
 if(name==="DTSTART")cur.start=parseICSDate(value);else if(name==="DTEND")cur.end=parseICSDate(value);else if(name==="SUMMARY")cur.title=value.replace(/\\n/gi," ").replace(/\\,/g,",").replace(/\\\\/g,"\\");else if(name==="UID")cur.id=value;
 });
 return events.slice(0,2500).map(function(x){x.category="Other";return x;});
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
 var data={app:"Rage Tracker",version:VERSION,exportedAt:new Date().toISOString(),moods:state.moods,health:state.health,events:state.events};
 var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="rage-tracker-backup-"+dateKey(now())+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},2000);
 toast("Backup downloaded. Store it securely; it is not encrypted.");
}
async function restoreBackup(file){
 if(!file||file.size>7e6){toast("Select a backup under 7 MB.");return;}
 try{var data=JSON.parse(await file.text());if(data.app!=="Rage Tracker"||!Array.isArray(data.moods)||!Array.isArray(data.health)||!Array.isArray(data.events))throw Error("Not a backup");
 if(!confirm("Replace locally saved mood, health and calendar data with this backup? Your sync pairing will remain."))return;
 state.moods=data.moods.slice(-6000).filter(function(x){return Number.isInteger(x.score)&&x.score>=1&&x.score<=5&&!isNaN(new Date(x.ts).getTime());}).map(function(x){return {id:String(x.id||newId()),ts:new Date(x.ts).toISOString(),score:x.score,energy:Number(x.energy)||3,tags:Array.isArray(x.tags)?x.tags.filter(function(y){return ACTIVITY_LABELS.includes(y);}).slice(0,10):[],note:String(x.note||"").slice(0,400),demo:!!x.demo};});
 state.health=[];data.health.slice(-1200).forEach(function(x){var h=normalizeHealth(x,x.source);if(h)upsertHealth(h);});
 state.events=[];data.events.slice(-2000).forEach(function(x){var e=normalizeEvent(x,x.source);if(e)upsertEvent(e);});
 persist();render();toast("Backup restored.");
 }catch(e){toast("This file is not a valid Rage Tracker backup.");}
}
function demo(){
 if(state.moods.some(function(x){return x.demo;})){toast("Demo data is already loaded.");return;}
 var base=new Date();base.setHours(0,0,0,0);
 for(var i=24;i>=0;i--){
 var d=new Date(base);d.setDate(d.getDate()-i);
 var sleep=i%5===0?5.8:i%3===0?6.5:7.7,steps=i%4===0?3400:7900,workout=i%4===0?0:35,scoreDay=sleep<7?2:4;
 if(!state.health.some(function(h){return h.date===dateKey(d);}))upsertHealth({date:dateKey(d),sleepHours:sleep,steps:steps,hrv:37+(i%6)*4,workoutMin:workout,demo:true,source:"demo"});
 [10,17].forEach(function(hour,j){var at=new Date(d);at.setHours(hour,30,0,0);var m=Math.max(1,Math.min(5,scoreDay+(j===1&&i%3===0?1:0)));
 var tags=i%4===0?["Work","Meeting"]:i%3===0?["Family","Rest"]:["Exercise","Outdoors"];
 state.moods.push({id:"demo:"+i+":"+hour,ts:at.toISOString(),score:m,energy:m,tags:tags,note:"",demo:true});});
 if(i%4===0){var st=new Date(d);st.setHours(9,0,0,0);var en=new Date(st);en.setHours(11,0,0,0);upsertEvent({id:"demo:event:"+i,start:st.toISOString(),end:en.toISOString(),title:"Example meeting",category:"Meeting",source:"demo",demo:true});}
 }
 persist();render();toast("Fictional demo data added. Remove it in Settings.");
}
function clearDemo(){
 var a=state.moods.length,b=state.events.length,c=state.health.length;
 state.moods=state.moods.filter(function(x){return !x.demo;});state.events=state.events.filter(function(x){return !x.demo;});state.health=state.health.filter(function(x){return !x.demo;});
 persist();render();toast("Removed "+(a-state.moods.length+b-state.events.length+c-state.health.length)+" demo records.");
}
function arrayToHex(bytes){return Array.from(bytes).map(function(b){return b.toString(16).padStart(2,"0");}).join("");}
async function pair(){
 var code=$("pair-code").value.trim();if(!code){toast("Enter the private pairing code.");return;}
 var btn=$("pair-button");btn.disabled=true;btn.textContent="Pairing…";
 try{
 var key=arrayToHex(crypto.getRandomValues(new Uint8Array(32)));
 var r=await fetch("/api/pair",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pairCode:code,token:key}),cache:"no-store"});
 var body=await r.json();if(!r.ok)throw Error(body.error||"Pairing failed");
 state.token=key;state.pairedAt=Date.now();persist();$("pair-code").value="";render();toast("This iPhone is paired. Set up the Shortcut next.");await pull(true);
 }catch(e){toast(e.message||"Could not pair. Check your code and connection.");}
 finally{btn.disabled=false;btn.textContent="Pair this iPhone";}
}
async function pull(silent){
 if(!state.token){if(!silent)toast("Pair this device first.");return;}
 var btn=$("pull-button");btn.disabled=true;btn.textContent="Syncing…";
 try{
 var r=await fetch("/api/pull",{headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
 var body=await r.json();if(!r.ok)throw Error(body.error||"Sync failed");
 var h=0,e=0;(body.health||[]).forEach(function(x){var v=normalizeHealth(x,"shortcut");if(v){upsertHealth(v);h++;}});
 (body.events||[]).forEach(function(x){var v=normalizeEvent(x,"shortcut");if(v){upsertEvent(v);e++;}});
 state.lastSync=Date.now();persist();render();if(!silent)toast("Synced "+h+" health days and "+e+" calendar events.");
 }catch(ex){if(!silent)toast(ex.message||"Sync unavailable. Your local data is safe.");}
 finally{btn.disabled=false;btn.textContent="↻ Sync now";}
}
function copy(value){if(!value){toast("Pair your device first.");return;}
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(function(){toast("Copied to clipboard.");}).catch(function(){fallbackCopy(value);});else fallbackCopy(value);
}
function fallbackCopy(value){var a=document.createElement("textarea");a.value=value;document.body.appendChild(a);a.select();try{document.execCommand("copy");toast("Copied to clipboard.");}catch(e){toast("Clipboard access unavailable.");}a.remove();}
async function eraseRemote(){
 if(!state.token){toast("Pair this device first.");return;}
 if(!confirm("Permanently delete all synchronized Health and Calendar data from Cloudflare? This does not erase local copies."))return;
 try{var r=await fetch("/api/erase",{method:"POST",headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});if(!r.ok)throw Error("Delete failed");toast("Cloudflare-synced data deleted.");}catch(e){toast("Could not delete cloud data.");}
}
function init(){
 $("health-date").value=dateKey(now());var start=new Date();start.setMinutes(0,0,0);start.setHours(start.getHours()+1);var end=new Date(start);end.setHours(end.getHours()+1);$("cal-start").value=localDateTime(start);$("cal-end").value=localDateTime(end);
 document.querySelectorAll("[data-go]").forEach(function(b){b.addEventListener("click",function(ev){ev.preventDefault();navigate(b.dataset.go);});});
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
 $("pair-button").addEventListener("click",pair);$("pair-code").addEventListener("keydown",function(e){if(e.key==="Enter")pair();});
 $("pull-button").addEventListener("click",function(){pull(false);});
 $("unpair-button").addEventListener("click",function(){if(confirm("Forget this device's pairing key? Existing cloud data remains, and you will need the private pairing code to reconnect.")){state.token="";state.lastSync=null;persist();render();toast("Pairing key forgotten.");}});
 document.querySelectorAll("[data-copy]").forEach(function(b){b.addEventListener("click",function(){copy(b.dataset.copy==="url"?location.origin+"/api/ingest":state.token?"Bearer "+state.token:"");});});
 $("erase-remote").addEventListener("click",eraseRemote);
 $("backup-button").addEventListener("click",exportBackup);$("restore-input").addEventListener("change",function(ev){restoreBackup(ev.target.files[0]);ev.target.value="";});
 $("erase-local").addEventListener("click",function(){if(confirm("Delete ALL local mood check-ins, notes, health/calendar data and this device's sync key? Cloud data must be erased separately. This cannot be undone.")){state=emptyState();persist();render();toast("Local records deleted.");}});
 $("demo-button").addEventListener("click",demo);$("clear-demo-button").addEventListener("click",clearDemo);
 setEnergyText();navigate(location.hash.slice(1)||"checkin");
 if(state.token&&navigator.onLine)pull(true);
 window.addEventListener("online",function(){if(state.token)pull(true);});
 document.addEventListener("visibilitychange",function(){if(!document.hidden&&state.token&&(!state.lastSync||Date.now()-state.lastSync>900000))pull(true);});
 if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){});});}
}
init();
})();