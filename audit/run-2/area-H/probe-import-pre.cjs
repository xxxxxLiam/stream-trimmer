const path=require("node:path");
const {buildStubRoot,script}=require("/home/user/stream-trimmer/audit/run-2/area-H/lib/stub.cjs");
const H=require("/home/user/stream-trimmer/audit/run-2/area-H/lib/h2.cjs");
const STUB="/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";
(async()=>{
 buildStubRoot(STUB); script(STUB,{exitCode:0,stderr:"",delayMs:0,writeMedia:true,authFail:false});
 const a=await H.open({label:"h2-imp",cwd:STUB,outDir:"/home/user/stream-trimmer/audit/run-2/area-H/out/imp",skipSeeded:true,seed:{"clipper.campaigns":[{id:"c1",name:"Acme Q4",targetMinSec:30,targetMaxSec:60,hardMaxSec:90,clipIdPattern:"{prefix}{nn}",prefix:"A",format:"mp4",quality:"best",clipsDir:"",dataDir:"",usedRanges:[]}],"clipper.activeCampaign":"c1"}});
 await H.setSize(a,1280,700); await H.loadVideo(a);
 console.log("tabs:",await a.win.evaluate(()=>[...document.querySelectorAll('[role="tab"]')].map(t=>t.id+":"+t.innerText.trim())));
 await a.win.click("#clips-tab-bank"); await a.win.waitForTimeout(900);
 console.log("buttons:",await a.win.evaluate(()=>[...document.querySelectorAll("#ui-col-clips button")].map(b=>b.innerText.trim().slice(0,30))));
 await a.win.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>/^Import timestamps$/i.test((x.innerText||"").trim()));if(b)b.click();else throw new Error("no import button");});
 await a.win.waitForTimeout(1200);
 const r=await a.win.evaluate(()=>[...document.querySelectorAll("pre")].map(el=>{const s=getComputedStyle(el);const rr=el.getBoundingClientRect();el.focus({preventScroll:true});
  return{overflowX:s.overflowX,overflowY:s.overflowY,sb:s.scrollbarWidth,w:Math.round(rr.width),hiddenX:el.scrollWidth-el.clientWidth,hiddenY:el.scrollHeight-el.clientHeight,
  gutterX:el.offsetHeight-el.clientHeight,gutterY:el.offsetWidth-el.clientWidth,tabIndex:el.tabIndex,focusOk:document.activeElement===el,text:(el.innerText||"").slice(0,40)};}));
 console.log("pres:",JSON.stringify(r,null,1));
 await H.setSize(a,900,700); await a.win.waitForTimeout(600);
 const r2=await a.win.evaluate(()=>[...document.querySelectorAll("pre")].map(el=>{const s=getComputedStyle(el);el.focus({preventScroll:true});el.scrollLeft=0;
  return{hiddenX:el.scrollWidth-el.clientWidth,gutterX:el.offsetHeight-el.clientHeight,sb:s.scrollbarWidth,focusOk:document.activeElement===el,text:(el.innerText||"").slice(0,30)};}));
 console.log("at 900 wide:",JSON.stringify(r2,null,1));
 // keyboard: Tab to the first overflowing pre, then ArrowRight/End
 const res=await (async()=>{ await a.win.evaluate(()=>{const p=[...document.querySelectorAll("pre")].find(e=>e.scrollWidth>e.clientWidth+2); if(p){p.setAttribute("data-k","1");p.scrollLeft=0;} document.activeElement?.blur?.();});
  const has=await a.win.evaluate(()=>Boolean(document.querySelector("[data-k]"))); if(!has) return "no overflowing pre";
  for(let i=0;i<70;i++){await a.win.keyboard.press("Tab");
   const ok=await a.win.evaluate(()=>{const p=document.querySelector("[data-k]");return p===document.activeElement||p.contains(document.activeElement);});
   if(ok){for(let j=0;j<8;j++){await a.win.keyboard.press("End");await a.win.waitForTimeout(50);}
    return {tabs:i+1,...await a.win.evaluate(()=>{const p=document.querySelector("[data-k]");return{left:Math.round(p.scrollLeft),max:p.scrollWidth-p.clientWidth};})};}}
  return "Tab never reached it";})();
 console.log("keyboard:",JSON.stringify(res));
 await a.shot("import-pre"); await a.close();
})().catch(e=>{console.error("FAILED",String(e).slice(0,300));process.exit(1);});
