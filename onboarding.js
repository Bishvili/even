// First-run setup: full-screen steps before the app (Home Screen, sign in, the Shortcut), then a card on Check in for what remains.
// Skipped steps and progress stay on this device.
(function(root){
 "use strict";
 var DAY_MS=86400000,ASK_AGAIN_MS=3*DAY_MS,STORAGE_KEY="health-setup";

 // The steps that apply on this device, in order.
 function steps(c){
  var list=[];
  if(c.installed||c.installable)list.push("install");
  list.push("signin");
  if(c.ios)list.push("shortcut");
  if(c.notify!=="unavailable")list.push("notifications");
  return list;
 }
 // The full-screen step that stands before the app, if any. Only the Shortcut can be put off, because the app still works without it.
 // Offline never locks anyone out of what's already on the device.
 function gateStep(c){
  var list=[];
  if(c.ios)list.push("install");
  list.push("signin");
  if(c.ios)list.push("shortcut");
  function step(id,variant){return{id:id,variant:variant,gate:true,number:list.indexOf(id)+1,total:list.length,records:!!c.records&&id!=="shortcut"};}
  if(c.ios&&!c.installed)return step("install",c.safari===false?"safari":"share");
  if(c.otherAccount)return step("signin","other");
  if(!c.connected){
   if(!c.online&&(c.records||c.connectedBefore))return null;
   return step("signin",c.connecting?"connecting":c.signedIn?"connect":c.signingIn?"pending":"signin");
  }
  if(c.ios&&c.online&&!c.synced&&!(c.now-((c.skipped||{}).shortcut||0)<ASK_AGAIN_MS))return step("shortcut",c.shortcutConnected?"again":c.gotShortcut?"run":"get");
  return null;
 }
 // The card on Check in. "checkin" waits for the first check-in and shows no card. Null means setup is finished.
 function nextStep(c){
  var list=steps(c),skipped=c.skipped||{};
  function step(id,variant){return{id:id,variant:variant,number:list.indexOf(id)+1,total:list.length};}
  if(!c.ios&&c.installable&&!c.installed&&!(c.now-(skipped.install||0)<ASK_AGAIN_MS))return step("install","prompt");
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
 var api={gateStep:gateStep,nextStep:nextStep,outstanding:outstanding,replayStep:replayStep,render:function(){},restart:function(){},forget:function(){}};
 root.Onboarding=api;
 if(typeof document==="undefined"||!root.App)return;

 var COPY={
  "install:share":{title:"Install {{name}}",text:"{{tagline}}",privacy:true,add:"In Safari, tap Share (or ••• and then Share), then Add to Home Screen.",action:"Add to Home Screen"},
  "install:prompt":{title:"Install {{name}}",text:"Open {{name}} in its own window, with notifications for check-ins.",action:"Install"},
  "install:safari":{title:"Open {{name}} in Safari",text:"To add {{name}} to your Home Screen, open this page in Safari.",safari:true},
  "signin:other":{title:"This {device} has another account’s records",text:"Back them up and erase them to use this account, or sign out and use the account they belong to.",action:"Sign out"},
  "signin:signin":{title:"Sign in",text:"Use your invited email for a one-time code, or use Google.",action:"Sign in",privacy:true},
  "signin:pending":{title:"Finishing sign-in…",text:"One moment.",busy:true},
  "signin:connecting":{title:"Connecting this {device}…",text:"",busy:true},
  "signin:connect":{title:"Connect this {device}",text:"Connecting lets {{sync}} send your Health and calendar data to your account.",otherText:"Connecting brings in what {{sync}} sends from your iPhone.",action:"Connect this {device}"},
  "shortcut:get":{title:"Add {{sync}}",text:"This Shortcut brings in your sleep, activity, calendar and alarms. Add it, then come back here.",link:true,alt:"run"},
  "shortcut:run":{title:"Run {{sync}}",text:"Run it once from here, and allow access to Health and Calendar when asked.",action:"Run {{sync}}",alt:"get"},
  "shortcut:again":{title:"Run {{sync}} again",text:"It connected, but nothing arrived. Run it again, and allow access to Health and Calendar when asked.",action:"Run {{sync}}",alt:"get"},
  "notifications:start":{title:"Fit notifications to your day",text:"Five quick questions, then you choose whether to turn them on.",action:"Start"}
 };
 var OFFLINE={signin:"Connect to the internet to sign in.",connect:"Connect to the internet to connect this device.",get:"Connect to the internet to get {{sync}}.",run:"Connect to the internet to run {{sync}}.",again:"Connect to the internet to run {{sync}}."};
 var app=root.App,installEvent=null,progress=readProgress(),current=null,replay=null;
 function $(id){return document.getElementById(id);}
 function readProgress(){
  try{var saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");return saved&&typeof saved==="object"&&!Array.isArray(saved)?saved:{};}
  catch(e){return{};}
 }
 function saveProgress(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(progress));}catch(e){/* Storage is full or blocked; progress lasts until the app closes. */}}
 function context(s){
  var now=Date.now(),skipped=progress.skipped&&typeof progress.skipped==="object"?progress.skipped:{};
  return{now:now,ios:s.ios,installed:s.installed,installable:(s.ios&&!s.installed)||!!installEvent,
   signedIn:s.signedIn,connected:s.connected,connectedBefore:s.connectedBefore,connecting:s.connecting,
   signingIn:s.online&&!s.authKnown,safari:s.safari,records:s.records,otherAccount:s.otherAccount,online:s.online,
   synced:s.synced,shortcutConnected:s.shortcutConnected,gotShortcut:!!progress.gotShortcut,checkedIn:s.checkedIn,
   notify:root.Reminders?root.Reminders.notificationStep():"unavailable",notifyOpen:!!root.Reminders&&root.Reminders.notificationsOpen(),skipped:skipped};
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
 var gateShown="";
 function render(moveFocus){
  var c=context(app.setup());
  renderSetupBadge(c);
  var gate=replay===null?gateStep(c):null,key=gate?gate.id+":"+gate.variant:"";
  document.body.classList.toggle("gated",!!gate);
  $("gate").hidden=!gate;
  var changed=key!==gateShown;gateShown=key;
  if(gate){current=gate;renderGate(gate);if(moveFocus||changed)$("gate-title").focus();return;}
  renderCard(moveFocus||changed);
 }
 // The page before the app is installed: choose a look, sign in, add the icon, open it.
 function renderInstaller(copy,s){
  $("gate-install").hidden=!copy.add;
  if(!copy.add)return;
  $("gate-install-add").textContent=copy.add;
  $("gate-install-name").textContent=root.Look.installName();
  $("gate-install-signin").hidden=s.signedIn;
  $("gate-install-account").textContent=s.signedIn?"Signed in as "+s.email+".":"Sign in here, and you won’t need to in the app. You can also skip this.";
  $("gate-install-open").textContent=s.signedIn?"Open it from your Home Screen. You should stay signed in.":"Open it from your Home Screen, and sign in.";
  if(root.Install)root.Install.prepare(s.signedIn);
 }
 function renderGate(step){
  var s=app.setup(),copy=COPY[step.id+":"+step.variant];
  function named(words){return words.replace("{device}",s.deviceName);}
  var text=!s.ios&&copy.otherText||copy.text;
  if(step.id==="signin"&&s.email&&(step.variant==="connect"||step.variant==="connecting"))text=("Signed in as "+s.email+". "+text).trim();
  $("gate-step").textContent=step.total>1?"Step "+step.number+" of "+step.total:"";
  $("gate-step").hidden=step.total<2||!!copy.add;
  renderInstaller(copy,s);
  $("gate-title").textContent=named(copy.title);
  $("gate-text").textContent=text;
  $("gate-privacy").hidden=!copy.privacy;
  var url=copy.link?s.shortcutUrl:copy.safari?"x-safari-"+location.href:"";
  $("gate-link").hidden=!url;
  $("gate-link-text").textContent=copy.safari?"Open in Safari":"Get {{sync}}";
  if(url)$("gate-link").href=url;else $("gate-link").removeAttribute("href");
  var label=copy.action?named(copy.action):copy.link&&!url?"Get {{sync}}":"";
  $("gate-action").hidden=!label;$("gate-action").textContent=label;
  $("gate-skip").hidden=step.id!=="shortcut";
  var altRun=copy.alt==="run",altGet=copy.alt==="get"&&!!s.shortcutUrl;
  $("gate-alt").hidden=!altRun&&!altGet;
  $("gate-alt-text").textContent=altRun?"Already have it?":"Not added yet?";
  $("gate-alt-run").hidden=!altRun;
  $("gate-alt-link").hidden=!altGet;
  if(altGet)$("gate-alt-link").href=s.shortcutUrl;else $("gate-alt-link").removeAttribute("href");
  $("gate-records").hidden=!step.records;
  $("gate-look").hidden=step.id==="shortcut"||!!copy.add;
  $("gate").setAttribute("aria-busy",String(!!copy.busy));
 }
 function renderCard(moveFocus){
  var s=app.setup(),step=replay===null?nextStep(context(s)):replayStep(context(s),replay),card=$("setup-card");
  current=step&&step.id!=="checkin"?step:null;
  $("view-checkin").classList.toggle("setup-active",!!step);
  card.hidden=!current;
  if(!current){if(moveFocus)$("checkin-title").focus();return;}
  var copy=COPY[current.id+":"+current.variant],text=!s.ios&&copy.otherText||copy.text;
  function named(words){return words.replace("{device}",s.deviceName);}
  if(current.id==="signin"&&s.email&&(current.variant==="connect"||current.variant==="connecting"))text=("Signed in as "+s.email+". "+text).trim();
  if(current.done)text=(text+" You’ve already done this.").trim();
  $("setup-step").textContent="Step "+current.number+" of "+current.total;
  $("setup-title").textContent=named(copy.title);
  $("setup-text").textContent=text;
  var finished=current.done&&current.id!=="shortcut";
  var url=copy.link?s.shortcutUrl:"";
  $("setup-link").hidden=!url;
  if(url)$("setup-link").href=url;else $("setup-link").removeAttribute("href");
  // Without a link to open, the same label says why when tapped.
  var label=finished?"":copy.action?named(copy.action):copy.link&&!url?"Get {{sync}}":"";
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
  if(current.id==="notifications"){root.Reminders.dismissIntake();render(true);return;}
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
  // Safari doesn't let a page open its Add to Home Screen, so this shows where to tap.
  if(variant==="share"){$("install-help").showModal();return;}
  if(variant==="signin"){app.signIn("checkin");return;}
  if(variant==="other"){app.signOut();return;}
  if(variant==="connect"){app.connect();return;}
  // The Sync tab's help line says why the link is missing.
  if(variant==="get"){app.toast($("shortcut-install-help").textContent);return;}
  if(current.id==="shortcut"){app.runShortcut();return;}
  if(current.id==="notifications")root.Reminders.startIntake();
 }
 function gotShortcut(){progress.gotShortcut=Date.now();saveProgress();setTimeout(render,0);}

 function altRun(){
  if(!app.setup().online){app.toast(OFFLINE.run);return;}
  progress.gotShortcut=Date.now();saveProgress();app.runShortcut();render();
 }
 $("install-help-done").addEventListener("click",function(){$("install-help").close();});
 ["setup","gate"].forEach(function(prefix){
  $(prefix+"-action").addEventListener("click",act);
  $(prefix+"-skip").addEventListener("click",skip);
  $(prefix+"-link").addEventListener("click",function(){if(current&&current.id==="shortcut")gotShortcut();});
  $(prefix+"-alt-link").addEventListener("click",gotShortcut);
  $(prefix+"-alt-run").addEventListener("click",altRun);
 });
 // These controls live in Settings, which can't be reached from here.
 $("gate-backup").addEventListener("click",function(){$("backup-button").click();});
 $("gate-erase").addEventListener("click",function(){$("erase-local").click();});
 $("gate-feedback").addEventListener("click",function(){root.Feedback.open();});
 $("gate-install-signin").addEventListener("click",function(){if(!app.setup().online){app.toast(OFFLINE.signin);return;}app.signIn("checkin");});
 root.addEventListener("beforeinstallprompt",function(event){event.preventDefault();installEvent=event;render();});
 root.addEventListener("appinstalled",function(){installEvent=null;render();});
 root.addEventListener("online",function(){render();});
 root.addEventListener("offline",function(){render();});
 api.render=function(){render();};
 api.forget=function(){progress={};replay=null;render();};
 api.restart=function(){replay=0;app.navigate("checkin");render(true);};
 // Finishing setup brings back every step that was skipped.
 $("finish-setup-button").addEventListener("click",function(){
  progress.skipped={};saveProgress();
  if(root.Reminders)root.Reminders.reopenIntake();
  replay=null;app.navigate("checkin");render(true);
 });
 $("setup-again").addEventListener("click",api.restart);
 render();
})(globalThis);
