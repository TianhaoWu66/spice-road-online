# -*- coding: utf-8 -*-
"""香料商路 - 游戏核心逻辑（Python 移植版，与 lib/game.ts 行为一致）。

数据结构全部使用 dict/list，与前端期望的 JSON 结构完全一致。
错误用 ValueError 抛出，中文提示与原版一致。
"""
import copy
import random
import time
import uuid

AFK_TIMEOUT_MS = 40_000

# ---------- 常量 ----------

SPICE_NAMES = ["姜黄", "藏红花", "小豆蔻", "肉桂"]
PLAYER_COLORS = ["#e6a23c", "#df6b57", "#5f9b76", "#5f7dad", "#8b6bb1"]
CHAT_PHRASES = ["老叟戏顽童", "你粥", "神之一手", "你的计谋被我识破了"]
CARD_CATALOG_READY = True


def zero_spices():
    return [0, 0, 0, 0]


def _s(a=0, b=0, c=0, d=0):
    return [a, b, c, d]


MERCHANT_CARDS = {
    "start-gain": {"id": "start-gain", "type": "produce", "gain": _s(2, 0, 0, 0)},
    "start-up": {"id": "start-up", "type": "upgrade", "amount": 2},
    "m001": {"id": "m001", "type": "trade", "cost": _s(0, 0, 1, 0), "gain": _s(1, 2, 0, 0)},
    "m002": {"id": "m002", "type": "trade", "cost": _s(0, 3, 0, 0), "gain": _s(0, 0, 3, 0)},
    "m003": {"id": "m003", "type": "trade", "cost": _s(0, 0, 1, 0), "gain": _s(4, 1, 0, 0)},
    "m004": {"id": "m004", "type": "trade", "cost": _s(0, 0, 0, 1), "gain": _s(2, 2, 0, 0)},
    "m005": {"id": "m005", "type": "trade", "cost": _s(4, 0, 0, 0), "gain": _s(0, 0, 1, 1)},
    "m006": {"id": "m006", "type": "trade", "cost": _s(0, 2, 0, 0), "gain": _s(2, 0, 0, 1)},
    "m007": {"id": "m007", "type": "trade", "cost": _s(2, 0, 0, 0), "gain": _s(0, 0, 1, 0)},
    "m008": {"id": "m008", "type": "produce", "gain": _s(3, 0, 0, 0)},
    "m009": {"id": "m009", "type": "produce", "gain": _s(0, 0, 0, 1)},
    "m010": {"id": "m010", "type": "trade", "cost": _s(0, 3, 0, 0), "gain": _s(1, 0, 1, 1)},
    "m011": {"id": "m011", "type": "trade", "cost": _s(0, 0, 2, 0), "gain": _s(2, 3, 0, 0)},
    "m012": {"id": "m012", "type": "trade", "cost": _s(0, 2, 0, 0), "gain": _s(3, 0, 1, 0)},
    "m013": {"id": "m013", "type": "trade", "cost": _s(0, 0, 2, 0), "gain": _s(2, 1, 0, 1)},
    "m014": {"id": "m014", "type": "produce", "gain": _s(0, 0, 1, 0)},
    "m015": {"id": "m015", "type": "produce", "gain": _s(0, 2, 0, 0)},
    "m016": {"id": "m016", "type": "trade", "cost": _s(0, 0, 2, 0), "gain": _s(0, 0, 0, 2)},
    "m017": {"id": "m017", "type": "trade", "cost": _s(0, 0, 0, 2), "gain": _s(0, 3, 2, 0)},
    "m018": {"id": "m018", "type": "trade", "cost": _s(3, 0, 0, 0), "gain": _s(0, 0, 0, 1)},
    "m019": {"id": "m019", "type": "produce", "gain": _s(2, 1, 0, 0)},
    "m020": {"id": "m020", "type": "trade", "cost": _s(1, 1, 0, 0), "gain": _s(0, 0, 0, 1)},
    "m021": {"id": "m021", "type": "trade", "cost": _s(3, 0, 0, 0), "gain": _s(0, 3, 0, 0)},
    "m022": {"id": "m022", "type": "trade", "cost": _s(0, 0, 0, 1), "gain": _s(0, 3, 0, 0)},
    "m023": {"id": "m023", "type": "trade", "cost": _s(0, 0, 2, 0), "gain": _s(0, 2, 0, 1)},
    "m024": {"id": "m024", "type": "trade", "cost": _s(0, 0, 3, 0), "gain": _s(0, 0, 0, 3)},
    "m025": {"id": "m025", "type": "trade", "cost": _s(4, 0, 0, 0), "gain": _s(0, 0, 2, 0)},
    "m026": {"id": "m026", "type": "trade", "cost": _s(0, 3, 0, 0), "gain": _s(0, 0, 0, 2)},
    "m027": {"id": "m027", "type": "upgrade", "amount": 3},
    "m028": {"id": "m028", "type": "trade", "cost": _s(0, 0, 0, 1), "gain": _s(0, 0, 2, 0)},
    "m029": {"id": "m029", "type": "trade", "cost": _s(0, 2, 0, 0), "gain": _s(0, 0, 2, 0)},
    "m030": {"id": "m030", "type": "trade", "cost": _s(0, 0, 0, 2), "gain": _s(1, 1, 3, 0)},
    "m031": {"id": "m031", "type": "trade", "cost": _s(0, 3, 0, 0), "gain": _s(2, 0, 2, 0)},
    "m032": {"id": "m032", "type": "produce", "gain": _s(1, 1, 0, 0)},
    "m033": {"id": "m033", "type": "trade", "cost": _s(0, 1, 0, 0), "gain": _s(3, 0, 0, 0)},
    "m034": {"id": "m034", "type": "trade", "cost": _s(3, 0, 0, 0), "gain": _s(0, 1, 1, 0)},
    "m035": {"id": "m035", "type": "trade", "cost": _s(0, 0, 0, 1), "gain": _s(1, 1, 1, 0)},
    "m036": {"id": "m036", "type": "trade", "cost": _s(2, 0, 1, 0), "gain": _s(0, 0, 0, 2)},
    "m037": {"id": "m037", "type": "produce", "gain": _s(4, 0, 0, 0)},
    "m038": {"id": "m038", "type": "trade", "cost": _s(0, 0, 0, 1), "gain": _s(3, 0, 1, 0)},
    "m039": {"id": "m039", "type": "trade", "cost": _s(2, 0, 0, 0), "gain": _s(0, 2, 0, 0)},
    "m040": {"id": "m040", "type": "trade", "cost": _s(5, 0, 0, 0), "gain": _s(0, 0, 0, 2)},
    "m041": {"id": "m041", "type": "trade", "cost": _s(0, 0, 1, 0), "gain": _s(0, 2, 0, 0)},
    "m042": {"id": "m042", "type": "produce", "gain": _s(1, 0, 1, 0)},
}

_ORDER_CARD_DATA = [
    ("o001", _s(1, 1, 1, 1), 12),
    ("o002", _s(0, 2, 2, 0), 10),
    ("o003", _s(0, 5, 0, 0), 10),
    ("o004", _s(3, 1, 1, 1), 14),
    ("o005", _s(0, 2, 0, 3), 16),
    ("o006", _s(3, 0, 2, 0), 9),
    ("o007", _s(1, 0, 2, 1), 12),
    ("o008", _s(0, 2, 2, 2), 19),
    ("o009", _s(3, 2, 0, 0), 7),
    ("o010", _s(0, 0, 4, 0), 12),
    ("o011", _s(2, 1, 0, 1), 9),
    ("o012", _s(2, 0, 0, 2), 10),
    ("o013", _s(0, 0, 5, 0), 15),
    ("o014", _s(0, 2, 1, 1), 12),
    ("o015", _s(1, 1, 1, 3), 20),
    ("o016", _s(2, 3, 0, 0), 8),
    ("o017", _s(0, 0, 0, 4), 16),
    ("o018", _s(2, 0, 3, 0), 11),
    ("o019", _s(0, 4, 0, 0), 8),
    ("o020", _s(0, 0, 0, 5), 20),
    ("o021", _s(2, 0, 0, 3), 14),
    ("o022", _s(0, 0, 2, 2), 14),
    ("o023", _s(0, 0, 2, 3), 18),
    ("o024", _s(0, 0, 3, 2), 17),
    ("o025", _s(0, 2, 3, 0), 13),
    ("o026", _s(3, 0, 0, 2), 11),
    ("o027", _s(2, 2, 0, 2), 13),
    ("o028", _s(1, 1, 3, 1), 18),
    ("o029", _s(0, 3, 0, 2), 14),
    ("o030", _s(0, 2, 0, 2), 12),
    ("o031", _s(2, 2, 0, 0), 6),
    ("o032", _s(2, 2, 2, 0), 13),
    ("o033", _s(2, 0, 2, 0), 8),
    ("o034", _s(1, 3, 1, 1), 16),
    ("o035", _s(0, 3, 2, 0), 12),
    ("o036", _s(2, 0, 2, 2), 17),
]

ORDER_CARDS = {item[0]: {"id": item[0], "cost": item[1], "points": item[2]} for item in _ORDER_CARD_DATA}

BOT_NAMES = {
    "easy": ["学徒商人", "沙丘新手", "小骆驼"],
    "normal": ["丝路商人", "绿洲行家", "香料掌柜"],
    "hard": ["商路大师", "王庭巨贾", "沙海智者"],
}


# ---------- 工具函数 ----------

def _shuffle(values):
    copy_list = list(values)
    for i in range(len(copy_list) - 1, 0, -1):
        j = random.randrange(i + 1)
        copy_list[i], copy_list[j] = copy_list[j], copy_list[i]
    return copy_list


def _total(v):
    return sum(v)


def can_afford(have, cost, times=1):
    return all(have[i] >= cost[i] * times for i in range(4))


def _add(target, values, factor=1):
    for i, n in enumerate(values):
        target[i] += n * factor


def _pay(target, values, factor=1):
    for i, n in enumerate(values):
        target[i] -= n * factor


def _new_id():
    return str(uuid.uuid4())


# ---------- 大厅 / 房间 ----------

def create_lobby(host_name, max_players, token, profile=None):
    profile = profile or {}
    host = {
        "id": _new_id(), "token": token, "name": host_name, "color": PLAYER_COLORS[0],
        "avatar": profile.get("avatar"), "accountId": profile.get("accountId"),
        "spices": zero_spices(), "hand": [], "played": [], "orders": [],
        "gold": 0, "silver": 0,
    }
    return {
        "status": "lobby", "maxPlayers": max_players, "hostId": host["id"],
        "players": [host],
        "merchantDeck": [], "orderDeck": [], "merchantMarket": [], "orderMarket": [],
        "goldSupply": 0, "silverSupply": 0,
        "currentPlayer": 0, "round": 1, "finalRound": False, "winnerIds": [],
        "log": [f"{host_name} 创建了商队"],
        "actionEvents": [], "nextActionEventId": 1,
        "chatEvents": [], "nextChatEventId": 1,
    }


def add_player(state, name, token, profile=None):
    profile = profile or {}
    if state["status"] != "lobby":
        raise ValueError("游戏已经开始")
    if len(state["players"]) >= state["maxPlayers"]:
        raise ValueError("房间已满")
    if any(p["name"] == name for p in state["players"]):
        raise ValueError("这个昵称已被使用")
    state["players"].append({
        "id": _new_id(), "token": token, "name": name,
        "color": PLAYER_COLORS[len(state["players"])],
        "avatar": profile.get("avatar"), "accountId": profile.get("accountId"),
        "spices": zero_spices(), "hand": [], "played": [], "orders": [],
        "gold": 0, "silver": 0,
    })
    state["log"].append(f"{name} 加入了商队")
    return state


def add_bot(state, difficulty):
    if state["status"] != "lobby":
        raise ValueError("游戏已经开始")
    if len(state["players"]) >= state["maxPlayers"]:
        raise ValueError("房间已满")
    if difficulty not in ("easy", "normal", "hard"):
        raise ValueError("人机难度无效")
    used_names = {p["name"] for p in state["players"]}
    base_name = next((candidate for candidate in BOT_NAMES[difficulty] if candidate not in used_names), BOT_NAMES[difficulty][0])
    name = base_name
    suffix = 2
    while name in used_names:
        name = f"{base_name}{suffix}"
        suffix += 1
    state["players"].append({
        "id": _new_id(), "name": name, "color": PLAYER_COLORS[len(state["players"])],
        "avatar": "🤖",
        "spices": zero_spices(), "hand": [], "played": [], "orders": [],
        "gold": 0, "silver": 0,
        "isBot": True, "botDifficulty": difficulty,
    })
    state["log"].append(f"{name}（人机）加入了商队")
    return state


def remove_bot(state, bot_id):
    if state["status"] != "lobby":
        raise ValueError("游戏已经开始")
    index = next((i for i, p in enumerate(state["players"]) if p["id"] == bot_id and p.get("isBot")), -1)
    if index < 0:
        raise ValueError("找不到这个人机玩家")
    bot = state["players"].pop(index)
    for player_index, player in enumerate(state["players"]):
        player["color"] = PLAYER_COLORS[player_index]
    state["log"].append(f"{bot['name']} 离开了商队")
    return state


def start_game(state):
    if state["status"] != "lobby":
        raise ValueError("游戏已经开始")
    if len(state["players"]) < 2:
        raise ValueError("至少需要两名玩家")
    if not CARD_CATALOG_READY or not MERCHANT_CARDS or not ORDER_CARDS:
        raise ValueError("卡牌库正在整理，暂时不能开始游戏")
    merchant_deck = _shuffle([card_id for card_id in MERCHANT_CARDS if not card_id.startswith("start")])
    order_deck = _shuffle(list(ORDER_CARDS.keys()))
    for index, player in enumerate(state["players"]):
        player["hand"] = ["start-gain", "start-up"]
        player["spices"] = _s(3) if index == 0 else (_s(4) if index < 3 else _s(3, 1))
    state["merchantMarket"] = [{"cardId": card_id, "bonus": zero_spices()} for card_id in merchant_deck[:6]]
    state["orderMarket"] = order_deck[:5]
    state["merchantDeck"] = merchant_deck[6:]
    state["orderDeck"] = order_deck[5:]
    state["goldSupply"] = len(state["players"]) * 2
    state["silverSupply"] = len(state["players"]) * 2
    state["status"] = "playing"
    state["currentTurnStartedAt"] = int(time.time() * 1000)
    state["log"].append("商路开启，第一轮开始")
    return state


# ---------- 计分 / 丢弃 ----------

def score_player(player):
    return sum(ORDER_CARDS[order_id]["points"] for order_id in player["orders"] if order_id in ORDER_CARDS) \
        + player["gold"] * 3 + player["silver"] + player["spices"][1] + player["spices"][2] + player["spices"][3]


def _auto_discard(player, state=None):
    excess = _total(player["spices"]) - 10
    tiers = [0, 1, 2, 3]
    if player.get("isBot") and state and state["orderMarket"]:
        orders = [ORDER_CARDS[order_id] for order_id in state["orderMarket"]]
        target = max(orders, key=lambda order: _order_progress(order, player["spices"]))
        tiers = sorted([0, 1, 2, 3], key=lambda tier: (
            -(player["spices"][tier] - target["cost"][tier]),
            -(tier),
        ))
    for tier in tiers:
        if excess <= 0:
            break
        removed = min(player["spices"][tier], excess)
        player["spices"][tier] -= removed
        excess -= removed


def _order_progress(order, spices):
    total_progress = 0
    for tier, count in enumerate(order["cost"]):
        total_progress += min(count, spices[tier]) * 3 - max(0, count - spices[tier]) * 2
    return total_progress


# ---------- 语音 / 事件 ----------

def send_chat(state, player_id, phrase):
    if state["status"] != "playing":
        raise ValueError("只能在游戏中发送语音")
    if phrase not in CHAT_PHRASES:
        raise ValueError("这条语音不存在")
    player = next((candidate for candidate in state["players"] if candidate["id"] == player_id), None)
    if not player:
        raise ValueError("玩家不存在")
    events = state.get("chatEvents") or []
    event_id = state.get("nextChatEventId") or ((events[-1]["id"] if events else 0) + 1)
    events.append({"id": event_id, "playerId": player_id, "playerName": player["name"],
                   "playerColor": player["color"], "phrase": phrase})
    state["chatEvents"] = events[-12:]
    state["nextChatEventId"] = event_id + 1
    return state


def _finish_turn(state):
    was_last = state["currentPlayer"] == len(state["players"]) - 1
    if state["finalRound"] and was_last:
        state["status"] = "finished"
        scores = [score_player(player) for player in state["players"]]
        best = max(scores)
        state["winnerIds"] = [player["id"] for player, score in zip(state["players"], scores) if score == best]
        state["log"].append("本轮结束，商路结算完成")
        return
    state["currentPlayer"] = (state["currentPlayer"] + 1) % len(state["players"])
    if was_last:
        state["round"] += 1
    state["currentTurnStartedAt"] = int(time.time() * 1000)


def _record_action(state, player, event):
    events = state.get("actionEvents") or []
    event_id = state.get("nextActionEventId") or ((events[-1]["id"] if events else 0) + 1)
    record = {
        "id": event_id, "playerId": player["id"], "playerName": player["name"],
        "playerColor": player["color"], "playerAvatar": player.get("avatar"),
    }
    record.update(event)
    record = {key: value for key, value in record.items() if value is not None}
    events.append(record)
    state["actionEvents"] = events[-20:]
    state["nextActionEventId"] = event_id + 1


# ---------- 行动 ----------

def apply_game_action(state, player_id, action):
    if state["status"] != "playing":
        raise ValueError("游戏不在进行中")
    player = state["players"][state["currentPlayer"]]
    if player["id"] != player_id:
        raise ValueError("还没轮到你")

    if state.get("pendingDiscard"):
        if state["pendingDiscard"]["playerId"] != player["id"] or action.get("type") != "DISCARD":
            raise ValueError("请先选择要放回的香料")
        excess = _total(player["spices"]) - 10
        if excess <= 0 or _total(action.get("spices") or zero_spices()) != excess \
                or not can_afford(player["spices"], action.get("spices") or zero_spices()):
            raise ValueError("放回的香料数量不正确")
        _pay(player["spices"], action["spices"])
        state["pendingDiscard"] = None
        state["log"].append(f"{player['name']} 选择放回了 {excess} 个香料")
        _finish_turn(state)
        return state
    if action.get("type") == "DISCARD":
        raise ValueError("当前不需要放回香料")

    if action.get("type") == "REST":
        if not player["played"]:
            raise ValueError("当前没有需要收回的牌")
        player["hand"].extend(player["played"])
        player["played"] = []
        state["log"].append(f"{player['name']} 休息并收回全部商人牌")
        _record_action(state, player, {"type": "REST"})

    if action.get("type") == "PLAY":
        card_id = action.get("cardId")
        if card_id not in player["hand"]:
            raise ValueError("这张牌不在手中")
        card = MERCHANT_CARDS.get(card_id)
        if not card:
            raise ValueError("商人牌不存在")
        if card["type"] == "produce":
            _add(player["spices"], card["gain"])
            state["log"].append(f"{player['name']} 获得了一批香料")
        elif card["type"] == "trade":
            times = max(1, int(action.get("times") or 1))
            if not can_afford(player["spices"], card["cost"], times):
                raise ValueError("香料不足，无法完成交易")
            _pay(player["spices"], card["cost"], times)
            _add(player["spices"], card["gain"], times)
            state["log"].append(f"{player['name']} 完成了 {times} 次香料交易")
        else:
            choices = action.get("upgrades") or []
            if not choices or len(choices) > card["amount"]:
                raise ValueError("升级次数不正确")
            for tier in choices:
                if tier < 0 or tier > 2 or player["spices"][tier] < 1:
                    raise ValueError("无法升级所选香料")
                player["spices"][tier] -= 1
                player["spices"][tier + 1] += 1
            state["log"].append(f"{player['name']} 升级了 {len(choices)} 个香料")
        record_event = {
            "type": "PLAY", "cardId": card_id,
            "times": max(1, int(action.get("times") or 1)) if card["type"] == "trade" else None,
            "upgradeCount": len(action.get("upgrades") or []) if card["type"] == "upgrade" else None,
            "upgrades": action.get("upgrades") if card["type"] == "upgrade" else None,
        }
        _record_action(state, player, record_event)
        player["hand"] = [card for card in player["hand"] if card != card_id]
        player["played"].append(card_id)

    if action.get("type") == "ACQUIRE":
        index = action.get("marketIndex")
        if index < 0 or index >= len(state["merchantMarket"]):
            raise ValueError("市场位置无效")
        payment = action.get("payment") or zero_spices()
        if _total(payment) != index or not can_afford(player["spices"], payment):
            raise ValueError("支付的香料数量不正确")
        _pay(player["spices"], payment)
        paid_tiers = []
        for tier, count in enumerate(payment):
            for _ in range(count):
                paid_tiers.append(tier)
        for slot, tier in enumerate(paid_tiers):
            state["merchantMarket"][slot]["bonus"][tier] += 1
        selected = state["merchantMarket"][index]
        player["hand"].append(selected["cardId"])
        _add(player["spices"], selected["bonus"])
        state["merchantMarket"].pop(index)
        next_card = state["merchantDeck"].pop(0) if state["merchantDeck"] else None
        if next_card:
            state["merchantMarket"].append({"cardId": next_card, "bonus": zero_spices()})
        state["log"].append(f"{player['name']} 招募了一名新商人")
        _record_action(state, player, {"type": "ACQUIRE", "cardId": selected["cardId"]})

    if action.get("type") == "CLAIM":
        index = action.get("orderIndex")
        order_id = state["orderMarket"][index] if 0 <= index < len(state["orderMarket"]) else None
        order = ORDER_CARDS.get(order_id) if order_id else None
        if not order or not can_afford(player["spices"], order["cost"]):
            raise ValueError("香料不足，无法完成订单")
        _pay(player["spices"], order["cost"])
        player["orders"].append(order_id)
        if index == 0 and state["goldSupply"] > 0:
            player["gold"] += 1
            state["goldSupply"] -= 1
        elif ((index == 1 and state["goldSupply"] > 0) or index == 0) and state["silverSupply"] > 0:
            player["silver"] += 1
            state["silverSupply"] -= 1
        state["orderMarket"].pop(index)
        next_order = state["orderDeck"].pop(0) if state["orderDeck"] else None
        if next_order:
            state["orderMarket"].append(next_order)
        elif not state["orderMarket"]:
            state["finalRound"] = True
            state["log"].append("订单牌堆已经取完，本轮结束后结算")
        state["log"].append(f"{player['name']} 完成了价值 {order['points']} 分的订单")
        _record_action(state, player, {"type": "CLAIM", "orderId": order_id})
        target = 6 if len(state["players"]) <= 3 else 5
        if len(player["orders"]) >= target:
            state["finalRound"] = True
            state["log"].append(f"{player['name']} 触发了最后一轮")

    excess = _total(player["spices"]) - 10
    if excess > 0:
        if player.get("isBot"):
            _auto_discard(player, state)
        else:
            state["pendingDiscard"] = {"playerId": player["id"], "count": excess}
            state["log"].append(f"{player['name']} 需要选择放回 {excess} 个香料")
            return state
    _finish_turn(state)
    return state


def describe_merchant(card):
    if card["type"] == "produce":
        return "获取香料"
    if card["type"] == "upgrade":
        return f"升级 {card['amount']} 次"
    return "重复交易"


# ---------- 人机 ----------

def _payment_for(player, amount, state, use_random=False):
    payment = zero_spices()
    available = []
    for tier, count in enumerate(player["spices"]):
        for _ in range(count):
            available.append(tier)
    if use_random:
        for tier in _shuffle(available)[:amount]:
            payment[tier] += 1
        return payment
    desired = zero_spices()
    for order_id in state["orderMarket"]:
        order = ORDER_CARDS[order_id]
        for tier, count in enumerate(order["cost"]):
            desired[tier] = max(desired[tier], count)
    available.sort(key=lambda tier: (-(player["spices"][tier] - desired[tier]), tier))
    for tier in available[:amount]:
        payment[tier] += 1
    return payment


def _upgrade_actions(card_id, amount, spices):
    result = []

    def visit(current, choices):
        if choices:
            result.append({"type": "PLAY", "cardId": card_id, "upgrades": list(choices)})
        if len(choices) >= amount:
            return
        for tier in range(3):
            if current[tier] < 1:
                continue
            next_spices = list(current)
            next_spices[tier] -= 1
            next_spices[tier + 1] += 1
            visit(next_spices, choices + [tier])

    visit(list(spices), [])
    return result


def legal_bot_actions(state):
    player = state["players"][state["currentPlayer"]]
    if not player.get("isBot") or state["status"] != "playing":
        return []
    actions = []

    for order_index, order_id in enumerate(state["orderMarket"]):
        if can_afford(player["spices"], ORDER_CARDS[order_id]["cost"]):
            actions.append({"type": "CLAIM", "orderIndex": order_index})
    for card_id in player["hand"]:
        card = MERCHANT_CARDS[card_id]
        if card["type"] == "produce":
            actions.append({"type": "PLAY", "cardId": card_id})
        if card["type"] == "trade":
            maximum = 10
            for tier, count in enumerate(card["cost"]):
                if count:
                    maximum = min(maximum, player["spices"][tier] // count)
            for times in range(1, maximum + 1):
                actions.append({"type": "PLAY", "cardId": card_id, "times": times})
        if card["type"] == "upgrade":
            actions.extend(_upgrade_actions(card_id, card["amount"], player["spices"]))
    spice_total = _total(player["spices"])
    for market_index in range(len(state["merchantMarket"])):
        if market_index <= spice_total:
            actions.append({
                "type": "ACQUIRE", "marketIndex": market_index,
                "payment": _payment_for(player, market_index, state, player.get("botDifficulty") == "easy"),
            })
    if player["played"]:
        actions.append({"type": "REST"})
    return actions


def _action_score(state, action):
    acting_player = state["players"][state["currentPlayer"]]
    before_orders = len(acting_player["orders"])
    simulated = copy.deepcopy(state)
    apply_game_action(simulated, acting_player["id"], action)
    player = next(candidate for candidate in simulated["players"] if candidate["id"] == acting_player["id"])
    spice_value = sum(count * (tier + 1) for tier, count in enumerate(player["spices"]))
    order_potential = 0
    for order_id in simulated["orderMarket"]:
        order = ORDER_CARDS[order_id]
        missing = sum(max(0, count - player["spices"][tier]) for tier, count in enumerate(order["cost"]))
        order_potential = max(order_potential, order["points"] * 10 - missing * 80)
    score = score_player(player) * 90 + spice_value + order_potential + len(player["hand"]) * 3
    if len(player["orders"]) > before_orders:
        score += 500
    if action.get("type") == "ACQUIRE":
        card = MERCHANT_CARDS[state["merchantMarket"][action["marketIndex"]]["cardId"]]
        if card["type"] == "upgrade":
            score += 45
        if card["type"] == "trade":
            score += 18
        score -= action["marketIndex"] * 5
    if action.get("type") == "REST":
        score += 35 if len(player["hand"]) < 2 else 5
    return score


def choose_bot_action(state):
    player = state["players"][state["currentPlayer"]]
    actions = legal_bot_actions(state)
    if not actions:
        raise ValueError("人机没有可执行的行动")
    if player.get("botDifficulty") == "easy":
        claims = [action for action in actions if action.get("type") == "CLAIM"]
        pool = claims if claims and random.random() < 0.75 else actions
        return random.choice(pool)
    ranked = sorted(actions, key=lambda item: _action_score(state, item), reverse=True)
    if player.get("botDifficulty") == "normal":
        shortlist = ranked[:min(3, len(ranked))]
        return random.choice(shortlist)
    if len(ranked) > 1 and random.random() < 0.12:
        alternatives = ranked[1:min(6, len(ranked))]
        return random.choice(alternatives)
    return ranked[0]


def run_bot_turns(state):
    turns = 0
    while state["status"] == "playing" and state["players"][state["currentPlayer"]].get("isBot"):
        if turns >= 100:
            raise ValueError("人机回合超过安全上限")
        turns += 1
        bot = state["players"][state["currentPlayer"]]
        pending = state.get("pendingDiscard")
        if pending and pending["playerId"] == bot["id"]:
            _auto_discard(bot, state)
            state["pendingDiscard"] = None
            _finish_turn(state)
            continue
        action = choose_bot_action(state)
        apply_game_action(state, bot["id"], action)
    return state


def resolve_afk_turns(state, now):
    """轮到真人超过 AFK_TIMEOUT_MS 未操作时，标记为 AI 代管并自动推进回合。

    返回是否发生了代管（状态可能已变化，调用方负责保存）。
    """
    if state.get("status") != "playing":
        return False
    state.setdefault("currentTurnStartedAt", now)
    changed = False
    guard = 0
    while state.get("status") == "playing" and guard < 100:
        guard += 1
        player = state["players"][state["currentPlayer"]]
        if player.get("isBot"):
            run_bot_turns(state)
            continue
        if now - state["currentTurnStartedAt"] >= AFK_TIMEOUT_MS:
            player["isBot"] = True
            player["botDifficulty"] = "normal"
            player["afkSince"] = player.get("afkSince") or now
            state["log"].append(f"{player['name']} 暂时离开，由 AI 代管")
            changed = True
            continue
        break
    return changed
