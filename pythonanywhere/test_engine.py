# -*- coding: utf-8 -*-
"""游戏引擎测试：关键机制（弃牌/招募/升级/订单/计分/REST）+ 完整对局驱动。"""
import os
import random
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

import game

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


def drive_full_game(state, max_actions=5000):
    """把房主当真人手动驱动，其余人机自动跑，直到对局结束。"""
    actions = 0
    while state["status"] == "playing":
        if actions >= max_actions:
            raise RuntimeError("对局超过步数上限")
        actions += 1
        player = state["players"][state["currentPlayer"]]
        if player.get("isBot"):
            game.run_bot_turns(state)
            continue
        # 真人：先处理弃牌，再按简单策略行动
        pending = state.get("pendingDiscard")
        if pending and pending["playerId"] == player["id"]:
            excess = pending["count"]
            spices = [0, 0, 0, 0]
            remaining = excess
            for tier in (3, 2, 1, 0):
                take = min(player["spices"][tier], remaining)
                spices[tier] = take
                remaining -= take
            game.apply_game_action(state, player["id"], {"type": "DISCARD", "spices": spices})
            continue
        order_index = next((i for i, oid in enumerate(state["orderMarket"])
                            if game.can_afford(player["spices"], game.ORDER_CARDS[oid]["cost"])), None)
        if order_index is not None:
            game.apply_game_action(state, player["id"], {"type": "CLAIM", "orderIndex": order_index})
            continue
        produce = next((card for card in player["hand"] if game.MERCHANT_CARDS[card]["type"] == "produce"), None)
        if produce:
            game.apply_game_action(state, player["id"], {"type": "PLAY", "cardId": produce})
            continue
        if player["played"]:
            game.apply_game_action(state, player["id"], {"type": "REST"})
            continue
        raise RuntimeError("真人无路可走（测试策略缺陷）")


# ---- 1. 完整对局：多人 + 人机，跑若干局 ----
scenarios = [
    (2, ["easy"]),
    (3, ["easy", "normal"]),
    (4, ["easy", "normal", "hard"]),
    (5, ["easy", "normal", "hard", "hard"]),
]
for seed in range(6):
    for max_players, difficulties in scenarios:
        random.seed(seed * 100 + max_players)
        state = game.create_lobby("房主", max_players, "tok-host")
        for diff in difficulties:
            game.add_bot(state, diff)
        game.start_game(state)
        try:
            drive_full_game(state)
        except Exception as error:
            check(f"full game seed={seed} p={max_players}", False, str(error))
            continue
        ok = state["status"] == "finished"
        for p in state["players"]:
            if any(x < 0 for x in p["spices"]) or sum(p["spices"]) > 10:
                ok = False
        if not state["winnerIds"]:
            ok = False
        scores = [game.score_player(p) for p in state["players"]]
        expected = [p["id"] for p, s in zip(state["players"], scores) if s == max(scores)]
        if state["winnerIds"] != expected:
            ok = False
        check(f"full game seed={seed} p={max_players}", ok,
              f"status={state['status']} winners={state['winnerIds']}")

# ---- 2. 弃牌机制 ----
state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
state["players"][0]["spices"] = [9, 1, 0, 0]
game.apply_game_action(state, state["players"][0]["id"], {"type": "PLAY", "cardId": "start-gain"})
check("discard pending", state["pendingDiscard"] is not None and state["pendingDiscard"]["playerId"] == state["players"][0]["id"],
      str(state.get("pendingDiscard")))
try:
    game.apply_game_action(state, state["players"][0]["id"], {"type": "DISCARD", "spices": [1, 0, 0, 0]})
    check("discard wrong amount rejected", False, "no error")
except ValueError:
    check("discard wrong amount rejected", True)
game.apply_game_action(state, state["players"][0]["id"], {"type": "DISCARD", "spices": [2, 0, 0, 0]})
check("discard applied", state["pendingDiscard"] is None and state["players"][0]["spices"] == [9, 1, 0, 0],
      str(state["players"][0]["spices"]))

# ---- 3. 招募（ACQUIRE） ----
state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
host = state["players"][0]
host["spices"] = [6, 0, 0, 0]
index = 2
selected_id = state["merchantMarket"][index]["cardId"]
game.apply_game_action(state, host["id"], {"type": "ACQUIRE", "marketIndex": index, "payment": [2, 0, 0, 0]})
check("acquire adds card to hand", selected_id in host["hand"], f"hand={host['hand']} want={selected_id}")
check("acquire payment deducted", host["spices"][0] == 4, str(host["spices"]))
check("acquire refills market", len(state["merchantMarket"]) == 6, str(len(state["merchantMarket"])))
# 位置 0/1 被支付了香料，bonus 应增加
check("acquire bonus recorded", state["merchantMarket"][0]["bonus"][0] == 1 and state["merchantMarket"][1]["bonus"][0] == 1,
      str([slot["bonus"] for slot in state["merchantMarket"]]))

# ---- 4. 升级（两个独立新局） ----
state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
host = state["players"][0]
host["spices"] = [3, 0, 0, 0]
host["hand"] = ["start-up"]
game.apply_game_action(state, host["id"], {"type": "PLAY", "cardId": "start-up", "upgrades": [0]})
check("upgrade tier0->1", host["spices"] == [2, 1, 0, 0], str(host["spices"]))

state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
host = state["players"][0]
host["spices"] = [2, 1, 0, 0]
host["hand"] = ["start-up"]
game.apply_game_action(state, host["id"], {"type": "PLAY", "cardId": "start-up", "upgrades": [1, 0]})
check("upgrade two steps", host["spices"] == [1, 1, 1, 0], str(host["spices"]))

# ---- 5. 完成订单与金币 ----
state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
host = state["players"][0]
order0 = game.ORDER_CARDS[state["orderMarket"][0]]
host["spices"] = list(order0["cost"])
gold_before = state["goldSupply"]
game.apply_game_action(state, host["id"], {"type": "CLAIM", "orderIndex": 0})
check("claim adds order", order0["id"] in host["orders"], str(host["orders"]))
check("claim gold bonus", host["gold"] == 1 and state["goldSupply"] == gold_before - 1,
      f"gold={host['gold']} supply={state['goldSupply']}")

# ---- 6. 非法操作 ----
state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
try:
    game.apply_game_action(state, state["players"][1]["id"], {"type": "REST"})
    check("not-your-turn rejected", False)
except ValueError:
    check("not-your-turn rejected", True)
try:
    game.apply_game_action(state, state["players"][0]["id"], {"type": "PLAY", "cardId": "no-such-card"})
    check("unknown card rejected", False)
except ValueError:
    check("unknown card rejected", True)

# ---- 7. REST 收回手牌（交替回合） ----
state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
host = state["players"][0]
game.apply_game_action(state, host["id"], {"type": "PLAY", "cardId": "start-gain"})
check("played after play", host["played"] == ["start-gain"] and host["hand"] == ["start-up"])
game.apply_game_action(state, state["players"][1]["id"], {"type": "PLAY", "cardId": "start-gain"})
game.apply_game_action(state, host["id"], {"type": "REST"})
check("rest returns hand", host["played"] == [] and set(host["hand"]) == {"start-gain", "start-up"}, str(host["hand"]))
# ---- 8. 挂机代管（AFK）----
state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
check("start records turn time", isinstance(state.get("currentTurnStartedAt"), int) and state["currentTurnStartedAt"] > 0)

state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
game.apply_game_action(state, state["players"][0]["id"], {"type": "PLAY", "cardId": "start-gain"})
check("turn advance records time", isinstance(state.get("currentTurnStartedAt"), int) and state["currentPlayer"] == 1)

# 挂机 + 需要弃牌 → AI 代管自动处理
state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
state["players"][0]["spices"] = [9, 1, 0, 0]
game.apply_game_action(state, state["players"][0]["id"], {"type": "PLAY", "cardId": "start-gain"})
afk_now = int(time.time() * 1000)
state["currentTurnStartedAt"] = afk_now - 41000
changed = game.resolve_afk_turns(state, afk_now)
check("afk marks bot", changed is True and state["players"][0].get("isBot") is True and state["players"][0].get("afkSince") == afk_now)
check("afk auto-discard", state["players"][0]["spices"] == [9, 1, 0, 0] and state.get("pendingDiscard") is None)
check("afk advances turn", state["currentPlayer"] == 1 and state["status"] == "playing")

# 活跃真人不受影响
state = game.create_lobby("A", 2, "t1")
game.add_player(state, "B", "t2")
game.start_game(state)
afk_now = int(time.time() * 1000)
state["currentTurnStartedAt"] = afk_now - 1000
changed = game.resolve_afk_turns(state, afk_now)
check("active player untouched", changed is False and state["players"][0].get("isBot") is not True)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
