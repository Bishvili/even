// First-run setup on Check in: one step at a time, from the Home Screen to notifications.
// Skipped steps and progress stay on this device.
(function(root){
 "use strict";
 var DAY_MS=86400000,INSTALL_AGAIN_MS=3*DAY_MS,SIGN_IN_MS=10*60000,STORAGE_KEY="even-setup";

 // The steps that apply on this device, in order.
 function steps(c){
  var list=[];
  if(c.installed||c.installable)list.push("install");
  list.push("signin");
  if(c.ios)list.push("shortcut");
  if(c.notify!=="unavailable")list.push("notifications");
  return list;
 }
 // The step to show now. "checkin" waits for the first check-in and shows no card. Null means setup is finished.
 function nextStep(c){
  var list=steps(c),skipped=c.skipped||{};
  function step(id,variant){return{id:id,variant:variant,number:list.indexOf(id)+1,total:list.length};}
  if(c.installable&&!c.installed&&!(c.now-(skipped.install||0)<INSTALL_AGAIN_MS))return step("install",c.ios?"share":"prompt");
  // An iPhone that has been connected before is managed from Data, so a deliberate disconnect isn't undone here.
  if(!c.connected&&!c.connectedBefore&&!skipped.signin)return step("signin",c.connecting?"connecting":c.signedIn?"connect":c.signingIn?"pending":"signin");
  if(c.connected&&c.ios&&!c.synced&&!skipped.shortcut)return step("shortcut",c.shortcutConnected?"again":c.gotShortcut?"run":"get");
  if(!c.checkedIn)return{id:"checkin",number:0,total:list.length};
  return c.notify==="ready"?step("notifications","start"):null;
 }
 // What's still not done, whether or not it was skipped. A deliberate disconnect doesn't count.
 function outstanding(c){
  var list=[],managed=!c.connected&&c.connectedBefore;
  if(c.installable&&!c.installed)list.push("install");
  if(!c.connected&&!managed)list.push("signin");
  if(c.ios&&!c.synced&&!managed)list.push("shortcut");
  if(!c.checkedIn)list.push("checkin");
  if(c.notifyOpen)list.push("notifications");
  return list;
 }
 // Going through setup again shows every step, marks those already done, and moves on with Next.
 function replayStep(c,index){
  var list=steps(c),id=list[index];
  if(!id)return null;
  var variant=id==="install"?(c.ios?"share":"prompt"):id==="signin"?(c.connecting?"connecting":c.signedIn?"connect":"signin"):id==="shortcut"?(c.gotShortcut?"run":"get"):"start";
  var done=id==="install"?c.installed:id==="signin"?c.connected:id==="shortcut"?c.synced:false;
  return{id:id,variant:variant,number:index+1,total:list.length,done:!!done,last:index===list.length-1,replay:true};
 }
 var api={nextStep:nextStep,outstanding:outstanding,replayStep:replayStep,render:function(){},restart:function(){}};
 root.EvenOnboarding=api;
 if(typeof document==="undefined"||!root.EvenApp)return;

 var COPY={
  "install:share":{title:"Add Even to your Home Screen",text:"In Safari, tap Share (or ••• and then Share), then Add to Home Screen.",unsynced:"Check-ins saved in Safari don’t move to the app."},
  "install:prompt":{title:"Install Even",text:"Open Even in its own window, with notifications for check-ins.",action:"Install"},
  "signin:signin":{title:"Sign in",text:"Use the email your invitation went to, and we’ll send you a one-time code.",action:"Continue with email"},
  "signin:pending":{title:"Finishing sign-in…",text:"One moment.",busy:true},
  "signin:connecting":{title:"Connecting this {device}…",text:"",busy:true},
  "signin:connect":{title:"Connect this {device}",text:"Connecting lets Even Sync send your Health and calendar data to your account.",otherText:"Connecting brings in what Even Sync sends from your iPhone.",action:"Connect this {device}"},
  "shortcut:get":{title:"Add Even Sync",text:"This Shortcut brings in your sleep, activity, calendar and alarms. Add it, then come back here.",link:true,alt:"run"},
  "shortcut:run":{title:"Run Even Sync",text:"Run it once from here, and allow access to Health and Calendar when asked.",action:"Run Even Sync",alt:"get"},
  "shortcut:again":{title:"Run Even Sync again",text:"It connected, but nothing arrived. Run it again, and allow access to Health and Calendar when asked.",action:"Run Even Sync",alt:"get"},
  "notifications:start":{title:"Fit notifications to your day",text:"Five quick questions, then you choose whether to turn them on.",action:"Start"}
 };
 var OFFLINE={signin:"Connect to the internet to sign in.",connect:"Connect to the internet to connect this device.",get:"Connect to the internet to get Even Sync.",run:"Connect to the internet to run Even Sync.",again:"Connect to the internet to run Even Sync."};
 var app=root.EvenApp,installEvent=null,progress=readProgress(),current=null,replay=null;
 function $(id){return document.getElementById(id);}
 function readProgress(){
  try{var saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");return saved&&typeof saved==="object"&&!Array.isArray(saved)?saved:{};}
  catch(e){return{};}
 }
 function saveProgress(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(progress));}catch(e){}}
 function context(s){
  var now=Date.now(),skipped=progress.skipped&&typeof progress.skipped==="object"?progress.skipped:{};
  return{now:now,ios:s.ios,installed:s.installed,installable:(s.ios&&!s.installed)||!!installEvent,
   signedIn:s.signedIn,connected:s.connected,connectedBefore:s.connectedBefore,connecting:s.connecting,
   signingIn:s.online&&!s.authKnown&&now-(Number(progress.signInAt)||0)<SIGN_IN_MS,
   synced:s.synced,shortcutConnected:s.shortcutConnected,gotShortcut:!!progress.gotShortcut,checkedIn:s.checkedIn,
   notify:root.EvenReminders?root.EvenReminders.notificationStep():"unavailable",notifyOpen:!!root.EvenReminders&&root.EvenReminders.notificationsOpen(),skipped:skipped};
 }
 // Moves focus after a tap that changed the step, so it isn't left on a control that disappeared.
 function renderSetupBadge(c){
  var left=outstanding(c).length,words=left===1?"1 setup step left":left+" setup steps left";
  $("settings-badge").hidden=!left;
  $("finish-setup").hidden=!left;
  $("finish-setup-text").textContent=left===1?"1 step left.":left+" steps left.";
  var tab=document.querySelector('.nav-item[data-go="settings"]');
  if(left)tab.setAttribute("aria-label","Settings, "+words);else tab.removeAttribute("aria-label");
 }
 function render(moveFocus){
  renderSetupBadge(context(app.setup()));
  var s=app.setup(),step=replay===null?nextStep(context(s)):replayStep(context(s),replay),card=$("setup-card");
  current=step&&step.id!=="checkin"?step:null;
  $("view-checkin").classList.toggle("setup-active",!!step);
  card.hidden=!current;
  if(!current){if(moveFocus)$("checkin-title").focus();return;}
  var copy=COPY[current.id+":"+current.variant],text=!s.ios&&copy.otherText||copy.text;
  function named(words){return words.replace("{device}",s.deviceName);}
  if(current.id==="signin"&&s.email&&(current.variant==="connect"||current.variant==="connecting"))text=("Signed in as "+s.email+". "+text).trim();
  // With check-in sync on, check-ins made in Safari do reach the app.
  if(copy.unsynced&&!s.moodSync)text+=" "+copy.unsynced;
  if(current.done)text=(text+" You’ve already done this.").trim();
  $("setup-step").textContent="Step "+current.number+" of "+current.total;
  $("setup-title").textContent=named(copy.title);
  $("setup-text").textContent=text;
  var finished=current.done&&current.id!=="shortcut";
  var url=copy.link?s.shortcutUrl:"";
  $("setup-link").hidden=!url;
  if(url)$("setup-link").href=url;else $("setup-link").removeAttribute("href");
  // Without a link to open, the same label says why when tapped.
  var label=finished?"":copy.action?named(copy.action):copy.link&&!url?"Get Even Sync":"";
  $("setup-action").hidden=!label;$("setup-action").textContent=label;
  $("setup-skip").hidden=!!copy.busy&&!current.replay;
  $("setup-skip").textContent=current.replay?(current.last?"Done":"Next"):"Not now";
  var altRun=copy.alt==="run",altGet=copy.alt==="get"&&!!s.shortcutUrl;
  $("setup-alt").hidden=!altRun&&!altGet;
  $("setup-alt-text").textContent=altRun?"Already have it?":"Not added yet?";
  $("setup-alt-run").hidden=!altRun;
  $("setup-alt-link").hidden=!altGet;
  if(altGet)$("setup-alt-link").href=s.shortcutUrl;else $("setup-alt-link").removeAttribute("href");
  card.setAttribute("aria-busy",String(!!copy.busy));
  if(moveFocus)$("setup-title").focus();
 }
 function skip(){
  if(!current)return;
  if(current.replay){replay=current.last?null:replay+1;render(true);return;}
  if(current.id==="notifications"){root.EvenReminders.dismissIntake();render(true);return;}
  progress.skipped=Object.assign({},progress.skipped);progress.skipped[current.id]=Date.now();
  saveProgress();render(true);
 }
 function act(){
  if(!current)return;
  var s=app.setup(),variant=current.variant;
  if(OFFLINE[variant]&&!s.online){app.toast(OFFLINE[variant]);return;}
  if(variant==="prompt"){
   var prompt=installEvent;installEvent=null;
   if(!prompt){render();return;}
   prompt.prompt();prompt.userChoice.finally(function(){progress.skipped=Object.assign({},progress.skipped,{install:Date.now()});saveProgress();render();});
   return;
  }
  if(variant==="signin"){progress.signInAt=Date.now();saveProgress();app.signIn("checkin");return;}
  if(variant==="connect"){app.connect();return;}
  // The Data tab's help line says why the link is missing.
  if(variant==="get"){app.toast($("shortcut-install-help").textContent);return;}
  if(current.id==="shortcut"){app.runShortcut();return;}
  if(current.id==="notifications")root.EvenReminders.startIntake();
 }
 function gotShortcut(){progress.gotShortcut=Date.now();saveProgress();setTimeout(render,0);}

 $("setup-action").addEventListener("click",act);
 $("setup-skip").addEventListener("click",skip);
 $("setup-link").addEventListener("click",gotShortcut);
 $("setup-alt-link").addEventListener("click",gotShortcut);
 $("setup-alt-run").addEventListener("click",function(){
  if(!app.setup().online){app.toast(OFFLINE.run);return;}
  progress.gotShortcut=Date.now();saveProgress();app.runShortcut();render();
 });
 root.addEventListener("beforeinstallprompt",function(event){event.preventDefault();installEvent=event;render();});
 root.addEventListener("appinstalled",function(){installEvent=null;render();});
 root.addEventListener("online",function(){render();});
 root.addEventListener("offline",function(){render();});
 api.render=function(){render();};
 api.restart=function(){replay=0;app.navigate("checkin");render(true);};
 // Finishing setup brings back every step that was skipped.
 $("finish-setup-button").addEventListener("click",function(){
  progress.skipped={};saveProgress();
  if(root.EvenReminders)root.EvenReminders.reopenIntake();
  replay=null;app.navigate("checkin");render(true);
 });
 $("setup-again").addEventListener("click",api.restart);
 render();
})(globalThis);
