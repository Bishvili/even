// Planning something enjoyable or meaningful, the core of behavioral activation: three quick questions lead to ideas,
// a chosen one goes on the calendar, and later offers start from what the person has done before.
(function(root){
 "use strict";
 var DAY_MS=86400000,FAVORITES=3,IDEAS=5;
 var KINDS=[["people","Being with people"],["move","Moving your body"],["outside","Being outside"],["make","Making or fixing things"],["play","Playing or learning"],["calm","Quiet time"],["help","Helping someone"]];
 var TIMES=[[10,"10 minutes"],[30,"Half an hour"],[60,"An hour or more"]];
 var ENERGY=[[1,"Low"],[2,"Some"],[3,"Plenty"]];
 // Ideas that suit a hard day: small, concrete and doable. Calming and playful ones are favored over vigorous solo exercise.
 var CATALOG=[
  ["walk-outside","Take a short walk outside",["move","outside"],10,1],
  ["daylight","Get some daylight, even for a few minutes",["outside","calm"],10,1],
  ["text-friend","Call or text someone you like",["people"],10,1],
  ["stretch","Stretch or do some gentle yoga",["move","calm"],10,1],
  ["tidy","Tidy one small space",["make"],10,1],
  ["pet","Spend time with a pet",["calm"],10,1],
  ["dance","Put on a song and dance",["move","play"],10,2],
  ["kind-act","Do something kind for someone",["help","people"],10,1],
  ["curious","Look up something you’re curious about",["play"],10,1],
  ["album","Listen to music you love, without doing anything else",["calm","play"],30,1],
  ["park","Sit in a park or garden",["outside","calm"],30,1],
  ["read","Read something you enjoy",["calm","play"],30,1],
  ["bath","Take a warm bath or shower",["calm"],30,1],
  ["draw","Draw, paint or doodle",["make","play"],30,1],
  ["plan-day","Plan a day out you’d look forward to",["play"],30,1],
  ["plant","Look after a plant or garden",["outside","make"],30,2],
  ["game","Play a game with someone",["people","play"],30,2],
  ["photo-walk","Take a walk and photograph what you like",["outside","make","move"],30,2],
  ["help-task","Help someone with something they need",["help","people"],30,2],
  ["cook","Cook something you enjoy",["make"],60,2],
  ["bake","Bake something to share",["make","help"],60,2],
  ["friend-meet","Meet a friend for coffee or a meal",["people"],60,2],
  ["outing","Visit a museum, library or market",["outside","play"],60,2],
  ["fix","Fix or build something",["make"],60,2],
  ["sport","Play a sport or ball game with others",["move","people","play"],60,3],
  ["class","Try a class, like dance or climbing",["move","people","play"],60,3],
  ["bike","Go for a bike ride somewhere pleasant",["move","outside"],60,3],
  ["volunteer","Volunteer or help a neighbor",["help","people"],60,3]
 ].map(function(row){return{id:row[0],title:row[1],kinds:row[2],minutes:row[3],energy:row[4]};});

 function plannedTimes(a){return(a.planned||[]).map(Date.parse).filter(Number.isFinite);}
 // Ideas that fit the answers, best matches first. Already-saved ideas are left out, so each round offers something new.
 function ideas(answers,saved,offset){
  var wanted=answers.kinds||[],have={};(saved||[]).forEach(function(a){have[a.title.toLowerCase()]=true;});
  var fits=CATALOG.filter(function(item){return item.minutes<=answers.minutes&&item.energy<=answers.energy&&!have[item.title.toLowerCase()];});
  fits.forEach(function(item){item.score=item.kinds.filter(function(k){return wanted.indexOf(k)>=0;}).length*2+(item.minutes===answers.minutes?1:0);});
  var ranked=fits.filter(function(item){return !wanted.length||item.score>=2;}).sort(function(a,b){return b.score-a.score||CATALOG.indexOf(a)-CATALOG.indexOf(b);});
  var start=(offset||0)%Math.max(1,ranked.length);
  return ranked.slice(start,start+IDEAS).concat(start?ranked.slice(0,Math.max(0,start+IDEAS-ranked.length)):[]).slice(0,IDEAS);
 }
 // What the person has done before comes first, then what they chose most recently.
 function favorites(saved){
  return(saved||[]).slice().sort(function(a,b){return(b.done||[]).length-(a.done||[]).length||Date.parse(b.at)-Date.parse(a.at);}).slice(0,FAVORITES);
 }
 // A planned time that has passed today and hasn't been answered.
 function due(saved,now){
  var t=now.getTime(),start=new Date(now);start.setHours(0,0,0,0);var found=null;
  (saved||[]).forEach(function(a){plannedTimes(a).forEach(function(at){if(at<=t&&at>=start.getTime()&&(!found||at>found.at))found={activity:a,at:at};});});
  return found;
 }
 // Something already planned for later today or tomorrow, so there's no need to offer more.
 function upcoming(saved,now){
  var t=now.getTime(),end=new Date(now);end.setHours(0,0,0,0);end=end.getTime()+2*DAY_MS;
  return(saved||[]).some(function(a){return plannedTimes(a).some(function(at){return at>t&&at<end;});});
 }
 function stamp(date){var pad=function(n){return String(n).padStart(2,"0");};return date.getFullYear()+pad(date.getMonth()+1)+pad(date.getDate())+"T"+pad(date.getHours())+pad(date.getMinutes());}
 function calendarAddress(origin,title,at,minutes,installed){
  return(installed?"x-safari-":"")+origin+"/api/plan.ics?title="+encodeURIComponent(title)+"&start="+stamp(at)+"&minutes="+minutes;
 }
 var api={KINDS:KINDS,CATALOG:CATALOG,ideas:ideas,favorites:favorites,due:due,upcoming:upcoming,stamp:stamp,calendarAddress:calendarAddress};
 root.Activities=api;
 if(typeof document==="undefined"||!root.App)return;

 var answers={kinds:[],minutes:30,energy:2},offset=0,chosen=null;
 function $(id){return document.getElementById(id);}
 function app(){return root.App;}
 function element(tag,className,text){var e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
 function pane(name){["activity-questions","activity-ideas","activity-plan"].forEach(function(id){$(id).hidden=id!=="activity-"+name;});var h=$("activity-"+name).querySelector("h2");if(h)h.focus({preventScroll:true});}
 function choices(box,options,name,multi){
  box.textContent="";
  options.forEach(function(option){
   var label=element("label","activity-choice"),input=element("input"),text=element("span","",option[1]);
   input.type=multi?"checkbox":"radio";input.name=name;input.value=String(option[0]);
   label.appendChild(input);label.appendChild(text);box.appendChild(label);
  });
 }
 function readAnswers(){
  var kinds=[].map.call(document.querySelectorAll('input[name="activity-kind"]:checked'),function(i){return i.value;});
  var minutes=document.querySelector('input[name="activity-time"]:checked'),energy=document.querySelector('input[name="activity-energy"]:checked');
  return{kinds:kinds,minutes:minutes?Number(minutes.value):30,energy:energy?Number(energy.value):2};
 }
 function minutesLabel(n){return n>=60?"An hour":n+" min";}
 function showIdeas(){
  var list=$("activity-idea-list"),found=ideas(answers,app().activities(),offset);list.textContent="";
  $("activity-ideas-empty").hidden=!!found.length;
  found.forEach(function(item){
   var row=element("button","activity-idea"),title=element("strong","",item.title),meta=element("small","",minutesLabel(item.minutes));
   row.type="button";row.appendChild(title);row.appendChild(meta);row.addEventListener("click",function(){plan({title:item.title,kinds:item.kinds,minutes:item.minutes});});
   list.appendChild(row);
  });
  pane("ideas");
 }
 function defaultTime(){var d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+(d.getMinutes()>30?2:1));if(d.getHours()>=21||d.getHours()<7){d.setDate(d.getDate()+(d.getHours()>=21?1:0));d.setHours(10);}return d;}
 function dateValue(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
 function plan(item){
  chosen=item;var at=defaultTime();
  $("activity-plan-title").textContent=item.title;
  $("activity-plan-date").value=dateValue(at);$("activity-plan-time").value=String(at.getHours()).padStart(2,"0")+":00";
  $("activity-plan-length").textContent=minutesLabel(item.minutes);
  if(!$("activity-sheet").open)$("activity-sheet").showModal();
  pane("plan");
 }
 function pickedTime(){
  var date=$("activity-plan-date").value,time=$("activity-plan-time").value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return null;
  var at=new Date(date+"T"+time+":00");return Number.isFinite(at.getTime())?at:null;
 }
 function addToCalendar(){
  var at=pickedTime();
  if(!at){app().data.toast("Choose a day and time first.");return;}
  if(at.getTime()<Date.now()-60000){app().data.toast("Choose a time that hasn’t passed.");return;}
  app().saveActivity(chosen,at);$("activity-sheet").close();
  if(!navigator.onLine){app().data.toast("Saved. You’re offline, so add it to your calendar once you’re back online.");return;}
  window.location.href=calendarAddress(location.origin,chosen.title,at,chosen.minutes,app().isInstalled());
 }
 function saveForLater(){app().saveActivity(chosen,null);$("activity-sheet").close();app().data.toast("Saved to your activities.");}
 function open(){
  offset=0;answers={kinds:[],minutes:30,energy:2};
  document.querySelectorAll('#activity-questions input').forEach(function(i){i.checked=(i.name==="activity-time"&&i.value==="30")||(i.name==="activity-energy"&&i.value==="2");});
  $("activity-own").value="";
  $("activity-sheet").showModal();pane("questions");
 }
 function init(){
  choices($("activity-kinds"),KINDS,"activity-kind",true);
  choices($("activity-times"),TIMES,"activity-time",false);
  choices($("activity-energies"),ENERGY,"activity-energy",false);
  $("activity-kinds").addEventListener("change",function(event){
   var picked=document.querySelectorAll('input[name="activity-kind"]:checked');
   if(picked.length>3){event.target.checked=false;app().data.toast("Choose up to 3.");}
  });
  $("activity-questions").addEventListener("submit",function(event){event.preventDefault();answers=readAnswers();offset=0;showIdeas();});
  $("activity-more").addEventListener("click",function(){offset+=IDEAS;showIdeas();});
  $("activity-own-form").addEventListener("submit",function(event){
   event.preventDefault();var title=$("activity-own").value.trim().replace(/\s+/g," ").slice(0,80);
   if(!title){app().data.toast("Write what you’d like to do.");return;}
   plan({title:title,kinds:answers.kinds,minutes:answers.minutes});
  });
  $("activity-back").addEventListener("click",function(){pane(chosen&&$("activity-idea-list").childElementCount?"ideas":"questions");});
  $("activity-calendar").addEventListener("click",addToCalendar);
  $("activity-later").addEventListener("click",saveForLater);
  document.querySelectorAll("[data-activity-close]").forEach(function(button){button.addEventListener("click",function(){$("activity-sheet").close();});});
  $("open-activity").addEventListener("click",open);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
 api.open=open;api.plan=plan;
})(globalThis);
