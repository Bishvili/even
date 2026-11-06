// The app fills the screen and only its page scrolls. iOS sometimes pans the document or leaves the viewport short after the
// keyboard closes or the app returns, which hides the header under the status bar and leaves a gap below the tab bar.
// This puts it back, and keeps the last fix so Developer tools and feedback can say what caused it.
(function(root){
 "use strict";
 var tallest={},last=null,timer=null;
 function standalone(){return navigator.standalone===true||matchMedia("(display-mode: standalone)").matches;}
 function orientation(){return innerWidth>innerHeight?"wide":"tall";}
 function typing(){var a=document.activeElement;return !!(a&&a.matches&&a.matches("input:not([type=checkbox]):not([type=radio]):not([type=range]),textarea,select,[contenteditable]"));}
 function measure(){var o=orientation();tallest[o]=Math.max(tallest[o]||0,innerHeight);}
 // Hiding and showing the full-height shell makes WebKit measure the viewport again.
 function remeasure(){
  var app=document.querySelector(".app"),page=document.getElementById("page");if(!app)return;
  var top=page?page.scrollTop:0;app.style.display="none";void app.offsetHeight;app.style.display="";if(page)page.scrollTop=top;
 }
 function note(){
  var line=document.getElementById("layout-note");if(!line||!last)return;
  line.hidden=false;line.textContent="Last layout fix: "+new Date(last.at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})+", after "+last.trigger+" · "+summary(last);
 }
 function summary(fix){return "height "+fix.innerHeight+" of "+fix.tallest+", shifted "+fix.shifted+", viewport "+fix.viewportHeight+" at "+fix.offsetTop;}
 function check(trigger){
  if(typing())return;
  var doc=document.scrollingElement||document.documentElement,vv=root.visualViewport,o=orientation();
  var shifted=Math.round(Math.max(doc.scrollTop||0,root.scrollY||0)),offset=vv?Math.round(vv.offsetTop):0,short=standalone()&&(tallest[o]||innerHeight)-innerHeight>4;
  if(!shifted&&!short&&offset<=1){measure();return;}
  last={at:new Date().toISOString(),trigger:trigger,innerHeight:innerHeight,tallest:tallest[o]||innerHeight,shifted:shifted,viewportHeight:vv?Math.round(vv.height):null,offsetTop:offset};
  if(shifted||offset>1){root.scrollTo(0,0);doc.scrollTop=0;}
  if(short)remeasure();
  note();
 }
 function soon(trigger){clearTimeout(timer);timer=setTimeout(function(){check(trigger);},160);}
 // Scrolls the page, never the document, so an item sits just below the jump row.
 function reveal(element){
  var page=document.getElementById("page");if(!page||!element)return;
  var bar=page.querySelector(".view.active > .jump-bar"),edge=(bar?bar.getBoundingClientRect().height:0)+8;
  page.scrollTop+=element.getBoundingClientRect().top-page.getBoundingClientRect().top-edge;
 }
 measure();
 document.addEventListener("focusout",function(){soon("the keyboard closed");});
 document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")soon("returning to the app");});
 root.addEventListener("pageshow",function(){soon("opening");});
 root.addEventListener("resize",function(){soon("a resize");});
 if(root.visualViewport)root.visualViewport.addEventListener("resize",function(){soon("a resize");});
 root.addEventListener("orientationchange",function(){soon("a rotation");});
 root.Viewport={check:check,reveal:reveal,last:function(){return last;},summary:function(){return last?last.trigger+", "+summary(last):"None";}};
})(globalThis);
