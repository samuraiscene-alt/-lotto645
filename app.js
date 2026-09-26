let rows = [];
let sourceRows = [];
let current = [];
let generated = [];
let latestDrawData = null;
let recommendationStrategy = "balanced";
let rareMode = false;
let rarityNumbers = [];

const $ = id => document.getElementById(id);
const STORAGE_KEY = "lotto645_saved_sets_v2";
const HISTORY_KEY = "lotto645_recommendation_history_v1";

function formatInputRow(r){
  return `${r.draw} - ${r.nums.join(" ")} - ${r.bonus}`;
}

function parseManualLine(line){
  const parts = line.trim().split(/\s*-\s*/);
  if(parts.length !== 3) return null;
  const draw = Number(parts[0].replace(/[^\d]/g,""));
  const nums = parts[1].trim().split(/[,\s]+/).map(Number).filter(Boolean);
  const bonus = Number(parts[2].replace(/[^\d]/g,""));
  if(!draw || nums.length !== 6 || nums.some(n=>n<1||n>45) || bonus<1 || bonus>45) return null;
  const matched = sourceRows.find(r => r.draw === draw);
  return {draw, nums, bonus, date: matched?.date || null};
}

function parse(){
  rows = $("data").value.trim().split(/\n+/).map(parseManualLine).filter(Boolean).sort((a,b)=>b.draw-a.draw);
}

function periodCount(){
  const v = $("period").value;
  return v === "all" ? Infinity : Number(v);
}

function filtered(){
  const n = periodCount();
  return Number.isFinite(n) ? rows.slice(0,n) : rows;
}

function periodLabel(){
  const map = {
    "52":"최근 1년",
    "26":"최근 6개월",
    "13":"최근 3개월",
    "10":"최근 10회",
    "20":"최근 20회",
    "30":"최근 30회",
    "all":"전체"
  };
  return map[$("period").value] || "선택 기간";
}

function lottoColorClass(n){
  if(n >= 1 && n <= 10) return "ball-yellow";
  if(n <= 20) return "ball-blue";
  if(n <= 30) return "ball-red";
  if(n <= 40) return "ball-gray";
  return "ball-green";
}

function syncRankPeriodTabs(){
  const rankBtn=$("rankWheelBtn");
  if(rankBtn){
    const labels={"52":"1년","26":"6개월","13":"3개월","10":"최근 10회","20":"최근 20회","30":"최근 30회","all":"전체"};
    rankBtn.querySelector("span").textContent=labels[$("period").value]||periodLabel();
  }
  const periodBtn=$("periodWheelBtn");
  if(periodBtn) periodBtn.querySelector("span").textContent=periodLabel();
}

function analyze(){
  parse();
  current = filtered();

  const count = Array(46).fill(0);
  current.forEach(r => r.nums.forEach(n => count[n]++));

  const ranked = Array.from({length:45},(_,i)=>i+1)
    .sort((a,b)=>count[b]-count[a] || a-b);

  const grades = Array.from({length:10},()=>[]);

  ranked.forEach((n,i)=>{
    grades[Math.min(9,Math.floor(i*10/45))].push(n);
  });

  $("grades").innerHTML = grades.map((g,i)=>`
    <div class="grade">
      <div class="gradeTitle">${i+1}등급</div>
      <div class="gradeNums">
        ${g.map(n=>`<span class="gradeNum">${n}(${count[n]})</span>`).join(" · ")}
      </div>
    </div>
  `).join("");

  const groupedRanks = [];

  for(const n of ranked){
    const hits = count[n];
    let group = groupedRanks[groupedRanks.length - 1];

    if(!group || group.hits !== hits){
      group = {
        hits,
        nums:[]
      };
      groupedRanks.push(group);
    }

    group.nums.push(n);
  }

  $("frequencyRank").innerHTML = groupedRanks.map((group,i)=>`
    <div class="rankItem">
      <span class="rankNo">${i+1}위</span>
      <span class="rankValue">${group.nums.join(", ")}</span>
      <span class="rankCount">${group.hits}회</span>
    </div>
  `).join("");

  const zeroes = ranked.filter(n=>count[n]===0);

  $("zeroBox").innerHTML = zeroes.length
    ? `<b>0회 출현</b> · ${zeroes.join(" · ")}`
    : `<b>0회 출현 번호 없음</b>`;

  $("rankPeriodLabel").textContent =
    `${periodLabel()} 기준 · 많이 나온 번호부터`;

  $("totalHits").textContent =
    `${current.length}회 / ${current.length*6}개 번호`;

  window.stats = {
    count,
    ranked,
    grades
  };
  syncRankPeriodTabs();
}

function setLatestUI(){
  if(!latestDrawData) return;

  $("latestDraw").textContent =
    `${latestDrawData.draw}회`;

  $("latestNumbers").innerHTML =
    latestDrawData.nums
      .map(n=>`
        <span class="lottoBall ${lottoColorClass(n)}">${n}</span>
      `)
      .join("")
    +
    `<span class="plus">+</span>`
    +
    `<span class="lottoBall bonusBall ${lottoColorClass(latestDrawData.bonus)}">
      ${latestDrawData.bonus}
    </span>`;
}

function setStatus(kind,text,detail=""){
  const el = $("updateStatus");
  el.className = `status ${kind}`;
  el.textContent = text;
  $("updateDetail").textContent = detail;
}

async function loadAutoData(){
  setStatus("checking","업데이트 확인 중");

  try{
    const response =
      await fetch("./lotto_data.json?t="+Date.now(),{
        cache:"no-store"
      });

    if(!response.ok){
      throw new Error("lotto_data.json을 읽을 수 없습니다.");
    }

    const data = await response.json();

    if(!Array.isArray(data) || !data.length){
      throw new Error("당첨 데이터가 없습니다.");
    }

    sourceRows = data
      .map(r=>({
        draw:Number(r.draw),
        date:r.date || null,
        nums:(r.nums||[]).map(Number),
        bonus:Number(r.bonus)
      }))
      .filter(r=>r.draw && r.nums.length===6)
      .sort((a,b)=>b.draw-a.draw);

    latestDrawData = sourceRows[0];

    $("data").value =
      sourceRows.map(formatInputRow).join("\n");

    setLatestUI();
    analyze();

    setStatus(
      "ok",
      "최신 데이터 확인 완료",
      `현재 ${latestDrawData.draw}회까지 · ${sourceRows.length}회분 저장 · 새 회차는 GitHub 자동 작업이 확인합니다.`
    );

    autoCheckSaved();

  }catch(err){

    console.error(err);

    setStatus(
      "warn",
      "업데이트 확인 실패",
      "기존 화면 데이터가 있으면 그대로 사용할 수 있습니다."
    );
  }
}

function getIncludeNumbers(){
  return [...new Set($("include").value.split(/[,\s]+/).map(Number).filter(n=>n>=1&&n<=45))].sort((a,b)=>a-b);
}
function setIncludeNumbers(nums){
  const unique=[...new Set(nums)].filter(n=>n>=1&&n<=45&&!getExcludeNumbers().includes(n)).sort((a,b)=>a-b);
  $("include").value=unique.join(",");
  updateIncludeCount();renderIncludePicker();renderExcludePicker();
}
function updateIncludeCount(){
  const nums=getIncludeNumbers();
  $("includeCount").textContent=`고정수 ${nums.length}개`;
  $("includeSelected").textContent=nums.length?`고정수: ${nums.join(", ")} · 총 ${nums.length}개`:"선택된 고정수 없음";
}
function toggleIncludeNumber(n){
  const nums=getIncludeNumbers();
  if(nums.includes(n)){setIncludeNumbers(nums.filter(x=>x!==n));return;}
  if(getExcludeNumbers().includes(n)){alert("제외수로 선택된 번호입니다.");return;}
  
  setIncludeNumbers([...nums,n]);
}
function renderIncludePicker(){
  const selected=new Set(getIncludeNumbers()), excluded=new Set(getExcludeNumbers());
  $("includeGrid").innerHTML=Array.from({length:45},(_,i)=>i+1).map(n=>`<button type="button" class="includeNum ${selected.has(n)?"selected":""}" data-number="${n}" ${excluded.has(n)?"disabled":""}>${n}</button>`).join("");
  $("includeGrid").querySelectorAll(".includeNum").forEach(btn=>btn.onclick=()=>toggleIncludeNumber(Number(btn.dataset.number)));
}

function getExcludeNumbers(){
  return [...new Set(
    $("exclude")
      .value
      .split(/[,\s]+/)
      .map(Number)
      .filter(n => n >= 1 && n <= 45)
  )].sort((a,b) => a-b);
}

function setExcludeNumbers(nums){
  const unique = [...new Set(nums)]
    .filter(n => n >= 1 && n <= 45)
    .sort((a,b) => a-b)
    .slice(0,39);

  $("exclude").value = unique.join(",");

  updateExcludeCount();
  renderExcludePicker();
  renderIncludePicker();
}

function updateExcludeCount(){
  const nums = getExcludeNumbers();

  $("excludeCount").textContent =
    `제외수 ${nums.length}개`;

  $("excludeSelected").textContent =
    nums.length
      ? `선택된 번호: ${nums.join(", ")} · 총 ${nums.length}개 (최대 39개)`
      : "선택된 번호 없음 · 최대 39개";
}

function toggleExcludeNumber(n){
  const nums = getExcludeNumbers();

  if(nums.includes(n)){
    setExcludeNumbers(
      nums.filter(x => x !== n)
    );
    return;
  }

  if(getIncludeNumbers().includes(n)) return;

  if(nums.length >= 39){
    alert("제외수는 최대 39개까지 선택할 수 있습니다.");
    return;
  }

  setExcludeNumbers([...nums, n]);
}

function renderExcludePicker(){
  const selected = new Set(getExcludeNumbers());
  const fixed = new Set(getIncludeNumbers());

  $("excludeGrid").innerHTML =
    Array.from({length:45},(_,i) => i+1)
      .map(n => `
        <button
          type="button"
          class="excludeNum ${selected.has(n) ? "selected" : ""}"
          data-number="${n}" ${fixed.has(n) ? "disabled" : ""}>
          ${n}
        </button>
      `)
      .join("");

  $("excludeGrid")
    .querySelectorAll(".excludeNum")
    .forEach(btn => {
      btn.onclick = () => {
        toggleExcludeNumber(
          Number(btn.dataset.number)
        );
      };
    });
}

function excludes(){
  return new Set(getExcludeNumbers());
}
function weightedPick(pool,weights,k){
  let p=[...pool];
  let out=[];

  while(out.length<k && p.length){

    const total =
      p.reduce((s,n)=>s+weights[n],0);

    let r =
      Math.random()*total;

    let chosen =
      p[0];

    for(const n of p){

      r -= weights[n];

      if(r<=0){
        chosen=n;
        break;
      }
    }

    out.push(chosen);

    p =
      p.filter(n=>n!==chosen);
  }

  return out.sort((a,b)=>a-b);
}

function countsFor(limit){
  const count=Array(46).fill(0);
  rows.slice(0,Math.min(limit,rows.length)).forEach(r=>r.nums.forEach(n=>count[n]++));
  return count;
}

function normalizedScore(count){
  const max=Math.max(...count.slice(1),1);
  return count.map((v,i)=>i===0?0:v/max);
}

function recommendationWeights(){
  const s52=normalizedScore(countsFor(52)), s26=normalizedScore(countsFor(26)), s13=normalizedScore(countsFor(13));
  const mixes={
    balanced:[.30,.30,.40],
    recent:[.15,.25,.60],
    long:[.60,.25,.15]
  };
  const mix=mixes[recommendationStrategy]||mixes.balanced;
  return Array.from({length:46},(_,n)=>n===0?0:1+(s52[n]*mix[0]+s26[n]*mix[1]+s13[n]*mix[2])*3);
}

function rareSelectionScore(s){
  const sorted=[...s].sort((a,b)=>a-b);
  const gaps=sorted.slice(1).map((n,i)=>n-sorted[i]);
  const sum=sorted.reduce((a,b)=>a+b,0);
  const minGap=Math.min(...gaps), maxGap=Math.max(...gaps);
  const birthday=sorted.filter(n=>n<=31).length;
  const fallback=[.94746,-.00279,.02451,-.00647,-.05694];
  const c=(window.rarityModel?.coefficients?.length===5)?window.rarityModel.coefficients:fallback;
  const predictedManualShare=c[0]+c[1]*sum+c[2]*minGap+c[3]*maxGap+c[4]*birthday;
  return Math.max(0,Math.min(100,Math.round((1-predictedManualShare)*100)));
}

function rareAccept(s,rnd=Math.random){
  if(!rareMode) return true;
  const score=rareSelectionScore(s);
  return rnd() < Math.max(.08,Math.min(.95,(score-35)/55));
}

const RARITY_CDF=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1];
function rarityPercentile(s){
 const score=rareSelectionScore(s);
 const cdf=(window.rarityModel?.cdf)||RARITY_CDF;
 return Math.max(1,Math.min(99,Math.round((cdf[score]??score/100)*100)));
}
function renderRarityAnalyzer(){
 const selected=new Set(rarityNumbers);
 $("rarityGrid").innerHTML=Array.from({length:45},(_,i)=>i+1).map(n=>'<button type="button" class="rarityNum '+(selected.has(n)?"selected":"")+'" data-number="'+n+'">'+n+'</button>').join("");
 $("rarityGrid").querySelectorAll(".rarityNum").forEach(btn=>btn.onclick=()=>toggleRarityNumber(Number(btn.dataset.number)));
 if(rarityNumbers.length!==6){$("rarityResult").className="rarityResult empty";$("rarityResult").textContent=rarityNumbers.length+"/6 선택 · 번호 6개를 선택하세요.";return;}
 const pct=rarityPercentile(rarityNumbers); $("rarityResult").className="rarityResult";
 $("rarityResult").innerHTML="<span class=\"rarityChosen\">선택번호<br><b>"+rarityNumbers.join(" · ")+"</b></span><strong>희소성 "+pct+"%</strong>";
}
function toggleRarityNumber(n){
 if(rarityNumbers.includes(n))rarityNumbers=rarityNumbers.filter(x=>x!==n);
 else if(rarityNumbers.length<6)rarityNumbers=[...rarityNumbers,n].sort((a,b)=>a-b);
 else{$("rarityResult").className="rarityResult rarityNotice";$("rarityResult").textContent="선택된 번호를 먼저 눌러 해제하세요.";return;}
 renderRarityAnalyzer();
}

function balancedSet(s){
  const odd=s.filter(n=>n%2).length;
  const low=s.filter(n=>n<=22).length;
  const bands=new Set(s.map(n=>Math.min(4,Math.floor((n-1)/10)))).size;
  let consecutive=0;
  for(let i=1;i<s.length;i++) if(s[i]===s[i-1]+1) consecutive++;
  return odd>=2&&odd<=4&&low>=2&&low<=4&&bands>=3&&consecutive<=1;
}

function generate(){
  if(!rows.length) analyze();
  const ex=excludes(), fixed=getIncludeNumbers();
  if(fixed.some(n=>ex.has(n))){alert("고정수와 제외수에 같은 번호가 있습니다.");return;}
  const pool=Array.from({length:45},(_,i)=>i+1).filter(n=>!ex.has(n));
  if(pool.length<6){alert("사용 가능한 번호가 부족합니다.");return;}
  const weights=recommendationWeights();
  fixed.forEach(n=>{if(!ex.has(n)) weights[n]*=3.5;});
  generated=[];
  const cnt=Number($("setCount").value),seen=new Set();
  let attempts=0;
  while(generated.length<cnt&&attempts<5000){
    attempts++;
    const s=weightedPick(pool,weights,6),key=s.join(",");
    if(!seen.has(key)&&balancedSet(s)&&rareAccept(s)){seen.add(key);generated.push(s);}
  }
  while(generated.length<cnt&&attempts<20000){
    attempts++;
    const s=weightedPick(pool,weights,6),key=s.join(",");
    if(!seen.has(key)&&rareAccept(s)){seen.add(key);generated.push(s);}
  }
  if(!generated.length){alert("현재 고정수/제외수 조건으로 조합을 만들 수 없습니다.");return;}
  renderSets();
  $("saveBtn").disabled=false;
  $("saveInfo").textContent=latestDrawData?latestDrawData.draw+1+"회용으로 저장 가능":"저장 가능";
}

function seededRandom(seed){
  let x=seed>>>0;
  return ()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296;};
}

function historicalWeights(history,strategy){
  const countFor=n=>{const c=Array(46).fill(0);history.slice(0,n).forEach(r=>r.nums.forEach(v=>c[v]++));return c;};
  const norm=c=>{const m=Math.max(...c.slice(1),1);return c.map((v,i)=>i? v/m:0);};
  const a=norm(countFor(52)),b=norm(countFor(26)),d=norm(countFor(13));
  const mixes={balanced:[.30,.30,.40],recent:[.15,.25,.60],long:[.60,.25,.15]};
  const m=mixes[strategy]||mixes.balanced;
  return Array.from({length:46},(_,n)=>n?1+(a[n]*m[0]+b[n]*m[1]+d[n]*m[2])*3:0);
}

function seededPick(pool,weights,k,rnd){
  let p=[...pool],out=[];
  while(out.length<k&&p.length){
    const total=p.reduce((s,n)=>s+weights[n],0);
    let r=rnd()*total,chosen=p[0];
    for(const n of p){r-=weights[n];if(r<=0){chosen=n;break;}}
    out.push(chosen);p=p.filter(n=>n!==chosen);
  }
  return out.sort((a,b)=>a-b);
}

function prizeFor(set,target){
  const win=new Set(target.nums);
  const hits=set.filter(n=>win.has(n)).length;
  const bonus=set.includes(target.bonus);
  if(hits===6)return 1;
  if(hits===5&&bonus)return 2;
  if(hits===5)return 3;
  if(hits===4)return 4;
  if(hits===3)return 5;
  return 0;
}

function runBacktest(){
  const n=Number($("backtestPeriod").value);
  const chronological=[...sourceRows].sort((a,b)=>a.draw-b.draw);
  if(chronological.length<14){$("backtestResult").textContent="백테스트에 필요한 데이터가 부족합니다.";return;}
  const targets=chronological.slice(-Math.min(n,chronological.length-13));
  const totals={1:0,2:0,3:0,4:0,5:0},hitTotals=[0,0,0,0,0,0,0];
  const randomTotals={1:0,2:0,3:0,4:0,5:0},randomHits=[0,0,0,0,0,0,0];
  const details=[];
  for(const target of targets){
    const idx=chronological.findIndex(r=>r.draw===target.draw);
    const history=chronological.slice(0,idx).sort((a,b)=>b.draw-a.draw);
    const weights=historicalWeights(history,recommendationStrategy);
    const rnd=seededRandom(target.draw*7919+recommendationStrategy.length*101);
    const sets=[],seen=new Set();
    let attempts=0;
    while(sets.length<10&&attempts<5000){
      attempts++;
      const s=seededPick(Array.from({length:45},(_,i)=>i+1),weights,6,rnd),key=s.join(",");
      if(!seen.has(key)&&balancedSet(s)&&rareAccept(s,rnd)){seen.add(key);sets.push(s);}
    }
    while(sets.length<10){
      const s=seededPick(Array.from({length:45},(_,i)=>i+1),weights,6,rnd),key=s.join(",");
      if(!seen.has(key)&&rareAccept(s,rnd)){seen.add(key);sets.push(s);}
    }
    let best=0,bestPrize=0;
    for(const s of sets){
      const hits=s.filter(v=>target.nums.includes(v)).length;
      hitTotals[hits]++;
      const prize=prizeFor(s,target);
      if(prize){totals[prize]++;if(!bestPrize||prize<bestPrize)bestPrize=prize;}
      if(hits>best)best=hits;
    }
    const rr=seededRandom(target.draw*104729+17),randomSets=[],randomSeen=new Set();
    while(randomSets.length<10){
      const s=seededPick(Array.from({length:45},(_,i)=>i+1),Array(46).fill(1),6,rr),key=s.join(",");
      if(!randomSeen.has(key)){randomSeen.add(key);randomSets.push(s);}
    }
    for(const s of randomSets){
      const hits=s.filter(v=>target.nums.includes(v)).length;
      randomHits[hits]++;
      const prize=prizeFor(s,target);
      if(prize) randomTotals[prize]++;
    }
    details.push({draw:target.draw,best,bestPrize});
  }
  const labels={balanced:"종합형",recent:"최근형",long:"장기형"};
  $("backtestResult").className="";
  $("backtestResult").innerHTML=`
    <div class="backtestSummary">
      <div class="backtestMeta">${labels[recommendationStrategy]} · ${targets.length}회 × 10세트</div>
      <div class="prizeGrid">
        ${[1,2,3,4,5].map(p=>`<div><b>${p}등</b><strong>${totals[p]}회</strong></div>`).join("")}
      </div>
      <div class="hitSummary">추천전략 · 3개 ${hitTotals[3]} · 4개 ${hitTotals[4]} · 5개 ${hitTotals[5]} · 6개 ${hitTotals[6]}세트</div>
      <div class="hitSummary randomCompare">완전 무작위 · 3개 ${randomHits[3]} · 4개 ${randomHits[4]} · 5개 ${randomHits[5]} · 6개 ${randomHits[6]}세트</div>
      <div class="randomPrize">무작위 당첨 · ${[1,2,3,4,5].map(p=>`${p}등 ${randomTotals[p]}회`).join(" · ")}</div>
      <div class="backtestList">${details.slice().reverse().map(d=>`<span>${d.draw}회 <b>${d.best}개</b>${d.bestPrize?" · "+d.bestPrize+"등":""}</span>`).join("")}</div>
      <p class="hint">과거 결과를 이용한 검증이며 미래 당첨 가능성을 의미하지 않습니다.</p>
    </div>`;
}

function renderSets(hits){

  $("sets").innerHTML =
    generated.map((s,i)=>`

      <div class="set">

        <b>${i+1}.</b>

        ${s.map(n=>`
          <span class="num ${
            hits&&hits.has(n)
              ?"hit"
              :""
          }">
            ${n}
          </span>
        `).join("")}
        <span class="setRarity"><small>희소성</small><strong>${rarityPercentile(s)}%</strong></span>

      </div>

    `).join("");
}

function getHistory(){
  try{
    const v=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
    return Array.isArray(v)?v:[];
  }catch{return [];}
}

function saveHistory(history){
  localStorage.setItem(HISTORY_KEY,JSON.stringify(history));
}

function recommendationSnapshot(){
  return {
    strategy:recommendationStrategy,
    rareMode,
    period:$("period")?.value||null,
    fixed:getIncludeNumbers(),
    excluded:getExcludeNumbers(),
    setCount:Number($("setCount")?.value||generated.length),
    rarity:generated.map(s=>rarityPercentile(s))
  };
}

function migrateLegacySaved(){
  const old=getSaved();
  if(!old?.sets?.length) return;
  const history=getHistory();
  if(!history.some(x=>x.targetDraw===old.targetDraw)){
    history.push({...old,settings:old.settings||null});
    history.sort((a,b)=>(a.targetDraw||0)-(b.targetDraw||0));
    saveHistory(history);
  }
}

function saveGenerated(){
  if(!generated.length) return;
  const baseDraw=latestDrawData?.draw||rows[0]?.draw||null;
  const payload={
    savedAt:new Date().toISOString(),
    baseDraw,
    targetDraw:baseDraw?baseDraw+1:null,
    sets:generated.map(s=>[...s]),
    settings:recommendationSnapshot()
  };
  localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));
  const history=getHistory();
  const idx=history.findIndex(x=>x.targetDraw===payload.targetDraw);
  if(idx>=0) history[idx]=payload; else history.push(payload);
  history.sort((a,b)=>(a.targetDraw||0)-(b.targetDraw||0));
  saveHistory(history);
  $("saveInfo").textContent=`✓ ${payload.targetDraw||"다음"}회 추천번호 저장 완료 · 누적 ${history.length}회`;
  autoCheckSaved();
  $("savedInlineBody").hidden=false;
  $("savedInlineToggle").classList.add("open");
}

function getSaved(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");}
  catch{return null;}
}

function prizeLabelForSaved(set,target){
  const p=prizeFor(set,target);
  return p ? `${p}등` : "미당첨";
}

function historyStrategyLabel(v){
  return ({balanced:"종합형",recent:"최근형",long:"장기형"})[v]||"기록 없음";
}
function historyPeriodLabel(v){
  return ({"52":"최근 1년","26":"최근 6개월","13":"최근 3개월","10":"최근 10회","20":"최근 20회","30":"최근 30회","all":"전체"})[v]||"기록 없음";
}
function savedHistoryCard(saved){
  const target=sourceRows.find(r=>r.draw===saved.targetDraw);
  const win=target?new Set(target.nums):null, settings=saved.settings||{};
  const dateText=saved.savedAt?new Date(saved.savedAt).toLocaleString("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";
  return `<details class="historyDraw">
    <summary><span><b>${saved.targetDraw||"다음"}회</b><small>${target?"대조 완료":"추첨 전"}</small></span><strong>추천 ${saved.sets.length}세트</strong></summary>
    <div class="historyDrawBody">
      <div class="historySettings">
        <span>전략 <b>${historyStrategyLabel(settings.strategy)}</b></span>
        <span>기간 <b>${historyPeriodLabel(settings.period)}</b></span>
        <span>희소성 <b>${settings.rareMode?"ON":"OFF"}</b></span>
        <span>저장 <b>${dateText}</b></span>
      </div>
      <div class="historyNumbers"><b>고정수</b> ${settings.fixed?.length?settings.fixed.join(" · "):"없음"}</div>
      <div class="historyNumbers"><b>제외수</b> ${settings.excluded?.length?settings.excluded.join(" · "):"없음"}</div>
      ${target?`<div class="savedWinning">당첨번호 ${target.nums.join(" · ")} + ${target.bonus}</div>`:""}
      <div class="savedSetList">
        ${saved.sets.map((set,i)=>{
          const hit=win?set.filter(n=>win.has(n)):[];
          const bonus=target&&set.includes(target.bonus)&&!win.has(target.bonus);
          const rarity=settings.rarity?.[i];
          const result=target?`${hit.length}개 일치${bonus?" + 보너스":""} · ${prizeLabelForSaved(set,target)}`:"추첨 전";
          return `<div class="savedSetRow"><b>${i+1}.</b><span>${set.join(" · ")}</span><strong>${rarity!=null?"희소성 "+rarity+"% · ":""}${result}</strong></div>`;
        }).join("")}
      </div>
    </div>
  </details>`;
}
function autoCheckSaved(){
  migrateLegacySaved();
  const history=getHistory().sort((a,b)=>(b.targetDraw||0)-(a.targetDraw||0));
  const box=$("savedInline"),body=$("savedInlineBody");
  if(!box||!body)return;
  if(!history.length){box.hidden=true;body.hidden=true;return;}
  box.hidden=false;
  const completed=history.filter(h=>sourceRows.some(r=>r.draw===h.targetDraw)).length;
  body.innerHTML=`
    <div class="historyOverview"><b>회차별 저장 기록</b><span>누적 ${history.length}회 · 결과 대조 완료 ${completed}회</span></div>
    <div class="historyList">${history.map(savedHistoryCard).join("")}</div>`;
}


function check(){

  const win =
    new Set(
      $("winning")
        .value
        .split(/[,\s]+/)
        .map(Number)
        .filter(n=>n>=1&&n<=45)
    );

  const bonus =
    Number($("bonus").value);

  if(win.size!==6){

    alert("당첨번호 6개를 입력하세요.");

    return;
  }

  renderSets(win);

  $("checkResult").innerHTML =
    generated.length

      ? generated.map((s,i)=>{

          const hit =
            s.filter(
              n=>win.has(n)
            );

          const b =
            s.includes(bonus)
            &&
            !win.has(bonus);

          return `
            <div class="set">
              ${i+1}세트:
              <b>${hit.length}개 일치</b>
              ${b?" + 보너스":""}
              —
              ${hit.join(", ")||"일치 없음"}
            </div>
          `;

        }).join("")

      : `<div class="hint">
          먼저 추천 조합을 생성하세요.
        </div>`;
}

$("analyzeBtn").onclick =
  analyze;

$("reloadBtn").onclick =
  loadAutoData;

$("generateBtn").onclick =
  generate;
$("includeToggleBtn").onclick=()=>{
  const picker=$("includePicker");picker.hidden=!picker.hidden;renderIncludePicker();updateIncludeCount();
};
$("excludeToggleBtn").onclick = () => {
  const picker = $("excludePicker");
  picker.hidden = !picker.hidden;
  renderExcludePicker();
  updateExcludeCount();
};

$("saveBtn").onclick =
  saveGenerated;
$("savedInlineToggle").onclick=()=>{
  const body=$("savedInlineBody");
  body.hidden=!body.hidden;
  $("savedInlineToggle").classList.toggle("open",!body.hidden);
};

$("checkBtn").onclick =
  check;

$("clearBtn").onclick = ()=>{

  $("data").value="";

  rows=[];
  current=[];
  generated=[];

  $("grades").innerHTML =
    "데이터를 입력하고 분석하기를 누르세요.";

  $("frequencyRank").innerHTML="";

  $("zeroBox").innerHTML="";

  $("sets").innerHTML="";

  $("checkResult").innerHTML="";

  $("saveBtn").disabled=true;
};

$("period").onchange = ()=>{
  if($("data").value.trim()){
    analyze();
  }
};

const WHEEL_OPTIONS={
  period:[["52","최근 1년"],["26","최근 6개월"],["13","최근 3개월"],["10","최근 10회"],["20","최근 20회"],["30","최근 30회"],["all","전체"]],
  rank:[["52","1년"],["26","6개월"],["13","3개월"]],
  strategy:[["balanced","종합형"],["recent","최근형"],["long","장기형"]],
  count:[["5","5세트"],["10","10세트"],["20","20세트"]],
  backtest:[["10","최근 10회"],["20","최근 20회"],["30","최근 30회"]]
};
let activeWheel=null,wheelValue=null;
function wheelCurrent(type){
  if(type==="period"||type==="rank") return $("period").value;
  if(type==="strategy") return recommendationStrategy;
  if(type==="count") return $("setCount").value;
  if(type==="backtest") return $("backtestPeriod").value;
}
function openWheel(type){
  activeWheel=type;wheelValue=wheelCurrent(type);
  const titles={period:"분석 기간",rank:"출현 횟수 순위",strategy:"종합 추천",count:"추천 세트 수",backtest:"백테스트 기간"};
  $("wheelTitle").textContent=titles[type]||"선택";
  $("wheelList").innerHTML=WHEEL_OPTIONS[type].map(([v,l])=>`<div class="wheelItem" data-value="${v}">${l}</div>`).join("");
  $("wheelSheet").hidden=false;document.body.style.overflow="hidden";
  requestAnimationFrame(()=>{
    const items=[...$("wheelList").children],idx=Math.max(0,items.findIndex(x=>x.dataset.value===wheelValue));
    $("wheelList").scrollTop=idx*44;updateWheelFocus();
  });
}
function updateWheelFocus(){
  const list=$("wheelList"),idx=Math.round(list.scrollTop/44),items=[...list.children];
  items.forEach((el,i)=>el.classList.toggle("near",i!==idx));
  if(items[idx]) wheelValue=items[idx].dataset.value;
}
function closeWheel(){ $("wheelSheet").hidden=true;document.body.style.overflow="";activeWheel=null; }
function applyWheel(){
  if(!activeWheel)return;
  const label=(WHEEL_OPTIONS[activeWheel].find(x=>x[0]===wheelValue)||[])[1]||"";
  if(activeWheel==="period"||activeWheel==="rank"){$("period").value=wheelValue;analyze();}
  if(activeWheel==="strategy"){recommendationStrategy=wheelValue;$("strategyWheelBtn").querySelector("span").textContent=label;}
  if(activeWheel==="count"){$("setCount").value=wheelValue;$("setCountWheelBtn").querySelector("span").textContent=label;}
  if(activeWheel==="backtest"){$("backtestPeriod").value=wheelValue;$("backtestWheelBtn").querySelector("span").textContent=label;}
  closeWheel();
}
document.querySelectorAll("[data-wheel]").forEach(btn=>btn.onclick=()=>openWheel(btn.dataset.wheel));
$("wheelList").onscroll=updateWheelFocus;
$("wheelList").onclick=e=>{
  const item=e.target.closest(".wheelItem");
  if(!item)return;
  const items=[...$("wheelList").children];
  const idx=items.indexOf(item);
  if(idx<0)return;
  wheelValue=item.dataset.value;
  $("wheelList").scrollTo({top:idx*44,behavior:"smooth"});
  setTimeout(updateWheelFocus,220);
};
$("wheelDone").onclick=applyWheel;$("wheelCancel").onclick=closeWheel;
document.querySelector(".wheelBackdrop").onclick=closeWheel;

$("backtestBtn").onclick=runBacktest;
$("rareMode").onchange=e=>{rareMode=e.target.checked;};



document.addEventListener("DOMContentLoaded", async () => {
  try{
    const r=await fetch("./rarity_model.json?t="+Date.now(),{cache:"no-store"});
    if(r.ok) window.rarityModel=await r.json();
  }catch(e){console.warn("희소성 모델 로드 실패",e);}
  renderExcludePicker();
  updateExcludeCount();
  renderIncludePicker();
  updateIncludeCount();
  renderRarityAnalyzer();
  loadAutoData();
});
