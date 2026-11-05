// Turns a few main colors into the full palette. Each role keeps its own lightness and follows its family's change in hue and saturation,
// so the main colors the palette was designed with give back exactly the palette as written.
const parse=color=>{
 let match=color.match(/^#([0-9a-f]{3,8})$/i);
 if(match){
  const hex=match[1].length<6?[...match[1]].map(digit=>digit+digit).join(""):match[1];
  return [0,2,4].map(at=>parseInt(hex.slice(at,at+2),16)).concat(hex.length===8?parseInt(hex.slice(6),16)/255:1);
 }
 match=color.match(/^rgba?\(([\d.,\s]+)\)$/i);
 if(!match)throw Error("can't read color "+color);
 const parts=match[1].split(",").map(Number);
 return [parts[0],parts[1],parts[2],parts.length>3?parts[3]:1];
};
function toHsl([r,g,b]){
 const[R,G,B]=[r/255,g/255,b/255],max=Math.max(R,G,B),min=Math.min(R,G,B),l=(max+min)/2,d=max-min;
 if(!d)return [0,0,l];
 const h=max===R?((G-B)/d+6)%6:max===G?(B-R)/d+2:(R-G)/d+4;
 return [h*60,d/(1-Math.abs(2*l-1)),l];
}
function fromHsl([h,s,l]){
 const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
 const[r,g,b]=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h/60)%6];
 return [r,g,b].map(value=>Math.round((value+m)*255));
}
const hex=rgb=>"#"+rgb.map(value=>value.toString(16).padStart(2,"0")).join("").toUpperCase();
function shift(color,from,to){
 const[a,b]=[toHsl(parse(from)),toHsl(parse(to))],[r,g,bl,alpha]=parse(color),[h,s,l]=toHsl([r,g,bl]);
 const ratio=a[1]?b[1]/a[1]:1,rgb=fromHsl([(h+b[0]-a[0]+360)%360,Math.min(1,s*ratio),l]);
 return alpha===1?hex(rgb):"rgba("+rgb.join(",")+","+alpha+")";
}
function resolve(palette,colors){
 const out={};
 for(const group of["app","paper"]){
  out[group]={};
  for(const[role,values]of Object.entries(palette[group])){
   const family=Object.keys(palette.main).find(name=>palette.families[name].includes(role));
   out[group][role]={};
   for(const mode of["light","dark"]){
    const from=family&&palette.main[family],to=family&&colors[family],color=values[mode];
    out[group][role][mode]=!family||from.toLowerCase()===to.toLowerCase()?color:color.toLowerCase()===from.toLowerCase()?to:shift(color,from,to);
   }
  }
 }
 return out;
}
const luminance=color=>{const[r,g,b]=parse(color).map(value=>value/255);return [r,g,b].reduce((sum,value,at)=>sum+[.2126,.7152,.0722][at]*(value<=.03928?value/12.92:((value+.055)/1.055)**2.4),0);};
const contrast=(a,b)=>{const[x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
// What people read must stay readable on what it sits on, in both appearances.
const PAIRS=[["text","page"],["text","surface"],["text-muted","page"],["text-muted","surface"],["accent","surface"],["on-accent","primary"]];
function checkReadable({app}){
 for(const mode of["light","dark"])for(const[front,back]of PAIRS){
  const ratio=contrast(app[front][mode],app[back][mode]);
  if(ratio<4.5)throw Error(front+" on "+back+" is too faint in "+mode+" ("+ratio.toFixed(1)+":1, needs 4.5:1)");
 }
}
module.exports={resolve,checkReadable,contrast};
