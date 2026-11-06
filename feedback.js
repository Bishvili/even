// Send feedback: a mail draft with a short summary the person reads first. It never holds check-ins, notes, Health or calendar values, titles or names.
(function(){
 "use strict";
 var SUPPORT="{{support}}";
 var $=function(id){return document.getElementById(id);};
 function deviceSoftware(){
  var match=/OS (\d+)[_.](\d+)/.exec(navigator.userAgent);
  return match?"iOS "+match[1]+"."+match[2]:"Other";
 }
 function summary(){
  var app=globalThis.App,status=app.syncStatus()||{};
  return{
   "App version":app.version,
   "Software":deviceSoftware(),
   "Opened from":app.isInstalled()?"Home Screen":"Browser",
   "Signed in":app.signedIn()?"Yes":"No",
   "{{sync}} version":status.installedShortcutVersion||"None",
   "Last upload":status.lastDataUploadAt||"None",
   "Last error":status.lastErrorCode||"None",
   "Layout fix":globalThis.Viewport?globalThis.Viewport.summary():"None"
  };
 }
 function summaryText(){var s=summary();return Object.keys(s).map(function(k){return k+": "+s[k];}).join("\n");}
 function open(){$("feedback-summary").textContent=summaryText();$("feedback-sheet").showModal();}
 function send(){
  var body="What happened?\n\n\n---\n"+summaryText();
  window.location.href="mailto:"+SUPPORT+"?subject="+encodeURIComponent("{{name}} feedback")+"&body="+encodeURIComponent(body);
  $("feedback-sheet").close();
 }
 function init(){
  $("feedback-open").addEventListener("click",open);
  $("feedback-send").addEventListener("click",send);
  $("feedback-cancel").addEventListener("click",function(){$("feedback-sheet").close();});
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
 globalThis.Feedback={summary:summary,open:open};
})();
