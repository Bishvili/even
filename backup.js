// Optional passphrase protection for backup files. The passphrase is never stored or sent.
(function(root){
 "use strict";
 var ROUNDS=310000;
 function toBase64(bytes){return btoa(String.fromCharCode.apply(null,new Uint8Array(bytes)));}
 function fromBase64(text){return Uint8Array.from(atob(text),function(c){return c.charCodeAt(0);});}
 async function keyFor(passphrase,salt,rounds){
  var base=await crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt:salt,iterations:rounds},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 }
 async function protect(text,passphrase){
  var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  var sealed=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},await keyFor(passphrase,salt,ROUNDS),new TextEncoder().encode(text));
  return JSON.stringify({app:"Even",protected:true,rounds:ROUNDS,salt:toBase64(salt),iv:toBase64(iv),data:toBase64(sealed)});
 }
 function isProtected(backup){return !!backup&&backup.app==="Even"&&backup.protected===true;}
 // Throws when the passphrase is wrong or the file was changed.
 async function unprotect(backup,passphrase){
  var opened=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64(backup.iv)},await keyFor(passphrase,fromBase64(backup.salt),backup.rounds),fromBase64(backup.data));
  return new TextDecoder().decode(opened);
 }
 root.EvenBackup={protect:protect,unprotect:unprotect,isProtected:isProtected};
})(globalThis);
