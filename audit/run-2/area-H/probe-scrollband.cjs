const path=require("node:path");
const {buildStubRoot,script}=require("/home/user/stream-trimmer/audit/run-2/area-H/lib/stub.cjs");
const H=require("/home/user/stream-trimmer/audit/run-2/area-H/lib/h2.cjs");
const STUB="/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";
const KEYS=["#ui-mark-in","#ui-mark-out","#ui-mark-whole","#ui-add-segment"];
(async()=>{
 buildStubRoot(STUB); script(STUB,{exitCode:0,stderr:"",delayMs:0,writeMedia:true,authFail:false});
 const a=await H.open({label:"h2-scan",cwd:STUB,outDir:"/home/user/stream-trimmer/audit/run-2/area-H/out/scan",skipSeeded:true});
 await H.setSize(a,1280,820); await H.loadVideo(a); await H.addSegments(a,5);
 for(const [w,h] of [[1280,600],[1100,600],[960,600],[1440,600]]){
  await H.setSize(a,w,h); await a.win.waitForTimeout(500);
  const r=await a.win.evaluate(k=>{
   const c=document.querySelector(".cols-centre"); const max=c.scrollHeight-c.clientHeight; const good=[];
   for(let t=0;t<=max;t+=10){ c.scrollTop=t;
    const ok=k.every(sel=>{const el=document.querySelector(sel); if(!el) return false; const rr=el.getBoundingClientRect();
     for(const fx of [0.2,0.5,0.8]) for(const fy of [0.3,0.7]){ const x=rr.left+rr.width*fx,y=rr.top+rr.height*fy;
      if(x<0||y<0||x>innerWidth||y>innerHeight) return false; const hit=document.elementFromPoint(x,y);
      if(!(hit===el||el.contains(hit))) return false; } return true;});
    if(ok) good.push(t); }
   c.scrollTop=0; return {max,good:good.length?[good[0],good[good.length-1]]:null,count:good.length};
  },KEYS);
  console.log(`${w}x${h} 5seg: centre maxScroll=${r.max}; scroll positions (step 10px) where the whole mark bar is clickable: ${r.count}${r.good?` (scrollTop ${r.good[0]}..${r.good[1]})`:" — NONE"}`);
 }
 await a.close();
})().catch(e=>{console.error("FAILED",String(e).slice(0,300));process.exit(1);});
