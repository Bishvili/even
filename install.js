// Safari and a Home Screen app keep separate sign-ins on iOS. A one-time code in the address iOS saves with the icon carries the sign-in across.
(function(root){
 var asking=false,PARAM="pass",FRESH_MS=25*60*1000,STAMP="health-install-code-at";
 function given(){return new URLSearchParams(location.search).get(PARAM);}
 function inSafari(){return navigator.standalone===false;}
 function stampedAt(){try{return Number(sessionStorage.getItem(STAMP))||0;}catch(e){return 0;}}
 // Signed in on the install page: put a fresh code in the address before the person adds the icon.
 function prepare(signedIn){
  if(!signedIn||asking||!inSafari()||!navigator.onLine)return;
  if(given()&&Date.now()-stampedAt()<FRESH_MS)return;
  asking=true;
  fetch("/api/user/install-code",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"})
   .then(function(r){if(!r.ok)throw Error();return r.json();})
   .then(function(data){
    try{sessionStorage.setItem(STAMP,String(Date.now()));}catch(e){/* The code is then just asked for again on return. */}
    location.replace(root.Look.url(root.Look.saved(),root.Look.savedName(),data.code)+location.hash);
   })
   .catch(function(){asking=false;});
 }
 // The address stays with the icon for good, so a used code just does nothing. It's taken out of the page either way.
 function redeem(){
  var code=given();
  if(!code||inSafari())return Promise.resolve(false);
  var url=new URL(location.href);url.searchParams.delete(PARAM);history.replaceState(null,"",url.pathname+url.search+url.hash);
  return fetch("/api/signin/install/redeem",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:code}),cache:"no-store"})
   .then(function(r){return r.ok;},function(){return false;});
 }
 root.Install={prepare:prepare,redeem:redeem};
})(globalThis);
