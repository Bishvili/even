// Optional passphrase protection for backup files. The passphrase is never stored or sent.
(function(root){
 "use strict";
 var ROUNDS=600000,MIN_ROUNDS=100000,MAX_ROUNDS=5000000,CHUNK=32768;
 function toBase64(bytes){
  var view=new Uint8Array(bytes),text="";
  for(var i=0;i<view.length;i+=CHUNK)text+=String.fromCharCode.apply(null,view.subarray(i,i+CHUNK));
  return btoa(text);
 }
 function fromBase64(text){return Uint8Array.from(atob(text),function(c){return c.charCodeAt(0);});}
 async function keyFor(passphrase,salt,rounds){
  var base=await crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt:salt,iterations:rounds},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 }
 async function protect(text,passphrase){
  var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  var sealed=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},await keyFor(passphrase,salt,ROUNDS),new TextEncoder().encode(text));
  return JSON.stringify({app:"Health",protected:true,rounds:ROUNDS,salt:toBase64(salt),iv:toBase64(iv),data:toBase64(sealed)});
 }
 function isProtected(backup){return !!backup&&backup.app==="Health"&&backup.protected===true;}
 // Throws when the passphrase is wrong or the file was changed.
 async function unprotect(backup,passphrase){
  if(!Number.isInteger(backup.rounds)||backup.rounds<MIN_ROUNDS||backup.rounds>MAX_ROUNDS)throw Error("Unreadable backup");
  var opened=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64(backup.iv)},await keyFor(passphrase,fromBase64(backup.salt),backup.rounds),fromBase64(backup.data));
  return new TextDecoder().decode(opened);
 }
 function isTime(value){return typeof value==="string"&&!isNaN(new Date(value).getTime());}
 function validReflection(r){
  var answers=r&&r.answers&&typeof r.answers==="object"?Object.values(r.answers):[];
  return !!r&&isTime(r.ts)&&answers.length>0&&answers.every(function(a){return Number.isFinite(a);});
 }
 function validAlarm(a){
  return !!a&&Number.isInteger(a.timeMin)&&a.timeMin>=0&&a.timeMin<1440&&Array.isArray(a.days)&&a.days.every(function(d){return Number.isInteger(d)&&d>=0&&d<=6;});
 }
 // What can be trusted from a restored file, and how much had to be left out.
 function clean(data){
  var given={reflections:Array.isArray(data.reflections)?data.reflections:[],alarms:Array.isArray(data.alarms)?data.alarms:[],resets:Array.isArray(data.resets)?data.resets:[],tries:Array.isArray(data.tries)?data.tries:[],planLog:Array.isArray(data.planLog)?data.planLog:[],planMoves:Array.isArray(data.planMoves)?data.planMoves:[]};
  var tries=given.tries.filter(function(t){return !!t&&typeof t.id==="string"&&isTime(t.at);}).map(function(t){return{id:t.id.slice(0,80),at:t.at};});
  var planLog=given.planLog.filter(function(p){return !!p&&/^\d{4}-\d{2}-\d{2}$/.test(String(p.date))&&Number.isInteger(p.minute)&&p.minute>=0&&p.minute<2880;});
  var planMoves=given.planMoves.filter(function(m){return !!m&&Number.isInteger(m.from)&&Number.isInteger(m.to)&&isTime(m.at);});
  var reflections=given.reflections.filter(validReflection),resets=given.resets.filter(isTime);
  var alarms=given.alarms.filter(validAlarm).map(function(a){return{timeMin:a.timeMin,days:a.days,enabled:a.enabled!==false,label:String(a.label||"").slice(0,80)};});
  return{reflections:reflections.slice(-520),alarms:alarms.slice(0,40),resets:resets.slice(-500),tries:tries.slice(-500),planLog:planLog.slice(-300),planMoves:planMoves.slice(-60),skipped:given.tries.length-tries.length+given.planLog.length-planLog.length+given.planMoves.length-planMoves.length+given.reflections.length-reflections.length+given.alarms.length-alarms.length+given.resets.length-resets.length};
 }
 root.Backup={protect:protect,unprotect:unprotect,isProtected:isProtected,clean:clean};
})(globalThis);
