// Daily brief, weekly outlook, patterns, reset exercise and support.
(function(root){
 var DAY_MS=86400000,DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
 var MIN_SAMPLES=3,MIN_GAP=0.4,HISTORY_DAYS=56,NEAR_EVENT_MS=5400000,SHORT_SLEEP=6.5,EARLY_ALARM=420,REFLECTION_DAYS=7;
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
  var firstAlarm={};health.forEach(function(h){if(Number.isFinite(h.firstAlarmMin))firstAlarm[h.date]=h.firstAlarmMin;});
  var early=[],later=[];
  checked.forEach(function(m){var at=firstAlarm[localDay(m.ts)];if(at===undefined)return;(at<EARLY_ALARM?early:later).push(m.stress);});
  rows.push(comparison("On days with an alarm before 7 AM",early,later));
  return rows.filter(function(r){return r&&r.gap>=0.3;}).sort(function(a,b){return b.gap-a.gap;}).slice(0,5);
 }

 function brief(day,helper,name){
  if(day.level==="harder")return(name?name+", ":"")+day.name+"s have tended to be harder for you. "+(helper?helper.tip:DEFAULT_ACTION);
  if(day.level==="easier")return day.name+"s have tended to be easier for you. A good day to keep some of that calm.";
  if(day.level==="typical")return day.name+"s have tended to be about average for you.";
  return "Keep checking in. A few more "+day.name+"s will show your pattern.";
 }
 function hardStretch(moods,today){
  // Today and the three calendar days before it.
  var start=new Date(today);start.setHours(0,0,0,0);start.setDate(start.getDate()-3);
  var cutoff=start.getTime(),hard={};
  rated(moods).forEach(function(m){if(m.stress>=4&&new Date(m.ts).getTime()>=cutoff)hard[localDay(m.ts)]=true;});
  return Object.keys(hard).length>=3;
 }

 // Each answer is stored by its position, so a rewording must keep every question's id, order and direction.
 var OFTEN=["Never","Rarely","Sometimes","Often","Very often"];
 var REFLECTION=[
  {id:"snapped",text:"How often did you snap or lose your temper?",options:OFTEN,reverse:true},
  {id:"setOff",text:"How often did small things set you off?",options:OFTEN,reverse:true},
  {id:"recovered",text:"When something upset you, how easily did you calm down?",hint:"If nothing upset you, choose Very easily.",options:["Not easily","With some effort","Fairly easily","Easily","Very easily"]},
  {id:"rested",text:"How often did you wake up feeling rested?",options:OFTEN}
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
 // Weekly, starting once the first check-in is a week old.
 function reflectionDue(reflections,moods,today){
  var at=new Date(today).getTime(),first=Math.min.apply(null,moods.map(function(m){return new Date(m.ts).getTime();}));
  if(!moods.length||at-first<REFLECTION_DAYS*DAY_MS)return false;
  if(!reflections.length)return true;
  var last=Math.max.apply(null,reflections.map(function(r){return new Date(r.ts).getTime();}));
  return at-last>=REFLECTION_DAYS*DAY_MS;
 }

 function minutesOf(time){var p=time.split(":");return Number(p[0])*60+Number(p[1]);}
 function timeOf(minutes){return String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0");}
 // Spreads reminders across the window, favoring the times check-ins usually happen.
 function smartSlots(moods,from,to,count,today){
  var start=minutesOf(from),end=minutesOf(to),cutoff=new Date(today).getTime()-30*DAY_MS,buckets={},slots=[];
  if(end<=start||count<1)return[];
  moods.forEach(function(m){
   var d=new Date(m.ts);if(d.getTime()<cutoff)return;
   var at=Math.floor((d.getHours()*60+d.getMinutes())/30)*30;buckets[at]=(buckets[at]||0)+1;
  });
  var span=(end-start)/count;
  for(var i=0;i<count;i++){
   var low=start+span*i,high=low+span,best=null;
   Object.keys(buckets).map(Number).forEach(function(at){if(at>=low&&at<high&&(best===null||buckets[at]>buckets[best]))best=at;});
   slots.push({time:timeOf(best===null?Math.round((low+span/2)/5)*5:best),kind:best===null?"spaced":"usual"});
  }
  return slots.filter(function(slot,n){return slots.findIndex(function(o){return o.time===slot.time;})===n;});
 }
 function smartTimes(moods,from,to,count,today){return smartSlots(moods,from,to,count,today).map(function(slot){return slot.time;});}
 function median(values){var sorted=values.slice().sort(function(a,b){return a-b;});return sorted[Math.floor(sorted.length/2)];}
 // Times after midnight count as late evening, so 00:30 sorts after 23:30.
 function nightMinutes(minutes){return minutes<720?minutes+1440:minutes;}
 // Prefers recorded sleep, then the last check-in of each day, then the end of the window.
 function bedtimeEstimate(health,moods,to,today){
  var cutoff=new Date(today).getTime()-14*DAY_MS,slept=[],lastByDay={},estimate;
  // Friday and Saturday nights often run later, so compare like with like when there's enough data.
  function weekendNight(day){return day===5||day===6;}
  var tonightWeekend=weekendNight(new Date(today).getDay()),matching=[];
  health.forEach(function(h){
   var morning=new Date(h.date+"T12:00:00");
   if(!Number.isFinite(h.bedtimeMin)||morning.getTime()<cutoff)return;
   var minutes=nightMinutes(h.bedtimeMin);slept.push(minutes);
   if(weekendNight(new Date(morning.getTime()-DAY_MS).getDay())===tonightWeekend)matching.push(minutes);
  });
  if(matching.length>=3)slept=matching;
  moods.forEach(function(m){var d=new Date(m.ts);if(d.getTime()<cutoff)return;var key=localDay(d),at=nightMinutes(d.getHours()*60+d.getMinutes());if(!lastByDay[key]||at>lastByDay[key])lastByDay[key]=at;});
  var evenings=Object.keys(lastByDay).map(function(k){return lastByDay[k];}).filter(function(at){return at>=1080;});
  var source="window";
  if(slept.length>=3){estimate=median(slept);source="sleep";}
  else if(evenings.length>=5){estimate=median(evenings)+30;source="evenings";}
  else estimate=nightMinutes(minutesOf(to));
  return{time:timeOf((estimate-20+1440)%1440),source:source};
 }
 function bedtimeReminder(health,moods,to,today){return bedtimeEstimate(health,moods,to,today).time;}
 var HARD_TIMES={morning:"09:30",midday:"12:00",afternoon:"15:00",evening:"18:30"},SLOT_GAP=30;
 function nearby(a,b){return Math.abs(minutesOf(a)-minutesOf(b))<45;}
 // Moves the harder-time check-in clear of the brief and wind-down, or drops it if there's no room.
 function hardTime(hardest,from,to,bedtime,briefAt){
  var at=HARD_TIMES[hardest];
  if(!at)return null;
  if(briefAt&&nearby(at,briefAt))at=timeOf(minutesOf(briefAt)+60);
  if(bedtime&&nearby(at,bedtime))at=timeOf(minutesOf(bedtime)-60);
  var clear=(!briefAt||!nearby(at,briefAt))&&(!bedtime||!nearby(at,bedtime));
  return clear&&at>=from&&at<=to?at:null;
 }
 // Fills the gaps between fixed notifications, giving the longest gaps the most.
 function fillGaps(moods,fixed,from,to,count,today){
  var edges=fixed.map(minutesOf).sort(function(a,b){return a-b;}),gaps=[],start=minutesOf(from);
  edges.forEach(function(at){gaps.push({from:start,to:at-SLOT_GAP,count:0});start=at+SLOT_GAP;});
  gaps.push({from:start,to:minutesOf(to),count:0});
  gaps=gaps.filter(function(g){return g.to>g.from;});
  if(!gaps.length)return[];
  for(var n=0;n<count;n++)gaps.reduce(function(a,b){return(a.to-a.from)/(a.count+1)>=(b.to-b.from)/(b.count+1)?a:b;}).count++;
  return gaps.reduce(function(slots,g){return slots.concat(smartSlots(moods,timeOf(g.from),timeOf(g.to),g.count,today));},[]);
 }
 // Fixed notifications count toward the daily total, most useful first.
 // A day can run past midnight, so an end at or before the start belongs to the next morning.
 var LONGEST_DAY=1200;
 function dayEnd(from,to){var start=minutesOf(from),end=minutesOf(to);return end>start?end:end+1440;}
 function validDay(from,to){return dayEnd(from,to)-minutesOf(from)<=LONGEST_DAY;}
 function smartPlan(moods,health,from,to,count,today,preferences){
  var prefs=Object.assign({windDown:true,brief:false,hardest:"varies"},preferences),start=minutesOf(from),end=timeOf(dayEnd(from,to));
  function within(time){var minutes=minutesOf(time);return timeOf(minutes<start?minutes+1440:minutes);}
  var estimate=bedtimeEstimate(health,moods,to,today),alarmBed=bedtimeForAlarm(prefs.alarms,health,today);
  if(alarmBed){var earlier=timeOf(minutesOf(alarmBed.bed)-20);if(nightMinutes(minutesOf(earlier))<nightMinutes(minutesOf(estimate.time)))estimate={time:earlier,source:"alarm",alarmMin:alarmBed.alarm.timeMin};}
  var bedTime=within(estimate.time),bedtime=prefs.windDown&&bedTime<=end?bedTime:null;
  var wake=morningAlarm(prefs.alarms,today),morning=timeOf(wake?wake.timeMin+15:start+30),briefAt=prefs.brief&&morning<=end&&morning!==bedtime?morning:null;
  var hardAt=hardTime(prefs.hardest,from,end,bedtime,briefAt),wanted=[];
  if(bedtime)wanted.push({time:bedtime,kind:"bedtime",source:estimate.source,alarmMin:estimate.alarmMin});
  if(briefAt)wanted.push({time:briefAt,kind:"brief",alarmMin:wake?wake.timeMin:undefined});
  if(hardAt)wanted.push({time:hardAt,kind:"hard",part:prefs.hardest});
  var kept=wanted.slice(0,count),fixed=kept.map(function(slot){return slot.time;});
  function clock(time){return timeOf(minutesOf(time)%1440);}
  function at(kind){var slot=kept.find(function(s){return s.kind===kind;});return slot?clock(slot.time):null;}
  // Inside the plan, times after midnight run past 24:00 so they sort last; each slot keeps that as its minute.
  var slots=kept.concat(fillGaps(moods,fixed,from,end,count-kept.length,today)).sort(function(a,b){return a.time<b.time?-1:1;}).map(function(slot){return Object.assign({},slot,{minute:minutesOf(slot.time),time:clock(slot.time)});});
  return{slots:slots,times:slots.map(function(slot){return slot.time;}),bedtimeAt:at("bedtime"),briefAt:at("brief"),hardAt:at("hard"),left:wanted.slice(count).map(function(slot){return slot.kind;})};
 }
 // The next 7 days of notifications, each with its date, so a time tied to one day's alarm stays on that day.
 function weekSchedule(moods,health,prefs,today){
  var now=new Date(today),first=new Date(now),items=[],repeating=(prefs.alarms||[]).filter(function(a){return a.days.length;});
  first.setHours(12,0,0,0);
  for(var i=0;i<7;i++){
   var noon=new Date(first);noon.setDate(first.getDate()+i);
   if(prefs.weekends===false&&(noon.getDay()===0||noon.getDay()===6))continue;
   var slots=prefs.mode==="smart"?smartPlan(moods,health,prefs.from,prefs.to,prefs.count,noon,Object.assign({},prefs,{alarms:i===0?prefs.alarms:repeating})).slots:prefs.customTimes.map(function(time){var minutes=minutesOf(time);return{minute:prefs.mode==="repeat"&&minutes<minutesOf(prefs.from)?minutes+1440:minutes,kind:"custom"};});
   slots.forEach(function(slot){
    var at=new Date(noon);at.setHours(0,slot.minute,0,0);
    if(at>now)items.push({at:at.toISOString(),kind:slot.kind==="usual"||slot.kind==="spaced"?"custom":slot.kind});
   });
  }
  return items;
 }
 // Alarms that ring on this date. Non-repeating alarms count on any date, since they carry no date.
 function alarmsOn(alarms,date){
  var day=new Date(date).getDay();
  return(alarms||[]).filter(function(a){return a.enabled!==false&&(!a.days.length||a.days.indexOf(day)>=0);}).sort(function(a,b){return a.timeMin-b.timeMin;});
 }
 function morningAlarm(alarms,date){return alarmsOn(alarms,date).filter(function(a){return a.timeMin<720;})[0]||null;}
 function usualSleep(health,today){
  var cutoff=new Date(today).getTime()-14*DAY_MS,hours=health.filter(function(h){return Number.isFinite(h.sleepHours)&&h.sleepHours>=3&&new Date(h.date+"T12:00:00").getTime()>=cutoff;}).map(function(h){return h.sleepHours;});
  return hours.length>=3?median(hours):8;
 }
 // When to be in bed for a usual night's sleep before tomorrow's alarm, if that's before midnight.
 function bedtimeForAlarm(alarms,health,today){
  var alarm=morningAlarm(alarms,new Date(new Date(today).getTime()+DAY_MS));
  if(!alarm)return null;
  var bed=Math.round((alarm.timeMin+1440-usualSleep(health,today)*60)/5)*5;
  return bed<1440&&bed>=1080?{bed:timeOf(bed),alarm:alarm}:null;
 }
 function repeatTimes(from,to,everyHours){
  var times=[],end=dayEnd(from,to);
  for(var at=minutesOf(from);at<=end;at+=everyHours*60)times.push(timeOf(at%1440));
  return times;
 }

 // What has tended to go with feeling better. Many things are compared, so this asks for more check-ins than a stress pattern.
 var HELP_SAMPLES=5,HELP_GAP=0.4,RESET_WINDOW_MS=7200000;
 var HELP_METRICS=[{key:"stress",direction:-1,name:"lower stress"},{key:"score",direction:1,name:"better mood"},{key:"energy",direction:1,name:"more energy"}];
 var HELP_ACTIVITIES=[["Exercise","moving","Fit in some movement."],["Outdoors","being outdoors","Get outside for a few minutes."],["Rest","rest","Take a real break."],["Social","time with people","Reach out to someone."],["Family","time with family","Make time for family."]];
 function helpFactors(events,health,resets,now){
  var days={},today=localDay(now);
  health.forEach(function(h){days[h.date]=h;});
  function dayFactor(id,label,tip,key,met){
   return{id:id,label:label,tip:tip,test:function(m){var h=days[localDay(m.ts)];return h&&Number.isFinite(h[key])?met(h[key]):null;},done:!!days[today]&&Number.isFinite(days[today][key])&&met(days[today][key])};
  }
  var factors=[
   dayFactor("sleep","After 7 or more hours of sleep","Protect your sleep tonight.","sleepHours",function(v){return v>=7;}),
   dayFactor("steps","On days with 6,000 or more steps","Go for a walk.","steps",function(v){return v>=6000;}),
   dayFactor("workout","On days with a workout","Fit in some movement.","workoutMin",function(v){return v>0;})
  ];
  var resetTimes=(resets||[]).map(function(at){return Date.parse(at);}).filter(Number.isFinite);
  factors.push({id:"reset",label:"In the 2 hours after a breathing exercise",tip:"Take a minute.",action:"reset",
   test:function(m){var t=Date.parse(m.ts);return resetTimes.some(function(at){return t>=at&&t-at<=RESET_WINDOW_MS;});},
   done:resetTimes.some(function(at){return localDay(at)===today;})});
  HELP_ACTIVITIES.forEach(function(item){
   var tag=item[0],spans=events.filter(function(e){return e.category===tag;}).map(function(e){return[new Date(e.start).getTime(),new Date(e.end).getTime()+NEAR_EVENT_MS];});
   factors.push({id:"tag:"+tag,label:"When you’ve tagged "+item[1],tip:item[2],test:function(m){return(m.tags||[]).indexOf(tag)>=0;},done:false,tag:tag});
   if(spans.length)factors.push({id:"event:"+tag,label:"Around "+tag.toLowerCase()+" events",tip:item[2],test:function(m){var t=Date.parse(m.ts);return spans.some(function(s){return t>=s[0]&&t<=s[1];});},
    done:events.some(function(e){return e.category===tag&&localDay(e.start)===today;})});
  });
  return factors;
 }
 function whatHelps(moods,events,health,resets,today){
  var now=new Date(today),rows=[];
  helpFactors(events,health,resets,now).forEach(function(factor){
   if(factor.tag)factor.done=moods.some(function(m){return localDay(m.ts)===localDay(now)&&(m.tags||[]).indexOf(factor.tag)>=0;});
   var effects=[];
   HELP_METRICS.forEach(function(metric){
    var yes=[],no=[];
    moods.forEach(function(m){
     var value=m[metric.key];if(!Number.isInteger(value)||value<1||value>5)return;
     var met=factor.test(m);if(met===null)return;(met?yes:no).push(value);
    });
    if(yes.length<HELP_SAMPLES||no.length<HELP_SAMPLES)return;
    var gap=(mean(yes)-mean(no))*metric.direction;
    if(gap>=HELP_GAP)effects.push({metric:metric.key,name:metric.name,gap:gap,withCount:yes.length,withoutCount:no.length});
   });
   if(effects.length){effects.sort(function(a,b){return b.gap-a.gap;});rows.push({id:factor.id,label:factor.label,tip:factor.tip,action:factor.action,done:factor.done,effects:effects});}
  });
  return rows.sort(function(a,b){return b.effects[0].gap-a.effects[0].gap;}).slice(0,5);
 }
 function helpEvidence(effect){return effect.gap.toFixed(1)+" points, from "+effect.withCount+" check-ins compared with "+effect.withoutCount+". A pattern, not proof of cause.";}
 function helpSentence(row,effect){return row.label+", you’ve tended to report "+effect.name+".";}
 // Something that has gone with feeling better and hasn't happened yet today, fitted to how the person last felt.
 function helpAction(data,now){
  var helps=whatHelps(data.moods,data.events,data.health,data.resets,now).filter(function(row){return !row.done;});
  var cutoff=now.getTime()-6*3600000,latest=data.moods.filter(function(m){return Date.parse(m.ts)>=cutoff&&Date.parse(m.ts)<=now.getTime();}).sort(function(a,b){return Date.parse(b.ts)-Date.parse(a.ts);})[0];
  var wanted=!latest?null:latest.stress>=4?"stress":latest.score<=2?"score":latest.energy<=2?"energy":null;
  var lead={stress:"You noted high stress.",score:"You noted a low mood.",energy:"You noted low energy."};
  function usable(row){return row.id==="sleep"?now.getHours()>=18:now.getHours()<19||row.id==="reset";}
  var pick=null,effect=null;
  if(wanted)helps.some(function(row){var match=row.effects.filter(function(e){return e.metric===wanted;})[0];if(match&&usable(row)){pick=row;effect=match;return true;}return false;});
  if(!pick){pick=helps.filter(usable)[0];effect=pick&&pick.effects[0];wanted=null;}
  if(!pick)return null;
  return{text:(wanted?lead[wanted]+" ":"")+pick.tip+" "+helpSentence(pick,effect),why:helpEvidence(effect),action:pick.action,label:pick.action?"Take a minute":undefined};
 }
 var ANTICIPATE_GAP=0.4,MAX_ANTICIPATED_A_DAY=2,ANTICIPATE_DAYS=7;
 var PART_STARTS=[["morning",480,"morning"],["midday",690,"midday"],["afternoon",840,"afternoon"],["evening",1020,"evening"]];
 function clockLabel(date){return new Date(date).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});}
 function minuteLabel(minutes){var d=new Date(2024,0,1);d.setHours(0,minutes,0,0);return clockLabel(d);}
 function partOf(minutes){var part=PART_STARTS[0];PART_STARTS.forEach(function(p){if(minutes>=p[1])part=p;});return part;}
 function eventGap(moods,events,category){
  var spans=events.filter(function(e){return e.category===category;}).map(function(e){return[new Date(e.start).getTime(),new Date(e.end).getTime()+NEAR_EVENT_MS];}),yes=[],no=[];
  rated(moods).forEach(function(m){var t=new Date(m.ts).getTime();(spans.some(function(s){return t>=s[0]&&t<=s[1];})?yes:no).push(m.stress);});
  return comparison(category,yes,no);
 }
 function sleepGap(moods,health){
  var sleep={},short=[],rested=[];
  health.forEach(function(h){if(Number.isFinite(h.sleepHours))sleep[h.date]=h.sleepHours;});
  rated(moods).forEach(function(m){var hours=sleep[localDay(m.ts)];if(hours!==undefined)(hours<SHORT_SLEEP?short:rested).push(m.stress);});
  return comparison("sleep",short,rested);
 }
 function evidence(row){return"Stress averaged "+row.gap.toFixed(1)+" points higher, from "+row.withCount+" check-ins compared with "+row.withoutCount+".";}
 // The part of a weekday with the highest stress, given at least two check-ins there.
 function hardestPart(moods,weekday){
  var groups={};
  rated(moods).forEach(function(m){var d=new Date(m.ts);if(d.getDay()!==weekday)return;var key=partOf(d.getHours()*60+d.getMinutes())[0];(groups[key]=groups[key]||[]).push(m.stress);});
  var best=null;
  PART_STARTS.forEach(function(p){var values=groups[p[0]];if(values&&values.length>=2&&(!best||mean(values)>best.score))best={part:p,score:mean(values)};});
  return best&&best.part;
 }
 // Moments ahead that past check-ins suggest may be harder. Each needs evidence and leads to an action.
 // Weekday names keep their capital after a first name.
 function addressed(message,name){
  if(!name)return message;
  return name+", "+(DAYS.indexOf(message.split(" ")[0])>=0?message:message[0].toLowerCase()+message.slice(1));
 }
 function anticipate(moods,events,health,today,prefs){
  var now=new Date(today),found=[],from=minutesOf(prefs.from),to=dayEnd(prefs.from,prefs.to);
  function add(at,message,why){
   var minutes=at.getHours()*60+at.getMinutes(),weekend=at.getDay()===0||at.getDay()===6;
   if(minutes<from)minutes+=1440;
   if(at<=now||minutes>to||(prefs.weekends===false&&weekend))return;
   found.push({at:at.toISOString(),message:addressed(message,prefs.firstName),why:why});
  }
  var seen={},soon=now.getTime()+DAY_MS;
  events.forEach(function(e){
   var start=new Date(e.start).getTime();
   if(!(start>now.getTime()&&start<=soon)||e.category==="Other"||!e.category)return;
   var row=seen[e.category]===undefined?(seen[e.category]=eventGap(moods,events,e.category)):seen[e.category];
   if(row&&row.gap>=ANTICIPATE_GAP)add(new Date(start-20*60000),"Your "+e.category.toLowerCase()+" event at "+clockLabel(start)+" is coming up, and these have tended to be harder. Take a minute first?",evidence(row));
  });
  outlook(moods,now).slice(0,ANTICIPATE_DAYS).forEach(function(day){
   if(day.level!=="harder")return;
   var date=new Date(day.date+"T12:00:00"),part=hardestPart(moods,date.getDay());
   if(!part)return;
   var at=new Date(date);at.setHours(0,part[1]-30,0,0);
   add(at,day.name+" "+part[2]+"s have tended to be harder for you. Take a minute before it starts?",day.samples+" "+day.name+" check-ins in the last 8 weeks.");
  });
  var lastNight=health.find(function(h){return h.date===localDay(now);}),sleepRow=sleepGap(moods,health);
  if(lastNight&&Number.isFinite(lastNight.sleepHours)&&lastNight.sleepHours<SHORT_SLEEP&&sleepRow&&sleepRow.gap>=ANTICIPATE_GAP){
   var midMorning=new Date(now);midMorning.setHours(0,from+180,0,0);
   add(midMorning,"A short night. Those days have tended to be harder for you, so protect a break today.",evidence(sleepRow));
  }
  var helper=whatHelps(moods,events,health,prefs.resets,now).filter(function(row){return row.id!=="sleep";})[0];
  if(helper)found.forEach(function(item){item.why+=" "+helpSentence(helper,helper.effects[0]);});
  found.sort(function(a,b){return a.at<b.at?-1:1;});
  var kept=[],perDay={};
  found.forEach(function(item){
   var key=localDay(item.at),prev=kept[kept.length-1];
   if((perDay[key]||0)>=MAX_ANTICIPATED_A_DAY||(prev&&Date.parse(item.at)-Date.parse(prev.at)<7200000))return;
   perDay[key]=(perDay[key]||0)+1;kept.push(item);
  });
  return kept.slice(0,14);
 }
 // The next few useful things to do, most time-sensitive first.
 function nextActions(data,today,prefs){
  var now=new Date(today),actions=[],ahead=anticipate(data.moods,data.events,data.health,now,Object.assign({},prefs,{resets:data.resets})).filter(function(a){return localDay(a.at)===localDay(now);})[0];
  if(ahead)actions.push({text:ahead.message,why:ahead.why,action:"reset",label:"Take a minute"});
  var alarmBed=bedtimeForAlarm(data.alarms,data.health,now);
  if(alarmBed&&now.getHours()>=17){
   var name=alarmBed.alarm.label?" (“"+alarmBed.alarm.label+"”)":"";
   actions.push({text:"Your alarm"+name+" is at "+minuteLabel(alarmBed.alarm.timeMin)+" tomorrow. For your usual sleep, be in bed by "+minuteLabel(minutesOf(alarmBed.bed))+"."});
  }
  var help=helpAction(data,now);
  if(help)actions.push(help);
  if(data.connected&&(!data.lastUpload||now.getTime()-new Date(data.lastUpload).getTime()>20*3600000))actions.push({text:"Run Even Sync to bring in last night’s sleep and today’s calendar.",action:"sync",label:"Run Even Sync"});
  return actions.slice(0,3);
 }
 var api={validDay:validDay,weekSchedule:weekSchedule,whatHelps:whatHelps,anticipate:anticipate,nextActions:nextActions,bedtimeForAlarm:bedtimeForAlarm,morningAlarm:morningAlarm,alarmsOn:alarmsOn,smartPlan:smartPlan,bedtimeReminder:bedtimeReminder,smartTimes:smartTimes,repeatTimes:repeatTimes,outlook:outlook,patterns:patterns,brief:brief,hardStretch:hardStretch,steadiness:steadiness,reflectionDue:reflectionDue,REFLECTION:REFLECTION};
 root.EvenCoach=api;
 if(typeof document==="undefined"||!root.EvenApp)return;

 var LEVELS={harder:"Tends to be harder",easier:"Tends to be easier",typical:"About average",unknown:"Not enough check-ins"};
 var reflectionSnoozed=false;
 var STEPS=["Breathe in","Hold","Breathe out","Hold"],breathTimer=null,breathDelay=null;
 function $(id){return document.getElementById(id);}
 function element(tag,className,text){var e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}

 function openReset(){if(!$("reset-dialog").open){$("reset-dialog").showModal();startBreathing();root.EvenApp.logReset();}}
 function saveBriefs(days,helper,name){
  if(!("caches" in root))return;
  var body={};days.forEach(function(d){if(d.level!=="unknown")body[d.date]=d.level==="harder"?brief(d,helper,name):(name?"Good morning, "+name+". ":"")+brief(d,helper);});
  caches.open(BRIEF_CACHE).then(function(cache){return cache.put("/brief",new Response(JSON.stringify(body)));}).catch(function(){});
 }
 function renderToday(data){
  var personal=data.moods,now=new Date(),days=outlook(personal,now);
  var helper=whatHelps(personal,data.events,data.health,data.resets,now).filter(function(row){return row.id!=="sleep";})[0];
  $("today-brief-text").textContent=personal.length?brief(days[0],helper,data.firstName):"Your first check-in starts your pattern.";
  $("hard-stretch").hidden=!hardStretch(personal,now);
  $("hard-stretch-text").textContent="It’s been a hard few days"+(data.firstName?", "+data.firstName:"")+". Talking to someone can help.";
  saveBriefs(days,helper,data.firstName);
  renderActions(data,personal,now);
 }
 function renderActions(data,personal,now){
  var box=$("next-actions"),actions=nextActions({moods:personal,events:data.events,health:data.health,alarms:data.alarms,resets:data.resets,connected:data.connected,lastUpload:data.lastUpload},now,data.notifyPrefs);
  box.textContent="";box.hidden=!actions.length;
  actions.forEach(function(item){
   var row=element("div","next-action"),text=element("div");
   text.appendChild(element("p","",item.text));
   if(item.why){var more=element("details"),summary=element("summary","","Why this");more.appendChild(summary);more.appendChild(element("p","muted",item.why));text.appendChild(more);}
   row.appendChild(text);
   if(item.action){var button=element("button","btn secondary",item.label);button.type="button";button.addEventListener("click",function(){if(item.action==="reset")openReset();else root.EvenApp.runShortcut();});row.appendChild(button);}
   box.appendChild(row);
  });
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
 function renderHelps(moods,events,health,resets){
  var list=$("what-helps"),rows=whatHelps(moods,events,health,resets,new Date());list.textContent="";
  if(!rows.length){list.appendChild(element("p","muted","Keep checking in with stress, energy and tags. This fills in after a few weeks."));return;}
  rows.forEach(function(r){
   var effect=r.effects[0],row=element("div","outlook-row"),text=element("div");
   text.appendChild(element("strong","",r.label));
   text.appendChild(element("small","",effect.withCount+" check-ins with, "+effect.withoutCount+" without"));
   row.appendChild(text);row.appendChild(element("span","outlook-level",effect.gap.toFixed(1)+" points "+effect.name));
   list.appendChild(row);
  });
  list.appendChild(element("p","muted","Each needs at least 5 check-ins each way. A pattern in your check-ins, not proof of cause."));
 }
 function renderReflections(reflections){
  var list=$("reflection-history"),rows=reflections.slice(-6).reverse();list.textContent="";
  if(!rows.length){list.appendChild(element("p","muted","A week after your first check-in, a short reflection appears on Check in. Your weekly scores will show here."));return;}
  rows.forEach(function(r){
   var row=element("div","outlook-row");
   row.appendChild(element("strong","","Week ending "+new Date(r.ts).toLocaleDateString(undefined,{month:"short",day:"numeric"})));
   row.appendChild(element("span","outlook-level",steadiness(r.answers)+" / 100"));
   list.appendChild(row);
  });
  list.appendChild(element("p","muted","Each score combines your four answers. Higher means a steadier week."));
 }
 function buildReflectionForm(){
  var form=$("reflection-form");
  REFLECTION.forEach(function(q){
   var set=element("fieldset"),options=element("div","reflection-options");
   var legend=element("legend","",q.text);
   if(q.hint)legend.appendChild(element("small","",q.hint));
   set.appendChild(legend);
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
 function stopBreathing(){clearTimeout(breathDelay);if(breathTimer)clearInterval(breathTimer);breathTimer=null;}
 function startBreathing(){
  var step=0,cycles=0,label=$("breath-label"),circle=$("breath-circle");
  stopBreathing();label.textContent="Get comfortable…";circle.dataset.step="3";
  // A short pause to settle, then the circle grows with the first breath in.
  breathDelay=setTimeout(function(){
   label.textContent=STEPS[0];circle.dataset.step="0";
   breathTimer=setInterval(nextStep,4000);
  },4000);
  function nextStep(){
   step=(step+1)%4;if(step===0)cycles++;
   if(cycles>=4){stopBreathing();label.textContent="Nicely done.";circle.dataset.step="3";return;}
   label.textContent=STEPS[step];circle.dataset.step=String(step);
  }
 }
 function render(data){
  renderToday(data);
  $("reflection-prompt").hidden=reflectionSnoozed||!reflectionDue(data.reflections,data.moods,new Date());
  // The demo view shows only fictional records.
  var isDemo=data.scope==="demo",source=isDemo?data.demo:data;
  renderReflections(isDemo?[]:data.reflections);
  renderOutlook(source.moods);
  renderPatterns(source.moods,source.events,source.health);
  renderHelps(source.moods,source.events,source.health,isDemo?[]:data.resets);
 }
 api.render=render;
 api.openReset=openReset;
 buildReflectionForm();
 $("open-reflection").addEventListener("click",function(){$("reflection-dialog").showModal();});
 $("open-reset").addEventListener("click",openReset);
 $("close-reset").addEventListener("click",function(){$("reset-dialog").close();});
 $("reset-dialog").addEventListener("close",stopBreathing);
 root.EvenApp.refreshCoach();
})(globalThis);
