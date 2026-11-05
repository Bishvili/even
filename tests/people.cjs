"use strict";
// Fictional people, each pinning one situation. Every record is built from a fixed date, so the results never drift.
const TODAY=new Date(2026,10,3,12);// a Tuesday
const DAY_MS=86400000;
const at=(daysAgo,hour=12,minute=0)=>{const d=new Date(TODAY);d.setDate(d.getDate()-daysAgo);d.setHours(hour,minute,0,0);return d.toISOString();};
const day=daysAgo=>{const d=new Date(at(daysAgo));return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
const span=(daysAgo,hour,minutes,category,title="Event")=>({id:"e"+daysAgo+"-"+hour+"-"+category,title,category,start:at(daysAgo,hour),end:new Date(Date.parse(at(daysAgo,hour))+minutes*60000).toISOString()});
const PREFS={from:"08:00",to:"22:00",count:4,mode:"smart",windDown:true,brief:true,hardest:"varies",weekends:true,customTimes:[]};
const base=extra=>({moods:[],events:[],health:[],alarms:[],resets:[],connected:false,lastUpload:null,prefs:PREFS,...extra});

function regularMoods(days=40){
 const moods=[];
 for(let i=0;i<days;i++){
  const weekday=new Date(at(i)).getDay(),hard=weekday===2;
  moods.push({id:"am"+i,ts:at(i,9),score:hard?2:4,stress:hard?4:2,energy:3,tags:i%3===0?["Exercise"]:[]});
  moods.push({id:"pm"+i,ts:at(i,18,30),score:i%3===0?4:3,stress:i%3===0?2:3,energy:i%3===0?4:3,tags:[]});
 }
 return moods;
}
function regularHealth(days=40){
 const health=[];
 for(let i=0;i<days;i++)health.push({date:day(i),source:"shortcut",sleepHours:i%4===0?6:7.5,steps:i%3===0?9000:4000,workoutMin:i%3===0?30:0,restingHR:60+i%3,hrv:40+i%5,bedtimeMin:1380});
 return health;
}
function regularEvents(days=30){
 const events=[];
 for(let i=-1;i<days;i++){
  events.push(span(i,10,60,"Meeting"));
  if(i%3===0)events.push(span(i,12,45,"Social"));
 }
 return events;
}
const people={
 regular:()=>base({moods:regularMoods(),health:regularHealth(),events:regularEvents(),alarms:[{timeMin:390,days:[1,2,3,4,5],enabled:true,label:"Up"}],connected:true,lastUpload:at(0,7)}),
 shiftWorker:()=>{
  const moods=[],health=[];
  for(let i=0;i<30;i++){moods.push({id:"n"+i,ts:at(i,19),score:3,stress:3,tags:[]},{id:"d"+i,ts:at(i,5),score:i%2?2:4,stress:i%2?4:2,tags:[]});health.push({date:day(i),source:"shortcut",sleepHours:7,bedtimeMin:510});}
  return base({moods,health,connected:true,lastUpload:at(0,7),prefs:{...PREFS,from:"17:00",to:"06:00"}});
 },
 weekendLateSleeper:()=>{
  const health=[];
  for(let i=0;i<20;i++){const night=new Date(Date.parse(at(i))-DAY_MS).getDay(),weekend=night===5||night===6;health.push({date:day(i),source:"shortcut",sleepHours:weekend?9:7,bedtimeMin:weekend?60:1350});}
  return base({moods:regularMoods(20),health,connected:true,lastUpload:at(0,7)});
 },
 noCalendar:()=>base({moods:regularMoods(),health:regularHealth(),connected:true,lastUpload:at(0,7)}),
 noHealth:()=>base({moods:regularMoods(),events:regularEvents()}),
 brandNew:()=>base({}),
 staleSync:()=>base({moods:regularMoods(),health:regularHealth().filter((h,i)=>i>1),events:regularEvents(),connected:true,lastUpload:new Date(TODAY.getTime()-30*3600000).toISOString()}),
 workoutFreeDays:()=>{
  const health=[],moods=[];
  for(let i=0;i<24;i++){
   health.push(i%2?{date:day(i),source:"shortcut",steps:5000}:{date:day(i),source:"shortcut",steps:5000,workoutMin:30});
   moods.push({id:"m"+i,ts:at(i,18),score:i%2?3:5,stress:i%2?4:2,tags:[]});
  }
  return base({moods,health,connected:true,lastUpload:at(0,7)});
 },
 noExerciseData:()=>{
  const health=[],moods=[];
  for(let i=0;i<24;i++){health.push({date:day(i),source:"shortcut",steps:5000});moods.push({id:"m"+i,ts:at(i,18),score:3,stress:3,tags:[]});}
  return base({moods,health,connected:true,lastUpload:at(0,7)});
 },
 latePartsOfDay:()=>{
  const moods=[];
  for(let i=0;i<12;i++)moods.push({id:"a"+i,ts:at(i,14,30),score:4,stress:2,tags:[]},{id:"b"+i,ts:at(i,18),score:3,stress:3,tags:[]},{id:"c"+i,ts:at(i,1),score:2,stress:4,tags:[]});
  return base({moods});
 },
 oldHistoryOnly:()=>{
  const moods=[];
  for(let i=0;i<12;i++)moods.push({id:"o"+i,ts:at(60+i*2,12),score:i%2?5:2,stress:i%2?1:5,tags:i%2?["Rest"]:[]});
  return base({moods});
 }
};
module.exports={TODAY,PREFS,people,at,day,span};
