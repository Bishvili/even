// Pull down to refresh, or keep pulling to run Even Sync.
(function(){
 var app=globalThis.EvenApp,REFRESH_AT=70,RUN_AT=170;
 var indicator=document.getElementById("pull-indicator"),label=document.getElementById("pull-label"),meter=document.getElementById("pull-meter");
 var startX=0,startY=0,distance=0,tracking=false,pulling=false;

 function stage(){return distance>=RUN_AT?"run":distance>=REFRESH_AT?"refresh":"pull";}
 function canRun(){return !!app.deviceToken();}
 function paint(){
  var current=stage();
  label.textContent=current==="run"&&canRun()?"Release to run Even Sync":current==="pull"?"Pull to refresh":canRun()?"Release to refresh, or keep pulling to run Even Sync":"Release to refresh";
  meter.style.transform="scaleX("+Math.min(distance/RUN_AT,1)+")";
  indicator.style.transform="translate(-50%,"+Math.min(distance,RUN_AT)*0.5+"px)";
  indicator.classList.toggle("ready",current!=="pull");
  indicator.classList.toggle("run",current==="run"&&canRun());
 }
 function reset(){tracking=false;pulling=false;distance=0;indicator.hidden=true;indicator.style.transform="";}
 function eligible(event){
  return event.touches.length===1&&window.scrollY<=0&&!document.querySelector("dialog[open]")&&!event.target.closest("input,textarea,select,.bottom-nav");
 }
 document.addEventListener("touchstart",function(event){
  reset();
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
  if(current==="run"&&canRun())app.runShortcut();
  else if(current!=="pull")app.refresh();
 });
 document.addEventListener("touchcancel",reset);
})();
