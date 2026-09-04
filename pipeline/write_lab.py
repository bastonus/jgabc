"""
write_lab.py — Génère d:/Documents/jgabc/align/alignment-lab.html
à partir de d:/Documents/jgabc/align/lab_data.js (déjà généré).
"""
import re

# Read the already-generated data file (it already contains the PIECES const)
with open(r"d:/Documents/jgabc/align/lab_data.js", encoding="utf-8") as f:
    pieces_js_raw = f.read()

# The lab page loads lab_data.js as a sibling script — all we need is the
# HTML shell. The JS in the page references PIECES which is defined by lab_data.js.

HTML = r"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Laboratoire Alignement GABC - Oremus</title>
<script src="lab_data.js"></script>
<style>
:root{--bg:#0f0f12;--sf:#1a1a20;--sf2:#23232c;--br:rgba(255,255,255,.08);--ac:#c96b63;--ac2:rgba(201,107,99,.15);--tx:#e8e6e3;--tx2:#9d9b98;--gr:#589c77;--gd:#c4984f;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--tx);min-height:100vh;line-height:1.5}
/* Header */
.hdr{background:var(--sf);border-bottom:1px solid var(--br);padding:11px 17px;display:flex;align-items:center;gap:11px;position:sticky;top:0;z-index:100}
.hl{font-size:1.02rem;font-weight:700;color:var(--ac)}.hs{font-size:.74rem;color:var(--tx2);flex:1}
.bk{background:var(--ac2);border:1px solid rgba(201,107,99,.3);color:var(--ac);padding:5px 10px;border-radius:8px;font-size:.74rem;cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:5px}
.bk:hover{background:rgba(201,107,99,.25)}
/* Layout */
.wr{max-width:920px;margin:0 auto;padding:20px 13px;display:flex;flex-direction:column;gap:26px}
/* Intro */
.intro{background:var(--sf);border:1px solid var(--br);border-radius:13px;padding:17px}
.intro h1{font-size:.97rem;font-weight:600;margin-bottom:6px}
.intro p{font-size:.79rem;color:var(--tx2);line-height:1.65}
.bgs{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.bg{font-size:.68rem;padding:3px 8px;border-radius:18px;font-weight:500}
.bd{background:rgba(88,156,119,.2);color:var(--gr);border:1px solid rgba(88,156,119,.3)}
.bw{background:var(--ac2);color:var(--ac);border:1px solid rgba(201,107,99,.3)}
/* Tabs */
.tabs{display:flex;gap:5px;flex-wrap:wrap;border-bottom:1px solid var(--br)}
.tab{background:none;border:1px solid var(--br);border-bottom:none;border-radius:7px 7px 0 0;color:var(--tx2);padding:6px 12px;font-size:.76rem;cursor:pointer;transition:all .14s;position:relative;bottom:-1px}
.tab.on{background:var(--sf);border-color:var(--ac);border-bottom-color:var(--sf);color:var(--ac);font-weight:600}
.tab:hover:not(.on){background:var(--sf2);color:var(--tx)}
/* Panels */
.pnl{display:none;background:var(--sf);border:1px solid var(--br);border-radius:0 11px 11px 11px;overflow:hidden}
.pnl.on{display:block}
.pm{padding:13px 17px 10px;border-bottom:1px solid var(--br)}
.pn{font-size:.95rem;font-weight:600}.pp{font-size:.7rem;color:var(--tx2);margin-top:2px}
.sts{display:flex;gap:13px;margin-top:6px;flex-wrap:wrap}
.st{font-size:.71rem}.sl{color:var(--tx2)}.sv{color:var(--ac);font-weight:600}
/* Player */
.pl{padding:13px 17px;border-bottom:1px solid var(--br);background:var(--sf2);display:flex;flex-direction:column;gap:10px}
.ywrp{position:relative;width:100%;max-width:500px;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#000;margin:0 auto}
.ywrp iframe{width:100%;height:100%;border:none;display:block}
.ytph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#111;position:absolute;inset:0;transition:background .18s}
.ytph:hover{background:#1a1a1a}
.ythm{width:100%;height:100%;object-fit:cover;position:absolute;inset:0;opacity:.5}
.ytp{position:absolute;width:50px;height:50px;background:rgba(201,107,99,.9);border-radius:50%;display:flex;align-items:center;justify-content:center}
.ysc{font-size:.68rem;color:var(--tx2);text-align:center}
.ctr{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.cb{background:var(--sf);border:1px solid var(--br);color:var(--tx);padding:5px 11px;border-radius:7px;font-size:.75rem;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .13s}
.cb:hover{background:var(--sf2);border-color:var(--ac);color:var(--ac)}
.prw{display:flex;align-items:center;gap:8px}
.ptrk{flex:1;height:4px;background:rgba(255,255,255,.07);border-radius:2px;cursor:pointer;position:relative}
.pfl{height:100%;background:var(--ac);border-radius:2px;width:0%;transition:width .07s linear;pointer-events:none}
.tlb{font-size:.68rem;color:var(--tx2);min-width:30px}
/* GABC section */
.gs{padding:13px 17px}
.gst{font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--tx2);margin-bottom:10px;display:flex;align-items:center;gap:6px}
.gmd{font-size:.64rem;padding:2px 6px;border-radius:9px;background:rgba(255,255,255,.05);color:var(--tx2);text-transform:none;letter-spacing:0;font-weight:400}
.wfl{display:flex;flex-wrap:wrap;gap:9px 14px;font-family:Georgia,serif}
.wb{display:flex;flex-direction:column;align-items:center;gap:3px}
.wt{font-size:.78rem;color:var(--tx2);letter-spacing:.02em;transition:color .13s}
.wb.wa .wt{color:var(--ac);font-weight:600}
.wn{display:flex;flex-wrap:wrap;gap:2px}
.nc{font-family:system-ui,sans-serif;font-size:.59rem;padding:2px 4px;border-radius:3px;background:rgba(255,255,255,.04);color:var(--tx2);border:1px solid transparent;transition:all .06s;cursor:default}
.nc.nl{border-color:rgba(196,152,79,.3)}.nc.nr{background:rgba(88,156,119,.1)}
.nc.na{background:var(--ac);color:#fff;border-color:var(--ac);transform:scale(1.13);z-index:2;position:relative}
/* Prior viz */
.pv{padding:0 17px 13px}
.pvt{font-size:.68rem;color:var(--tx2);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.pb{width:100%;height:12px;background:rgba(255,255,255,.04);border-radius:4px;overflow:hidden;display:flex}
.ps{height:100%;transition:opacity .07s}.ps.sa{opacity:1!important;filter:brightness(1.5)}
/* Raw GABC */
.rw{padding:0 17px 13px;border-top:1px solid var(--br);padding-top:12px}
.rwt{background:none;border:none;color:var(--tx2);font-size:.71rem;cursor:pointer;display:flex;align-items:center;gap:5px;padding:0 0 6px}
.rwt:hover{color:var(--ac)}
.rwc{display:none;font-family:monospace;font-size:.68rem;background:var(--bg);border:1px solid var(--br);border-radius:7px;padding:10px;color:#9fc89f;white-space:pre-wrap;word-break:break-all;max-height:170px;overflow-y:auto;line-height:1.55}
.rwc.open{display:block}
/* Footer */
.pft{padding:10px 17px;border-top:1px solid var(--br);background:var(--bg);display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:.69rem;color:var(--tx2)}
.cbb{width:50px;height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;margin-left:4px}
.cbf{height:100%;border-radius:3px}
@media(max-width:590px){.hs{display:none}}
</style>
</head>
<body>
<header class="hdr">
  <span class="hl">&#9879; Oremus</span>
  <span class="hs">Laboratoire d&#8217;alignement automatique GABC &#8596; YouTube (v3 corrig&#233;)</span>
  <a class="bk" href="../divinum-officium.html">
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    Retour Oremus
  </a>
</header>
<div class="wr">
  <div class="intro">
    <h1>Test d&#8217;alignement note par note &#8212; 5 pi&#232;ces (Passe 0 : Tokenisation + Priors GABC)</h1>
    <p>Pipeline hybride 3 passes : WhisperX (ancrage mot) + CREPE F0 (d&#233;tection de paliers) + priors GABC (arbitrage). Cette page montre la <strong>Passe 0</strong> (CPU) : tokenisation des 5 pi&#232;ces, calcul des priors de dur&#233;e d&#233;riv&#233;s des signes rythmiques GABC r&#233;els (punctum mora, &#233;pis&#232;me, notes r&#233;p&#233;t&#233;es), et un simulateur de d&#233;filement proportionnel aux priors. Les Passes 1 et 2 (GPU) affineront les horodatages avec WhisperX et CREPE.</p>
    <div class="bgs">
      <span class="bg bd">&#10003; Tokenisation GABC (CPU)</span>
      <span class="bg bd">&#10003; Priors de dur&#233;e calcul&#233;s</span>
      <span class="bg bw">&#9203; WhisperX &#8212; GPU requis</span>
      <span class="bg bw">&#9203; CREPE F0 &#8212; GPU requis</span>
    </div>
  </div>
  <div>
    <div class="tabs" id="tabs"></div>
    <div id="panels"></div>
  </div>
</div>
<script>
const SC=["#c96b63","#987dc2","#589c77","#c4984f","#5c8bb8","#cc738a","#ba8155","#7e8590"];
const SS={};
const tabs=document.getElementById("tabs");
const panels=document.getElementById("panels");

PIECES.forEach((p,pi)=>{
  // Tab
  const tab=document.createElement("button");
  tab.className="tab"+(pi===0?" on":"");
  tab.textContent=p.incipit.split("(")[0].trim();
  tab.onclick=()=>{
    document.querySelectorAll(".tab").forEach(t=>t.classList.remove("on"));
    document.querySelectorAll(".pnl").forEach(x=>x.classList.remove("on"));
    tab.classList.add("on");
    document.getElementById("P"+pi).classList.add("on");
  };
  tabs.appendChild(tab);

  // Build flat note list
  let NL=[];
  p.words.forEach((w,wi)=>w.notes.forEach(n=>NL.push({...n,wi})));
  const TDW=NL.reduce((s,n)=>s+n.dw,0);

  // Word-flow HTML
  let wh="";let ni=0;
  p.words.forEach((w,wi)=>{
    const nh=w.notes.map((n,k)=>{
      let cl="nc";if(n.dw>=1.9)cl+=" nl";if(n.repeated)cl+=" nr";
      return '<span class="'+cl+'" id="n'+pi+'-'+(ni+k)+'">'+n.token+'</span>';
    }).join("");
    ni+=w.notes.length;
    wh+='<div class="wb" id="w'+pi+'-'+wi+'"><div class="wt">'+escH(w.word||'&mdash;')+'</div><div class="wn">'+nh+'</div></div>';
  });

  // Prior bars
  let bh="";let ai=0;
  p.words.forEach((w,wi)=>{
    const c=SC[wi%SC.length];
    w.notes.forEach((n,k)=>{
      const pct=(n.dw/TDW*100).toFixed(3);
      const op=(0.28+(k%2)*0.22).toFixed(2);
      bh+='<div class="ps" id="s'+pi+'-'+ai+'" style="width:'+pct+'%;background:'+c+';opacity:'+op+'"></div>';
      ai++;
    });
  });

  // Raw GABC
  const raw=p.words.map(w=>escH(w.word)+'('+w.notes.map(n=>n.token).join('')+')').join(' ');

  // Panel
  const d=document.createElement("div");
  d.className="pnl"+(pi===0?" on":"");
  d.id="P"+pi;
  d.innerHTML=
'<div class="pm">'+
  '<div class="pn">'+escH(p.incipit)+'</div>'+
  '<div class="pp">'+escH(p.part)+'</div>'+
  '<div class="sts">'+
    '<div class="st"><span class="sl">Mots: </span><span class="sv">'+p.words.length+'</span></div>'+
    '<div class="st"><span class="sl">Notes: </span><span class="sv">'+p.total_notes+'</span></div>'+
    '<div class="st"><span class="sl">ID GABC: </span><span class="sv">'+p.id+'</span></div>'+
    '<div class="st"><span class="sl">YT: </span><span class="sv" style="font-size:.6rem">'+p.ytId+'</span></div>'+
  '</div>'+
'</div>'+
'<div class="pl">'+
  '<div class="ywrp">'+
    '<div class="ytph" id="ytph'+pi+'" onclick="lYt('+pi+',\''+p.ytId+'\')">'+
      '<img class="ythm" src="https://i.ytimg.com/vi/'+p.ytId+'/hqdefault.jpg" loading="lazy" onerror="this.style.display=\'none\'" alt="">'+
      '<div class="ytp"><svg viewBox="0 0 24 24" width="19" height="19" fill="white"><polygon points="6,4 20,12 6,20"/></svg></div>'+
    '</div>'+
    '<div id="ytf'+pi+'" style="display:none;width:100%;height:100%"></div>'+
  '</div>'+
  '<div class="ysc">'+escH(p.source)+'</div>'+
  '<div class="ctr">'+
    '<button class="cb" onclick="sPlay('+pi+')"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>Simuler priors GABC</button>'+
    '<button class="cb" onclick="sStop('+pi+')"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>Stop</button>'+
  '</div>'+
  '<div class="prw">'+
    '<span class="tlb" id="tc'+pi+'">0:00</span>'+
    '<div class="ptrk" onclick="seekS(event,'+pi+')"><div class="pfl" id="pf'+pi+'"></div></div>'+
    '<span class="tlb">6s</span>'+
  '</div>'+
'</div>'+
'<div class="gs">'+
  '<div class="gst">Partition GABC tokenis&#233;e <span class="gmd">'+p.total_notes+' tokens</span></div>'+
  '<div class="wfl">'+wh+'</div>'+
'</div>'+
'<div class="pv">'+
  '<div class="pvt">Prior de dur&#233;e (proportionnel aux poids GABC)</div>'+
  '<div class="pb">'+bh+'</div>'+
'</div>'+
'<div class="rw">'+
  '<button class="rwt" onclick="tRaw('+pi+')"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>GABC brut tokenis&#233;</button>'+
  '<pre class="rwc" id="rc'+pi+'">'+raw+'</pre>'+
'</div>'+
'<div class="pft">'+
  '<div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.67rem" title="'+p.gabc_path+'">'+escH(p.gabc_path)+'</div>'+
  '<div style="display:flex;align-items:center;gap:4px">Priors seuls<div class="cbb"><div class="cbf" style="width:45%;background:var(--gd)"></div></div>~45%</div>'+
  '<div style="color:var(--ac);font-size:.66rem">&#9203; WhisperX+CREPE pour horodatage r&#233;el</div>'+
'</div>';
  panels.appendChild(d);
});

function escH(s){if(!s)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

function sPlay(pi){
  sStop(pi);
  const p=PIECES[pi];
  let NL=[];p.words.forEach((w,wi)=>w.notes.forEach(n=>NL.push({...n,wi})));
  const TDW=NL.reduce((s,n)=>s+n.dw,0);
  const DUR=6000,tk=50;let el=0,ni=0;
  const cdw=[];let a=0;NL.forEach(n=>{cdw.push(a);a+=n.dw;});
  SS[pi]=setInterval(()=>{
    el+=tk;if(el>DUR){sStop(pi);return;}
    const fr=el/DUR;
    document.getElementById("pf"+pi).style.width=(fr*100)+"%";
    document.getElementById("tc"+pi).textContent=fmt(el/1000);
    const tg=fr*TDW;
    while(ni<NL.length-1&&cdw[ni+1]<=tg)ni++;
    qAll(".nc","n"+pi+"-","na");qAll(".wb","w"+pi+"-","wa");qAll(".ps","s"+pi+"-","sa");
    const ne=document.getElementById("n"+pi+"-"+ni);
    if(ne){ne.classList.add("na");ne.scrollIntoView({block:"nearest",inline:"center",behavior:"smooth"});}
    const we=document.getElementById("w"+pi+"-"+NL[ni].wi);if(we)we.classList.add("wa");
    const se=document.getElementById("s"+pi+"-"+ni);if(se)se.classList.add("sa");
  },tk);
}
function sStop(pi){
  if(SS[pi]){clearInterval(SS[pi]);SS[pi]=null;}
  if(document.getElementById("pf"+pi))document.getElementById("pf"+pi).style.width="0%";
  if(document.getElementById("tc"+pi))document.getElementById("tc"+pi).textContent="0:00";
  qAll(".nc","n"+pi+"-","na");qAll(".wb","w"+pi+"-","wa");qAll(".ps","s"+pi+"-","sa");
}
function qAll(sel,pfx,cls){document.querySelectorAll('[id^="'+pfx+'"]').forEach(e=>e.classList.remove(cls));}
function seekS(e,pi){
  const r=e.currentTarget.getBoundingClientRect();
  document.getElementById("pf"+pi).style.width=(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*100)+"%";
}
function lYt(pi,id){
  document.getElementById("ytph"+pi).style.display="none";
  const f=document.getElementById("ytf"+pi);f.style.display="block";
  f.innerHTML='<iframe src="https://www.youtube.com/embed/'+id+'?autoplay=1&rel=0" allow="autoplay;encrypted-media" allowfullscreen style="width:100%;height:100%;border:none;border-radius:10px"></iframe>';
}
function tRaw(pi){document.getElementById("rc"+pi).classList.toggle("open");}
function fmt(s){const m=Math.floor(s/60),ss=Math.floor(s%60);return m+":"+String(ss).padStart(2,"0");}
</script>
</body>
</html>
"""

out = r"d:/Documents/jgabc/align/alignment-lab.html"
with open(out, "w", encoding="utf-8") as f:
    f.write(HTML)

import os
print(f"Written: {os.path.getsize(out):,} bytes -> {out}")
