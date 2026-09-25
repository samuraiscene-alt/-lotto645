let rows = [];
let sourceRows = [];
let current = [];
let generated = [];
let latestDrawData = null;
let recommendationStrategy = "balanced";

const $ = id => document.getElementById(id);
const STORAGE_KEY = "lotto645_saved_sets_v2";

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
  document.querySelectorAll(".rankPeriodBtn").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.period === $("period").value);
  });
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
  const unique=[...new Set(nums)].filter(n=>n>=1&&n<=45&&!getExcludeNumbers().includes(n)).sort((a,b)=>a-b).slice(0,6);
  $("include").value=unique.join(",");
  updateIncludeCount();renderIncludePicker();
}
function updateIncludeCount(){
  const nums=getIncludeNumbers();
  $("includeCount").textContent=`고정수 ${nums.length}개`;
  $("includeSelected").textContent=nums.length?`고정수: ${nums.join(", ")} · 총 ${nums.length}개`:"선택된 고정수 없음 · 최대 6개";
}
function toggleIncludeNumber(n){
  const nums=getIncludeNumbers();
  if(nums.includes(n)){setIncludeNumbers(nums.filter(x=>x!==n));return;}
  if(getExcludeNumbers().includes(n)){alert("제외수로 선택된 번호입니다.");return;}
  if(nums.length>=6){alert("고정수는 최대 6개까지 선택할 수 있습니다.");return;}
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

  if(nums.length >= 39){
    alert("제외수는 최대 39개까지 선택할 수 있습니다.");
    return;
  }

  setExcludeNumbers([...nums, n]);
}

function renderExcludePicker(){
  const selected = new Set(getExcludeNumbers());

  $("excludeGrid").innerHTML =
    Array.from({length:45},(_,i) => i+1)
      .map(n => `
        <button
          type="button"
          class="excludeNum ${selected.has(n) ? "selected" : ""}"
          data-number="${n}">
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
  const pool=Array.from({length:45},(_,i)=>i+1).filter(n=>!ex.has(n)&&!fixed.includes(n));
  const need=6-fixed.length;
  if(pool.length<need){alert("사용 가능한 번호가 부족합니다.");return;}
  const weights=recommendationWeights();
  generated=[];
  const cnt=Number($("setCount").value),seen=new Set();
  let attempts=0;
  while(generated.length<cnt&&attempts<5000){
    attempts++;
    const picked=weightedPick(pool,weights,need);
    const s=[...fixed,...picked].sort((a,b)=>a-b),key=s.join(",");
    if(!seen.has(key)&&balancedSet(s)){seen.add(key);generated.push(s);}
  }
  while(generated.length<cnt&&attempts<20000){
    attempts++;
    const picked=weightedPick(pool,weights,need);
    const s=[...fixed,...picked].sort((a,b)=>a-b),key=s.join(",");
    if(!seen.has(key)){seen.add(key);generated.push(s);}
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
      if(!seen.has(key)&&balancedSet(s)){seen.add(key);sets.push(s);}
    }
    while(sets.length<10){
      const s=seededPick(Array.from({length:45},(_,i)=>i+1),weights,6,rnd),key=s.join(",");
      if(!seen.has(key)){seen.add(key);sets.push(s);}
    }
    let best=0,bestPrize=0;
    for(const s of sets){
      const hits=s.filter(v=>target.nums.includes(v)).length;
      hitTotals[hits]++;
      const prize=prizeFor(s,target);
      if(prize){totals[prize]++;if(!bestPrize||prize<bestPrize)bestPrize=prize;}
      if(hits>best)best=hits;
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
      <div class="hitSummary">3개 일치 ${hitTotals[3]}세트 · 4개 ${hitTotals[4]}세트 · 5개 ${hitTotals[5]}세트 · 6개 ${hitTotals[6]}세트</div>
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

      </div>

    `).join("");
}

function saveGenerated(){

  if(!generated.length){
    return;
  }

  const baseDraw =
    latestDrawData?.draw ||
    rows[0]?.draw ||
    null;

  const payload = {

    savedAt:
      new Date().toISOString(),

    baseDraw,

    targetDraw:
      baseDraw
        ? baseDraw+1
        : null,

    sets:
      generated
  };

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(payload)
  );

  $("saveInfo").textContent =
    `${payload.targetDraw || "다음"}회 추천번호 저장 완료`;

  autoCheckSaved();
}

function getSaved(){

  try{

    return JSON.parse(
      localStorage.getItem(STORAGE_KEY)
      ||
      "null"
    );

  }catch{

    return null;
  }
}

function autoCheckSaved(){

  const saved =
    getSaved();

  if(!saved?.sets?.length){

    $("savedCheck").className =
      "empty";

    $("savedCheck").textContent =
      "저장된 추천번호가 없습니다.";

    return;
  }

  const target =
    sourceRows.find(
      r=>r.draw===saved.targetDraw
    );

  const dateText =
    new Date(saved.savedAt)
      .toLocaleString(
        "ko-KR",
        {
          month:"numeric",
          day:"numeric",
          hour:"2-digit",
          minute:"2-digit"
        }
      );

  if(!target){

    $("savedCheck").className="";

    $("savedCheck").innerHTML =
      `
      <div class="savedSummary">

        <div class="savedMeta">
          ${saved.targetDraw || "다음"}회 추천 · ${dateText} 저장
        </div>

        아직 해당 회차 당첨 결과가 없습니다.

      </div>
      `;

    return;
  }

  const win =
    new Set(target.nums);

  $("savedCheck").className="";

  $("savedCheck").innerHTML =
    `
    <div class="savedSummary">

      <div class="savedMeta">
        ${target.draw}회 자동 대조 · 당첨번호 ${target.nums.join(" · ")} + ${target.bonus}
      </div>

      ${saved.sets.map((s,i)=>{

        const hit =
          s.filter(
            n=>win.has(n)
          );

        const bonus =
          s.includes(target.bonus)
          &&
          !win.has(target.bonus);

        return `
          <div>
            ${i+1}세트:
            <span class="${hit.length>=3?"matchGood":""}">
              ${hit.length}개 일치${bonus?" + 보너스":""}
            </span>
            ·
            ${hit.join(", ")||"일치 없음"}
          </div>
        `;

      }).join("")}

    </div>
    `;
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

document.querySelectorAll(".rankPeriodBtn").forEach(btn=>{
  btn.onclick = ()=>{
    $("period").value = btn.dataset.period;
    analyze();
  };
});

$("backtestBtn").onclick=runBacktest;

document.querySelectorAll(".strategyBtn").forEach(btn=>{
  btn.onclick=()=>{
    recommendationStrategy=btn.dataset.strategy;
    document.querySelectorAll(".strategyBtn").forEach(x=>x.classList.toggle("active",x===btn));
  };
});

document.addEventListener("DOMContentLoaded", () => {
  renderExcludePicker();
  updateExcludeCount();
  renderIncludePicker();
  updateIncludeCount();
  loadAutoData();
});
