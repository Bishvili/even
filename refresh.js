// Pull down to refresh, or keep pulling to run Even Sync.
(function(){
 var app=globalThis.EvenApp,REFRESH_AT=70,RUN_AT=170,MAX_SHIFT=150,RING=75.4;
 var indicator=document.getElementById("pull-indicator"),label=document.getElementById("pull-label"),ring=document.getElementById("pull-ring");
 var page=[document.querySelector(".topbar"),document.getElementById("main")];
 var startX=0,startY=0,distance=0,tracking=false,pulling=false;

 function canRun(){return !!app.deviceToken();}
 function stage(){return distance>=RUN_AT&&canRun()?"run":distance>=REFRESH_AT?"refresh":"pull";}
 function shift(value,settling){page.forEach(function(part){part.classList.toggle("pull-settling",settling);part.style.transform=value?"translateY("+value+"px)":"";});}
 function paint(){
  var current=stage(),limit=canRun()?RUN_AT:REFRESH_AT;
  label.textContent=current==="run"?"Release to run Even Sync":current==="refresh"?(canRun()?"Release to refresh. Keep pulling to run Even Sync.":"Release to refresh"):"Pull to refresh";
  ring.style.strokeDashoffset=String(RING*(1-Math.min(distance/limit,1)));
  indicator.classList.toggle("run",current==="run");
  indicator.style.opacity=String(Math.min(distance/40,1));
  shift(Math.min(distance*0.5,MAX_SHIFT),false);
 }
 function reset(){tracking=false;pulling=false;distance=0;indicator.hidden=true;indicator.classList.remove("run");shift(0,true);}
 function eligible(event){
  return event.touches.length===1&&window.scrollY<=0&&!document.querySelector("dialog[open]")&&!event.target.closest("input,textarea,select,.bottom-nav");
 }
 document.addEventListener("touchstart",function(event){
  tracking=false;
  if(!eligible(event))return;
  tracking=true;startX=event.touches[0].clientX;startY=event.touches[0].clientY;
 },{passive:true});
 document.addEventListener("touchmove",function(event){
  if(!tracking)return;
  var dx=event.touches[0].clientX-startX,dy=event.touches[0].clientY-startY;
  if(!pulling&&(dy<8||Math.abs(dx)>dy)){if(dy<-8||Math.abs(dx)>12)tracking=false;return;}
  pulling=true;event.preventDefault();
  distance=Math.max(0,dy);
  indicator.hidden=false;paint();
 },{passive:false});
 document.addEventListener("touchend",function(){
  if(!pulling){tracking=false;return;}
  var current=stage();reset();
  if(current==="run")app.runShortcut();
  else if(current==="refresh")app.refresh();
 });
 document.addEventListener("touchcancel",function(){if(pulling)reset();tracking=false;});
})();
