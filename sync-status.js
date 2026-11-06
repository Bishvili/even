// The Sync tab: what Health Sync is doing now, what it did recently, and what was turned off along the way.
// It reads the run from the account while the tab is open, and stops asking once the run is over.
(function(root){
 "use strict";
 var POLL_MS=1500,WAIT_MS=180000,LIVE_MS=5*60000;
 var HEALTH=[["sleep","Sleep","night","nights"],["steps","Steps","day","days"],["workout","Exercise minutes","day","days"],["restingHR","Resting heart rate","day","days"],["hrv","Heart rate variability","day","days"]];
 var run=null,runs=[],tappedAt=0,stopping=false,timer=null,wasLive=false;
 function $(id){return document.getElementById(id);}
 function app(){return root.App;}
 function data(){return root.App.data;}
 function plural(n,one,many){return n+" "+(n===1?one:many);}
 function time(at){return data().formatTime(at);}
 function when(at){
  var d=new Date(at),today=new Date(),yesterday=new Date(today.getTime()-86400000);
  var day=d.toDateString()===today.toDateString()?"Today":d.toDateString()===yesterday.toDateString()?"Yesterday":data().formatDate(at);
  return day+" at "+time(at);
 }
 function lastActivity(r){return Math.max.apply(null,[r.at,r.calendar,r.health,r.alarms].map(function(at){return Date.parse(at)||0;}));}
 function settings(){return app().syncChoices()||{};}
 // Waiting: the tap went to Shortcuts and the run hasn't said hello yet.
 function waiting(){return !!tappedAt&&Date.now()-tappedAt<WAIT_MS&&!(run&&Date.parse(run.at)>=tappedAt-5000);}
 function live(r){return !!r&&!r.done&&!r.cancelled&&Date.now()-lastActivity(r)<LIVE_MS;}
 function result(r){return r.result||(r.done?"finished":r.cancelled?"stopped":live(r)?"syncing":"incomplete");}
 function source(r){return r.launch==="automation"?"by an automation":r.launch==="app"?"from the app":"";}

 // Each step of a run, in the order Health Sync sends them. Only the step being worked on spins.
 function steps(r,isLive,pending){
  var on=settings(),counts=(r&&r.counts)||{},over=r&&!isLive;
  var ended=over?(r.cancelled?"Stopped":"Didn’t arrive"):"Waiting";
  var rows=[];
  rows.push({label:"Connected",status:r?"Done":"Waiting",done:!!r});
  var calendar=r&&r.calendar?{status:counts.events!=null?plural(counts.events,"event","events"):"Sent",done:true}:on.calendar===false?{status:"Off",muted:true,done:true}:r&&(r.health||r.alarms||r.done)?{status:"Not sent",muted:true,done:true}:{status:ended};
  rows.push(Object.assign({label:"Calendar"},calendar));
  var types=HEALTH.map(function(item){
   var kind=item[0],status,tone="";
   if(r&&r.stopped.indexOf(kind)>=0){status="None in Apple Health";tone="off";}
   else if(r?r.read.indexOf(kind)<0:on[kind]===false){status="Off";tone="muted";}
   else if(r&&r.health){var n=(counts.health||{})[kind];status=n?plural(n,item[2],item[3]):"Nothing new";tone=n?"done":"muted";}
   else status=ended;
   return {label:item[1],status:status,tone:tone};
  });
  var sentTypes=types.filter(function(t){return t.tone==="done";}).length;
  rows.push({label:"Apple Health",status:r&&r.health?(sentTypes?plural(sentTypes,"type","types"):"Sent"):ended,done:!!(r&&r.health),types:types});
  rows.push(Object.assign({label:"Alarms"},r&&r.alarms?{status:counts.alarms!=null?plural(counts.alarms,"alarm","alarms"):"Sent",done:true}:on.alarms===false?{status:"Off",muted:true,done:true}:{status:ended}));
  rows.push({label:"Finished",status:r&&r.done?time(r.done):ended,done:!!(r&&r.done)});
  if(isLive||pending){
   var active=rows.filter(function(row){return !row.done;})[0];
   if(active){active.active=true;active.status=active.label==="Connected"?"Starting":active.label==="Finished"?"Finishing":active.label==="Alarms"?"Sending":"Reading";}
  }
  return rows;
 }
 function stepList(rows){
  var list=document.createElement("ul");list.className="sync-steps";
  rows.forEach(function(row){
   var item=document.createElement("li"),name=document.createElement("span"),state=document.createElement("span");
   item.className="sync-step"+(row.active?" is-active":row.done&&!row.muted?" is-done":row.muted?" is-muted":"");
   name.className="sync-step-name";name.textContent=row.label;state.className="sync-step-state";
   if(row.active){var spin=document.createElement("span");spin.className="sync-spinner";spin.setAttribute("aria-hidden","true");state.appendChild(spin);}
   state.appendChild(document.createTextNode(row.status));
   item.appendChild(name);item.appendChild(state);
   if(row.types&&(row.done||!row.active)&&row.types.some(function(t){return t.status!=="Waiting";})){
    var sub=document.createElement("ul");sub.className="sync-types";
    row.types.forEach(function(t){
     var li=document.createElement("li"),n=document.createElement("span"),s=document.createElement("span");
     li.className="sync-type"+(t.tone?" is-"+t.tone:"");n.textContent=t.label;s.textContent=t.status;li.appendChild(n);li.appendChild(s);sub.appendChild(li);
    });
    item.appendChild(sub);
   }
   list.appendChild(item);
  });
  return list;
 }
 function render(){
  if(!$("view-sync"))return;
  var state=data().state(),connected=!!state.token,pending=waiting(),isLive=live(run),r=run,action=$("sync-action"),hint="";
  var title,note="",label="Sync now",kind="primary";
  if(!connected){title="Connect to sync";note="Sign in and connect this iPhone in Data.";label="Go to Data";}
  else if(pending){title="Waiting for {{sync}}";note="It opens in Shortcuts.";label="Stop";kind="secondary";
   if(Date.now()-tappedAt>15000)hint="If Shortcuts is asking something, answer it, then come back here.";}
  else if(isLive){title=r.attempt>1?"Syncing · try "+r.attempt:"Syncing";note="Started "+time(r.started)+(source(r)?" "+source(r):"")+".";label="Stop";kind="secondary";
   if(stopping)hint="Stops after the current step.";
   else if(r.attempt>1)hint="Apple Health had none of something, so {{sync}} turned it off and started again. Tap OK if Shortcuts asks.";
   else if(Date.now()-lastActivity(r)>40000)hint="Keep your iPhone unlocked. Health data can’t be read while it’s locked.";}
  else if(!r){title="Not synced yet";note="{{sync}} brings in sleep, activity, calendar and alarms.";}
  else if(r.done){var mins=Math.floor((Date.now()-Date.parse(r.done))/60000);title=mins<2?"Synced just now":mins<60?"Synced "+mins+" min ago":"Synced "+when(r.done).replace("Today at ","today at ");note=r.stopped.length?"Something Apple Health had none of was turned off.":"Everything arrived.";}
  else if(r.cancelled){title="Stopped";note="Stopped at "+time(r.cancelled)+". What arrived before then is saved.";label="Try again";}
  else{title="Didn’t finish";note="{{sync}} stopped before it sent everything.";label="Try again";hint="Keep your iPhone unlocked while it runs, and tap OK if Shortcuts asks anything.";}
  if(!navigator.onLine&&connected){hint="You’re offline. Syncing needs a connection.";}
  $("sync-state").textContent=title;$("sync-state-note").textContent=note;
  $("sync-hint").textContent=hint;$("sync-hint").hidden=!hint;
  action.textContent=label;action.className="btn full "+kind;action.dataset.mode=!connected?"connect":label==="Stop"?"stop":"run";
  var steps$=$("sync-steps"),fresh=stepList(steps(pending?null:r,isLive,pending));fresh.id="sync-steps";fresh.setAttribute("aria-label","Sync steps");
  steps$.replaceWith(fresh);fresh.hidden=!connected||(!r&&!pending);
  renderOff();renderHistory();
  // A run that just ended brings its data in.
  if(wasLive&&!isLive&&!pending&&r&&r.done)app().pullQuietly();
  wasLive=isLive||pending;
 }
 function renderOff(){
  var on=settings(),off=(app().healthStopped()||[]).filter(function(kind){return on[kind]===false;}),list=$("sync-off-list");
  $("sync-off-card").hidden=!off.length;list.textContent="";
  off.forEach(function(kind){
   var row=document.createElement("div"),name=document.createElement("span"),button=document.createElement("button");
   row.className="calendar-row";name.textContent=HEALTH.filter(function(item){return item[0]===kind;})[0][1];
   button.type="button";button.className="small-action";button.textContent="Try again";
   button.addEventListener("click",function(){
    if(!navigator.onLine){data().toast("You’re offline. Syncing needs a connection.");return;}
    app().enableSync(kind);start();app().runShortcut();
   });
   row.appendChild(name);row.appendChild(button);list.appendChild(row);
  });
 }
 var RESULTS={finished:"Finished",stopped:"Stopped",incomplete:"Didn’t finish",syncing:"Syncing"};
 function renderHistory(){
  var box=$("sync-history"),earlier=runs.slice();
  $("sync-history-card").hidden=!earlier.length;box.textContent="";
  earlier.forEach(function(r){
   var item=document.createElement("details"),summary=document.createElement("summary"),head=document.createElement("strong"),meta=document.createElement("small"),c=r.counts||{};
   item.className="sync-run";head.textContent=when(r.started);
   var bits=[RESULTS[result(r)]||"Didn’t finish"];if(source(r))bits.push(source(r)[0].toUpperCase()+source(r).slice(1));
   if(c.events!=null)bits.push(plural(c.events,"event","events"));
   var types=Object.keys(c.health||{}).filter(function(k){return c.health[k];}).length;if(types)bits.push(plural(types,"Health type","Health types"));
   meta.textContent=bits.join(" · ");summary.appendChild(head);summary.appendChild(meta);item.appendChild(summary);
   item.appendChild(stepList(steps(r,false,false)));box.appendChild(item);
  });
 }
 async function load(){
  var state=data().state();
  if(!state.token||!navigator.onLine)return;
  try{
   var r=await fetch("/api/sync/run",{headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
   if(r.ok){var body=await r.json();accept(body);}
  }catch(e){/* The next look tries again. */}
 }
 function accept(body){run=body.run||null;runs=body.runs||[];if(run&&!live(run))stopping=false;render();}
 function shown(){return document.visibilityState==="visible"&&$("view-sync")&&$("view-sync").classList.contains("active");}
 async function poll(){
  timer=null;
  if(!shown())return;
  await load();
  if(timer===null&&shown()&&(waiting()||live(run)))timer=setTimeout(poll,POLL_MS);
  else if(timer===null&&shown())timer=setTimeout(function(){timer=null;render();},30000);
 }
 function kick(){if(timer){clearTimeout(timer);timer=null;}poll();}
 // A sync starting from anywhere shows here.
 function start(){tappedAt=Date.now();stopping=false;app().navigate("sync");render();kick();}
 // Health Sync opened the app part way through a run it was already making.
 function watch(){app().navigate("sync");kick();}
 async function stop(){
  var state=data().state();
  if(waiting()&&!run){tappedAt=0;render();return;}
  if(!navigator.onLine){data().toast("You’re offline. Stopping needs a connection.");return;}
  stopping=true;tappedAt=0;render();
  try{
   var r=await fetch("/api/sync/run/stop",{method:"POST",headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
   if(!r.ok)throw Error();accept(await r.json());
  }catch(e){stopping=false;render();data().toast("Couldn’t stop the sync. Check your connection and try again.");}
 }
 function tap(){
  var mode=$("sync-action").dataset.mode;
  if(mode==="connect"){app().navigate("data");return;}
  if(mode==="stop"){stop();return;}
  if(!navigator.onLine){data().toast("You’re offline. Syncing needs a connection.");return;}
  app().runShortcut();
 }
 function init(){$("sync-action").addEventListener("click",tap);render();}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
 document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")kick();});
 root.addEventListener("online",render);root.addEventListener("offline",render);
 root.SyncStatus={start:start,watch:watch,shown:kick,render:render,accept:accept,steps:steps};
})(globalThis);
