# -*- coding: utf-8 -*-
"""端到端 API 测试：验证 Flask 版与前端契约一致。"""
import json
import os
import re
import sqlite3
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
os.environ["SPICE_DB_PATH"] = os.path.join(BASE, "test_site.db")
if os.path.exists(os.environ["SPICE_DB_PATH"]):
    os.remove(os.environ["SPICE_DB_PATH"])

import app as site

with site.app.app_context():
    site.ensure_schema()

client = site.app.test_client()   # 带账号会话
client2 = site.app.test_client()  # 匿名访客
client3 = site.app.test_client()  # 另一个匿名访客

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


# --- 静态前端 ---
r = client.get("/")
html = r.get_data(as_text=True)
check("GET / index", r.status_code == 200 and "香料商路" in html and "root" in html)
js_assets = re.findall(r'src="/assets/([^"]+)"', html)
css_assets = re.findall(r'href="/assets/([^"]+)"', html)
check("asset js", bool(js_assets) and client.get(f"/assets/{js_assets[0]}").status_code == 200)
check("asset css", bool(css_assets) and client.get(f"/assets/{css_assets[0]}").status_code == 200)
check("chat audio 1", client.get("/audio/laoshouxiwantong.mp3").status_code == 200)
check("chat audio 2", client.get("/audio/nizhou.mp3").status_code == 200)
check("GET favicon", client.get("/favicon.svg").status_code == 200)

# --- 注册 / 登录 ---
r = client.post("/api/auth", json={"action": "register", "username": "alice_01", "password": "secret123", "nickname": "爱丽丝"})
data = r.get_json()
check("register", r.status_code == 200 and data["user"]["username"] == "alice_01" and data["user"]["nickname"] == "爱丽丝", str(data))
check("register set-cookie", "spice_session=" in r.headers.get("Set-Cookie", ""))

r = client.post("/api/auth", json={"action": "register", "username": "alice_01", "password": "x" * 7, "nickname": "重复"})
data = r.get_json()
check("duplicate register rejected", r.status_code == 400 and "已经被注册" in data["error"], str(data))

r = client.get("/api/auth")
data = r.get_json()
check("auth get user", r.status_code == 200 and data["user"] and data["user"]["nickname"] == "爱丽丝", str(data))

r = client.post("/api/auth", json={"action": "avatar", "avatar": "🦊"})
data = r.get_json()
check("avatar update", r.status_code == 200 and data["user"]["avatar"] == "🦊", str(data))
r = client.post("/api/auth", json={"action": "avatar", "avatar": "❌"})
check("avatar invalid", r.status_code == 400)

r = client.post("/api/auth", json={"action": "logout"})
data = r.get_json()
check("logout", r.status_code == 200 and data["user"] is None, str(data))

r = client.get("/api/auth")
check("auth null after logout", r.get_json()["user"] is None)

r = client.post("/api/auth", json={"action": "login", "username": "ALICE_01", "password": "secret123"})
data = r.get_json()
check("login (case-insensitive username)", r.status_code == 200 and data["user"]["username"] == "alice_01", str(data))
r = client.post("/api/auth", json={"action": "login", "username": "alice_01", "password": "wrong!"})
data = r.get_json()
check("login wrong password", r.status_code == 400 and "不正确" in data["error"], str(data))

# --- 建房间（账号房主） ---
r = client.post("/api/room", json={"command": "create", "name": "房主", "maxPlayers": 4})
data = r.get_json()
check("create room", r.status_code == 200 and data["code"] and data["token"] and data["state"]["status"] == "lobby", str(data))
code = data["code"]
host_token = data["token"]
host_id = data["playerId"]
check("public state has no token", "token" not in data["state"]["players"][0])
check("public state has no accountId", "accountId" not in data["state"]["players"][0])
check("host is player0", data["state"]["players"][0]["id"] == host_id)

# --- 匿名客人加入 ---
r = client2.post("/api/room", json={"command": "join", "code": code, "name": "客人"})
data = r.get_json()
check("guest join", r.status_code == 200 and len(data["state"]["players"]) == 2, str(data))
guest_token = data["token"]
guest_id = data["playerId"]

# --- 人机 ---
r = client.post("/api/room", json={"command": "addBot", "code": code, "token": host_token, "difficulty": "normal"})
data = r.get_json()
bot_id = data["state"]["players"][2]["id"]
check("addBot", r.status_code == 200 and len(data["state"]["players"]) == 3 and data["state"]["players"][2]["isBot"], str(data))

r = client2.post("/api/room", json={"command": "addBot", "code": code, "token": guest_token, "difficulty": "normal"})
data = r.get_json()
check("guest addBot rejected", r.status_code == 400 and "房主" in data["error"], str(data))

r = client.post("/api/room", json={"command": "removeBot", "code": code, "token": host_token, "botId": bot_id})
data = r.get_json()
check("removeBot", r.status_code == 200 and len(data["state"]["players"]) == 2, str(data))

r = client.post("/api/room", json={"command": "addBot", "code": code, "token": host_token, "difficulty": "hard"})
data = r.get_json()
bot_id = data["state"]["players"][2]["id"]
check("addBot again", r.status_code == 200 and len(data["state"]["players"]) == 3)

# --- 开局 ---
r = client.post("/api/room", json={"command": "start", "code": code, "token": host_token})
data = r.get_json()
check("start game", r.status_code == 200 and data["state"]["status"] == "playing", str(data))
check("start supplies", data["state"]["goldSupply"] == 6 and data["state"]["silverSupply"] == 6)
check("start hands", all(p["hand"] == ["start-gain", "start-up"] for p in data["state"]["players"]))
check("start spices", data["state"]["players"][0]["spices"] == [3, 0, 0, 0] and data["state"]["players"][1]["spices"] == [4, 0, 0, 0])

# --- 行动：房主出牌 ---
r = client.post("/api/room", json={"command": "action", "code": code, "token": host_token, "action": {"type": "PLAY", "cardId": "start-gain"}})
data = r.get_json()
check("host play start-gain", r.status_code == 200 and data["state"]["players"][0]["spices"][0] == 5, str(data))
check("host hand removed", "start-gain" not in data["state"]["players"][0]["hand"])

# --- 行动：客人出牌（之后轮到人机，应自动跑完） ---
r = client2.post("/api/room", json={"command": "action", "code": code, "token": guest_token, "action": {"type": "PLAY", "cardId": "start-gain"}})
data = r.get_json()
check("guest play + bot turn", r.status_code == 200 and data["state"]["status"] == "playing", str(data))

# --- 语音 ---
r = client.post("/api/room", json={"command": "chat", "code": code, "token": host_token, "phrase": "神之一手"})
data = r.get_json()
check("chat", r.status_code == 200 and data["state"]["chatEvents"] and data["state"]["chatEvents"][-1]["phrase"] == "神之一手", str(data))

# --- 读取房间 ---
r = client.get(f"/api/room?code={code}")
data = r.get_json()
check("get room", r.status_code == 200 and data["code"] == code and data["state"]["status"] == "playing")

# --- 错误场景 ---
r = client2.post("/api/room", json={"command": "action", "code": code, "token": "bad-token", "action": {"type": "REST"}})
data = r.get_json()
check("bad token rejected", r.status_code == 400 and "失效" in data["error"], str(data))

r = client.get("/api/room?code=ZZZZZZ")
data = r.get_json()
check("missing room 404", r.status_code == 404 and "找不到" in data["error"], str(data))

r = client2.post("/api/room", json={"command": "create", "name": "", "maxPlayers": 4})
data = r.get_json()
check("create without name", r.status_code == 400 and "昵称" in data["error"], str(data))
# --- 中途加入：开局后新人接替 AI 席位 ---
r = client2.post("/api/room", json={"command": "create", "name": "中局房主", "maxPlayers": 3})
data = r.get_json()
mid_code = data["code"]
mid_token = data["token"]
r = client2.post("/api/room", json={"command": "addBot", "code": mid_code, "token": mid_token, "difficulty": "normal"})
data = r.get_json()
mid_bot_id = data["state"]["players"][1]["id"]
r = client2.post("/api/room", json={"command": "start", "code": mid_code, "token": mid_token})
data = r.get_json()
check("midgame start", data["state"]["status"] == "playing")
r = client3.post("/api/room", json={"command": "join", "code": mid_code, "name": "接替者"})
data = r.get_json()
check("midgame takeover", r.status_code == 200 and data["playerId"] == mid_bot_id and len(data["state"]["players"]) == 2, str(data))
taken = next(p for p in data["state"]["players"] if p["id"] == mid_bot_id)
check("takeover humanizes seat", taken["name"] == "接替者" and not taken.get("isBot"), str(taken))
r = client3.post("/api/room", json={"command": "join", "code": mid_code, "name": "再来一个"})
data = r.get_json()
check("midgame join full rejected", r.status_code == 400 and "没有可接替" in data["error"], str(data))

# --- 挂机代管：GET 触发 AI 代管 ---
r = client2.post("/api/room", json={"command": "create", "name": "挂机房主", "maxPlayers": 2})
data = r.get_json()
afk_code = data["code"]
afk_token = data["token"]
r = client3.post("/api/room", json={"command": "join", "code": afk_code, "name": "挂机客"})
data = r.get_json()
r = client2.post("/api/room", json={"command": "start", "code": afk_code, "token": afk_token})
data = r.get_json()
check("afk setup started", data["state"]["status"] == "playing" and data["state"]["currentPlayer"] == 0)
# 取客人 token
db = sqlite3.connect(os.environ["SPICE_DB_PATH"])
row = db.execute("SELECT state FROM rooms WHERE code = ?", (afk_code,)).fetchone()
st0 = json.loads(row[0])
guest_token = st0["players"][1]["token"]
# 把当前回合开始时间拨到 41 秒前，模拟挂机
st0["currentTurnStartedAt"] = int(time.time() * 1000) - 41000
db.execute("UPDATE rooms SET state = ? WHERE code = ?", (json.dumps(st0, ensure_ascii=False), afk_code))
db.commit()
db.close()
r = client2.get(f"/api/room?code={afk_code}")
data = r.get_json()
check("GET triggers afk", data["state"]["players"][0].get("isBot") is True and data["state"]["currentPlayer"] == 1, str(data))

# 挂机者的回合由 AI 代打（另一玩家行动后自动推进回真人）
r = client3.post("/api/room", json={"command": "action", "code": afk_code, "token": guest_token, "action": {"type": "PLAY", "cardId": "start-gain"}})
data = r.get_json()
check("afk turn auto-played", r.status_code == 200 and data["state"]["currentPlayer"] == 1 and data["state"]["players"][0].get("isBot") is True, str(data))

# 玩家回来：重新加入（join）恢复真人控制
r = client2.post("/api/room", json={"command": "join", "code": afk_code, "token": afk_token, "name": "挂机房主"})
data = r.get_json()
check("rejoin clears afk", r.status_code == 200, str(data))
r = client2.get(f"/api/room?code={afk_code}")
data = r.get_json()
check("afk cleared after rejoin", data["state"]["players"][0].get("isBot") is not True and "afkSince" not in data["state"]["players"][0], str(data["state"]["players"][0]))

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

