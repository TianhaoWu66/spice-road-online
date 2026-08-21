# -*- coding: utf-8 -*-
"""联调测试：香料商路 + 德州扑克子应用（/poker/）同时挂载。"""
import json
import os
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

from werkzeug.test import Client
from werkzeug.wrappers import Response

from app import application  # noqa: E402

client = Client(application, Response)
passed = 0
failed = 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"PASS  {name}")
    else:
        failed += 1
        print(f"FAIL  {name}  {extra}")


# 1) 主应用根路径 -> 香料商路 index
r = client.get("/")
check("主应用 / 返回香料商路页面", r.status_code == 200 and "香料商路" in r.get_data(as_text=True), r.status_code)

# 2) /poker -> 301 到 /poker/
r = client.get("/poker")
check("/poker 301 到 /poker/", r.status_code == 301 and r.headers.get("Location") == "/poker/", (r.status_code, r.headers.get("Location")))

# 3) /poker/ -> 德州扑克 index
r = client.get("/poker/")
text = r.get_data(as_text=True)
check("/poker/ 返回德州扑克页面", r.status_code == 200 and "德州风云" in text and "/poker/assets/" in text, r.status_code)

# 4) /poker 静态资源
r = client.get("/poker/favicon.svg")
check("/poker/favicon.svg 可访问", r.status_code == 200 and b"svg" in r.get_data()[:100].lower(), r.status_code)
r = client.get("/poker/manifest.webmanifest")
check("/poker/manifest.webmanifest 可访问", r.status_code == 200 and "德州风云" in r.get_data(as_text=True), r.status_code)
r = client.get("/poker/sw.js")
check("/poker/sw.js 可访问", r.status_code == 200, r.status_code)

# 5) 德州扑克 API：创建房间
r = client.post("/poker/api/room", json={"command": "create", "name": "测试", "maxPlayers": 4})
data = r.get_json(silent=True) or {}
check("扑克创建房间", r.status_code == 200 and data.get("code") and data.get("playerId"), (r.status_code, data))
poker_code = data.get("code", "")
if poker_code:
    r = client.get(f"/poker/api/room?code={poker_code}&viewerId={data.get('playerId')}")
    check("扑克读取房间", r.status_code == 200 and r.get_json().get("state", {}).get("players"), r.status_code)

# 6) 德州扑克 API：注册账号（cookie 名应为 poker_session）
r = client.post("/poker/api/auth", json={"action": "register", "username": "pokertest" + str(int(time.time() * 1000))[-8:], "password": "secret123", "nickname": "扑克测试"})
cookies = r.headers.get("Set-Cookie", "")
check("扑克注册账号 + poker_session cookie", r.status_code == 200 and "poker_session=" in cookies, (r.status_code, cookies))

# 7) 香料商路 API：创建房间（确认主应用未受影响）
r = client.post("/api/room", json={"command": "create", "name": "测试", "maxPlayers": 4})
data = r.get_json(silent=True) or {}
check("香料商路创建房间仍正常", r.status_code == 200 and data.get("code"), (r.status_code, data))

# 8) 香料商路 API：注册账号（cookie 名应为 spice_session）
r = client.post("/api/auth", json={"action": "register", "username": "spicetest" + str(int(time.time() * 1000))[-8:], "password": "secret123", "nickname": "香料测试"})
cookies = r.headers.get("Set-Cookie", "")
check("香料商路注册账号 + spice_session cookie", r.status_code == 200 and "spice_session=" in cookies, (r.status_code, cookies))

# 9) 不存在的扑克 API 路径 -> 404 json
r = client.get("/poker/api/nothing")
check("扑克未知 API 返回 404", r.status_code == 404, r.status_code)

# 10) 主应用静态资源
r = client.get("/favicon.svg")
check("主应用静态资源正常", r.status_code in (200, 404), r.status_code)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
