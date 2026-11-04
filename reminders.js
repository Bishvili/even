// Home Screen install prompt and daily check-in reminders.
(function(){
 var app=window.EvenApp,toast=app.toast;
 function $(id){return document.getElementById(id);}
 var SETTINGS_KEY="even-reminder",NUDGE_GAP=3*24*60*60*1000;
 var blockedReason="",syncError="",settings=readSettings(),installEvent=null;

 function defaults(){return{on:false,mode:"smart",from:"09:00",to:"21:00",count:5,times:["09:00"],every:2,nudgedAt:0,hardest:"varies",brief:true,windDown:true,weekends:true,stressNudges:true,syncReminder:true,syncAt:"",intakeDone:false,intakeDismissed:false};}
 function readSettings(){try{return Object.assign(defaults(),JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}"));}catch(e){return defaults();}}
 function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch(e){}}
 function isInstalled(){return window.navigator.standalone===true||window.matchMedia("(display-mode: standalone)").matches;}
 function isIOS(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);}
 function canPush(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;}
 function deviceHeaders(){return{"Authorization":"Bearer "+app.deviceToken(),"Content-Type":"application/json"};}
 function planFor(values){return globalThis.EvenCoach.smartPlan(app.personalMoods(),app.personalHealth(),values.from,values.to,values.count,new Date(),Object.assign({alarms:app.alarms()},values));}
 function anticipated(values){
  return values.stressNudges===false?[]:globalThis.EvenCoach.anticipate(app.personalMoods(),app.personalEvents(),app.personalHealth(),new Date(),Object.assign({resets:app.resets()},values));
 }
 // One hour into the day, unless a time has been chosen.
 function syncTime(values){
  if(values.syncAt)return values.syncAt;
  var parts=values.from.split(":"),hour=Math.min(Number(parts[0])+1,23);
  return String(hour).padStart(2,"0")+":"+parts[1];
 }
 // The specific wording stays on the device; the account stores only the times.
 function saveAnticipated(items){
  if(!("caches" in window))return;
  var body={};items.forEach(function(item){body[item.at]=item.message;});
  caches.open("even-brief").then(function(cache){return cache.put("/anticipate",new Response(JSON.stringify(body)));}).catch(function(){});
 }
 function smartPlan(){return planFor(settings);}
 function schedule(){
  var coach=globalThis.EvenCoach;
  if(settings.mode==="smart")return smartPlan().times;
  return settings.mode==="repeat"?coach.repeatTimes(settings.from,settings.to,settings.every):settings.times;
 }
 function timeLabel(value){var parts=value.split(":"),date=new Date();date.setHours(Number(parts[0]),Number(parts[1]),0,0);return app.formatTime(date);}

 function renderNudge(){
  var nudge=$("install-nudge"),due=Date.now()-settings.nudgedAt>NUDGE_GAP;
  nudge.hidden=isInstalled()||!due||!(installEvent||isIOS());
  $("install-nudge-action").hidden=!installEvent;
  $("install-nudge-text").textContent=installEvent?"Install Even for quick check-ins and reminders.":"Tap Share, then Add to Home Screen, for quick check-ins and reminders.";
 }
 function dismissNudge(){settings.nudgedAt=Date.now();saveSettings();renderNudge();}

 function renderReminder(){
  var toggle=$("reminder-toggle"),note=$("reminder-note"),blocked="";
  if(!canPush())blocked=isIOS()&&!isInstalled()?"Add Even to your Home Screen to turn on notifications.":"This browser can’t show notifications.";
  else if(!app.deviceToken())blocked="Sign in under Sync to turn on notifications.";
  else if(Notification.permission==="denied")blocked="Notifications are off. Turn them on in Settings.";
  blockedReason=blocked;toggle.disabled=false;toggle.checked=!blocked&&settings.on;
  note.textContent=blocked||syncError||"Your notification times, time zone and check-in times are saved to your account. What you write stays here unless you sync check-ins.";
  $("intake-card").hidden=Boolean(blocked)||settings.intakeDone||settings.intakeDismissed;
  renderSchedule();
 }
 var PARTS={morning:"mornings",midday:"middays",afternoon:"afternoons",evening:"evenings"};
 var BEDTIME_WHY={sleep:"20 minutes before you usually fall asleep",evenings:"Based on your latest evening check-ins",window:"20 minutes before the end of your day"};
 var LEFT_OUT={bedtime:"wind-down",brief:"morning brief",hard:"harder-time check-in"};
 function minuteLabel(minutes){var hour=Math.floor(minutes/60);return timeLabel(String(hour).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0"));}
 function slotText(slot){
  if(slot.kind==="bedtime")return["Wind-down",slot.source==="alarm"?"Your "+minuteLabel(slot.alarmMin)+" alarm tomorrow":BEDTIME_WHY[slot.source]];
  if(slot.kind==="brief")return["Morning brief",slot.alarmMin===undefined?"What today may hold":"15 minutes after your "+minuteLabel(slot.alarmMin)+" alarm"];
  if(slot.kind==="times")return["Check-in","A time you set"];
  if(slot.kind==="repeat")return["Check-in","Every "+settings.every+(settings.every===1?" hour":" hours")];
  if(slot.kind==="hard")return["Check-in","You said "+PARTS[slot.part]+" are often harder"];
  return["Check-in",slot.kind==="usual"?"Around when you often check in":"Spaced across your day"];
 }
 function renderSlots(box,slots){
  slots.forEach(function(slot){
   var text=slotText(slot),row=document.createElement("div"),time=document.createElement("span"),who=document.createElement("div"),title=document.createElement("strong"),why=document.createElement("small");
   row.className="plan-row";time.className="plan-time";time.textContent=timeLabel(slot.time);
   title.textContent=text[0];why.textContent=text[1];
   who.appendChild(title);who.appendChild(why);row.appendChild(time);row.appendChild(who);box.appendChild(row);
  });
 }
 function leftOutNote(plan){return plan.left.length?"Add another notification to include your "+plan.left.map(function(kind){return LEFT_OUT[kind];}).join(" and ")+".":"";}
 function currentSlots(){
  if(settings.mode==="smart")return smartPlan().slots;
  return schedule().map(function(time){return{time:time,kind:settings.mode};});
 }
 function isWeekend(){var day=new Date().getDay();return day===0||day===6;}
 function renderPlan(){
  var box=$("reminder-plan"),notes=[],valid=settings.mode==="times"||settings.to>settings.from;
  box.textContent="";
  if(valid)renderSlots(box,currentSlots());else notes.push("Choose an end time after the start time.");
  if(valid&&settings.mode==="smart"){var left=leftOutNote(smartPlan());if(left)notes.push(left);notes.push("A check-in is skipped if you’ve checked in during the last 90 minutes.");}
  if(!settings.weekends&&isWeekend())notes.unshift("Nothing today, because weekends are off.");
  $("reminder-plan-note").textContent=notes.join(" ");
  renderExtras();
 }
 function renderExtras(){
  var box=$("reminder-extras"),items=anticipated(settings).slice(0,3);box.textContent="";
  function row(when,title,why){
   var line=document.createElement("div"),time=document.createElement("span"),who=document.createElement("div"),name=document.createElement("strong"),small=document.createElement("small");
   line.className="plan-row";time.className="plan-time";time.textContent=when;name.textContent=title;small.textContent=why;
   who.appendChild(name);who.appendChild(small);line.appendChild(time);line.appendChild(who);box.appendChild(line);
  }
  if(settings.syncReminder)row(timeLabel(syncTime(settings)),"Sync reminder","If Even hasn’t synced in 20 hours. Tap to run it.");
  items.forEach(function(item){var at=new Date(item.at),today=at.toDateString()===new Date().toDateString();row((today?"":at.toLocaleDateString([],{weekday:"short"})+" ")+app.formatTime(at),"Before a harder moment",item.message);});
  if(settings.stressNudges&&!items.length)row("—","Before a harder moment","Nothing ahead yet. These appear once your check-ins show a pattern.");
  $("reminder-sync-time-row").hidden=!settings.syncReminder;
  $("reminder-stress").checked=settings.stressNudges;$("reminder-sync").checked=settings.syncReminder;$("reminder-sync-time").value=syncTime(settings);
 }
 function renderSchedule(){
  document.querySelectorAll("[data-reminder-mode]").forEach(function(b){var on=b.dataset.reminderMode===settings.mode;b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});
  $("reminder-window").hidden=settings.mode==="times";
  $("reminder-count-row").hidden=settings.mode!=="smart";
  $("reminder-every-row").hidden=settings.mode!=="repeat";
  $("reminder-times").hidden=settings.mode!=="times";
  $("reminder-from").value=settings.from;$("reminder-to").value=settings.to;
  $("reminder-count").value=String(settings.count);$("reminder-every").value=String(settings.every);
  $("reminder-tune").hidden=settings.mode!=="smart";
  $("reminder-hardest").value=settings.hardest;$("reminder-brief").checked=settings.brief;$("reminder-wind-down").checked=settings.windDown;$("reminder-weekends").checked=settings.weekends;
  renderPlan();
  var list=$("reminder-time-list");list.textContent="";
  settings.times.forEach(function(time,index){
   var row=document.createElement("div"),input=document.createElement("input"),remove=document.createElement("button");
   row.className="calendar-row";input.type="time";input.value=time;input.setAttribute("aria-label","Reminder time");
   input.addEventListener("blur",function(){if(input.value&&input.value!==settings.times[index]){settings.times[index]=input.value;scheduleChanged();}});
   remove.type="button";remove.className="entry-delete";remove.textContent="×";remove.setAttribute("aria-label","Remove time");remove.hidden=settings.times.length===1;
   remove.addEventListener("click",function(){settings.times.splice(index,1);scheduleChanged();renderSchedule();});
   row.appendChild(input);row.appendChild(remove);list.appendChild(row);
  });
 }
 function scheduleChanged(){
  saveSettings();renderPlan();
  if(!settings.on)return;
  if(settings.mode!=="times"&&settings.to<=settings.from){toast("Choose an end time after the start time.");return;}
  updateReminder(true);
 }
 function openIntake(skipLabel,onSkip){
  var turningOn=!settings.on&&!blockedReason;
  globalThis.EvenIntake.open({from:settings.from,to:settings.to,hardest:settings.hardest,brief:settings.brief,windDown:settings.windDown,weekends:settings.weekends,stressNudges:settings.stressNudges,syncReminder:settings.syncReminder,count:settings.count},{
   skipLabel:skipLabel,finishLabel:turningOn?"Turn on notifications":"Save",
   preview:function(values,box){
    var plan=planFor(values),list=document.createElement("div"),left=leftOutNote(plan);
    renderSlots(list,plan.slots);box.appendChild(list);
    if(left){var note=document.createElement("p");note.className="muted";note.textContent=left;box.appendChild(note);}
   },
   onFinish:function(values){
    Object.assign(settings,values,{mode:"smart",intakeDone:true});saveSettings();renderReminder();
    if(blockedReason){toast(blockedReason);return;}
    updateReminder(true);
   },
   onSkip:onSkip
  });
 }
 function keyBytes(key){var text=atob(key.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(text,function(c){return c.charCodeAt(0);});}
 function fixedTimes(){
  if(settings.mode!=="smart")return{bedtimeAt:null,briefAt:null,hardAt:null};
  var plan=smartPlan();return{bedtimeAt:plan.bedtimeAt,briefAt:plan.briefAt,hardAt:plan.hardAt};
 }
 async function subscribe(){
  var permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
  if(permission!=="granted")throw Error("Notifications are off. Turn them on in Settings.");
  var keyResponse=await fetch("/api/push/key",{headers:deviceHeaders(),cache:"no-store"});
  var key=keyResponse.ok?(await keyResponse.json()).key:null;
  if(!key)throw Error("Notifications aren’t available right now.");
  var registration=await navigator.serviceWorker.ready;
  var subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)});
  var stressItems=anticipated(settings);saveAnticipated(stressItems);
  var saved=await fetch("/api/push/subscribe",{method:"POST",headers:deviceHeaders(),cache:"no-store",body:JSON.stringify({endpoint:subscription.endpoint,keys:subscription.toJSON().keys,mode:settings.mode==="smart"?"smart":"custom",times:schedule(),...fixedTimes(),weekends:settings.weekends,syncAt:settings.syncReminder?syncTime(settings):null,stressTimes:stressItems.map(function(item){return item.at;}),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
  if(!saved.ok)throw Error("Couldn’t save your notifications.");
 }
 async function unsubscribe(){
  var registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
  if(!subscription)return;
  await fetch("/api/push/unsubscribe",{method:"POST",headers:deviceHeaders(),cache:"no-store",body:JSON.stringify({endpoint:subscription.endpoint})});
  await subscription.unsubscribe();
 }
 // Keep the saved reminder in step with this device's push credentials.
 function syncReminder(){
  if(!settings.on||!canPush()||!app.deviceToken()||Notification.permission!=="granted"||!schedule().length)return;
  subscribe().then(function(){if(syncError){syncError="";renderReminder();}}).catch(function(e){syncError=e.message||"Couldn’t update your notifications.";renderReminder();});
 }
 function checkedIn(){
  if(!settings.on||!app.deviceToken())return;
  fetch("/api/push/check-in",{method:"POST",headers:deviceHeaders(),cache:"no-store",body:"{}"}).catch(function(){});
  syncReminder();
 }
 async function updateReminder(on){
  var toggle=$("reminder-toggle");toggle.disabled=true;
  try{
   if(on){await subscribe();var count=schedule().length;toast(settings.mode==="smart"?"Smart notifications are on.":count===1?"Notification set for "+timeLabel(schedule()[0])+".":count+" notifications a day are set.");}
   else{await unsubscribe();toast("Notifications off.");}
   settings.on=on;saveSettings();
  }catch(e){toast(e.message||"Couldn’t update your notifications.");}
  renderReminder();
 }

 window.addEventListener("beforeinstallprompt",function(event){event.preventDefault();installEvent=event;renderNudge();});
 window.addEventListener("appinstalled",function(){installEvent=null;renderNudge();renderReminder();});
 $("install-nudge-close").addEventListener("click",dismissNudge);
 $("install-nudge-action").addEventListener("click",function(){var prompt=installEvent;installEvent=null;prompt.prompt();prompt.userChoice.finally(dismissNudge);});
 $("reminder-toggle").addEventListener("change",function(){
  if(blockedReason){this.checked=false;toast(blockedReason);return;}
  if(this.checked&&!settings.intakeDone){
   this.checked=false;
   openIntake("Skip questions",function(){settings.intakeDone=true;saveSettings();updateReminder(true);});
   return;
  }
  updateReminder(this.checked);
 });
 // Time pickers report every turn of their wheels, so save only once they close.
 ["from","to"].forEach(function(name){$("reminder-"+name).addEventListener("blur",function(){if(this.value&&this.value!==settings[name]){settings[name]=this.value;scheduleChanged();}});});
 $("reminder-count").addEventListener("change",function(){settings.count=Number(this.value);scheduleChanged();});
 $("reminder-every").addEventListener("change",function(){settings.every=Number(this.value);scheduleChanged();});
 document.querySelectorAll("[data-reminder-mode]").forEach(function(b){b.addEventListener("click",function(){settings.mode=b.dataset.reminderMode;renderSchedule();scheduleChanged();});});
 $("reminder-hardest").addEventListener("change",function(){settings.hardest=this.value;scheduleChanged();});
 [["brief","brief"],["wind-down","windDown"],["weekends","weekends"],["stress","stressNudges"],["sync","syncReminder"]].forEach(function(item){$("reminder-"+item[0]).addEventListener("change",function(){settings[item[1]]=this.checked;scheduleChanged();});});
 $("reminder-sync-time").addEventListener("blur",function(){if(this.value&&this.value!==syncTime(settings)){settings.syncAt=this.value;scheduleChanged();}});
 function dismissIntake(){settings.intakeDismissed=true;saveSettings();renderReminder();}
 $("intake-start").addEventListener("click",function(){openIntake("Not now",dismissIntake);});
 $("intake-later").addEventListener("click",dismissIntake);
 $("intake-retake").addEventListener("click",function(){openIntake("Cancel",function(){});});
 $("add-reminder-time").addEventListener("click",function(){if(settings.times.length>=12)return;settings.times.push("12:00");renderSchedule();scheduleChanged();});
 globalThis.EvenReminders={checkedIn:checkedIn,dataChanged:function(){renderPlan();syncReminder();},preferences:function(){return settings;}};
 app.refreshCoach();
 document.addEventListener("visibilitychange",function(){if(!document.hidden){renderReminder();syncReminder();}});
 renderNudge();renderReminder();
 syncReminder();
})();
