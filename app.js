let rows=[], current=[], generated=[];

const $=id=>document.getElementById(id);
function parse(){
  rows=$("data").value.trim().split(/\n+/).map(line=>{
    const p=line.split(/[,\s]+/).filter(Boolean);
    if(p.length<8)return null;
    let draw=+p[0], date=null, start=1;
    if(/^\d{4}-\d{2}-\d{2}$/.test(p[1])){date=new Date(p[1]+"T00:00:00");start=2}
    const nums=p.slice(start,start+6).map(Number), bonus=+p[start+6]||null;
    if(nums.length!==6||nums.some(n=>n<1||n>45))return null;
    return {draw,date,nums,bonus};
  }).filter(Boolean).sort((a,b)=>b.draw-a.draw);
}
function filtered(){
  const v=$("period").value;
  if(v==="all")return rows;
  if(["10","20","30"].includes(v))return rows.slice(0,+v);
  const dated=rows.filter(r=>r.date);
  if(!dated.length)return rows;
  const newest=dated.reduce((m,r)=>r.date>m?r.date:m,dated[0].date);
  const cutoff=new Date(newest); cutoff.setDate(cutoff.getDate()-Number(v));
  return rows.filter(r=>r.date && r.date>=cutoff);
}
function analyze(){
  parse(); current=filtered();
  const count=Array(46).fill(0), last=Array(46).fill(-1);
  current.forEach((r,i)=>r.nums.forEach(n=>{count[n]++; if(last[n]<0)last[n]=i}));
  const ranked=Array.from({length:45},(_,i)=>i+1).sort((a,b)=>count[b]-count[a] || last[a]-last[b] || a-b);
  const grades=Array.from({length:10},()=>[]);
  ranked.forEach((n,i)=>grades[Math.min(9,Math.floor(i*10/45))].push(n));
  $("grades").innerHTML=grades.map((g,i)=>`<div class="grade"><b>${i+1}등급</b><div>${g.map(n=>`${n}(${count[n]})`).join(" · ")}</div></div>`).join("");
  $("balls").innerHTML=Array.from({length:45},(_,i)=>i+1).map(n=>`<div class="ball"><strong>${n}</strong><span>${count[n]}회</span></div>`).join("");
  window.stats={count,ranked,grades};
}
function excludes(){return new Set($("exclude").value.split(/[,\s]+/).map(Number).filter(n=>n>=1&&n<=45))}
function weightedPick(pool,weights,k){
  let p=[...pool], out=[];
  while(out.length<k&&p.length){
    let total=p.reduce((s,n)=>s+weights[n],0), r=Math.random()*total, chosen=p[0];
    for(const n of p){r-=weights[n];if(r<=0){chosen=n;break}}
    out.push(chosen);p=p.filter(n=>n!==chosen);
  }
  return out.sort((a,b)=>a-b);
}
function generate(){
  if(!window.stats) analyze();
  const ex=excludes(), pool=Array.from({length:45},(_,i)=>i+1).filter(n=>!ex.has(n));
  if(pool.length<6){alert("사용 가능한 번호가 6개 미만입니다.");return}
  const weights=Array(46).fill(1);
  window.stats.ranked.forEach((n,i)=>weights[n]=1+(45-i)/15);
  generated=[];
  const cnt=+$("setCount").value, seen=new Set();
  while(generated.length<cnt){
    const s=weightedPick(pool,weights,6), key=s.join(",");
    if(!seen.has(key)){seen.add(key);generated.push(s)}
  }
  renderSets();
}
function renderSets(hits){
  $("sets").innerHTML=generated.map((s,i)=>`<div class="set"><b>${i+1}.</b> ${s.map(n=>`<span class="num ${hits&&hits.has(n)?"hit":""}">${n}</span>`).join("")}</div>`).join("");
}
function check(){
  const win=new Set($("winning").value.split(/[,\s]+/).map(Number).filter(n=>n>=1&&n<=45)), bonus=+$("bonus").value;
  if(win.size!==6){alert("당첨번호 6개를 입력하세요.");return}
  renderSets(win);
  $("checkResult").innerHTML=generated.map((s,i)=>{
    const hit=s.filter(n=>win.has(n)), b=s.includes(bonus)&&!win.has(bonus);
    return `<div class="set">${i+1}세트: <b>${hit.length}개 일치</b>${b?" + 보너스":""} — ${hit.join(", ")||"일치 없음"}</div>`;
  }).join("");
}
$("analyzeBtn").onclick=analyze;$("generateBtn").onclick=generate;$("checkBtn").onclick=check;
$("clearBtn").onclick=()=>{ $("data").value=""; rows=[]; current=[]; generated=[]; $("grades").innerHTML="데이터를 입력하고 분석하기를 누르세요."; $("balls").innerHTML="";$("sets").innerHTML="";};
$("period").onchange=()=>{if(rows.length)analyze()};
$("sampleBtn").onclick=()=>{$("data").value=`1236,2026-08-15,1,7,12,23,34,41,10
1235,2026-08-08,3,9,15,22,31,44,18
1234,2026-08-01,5,11,17,28,33,42,7
1233,2026-07-25,2,8,14,24,35,45,19
1232,2026-07-18,6,13,20,27,32,40,4
1231,2026-07-11,1,10,16,25,36,43,21`;analyze()};