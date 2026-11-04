// Home Screen install prompt and daily check-in reminders.
(function(){
 var app=window.EvenApp,toast=app.toast;
 function $(id){return document.getElementById(id);}
 var SETTINGS_KEY="even-reminder",NUDGE_GAP=3*24*60*60*1000;
 var blockedReason="",settings=readSettings(),installEvent=null;

 function readSettings(){try{return Object.assign({on:false,time:"08:30",nudgedAt:0},JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}"));}catch(e){return{on:false,time:"08:30",nudgedAt:0};}}
 function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch(e){}}
 function isInstalled(){return window.navigator.standalone===true||window.matchMedia("(display-mode: standalone)").matches;}
 function isIOS(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);}
 function canPush(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;}
 function deviceHeaders(){return{"Authorization":"Bearer "+app.deviceToken(),"Content-Type":"application/json"};}
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
  $("reminder-time").value=settings.time;
  note.textContent=blocked||"Your reminder time and time zone are saved to your account.";
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
  var saved=await fetch("/api/push/subscribe",{method:"POST",headers:deviceHeaders(),cache:"no-store",body:JSON.stringify({endpoint:subscription.endpoint,remindAt:settings.time,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
  if(!saved.ok)throw Error("Couldn’t save your reminder.");
 }
 async function unsubscribe(){
  var registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
  if(!subscription)return;
  await fetch("/api/push/unsubscribe",{method:"POST",headers:deviceHeaders(),cache:"no-store",body:JSON.stringify({endpoint:subscription.endpoint})});
  await subscription.unsubscribe();
 }
 async function updateReminder(on){
  var toggle=$("reminder-toggle");toggle.disabled=true;
  try{
   if(on){await subscribe();toast("Reminder set for "+timeLabel(settings.time)+".");}
   else{await unsubscribe();toast("Reminder off.");}
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
 // The time picker reports every turn of its wheels, so save only once it closes.
 $("reminder-time").addEventListener("blur",function(){
  if(!this.value||this.value===settings.time)return;
  settings.time=this.value;saveSettings();
  if(settings.on)updateReminder(true);
 });
 document.addEventListener("visibilitychange",function(){if(!document.hidden)renderReminder();});
 renderNudge();renderReminder();
})();
