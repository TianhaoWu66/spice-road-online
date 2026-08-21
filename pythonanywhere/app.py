# -*- coding: utf-8 -*-
"""香料商路 - PythonAnywhere 版（Flask + SQLite）。

API 契约与原 Cloudflare D1 版完全一致：
  GET  /api/room?code=XXXXXX   读取房间
  POST /api/room               创建/加入/人机/开局/行动/语音
  GET  /api/auth               读取登录状态
  POST /api/auth               注册/登录/退出/换头像
其余路径返回静态前端页面。

部署：见 README.md（PythonAnywhere 上传步骤）。
本地运行：pip install flask && python app.py
"""
import json
import os
import re
import secrets
import sqlite3
import time

from flask import Flask, g, request, send_from_directory, Response

import accounts
import game

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DB_PATH = os.environ.get("SPICE_DB_PATH", os.path.join(BASE_DIR, "site.db"))

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_sessions_user_id ON account_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_account_sessions_expires_at ON account_sessions(expires_at);
"""

app = Flask(__name__)


def now_ms():
    return int(time.time() * 1000)


def get_db():
    if "db" not in g:
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout = 5000")
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def ensure_schema():
    get_db().executescript(SCHEMA_SQL)


def _json_response(payload, status=200):
    return Response(
        json.dumps(payload, ensure_ascii=False),
        status=status,
        mimetype="application/json",
    )


def _is_secure():
    forwarded = request.headers.get("X-Forwarded-Proto", "")
    return forwarded.lower() == "https" or request.is_secure


def _clean_code(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").strip().upper())[:6]


def _random_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


def _clamp_max_players(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = 5
    return max(2, min(5, number))


def _public_state(state):
    players = []
    for player in state["players"]:
        public_player = dict(player)
        public_player.pop("token", None)
        public_player.pop("accountId", None)
        players.append(public_player)
    public = dict(state)
    public["players"] = players
    return public


def _load_room(code):
    row = get_db().execute(
        "SELECT state, version FROM rooms WHERE code = ?", (code,)
    ).fetchone()
    if not row:
        raise ValueError("找不到这个房间")
    return {"state": json.loads(row["state"]), "version": row["version"]}


def _save_room(code, state, version):
    cursor = get_db().execute(
        "UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?",
        (json.dumps(state, ensure_ascii=False), now_ms(), code, version),
    )
    if cursor.rowcount == 0:
        raise ValueError("房间刚刚发生了变化，请重试")
    return version + 1

def _find_ai_seat(state):
    """游戏进行中，找可被真人接替的 AI 席位：优先代管席，其次常驻人机。"""
    for player in state["players"]:
        if player.get("isBot") and "afkSince" in player:
            return player
    for player in state["players"]:
        if player.get("isBot"):
            return player
    return None


# ---------- 房间 API ----------

@app.route("/api/room", methods=["GET"])
def room_get():
    try:
        ensure_schema()
        code = _clean_code(request.args.get("code"))
        room = _load_room(code)
        if game.resolve_afk_turns(room["state"], now_ms()):
            room["version"] = _save_room(code, room["state"], room["version"])
            get_db().commit()
        return _json_response({"code": code, "version": room["version"], "state": _public_state(room["state"])})
    except ValueError as error:
        return _json_response({"error": str(error)}, 404)


@app.route("/api/room", methods=["POST"])
def room_post():
    try:
        ensure_schema()
        db = get_db()
        body = request.get_json(silent=True) or {}
        account = accounts.get_account_from_request(db, request.headers.get("Cookie"))
        name = (account["nickname"] if account else str(body.get("name") or "").strip())[:12]
        token = str(body.get("token") or "")
        command = body.get("command")
        profile = {"accountId": account["id"], "avatar": account["avatar"]} if account else None

        if command == "create":
            if not name:
                raise ValueError("请输入昵称")
            max_players = _clamp_max_players(body.get("maxPlayers"))
            for _ in range(5):
                code = _random_code()
                state = game.create_lobby(name, max_players, token or secrets.token_urlsafe(24), profile)
                cursor = db.execute(
                    "INSERT OR IGNORE INTO rooms (code, state, version, updated_at) VALUES (?, ?, 1, ?)",
                    (code, json.dumps(state, ensure_ascii=False), now_ms()),
                )
                if cursor.rowcount:
                    db.commit()
                    return _json_response({
                        "code": code, "version": 1,
                        "token": state["players"][0]["token"],
                        "playerId": state["players"][0]["id"],
                        "state": _public_state(state),
                    })
            raise ValueError("暂时无法创建房间，请重试")

        code = _clean_code(body.get("code"))
        room = _load_room(code)
        state = room["state"]

        # 找出请求者（若有），若本人正处于 AI 代管，先恢复真人控制
        requester = next(
            (candidate for candidate in state["players"]
             if (candidate.get("accountId") == account["id"] if account else candidate.get("token") == token)),
            None,
        )
        requester_had_afk = requester is not None and (requester.get("isBot") or "afkSince" in requester)
        if requester_had_afk:
            requester.pop("isBot", None)
            requester.pop("botDifficulty", None)
            requester.pop("afkSince", None)
            if state["players"].index(requester) == state["currentPlayer"] and state["status"] == "playing":
                state["currentTurnStartedAt"] = now_ms()

        # 挂机处理：轮到真人超过 40s 未操作 → AI 代管
        game.resolve_afk_turns(state, now_ms())

        if command == "join":
            if not name:
                raise ValueError("请输入昵称")
            join_token = token or secrets.token_urlsafe(24)
            if requester is not None:
                # 重新加入：回到自己的席位，恢复真人控制
                if account:
                    requester["name"] = account["nickname"]
                    requester["avatar"] = account["avatar"]
                joined = requester
                if requester_had_afk or account:
                    version = _save_room(code, state, room["version"])
                else:
                    version = room["version"]
            elif state["status"] == "lobby":
                game.add_player(state, name, join_token, profile)
                joined = state["players"][-1]
                version = _save_room(code, state, room["version"])
            elif state["status"] == "playing":
                seat = _find_ai_seat(state)
                if seat is None:
                    raise ValueError("游戏进行中，暂时没有可接替的席位")
                state["log"].append(f"{name} 加入了商队，接替了 AI 席位")
                seat["name"] = name
                seat["token"] = join_token
                seat["accountId"] = account["id"] if account else None
                seat["avatar"] = account["avatar"] if account else None
                seat.pop("isBot", None)
                seat.pop("botDifficulty", None)
                seat.pop("afkSince", None)
                joined = seat
                if state["players"].index(joined) == state["currentPlayer"]:
                    state["currentTurnStartedAt"] = now_ms()
                version = _save_room(code, state, room["version"])
            else:
                raise ValueError("游戏已结束，无法加入")
            db.commit()
            return _json_response({
                "code": code, "version": version,
                "token": joined.get("token") or join_token,
                "playerId": joined["id"],
                "state": _public_state(state),
            })

        if requester is None:
            raise ValueError("玩家身份已失效，请重新加入")
        player = requester
        if account:
            player["name"] = account["nickname"]
            player["avatar"] = account["avatar"]

        if command == "addBot":
            if player["id"] != room["state"]["hostId"]:
                raise ValueError("只有房主可以添加人机")
            game.add_bot(room["state"], body.get("difficulty") or "normal")
        elif command == "removeBot":
            if player["id"] != room["state"]["hostId"]:
                raise ValueError("只有房主可以移除人机")
            game.remove_bot(room["state"], str(body.get("botId") or ""))
        elif command == "start":
            if player["id"] != room["state"]["hostId"]:
                raise ValueError("只有房主可以开始")
            game.start_game(room["state"])
            game.run_bot_turns(room["state"])
        elif command == "action" and body.get("action"):
            game.apply_game_action(room["state"], player["id"], body["action"])
            game.run_bot_turns(room["state"])
        elif command == "chat" and body.get("phrase"):
            game.send_chat(room["state"], player["id"], body["phrase"])
        else:
            raise ValueError("未知操作")

        version = _save_room(code, room["state"], room["version"])
        db.commit()
        return _json_response({"code": code, "version": version, "state": _public_state(room["state"])})
    except ValueError as error:
        try:
            get_db().rollback()
        except Exception:
            pass
        return _json_response({"error": str(error)}, 400)
    except Exception as error:
        try:
            get_db().rollback()
        except Exception:
            pass
        return _json_response({"error": str(error)}, 500)


# ---------- 账号 API ----------

@app.route("/api/auth", methods=["GET"])
def auth_get():
    try:
        ensure_schema()
        user = accounts.get_account_from_request(get_db(), request.headers.get("Cookie"))
        return _json_response({"user": user})
    except Exception as error:
        return _json_response({"error": str(error)}, 500)


@app.route("/api/auth", methods=["POST"])
def auth_post():
    try:
        ensure_schema()
        db = get_db()
        body = request.get_json(silent=True) or {}
        action = body.get("action")
        secure = _is_secure()

        if action == "register":
            username = accounts.normalize_username(body.get("username"))
            password = str(body.get("password") or "")
            nickname = str(body.get("nickname") or "").strip()[:12]
            accounts.validate_registration(username, password, nickname)
            user = accounts.create_account(db, username, password, nickname)
            token = accounts.create_account_session(db, user["id"])
            db.commit()
            response = _json_response({"user": user})
            response.headers["Set-Cookie"] = accounts.session_cookie(token, secure)
            return response

        if action == "login":
            user = accounts.verify_account(db, accounts.normalize_username(body.get("username")), str(body.get("password") or ""))
            token = accounts.create_account_session(db, user["id"])
            db.commit()
            response = _json_response({"user": user})
            response.headers["Set-Cookie"] = accounts.session_cookie(token, secure)
            return response

        if action == "logout":
            accounts.delete_account_session(db, request.headers.get("Cookie"))
            db.commit()
            response = _json_response({"user": None})
            response.headers["Set-Cookie"] = accounts.expired_session_cookie(secure)
            return response

        if action == "avatar":
            user = accounts.get_account_from_request(db, request.headers.get("Cookie"))
            if not user:
                raise ValueError("请先登录账号")
            avatar = accounts.update_account_avatar(db, user["id"], body.get("avatar"))
            db.commit()
            return _json_response({"user": {**user, "avatar": avatar}})

        raise ValueError("未知账号操作")
    except ValueError as error:
        try:
            get_db().rollback()
        except Exception:
            pass
        return _json_response({"error": str(error)}, 400)
    except Exception as error:
        try:
            get_db().rollback()
        except Exception:
            pass
        return _json_response({"error": str(error)}, 500)


# ---------- 静态前端 ----------

@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    if filename.startswith("api/"):
        return _json_response({"error": "接口不存在"}, 404)
    return send_from_directory(STATIC_DIR, filename)


if __name__ == "__main__":
    with app.app_context():
        ensure_schema()
    print(f"香料商路 local server -> http://127.0.0.1:5000  (db: {DB_PATH})")
    app.run(host="127.0.0.1", port=5000, debug=False)

