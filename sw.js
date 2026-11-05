const BRIEF="even-brief";const CACHE="even-shell-v2.14.0";const SHELL=["/","/index.html","/styles.css","/app.js","/reminders.js","/onboarding.js","/intake.js","/coach.js","/refresh.js","/invites.js","/manifest.webmanifest","/icon.svg","/icon-192.png","/icon-512.png"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==BRIEF).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
// Always prefer the network so the page and its scripts stay on one version. The cache serves offline and very slow starts.
self.addEventListener("fetch",event=>{
 const request=event.request;const url=new URL(request.url);
 if(request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
 const key=request.mode==="navigate"?"/":request;
 const online=fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(key,copy)));}return response;});
 event.respondWith(new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>caches.match(key).then(cached=>{if(cached)resolve(cached);}),3000);
  online.then(response=>{clearTimeout(timer);resolve(response);}).catch(()=>{clearTimeout(timer);caches.match(key).then(cached=>cached?resolve(cached):reject(new Error("Offline")));});
 }));
});
function anticipation(at,fallback){
 return caches.open(BRIEF).then(c=>c.match("/anticipate")).then(r=>r?r.json():{}).then(all=>all[at]||fallback).catch(()=>fallback);
}
function todaysBrief(fallback){
 const now=new Date(),day=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
 return caches.open(BRIEF).then(c=>c.match("/brief")).then(r=>r?r.json():{}).then(b=>b[day]||fallback).catch(()=>fallback);
}
self.addEventListener("push",event=>{
 let message={};try{message=event.data.json();}catch(e){}
 const notification=message.notification||{},fallback=notification.body||"How are you feeling?",url=notification.navigate||"/#checkin";
 event.waitUntil((message.stressAt?anticipation(message.stressAt,fallback):message.brief?todaysBrief(fallback):Promise.resolve(fallback)).then(body=>self.registration.showNotification(notification.title||"Even",{body,icon:"/icon-192.png",data:{url}})));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const url=(event.notification.data&&event.notification.data.url)||"/#checkin";
 event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{
  const open=windows[0];
  return open?open.focus().then(client=>client.navigate(url)):self.clients.openWindow(url);
 }));
});
