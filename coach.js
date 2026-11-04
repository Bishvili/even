// Daily brief, weekly outlook, patterns, reset exercise and support.
(function(root){
 var DAY_MS=86400000,DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
 var MIN_SAMPLES=3,MIN_GAP=0.4,HISTORY_DAYS=56,NEAR_EVENT_MS=5400000,SHORT_SLEEP=6.5;
 var BRIEF_CACHE="even-brief",DEFAULT_ACTION="Leave room for a short reset today.";

 function mean(values){return values.reduce(function(a,b){return a+b;},0)/values.length;}
 function localDay(date){var d=new Date(date);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
 function rated(moods){return moods.filter(function(m){return Number.isInteger(m.stress)&&m.stress>=1&&m.stress<=5;});}

 function outlook(moods,today){
  var start=new Date(today);start.setHours(0,0,0,0);
  var history=rated(moods).filter(function(m){var t=new Date(m.ts).getTime();return t>=start.getTime()-HISTORY_DAYS*DAY_MS&&t<=new Date(today).getTime();});
  var overall=history.length?mean(history.map(function(m){return m.stress;})):NaN;
  var days=[];
  for(var i=0;i<7;i++){
   var date=new Date(start);date.setDate(start.getDate()+i);
   var values=history.filter(function(m){return new Date(m.ts).getDay()===date.getDay();}).map(function(m){return m.stress;});
   var level="unknown";
   if(values.length>=MIN_SAMPLES){var gap=mean(values)-overall;level=gap>=MIN_GAP?"harder":gap<=-MIN_GAP?"easier":"typical";}
   days.push({date:localDay(date),name:DAYS[date.getDay()],samples:values.length,level:level});
  }
  return days;
 }

 function comparison(label,yes,no){
  if(yes.length<MIN_SAMPLES||no.length<MIN_SAMPLES)return null;
  return{label:label,gap:mean(yes)-mean(no),withCount:yes.length,withoutCount:no.length};
 }
 function patterns(moods,events,health){
  var checked=rated(moods),rows=[],tags={},categories={};
  checked.forEach(function(m){(m.tags||[]).forEach(function(t){tags[t]=true;});});
  events.forEach(function(e){if(e.category)categories[e.category]=true;});
  Object.keys(tags).forEach(function(tag){
   var yes=[],no=[];checked.forEach(function(m){((m.tags||[]).indexOf(tag)>=0?yes:no).push(m.stress);});
   rows.push(comparison(tag,yes,no));
  });
  Object.keys(categories).forEach(function(category){
   var spans=events.filter(function(e){return e.category===category;}).map(function(e){return[new Date(e.start).getTime(),new Date(e.end).getTime()+NEAR_EVENT_MS];});
   var yes=[],no=[];
   checked.forEach(function(m){var t=new Date(m.ts).getTime();(spans.some(function(s){return t>=s[0]&&t<=s[1];})?yes:no).push(m.stress);});
   rows.push(comparison("Around "+category.toLowerCase()+" events",yes,no));
  });
  var sleep={};health.forEach(function(h){if(Number.isFinite(Number(h.sleepHours))&&h.sleepHours!==null&&h.sleepHours!=="")sleep[h.date]=Number(h.sleepHours);});
  var short=[],rested=[];
  checked.forEach(function(m){var hours=sleep[localDay(m.ts)];if(hours===undefined)return;(hours<SHORT_SLEEP?short:rested).push(m.stress);});
  rows.push(comparison("After under 6.5 hours of sleep",short,rested));
  return rows.filter(function(r){return r&&r.gap>=0.3;}).sort(function(a,b){return b.gap-a.gap;}).slice(0,5);
 }

 function brief(day){
  if(day.level==="harder")return day.name+"s have tended to be harder for you. "+DEFAULT_ACTION;
  if(day.level==="easier")return day.name+"s have tended to be easier for you. A good day to keep some of that calm.";
  if(day.level==="typical")return day.name+"s have tended to be about average for you.";
  return "Keep checking in. A few more "+day.name+"s will show your pattern.";
 }
 function hardStretch(moods,today){
  var cutoff=new Date(today).getTime()-4*DAY_MS,hard={};
  rated(moods).forEach(function(m){if(m.stress>=4&&new Date(m.ts).getTime()>=cutoff)hard[localDay(m.ts)]=true;});
  return Object.keys(hard).length>=3;
 }

 var REFLECTION=[
  {id:"snapped",text:"How often did you snap or lose your temper?",options:["Never","Rarely","Sometimes","Often","Very often"],reverse:true},
  {id:"setOff",text:"How often did small things set you off?",options:["Never","Rarely","Sometimes","Often","Very often"],reverse:true},
  {id:"recovered",text:"How easily did you settle after a hard moment?",options:["Not at all","A little","Somewhat","Mostly","Very easily"]},
  {id:"rested",text:"How rested did you feel on most days?",options:["Not at all","A little","Somewhat","Mostly","Very rested"]}
 ];
 function steadiness(answers){
  var total=0;
  for(var i=0;i<REFLECTION.length;i++){
   var q=REFLECTION[i],a=answers[q.id];
   if(!Number.isInteger(a)||a<0||a>4)return null;
   total+=q.reverse?4-a:a;
  }
  return Math.round(total/(REFLECTION.length*4)*100);
 }
 function reflectionDue(reflections,today){
  if(!reflections.length)return true;
  var last=Math.max.apply(null,reflections.map(function(r){return new Date(r.ts).getTime();}));
  return new Date(today).getTime()-last>=7*DAY_MS;
 }

 function minutesOf(time){var p=time.split(":");return Number(p[0])*60+Number(p[1]);}
 function timeOf(minutes){return String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0");}
 // Spreads reminders across the window, favoring the times check-ins usually happen.
 function smartTimes(moods,from,to,count,today){
  var start=minutesOf(from),end=minutesOf(to),cutoff=new Date(today).getTime()-30*DAY_MS,buckets={},times=[];
  if(end<=start)return[];
  moods.forEach(function(m){
   var d=new Date(m.ts);if(d.getTime()<cutoff)return;
   var at=Math.floor((d.getHours()*60+d.getMinutes())/30)*30;buckets[at]=(buckets[at]||0)+1;
  });
  var span=(end-start)/count;
  for(var i=0;i<count;i++){
   var low=start+span*i,high=low+span,best=null;
   Object.keys(buckets).map(Number).forEach(function(at){if(at>=low&&at<high&&(best===null||buckets[at]>buckets[best]))best=at;});
   times.push(timeOf(best===null?Math.round((low+span/2)/5)*5:best));
  }
  return times.filter(function(t,n){return times.indexOf(t)===n;});
 }
 function median(values){var sorted=values.slice().sort(function(a,b){return a-b;});return sorted[Math.floor(sorted.length/2)];}
 // Times after midnight count as late evening, so 00:30 sorts after 23:30.
 function nightMinutes(minutes){return minutes<720?minutes+1440:minutes;}
 // Prefers recorded sleep, then the last check-in of each day, then the end of the window.
 function bedtimeReminder(health,moods,to,today){
  var cutoff=new Date(today).getTime()-14*DAY_MS,slept=[],lastByDay={},estimate;
  health.forEach(function(h){if(Number.isFinite(h.bedtimeMin)&&new Date(h.date+"T12:00:00").getTime()>=cutoff)slept.push(nightMinutes(h.bedtimeMin));});
  moods.forEach(function(m){var d=new Date(m.ts);if(d.getTime()<cutoff)return;var key=localDay(d),at=nightMinutes(d.getHours()*60+d.getMinutes());if(!lastByDay[key]||at>lastByDay[key])lastByDay[key]=at;});
  var evenings=Object.keys(lastByDay).map(function(k){return lastByDay[k];}).filter(function(at){return at>=1080;});
  if(slept.length>=3)estimate=median(slept);
  else if(evenings.length>=5)estimate=median(evenings)+30;
  else estimate=nightMinutes(minutesOf(to));
  return timeOf((estimate-20+1440)%1440);
 }
 function repeatTimes(from,to,everyHours){
  var times=[],end=minutesOf(to);
  for(var at=minutesOf(from);at<=end;at+=everyHours*60)times.push(timeOf(at));
  return times;
 }

 var api={bedtimeReminder:bedtimeReminder,smartTimes:smartTimes,repeatTimes:repeatTimes,outlook:outlook,patterns:patterns,brief:brief,hardStretch:hardStretch,steadiness:steadiness,reflectionDue:reflectionDue,REFLECTION:REFLECTION};
 root.EvenCoach=api;
 if(typeof document==="undefined"||!root.EvenApp)return;

 var LEVELS={harder:"Tends to be harder",easier:"Tends to be easier",typical:"About average",unknown:"Not enough check-ins"};
 var reflectionSnoozed=false;
 var STEPS=["Breathe in","Hold","Breathe out","Hold"],breathTimer=null;
 function $(id){return document.getElementById(id);}
 function element(tag,className,text){var e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}

 function saveBriefs(days){
  if(!("caches" in root))return;
  var body={};days.forEach(function(d){if(d.level!=="unknown")body[d.date]=brief(d);});
  caches.open(BRIEF_CACHE).then(function(cache){return cache.put("/brief",new Response(JSON.stringify(body)));}).catch(function(){});
 }
 function renderToday(data){
  var personal=data.moods.filter(function(m){return !m.demo;}),now=new Date(),days=outlook(personal,now);
  $("today-brief-text").textContent=brief(days[0]);
  $("hard-stretch").hidden=!hardStretch(personal,now);
  saveBriefs(days);
 }
 function renderOutlook(moods){
  var list=$("week-outlook");list.textContent="";
  outlook(moods,new Date()).forEach(function(day){
   var row=element("div","outlook-row outlook-"+day.level),text=element("div");
   text.appendChild(element("strong","",day.name));
   text.appendChild(element("small","",day.samples+" check-in"+(day.samples===1?"":"s")+" in the last 8 weeks"));
   row.appendChild(text);row.appendChild(element("span","outlook-level",LEVELS[day.level]));
   list.appendChild(row);
  });
 }
 function renderPatterns(moods,events,health){
  var list=$("stress-patterns"),rows=patterns(moods,events,health);list.textContent="";
  if(!rows.length){list.appendChild(element("p","muted","Rate your stress in a few more check-ins to see what tends to go with it."));return;}
  rows.forEach(function(r){
   var row=element("div","outlook-row"),text=element("div");
   text.appendChild(element("strong","",r.label));
   text.appendChild(element("small","",r.withCount+" check-ins with, "+r.withoutCount+" without"));
   row.appendChild(text);row.appendChild(element("span","outlook-level","+"+r.gap.toFixed(1)+" stress"));
   list.appendChild(row);
  });
 }
 function renderReflections(reflections){
  var list=$("reflection-history"),rows=reflections.slice(-6).reverse();list.textContent="";
  if(!rows.length){list.appendChild(element("p","muted","Answer your first reflection on Check in to start a weekly trend."));return;}
  rows.forEach(function(r){
   var row=element("div","outlook-row"),text=element("div");
   text.appendChild(element("strong","",new Date(r.ts).toLocaleDateString(undefined,{month:"short",day:"numeric"})));
   text.appendChild(element("small","","Higher means a steadier week"));
   row.appendChild(text);row.appendChild(element("span","outlook-level",steadiness(r.answers)+" / 100"));
   list.appendChild(row);
  });
 }
 function buildReflectionForm(){
  var form=$("reflection-form");
  REFLECTION.forEach(function(q){
   var set=element("fieldset"),options=element("div","reflection-options");
   set.appendChild(element("legend","",q.text));
   q.options.forEach(function(option,index){
    var label=element("label"),input=element("input");
    input.type="radio";input.name=q.id;input.value=String(index);input.required=true;
    label.appendChild(input);label.appendChild(element("span","",option));options.appendChild(label);
   });
   set.appendChild(options);form.appendChild(set);
  });
  var save=element("button","btn primary full","Save reflection");save.type="submit";save.value="save";form.appendChild(save);
  var later=element("button","btn subtle full","Not now");later.type="button";later.id="close-reflection";form.appendChild(later);
  later.addEventListener("click",function(){reflectionSnoozed=true;$("reflection-dialog").close();$("reflection-prompt").hidden=true;});
  form.addEventListener("submit",function(){
   var answers={};REFLECTION.forEach(function(q){answers[q.id]=Number(form.elements[q.id].value);});
   form.reset();root.EvenApp.addReflection({ts:new Date().toISOString(),answers:answers});
   root.EvenApp.toast("Reflection saved.");
  });
 }
 function stopBreathing(){if(breathTimer)clearInterval(breathTimer);breathTimer=null;}
 function startBreathing(){
  var step=0,cycles=0,label=$("breath-label"),circle=$("breath-circle");
  stopBreathing();label.textContent=STEPS[0];circle.dataset.step="0";
  breathTimer=setInterval(function(){
   step=(step+1)%4;if(step===0)cycles++;
   if(cycles>=4){stopBreathing();label.textContent="Nicely done.";circle.dataset.step="3";return;}
   label.textContent=STEPS[step];circle.dataset.step=String(step);
  },4000);
 }
 function render(data){
  renderToday(data);
  $("reflection-prompt").hidden=reflectionSnoozed||!reflectionDue(data.reflections,new Date());
  renderReflections(data.reflections);
  var scoped=function(x){return !!x.demo===(data.scope==="demo");};
  renderOutlook(data.moods.filter(scoped));
  renderPatterns(data.moods.filter(scoped),data.events.filter(scoped),data.health.filter(scoped));
 }
 api.render=render;
 buildReflectionForm();
 $("open-reflection").addEventListener("click",function(){$("reflection-dialog").showModal();});
 $("open-reset").addEventListener("click",function(){$("reset-dialog").showModal();startBreathing();});
 $("close-reset").addEventListener("click",function(){$("reset-dialog").close();});
 $("reset-dialog").addEventListener("close",stopBreathing);
 root.EvenApp.refreshCoach();
})(globalThis);
