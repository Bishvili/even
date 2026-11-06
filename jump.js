// A row at the top of each tab that jumps to its cards, because the tabs are long.
(function(){
 var page=null,ticking=false,MIN=3;
 function bar(view){return view.querySelector(":scope > .jump-bar");}
 function targets(view){
  // A heading inside a collapsed disclosure still gets a chip, and jumping there opens it.
  return Array.prototype.filter.call(view.querySelectorAll("h2"),function(heading){return heading.textContent.trim()&&(heading.offsetParent!==null||shut(heading));}).map(function(heading){
   return {heading:heading,box:heading.closest(".card,.section-heading,details")||heading,label:heading.getAttribute("data-jump")||heading.textContent.trim()};
  });
 }
 function shut(heading){var d=heading.closest("details:not([open])");return !!d&&!heading.closest("[hidden]")&&d.querySelector(":scope > summary").offsetParent!==null;}
 function inset(row){return parseFloat(getComputedStyle(row).top)||0;}
 function go(row,item){
  for(var d=item.heading.closest("details:not([open])");d;d=d.parentElement&&d.parentElement.closest("details:not([open])"))d.open=true;
  var edge=row.getBoundingClientRect().height+inset(row)+8,top=page.scrollTop+item.box.getBoundingClientRect().top-page.getBoundingClientRect().top-edge;
  page.scrollTo({top:top,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  item.heading.setAttribute("tabindex","-1");item.heading.focus({preventScroll:true});
 }
 function refresh(){
  page=page||document.getElementById("page");
  Array.prototype.forEach.call(document.querySelectorAll(".view"),function(view){
   if(!view.classList.contains("active"))return;
   var items=targets(view),row=bar(view),key=items.map(function(item){return item.label;}).join("|");
   if(items.length<MIN){if(row)row.remove();return;}
   if(!row){row=document.createElement("nav");row.className="jump-bar";row.setAttribute("aria-label","Jump to");view.insertBefore(row,view.firstChild);}
   row.items=items;
   if(row.getAttribute("data-key")===key)return;
   row.setAttribute("data-key",key);row.textContent="";
   items.forEach(function(item,index){
    var button=document.createElement("button");button.type="button";button.className="jump-chip";button.textContent=item.label;
    var moved=false;
    button.addEventListener("touchstart",function(){moved=false;},{passive:true});
    button.addEventListener("touchmove",function(){moved=true;},{passive:true});
    // A tap during momentum scrolling produces no click.
    button.addEventListener("touchend",function(event){if(!moved){event.preventDefault();go(row,row.items[index]);}});
    button.addEventListener("click",function(){go(row,row.items[index]);});
    row.appendChild(button);
   });
  });
  mark();
 }
 function mark(){
  ticking=false;
  var view=document.querySelector(".view.active"),row=view&&bar(view);
  if(!row||!row.items)return;
  var line=row.getBoundingClientRect().bottom+24,at=0;
  row.classList.toggle("stuck",row.getBoundingClientRect().top<=inset(row)+1&&page.scrollTop>0);
  row.items.forEach(function(item,index){if(item.box.getBoundingClientRect().top<=line)at=index;});
  Array.prototype.forEach.call(row.children,function(chip,index){
   var on=index===at&&page.scrollTop>0;
   if(on&&!chip.classList.contains("on"))row.scrollTo({left:chip.offsetLeft-(row.clientWidth-chip.offsetWidth)/2});
   chip.classList.toggle("on",on);
  });
 }
 document.addEventListener("DOMContentLoaded",function(){
  page=document.getElementById("page");
  if(page)page.addEventListener("scroll",function(){if(!ticking){ticking=true;requestAnimationFrame(mark);}},{passive:true});
 });
 globalThis.Jump={refresh:refresh};
})();
