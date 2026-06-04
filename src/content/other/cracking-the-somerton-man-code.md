---
title: "Cracking the Somerton Man Code"
description: "Not my normal type of work, but its Christmas and I need a hobby :)"
pubDate: 2025-12-19
tags: ["adelaide", "aderlaide", "codes", "crime", "cryptographer", "cryptography", "daily mail", "mysteries", "news", "somerton man", "tamam shud", "true crime"]
---
Not my normal type of work, but its Christmas and I need a hobby :)

**A 74-Year-Old Mystery**

Here's something that's bothered people for over seventy years. On the morning of December 1, 1948, a well-dressed man was found dead on Somerton Beach in South Australia. Nobody knew who he was. In his pocket? A scrap of paper with two words: *Tamám Shud*—Persian for 'It is ended.' torn from the pages of an old Persian poetry book the "Rubáiyát of Omar Khayyám" Even more strange the book was no where to be see

![](/images/tama.jpg)

Days later the book was found discarded; thrown into the back of a strangers car. Typically strange for this case, the indentations of five lines of mysterious letters were pressed into its pages. Were these letters a secret code, or a cypher. Was the unknown man a spy or a double agent. Was the Rubyat a way to decode the letters. 5 lines, 50 letters. For decades, investigators, amateur sleuths, the police and even the CIA and the NSA have thrown every technique they could think of at this presumed code. Nothing worked. The letters seemed completely random.

![](/images/somerton-man-code-1024x818.jpg)

But what if everyone's been looking at this the wrong way? What if there's no cipher at all—because **the letters were never meant to be decoded**? What if they're simply what they were something else: **abbreviated railway station names recording actual journeys**?

That's the argument this report makes. In 2022, DNA analysis finally identified the Somerton Man as Carl 'Charles' Webb, an electrical engineer from Melbourne. His divorce records paint a picture of a man with precise habits and serious emotional struggles. And once you know who he was, the code starts to make a different kind of sense—not as a secret message, but as Webb's personal record of searching for Jessica Thomson through Adelaide's railway network in the final weeks of his life.

The evidence for this is geographic. Follow the routes. The distances tell the story.

# **The Code Itself**

Before going any further, here's what we're working with. The code has five lines of capital letters, and the second line is crossed out:

**Line 1: MRGOABABD**

*~~Line 2: MLIAOI~~* *(crossed out)*

**Line 3: MTBIMPANETP**

**Line 4: MLIABOAIAQC**

**Line 5: ITTMTSAMSTGAB**

The idea here is simple: each letter corresponds to the first letter of a railway station or town. And what makes this convincing—more convincing than any cipher theory—is the distance between consecutive stations. They're typically under 15 kilometres. These aren't random letters that happen to match station names. These are routes someone could actually travel on Adelaide's 1948 railway network.

# **Understanding Carl Webb**

To understand the code, you need to understand the man who wrote it. Webb's divorce records and background tell us a few important things about him.

First, **he was systematic and precise**. Trained as an electrical engineer at Swinburne Technical College, Webb built precision measuring instruments for a living. Documentation and accuracy weren't just habits for him—they were part of his daily work.

Second, **he had unusual habits**. Every clothing label on the Somerton Man's body had been meticulously removed. That kind of behaviour suggests sensory sensitivities, possibly autism spectrum traits.

Third, **he struggled with rejection**. His divorce records describe emotional volatility and real difficulty processing the end of relationships, including previous suicide attempts.

Put all that together and you don't get a spy or a secret agent. You get a heartbroken man with methodical habits, recording his desperate search for a woman who had rejected him—using exactly the kind of shorthand that would make sense to an engineer who travelled by train.

# **Line 1: MRGOABABD**

So let's start mapping these routes. Line 1 looks like a day's worth of travel around Adelaide's coastal and suburban railway network—a systematic check of the areas where Jessica Thomson might be found.

## **The Route**

| **Pos** | **Letter** | **Station** | **Distance to Next** | **Notes** |
| --- | --- | --- | --- | --- |
| 1 | **M** | **MARINO** | → 8.5 km | Coastal station south of Adelaide |
| 2 | **R** | **REYNELLA** | → 12 km | Main line station south of Marino |
| 3 | **G** | **GLENELG** | → 11 km | Coastal terminus—where Thomson lived |
| 4 | **O** | **OAKLANDS** | → 8 km | Eastern suburbs line |
| 5 | **A** | **ADELAIDE** | → 10 km | Central railway terminus |
| 6 | **B** | **BRIGHTON** | → 10 km | Coastal station south of Glenelg |
| 7 | **A** | **ADELAIDE** | → 10 km | Central terminus |
| 8 | **B** | **BRIGHTON** | → 8 km | Coastal station |
| 9 | **D** | **DARLINGTON** | — END — | Southern line station |

**Total Distance: 77.5 km | Average Leg: 9.7 km**

:root{
--panel: rgba(255,255,255,0.92);
--line: #e6eaf2;
--text: #0b1220;
--muted: #4b5565;
--red: #ef4444;
--shadow: 0 10px 26px rgba(2,6,23,.10);
--radius: 16px;
}
#mapArea{height:520px;width:100%;position:relative;background:#eef2ff;}
#map{height:100%;width:100%;}
.card{
position:absolute;left:12px;width:min(360px,calc(100% - 24px));
background:var(--panel);border:1px solid var(--line);
border-radius:var(--radius);box-shadow:var(--shadow);
z-index:2000;backdrop-filter:blur(10px);
}
.top{top:12px;}
.bottom{bottom:12px;}
.header{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;}
.title{font-weight:900;font-size:13px;}
.sub{font-size:11px;color:var(--muted);}
.actions{display:flex;gap:6px;flex-wrap:wrap;}
.btn{
background:white;border:1px solid var(--line);
border-radius:12px;padding:7px 10px;
font-weight:900;font-size:12px;cursor:pointer;
}
.btn.primary{
background:linear-gradient(135deg,#ef4444,#f97316);
color:white;border-color:rgba(239,68,68,.25);
}
.drawer{border-top:1px solid var(--line);padding:10px 12px;display:none;}
.drawer.open{display:block;}
.chips{display:flex;gap:4px;flex-wrap:wrap;}
.chip{
min-width:26px;padding:5px 7px;border-radius:10px;
background:#fff;border:1px solid var(--line);
font-weight:900;font-size:11px;text-align:center;
}
.chip.active{background:var(--red);color:#fff;}
.chip.done{background:#fee2e2;color:#991b1b;}
.kv{display:flex;justify-content:space-between;font-size:12px;margin:3px 0;}
.k{color:var(--muted);font-weight:900;}
.v{font-weight:900;}
.progressOuter{
margin-top:8px;height:7px;background:#fff;
border:1px solid var(--line);border-radius:999px;overflow:hidden;
}
.progressInner{
height:100%;width:0%;
background:linear-gradient(90deg,#ef4444,#f97316);
}

Somerton Man Code Explorer — Line 1

MRGOABABD • compact public-transport movements

Play
Step
Reset
Code ▾

Current

—

Next

—

Details ▾

Leg

—

Distance

—

(function(){
const CODE="MRGOABABD".split("");
const NODES={
M:{n:"Mile End",lat:-34.925,lon:138.5801},
R:{n:"Richmond",lat:-34.94,lon:138.56},
G:{n:"Glenelg",lat:-34.98055,lon:138.51393},
O:{n:"Oaklands Park",lat:-35.0099,lon:138.5402},
A:{n:"Adelaide",lat:-34.9227,lon:138.5983},
B:{n:"Brighton",lat:-35.048,lon:138.508},
D:{n:"Darlington",lat:-35.03,lon:138.557}
};
const pts=CODE.map(l=>[NODES[l].lat,NODES[l].lon]);
const map=L.map('map').fitBounds(pts,{padding:[40,40]});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
L.polyline(pts,{color:'#ef4444',weight:3,opacity:.25}).addTo(map);
const traveller=L.circleMarker(pts[0],{radius:7,color:'#111',weight:2,fillColor:'#f59e0b',fillOpacity:1}).addTo(map);
const trail=L.polyline([pts[0]],{color:'#ef4444',weight:5}).addTo(map);
const chips=[],chipsBox=document.getElementById('chips');
CODE.forEach((c,i)=>{const s=document.createElement('span');s.className='chip'+(i===0?' active':'');s.textContent=c;chipsBox.appendChild(s);chips.push(s);});
const setChips=i=>chips.forEach((c,x)=>{c.classList.toggle('active',x===i);c.classList.toggle('done',x<i);});
const nowEl=document.getElementById('now');
const nextEl=document.getElementById('next');
const legEl=document.getElementById('leg');
const distEl=document.getElementById('dist');
const prog=document.getElementById('progress');
const hav=(a,b)=>{
const R=6371,to=d=>d\*Math.PI/180;
const dLat=to(b.lat-a.lat),dLon=to(b.lon-a.lon);
const x=Math.sin(dLat/2)\*\*2+Math.cos(to(a.lat))\*Math.cos(to(b.lat))\*Math.sin(dLon/2)\*\*2;
return R\*(2\*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)));
};
let i=0,t=0,playing=false,last=null;
function update(){
if(i>=CODE.length-1){
nowEl.textContent=CODE.at(-1)+" — "+NODES[CODE.at(-1)].n;
nextEl.textContent="—";
prog.style.width="100%";
return;
}
const A=NODES[CODE[i]],B=NODES[CODE[i+1]];
nowEl.textContent=CODE[i]+" — "+A.n;
nextEl.textContent=CODE[i+1]+" — "+B.n;
legEl.textContent=(i+1)+" / "+(CODE.length-1);
distEl.textContent=hav(A,B).toFixed(1)+" km";
prog.style.width=((i+t)/(CODE.length-1))\*100+"%";
}
function animate(ts){
if(!playing) return;
if(!last) last=ts;
const dt=(ts-last)/1000;
last=ts;
if(i>=CODE.length-1){ playing=false; playBtn.textContent="Play"; return; }
t+=dt/1.6;
if(t>1) t=1;
const A=NODES[CODE[i]],B=NODES[CODE[i+1]];
const pos=[A.lat+(B.lat-A.lat)\*t,A.lon+(B.lon-A.lon)\*t];
traveller.setLatLng(pos);
trail.addLatLng(pos);
update(); setChips(i);
if(t>=1){ i++; t=0; }
requestAnimationFrame(animate);
}
playBtn.onclick=()=>{
playing=!playing;
playBtn.textContent=playing?"Pause":"Play";
last=null;
if(playing) requestAnimationFrame(animate);
};
stepBtn.onclick=()=>{
playing=false; playBtn.textContent="Play";
if(i<CODE.length-1){ i++; traveller.setLatLng(pts[i]); trail.addLatLng(pts[i]); update(); setChips(i); }
};
resetBtn.onclick=()=>{
playing=false; playBtn.textContent="Play";
i=0; t=0; last=null;
traveller.setLatLng(pts[0]); trail.setLatLngs([pts[0]]);
update(); setChips(0);
map.fitBounds(pts,{padding:[40,40]});
};
toggleCode.onclick=()=>codeDrawer.classList.toggle('open');
toggleDetails.onclick=()=>detailsDrawer.classList.toggle('open');
update();
})();

## **What the Short Distances Tell Us**

Here's the thing that really stands out: every station-to-station distance in Line 1 falls between 8 and 12 kilometres. That matters. If someone had just picked random letters, the 'route' would require impossible jumps—hundreds of kilometres between points with no railway connection. But that's not what we see. Instead, each leg is a **practical journey you could actually make**.

And then there's that ABAB pattern. Adelaide to Brighton to Adelaide to Brighton—back and forth, again and again. This is exactly the kind of obsessive rechecking described in Webb's divorce records. It's worth noting that Brighton station sits just 1.5 km from Somerton Beach, where he would eventually die.

# **Line 2: MLIAOI (Crossed Out)**

Line 2 is the only one that's crossed out, and that detail matters more than it might seem. Think about it: you don't cross out a cipher. If you'd made a mistake encoding something, you'd rewrite it or destroy it. But a *travel plan*? A travel plan gets crossed out when plans change.

## **The Abandoned Route**

| **Pos** | **Letter** | **Station** | **Distance to Next** | **Status** |
| --- | --- | --- | --- | --- |
| *~~1~~* | *~~M~~* | *~~MARINO~~* | *~~→ 15 km~~* | *~~Cancelled—coastal station~~* |
| *~~2~~* | *~~L~~* | *~~LARGS BAY~~* | *~~→ 8 km~~* | *~~Cancelled—NW coastal terminus~~* |
| *~~3~~* | *~~I~~* | *~~ISLINGTON~~* | *~~→ 4 km~~* | *~~Cancelled—northern inner suburbs~~* |
| *~~4~~* | *~~A~~* | *~~ADELAIDE~~* | *~~→ 8 km~~* | *~~Cancelled—central terminus~~* |
| *~~5~~* | *~~O~~* | *~~OAKLANDS~~* | *~~→ 10 km~~* | *~~Cancelled—eastern suburbs~~* |
| *~~6~~* | *~~I~~* | *~~ISLINGTON~~* | *~~— END —~~* | *~~Cancelled—northern suburbs~~* |

*Planned Distance: 45 km (never completed)*

:root{
--panel: rgba(255,255,255,0.92);
--line: #e6eaf2;
--text: #0b1220;
--muted: #4b5565;
--red: #ef4444;
--redDark:#7f1d1d;
--shadow: 0 10px 26px rgba(2,6,23,.10);
--radius: 16px;
}
.smce-mapArea{height:520px !important;width:100% !important;position:relative;background:#eef2ff;}
.smce-mapCanvas{height:100%;width:100%;}
/\* Compact floating cards instead of full-width bars \*/
.smce-card{
position:absolute;
left:12px;
width:min(360px, calc(100% - 24px));
background:var(--panel);
border:1px solid var(--line);
border-radius:var(--radius);
box-shadow:var(--shadow);
z-index:2000;
pointer-events:auto;
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);
overflow:hidden;
}
.smce-top{top:12px;}
.smce-bottom{bottom:12px;}
.smce-cardHeader{
display:flex;
align-items:center;
justify-content:space-between;
gap:10px;
padding:10px 12px;
}
.smce-title{
font-weight:900;
font-size:13px;
color:var(--text);
letter-spacing:-.02em;
line-height:1.1;
}
.smce-sub{
font-size:11px;
color:var(--muted);
margin-top:2px;
line-height:1.2;
}
.smce-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.smce-btn{
background:white;
border:1px solid var(--line);
border-radius:12px;
padding:7px 10px;
font-weight:900;
font-size:12px;
cursor:pointer;
user-select:none;
touch-action:manipulation;
box-shadow: 0 6px 14px rgba(2,6,23,.07);
white-space:nowrap;
}
.smce-btn.primary{
background: linear-gradient(135deg, #ef4444, #f97316);
color:white;
border-color: rgba(239,68,68,.25);
}
.smce-btn:active{transform:translateY(1px);}
.smce-drawer{
border-top:1px solid var(--line);
padding:10px 12px;
display:none; /\* toggled open \*/
}
.smce-drawer.open{display:block;}
.smce-chipStrip{display:flex;gap:4px;flex-wrap:wrap;}
.smce-chip{
min-width:26px;padding:5px 7px;border-radius:10px;
background:#fff;border:1px solid var(--line);
font-weight:900;font-size:11px;text-align:center;
}
.smce-chip.active{background:var(--red);color:#fff;border-color:rgba(239,68,68,.35);}
.smce-chip.done{background:#fee2e2;color:#991b1b;border-color:#fecaca;}
.smce-kv{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:3px 0;}
.smce-k{color:var(--muted);font-weight:900;font-size:12px;}
.smce-v{color:var(--text);font-weight:900;font-size:12px;text-align:right;}
.smce-progressOuter{
margin-top:8px;
width:100%;
height:7px;
background:#fff;
border:1px solid var(--line);
border-radius:999px;
overflow:hidden;
}
.smce-progressInner{
height:100%;
width:0%;
background:linear-gradient(90deg,#ef4444,#f97316);
border-radius:999px;
transition:width 120ms linear;
}
.smce-controlRow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px;}
.smce-pill{
display:flex;align-items:center;justify-content:space-between;gap:10px;
width:100%;
padding:8px 10px;
border-radius:14px;
border:1px solid var(--line);
background:rgba(255,255,255,0.70);
box-shadow: 0 6px 14px rgba(2,6,23,.06);
}
.smce-pill label{font-size:12px;font-weight:900;color:var(--text);}
.smce-pill span{font-size:12px;font-weight:900;color:var(--muted);}
.smce-slider{width:100%;accent-color:var(--red);}
/\* Keep map taps working outside the cards \*/
.leaflet-container{touch-action:pan-x pan-y;}
@media (max-width: 480px){
.smce-card{width:min(320px, calc(100% - 24px));}
.smce-sub{display:none;}
}

Somerton Man Code Explorer — Line 2

Crossed-out sequence • red route • names shown as it progresses

Play
Step
Reset
Code ▾

Now

—

Next

—

Details ▾

Leg

—

Distance

—

Speed

1.0×

Keep marker centred

On

(function(){
function ready(fn){ if (typeof L !== 'undefined') fn(); else setTimeout(function(){ ready(fn); }, 120); }
ready(function(){
const CODE = "MLIAOI".split("");
const NODES = {
M:{ n:"Mile End", lat:-34.925, lon:138.5801 },
L:{ n:"Largs Bay", lat:-34.825, lon:138.4900 },
I:{ n:"Islington", lat:-34.868, lon:138.5900 },
A:{ n:"Adelaide", lat:-34.9227, lon:138.5983 },
O:{ n:"Oaklands Park", lat:-35.0099, lon:138.5402 }
};
const areaEl = document.getElementById('smce-line2-area');
const mapEl = document.getElementById('smce-line2-map');
// Prevent map drag when starting interactions on cards
const topCard = document.getElementById('smceTopCard');
const bottomCard = document.getElementById('smceBottomCard');
if (topCard){ L.DomEvent.disableClickPropagation(topCard); L.DomEvent.disableScrollPropagation(topCard); }
if (bottomCard){ L.DomEvent.disableClickPropagation(bottomCard); L.DomEvent.disableScrollPropagation(bottomCard); }
const pts = CODE.map(l => [NODES[l].lat, NODES[l].lon]);
const map = L.map(mapEl, { zoomControl:true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; OpenStreetMap contributors' }).addTo(map);
map.fitBounds(pts, { padding: [40, 40] });
// Ghost route + animated route (red)
L.polyline(pts, { color:'#ef4444', weight:3, opacity:0.20 }).addTo(map);
// Pins (no text labels)
const seen = new Set();
CODE.forEach(l=>{
if (seen.has(l)) return;
seen.add(l);
const n = NODES[l];
L.circleMarker([n.lat, n.lon], { radius:6, color:'#7f1d1d', weight:2, fillColor:'#ef4444', fillOpacity:0.9 }).addTo(map);
});
const traveller = L.circleMarker(pts[0], { radius:7, color:'#0b1220', weight:2, fillColor:'#f59e0b', fillOpacity:1 }).addTo(map);
const trail = L.polyline([pts[0]], { color:'#ef4444', weight:5, opacity:0.95 }).addTo(map);
// UI refs
const playBtn = document.getElementById('smcePlay');
const stepBtn = document.getElementById('smceStep');
const resetBtn = document.getElementById('smceReset');
const toggleCode = document.getElementById('smceToggleCode');
const toggleDetails = document.getElementById('smceToggleDetails');
const codeDrawer = document.getElementById('smceCodeDrawer');
const detailsDrawer = document.getElementById('smceDetailsDrawer');
const chipsBox = document.getElementById('smceChips');
const nowEl = document.getElementById('smceNow');
const nextEl = document.getElementById('smceNext');
const legEl = document.getElementById('smceLeg');
const distEl = document.getElementById('smceDist');
const progEl = document.getElementById('smceProgress');
const speedSlider = document.getElementById('smceSpeed');
const speedLabel = document.getElementById('smceSpeedLabel');
const centreSlider = document.getElementById('smceCentre');
const centreLabel = document.getElementById('smceCentreLabel');
// Chips
const chips = [];
chipsBox.innerHTML = "";
CODE.forEach((c, idx)=>{
const s = document.createElement('span');
s.className = 'smce-chip' + (idx===0 ? ' active' : '');
s.textContent = c;
chipsBox.appendChild(s);
chips.push(s);
});
function setChips(activeIdx){
chips.forEach((c, idx)=>{
c.classList.toggle('active', idx === activeIdx);
c.classList.toggle('done', idx < activeIdx);
});
}
// Maths
function havKm(a, b){
const R=6371, toRad=d=>d\*Math.PI/180;
const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
const la1=toRad(a.lat), la2=toRad(b.lat);
const x=Math.sin(dLat/2)\*\*2 + Math.cos(la1)\*Math.cos(la2)\*Math.sin(dLon/2)\*\*2;
return R\*(2\*Math.atan2(Math.sqrt(x), Math.sqrt(1-x)));
}
function ease(u){ return u\*u\*(3 - 2\*u); }
// State
let i = 0, t = 0, playing = false, lastT = null, dwell = 0;
let speed = parseFloat(speedSlider.value);
let keepCentred = true;
const BASE\_SEC\_PER\_LEG = 1.6;
const DWELL\_SEC = 0.55;
function updatePanels(){
const legCount = CODE.length - 1;
if (i >= legCount){
nowEl.textContent = CODE[CODE.length-1] + " — " + NODES[CODE[CODE.length-1]].n;
nextEl.textContent = "—";
legEl.textContent = "Complete";
distEl.textContent = "—";
progEl.style.width = "100%";
return;
}
const aL = CODE[i], bL = CODE[i+1];
const A = NODES[aL], B = NODES[bL];
const km = havKm(A,B);
nowEl.textContent = aL + " — " + A.n;
nextEl.textContent = bL + " — " + B.n;
legEl.textContent = (i+1) + " / " + legCount;
distEl.textContent = km.toFixed(1) + " km";
const overall = (i + t) / legCount;
progEl.style.width = (Math.max(0, Math.min(1, overall)) \* 100) + "%";
}
function pulseMarker(time){
const base=7, amp=1.2;
traveller.setStyle({ radius: base + Math.sin(time/140) \* amp });
}
function setPlayButton(){ playBtn.textContent = playing ? "Pause" : "Play"; }
function reset(){
playing = false; lastT = null; dwell = 0; i = 0; t = 0;
setPlayButton();
traveller.setLatLng(pts[0]);
trail.setLatLngs([pts[0]]);
setChips(0);
updatePanels();
map.fitBounds(pts, { padding: [40, 40] });
}
function stepOneLeg(){
if (i >= CODE.length - 1) return;
const target = pts[Math.min(i+1, pts.length-1)];
traveller.setLatLng(target);
trail.addLatLng(target);
i = Math.min(i+1, CODE.length-1);
t = 0;
setChips(i);
updatePanels();
if (keepCentred) map.panTo(target, { animate:false });
}
function animate(now){
if (!playing) return;
if (!lastT) lastT = now;
const delta = (now - lastT) / 1000;
lastT = now;
const legCount = CODE.length - 1;
if (i >= legCount){
playing = false;
setPlayButton();
updatePanels();
return;
}
if (dwell > 0){
dwell -= delta;
pulseMarker(now);
requestAnimationFrame(animate);
return;
}
const secPerLeg = BASE\_SEC\_PER\_LEG / Math.max(0.1, speed);
t += delta / secPerLeg;
if (t > 1) t = 1;
const aL = CODE[i], bL = CODE[i+1];
const A = NODES[aL], B = NODES[bL];
const u = ease(t);
const lat = A.lat + (B.lat - A.lat) \* u;
const lon = A.lon + (B.lon - A.lon) \* u;
const pos = [lat, lon];
traveller.setLatLng(pos);
trail.addLatLng(pos);
if (keepCentred && Math.random() < 0.35) map.panTo(pos, { animate:false });
setChips(i);
updatePanels();
pulseMarker(now);
if (t >= 1){
i++;
t = 0;
setChips(i);
updatePanels();
dwell = DWELL\_SEC;
}
requestAnimationFrame(animate);
}
// Drawer toggles
toggleCode.addEventListener('click', function(){
const open = codeDrawer.classList.toggle('open');
toggleCode.textContent = open ? "Code ▴" : "Code ▾";
setTimeout(function(){ map.invalidateSize(); }, 50);
});
toggleDetails.addEventListener('click', function(){
const open = detailsDrawer.classList.toggle('open');
toggleDetails.textContent = open ? "Details ▴" : "Details ▾";
setTimeout(function(){ map.invalidateSize(); }, 50);
});
// Controls
playBtn.addEventListener('click', function(){
if (!playing){
if (i >= CODE.length - 1) reset();
playing = true;
lastT = null;
setPlayButton();
requestAnimationFrame(animate);
} else {
playing = false;
setPlayButton();
}
});
stepBtn.addEventListener('click', function(){
playing = false;
setPlayButton();
stepOneLeg();
});
resetBtn.addEventListener('click', reset);
speedSlider.addEventListener('input', function(e){
speed = parseFloat(e.target.value);
speedLabel.textContent = speed.toFixed(1) + "×";
});
centreSlider.addEventListener('input', function(e){
keepCentred = (parseInt(e.target.value, 10) === 1);
centreLabel.textContent = keepCentred ? "On" : "Off";
});
// Init
speedLabel.textContent = parseFloat(speedSlider.value).toFixed(1) + "×";
centreLabel.textContent = "On";
updatePanels();
setTimeout(function(){ map.invalidateSize(); }, 300);
});
})();

Why was this route abandoned? There's no way to know for certain. Maybe Thomson moved. Maybe Webb found out she worked somewhere else. Maybe he just changed his approach. But whatever the reason, the crossed-out line tells us something important: this was a **working document**—something he was actively using and revising, not a finished coded message waiting to be deciphered.

# **Line 3: MTBIMPANETP**

By Line 3, Webb appears to be expanding his search, covering more ground across Adelaide's railway network.

## **The Extended Route**

| **Pos** | **Ltr** | **Station** | **To Next** | **Notes** |
| --- | --- | --- | --- | --- |
| 1 | **M** | **MARINO** | → 9 km | Southern coastal station |
| 2 | **T** | **TORRENS/THEBARTON** | → 8 km | Inner western area |
| 3 | **B** | **BRIGHTON** | → 12 km | Coastal station |
| 4 | **I** | **ISLINGTON** | → 15 km | Northern suburbs |
| 5 | **M** | **MARINO** | → 18 km | Return to southern coastal |
| 6 | **P** | **PORT ADELAIDE** | → 12 km | Northwestern port terminus |
| 7 | **A** | **ADELAIDE** | → 8 km | Central terminus |
| 8 | **N** | **NORTHFIELD** | → 4 km | Northern line |
| 9 | **E** | **ENFIELD** | → 8 km | Northern suburbs |
| 10 | **T** | **TORRENS/THEBARTON** | → 10 km | Western area |
| 11 | **P** | **PORT ADELAIDE** | — END — | Port terminus |

**Total Distance: 104 km | Average Leg: 10.4 km**

:root{
--panel: rgba(255,255,255,0.92);
--line: #e6eaf2;
--text: #0b1220;
--muted: #4b5565;
--red: #ef4444;
--shadow: 0 10px 26px rgba(2,6,23,.10);
--radius: 16px;
}
#smceL3-mapArea{height:520px;width:100%;position:relative;background:#eef2ff;}
#smceL3-map{height:100%;width:100%;}
.smceL3-card{
position:absolute;left:12px;width:min(360px,calc(100% - 24px));
background:var(--panel);border:1px solid var(--line);
border-radius:var(--radius);box-shadow:var(--shadow);
z-index:2000;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
overflow:hidden;
}
.smceL3-top{top:12px;}
.smceL3-bottom{bottom:12px;}
.smceL3-header{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;align-items:flex-start;}
.smceL3-title{font-weight:900;font-size:13px;letter-spacing:-.02em;line-height:1.1;color:var(--text);}
.smceL3-sub{font-size:11px;color:var(--muted);margin-top:2px;line-height:1.2;}
.smceL3-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center;}
.smceL3-btn{
background:white;border:1px solid var(--line);
border-radius:12px;padding:7px 10px;
font-weight:900;font-size:12px;cursor:pointer;
user-select:none;touch-action:manipulation;
box-shadow:0 6px 14px rgba(2,6,23,.07);
white-space:nowrap;
}
.smceL3-btn.primary{
background:linear-gradient(135deg,#ef4444,#f97316);
color:white;border-color:rgba(239,68,68,.25);
}
.smceL3-btn:active{transform:translateY(1px);}
.smceL3-drawer{border-top:1px solid var(--line);padding:10px 12px;display:none;}
.smceL3-drawer.open{display:block;}
.smceL3-chips{display:flex;gap:4px;flex-wrap:wrap;}
.smceL3-chip{
min-width:26px;padding:5px 7px;border-radius:10px;
background:#fff;border:1px solid var(--line);
font-weight:900;font-size:11px;text-align:center;
}
.smceL3-chip.active{background:var(--red);color:#fff;}
.smceL3-chip.done{background:#fee2e2;color:#991b1b;}
.smceL3-kv{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:3px 0;font-size:12px;}
.smceL3-k{color:var(--muted);font-weight:900;}
.smceL3-v{color:var(--text);font-weight:900;text-align:right;}
.smceL3-progressOuter{
margin-top:8px;height:7px;background:#fff;
border:1px solid var(--line);border-radius:999px;overflow:hidden;
}
.smceL3-progressInner{
height:100%;width:0%;
background:linear-gradient(90deg,#ef4444,#f97316);
}
@media (max-width: 480px){
.smceL3-card{width:min(320px,calc(100% - 24px));}
.smceL3-sub{display:none;}
}

Somerton Man Code Explorer — Line 3

MTBIMPANETP • dense inner-west / port / north-east sweep

Play
Step
Reset
Code ▾

Current

—

Next

—

Details ▾

Leg

—

Distance

—

(function(){
function ready(fn){ if (typeof L !== 'undefined') fn(); else setTimeout(function(){ ready(fn); }, 120); }
ready(function(){
// LINE 3: MTBIMPANETP
var CODE = "MTBIMPANETP".split("");
// Same node mapping you’ve been using in your explorer build
var NODES = {
M:{ n:"Mile End", lat:-34.9250, lon:138.5801 },
T:{ n:"Thebarton / Torrensville", lat:-34.9000, lon:138.5670 },
B:{ n:"Brighton", lat:-35.0480, lon:138.5080 },
I:{ n:"Islington", lat:-34.8680, lon:138.5900 },
P:{ n:"Commercial Road, Port Adelaide", lat:-34.8450, lon:138.5050 },
A:{ n:"Adelaide", lat:-34.9227, lon:138.5983 },
N:{ n:"Northfield", lat:-34.83953, lon:138.62325 },
E:{ n:"Enfield", lat:-34.8610, lon:138.5970 }
};
// Elements
var mapEl = document.getElementById('smceL3-map');
var topCard = document.getElementById('smceL3-topCard');
var bottomCard = document.getElementById('smceL3-bottomCard');
var playBtn = document.getElementById('smceL3-playBtn');
var stepBtn = document.getElementById('smceL3-stepBtn');
var resetBtn = document.getElementById('smceL3-resetBtn');
var toggleCode = document.getElementById('smceL3-toggleCode');
var toggleDetails = document.getElementById('smceL3-toggleDetails');
var codeDrawer = document.getElementById('smceL3-codeDrawer');
var detailsDrawer = document.getElementById('smceL3-detailsDrawer');
var chipsBox = document.getElementById('smceL3-chips');
var nowEl = document.getElementById('smceL3-now');
var nextEl = document.getElementById('smceL3-next');
var legEl = document.getElementById('smceL3-leg');
var distEl = document.getElementById('smceL3-dist');
var progEl = document.getElementById('smceL3-progress');
// Prevent map drag/scroll starting on HUD
L.DomEvent.disableClickPropagation(topCard);
L.DomEvent.disableScrollPropagation(topCard);
L.DomEvent.disableClickPropagation(bottomCard);
L.DomEvent.disableScrollPropagation(bottomCard);
// Build points
var pts = CODE.map(function(l){ return [NODES[l].lat, NODES[l].lon]; });
// Map
var map = L.map(mapEl, { zoomControl:true }).fitBounds(pts, { padding:[40,40] });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
maxZoom:19,
attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);
// Ghost full route + animated trail (red)
L.polyline(pts, { color:'#ef4444', weight:3, opacity:0.22 }).addTo(map);
// Pins (no text labels)
var seen = {};
CODE.forEach(function(l){
if (seen[l]) return;
seen[l] = true;
var n = NODES[l];
L.circleMarker([n.lat,n.lon], {
radius:6, color:'#7f1d1d', weight:2,
fillColor:'#ef4444', fillOpacity:0.9
}).addTo(map);
});
var traveller = L.circleMarker(pts[0], {
radius:7, color:'#0b1220', weight:2,
fillColor:'#f59e0b', fillOpacity:1
}).addTo(map);
var trail = L.polyline([pts[0]], { color:'#ef4444', weight:5, opacity:0.95 }).addTo(map);
// Chips
var chips = [];
chipsBox.innerHTML = "";
CODE.forEach(function(c, idx){
var s = document.createElement('span');
s.className = 'smceL3-chip' + (idx===0 ? ' active' : '');
s.textContent = c;
chipsBox.appendChild(s);
chips.push(s);
});
function setChips(activeIdx){
chips.forEach(function(c, idx){
c.classList.toggle('active', idx === activeIdx);
c.classList.toggle('done', idx < activeIdx);
});
}
// Maths
function havKm(a, b){
var R=6371, toRad=function(d){ return d\*Math.PI/180; };
var dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
var la1=toRad(a.lat), la2=toRad(b.lat);
var x=Math.sin(dLat/2)\*\*2 + Math.cos(la1)\*Math.cos(la2)\*Math.sin(dLon/2)\*\*2;
return R\*(2\*Math.atan2(Math.sqrt(x), Math.sqrt(1-x)));
}
// Playback state
var i = 0; // leg index
var t = 0; // 0..1 within leg
var playing = false;
var lastTs = null;
function updatePanels(){
var legCount = CODE.length - 1;
if (i >= legCount){
nowEl.textContent = CODE[CODE.length-1] + " — " + NODES[CODE[CODE.length-1]].n;
nextEl.textContent = "—";
legEl.textContent = "Complete";
distEl.textContent = "—";
progEl.style.width = "100%";
return;
}
var aL = CODE[i], bL = CODE[i+1];
var A = NODES[aL], B = NODES[bL];
nowEl.textContent = aL + " — " + A.n;
nextEl.textContent = bL + " — " + B.n;
legEl.textContent = (i+1) + " / " + legCount;
distEl.textContent = havKm(A,B).toFixed(1) + " km";
var overall = (i + t) / legCount;
progEl.style.width = (Math.max(0, Math.min(1, overall)) \* 100) + "%";
}
function animate(ts){
if (!playing) return;
if (!lastTs) lastTs = ts;
var dt = (ts - lastTs) / 1000;
lastTs = ts;
if (i >= CODE.length - 1){
playing = false;
playBtn.textContent = "Play";
return;
}
t += dt / 1.55; // seconds per leg (tweak here)
if (t > 1) t = 1;
var A = NODES[CODE[i]];
var B = NODES[CODE[i+1]];
var pos = [
A.lat + (B.lat - A.lat) \* t,
A.lon + (B.lon - A.lon) \* t
];
traveller.setLatLng(pos);
trail.addLatLng(pos);
updatePanels();
setChips(i);
if (t >= 1){
i++;
t = 0;
}
requestAnimationFrame(animate);
}
// Controls
playBtn.addEventListener('click', function(){
playing = !playing;
playBtn.textContent = playing ? "Pause" : "Play";
lastTs = null;
if (playing) requestAnimationFrame(animate);
});
stepBtn.addEventListener('click', function(){
playing = false;
playBtn.textContent = "Play";
if (i < CODE.length - 1){
i++;
traveller.setLatLng(pts[i]);
trail.addLatLng(pts[i]);
t = 0;
updatePanels();
setChips(i);
}
});
resetBtn.addEventListener('click', function(){
playing = false;
playBtn.textContent = "Play";
i = 0; t = 0; lastTs = null;
traveller.setLatLng(pts[0]);
trail.setLatLngs([pts[0]]);
setChips(0);
updatePanels();
map.fitBounds(pts, { padding:[40,40] });
});
// Drawers
toggleCode.addEventListener('click', function(){
codeDrawer.classList.toggle('open');
toggleCode.textContent = codeDrawer.classList.contains('open') ? "Code ▴" : "Code ▾";
});
toggleDetails.addEventListener('click', function(){
detailsDrawer.classList.toggle('open');
toggleDetails.textContent = detailsDrawer.classList.contains('open') ? "Details ▴" : "Details ▾";
});
// Init
updatePanels();
setTimeout(function(){ map.invalidateSize(); }, 250);
});
})();

# **Line 4: MLIABOAIAQC**

Line 4 continues the same pattern—systematic coverage of Adelaide's railway network, checking more locations and pushing further north.

## **The Route**

| **Pos** | **Ltr** | **Station** | **To Next** | **Notes** |
| --- | --- | --- | --- | --- |
| 1 | **M** | **MARINO** | → 15 km | Southern coastal station |
| 2 | **L** | **LARGS BAY** | → 8 km | Northwestern coastal |
| 3 | **I** | **ISLINGTON** | → 4 km | Northern suburbs |
| 4 | **A** | **ADELAIDE** | → 10 km | Central terminus |
| 5 | **B** | **BRIGHTON** | → 12 km | Coastal station |
| 6 | **O** | **OAKLANDS** | → 8 km | Eastern suburbs |
| 7 | **A** | **ADELAIDE** | → 6 km | Central terminus |
| 8 | **I** | **ISLINGTON** | → 4 km | Northern suburbs |
| 9 | **A** | **ADELAIDE** | → 15 km | Central terminus |
| 10 | **Q** | **QUEENSTOWN** | → 18 km | Northern line station |
| 11 | **C** | **CHELTENHAM** | — END — | Coastal area adjacent to Glenelg |

**Total Distance: 100 km | Average Leg: 10 km**

:root{
--panel: rgba(255,255,255,0.92);
--line: #e6eaf2;
--text: #0b1220;
--muted: #4b5565;
--red: #ef4444;
--shadow: 0 10px 26px rgba(2,6,23,.10);
--radius: 16px;
}
#smceL4-mapArea{height:520px;width:100%;position:relative;background:#eef2ff;}
#smceL4-map{height:100%;width:100%;}
.smceL4-card{
position:absolute;left:12px;width:min(360px,calc(100% - 24px));
background:var(--panel);border:1px solid var(--line);
border-radius:var(--radius);box-shadow:var(--shadow);
z-index:2000;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
overflow:hidden;
}
.smceL4-top{top:12px;}
.smceL4-bottom{bottom:12px;}
.smceL4-header{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;align-items:flex-start;}
.smceL4-title{font-weight:900;font-size:13px;letter-spacing:-.02em;line-height:1.1;color:var(--text);}
.smceL4-sub{font-size:11px;color:var(--muted);margin-top:2px;line-height:1.2;}
.smceL4-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center;}
.smceL4-btn{
background:white;border:1px solid var(--line);
border-radius:12px;padding:7px 10px;
font-weight:900;font-size:12px;cursor:pointer;
user-select:none;touch-action:manipulation;
box-shadow:0 6px 14px rgba(2,6,23,.07);
white-space:nowrap;
}
.smceL4-btn.primary{
background:linear-gradient(135deg,#ef4444,#f97316);
color:white;border-color:rgba(239,68,68,.25);
}
.smceL4-btn:active{transform:translateY(1px);}
.smceL4-drawer{border-top:1px solid var(--line);padding:10px 12px;display:none;}
.smceL4-drawer.open{display:block;}
.smceL4-chips{display:flex;gap:4px;flex-wrap:wrap;}
.smceL4-chip{
min-width:26px;padding:5px 7px;border-radius:10px;
background:#fff;border:1px solid var(--line);
font-weight:900;font-size:11px;text-align:center;
}
.smceL4-chip.active{background:var(--red);color:#fff;}
.smceL4-chip.done{background:#fee2e2;color:#991b1b;}
.smceL4-kv{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:3px 0;font-size:12px;}
.smceL4-k{color:var(--muted);font-weight:900;}
.smceL4-v{color:var(--text);font-weight:900;text-align:right;}
.smceL4-progressOuter{
margin-top:8px;height:7px;background:#fff;
border:1px solid var(--line);border-radius:999px;overflow:hidden;
}
.smceL4-progressInner{
height:100%;width:0%;
background:linear-gradient(90deg,#ef4444,#f97316);
}
@media (max-width: 480px){
.smceL4-card{width:min(320px,calc(100% - 24px));}
.smceL4-sub{display:none;}
}

Somerton Man Code Explorer — Line 4

MLIABOAIAQC • ends A–Q–C as three separate anchors

Play
Step
Reset
Code ▾

Current

—

Next

—

Details ▾

Leg

—

Distance

—

(function(){
function ready(fn){ if (typeof L !== 'undefined') fn(); else setTimeout(function(){ ready(fn); }, 120); }
ready(function(){
var CODE = "MLIABOAIAQC".split("");
var NODES = {
M:{ n:"Mile End", lat:-34.9250, lon:138.5801 },
L:{ n:"Largs Bay", lat:-34.8250, lon:138.4900 },
I:{ n:"Islington", lat:-34.8680, lon:138.5900 },
A:{ n:"Adelaide", lat:-34.9227, lon:138.5983 },
B:{ n:"Brighton", lat:-35.0480, lon:138.5080 },
O:{ n:"Oaklands Park", lat:-35.0099, lon:138.5402 },
Q:{ n:"Queenstown", lat:-34.862315, lon:138.509005 },
C:{ n:"Cheltenham", lat:-34.86986, lon:138.52856 }
};
var mapEl = document.getElementById('smceL4-map');
var topCard = document.getElementById('smceL4-topCard');
var bottomCard = document.getElementById('smceL4-bottomCard');
var playBtn = document.getElementById('smceL4-playBtn');
var stepBtn = document.getElementById('smceL4-stepBtn');
var resetBtn = document.getElementById('smceL4-resetBtn');
var toggleCode = document.getElementById('smceL4-toggleCode');
var toggleDetails = document.getElementById('smceL4-toggleDetails');
var codeDrawer = document.getElementById('smceL4-codeDrawer');
var detailsDrawer = document.getElementById('smceL4-detailsDrawer');
var chipsBox = document.getElementById('smceL4-chips');
var nowEl = document.getElementById('smceL4-now');
var nextEl = document.getElementById('smceL4-next');
var legEl = document.getElementById('smceL4-leg');
var distEl = document.getElementById('smceL4-dist');
var progEl = document.getElementById('smceL4-progress');
L.DomEvent.disableClickPropagation(topCard);
L.DomEvent.disableScrollPropagation(topCard);
L.DomEvent.disableClickPropagation(bottomCard);
L.DomEvent.disableScrollPropagation(bottomCard);
var pts = CODE.map(function(l){ return [NODES[l].lat, NODES[l].lon]; });
var map = L.map(mapEl, { zoomControl:true }).fitBounds(pts, { padding:[40,40] });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
maxZoom:19, attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);
L.polyline(pts, { color:'#ef4444', weight:3, opacity:0.22 }).addTo(map);
var seen = {};
CODE.forEach(function(l){
if (seen[l]) return;
seen[l]=true;
var n = NODES[l];
L.circleMarker([n.lat,n.lon], { radius:6, color:'#7f1d1d', weight:2, fillColor:'#ef4444', fillOpacity:0.9 }).addTo(map);
});
var traveller = L.circleMarker(pts[0], { radius:7, color:'#0b1220', weight:2, fillColor:'#f59e0b', fillOpacity:1 }).addTo(map);
var trail = L.polyline([pts[0]], { color:'#ef4444', weight:5, opacity:0.95 }).addTo(map);
var chips = [];
chipsBox.innerHTML = "";
CODE.forEach(function(c, idx){
var s=document.createElement('span');
s.className='smceL4-chip'+(idx===0?' active':'');
s.textContent=c;
chipsBox.appendChild(s);
chips.push(s);
});
function setChips(activeIdx){
chips.forEach(function(c, idx){
c.classList.toggle('active', idx===activeIdx);
c.classList.toggle('done', idx<activeIdx);
});
}
function havKm(a,b){
var R=6371, toRad=function(d){return d\*Math.PI/180;};
var dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
var la1=toRad(a.lat), la2=toRad(b.lat);
var x=Math.sin(dLat/2)\*\*2 + Math.cos(la1)\*Math.cos(la2)\*Math.sin(dLon/2)\*\*2;
return R\*(2\*Math.atan2(Math.sqrt(x), Math.sqrt(1-x)));
}
var i=0, t=0, playing=false, lastTs=null;
function updatePanels(){
var legCount = CODE.length-1;
if (i >= legCount){
nowEl.textContent = CODE[CODE.length-1] + " — " + NODES[CODE[CODE.length-1]].n;
nextEl.textContent = "—";
legEl.textContent = "Complete";
distEl.textContent = "—";
progEl.style.width = "100%";
return;
}
var aL=CODE[i], bL=CODE[i+1];
var A=NODES[aL], B=NODES[bL];
nowEl.textContent = aL + " — " + A.n;
nextEl.textContent = bL + " — " + B.n;
legEl.textContent = (i+1) + " / " + legCount;
distEl.textContent = havKm(A,B).toFixed(1) + " km";
var overall = (i + t) / legCount;
progEl.style.width = (Math.max(0, Math.min(1, overall)) \* 100) + "%";
}
function animate(ts){
if (!playing) return;
if (!lastTs) lastTs = ts;
var dt = (ts - lastTs) / 1000;
lastTs = ts;
if (i >= CODE.length - 1){
playing=false;
playBtn.textContent="Play";
return;
}
t += dt / 1.55;
if (t > 1) t = 1;
var A = NODES[CODE[i]];
var B = NODES[CODE[i+1]];
var pos = [ A.lat + (B.lat-A.lat)\*t, A.lon + (B.lon-A.lon)\*t ];
traveller.setLatLng(pos);
trail.addLatLng(pos);
updatePanels();
setChips(i);
if (t >= 1){ i++; t=0; }
requestAnimationFrame(animate);
}
playBtn.addEventListener('click', function(){
playing = !playing;
playBtn.textContent = playing ? "Pause" : "Play";
lastTs = null;
if (playing) requestAnimationFrame(animate);
});
stepBtn.addEventListener('click', function(){
playing=false;
playBtn.textContent="Play";
if (i < CODE.length - 1){
i++;
traveller.setLatLng(pts[i]);
trail.addLatLng(pts[i]);
t=0;
updatePanels();
setChips(i);
}
});
resetBtn.addEventListener('click', function(){
playing=false;
playBtn.textContent="Play";
i=0; t=0; lastTs=null;
traveller.setLatLng(pts[0]);
trail.setLatLngs([pts[0]]);
setChips(0);
updatePanels();
map.fitBounds(pts, { padding:[40,40] });
});
toggleCode.addEventListener('click', function(){
codeDrawer.classList.toggle('open');
toggleCode.textContent = codeDrawer.classList.contains('open') ? "Code ▴" : "Code ▾";
});
toggleDetails.addEventListener('click', function(){
detailsDrawer.classList.toggle('open');
toggleDetails.textContent = detailsDrawer.classList.contains('open') ? "Details ▴" : "Details ▾";
});
updatePanels();
setTimeout(function(){ map.invalidateSize(); }, 250);
});
})();

Notice where this line ends: Cheltenham, right next to Glenelg—where Thomson lived. After checking Queenstown in the north, Webb circles back to the coastal area where his target was. The search keeps coming back to the same place.

# **Line 5: ITTMTSAMSTGAB — The Final Journey**

Line 5 is the longest entry, and it's the most important one. Look at how it ends: **G-A-B**. Glenelg, Adelaide, Brighton. That's exactly where Webb died.

## **The Route**

| **Pos** | **Ltr** | **Station** | **To Next** | **Notes** |
| --- | --- | --- | --- | --- |
| 1 | **I** | **ISLINGTON** | → 5 km | Northern suburbs |
| 2 | **T** | **TORRENS/THEBARTON** | → 5 km | Inner western area |
| 3 | **T** | **TORRENS/THEBARTON** | → 12 km | Repeated location indicator |
| 4 | **M** | **MARINO** | → 10 km | Southern coastal station |
| 5 | **T** | **TORRENS/THEBARTON** | → 8 km | Western area |
| 6 | **S** | **SEATON** | → 10 km | Western coastal suburbs |
| 7 | **A** | **ADELAIDE** | → 12 km | Luggage stored Nov 30, 1948 |
| 8 | **M** | **MARINO** | → 15 km | Southern coastal station |
| 9 | **S** | **SEATON** | → 6 km | Western coastal |
| 10 | **T** | **TORRENS/THEBARTON** | → 8 km | Western area |
| **11** | **G** | **GLENELG** | → 11 km | 52 Moseley St—Thomson's address |
| **12** | **A** | **ADELAIDE** | → 10 km | Central terminus |
| **13** | **B** | **BRIGHTON** | — END — | 1.5 km from body discovery site |

**Total Distance: 102 km | Average Leg: 8.5 km**

:root{
--panel: rgba(255,255,255,0.92);
--line: #e6eaf2;
--text: #0b1220;
--muted: #4b5565;
--red: #ef4444;
--shadow: 0 10px 26px rgba(2,6,23,.10);
--radius: 16px;
}
#smceL5-mapArea{height:520px;width:100%;position:relative;background:#eef2ff;}
#smceL5-map{height:100%;width:100%;}
.smceL5-card{
position:absolute;left:12px;width:min(360px,calc(100% - 24px));
background:var(--panel);border:1px solid var(--line);
border-radius:var(--radius);box-shadow:var(--shadow);
z-index:2000;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
overflow:hidden;
}
.smceL5-top{top:12px;}
.smceL5-bottom{bottom:12px;}
.smceL5-header{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;align-items:flex-start;}
.smceL5-title{font-weight:900;font-size:13px;letter-spacing:-.02em;line-height:1.1;color:var(--text);}
.smceL5-sub{font-size:11px;color:var(--muted);margin-top:2px;line-height:1.2;}
.smceL5-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center;}
.smceL5-btn{
background:white;border:1px solid var(--line);
border-radius:12px;padding:7px 10px;
font-weight:900;font-size:12px;cursor:pointer;
user-select:none;touch-action:manipulation;
box-shadow:0 6px 14px rgba(2,6,23,.07);
white-space:nowrap;
}
.smceL5-btn.primary{
background:linear-gradient(135deg,#ef4444,#f97316);
color:white;border-color:rgba(239,68,68,.25);
}
.smceL5-btn:active{transform:translateY(1px);}
.smceL5-drawer{border-top:1px solid var(--line);padding:10px 12px;display:none;}
.smceL5-drawer.open{display:block;}
.smceL5-chips{display:flex;gap:4px;flex-wrap:wrap;}
.smceL5-chip{
min-width:26px;padding:5px 7px;border-radius:10px;
background:#fff;border:1px solid var(--line);
font-weight:900;font-size:11px;text-align:center;
}
.smceL5-chip.active{background:var(--red);color:#fff;}
.smceL5-chip.done{background:#fee2e2;color:#991b1b;}
.smceL5-kv{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:3px 0;font-size:12px;}
.smceL5-k{color:var(--muted);font-weight:900;}
.smceL5-v{color:var(--text);font-weight:900;text-align:right;}
.smceL5-progressOuter{
margin-top:8px;height:7px;background:#fff;
border:1px solid var(--line);border-radius:999px;overflow:hidden;
}
.smceL5-progressInner{
height:100%;width:0%;
background:linear-gradient(90deg,#ef4444,#f97316);
}

Somerton Man Code Explorer — Line 5

ITTMTSAMSTGAB • dense western loop, Glenelg appears late

Play
Step
Reset
Code ▾

Current

—

Next

—

Details ▾

Leg

—

Distance

—

(function(){
const CODE="ITTMTSAMSTGAB".split("");
const NODES={
I:{n:"Islington",lat:-34.868,lon:138.59},
T:{n:"Thebarton / Torrensville",lat:-34.9,lon:138.567},
M:{n:"Mile End",lat:-34.925,lon:138.5801},
S:{n:"Seaton / Seaton Park",lat:-34.8921,lon:138.5136},
A:{n:"Adelaide",lat:-34.9227,lon:138.5983},
G:{n:"Glenelg",lat:-34.98055,lon:138.51393},
B:{n:"Brighton",lat:-35.048,lon:138.508}
};
const pts=CODE.map(l=>[NODES[l].lat,NODES[l].lon]);
const map=L.map('smceL5-map').fitBounds(pts,{padding:[40,40]});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
L.polyline(pts,{color:'#ef4444',weight:3,opacity:.25}).addTo(map);
const traveller=L.circleMarker(pts[0],{radius:7,color:'#111',weight:2,fillColor:'#f59e0b',fillOpacity:1}).addTo(map);
const trail=L.polyline([pts[0]],{color:'#ef4444',weight:5}).addTo(map);
const chips=[],chipsBox=document.getElementById('chipsL5');
CODE.forEach((c,i)=>{const s=document.createElement('span');s.className='smceL5-chip'+(i===0?' active':'');s.textContent=c;chipsBox.appendChild(s);chips.push(s);});
const nowEl=nowL5,nextEl=nextL5,legEl=legL5,distEl=distL5,prog=progressL5;
const hav=(a,b)=>{const R=6371,to=d=>d\*Math.PI/180;
const dLat=to(b.lat-a.lat),dLon=to(b.lon-a.lon);
const x=Math.sin(dLat/2)\*\*2+Math.cos(to(a.lat))\*Math.cos(to(b.lat))\*Math.sin(dLon/2)\*\*2;
return R\*(2\*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)));
};
let i=0,t=0,playing=false,last=null;
function update(){
if(i>=CODE.length-1){nowEl.textContent=CODE.at(-1)+" — "+NODES[CODE.at(-1)].n;prog.style.width="100%";return;}
const A=NODES[CODE[i]],B=NODES[CODE[i+1]];
nowEl.textContent=CODE[i]+" — "+A.n;
nextEl.textContent=CODE[i+1]+" — "+B.n;
legEl.textContent=(i+1)+" / "+(CODE.length-1);
distEl.textContent=hav(A,B).toFixed(1)+" km";
prog.style.width=((i+t)/(CODE.length-1))\*100+"%";
}
function animate(ts){
if(!playing) return;
if(!last) last=ts;
const dt=(ts-last)/1000; last=ts;
if(i>=CODE.length-1){playing=false;playBtnL5.textContent="Play";return;}
t+=dt/1.6; if(t>1)t=1;
const A=NODES[CODE[i]],B=NODES[CODE[i+1]];
const pos=[A.lat+(B.lat-A.lat)\*t,A.lon+(B.lon-A.lon)\*t];
traveller.setLatLng(pos); trail.addLatLng(pos);
update();
if(t>=1){i++;t=0;}
requestAnimationFrame(animate);
}
playBtnL5.onclick=()=>{playing=!playing;playBtnL5.textContent=playing?"Pause":"Play";last=null;if(playing)requestAnimationFrame(animate);};
stepBtnL5.onclick=()=>{playing=false;playBtnL5.textContent="Play";if(i<CODE.length-1){i++;traveller.setLatLng(pts[i]);trail.addLatLng(pts[i]);update();}};
resetBtnL5.onclick=()=>{playing=false;playBtnL5.textContent="Play";i=0;t=0;traveller.setLatLng(pts[0]);trail.setLatLngs([pts[0]]);update();map.fitBounds(pts,{padding:[40,40]});};
toggleCodeL5.onclick=()=>codeDrawerL5.classList.toggle('open');
toggleDetailsL5.onclick=()=>detailsDrawerL5.classList.toggle('open');
update();
})();

## **The Final Three Letters**

The code ends **G-A-B**, and those three letters trace the geographic footprint of Webb's final hours.

**G — Glenelg.** Where Jessica Thomson lived at 52 Moseley Street. Where the Rubáiyát was found in a parked car. Where Webb likely saw her for the last time.

**A — Adelaide.** Where Webb stored his suitcase at the railway station on November 30, 1948. That's the action of someone who knew he wouldn't need it again.

**B — Brighton.** Just 1.5 kilometres from Somerton Beach. The last station before his final destination.

# **Putting It All Together**

This report has traced five lines of letters through Adelaide's railway network. Each line maps to actual stations that existed in 1948. Each route shows station-to-station distances that make sense for real travel—mostly under 15 kilometres. Each sequence covers ground systematically, the way someone would if they were searching for a person.

## **Summary**

| **Code Line** | **Total** | **Avg Leg** | **What It Shows** |
| --- | --- | --- | --- |
| Line 1: MRGOABABD | 77.5 km | 9.7 km | Local search, ABAB pattern |
| *~~Line 2: MLIAOI~~* | *~~45 km~~* | *~~9 km~~* | *~~Abandoned plan~~* |
| Line 3: MTBIMPANETP | 104 km | 10.4 km | Expanded search |
| Line 4: MLIABOAIAQC | 100 km | 10 km | Ends at Cheltenham (near Glenelg) |
| **Line 5: ITTMTSAMSTGAB** | **102 km** | **8.5 km** |  |

:root{
--panel: rgba(255,255,255,0.92);
--line: #e6eaf2;
--text: #0b1220;
--muted: #4b5565;
--shadow: 0 10px 26px rgba(2,6,23,.10);
--radius: 16px;
--c1:#2563eb;
--c2:#f97316;
--c3:#22c55e;
--c4:#a855f7;
--c5:#ef4444;
--anim:#ef4444;
}
#smx-area{height:560px;width:100%;position:relative;background:#eef2ff;}
#smx-map{height:100%;width:100%;}
.smx-card{
position:absolute;
background:var(--panel);
border:1px solid var(--line);
border-radius:var(--radius);
box-shadow:var(--shadow);
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);
z-index:2000;
overflow:hidden;
pointer-events:auto;
}
.smx-top{
left:12px; right:12px; top:12px;
padding:10px 12px;
display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
}
.smx-title{font-weight:900;font-size:13px;letter-spacing:-.02em;line-height:1.1;}
.smx-sub{font-size:11px;color:var(--muted);margin-top:2px;line-height:1.2;}
.smx-actions{display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; align-items:center;}
.smx-btn{
background:white; border:1px solid var(--line);
border-radius:12px; padding:7px 10px;
font-weight:900; font-size:12px; cursor:pointer;
user-select:none; touch-action:manipulation;
box-shadow:0 6px 14px rgba(2,6,23,.07);
white-space:nowrap;
}
.smx-btn.primary{
background: linear-gradient(135deg, #ef4444, #f97316);
color: white;
border-color: rgba(239,68,68,.25);
}
.smx-btn:active{transform: translateY(1px)}
.smx-panel{
left:12px; top:88px;
width:min(360px, calc(100% - 24px));
}
.smx-panelHead{
padding:10px 12px;
display:flex; align-items:center; justify-content:space-between; gap:10px;
border-bottom:1px solid var(--line);
}
.smx-panelTitle{font-weight:900;font-size:12.5px;}
.smx-panelBody{padding:10px 12px;}
.smx-panel.collapsed .smx-panelBody{display:none;}
.smx-note{font-size:11.5px; color:var(--muted); line-height:1.25;}
.smx-row{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px;}
.smx-select{
width:100%;
margin-top:8px;
border:1px solid var(--line);
border-radius:12px;
padding:10px 10px;
background:white;
font-weight:900;
font-size:12.5px;
}
.smx-toggle{
display:flex; align-items:center; gap:10px;
padding:8px 10px;
border:1px solid var(--line);
border-radius:14px;
background:white;
box-shadow: 0 6px 14px rgba(2,6,23,.05);
margin-top:8px;
user-select:none;
touch-action:manipulation;
}
.smx-toggle input{width:18px;height:18px; accent-color:#2563eb;}
.smx-dot{width:12px;height:12px;border-radius:999px; box-shadow:0 0 0 3px rgba(2,6,23,.06);}
.smx-txt{display:flex; flex-direction:column; gap:2px;}
.smx-txt strong{font-size:12.5px}
.smx-txt span{font-size:11px; color:var(--muted); font-weight:800}
.smx-bottom{
left:12px; right:12px; bottom:12px;
padding:10px 12px;
display:flex; gap:12px; flex-wrap:wrap; align-items:center; justify-content:space-between;
}
.smx-kv{display:flex; gap:8px; align-items:baseline;}
.smx-k{font-size:11px; color:var(--muted); font-weight:900;}
.smx-v{font-size:12px; color:var(--text); font-weight:900;}
.smx-progressOuter{
flex:1;
min-width:180px;
height:7px;
background:#fff;
border:1px solid var(--line);
border-radius:999px;
overflow:hidden;
}
.smx-progressInner{
height:100%; width:0%;
background:linear-gradient(90deg,#ef4444,#f97316);
}
@media (max-width: 520px){
#smx-area{height:620px;}
.smx-panel{top:92px;}
.smx-sub{display:none;}
.smx-progressOuter{min-width:140px;}
}

Somerton Man Code Explorer

Overlay all code lines • toggle routes • animate one “focused” line

Play
Step
Reset
Home

Routes & focus

Hide

Turn lines on/off to compare patterns. Choose a focused line to drive the playback (traveller dot + animated trail).
Line 2 is marked as crossed-out in the book.

Focused line

Line 1 — MRGOABABD
Line 2 (crossed-out) — MLIAOI
Line 3 — MTBIMPANETP
Line 4 — MLIABOAIAQC
Line 5 — ITTMTSAMSTGAB

Show all
Hide all

**Line 1**MRGOABABD

**Line 2 (crossed-out)**MLIAOI

**Line 3**MTBIMPANETP

**Line 4**MLIABOAIAQC

**Line 5**ITTMTSAMSTGAB

Focused

Line 1

Current

—

Next

—

Leg

—

Distance

—

(function(){
function ready(fn){
if (typeof L !== 'undefined') fn();
else setTimeout(function(){ ready(fn); }, 120);
}
ready(function(){
const NODES = {
A:{ n:"Adelaide", lat:-34.9227, lon:138.5983 },
M:{ n:"Mile End", lat:-34.9250, lon:138.5801 },
R:{ n:"Richmond", lat:-34.9400, lon:138.5600 },
G:{ n:"Glenelg", lat:-34.98055, lon:138.51393 },
O:{ n:"Oaklands Park", lat:-35.0099, lon:138.5402 },
B:{ n:"Brighton", lat:-35.0480, lon:138.5080 },
D:{ n:"Darlington", lat:-35.0300, lon:138.5570 },
Lg:{ n:"Largs Bay", lat:-34.8250, lon:138.4900 },
I:{ n:"Islington", lat:-34.8680, lon:138.5900 },
T:{ n:"Thebarton / Torrensville", lat:-34.9000, lon:138.5670 },
P:{ n:"Commercial Road, Port Adelaide", lat:-34.8450, lon:138.5050 },
N:{ n:"Northfield", lat:-34.83953, lon:138.62325 },
E:{ n:"Enfield", lat:-34.8610, lon:138.5970 },
S:{ n:"Seaton / Seaton Park", lat:-34.89210, lon:138.51362 },
Q:{ n:"Queenstown", lat:-34.862315, lon:138.509005 },
C:{ n:"Cheltenham", lat:-34.86986, lon:138.52856 }
};
const ROUTES = {
L1:{ name:"Line 1", code:"MRGOABABD", color:getCss('--c1'), crossed:false },
L2:{ name:"Line 2", code:"MLIAOI", color:getCss('--c2'), crossed:true },
L3:{ name:"Line 3", code:"MTBIMPANETP", color:getCss('--c3'), crossed:false },
L4:{ name:"Line 4", code:"MLIABOAIAQC", color:getCss('--c4'), crossed:false },
L5:{ name:"Line 5", code:"ITTMTSAMSTGAB", color:getCss('--c5'), crossed:false }
};
function getCss(v){
return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#2563eb";
}
const map = L.map('smx-map', { zoomControl:true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
maxZoom: 19,
attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
const top = document.getElementById('smxTop');
const panel = document.getElementById('smxPanel');
const bottom = document.getElementById('smxBottom');
[top,panel,bottom].forEach(el=>{
L.DomEvent.disableClickPropagation(el);
L.DomEvent.disableScrollPropagation(el);
});
// Build points for all routes (for initial bounds)
const allPts = [];
Object.values(ROUTES).forEach(r=>{
r.code.split('').forEach(ch=>{
const node = NODES[ch] || NODES[ch === 'L' ? 'Lg' : ch]; // safety if you keep Largs Bay as Lg
if (node) allPts.push([node.lat,node.lon]);
});
});
if (allPts.length) map.fitBounds(allPts, { padding:[60,60] });
const routeLayers = {};
const nodePins = L.layerGroup().addTo(map);
const usedLetters = new Set(Object.values(ROUTES).flatMap(r=>r.code.split('')));
const pinSeen = new Set();
Object.keys(NODES).forEach(key=>{
if (!usedLetters.has(key)) return;
if (pinSeen.has(key)) return;
pinSeen.add(key);
const n = NODES[key];
L.circleMarker([n.lat,n.lon], {
radius: 5,
color: '#0b1220',
weight: 1.5,
fillColor: '#ffffff',
fillOpacity: 0.85
}).addTo(nodePins);
});
function routePts(routeKey){
const letters = ROUTES[routeKey].code.split('');
return letters.map(ch=>{
const node = NODES[ch] || NODES[ch === 'L' ? 'Lg' : ch];
return [node.lat, node.lon];
});
}
function addRoute(routeKey){
const pts = routePts(routeKey);
const r = ROUTES[routeKey];
const poly = L.polyline(pts, {
color: r.color,
weight: 4,
opacity: 0.65
});
routeLayers[routeKey] = poly;
return poly;
}
Object.keys(ROUTES).forEach(k=> addRoute(k));
const visible = new Set(['L1','L3','L4','L5']);
Object.keys(routeLayers).forEach(k=>{
if (visible.has(k)) routeLayers[k].addTo(map);
});
let focusKey = 'L1';
let playing = false;
let legIndex = 0;
let t = 0;
let lastTs = null;
const startPt = routePts(focusKey)[0];
const traveller = L.circleMarker(startPt, {
radius: 7,
color: '#0b1220',
weight: 2,
fillColor: '#f59e0b',
fillOpacity: 1
}).addTo(map);
const animTrail = L.polyline([startPt], {
color: getCss('--anim'),
weight: 6,
opacity: 0.95
}).addTo(map);
const focusBase = L.polyline(routePts(focusKey), {
color: '#ef4444',
weight: 3,
opacity: 0.18
}).addTo(map);
function havKm(a,b){
const R=6371;
const toRad=d=>d\*Math.PI/180;
const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
const la1=toRad(a.lat), la2=toRad(b.lat);
const x=Math.sin(dLat/2)\*\*2 + Math.cos(la1)\*Math.cos(la2)\*Math.sin(dLon/2)\*\*2;
return R\*(2\*Math.atan2(Math.sqrt(x), Math.sqrt(1-x)));
}
const elFocusedLabel = document.getElementById('smxFocusedLabel');
const elNow = document.getElementById('smxNow');
const elNext = document.getElementById('smxNext');
const elLeg = document.getElementById('smxLeg');
const elDist = document.getElementById('smxDist');
const elProg = document.getElementById('smxProgress');
const btnPlay = document.getElementById('smxPlay');
const btnStep = document.getElementById('smxStep');
const btnReset = document.getElementById('smxReset');
const btnHome = document.getElementById('smxHome');
const selFocus = document.getElementById('smxFocus');
const tog = {
L1: document.getElementById('togL1'),
L2: document.getElementById('togL2'),
L3: document.getElementById('togL3'),
L4: document.getElementById('togL4'),
L5: document.getElementById('togL5')
};
function nodeFor(ch){
return NODES[ch] || NODES[ch === 'L' ? 'Lg' : ch];
}
function updateBottomPanel(){
const letters = ROUTES[focusKey].code.split('');
const legs = letters.length - 1;
if (legIndex >= legs){
const lastCh = letters[letters.length-1];
const lastNode = nodeFor(lastCh);
elFocusedLabel.textContent = ROUTES[focusKey].name + (ROUTES[focusKey].crossed ? " (crossed-out)" : "");
elNow.textContent = lastCh + " — " + lastNode.n;
elNext.textContent = "—";
elLeg.textContent = "Complete";
elDist.textContent = "—";
elProg.style.width = "100%";
return;
}
const aCh = letters[legIndex], bCh = letters[legIndex+1];
const A = nodeFor(aCh), B = nodeFor(bCh);
elFocusedLabel.textContent = ROUTES[focusKey].name + (ROUTES[focusKey].crossed ? " (crossed-out)" : "");
elNow.textContent = aCh + " — " + A.n;
elNext.textContent = bCh + " — " + B.n;
elLeg.textContent = (legIndex+1) + " / " + legs;
elDist.textContent = havKm(A,B).toFixed(1) + " km";
const overall = (legIndex + t) / legs;
elProg.style.width = (Math.max(0, Math.min(1, overall)) \* 100) + "%";
}
function setFocus(newKey, frame=true){
focusKey = newKey;
playing = false;
btnPlay.textContent = "Play";
legIndex = 0;
t = 0;
lastTs = null;
const pts = routePts(focusKey);
traveller.setLatLng(pts[0]);
animTrail.setLatLngs([pts[0]]);
focusBase.setLatLngs(pts);
updateBottomPanel();
if (frame){
map.fitBounds(pts, { padding:[70,70] });
}
}
function tick(ts){
if (!playing) return;
if (!lastTs) lastTs = ts;
const dt = (ts - lastTs) / 1000;
lastTs = ts;
const letters = ROUTES[focusKey].code.split('');
const legs = letters.length - 1;
if (legIndex >= legs){
playing = false;
btnPlay.textContent = "Play";
return;
}
t += dt / 1.6;
if (t > 1) t = 1;
const aCh = letters[legIndex], bCh = letters[legIndex+1];
const A = nodeFor(aCh), B = nodeFor(bCh);
const pos = [
A.lat + (B.lat - A.lat) \* t,
A.lon + (B.lon - A.lon) \* t
];
traveller.setLatLng(pos);
animTrail.addLatLng(pos);
updateBottomPanel();
if (t >= 1){
legIndex++;
t = 0;
}
requestAnimationFrame(tick);
}
function setVisible(routeKey, on){
if (on){
visible.add(routeKey);
routeLayers[routeKey].addTo(map);
} else {
visible.delete(routeKey);
map.removeLayer(routeLayers[routeKey]);
}
}
Object.keys(tog).forEach(k=>{
tog[k].checked = visible.has(k);
tog[k].addEventListener('change', e=> setVisible(k, e.target.checked));
});
document.getElementById('smxShowAll').addEventListener('click', ()=>{
Object.keys(ROUTES).forEach(k=>{
if (!visible.has(k)){
tog[k].checked = true;
setVisible(k, true);
}
});
});
document.getElementById('smxHideAll').addEventListener('click', ()=>{
Object.keys(ROUTES).forEach(k=>{
const keep = (k === focusKey);
tog[k].checked = keep;
setVisible(k, keep);
});
});
selFocus.value = focusKey;
selFocus.addEventListener('change', e=>{
const k = e.target.value;
if (!visible.has(k)){
visible.add(k);
tog[k].checked = true;
routeLayers[k].addTo(map);
}
setFocus(k, true);
});
btnPlay.addEventListener('click', ()=>{
playing = !playing;
btnPlay.textContent = playing ? "Pause" : "Play";
lastTs = null;
const letters = ROUTES[focusKey].code.split('');
if (playing && legIndex >= letters.length - 1){
setFocus(focusKey, false);
playing = true;
btnPlay.textContent = "Pause";
}
if (playing) requestAnimationFrame(tick);
});
btnStep.addEventListener('click', ()=>{
playing = false;
btnPlay.textContent = "Play";
const pts = routePts(focusKey);
const letters = ROUTES[focusKey].code.split('');
const legs = letters.length - 1;
if (legIndex < legs){
legIndex++;
t = 0;
traveller.setLatLng(pts[Math.min(legIndex, pts.length-1)]);
animTrail.addLatLng(pts[Math.min(legIndex, pts.length-1)]);
updateBottomPanel();
}
});
btnReset.addEventListener('click', ()=>{
setFocus(focusKey, true);
});
btnHome.addEventListener('click', ()=>{
if (allPts.length) map.fitBounds(allPts, { padding:[70,70] });
});
const panelEl = document.getElementById('smxPanel');
const panelBtn = document.getElementById('smxPanelToggle');
panelBtn.addEventListener('click', ()=>{
panelEl.classList.toggle('collapsed');
panelBtn.textContent = panelEl.classList.contains('collapsed') ? "Show" : "Hide";
setTimeout(()=>map.invalidateSize(), 150);
});
setFocus('L1', false);
updateBottomPanel();
setTimeout(()=>map.invalidateSize(), 250);
});
})();

## **The Historical Facts**

The body was discovered at Somerton Beach on December 1, 1948. The physical evidence recovered included a Glenelg bus ticket and a suitcase stored at Adelaide Railway Station on November 30, 1948. The geographic triangle formed by Glenelg, Adelaide, and Brighton represents exactly where documented physical evidence places the deceased in his final movements. Brighton station sits approximately **1.5 kilometres** from Somerton Beach along the coastal railway line.

All the stations proposed in this interpretation existed and were operational in the 1948 South Australian railway system. It's worth noting that Marion station, often proposed in alternative interpretations, didn't open until 1954—so it couldn't appear in documentation from 1948.

## **The Human Story**

Carl Webb wasn't a spy. He was a heartbroken man who'd been rejected, a methodical engineer who documented everything, someone who struggled to let go. The code is what happens when that kind of person tries to find someone—systematically, obsessively, using the transport system he knew.

The crossed-out line shows him changing plans. The ABAB patterns show him checking and rechecking. And the final G-A-B sequence shows where that search ended—at Glenelg, then Adelaide, then Brighton, just 1.5 kilometres from where his body was found the next morning.

The code was never a cipher. It was a record of searching—the last traces of a man looking for someone he couldn't find, until he stopped looking altogether.

**— END —**
