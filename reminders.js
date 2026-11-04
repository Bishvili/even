// Home Screen install prompt and daily check-in reminders.
(function(){
 var app=window.EvenApp,toast=app.toast;
 function $(id){return document.getElementById(id);}
 var SETTINGS_KEY="even-reminder",NUDGE_GAP=3*24*60*60*1000;
 var blockedReason="",syncError="",settings=readSettings(),installEvent=null;

 function readSettings(){try{return Object.assign({on:false,mode:"smart",from:"09:00",to:"21:00",count:2,times:["09:00"],every:2,nudgedAt:0},JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}"));}catch(e){return{on:false,mode:"smart",from:"09:00",to:"21:00",count:2,times:["09:00"],every:2,nudgedAt:0};}}
 function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch(e){}}
 function isInstalled(){return window.navigator.standalone===true||window.matchMedia("(display-mode: standalone)").matches;}
 function isIOS(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);}
 function canPush(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;}
 function deviceHeaders(){return{"Authorization":"Bearer "+app.deviceToken(),"Content-Type":"application/json"};}
 function smartPlan(){return globalThis.EvenCoach.smartPlan(app.personalMoods(),app.personalHealth(),settings.from,settings.to,settings.count,new Date());}
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
  if(!canPush())blocked=isIOS()&&!isInstalled()?"Add Even to your Home Screen to turn on reminders.":"This browser can’t show reminders.";
  else if(!app.deviceToken())blocked="Sign in under Sync to turn on reminders.";
  else if(Notification.permission==="denied")blocked="Notifications are off. Turn them on in Settings.";
  blockedReason=blocked;toggle.disabled=false;toggle.checked=!blocked&&settings.on;
  note.textContent=blocked||syncError||"Your reminder times, time zone and check-in times are saved to your account. What you write stays here.";
  renderSchedule();
 }
 function renderSchedule(){
  document.querySelectorAll("[data-reminder-mode]").forEach(function(b){var on=b.dataset.reminderMode===settings.mode;b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});
  $("reminder-window").hidden=settings.mode==="times";
  $("reminder-count-row").hidden=settings.mode!=="smart";
  $("reminder-every-row").hidden=settings.mode!=="repeat";
  $("reminder-times").hidden=settings.mode!=="times";
  $("reminder-from").value=settings.from;$("reminder-to").value=settings.to;
  $("reminder-count").value=String(settings.count);$("reminder-every").value=String(settings.every);
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
  saveSettings();
  if(!settings.on)return;
  if(settings.mode!=="times"&&settings.to<=settings.from){toast("Choose an end time after the start time.");return;}
  updateReminder(true);
 }
 function keyBytes(key){var text=atob(key.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(text,function(c){return c.charCodeAt(0);});}
 async function subscribe(){
  var permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
  if(permission!=="granted")throw Error("Notifications are off. Turn them on in Settings.");
  var keyResponse=await fetch("/api/push/key",{headers:deviceHeaders(),cache:"no-store"});
  var key=keyResponse.ok?(await keyResponse.json()).key:null;
  if(!key)throw Error("Reminders aren’t available right now.");
  var registration=await navigator.serviceWorker.ready;
  var subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)});
  var saved=await fetch("/api/push/subscribe",{method:"POST",headers:deviceHeaders(),cache:"no-store",body:JSON.stringify({endpoint:subscription.endpoint,keys:subscription.toJSON().keys,mode:settings.mode==="smart"?"smart":"custom",times:schedule(),bedtimeAt:settings.mode==="smart"?smartPlan().bedtimeAt:null,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
  if(!saved.ok)throw Error("Couldn’t save your reminder.");
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
  subscribe().then(function(){if(syncError){syncError="";renderReminder();}}).catch(function(e){syncError=e.message||"Couldn’t update your reminders.";renderReminder();});
 }
 function checkedIn(){
  if(!settings.on||!app.deviceToken())return;
  fetch("/api/push/check-in",{method:"POST",headers:deviceHeaders(),cache:"no-store",body:"{}"}).catch(function(){});
  syncReminder();
 }
 async function updateReminder(on){
  var toggle=$("reminder-toggle");toggle.disabled=true;
  try{
   if(on){await subscribe();var count=schedule().length;toast(settings.mode==="smart"?"Smart reminders are on.":count===1?"Reminder set for "+timeLabel(schedule()[0])+".":count+" reminders a day are set.");}
   else{await unsubscribe();toast("Reminders off.");}
   settings.on=on;saveSettings();
  }catch(e){toast(e.message||"Couldn’t update your reminder.");}
  renderReminder();
 }

 window.addEventListener("beforeinstallprompt",function(event){event.preventDefault();installEvent=event;renderNudge();});
 window.addEventListener("appinstalled",function(){installEvent=null;renderNudge();renderReminder();});
 $("install-nudge-close").addEventListener("click",dismissNudge);
 $("install-nudge-action").addEventListener("click",function(){var prompt=installEvent;installEvent=null;prompt.prompt();prompt.userChoice.finally(dismissNudge);});
 $("reminder-toggle").addEventListener("change",function(){
  if(blockedReason){this.checked=false;toast(blockedReason);return;}
  updateReminder(this.checked);
 });
 // Time pickers report every turn of their wheels, so save only once they close.
 ["from","to"].forEach(function(name){$("reminder-"+name).addEventListener("blur",function(){if(this.value&&this.value!==settings[name]){settings[name]=this.value;scheduleChanged();}});});
 $("reminder-count").addEventListener("change",function(){settings.count=Number(this.value);scheduleChanged();});
 $("reminder-every").addEventListener("change",function(){settings.every=Number(this.value);scheduleChanged();});
 document.querySelectorAll("[data-reminder-mode]").forEach(function(b){b.addEventListener("click",function(){settings.mode=b.dataset.reminderMode;renderSchedule();scheduleChanged();});});
 $("add-reminder-time").addEventListener("click",function(){if(settings.times.length>=12)return;settings.times.push("12:00");renderSchedule();scheduleChanged();});
 globalThis.EvenReminders={checkedIn:checkedIn};
 document.addEventListener("visibilitychange",function(){if(!document.hidden){renderReminder();syncReminder();}});
 renderNudge();renderReminder();
 syncReminder();
})();
