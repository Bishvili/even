// iOS can pin fixed elements to a layout that no longer matches what's on screen, so the tab bar drifts up as the page scrolls.
// This compares the bar with the visible area and moves it back.
(function(root){
 "use strict";
 // How far the bar's natural position sits above the bottom of the visible area. The keyboard only makes that negative, so it's left alone.
 function barGap(barBottom,visibleBottom){
  var gap=visibleBottom-barBottom;
  return gap>1?Math.round(gap):0;
 }
 var api={barGap:barGap};
 root.EvenViewport=api;
 if(typeof document==="undefined")return;

 var nav=document.querySelector(".bottom-nav"),style=document.documentElement.style,applied=0,queued=false;
 function align(){
  queued=false;
  var view=root.visualViewport,visibleBottom=view?view.height+view.offsetTop:root.innerHeight;
  var gap=barGap(nav.getBoundingClientRect().bottom-applied,visibleBottom);
  if(gap===applied)return;
  applied=gap;
  style.setProperty("--viewport-gap",gap+"px");
 }
 function queue(){if(!queued){queued=true;root.requestAnimationFrame(align);}}
 root.addEventListener("scroll",queue,{passive:true});
 root.addEventListener("resize",queue);
 root.addEventListener("pageshow",queue);
 root.addEventListener("orientationchange",queue);
 document.addEventListener("visibilitychange",function(){if(!document.hidden)queue();});
 if(root.visualViewport){root.visualViewport.addEventListener("scroll",queue);root.visualViewport.addEventListener("resize",queue);}
 align();
})(globalThis);
