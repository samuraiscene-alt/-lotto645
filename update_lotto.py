import json
from pathlib import Path
from datetime import datetime
import requests

DATA_FILE = Path("lotto_data.json")
RARITY_FILE = Path("rarity_model.json")
HISTORY_URL = "https://smok95.github.io/lotto/results/all.json"
MAIN_URL = "https://dhlottery.co.kr/selectMainInfo.do"
DETAIL_URL = "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do"
HEADERS = {
    "AJAX": "true",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.dhlottery.co.kr/lt645/result",
    "User-Agent": "Mozilla/5.0 Lotto645Updater/2.0",
}

def parse_date(ymd):
    s = str(ymd or "")
    try:
        return datetime.strptime(s, "%Y%m%d").strftime("%Y-%m-%d")
    except Exception:
        return s

def latest_round():
    r = requests.get(MAIN_URL, headers=HEADERS, timeout=20)
    r.raise_for_status()
    data = r.json()
    items = data["data"]["result"]["pstLtEpstInfo"]["lt645"]
    return max(int(x["ltEpsd"]) for x in items)

def fetch_draw(draw):
    r = requests.get(
        DETAIL_URL,
        params={"srchDir":"center","srchLtEpsd":draw},
        headers=HEADERS,
        timeout=20
    )
    r.raise_for_status()
    items = r.json().get("data",{}).get("list",[])
    item = next((x for x in items if int(x["ltEpsd"]) == draw), None)
    if not item:
        raise RuntimeError(f"{draw}회 데이터를 찾지 못했습니다.")
    return {
        "draw": draw,
        "date": parse_date(item.get("ltRflYmd")),
        "nums": [int(item[f"tm{i}WnNo"]) for i in range(1,7)],
        "bonus": int(item["bnsWnNo"]),
    }

def solve_linear(a, b):
    n=len(b)
    m=[list(map(float,a[i]))+[float(b[i])] for i in range(n)]
    for col in range(n):
        pivot=max(range(col,n),key=lambda r:abs(m[r][col]))
        m[col],m[pivot]=m[pivot],m[col]
        if abs(m[col][col])<1e-12:
            raise RuntimeError("희소성 모델 학습 행렬이 특이합니다.")
        div=m[col][col]
        m[col]=[v/div for v in m[col]]
        for r in range(n):
            if r==col: continue
            f=m[r][col]
            m[r]=[m[r][c]-f*m[col][c] for c in range(n+1)]
    return [m[i][n] for i in range(n)]

def features(nums):
    nums=sorted(map(int,nums))
    gaps=[nums[i]-nums[i-1] for i in range(1,6)]
    return [1.0,float(sum(nums)),float(min(gaps)),float(max(gaps)),float(sum(n<=31 for n in nums))]

def train_rarity_model(latest):
    r=requests.get(HISTORY_URL,timeout=30)
    r.raise_for_status()
    data=r.json()
    samples=[]
    for row in data:
        draw=int(row.get("draw_no",0) or 0)
        wc=row.get("winners_combination") or {}
        auto=int(wc.get("auto",0) or 0); semi=int(wc.get("semi_auto",0) or 0); manual=int(wc.get("manual",0) or 0)
        winners=auto+semi+manual
        nums=row.get("numbers") or []
        if 262<=draw<=latest and winners>0 and len(nums)==6:
            samples.append((features(nums),manual/winners,draw))
    if len(samples)<100:
        raise RuntimeError(f"희소성 학습 데이터 부족: {len(samples)}회")
    p=5; xtx=[[0.0]*p for _ in range(p)]; xty=[0.0]*p
    for x,y,_ in samples:
        for i in range(p):
            xty[i]+=x[i]*y
            for j in range(p): xtx[i][j]+=x[i]*x[j]
    coef=solve_linear(xtx,xty)
    return coef,samples

def rarity_score(nums, coef):
    x=features(nums)
    predicted=sum(c*v for c,v in zip(coef,x))
    return max(0,min(100,round((1-predicted)*100)))

def write_rarity_model(latest):
    coef,samples=train_rarity_model(latest)
    counts=[0]*101; total=0
    for a in range(1,41):
      for b in range(a+1,42):
       for c in range(b+1,43):
        for d in range(c+1,44):
         for e in range(d+1,45):
          for f in range(e+1,46):
           counts[rarity_score([a,b,c,d,e,f],coef)]+=1; total+=1
    run=0; cdf=[]
    for n in counts:
        run+=n; cdf.append(run/total)
    model={
      "updated_through_draw":latest,
      "trained_through_draw":max(x[2] for x in samples),
      "training_draws":len(samples),
      "source":"smok95/lotto results/all.json; verify winning data against dhlottery.co.kr",
      "features":["intercept","sum","min_gap","max_gap","birthday_le31"],
      "coefficients":coef,
      "cdf":cdf
    }
    RARITY_FILE.write_text(json.dumps(model,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    print(f"희소성 모델 재학습: {len(samples)}회 / {model['trained_through_draw']}회까지")
    print(f"희소성 기준표 생성 완료: {total:,}개 조합")

def main():
    existing = []
    if DATA_FILE.exists():
        existing = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    by_draw = {int(x["draw"]):x for x in existing if x.get("draw")}

    latest = latest_round()
    start = max(1, latest - 51)

    for draw in range(start, latest + 1):
        if draw not in by_draw:
            print(f"새 회차 수집: {draw}")
            by_draw[draw] = fetch_draw(draw)

    wanted = sorted(
        (v for k,v in by_draw.items() if start <= k <= latest),
        key=lambda x:int(x["draw"]),
        reverse=True
    )

    missing = [d for d in range(start, latest+1) if d not in {int(x["draw"]) for x in wanted}]
    for draw in missing:
        by_draw[draw] = fetch_draw(draw)

    wanted = sorted(
        (v for k,v in by_draw.items() if start <= k <= latest),
        key=lambda x:int(x["draw"]),
        reverse=True
    )

    new_text = json.dumps(wanted, ensure_ascii=False, indent=2) + "\n"
    old_text = DATA_FILE.read_text(encoding="utf-8") if DATA_FILE.exists() else ""
    if new_text != old_text:
        DATA_FILE.write_text(new_text, encoding="utf-8")
        print(f"업데이트 완료: 최신 {latest}회 / {len(wanted)}회분 저장")
    else:
        print(f"변경 없음: 최신 {latest}회 / {len(wanted)}회분")

    write_rarity_model(latest)

if __name__ == "__main__":
    main()
