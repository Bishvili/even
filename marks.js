// Turns an icon into the marks the app shows. The build and the browser share this, so there is one copy.
// An icon here is its SVG with its three colors written %c% (background), %h% (highlight) and %l% (line).
(function(root){
 function neutral(svg){return svg.replace(/\{\{color\.contrast\.light\}\}/g,"%c%").replace(/\{\{color\.highlight\.light\}\}/g,"%h%").replace(/\{\{color\.on-contrast\.light\}\}/g,"%l%").replace(/\s*xmlns="[^"]*"/,"").trim();}
 function attr(svg,name){var match=svg.match(new RegExp("^<svg[^>]*\\s"+name+'="([^"]+)"'));return match?match[1]:"";}
 function inner(svg){return svg.replace(/^[\s\S]*?<svg[^>]*>/,"").replace(/<\/svg>\s*$/,"");}
 // Colors become classes, so the mark follows the palette in both appearances.
 function classes(svg,highlight){
  return svg.replace(/<\w+\b[^>]*>/g,function(tag){
   var names=[];
   var out=tag.replace(/\sfill="%h%"/,function(){if(highlight)return ' fill="'+highlight+'"';names.push("icon-sand");return "";})
    .replace(/\sfill="%c%"/,function(){names.push("icon-deep");return "";})
    .replace(/\sstroke="%l%"/,function(){names.push("icon-line");return "";});
   return names.length?out.replace(/^<\w+/,function(open){return open+' class="'+names.join(" ")+'"';}):out;
  });
 }
 // For places an icon sits on its own: the first shape is its background, and its main color follows the surface.
 function mark(svg){
  return '<svg viewBox="'+(attr(svg,"viewBox")||"0 0 512 512")+'">'+classes(inner(svg).replace(/<rect\b[^>]*\/>/,""),"currentColor").replace(/\sdata-pull="\w+"/g,"")+"</svg>";
 }
 // Rising parts start hidden behind the horizon, and lines start undrawn. refresh.js moves them as the page is pulled.
 function pull(svg){
  var box=attr(svg,"viewBox")||"0 0 512 512",horizon=attr(svg,"data-horizon"),rise=attr(svg,"data-rise");
  if(!horizon||!rise)return '<svg viewBox="'+box+'" aria-hidden="true">'+classes(inner(svg))+"</svg>";
  var parts=inner(svg).replace(/<g data-pull="rise"[^>]*>[\s\S]*?<\/g>|<\w+ data-pull="rise"[^>]*\/>/g,function(part){return '<g clip-path="url(#pull-horizon)">'+part+"</g>";})
   .replace(/<\w+ data-pull="line"[^>]*\/>/g,function(line){return line.replace(/\/>$/,' pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"'+(/\sfill=/.test(line)?"":' fill="none"')+"/>");});
  return '<svg viewBox="'+box+'" aria-hidden="true" data-rise="'+rise+'"><defs><clipPath id="pull-horizon"><rect width="512" height="'+horizon+'"/></clipPath></defs>'+classes(parts)+"</svg>";
 }
 // The whole icon in fixed colors, for a preview and the tab icon.
 function tile(svg,colors){return svg.replace(/%c%/g,colors.contrast).replace(/%h%/g,colors.highlight).replace(/%l%/g,colors.line);}
 root.Marks={neutral:neutral,mark:mark,pull:pull,tile:tile};
})(globalThis);
