// The sync sheet: what the latest Health Sync run has done, read from the account while the sheet is open.
(function(root){
 var POLL_MS=1500,GIVE_UP_MS=180000,since=0,timer=null,stopAt=0;
 var HEALTH=[["steps","Steps"],["restingHR","Resting heart rate"],["hrv","Heart rate variability"],["workout","Exercise minutes"],["sleep","Sleep"]];
 function $(id){return document.getElementById(id);}
 function app(){return root.App.data;}
 function row(label,status,tone){
  var item=document.createElement("li"),name=document.createElement("span"),state=document.createElement("span");
  item.className="sync-step"+(tone?" is-"+tone:"");name.textContent=label;state.className="sync-step-state";state.textContent=status;
  item.appendChild(name);item.appendChild(state);return item;
 }
 // Only a run that started after the tap belongs to this sync.
 function current(run){return run&&Date.parse(run.at)>=since-5000?run:null;}
 function render(run){
  run=current(run);
  var list=$("sync-steps");list.textContent="";
  var started=!!run,done=!!(run&&run.done),title=!started?"Waiting for {{sync}}":done?"Sync finished":run.attempt>1?"Trying again":"Syncing";
  $("sync-progress-title").textContent=title;
  list.appendChild(row("Connected",started?"Done":"Waiting",started?"done":""));
  HEALTH.forEach(function(item){
   var kind=item[0],status="Waiting",tone="";
   if(run&&run.stopped.indexOf(kind)>=0){status="None in Apple Health";tone="off";}
   else if(run&&run.read.indexOf(kind)<0){status="Off";tone="muted";}
   else if(run&&run.health){status="Sent";tone="done";}
   else if(run){status="Reading";tone="active";}
   list.appendChild(row(item[1],status,tone));
  });
  [["calendar","Calendar"],["alarms","Alarms"]].forEach(function(item){
   var sent=run&&run[item[0]];
   list.appendChild(row(item[1],sent?"Sent":done?"Off":run&&run.health?"Sending":"Waiting",sent?"done":done?"muted":""));
  });
  $("sync-progress-note").hidden=!(run&&run.stopped.length)||done;
  if(done)stop();
 }
 async function poll(){
  timer=null;
  var state=app().state();
  if(!state.token||!$("sync-progress").open||document.visibilityState!=="visible")return;
  try{
   var r=await fetch("/api/sync/run",{headers:{"Authorization":"Bearer "+state.token},cache:"no-store"});
   if(r.ok)render((await r.json()).run);
  }catch(e){/* The next poll tries again. */}
  if(timer===null&&Date.now()<stopAt&&$("sync-progress").open&&!$("sync-progress").hasAttribute("data-done"))timer=setTimeout(poll,POLL_MS);
 }
 function stop(){$("sync-progress").setAttribute("data-done","");if(timer){clearTimeout(timer);timer=null;}}
 // Shown when a run starts, so it's there on the way back to the app.
 function start(){
  since=Date.now();stopAt=since+GIVE_UP_MS;
  $("sync-progress").removeAttribute("data-done");render(null);
  if(!$("sync-progress").open)$("sync-progress").showModal();
 }
 function resume(){if($("sync-progress").open&&!$("sync-progress").hasAttribute("data-done")){stopAt=Math.max(stopAt,Date.now()+60000);if(timer===null)poll();}}
 document.addEventListener("DOMContentLoaded",function(){
  $("sync-progress-close").addEventListener("click",function(){stop();$("sync-progress").close();});
 });
 document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")resume();});
 root.SyncStatus={start:start,resume:resume,render:render};
})(globalThis);
