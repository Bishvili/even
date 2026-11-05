// Daily brief, weekly outlook, patterns, reset exercise and support.
(function(root){
/* global require */
 if(!root.EvenDay&&typeof require==="function")require("./daycontext.js");
 var Day=root.EvenDay,RULES=Day.RULES,mean=Day.mean,median=Day.median,localDay=Day.localDay;
 var DAY_MS=Day.DAY_MS,DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
 var MIN_SAMPLES=3,MIN_GAP=0.4,HISTORY_DAYS=RULES.evidenceDays,NEAR_EVENT_MS=RULES.nearEventMs,EARLY_ALARM=420,REFLECTION_DAYS=7;
 var BRIEF_CACHE="even-brief",DEFAULT_ACTION="Leave room for a short reset today.";

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
  if(yes.length<HELP_SAMPLES||no.length<HELP_SAMPLES)return null;
  return{label:label,gap:mean(yes)-mean(no),withCount:yes.length,withoutCount:no.length};
 }
 function brief(day,helper,name){
  if(day.level==="harder")return(name?name+", ":"")+day.name+"s have tended to be harder for you. "+(helper?helper.tip:DEFAULT_ACTION);
  if(day.level==="easier")return day.name+"s have tended to be easier for you. A good day to keep some of that calm.";
  if(day.level==="typical")return day.name+"s have tended to be about average for you.";
  return "Keep checking in. A few more "+day.name+"s will show your pattern.";
 }
 // The Today card and the morning notification. Names at most three facts and how old they are.
 // Facts name a category and never a title, because this can show on a lock screen.
 function briefFor(day,helper,name,data,now){
  var when=new Date(now),context=Day.build({health:data.health,events:data.events,lastUpload:data.lastUpload},when),todayKey=localDay(when),parts=[brief(day,helper,name)],fresh=context.fresh;
  if(!data.connected||!fresh.syncedAt)return{text:parts[0],fresh:fresh};
  if(!fresh.stale){
   var facts=context.days[todayKey]||{},sleep=facts.sleepHours;
   if(sleep&&sleep.status==="known"&&sleep.value<Day.shortSleepLine(context.usual.sleepHours))parts.push("A short night.");
   var calendar=facts.calendar;
   if(calendar){
    var first=calendar.events.slice().sort(function(a,b){return Date.parse(a.start)-Date.parse(b.start);}).filter(function(e){return Date.parse(e.start)>when.getTime();})[0];
    var fuller=context.usual.busyMinutes!==null&&calendar.busyMinutes>context.usual.busyMinutes;
    if(first)parts.push((first.category&&first.category!=="Other"?"First up: "+first.category.toLowerCase():"Your first event is")+" at "+clockLabel(first.start)+"."+(fuller?" A fuller day than usual.":""));
    else if(fuller)parts.push("A fuller day than usual.");
   }
  }
  var yesterday=localDay(new Date(when.getTime()-DAY_MS)),synced=new Date(fresh.syncedAt),syncDay=localDay(synced);
  parts.push(syncDay===todayKey?"From your "+clockLabel(synced)+" sync.":syncDay===yesterday?"From yesterday’s sync.":"From your sync on "+synced.toLocaleDateString(undefined,{month:"short",day:"numeric"})+".");
  return{text:parts.join(" "),fresh:fresh};
 }
 function hardStretch(moods,today){
  // Today and the three calendar days before it.
  var start=new Date(today);start.setHours(0,0,0,0);start.setDate(start.getDate()-3);
  var cutoff=start.getTime(),hard={};
  // Stress is optional, so a Rough or Low mood counts too.
  moods.forEach(function(m){if((m.stress>=4||m.score===1||m.score===2)&&new Date(m.ts).getTime()>=cutoff)hard[localDay(m.ts)]=true;});
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
 var timedEvents=Day.timedEvents;
 // Tomorrow morning's first event counts like an alarm an hour before it, for planning the wind-down.
 function morningEvents(events,today){
  var day=new Date(new Date(today).getTime()+DAY_MS),key=localDay(day),first=timedEvents(events).filter(function(e){return localDay(e.start)===key;}).map(function(e){var d=new Date(e.start);return d.getHours()*60+d.getMinutes();}).filter(function(m){return m<720;}).sort(function(a,b){return a-b;})[0];
  return first===undefined||first<60?[]:[{timeMin:first-60,eventMin:first,days:[day.getDay()],enabled:true,label:"First event"}];
 }
 // A check-in waits until the event it would interrupt has ended. A moved one stays clear of the others,
 // and one that no longer fits the day is left out rather than stacked.
 function placeAroundEvents(slots,events,today,lastMinute){
  var day=new Date(today);day.setHours(0,0,0,0);
  var spans=timedEvents(events).map(function(e){return[(Date.parse(e.start)-day.getTime())/60000,(Date.parse(e.end)-day.getTime())/60000+AFTER_EVENT_MS/60000];}).sort(function(a,b){return a[0]-b[0];});
  function during(minute){return spans.filter(function(s){return minute>=s[0]&&minute<s[1]-AFTER_EVENT_MS/60000;})[0];}
  var movable=function(s){return s.kind==="usual"||s.kind==="spaced";},kept=slots.filter(function(s){return !movable(s)||!during(s.minute);}),dropped=0;
  slots.filter(function(s){return movable(s)&&during(s.minute);}).forEach(function(slot){
   var minute=slot.minute,span;
   for(var tries=0;tries<50;tries++){
    span=during(minute);
    if(span){minute=Math.ceil(span[1]);continue;}
    var close=kept.filter(function(k){return Math.abs(k.minute-minute)<MOVED_SPACING;})[0];
    if(!close)break;
    minute=close.minute+MOVED_SPACING;
   }
   if(minute>lastMinute){dropped++;return;}
   kept.push(Object.assign({},slot,{minute:minute,time:timeOf(minute%1440),moved:true}));
  });
  return{slots:kept.sort(function(a,b){return a.minute-b.minute;}),dropped:dropped};
 }
 // Which check-in times have gone unanswered. Learned on this device from the planned times it logged.
 // A time moves only after 8 planned with under a quarter answered, at most once a week, toward when the person does check in.
 function learnedMoves(log,moves,moods,today,from,to){
  var now=new Date(today).getTime(),cutoff=now-RULES.planLogDays*DAY_MS,recentCutoff=now-30*DAY_MS,buckets={},usual={},start=minutesOf(from),end=dayEnd(from,to),added=[];
  (log||[]).forEach(function(item){
   var day=new Date(item.date+"T00:00:00");if(day.getTime()<cutoff)return;
   var when=new Date(day);when.setHours(0,item.minute,0,0);if(when.getTime()>=now)return;
   var bucket=Math.floor(item.minute/30)*30,slot=buckets[bucket]=buckets[bucket]||{planned:0,answered:0},at=when.getTime();
   slot.planned++;
   if(moods.some(function(m){var t=Date.parse(m.ts);return t>=at&&t<=at+3600000;}))slot.answered++;
  });
  moods.forEach(function(m){var d=new Date(m.ts);if(d.getTime()<recentCutoff)return;var minutes=d.getHours()*60+d.getMinutes();if(minutes<start)minutes+=1440;var bucket=Math.floor(minutes/30)*30;usual[bucket]=(usual[bucket]||0)+1;});
  Object.keys(buckets).map(Number).forEach(function(bucket){
   var slot=buckets[bucket];
   if(slot.planned<RULES.learnMinimumPlanned||slot.answered/slot.planned>=RULES.learnAnsweredShare)return;
   if((moves||[]).concat(added).some(function(move){return(move.from===bucket||move.to===bucket)&&Date.parse(move.at)>now-7*DAY_MS;}))return;
   var near=Object.keys(usual).map(Number).filter(function(at){return at!==bucket&&Math.abs(at-bucket)<=60&&usual[at]>=3&&at>=start&&at<=end&&!buckets[at];}).sort(function(a,b){return Math.abs(a-bucket)-Math.abs(b-bucket);})[0];
   var target=near===undefined?bucket+30:near;
   if(target>end||target<start)return;
   added.push({from:bucket,to:target,at:new Date(now).toISOString()});
  });
  return added;
 }
 // Moved times follow their latest move. The day's last check-in keeps its place, so the log can still show whether old times would work.
 function applyMoves(slots,moves){
  var movable=slots.filter(function(s){return s.kind==="usual"||s.kind==="spaced";}),keep=movable[movable.length-1];
  return slots.map(function(slot){
   if(slot===keep||movable.indexOf(slot)<0)return slot;
   var minute=slot.minute,moved=null;
   for(var hops=0;hops<4;hops++){
    var bucket=Math.floor(minute/30)*30,next=(moves||[]).filter(function(m){return m.from===bucket;}).sort(function(a,b){return Date.parse(b.at)-Date.parse(a.at);})[0];
    if(!next)break;
    minute+=next.to-next.from;moved={from:(moved&&moved.from)||slot.minute,to:minute};
   }
   if(!moved||slots.some(function(o){return o!==slot&&Math.abs(o.minute-minute)<SLOT_GAP;}))return slot;
   return Object.assign({},slot,{minute:minute,time:timeOf(minute%1440),learned:moved});
  });
 }
 // For a category close to the minimum, a check-in before and after its next event, if the person asked. At most one pair a day.
 // They take the place of ordinary check-ins, so the daily total doesn't grow, and never displace anything else.
 function addPair(slots,moods,events,today,categories,lastMinute,firstMinute){
  if(!(categories||[]).length)return slots;
  var day=new Date(today);day.setHours(0,0,0,0);
  var close=Day.eventPairs(moods,events||[],categories).close,key=localDay(day),now=new Date(today).getTime();
  for(var i=0;i<close.length;i++){
   var row=close[i],event=timedEvents(events).filter(function(e){return e.category===row.category&&localDay(e.start)===key&&Date.parse(e.start)>now;}).sort(function(a,b){return Date.parse(a.start)-Date.parse(b.start);})[0];
   if(!event)continue;
   var before=(Date.parse(event.start)-day.getTime())/60000-20,after=(Date.parse(event.end)-day.getTime())/60000+5;
   if(before<firstMinute||after>lastMinute)continue;
   var plain=slots.filter(function(s){return s.kind==="usual"||s.kind==="spaced";});
   if(plain.length<2)continue;
   var dropped=plain.slice().sort(function(a,b){return Math.min(Math.abs(a.minute-before),Math.abs(a.minute-after))-Math.min(Math.abs(b.minute-before),Math.abs(b.minute-after));}).slice(0,2);
   var kept=slots.filter(function(s){return dropped.indexOf(s)<0;});
   if(kept.some(function(s){return Math.abs(s.minute-before)<SLOT_GAP||Math.abs(s.minute-after)<SLOT_GAP;}))continue;
   return kept.concat([{kind:"pair",side:"before",minute:before,time:timeOf(before%1440),category:row.category,count:row.count},{kind:"pair",side:"after",minute:after,time:timeOf(after%1440),category:row.category,count:row.count}]).sort(function(a,b){return a.minute-b.minute;});
  }
  return slots;
 }
 function smartPlan(moods,health,from,to,count,today,preferences){
  var prefs=Object.assign({windDown:true,brief:false,hardest:"varies"},preferences),start=minutesOf(from),end=timeOf(dayEnd(from,to));
  function within(time){var minutes=minutesOf(time);return timeOf(minutes<start?minutes+1440:minutes);}
  var estimate=bedtimeEstimate(health,moods,to,today),alarmBed=bedtimeForAlarm((prefs.alarms||[]).concat(morningEvents(prefs.events,today)),health,today);
  if(alarmBed){var earlier=timeOf(minutesOf(alarmBed.bed)-20);if(nightMinutes(minutesOf(earlier))<nightMinutes(minutesOf(estimate.time)))estimate=alarmBed.alarm.eventMin===undefined?{time:earlier,source:"alarm",alarmMin:alarmBed.alarm.timeMin}:{time:earlier,source:"event",eventMin:alarmBed.alarm.eventMin};}
  var bedTime=within(estimate.time),bedtime=prefs.windDown&&bedTime<=end?bedTime:null;
  var wake=morningAlarm(prefs.alarms,today),morning=timeOf(wake?wake.timeMin+15:start+30),briefAt=prefs.brief&&morning<=end&&morning!==bedtime?morning:null;
  var hardAt=hardTime(prefs.hardest,from,end,bedtime,briefAt),wanted=[];
  if(bedtime)wanted.push({time:bedtime,kind:"bedtime",source:estimate.source,alarmMin:estimate.alarmMin,eventMin:estimate.eventMin});
  if(briefAt)wanted.push({time:briefAt,kind:"brief",alarmMin:wake?wake.timeMin:undefined});
  if(hardAt)wanted.push({time:hardAt,kind:"hard",part:prefs.hardest});
  var kept=wanted.slice(0,count),fixed=kept.map(function(slot){return slot.time;});
  function clock(time){return timeOf(minutesOf(time)%1440);}
  function at(kind){var slot=kept.find(function(s){return s.kind===kind;});return slot?clock(slot.time):null;}
  // Inside the plan, times after midnight run past 24:00 so they sort last; each slot keeps that as its minute.
  var slots=kept.concat(fillGaps(moods,fixed,from,end,count-kept.length,today)).sort(function(a,b){return a.time<b.time?-1:1;}).map(function(slot){return Object.assign({},slot,{minute:minutesOf(slot.time),time:clock(slot.time)});});
  var placed=placeAroundEvents(applyMoves(slots,prefs.moves),prefs.events,today,minutesOf(end));
  slots=addPair(placed.slots,moods,prefs.events,today,prefs.pairs,minutesOf(end),start);
  return{slots:slots,movedOut:placed.dropped,times:slots.map(function(slot){return slot.time;}),bedtimeAt:at("bedtime"),briefAt:at("brief"),hardAt:at("hard"),left:wanted.slice(count).map(function(slot){return slot.kind;})};
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
    if(at>now)items.push({at:at.toISOString(),kind:slot.kind==="usual"||slot.kind==="spaced"||slot.kind==="pair"?"custom":slot.kind,part:Day.partOf(slot.minute).id});
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
  var usual=Day.baseline(health.filter(function(h){return h.sleepHours>=3;}).map(function(h){return{date:h.date,value:h.sleepHours};}),today);
  return usual===null?RULES.sleepFallback:usual;
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
 var SAME_CHECK_INS=0.8,AFTER_EVENT_MS=300000,MOVED_SPACING=45,HELP_SAMPLES=RULES.helpSamples,HELP_GAP=RULES.helpGap,RESET_WINDOW_MS=7200000;
 var HELP_METRICS=[{key:"stress",direction:-1,name:"lower stress",worse:"higher stress"},{key:"score",direction:1,name:"better mood",worse:"lower mood"},{key:"energy",direction:1,name:"more energy",worse:"less energy"}];
 var HELP_ACTIVITIES=[["Exercise","moving","Fit in some movement."],["Outdoors","being outdoors","Get outside for a few minutes."],["Rest","rest","Take a real break."],["Social","time with people","Reach out to someone."],["Family","time with family","Make time for family."]];
 function helpFactors(moods,events,health,resets,now,tries){
  var days={},today=localDay(now),context=Day.build({health:health,events:events},now);
  health.forEach(function(h){days[h.date]=h;});
  function dayFactor(id,label,tip,key,met){
   return{id:id,label:label,tip:tip,test:function(m){var h=days[localDay(m.ts)];return h&&Number.isFinite(h[key])?met(h[key]):null;},done:!!days[today]&&Number.isFinite(days[today][key])&&met(days[today][key])};
  }
  // The person's own usual level once there's enough history, and a fixed starting point until then.
  function usual(key){
   return context.usual[key];
  }
  var usualSleepHours=usual("sleepHours"),usualSteps=usual("steps"),sleepLine=usualSleepHours===null?7:usualSleepHours,stepLine=usualSteps===null?6000:usualSteps;
  var factors=[
   dayFactor("sleep",usualSleepHours===null?"After 7 or more hours of sleep":"After your usual sleep or more","Protect your sleep tonight.","sleepHours",function(v){return v>=sleepLine;}),
   dayFactor("steps",usualSteps===null?"On days with 6,000 or more steps":"On days with your usual steps or more","Go for a walk.","steps",function(v){return v>=stepLine;}),
   {id:"workout",label:"On days with a workout",tip:"Fit in some movement.",
    test:function(m){var d=context.days[localDay(m.ts)],w=d&&d.workoutMin;return !w||w.status==="missing"?null:w.value>0;},
    done:!!context.days[today]&&!!context.days[today].workoutMin&&context.days[today].workoutMin.value>0}
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
  // A suggestion marked done is compared like a breathing exercise: the 2 hours after, against everything else.
  var triedTimes={};(tries||[]).forEach(function(item){var at=Date.parse(item.at);if(Number.isFinite(at))(triedTimes[item.id]=triedTimes[item.id]||[]).push(at);});
  factors.filter(function(factor){return triedTimes[factor.id];}).forEach(function(factor){
   var times=triedTimes[factor.id],today_done=times.some(function(at){return localDay(at)===today;});
   if(today_done)factor.done=true;
   factors.push({id:"tried:"+factor.id,label:"In the 2 hours after you marked “"+factor.tip.replace(/\.$/,"")+"” done",tip:factor.tip,done:today_done,
    test:function(m){var t=Date.parse(m.ts);return times.some(function(at){return t>=at&&t-at<=RESET_WINDOW_MS;});}});
  });
  // Subjects that describe a day or a moment rather than something to suggest.
  var alarms={};health.forEach(function(h){if(Number.isFinite(h.firstAlarmMin))alarms[h.date]=h.firstAlarmMin;});
  var usualHrv=usual("hrv");
  factors.push(dayFactor("short-sleep",usualSleepHours===null?"After under 6.5 hours of sleep":"After less sleep than your usual","","sleepHours",function(v){return v<Day.shortSleepLine(usualSleepHours);}));
  var usualResting=usual("restingHR");
  // Personal context only, compared with the person's own level.
  if(usualResting!==null)factors.push(dayFactor("resting","On days with resting heart rate above your usual","","restingHR",function(v){return v>usualResting;}));
  var usualBusy=context.usual.busyMinutes;
  if(usualBusy!==null){factors.push({id:"busy",label:"On days with more on your calendar than usual",test:function(m){var d=context.days[localDay(m.ts)];return d&&d.calendar?d.calendar.busyMinutes>usualBusy:null;}});}
  // Shaped like the breathing factor: only a day with events can say yes or no.
  factors.push({id:"stretch",label:"In the 2 hours after a long back-to-back stretch",test:function(m){
   var d=context.days[localDay(m.ts)],t=Date.parse(m.ts);
   if(!d||!d.calendar)return null;
   return d.calendar.stretches.some(function(s){return t>=s[1]&&t-s[1]<=RESET_WINDOW_MS;});
  }});
  factors.push({id:"early-alarm",label:"On days with an alarm before 7 AM",test:function(m){var at=alarms[localDay(m.ts)];return at===undefined?null:at<EARLY_ALARM;}});
  if(usualHrv!==null)factors.push(dayFactor("hrv","On days with heart rate variability above your usual","","hrv",function(v){return v>=usualHrv;}));
  var named={},categories={};HELP_ACTIVITIES.forEach(function(item){named[item[0]]=true;});
  moods.forEach(function(m){(m.tags||[]).forEach(function(tag){if(!named[tag])named[tag]=factors.push({id:"tag:"+tag,label:tag,test:function(c){return(c.tags||[]).indexOf(tag)>=0;}});});});
  events.forEach(function(e){if(e.category&&e.category!=="Other"&&!categories[e.category]&&!HELP_ACTIVITIES.some(function(item){return item[0]===e.category;}))categories[e.category]=true;});
  Object.keys(categories).forEach(function(category){
   var spans=events.filter(function(e){return e.category===category;}).map(function(e){return[new Date(e.start).getTime(),new Date(e.end).getTime()+NEAR_EVENT_MS];});
   factors.push({id:"event:"+category,label:"Around "+category.toLowerCase()+" events",test:function(m){var t=Date.parse(m.ts);return spans.some(function(s){return t>=s[0]&&t<=s[1];});}});
  });
  return factors;
 }
 // A pattern counts as consistent only when it points the same way in the older and newer half of its check-ins.
 function holdsThroughout(factor,moods,metric,gap){
  var sorted=moods.slice().sort(function(a,b){return Date.parse(a.ts)-Date.parse(b.ts);}),middle=Math.floor(sorted.length/2);
  return [sorted.slice(0,middle),sorted.slice(middle)].every(function(half){
   var yes=[],no=[];
   half.forEach(function(m){var value=m[metric.key];if(!Number.isInteger(value))return;var met=factor.test(m);if(met===null||met===undefined)return;(met?yes:no).push(value);});
   return yes.length>0&&no.length>0&&(mean(yes)-mean(no))*metric.direction*gap>0;
  });
 }
 // Every comparison comes from here: one minimum per group and one smallest difference.
 // A positive gap means feeling better, whichever way the measure runs.
 function effectsOf(factor,moods){
  var effects=[];
  HELP_METRICS.forEach(function(metric){
   var yes=[],no=[];
   moods.forEach(function(m){
    var value=m[metric.key];if(!Number.isInteger(value)||value<1||value>5)return;
    var met=factor.test(m);if(met===null||met===undefined)return;(met?yes:no).push(value);
   });
   if(yes.length<HELP_SAMPLES||no.length<HELP_SAMPLES)return;
   var gap=(mean(yes)-mean(no))*metric.direction;
   if(Math.abs(gap)>=HELP_GAP)effects.push({metric:metric.key,name:gap>0?metric.name:metric.worse,gap:gap,withCount:yes.length,withoutCount:no.length,consistent:holdsThroughout(factor,moods,metric,gap)});
  });
  return effects.sort(function(a,b){return Math.abs(b.gap)-Math.abs(a.gap);});
 }
 function recent(moods,now){var cutoff=now.getTime()-HISTORY_DAYS*DAY_MS;return moods.filter(function(m){return Date.parse(m.ts)>=cutoff;});}
 function subjectOf(id){
  if(id==="workout")return"Exercise";
  if(id==="sleep"||id==="short-sleep")return"Sleep";
  return id.replace(/^tried:/,"").replace(/^(tag|event):/,"").replace(/^workout$/,"Exercise");
 }
 // Each subject once, with its strongest result, strongest first. Comparisons about the same subject, or nearly the
 // same check-ins, count as one piece of evidence and appear in its detail. Disagreement between them is shown as mixed.
 function findings(moods,events,health,resets,today,tries){
  var now=new Date(today),window=recent(moods,now),rows=[];
  helpFactors(moods,events,health,resets,now,tries).forEach(function(factor){
   var effect=effectsOf(factor,window)[0];
   if(effect)rows.push({id:factor.id,label:factor.label,effect:effect,subject:subjectOf(factor.id),also:[],mixed:false,matched:window.filter(function(m){return factor.test(m)===true;})});
  });
  rows.sort(function(a,b){return Math.abs(b.effect.gap)-Math.abs(a.effect.gap);});
  function overlap(a,b){
   var shared=a.matched.filter(function(m){return b.matched.indexOf(m)>=0;}).length,smaller=Math.min(a.matched.length,b.matched.length);
   return smaller>0&&shared/smaller>=SAME_CHECK_INS;
  }
  var kept=[];
  rows.forEach(function(row){
   var lead=kept.filter(function(k){return k.subject===row.subject||overlap(k,row);})[0];
   if(!lead){kept.push(row);return;}
   lead.also.push({label:row.label,effect:row.effect});
   if(row.effect.gap*lead.effect.gap<0)lead.mixed=true;
  });
  kept.forEach(function(row){delete row.matched;});
  return kept;
 }
 function whatHelps(moods,events,health,resets,today,tries){
  var now=new Date(today),rows=[],window=Day.evidence(moods,now);
  helpFactors(moods,events,health,resets,now,tries).forEach(function(factor){
   if(!factor.tip)return;
   if(factor.tag)factor.done=factor.done||moods.some(function(m){return localDay(m.ts)===localDay(now)&&(m.tags||[]).indexOf(factor.tag)>=0;});
   var effects=effectsOf(factor,window).filter(function(e){return e.gap>0;});
   if(effects.length)rows.push({id:factor.id,label:factor.label,tip:factor.tip,action:factor.action,done:factor.done,effects:effects});
  });
  rows.sort(function(a,b){return b.effects[0].gap-a.effects[0].gap;});
  // Something the person actually tried outranks a correlation about the same subject.
  rows.filter(function(row){return /^tried:/.test(row.id);}).forEach(function(row){
   var from=rows.indexOf(row),to=rows.findIndex(function(other){return subjectOf(other.id)===subjectOf(row.id);});
   if(to<from){rows.splice(from,1);rows.splice(to,0,row);}
  });
  return rows.slice(0,5);
 }
 // Suggestions a person can do and say they did.
 var DOABLE=/^(steps|workout|tag:.+)$/;
 function helpEvidence(effect){return effect.gap.toFixed(1)+" points, from "+effect.withCount+" check-ins compared with "+effect.withoutCount+". A pattern, not proof of cause.";}
 function helpSentence(row,effect){return row.label+", you’ve tended to report "+effect.name+".";}
 // Something that has gone with feeling better and hasn't happened yet today, fitted to how the person last felt.
 function helpAction(data,now){
  var helps=whatHelps(data.moods,data.events,data.health,data.resets,now,data.tries).filter(function(row){return !row.done;});
  var cutoff=now.getTime()-6*3600000,latest=data.moods.filter(function(m){return Date.parse(m.ts)>=cutoff&&Date.parse(m.ts)<=now.getTime();}).sort(function(a,b){return Date.parse(b.ts)-Date.parse(a.ts);})[0];
  var wanted=!latest?null:latest.stress>=4?"stress":latest.score<=2?"score":latest.energy&&latest.energy<=2?"energy":null;
  var lead={stress:"You noted high stress.",score:"You noted a low mood.",energy:"You noted low energy."};
  function usable(row){return row.id==="sleep"?now.getHours()>=18:now.getHours()<19||row.id==="reset";}
  var pick=null,effect=null;
  if(wanted)helps.some(function(row){var match=row.effects.filter(function(e){return e.metric===wanted;})[0];if(match&&usable(row)){pick=row;effect=match;return true;}return false;});
  if(!pick){pick=helps.filter(usable)[0];effect=pick&&pick.effects[0];wanted=null;}
  if(!pick)return null;
  var base=pick.id.replace(/^tried:/,"");
  return{text:(wanted?lead[wanted]+" ":"")+pick.tip+" "+helpSentence(pick,effect),why:helpEvidence(effect),action:pick.action,label:pick.action?"Take a minute":undefined,tryId:DOABLE.test(base)?base:undefined};
 }
 var ANTICIPATE_GAP=0.4,MAX_ANTICIPATED_A_DAY=2,ANTICIPATE_DAYS=7;
 function clockLabel(date){return new Date(date).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});}
 function minuteLabel(minutes){var d=new Date(2024,0,1);d.setHours(0,minutes,0,0);return clockLabel(d);}
 function eventGap(moods,events,category){
  var spans=events.filter(function(e){return e.category===category;}).map(function(e){return[new Date(e.start).getTime(),new Date(e.end).getTime()+NEAR_EVENT_MS];}),yes=[],no=[];
  rated(moods).forEach(function(m){var t=new Date(m.ts).getTime();(spans.some(function(s){return t>=s[0]&&t<=s[1];})?yes:no).push(m.stress);});
  return comparison(category,yes,no);
 }
 function usualSleepHours(health,now){return Day.baseline(health.map(function(h){return{date:h.date,value:h.sleepHours};}),now);}
 function sleepGap(moods,health,now){
  var sleep={},short=[],rested=[],line=Day.shortSleepLine(usualSleepHours(health,now));
  health.forEach(function(h){if(Number.isFinite(h.sleepHours))sleep[h.date]=h.sleepHours;});
  rated(moods).forEach(function(m){var hours=sleep[localDay(m.ts)];if(hours!==undefined)(hours<line?short:rested).push(m.stress);});
  return comparison("sleep",short,rested);
 }
 function evidence(row){return"Stress averaged "+row.gap.toFixed(1)+" points higher, from "+row.withCount+" check-ins compared with "+row.withoutCount+".";}
 // The part of a weekday with the highest stress, given at least two check-ins there.
 function hardestPart(moods,weekday){
  var groups={};
  rated(moods).forEach(function(m){var d=new Date(m.ts);if(d.getDay()!==weekday)return;var key=Day.partOf(d.getHours()*60+d.getMinutes()).id;(groups[key]=groups[key]||[]).push(m.stress);});
  var best=null;
  Day.PARTS.forEach(function(p){var values=groups[p.id];if(values&&values.length>=2&&(!best||mean(values)>best.score))best={part:p,score:mean(values)};});
  return best&&best.part;
 }
 // Moments ahead that past check-ins suggest may be harder. Each needs evidence and leads to an action.
 // Weekday names keep their capital after a first name.
 function addressed(message,name){
  if(!name)return message;
  return name+", "+(DAYS.indexOf(message.split(" ")[0])>=0?message:message[0].toLowerCase()+message.slice(1));
 }
 function anticipate(moods,events,health,today,prefs){
  var now=new Date(today),found=[],from=minutesOf(prefs.from),to=dayEnd(prefs.from,prefs.to),allMoods=moods;
  moods=Day.evidence(allMoods,now);
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
   var at=new Date(date);at.setHours(0,part.nudge,0,0);
   add(at,day.name+" "+part.id+"s have tended to be harder for you. Take a minute before it starts?",day.samples+" "+day.name+" check-ins in the last 8 weeks.");
  });
  var lastNight=health.find(function(h){return h.date===localDay(now);}),sleepRow=sleepGap(moods,health,now);
  if(lastNight&&Number.isFinite(lastNight.sleepHours)&&lastNight.sleepHours<Day.shortSleepLine(usualSleepHours(health,now))&&sleepRow&&sleepRow.gap>=ANTICIPATE_GAP){
   var midMorning=new Date(now);midMorning.setHours(0,from+180,0,0);
   add(midMorning,"A short night. Those days have tended to be harder for you, so protect a break today.",evidence(sleepRow));
  }
  var helper=whatHelps(allMoods,events,health,prefs.resets,now,prefs.tries).filter(function(row){return row.id!=="sleep";})[0];
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
  var now=new Date(today),actions=[],ahead=anticipate(data.moods,data.events,data.health,now,Object.assign({},prefs,{resets:data.resets,tries:data.tries})).filter(function(a){return localDay(a.at)===localDay(now);})[0];
  if(ahead)actions.push({text:ahead.message,why:ahead.why,action:"reset",label:"Take a minute"});
  var alarmBed=bedtimeForAlarm(data.alarms,data.health,now);
  if(alarmBed&&now.getHours()>=17){
   var name=alarmBed.alarm.label?" (“"+alarmBed.alarm.label+"”)":"";
   actions.push({text:"Your alarm"+name+" is at "+minuteLabel(alarmBed.alarm.timeMin)+" tomorrow. For your usual sleep, be in bed by "+minuteLabel(minutesOf(alarmBed.bed))+"."});
  }
  var help=helpAction(data,now);
  if(help)actions.push(help);
  if(data.connected&&(!data.lastUpload||now.getTime()-new Date(data.lastUpload).getTime()>RULES.staleHours*3600000))actions.push({text:"Run Even Sync to bring in last night’s sleep and your calendar.",action:"sync",label:"Run Even Sync"});
  return actions.slice(0,3);
 }
 var api={learnedMoves:learnedMoves,validDay:validDay,weekSchedule:weekSchedule,whatHelps:whatHelps,anticipate:anticipate,nextActions:nextActions,bedtimeForAlarm:bedtimeForAlarm,morningAlarm:morningAlarm,alarmsOn:alarmsOn,smartPlan:smartPlan,bedtimeReminder:bedtimeReminder,smartTimes:smartTimes,repeatTimes:repeatTimes,outlook:outlook,findings:findings,brief:brief,briefFor:briefFor,hardStretch:hardStretch,steadiness:steadiness,reflectionDue:reflectionDue,REFLECTION:REFLECTION};
 root.EvenCoach=api;
 if(typeof document==="undefined"||!root.EvenApp)return;

 var LEVELS={harder:"Tends to be harder",easier:"Tends to be easier",typical:"About average",unknown:"Not enough check-ins"};
 var reflectionSnoozed=false;
 var STEPS=["Breathe in","Hold","Breathe out","Hold"],breathTimer=null,breathDelay=null;
 function $(id){return document.getElementById(id);}
 function element(tag,className,text){var e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}

 function openReset(){if(!$("reset-dialog").open){$("reset-dialog").showModal();startBreathing();}}
 function saveBriefs(days,helper,name,hard,todayText){
  if(!("caches" in root))return;
  var body={};days.forEach(function(d){if(d.level!=="unknown")body[d.date]=d.level==="harder"?brief(d,helper,name):(name?"Good morning, "+name+". ":"")+brief(d,helper);});
  if(days[0]&&todayText&&days[0].level!=="unknown")body[days[0].date]=days[0].level==="harder"?todayText:(name?"Good morning, "+name+". ":"")+todayText;
  if(hard&&days[0])body[days[0].date]=(body[days[0].date]||(name?"Good morning, "+name+".":"Good morning."))+" It’s been a hard few days. Talking to someone can help.";
  if(!Object.keys(body).length)return;
  caches.open(BRIEF_CACHE).then(function(cache){return cache.put("/brief",new Response(JSON.stringify(body)));}).catch(function(){});
 }
 function renderToday(data){
  var personal=data.moods,now=new Date(),days=outlook(personal,now);
  var helper=whatHelps(personal,data.events,data.health,data.resets,now,data.tries).filter(function(row){return row.id!=="sleep";})[0];
  var today=briefFor(days[0],helper,data.firstName,data,now);
  $("today-brief-text").textContent=personal.length?today.text:"Your first check-in starts your pattern.";
  $("hard-stretch").hidden=!hardStretch(personal,now);
  $("hard-stretch-text").textContent="It’s been a hard few days"+(data.firstName?", "+data.firstName:"")+". Talking to someone can help.";
  saveBriefs(days,helper,data.firstName,hardStretch(personal,now),today.text);
  renderActions(data,personal,now);
 }
 function renderActions(data,personal,now){
  var box=$("next-actions"),actions=nextActions({moods:personal,events:data.events,health:data.health,alarms:data.alarms,resets:data.resets,tries:data.tries,connected:data.connected,lastUpload:data.lastUpload},now,data.notifyPrefs);
  box.textContent="";box.hidden=!actions.length;
  actions.forEach(function(item){
   var row=element("div","next-action"),text=element("div");
   text.appendChild(element("p","",item.text));
   if(item.why){var more=element("details"),summary=element("summary","","Why this");more.appendChild(summary);more.appendChild(element("p","muted",item.why));text.appendChild(more);}
   row.appendChild(text);
   if(item.tryId){var done=element("button","text-action next-done","Done");done.type="button";done.setAttribute("aria-label","Mark done: "+item.text);done.addEventListener("click",function(){root.EvenApp.logTry(item.tryId);});row.appendChild(done);}
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
 function findingRow(r){
  var box=element("div"),row=element("div","outlook-row"),text=element("div");
  text.appendChild(element("strong","",r.label));
  text.appendChild(element("small","",r.effect.withCount+" check-ins with, "+r.effect.withoutCount+" without"+(r.mixed?" · Mixed":r.effect.consistent?"":" · An early sign")));
  row.appendChild(text);row.appendChild(element("span","outlook-level",Math.abs(r.effect.gap).toFixed(1)+" points "+r.effect.name));
  box.appendChild(row);
  if(r.also.length){
   var why=element("details","finding-why");why.appendChild(element("summary","","Why"));
   if(r.mixed)why.appendChild(element("p","muted","These point in different directions, so treat this with care."));
   r.also.forEach(function(other){why.appendChild(element("p","muted",other.label+": "+Math.abs(other.effect.gap).toFixed(1)+" points "+other.effect.name+", "+other.effect.withCount+" with, "+other.effect.withoutCount+" without"));});
   box.appendChild(why);
  }
  return box;
 }
 function renderFindings(moods,events,health,resets,tries){
  var rows=findings(moods,events,health,resets,new Date(),tries),top=$("top-findings"),rest=$("more-findings");
  top.textContent="";rest.textContent="";
  if(!rows.length){top.appendChild(element("p","muted","Keep checking in with stress, energy and tags. This fills in after a few weeks."));}
  rows.slice(0,3).forEach(function(r){top.appendChild(findingRow(r));});
  if(rows.length)top.appendChild(element("p","muted","Last 8 weeks, through "+new Date(Math.max.apply(null,moods.map(function(m){return Date.parse(m.ts);}))).toLocaleDateString(undefined,{month:"short",day:"numeric"})+". Each needs at least 5 check-ins each way and a 0.4 point difference. A pattern in your check-ins, not proof of cause."));
  rows.slice(3).forEach(function(r){rest.appendChild(findingRow(r));});
  $("more-findings-section").hidden=rows.length<4;
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
   // Only a finished round counts toward what tends to help.
   if(step===0&&cycles===1)root.EvenApp.logReset();
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
  renderFindings(source.moods,source.events,source.health,isDemo?[]:data.resets,isDemo?[]:data.tries);
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
