"""Agent A 接口验证 — 对照 CONTRACT.md 契约测试"""
import base64, requests, os, sys

BASE = "http://localhost:8001"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "cars_train")
passed = 0
failed = 0

def check_top(name, actual, keys):
    """顶层对象：必须有 status: ok + 指定字段"""
    global passed, failed
    ok = actual.get("status") == "ok"
    missing = [k for k in keys if k not in actual]
    if ok and not missing:
        passed += 1
        print(f"  [PASS] {name}")
    else:
        failed += 1
        print(f"  [FAIL] {name}")
        if not ok: print(f"         status != ok: {actual.get('status')}")
        if missing: print(f"         missing keys: {missing}")

def check_sub(name, actual, keys):
    """子对象：不含 status，只检查字段"""
    global passed, failed
    missing = [k for k in keys if k not in actual]
    if not missing:
        passed += 1
        print(f"  [PASS] {name}")
    else:
        failed += 1
        print(f"  [FAIL] {name} — missing keys: {missing}")

# === 1. Health ===
print("\n[1] GET /api/vehicle/health")
r = requests.get(f"{BASE}/api/vehicle/health")
d = r.json()
check_top("health", d, ["status", "model_loaded", "model_name"])
print(f"     model_loaded={d.get('model_loaded')}, model={d.get('model_name')}")

# === 2. Infer ===
print("\n[2] POST /api/vehicle/infer")
img = os.path.join(DATA_DIR, "00001.jpg")
with open(img, "rb") as f:
    b64 = base64.b64encode(f.read()).decode()
r = requests.post(f"{BASE}/api/vehicle/infer", json={"image": b64})
d = r.json()
check_top("infer", d, ["status", "result", "latency_ms"])
if d.get("status") == "ok":
    res = d["result"]
    check_sub("infer.result", res, ["brand", "model", "year", "confidence"])
    print(f"     result: {res.get('brand')} {res.get('model')} ({res.get('year')})")
    print(f"     confidence={res.get('confidence'):.4f}, latency={d.get('latency_ms'):.0f}ms")

# === 3. Params ===
print("\n[3] POST /api/vehicle/tools/params")
r = requests.post(f"{BASE}/api/vehicle/tools/params", json={
    "params": {"brand": "宝马", "model": "530Li", "year": "2023"}
})
d = r.json()
check_top("params", d, ["status", "data"])
if d.get("status") == "ok":
    data = d["data"]
    check_sub("params.data", data, ["brand", "model", "year", "displacement", "horsepower", "fuel_type", "transmission", "config"])
    print(f"     {data.get('brand')} {data.get('model')} {data.get('year')} | {data.get('displacement')} {data.get('horsepower')}hp")

# === 4. Price ===
print("\n[4] POST /api/vehicle/tools/price")
r = requests.post(f"{BASE}/api/vehicle/tools/price", json={
    "params": {"brand": "奔驰", "model": "E300L", "year": "2023", "condition": "good"}
})
d = r.json()
check_top("price", d, ["status", "data"])
if d.get("status") == "ok":
    data = d["data"]
    check_sub("price.data", data, ["estimated_range", "market_trend", "factors", "confidence"])
    print(f"     估价: {data.get('estimated_range')} | 趋势: {data.get('market_trend')}")

# === 5. 品牌名规范化 ===
print("\n[5] 品牌名规范化 (BMW -> 宝马)")
r = requests.post(f"{BASE}/api/vehicle/tools/params", json={
    "params": {"brand": "BMW", "model": "530Li", "year": "2023"}
})
d = r.json()
if d.get("status") == "ok" and "宝马" in str(d["data"].get("brand", "")):
    passed += 1
    print("  [PASS] brand alias (BMW -> 宝马)")
else:
    failed += 1
    print(f"  [FAIL] brand alias, got: {d}")

# === 6. 车况分级估价 ===
print("\n[6] 车况分级估价")
for cond, label in [("excellent", "优秀"), ("fair", "一般"), ("poor", "较差")]:
    r = requests.post(f"{BASE}/api/vehicle/tools/price", json={
        "params": {"brand": "奔驰", "model": "E300L", "year": "2023", "condition": cond}
    })
    d = r.json()
    if d.get("status") == "ok":
        data = d["data"]
        if "estimated_range" in data:
            passed += 1
            print(f"  [PASS] condition={cond}({label}): {data['estimated_range']}")
        else:
            failed += 1
            print(f"  [FAIL] condition={cond}")
    else:
        failed += 1

# === 7. 错误处理 ===
print("\n[7] 错误处理 (不存在的车型)")
r = requests.post(f"{BASE}/api/vehicle/tools/params", json={
    "params": {"brand": "不存在", "model": "不存在", "year": "9999"}
})
if r.status_code == 404:
    passed += 1
    print("  [PASS] 404 for unknown vehicle")
else:
    failed += 1
    print(f"  [FAIL] expected 404, got {r.status_code}: {r.json()}")

# === 总结 ===
print(f"\n{'='*40}")
print(f"Result: {passed} passed, {failed} failed (total {passed+failed})")
if failed == 0:
    print("All contract tests passed!")
else:
    print(f"{failed} test(s) FAILED")
    sys.exit(1)
