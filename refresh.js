// Pull down to refresh, or keep pulling to run Even Sync.
(function(){
 var app=globalThis.EvenApp,REFRESH_AT=70,RUN_AT=170,MAX_SHIFT=150,LINE_DONE=REFRESH_AT/0.9,SUN_DEPTH=170;
 var indicator=document.getElementById("pull-indicator"),label=document.getElementById("pull-label"),line=document.getElementById("pull-line"),sun=document.getElementById("pull-sun");
 var page=[document.querySelector(".topbar"),document.getElementById("main")];
 var startX=0,startY=0,distance=0,tracking=false,pulling=false;

 function canRun(){return !!app.deviceToken();}
 function stage(){return distance>=RUN_AT&&canRun()?"run":distance>=REFRESH_AT?"refresh":"pull";}
 function shift(value,settling){page.forEach(function(part){part.classList.toggle("pull-settling",settling);part.style.transform=value?"translateY("+value+"px)":"";});}
 function paint(){
  var current=stage(),rise=canRun()?Math.max(0,Math.min((distance-LINE_DONE)/(RUN_AT-LINE_DONE),1)):0;
  label.textContent=current==="run"?"Release to run Even Sync":current==="refresh"?(canRun()?"Release to refresh. Keep pulling to run Even Sync.":"Release to refresh"):"Pull to refresh";
  // The horizon draws first, then the sun rises above it until the Shortcut is ready.
  line.style.strokeDashoffset=String(1-Math.min(distance/LINE_DONE,1));
  sun.setAttribute("transform","translate(0 "+SUN_DEPTH*(1-rise)+")");
  indicator.style.opacity=String(Math.min(distance/40,1));
  shift(Math.min(distance*0.7,MAX_SHIFT),false);
 }
 function reset(){tracking=false;pulling=false;distance=0;indicator.hidden=true;shift(0,true);}
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
