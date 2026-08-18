import json
from pathlib import Path
from datetime import datetime
import requests

DATA_FILE = Path("lotto_data.json")
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

if __name__ == "__main__":
    main()
