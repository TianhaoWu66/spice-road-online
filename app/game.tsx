"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionEvent, BotDifficulty, canAfford, CARD_CATALOG_READY, CHAT_PHRASES, ChatEvent, ChatPhrase, describeMerchant, GameAction, GameState, MerchantCard, MERCHANT_CARDS,
  ORDER_CARDS, scorePlayer, Spice, Spices, SPICE_NAMES, zeroSpices,
  addBot, addPlayer, applyGameAction, chooseBotAction, createLobby, removeBot, runBotTurns, sendChat, startGame,
} from "../lib/game";
import { PROFILE_AVATARS, ProfileAvatar } from "../lib/profile";
import {
  acceptHostAnswer, createHostPairing, joinHost, parseMessage, qrDataUrl, redactState,
  type HotspotMessage,
} from "../lib/hotspot";

type RoomResponse = { code: string; version: number; token?: string; playerId?: string; state: GameState; error?: string };
type HotspotRole = "off" | "host" | "player";
type HostPairing = { id: string; offerCode: string; qr: string; pc: RTCPeerConnection; channel: RTCDataChannel; status: "waiting" | "connected" | "failed"; answerInput: string };
type AccountProfile = { id: string; username: string; nickname: string; avatar: ProfileAvatar };
type AuthMode = "guest" | "login" | "register";
type VisualTheme = "parchment" | "night" | "celadon";
type Modal =
  | { kind: "trade"; cardId: string; times: number }
  | { kind: "upgrade"; cardId: string; choices: Spice[] }
  | { kind: "acquire"; marketIndex: number; payment: Spices }
  | { kind: "discard"; required: number; selection: Spices };

const spiceClass = ["yellow", "red", "green", "brown"];
const botLabels: Record<BotDifficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };
const themeLabels: Record<VisualTheme, string> = { parchment: "羊皮纸", night: "夜市", celadon: "青瓷" };

// 三国杀式环桌座位：seat 0 是自己（底部），其余按行动顺序环绕棋盘
const TABLE_SLOTS: Record<number, string[]> = {
  2: ["slot-top"],
  3: ["slot-top-left", "slot-top-right"],
  4: ["slot-top-left", "slot-top", "slot-top-right"],
  5: ["slot-left", "slot-top-left", "slot-top", "slot-top-right"],
};

const CHAT_AUDIO: Record<string, string> = {
  "老叟戏顽童": "/audio/laoshouxiwantong.mp3",
  "你粥": "/audio/nizhou.mp3",
  "你的计谋被我识破了": "/audio/jimou.mp3",
};

function speakChatPhrase(phrase: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const voice = new SpeechSynthesisUtterance(phrase);
  voice.lang = "zh-CN";
  voice.rate = .9;
  voice.pitch = .92;
  const chineseVoice = window.speechSynthesis.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith("zh"));
  if (chineseVoice) voice.voice = chineseVoice;
  window.speechSynthesis.speak(voice);
}

function SpiceRow({ values, compact = false }: { values: Spices; compact?: boolean }) {
  return <div className={`spice-row ${compact ? "compact" : ""}`}>
    {values.map((count, tier) => count > 0 && (
      <span className={`spice-token ${spiceClass[tier]}`} title={SPICE_NAMES[tier]} key={tier}>
        <i />{count}
      </span>
    ))}
    {values.every((n) => n === 0) && <span className="empty-spices">—</span>}
  </div>;
}

function Arrow() { return <span className="trade-arrow">→</span>; }

function ThemeSwitcher({ value, onChange }: { value: VisualTheme; onChange: (value: VisualTheme) => void }) {
  return <div className="theme-switcher" aria-label="卡牌风格">
    {(Object.keys(themeLabels) as VisualTheme[]).map((theme) => <button aria-pressed={value === theme} title={`${themeLabels[theme]}风格`} key={theme} onClick={() => onChange(theme)}><i />{themeLabels[theme]}</button>)}
  </div>;
}

function MerchantFace({ card, bonus }: { card: MerchantCard; bonus?: Spices }) {
  return <>
    <div className="card-kicker"><span className="card-type-icon">{card.type === "produce" ? "✦" : card.type === "upgrade" ? "◆" : "⇄"}</span>{describeMerchant(card)}</div>
    <div className="card-rule">
      {card.type === "produce" && <SpiceRow values={card.gain} />}
      {card.type === "upgrade" && <div className="upgrade-symbol"><span>◆</span><Arrow /><span>◆+</span><b>×{card.amount}</b></div>}
      {card.type === "trade" && <><SpiceRow values={card.cost} /><Arrow /><SpiceRow values={card.gain} /></>}
    </div>
    {bonus && bonus.some(Boolean) && <div className="card-bonus"><small>附带</small><SpiceRow values={bonus} compact /></div>}
  </>;
}

function OrderFace({ orderId }: { orderId: string }) {
  const order = ORDER_CARDS[orderId];
  return <>
    <div className="points">{order.points}<small>分</small></div>
    <SpiceRow values={order.cost} />
  </>;
}

function ActionReveal({ event }: { event: ActionEvent }) {
  const card = event.cardId ? MERCHANT_CARDS[event.cardId] : null;
  const label = event.type === "PLAY" ? "打出商人牌" : event.type === "ACQUIRE" ? "从市场招募" : event.type === "CLAIM" ? "完成订单" : "休息并收回手牌";
  const upgradePath = event.upgrades?.map((tier) => `${SPICE_NAMES[tier]}→${SPICE_NAMES[tier + 1]}`).join("、");
  const detail = event.times && event.times > 1 ? `连续交易 ${event.times} 次` : upgradePath || (event.upgradeCount ? `升级 ${event.upgradeCount} 次` : "");
  return <div className="action-reveal" role="status" aria-live="polite">
    <section className={`action-stage action-${event.type.toLowerCase()}`}>
      <div className="action-player"><span className="avatar" style={{ background: event.playerColor }}>{event.playerAvatar ?? event.playerName.slice(0, 1)}</span><div><b>{event.playerName}</b><small>{label}</small></div></div>
      {card && <div className={`merchant-card card-${card.type} reveal-card-face`}><MerchantFace card={card} /></div>}
      {event.orderId && <div className="order-card reveal-order"><OrderFace orderId={event.orderId} /></div>}
      {event.type === "REST" && <div className="rest-reveal"><span>☾</span><b>收回全部商人牌</b></div>}
      {detail && <span className="action-detail">{detail}</span>}
    </section>
  </div>;
}

function LastActionBadge({ event }: { event: ActionEvent }) {
  const card = event.cardId ? MERCHANT_CARDS[event.cardId] : null;
  const order = event.orderId ? ORDER_CARDS[event.orderId] : null;
  const label = event.type === "PLAY"
    ? `打出商人牌${event.times && event.times > 1 ? ` ×${event.times}` : ""}`
    : event.type === "ACQUIRE" ? "招募商人"
      : event.type === "CLAIM" ? `完成 ${order?.points ?? 0} 分订单`
        : "休息并收回手牌";
  return <div className="player-last-action" title="会保留到这名玩家下一次操作完成">
    <span>最近操作</span><b>{label}</b>
    {card?.type === "produce" && <div className="last-action-rule"><SpiceRow values={card.gain} compact /></div>}
    {card?.type === "trade" && <div className="last-action-rule"><SpiceRow values={card.cost} compact /><Arrow /><SpiceRow values={card.gain} compact /></div>}
    {card?.type === "upgrade" && <div className="last-action-rule">升级 {event.upgradeCount ?? card.amount} 次</div>}
    {order && <div className="last-action-rule"><SpiceRow values={order.cost} compact /></div>}
  </div>;
}

function RulesGuide({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return <div className="rules-guide-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="rules-guide" role="dialog" aria-modal="true" aria-labelledby="rules-guide-title">
      <header><div><p className="eyebrow">游戏说明书</p><h2 id="rules-guide-title">香料商路规则</h2></div><button className="rules-close" aria-label="关闭规则说明书" onClick={onClose}>×</button></header>
      <div className="rules-scroll">
        <section><h3>游戏目标</h3><p>使用商人牌生产、升级和交换香料，再支付香料完成订单。游戏结束时总分最高的玩家获胜。</p></section>
        <section><h3>轮到你时</h3><ol><li><b>打出商人牌：</b>执行生产、升级或交换效果。交换牌可在香料足够时连续执行多次。</li><li><b>招募商人：</b>取得商人市场中的一张牌。跳过的每张牌都要放置 1 个任意香料，取得牌上已有的全部香料。</li><li><b>完成订单：</b>支付订单要求的香料并获得订单分数；市场最前方的订单还可能获得金币或银币。</li><li><b>休息：</b>把所有已经打出的商人牌收回手中。</li></ol></section>
        <section><h3>香料与商队</h3><div className="rules-spices"><span><i className="gem yellow" />姜黄</span><span><i className="gem red" />藏红花</span><span><i className="gem green" />小豆蔻</span><span><i className="gem brown" />肉桂</span></div><p>香料等级由左至右递增。升级一次，就是把 1 个香料换成下一级。回合结束时最多保留 10 个香料；超过时由玩家自行选择放回哪些香料。</p></section>
        <section><h3>游戏结束与计分</h3><p>2–3 人游戏中，有玩家完成第 6 张订单后触发最后一轮；4–5 人游戏中则是第 5 张。所有玩家完成本轮后结算。</p><ul><li>订单牌上的分数</li><li>每枚金币 3 分，每枚银币 1 分</li><li>每个红色、绿色或棕色香料 1 分，黄色香料不计分</li></ul></section>
      </div>
      <button className="primary rules-done" onClick={onClose}>我知道了</button>
    </section>
  </div>;
}

export default function Game() {
  const [serverRoom, setServerRoom] = useState<RoomResponse | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [localState, setLocalState] = useState<GameState | null>(null);
  const [localPass, setLocalPass] = useState(false);
  const [localAddName, setLocalAddName] = useState("");
  const [botThinking, setBotThinking] = useState(false);
  const lastScores = useRef<Map<string, number>>(new Map());
  const [scoreDeltas, setScoreDeltas] = useState<Map<string, number>>(new Map());
  const [hotspotRole, setHotspotRole] = useState<HotspotRole>("off");
  const [hostPairings, setHostPairings] = useState<HostPairing[]>([]);
  const [hostConnections, setHostConnections] = useState<Array<{ id: string; name: string }>>([]);
  const [playerName, setPlayerName] = useState("");
  const [hostCodeInput, setHostCodeInput] = useState("");
  const [playerAnswerCode, setPlayerAnswerCode] = useState("");
  const [playerQr, setPlayerQr] = useState("");
  const [playerStatus, setPlayerStatus] = useState("");
  const [myPlayerId, setMyPlayerId] = useState("");
  const [playerState, setPlayerState] = useState<GameState | null>(null);
  const [playerVersion, setPlayerVersion] = useState(0);
  const hotspotConns = useRef<Map<RTCDataChannel, { name: string; playerId: string }>>(new Map());
  const playerChannelRef = useRef<RTCDataChannel | null>(null);
  const localStateRef = useRef<GameState | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [copied, setCopied] = useState(false);
  const [visualTheme, setVisualTheme] = useState<VisualTheme>("celadon");
  const [actionQueue, setActionQueue] = useState<ActionEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<ActionEvent | null>(null);
  const [chatQueue, setChatQueue] = useState<ChatEvent[]>([]);
  const [activeChat, setActiveChat] = useState<ChatEvent | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("guest");
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registerNickname, setRegisterNickname] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const room = hotspotRole === "player"
    ? (playerState ? { code: "HOT", version: playerVersion, state: playerState } as RoomResponse : null)
    : hotspotRole === "host"
      ? (localState ? { code: "HOST", version: 0, state: localState } as RoomResponse : null)
      : localMode
        ? (localState ? { code: "LOCAL", version: 0, state: localState } as RoomResponse : null)
        : serverRoom;
  localStateRef.current = localState;
  const observedEventId = useRef<number | null>(null);
  const observedRoomCode = useRef<string | null>(null);
  const observedChatId = useRef<number | null>(null);
  const observedChatRoomCode = useRef<string | null>(null);

  const token = localMode || hotspotRole !== "off" ? "local" : (typeof window !== "undefined" ? localStorage.getItem(`silk-token-${room?.code}`) ?? "" : "");
  const hostSelfId = localState?.players[0]?.id ?? "";
  const me = hotspotRole === "player"
    ? room?.state.players.find((p) => p.id === myPlayerId)
    : hotspotRole === "host"
      ? room?.state.players.find((p) => p.id === hostSelfId)
      : localMode
        ? (room ? room.state.players[room.state.currentPlayer] : undefined)
        : room?.state.players.find((p) => p.id === localStorage.getItem(`silk-player-${room?.code}`));
  const myIndex = hotspotRole !== "off"
    ? (room?.state.players.findIndex((p) => p.id === me?.id) ?? -1)
    : localMode ? (room?.state.currentPlayer ?? -1) : (room?.state.players.findIndex((p) => p.id === me?.id) ?? -1);
  const pendingDiscard = room?.state.pendingDiscard;
  const mustDiscard = pendingDiscard?.playerId === me?.id;
  const isMyTurn = room?.state.status === "playing" && room.state.currentPlayer === myIndex && !mustDiscard && !activeEvent && actionQueue.length === 0;

  useEffect(() => {
    if (localMode || hotspotRole !== "off") { setAuthReady(true); return; }
    fetch("/api/auth", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { user?: AccountProfile | null };
      if (data.user) { setAccount(data.user); setName(data.user.nickname); }
    }).catch(() => {}).finally(() => setAuthReady(true));
  }, [localMode, hotspotRole]);

  const accountRequest = async (action: "register" | "login" | "logout" | "avatar", avatar?: ProfileAvatar) => {
    setAuthBusy(true); setAuthError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, username, password, nickname: registerNickname, avatar }),
      });
      const data = await response.json() as { user?: AccountProfile | null; error?: string };
      if (!response.ok) throw new Error(data.error || "账号操作失败");
      setAccount(data.user ?? null);
      if (data.user) { setName(data.user.nickname); setPassword(""); setShowAvatarPicker(false); }
      else { setName(""); setAuthMode("guest"); }
    } catch (authRequestError) {
      setAuthError(authRequestError instanceof Error ? authRequestError.message : "账号操作失败");
    } finally { setAuthBusy(false); }
  };

  const broadcastHotspot = useCallback((state: GameState) => {
    const now = Date.now();
    hotspotConns.current.forEach((conn, channel) => {
      if (channel.readyState === "open" && conn.playerId) {
        try {
          channel.send(JSON.stringify({ type: "state", state: redactState(state, conn.playerId), version: now } satisfies HotspotMessage));
        } catch { /* 忽略 */ }
      }
    });
  }, []);

  const commitLocal = useCallback((next: GameState) => {
    setLocalState(next);
    if (hotspotRole === "host") broadcastHotspot(next);
  }, [hotspotRole, broadcastHotspot]);

  const markPlayerAfk = useCallback((playerId: string) => {
    const st = localStateRef.current;
    if (!st || st.status !== "playing") return;
    const next = structuredClone(st) as GameState;
    const seat = next.players.find((candidate) => candidate.id === playerId);
    if (seat && !seat.isBot) {
      seat.isBot = true; seat.botDifficulty = "normal"; seat.afkSince = Date.now();
      next.log.push(`${seat.name} 掉线，由 AI 代管`);
      commitLocal(next);
    }
  }, [commitLocal]);

  const handleHostChannelMessage = useCallback((channel: RTCDataChannel, raw: string) => {
    let msg: HotspotMessage;
    try { msg = parseMessage(raw); } catch { return; }
    const entry = hotspotConns.current.get(channel);
    if (msg.type === "hello") {
      const base = localStateRef.current;
      if (!base || base.status !== "lobby") {
        try { channel.send(JSON.stringify({ type: "error", message: "游戏已开始，暂不能入座" } satisfies HotspotMessage)); } catch { /* 忽略 */ }
        return;
      }
      if (base.players.length >= base.maxPlayers) {
        try { channel.send(JSON.stringify({ type: "error", message: "房间已满" } satisfies HotspotMessage)); } catch { /* 忽略 */ }
        return;
      }
      const next = structuredClone(base) as GameState;
      addPlayer(next, String(msg.name ?? "").trim().slice(0, 12) || "玩家", `hot-${Date.now()}`, undefined);
      const seat = next.players[next.players.length - 1];
      if (entry) { entry.playerId = seat.id; entry.name = seat.name; }
      setLocalState(next);
      try {
        channel.send(JSON.stringify({ type: "welcome", playerId: seat.id, code: "HOT", name: seat.name, color: seat.color, avatar: seat.avatar } satisfies HotspotMessage));
      } catch { /* 忽略 */ }
      broadcastHotspot(next);
      setHostConnections(Array.from(hotspotConns.current.values()).map((c) => ({ id: c.playerId, name: c.name })));
      return;
    }
    if (!entry?.playerId) return;
    if (msg.type === "action") {
      const base = localStateRef.current;
      if (!base || base.status !== "playing") return;
      const actor = base.players[base.currentPlayer];
      if (actor.id !== entry.playerId) {
        try { channel.send(JSON.stringify({ type: "error", message: "还没轮到你" } satisfies HotspotMessage)); } catch { /* 忽略 */ }
        return;
      }
      const next = structuredClone(base) as GameState;
      try { applyGameAction(next, actor.id, msg.action); runBotTurns(next); }
      catch (e) {
        try { channel.send(JSON.stringify({ type: "error", message: e instanceof Error ? e.message : "操作失败" } satisfies HotspotMessage)); } catch { /* 忽略 */ }
        return;
      }
      commitLocal(next);
      return;
    }
    if (msg.type === "chat") {
      const base = localStateRef.current;
      if (!base || base.status !== "playing") return;
      const actor = base.players.find((p) => p.id === entry.playerId);
      if (!actor) return;
      const next = structuredClone(base) as GameState;
      try { sendChat(next, actor.id, msg.phrase); } catch { return; }
      commitLocal(next);
    }
  }, [broadcastHotspot, commitLocal]);

  const playerRequest = useCallback(async (body: Record<string, unknown>) => {
    const channel = playerChannelRef.current;
    if (!channel || channel.readyState !== "open") { setError("热点连接已断开"); return null; }
    try {
      const command = body.command;
      if (command === "action" && body.action) {
        channel.send(JSON.stringify({ type: "action", action: body.action } satisfies HotspotMessage));
        return { code: "HOT", version: 0, state: playerState! } as RoomResponse;
      }
      if (command === "chat" && body.phrase) {
        channel.send(JSON.stringify({ type: "chat", phrase: body.phrase } satisfies HotspotMessage));
        return { code: "HOT", version: 0, state: playerState! } as RoomResponse;
      }
    } catch { setError("发送失败"); }
    return null;
  }, [playerState]);

  const startHostMode = () => {
    const pname = name.trim() || "房主";
    setHotspotRole("host");
    setLocalState(createLobby(pname, maxPlayers, "host-self"));
    setServerRoom(null);
  };

  const addHostPairing = async () => {
    setBusy(true); setError("");
    try {
      const { offerCode, pc, channel } = await createHostPairing();
      const id = `pair-${Date.now()}`;
      const qr = await qrDataUrl(offerCode);
      channel.onopen = () => {
        setHostPairings((list) => list.map((p) => p.id === id ? { ...p, status: "connected" } : p));
        hotspotConns.current.set(channel, { name: "", playerId: "" });
        setHostConnections([]);
      };
      channel.onmessage = (event) => handleHostChannelMessage(channel, String(event.data));
      channel.onclose = () => {
        const entry = hotspotConns.current.get(channel);
        hotspotConns.current.delete(channel);
        setHostPairings((list) => list.map((p) => p.channel === channel ? { ...p, status: "failed" } : p));
        setHostConnections(Array.from(hotspotConns.current.values()).map((c) => ({ id: c.playerId, name: c.name })));
        if (entry?.playerId) markPlayerAfk(entry.playerId);
      };
      setHostPairings((list) => [...list, { id, offerCode, qr, pc, channel, status: "waiting", answerInput: "" }]);
    } catch (e) { setError(e instanceof Error ? e.message : "生成配对码失败"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (hotspotRole !== "host") return;
    const timer = window.setInterval(() => {
      hotspotConns.current.forEach((entry, channel) => {
        if (entry.playerId && channel.readyState === "closed") {
          const pid = entry.playerId;
          hotspotConns.current.delete(channel);
          markPlayerAfk(pid);
        }
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hotspotRole, markPlayerAfk]);

  const acceptPairingAnswer = async (pairingId: string, answerCode: string) => {
    setBusy(true); setError("");
    try {
      const pairing = hostPairings.find((p) => p.id === pairingId);
      if (!pairing) throw new Error("配对不存在");
      await acceptHostAnswer(pairing.pc, answerCode.trim());
      setHostPairings((list) => list.map((p) => p.id === pairingId ? { ...p, answerInput: "" } : p));
    } catch (e) { setError(e instanceof Error ? e.message : "应答码无效"); }
    finally { setBusy(false); }
  };

  const startPlayerSetup = () => {
    setHotspotRole("player");
    setServerRoom(null);
  };

  const connectToHost = async () => {
    if (!playerName.trim()) { setError("请输入昵称"); return; }
    setBusy(true); setError(""); setPlayerStatus("正在连接…");
    try {
      const { answerCode, pc, channel: channelPromise } = await joinHost(hostCodeInput.trim());
      setPlayerAnswerCode(answerCode);
      setPlayerQr(await qrDataUrl(answerCode));
      setPlayerStatus("等待房主输入应答码…");
      const channel = await channelPromise;
      playerChannelRef.current = channel;
      channel.onopen = () => {
        setPlayerStatus("已连接，等待入座…");
        channel.send(JSON.stringify({ type: "hello", name: playerName.trim().slice(0, 12) } satisfies HotspotMessage));
      };
      channel.onmessage = (event) => {
        let msg: HotspotMessage;
        try { msg = parseMessage(String(event.data)); } catch { return; }
        if (msg.type === "welcome") {
          setMyPlayerId(msg.playerId);
          setPlayerStatus("已入座");
        } else if (msg.type === "state") {
          setPlayerState(msg.state);
          setPlayerVersion(msg.version);
        } else if (msg.type === "error") {
          setError(msg.message);
        }
      };
      channel.onclose = () => { setPlayerStatus("连接已断开"); };
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败，请检查邀请码");
      setPlayerStatus("");
    } finally { setBusy(false); }
  };

  const resolveBotTurnsLocal = useCallback(async (initial: GameState) => {
    let current = initial;
    for (let guard = 0; guard < 20; guard++) {
      if (current.status !== "playing") break;
      const bot = current.players[current.currentPlayer];
      if (!bot?.isBot) break;
      setBotThinking(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const next = structuredClone(current) as GameState;
      const b = next.players[next.currentPlayer];
      if (!b?.isBot) break;
      try {
        const action = chooseBotAction(next);
        applyGameAction(next, b.id, action);
      } catch { break; }
      commitLocal(next);
      current = next;
    }
    setBotThinking(false);
    if (current.status === "playing") {
      const humanCount = current.players.filter((p) => !p.isBot).length;
      const nextActor = current.players[current.currentPlayer];
      setLocalPass(humanCount > 1 && nextActor && !nextActor.isBot);
    }
  }, [commitLocal]);

  const localRequest = useCallback(async (body: Record<string, unknown>) => {
    if (!localState) return null;
    setBusy(true); setError("");
    try {
      const next = structuredClone(localState) as GameState;
      const command = body.command;
      const pname = String(body.name ?? "").trim().slice(0, 12);
      if (command === "join") {
        if (!pname) throw new Error("请输入昵称");
        if (next.status !== "lobby") throw new Error("游戏已经开始");
        addPlayer(next, pname, `local-${next.players.length}`, undefined);
        commitLocal(next);
        return { code: "LOCAL", version: 0, state: next } as RoomResponse;
      }
      if (command === "addBot") {
        if (next.status !== "lobby") throw new Error("游戏已经开始");
        addBot(next, String(body.difficulty ?? "normal") as BotDifficulty);
        commitLocal(next);
        return { code: "LOCAL", version: 0, state: next } as RoomResponse;
      }
      if (command === "removeBot") {
        removeBot(next, String(body.botId ?? ""));
        commitLocal(next);
        return { code: "LOCAL", version: 0, state: next } as RoomResponse;
      }
      if (command === "start") {
        startGame(next);
        runBotTurns(next);
        commitLocal(next);
        setLocalPass(hotspotRole === "off" && next.status === "playing" && next.players.filter((p) => !p.isBot).length > 1);
        return { code: "LOCAL", version: 0, state: next } as RoomResponse;
      }
      const actor = next.players[next.currentPlayer];
      if (!actor || actor.isBot) throw new Error("还没轮到你");
      if (command === "action" && body.action) {
        applyGameAction(next, actor.id, body.action as GameAction);
        const isLocalHotSeat = localMode && hotspotRole === "off";
        if (isLocalHotSeat && next.status === "playing" && next.players[next.currentPlayer]?.isBot) {
          // 本地同屏：人机逐个"思考"再出牌，避免决策过快
          commitLocal(next);
          await resolveBotTurnsLocal(next);
          return { code: "LOCAL", version: 0, state: next } as RoomResponse;
        }
        runBotTurns(next);
        commitLocal(next);
        const humanCount = next.players.filter((p) => !p.isBot).length;
        const nextActor = next.players[next.currentPlayer];
        const handoff = next.status === "playing" && humanCount > 1 && nextActor && !nextActor.isBot && nextActor.id !== actor.id;
        setLocalPass(hotspotRole === "off" && handoff);
        return { code: "LOCAL", version: 0, state: next } as RoomResponse;
      }
      if (command === "chat" && body.phrase) {
        sendChat(next, actor.id, body.phrase as ChatPhrase);
        commitLocal(next);
        return { code: "LOCAL", version: 0, state: next } as RoomResponse;
      }
      throw new Error("未知操作");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      return null;
    } finally { setBusy(false); }
  }, [localState, commitLocal, hotspotRole, localMode, resolveBotTurnsLocal]);

  const request = useCallback(async (body: Record<string, unknown>) => {
    if (hotspotRole === "player") return playerRequest(body);
    if (localMode || hotspotRole === "host") return localRequest(body);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/room", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as RoomResponse;
      if (!response.ok) throw new Error(data.error || "操作失败");
      setServerRoom(data);
      if (data.token) {
        localStorage.setItem(`silk-token-${data.code}`, data.token);
        const player = data.playerId ? data.state.players.find((candidate) => candidate.id === data.playerId) : data.state.players.find((candidate) => candidate.name === name.trim());
        if (player) localStorage.setItem(`silk-player-${data.code}`, player.id);
      }
      window.history.replaceState({}, "", `#${data.code}`);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败");
      return null;
    } finally { setBusy(false); }
  }, [hotspotRole, playerRequest, localRequest, name]);

  const refresh = useCallback(async (code: string, quiet = false) => {
    if (localMode || hotspotRole !== "off") return;
    try {
      const response = await fetch(`/api/room?code=${code}`, { cache: "no-store" });
      const data = await response.json() as RoomResponse;
      if (!response.ok) throw new Error(data.error || "读取房间失败");
      setServerRoom((current) => !current || data.version >= current.version ? data : current);
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : "连接失败");
    }
  }, [localMode, hotspotRole]);

  useEffect(() => {
    const code = window.location.hash.slice(1).toUpperCase();
    if (code.length === 6) { setJoinCode(code); refresh(code, true); }
  }, [refresh]);

  useEffect(() => {
    if (!room?.code || localMode || hotspotRole !== "off") return;
    const timer = window.setInterval(() => refresh(room.code, true), 1500);
    return () => window.clearInterval(timer);
  }, [room?.code, refresh, localMode, hotspotRole]);

  useEffect(() => {
    if (!room?.state) return;
    const deltas = new Map<string, number>();
    room.state.players.forEach((p) => {
      const score = scorePlayer(p);
      const last = lastScores.current.get(p.id);
      if (last !== undefined && score !== last) deltas.set(p.id, score - last);
      lastScores.current.set(p.id, score);
    });
    if (deltas.size) setScoreDeltas(deltas);
  }, [room?.state]);

  useEffect(() => {
    if (!scoreDeltas.size) return;
    const timer = window.setTimeout(() => setScoreDeltas(new Map()), 1800);
    return () => window.clearTimeout(timer);
  }, [scoreDeltas]);

  useEffect(() => {
    if (!room?.code) return;
    const events = room.state.actionEvents ?? [];
    const latestId = events.at(-1)?.id ?? 0;
    if (observedRoomCode.current !== room.code) {
      observedRoomCode.current = room.code;
      observedEventId.current = latestId;
      setActionQueue([]);
      setActiveEvent(null);
      return;
    }
    const lastSeen = observedEventId.current ?? latestId;
    const fresh = events.filter((event) => event.id > lastSeen);
    observedEventId.current = latestId;
    if (fresh.length) setActionQueue((current) => [...current, ...fresh.filter((event) => !current.some((queued) => queued.id === event.id))]);
  }, [room?.code, room?.state.actionEvents]);

  useEffect(() => {
    if (activeEvent || !actionQueue.length) return;
    setActiveEvent(actionQueue[0]);
    setActionQueue((current) => current.slice(1));
  }, [activeEvent, actionQueue]);

  useEffect(() => {
    if (!activeEvent) return;
    const timer = window.setTimeout(() => setActiveEvent(null), 1100);
    return () => window.clearTimeout(timer);
  }, [activeEvent]);

  useEffect(() => {
    if (!mustDiscard || !pendingDiscard || activeEvent || actionQueue.length) return;
    setModal((current) => current?.kind === "discard"
      ? { ...current, required: pendingDiscard.count }
      : { kind: "discard", required: pendingDiscard.count, selection: zeroSpices() });
  }, [mustDiscard, pendingDiscard, activeEvent, actionQueue.length]);

  useEffect(() => {
    if (!room?.code) return;
    const events = room.state.chatEvents ?? [];
    const latestId = events.at(-1)?.id ?? 0;
    if (observedChatRoomCode.current !== room.code) {
      observedChatRoomCode.current = room.code;
      observedChatId.current = latestId;
      setChatQueue([]);
      setActiveChat(null);
      return;
    }
    const lastSeen = observedChatId.current ?? latestId;
    const fresh = events.filter((event) => event.id > lastSeen);
    observedChatId.current = latestId;
    if (fresh.length) setChatQueue((current) => [...current, ...fresh.filter((event) => !current.some((queued) => queued.id === event.id))]);
  }, [room?.code, room?.state.chatEvents]);

  useEffect(() => {
    if (activeChat || !chatQueue.length) return;
    setActiveChat(chatQueue[0]);
    setChatQueue((current) => current.slice(1));
  }, [activeChat, chatQueue]);

  useEffect(() => {
    if (!activeChat) return;
    const audioUrl = CHAT_AUDIO[activeChat.phrase];
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(() => speakChatPhrase(activeChat.phrase));
    } else {
      speakChatPhrase(activeChat.phrase);
    }
    const timer = window.setTimeout(() => setActiveChat(null), 2600);
    return () => window.clearTimeout(timer);
  }, [activeChat]);

  const sendAction = async (action: GameAction) => {
    if (!room) return;
    const result = await request({ command: "action", code: room.code, token, action });
    if (result) setModal(null);
  };

  const handleCard = (cardId: string) => {
    const card = MERCHANT_CARDS[cardId];
    if (!isMyTurn || !card || !me) return;
    if (card.type === "produce") sendAction({ type: "PLAY", cardId });
    else if (card.type === "upgrade") setModal({ kind: "upgrade", cardId, choices: [] });
    else {
      let max = 20;
      card.cost.forEach((n, i) => { if (n) max = Math.min(max, Math.floor(me.spices[i] / n)); });
      if (max < 1) { setError("香料不足，无法完成这笔交易"); return; }
      setModal({ kind: "trade", cardId, times: 1 });
    }
  };

  const acquire = (marketIndex: number) => {
    if (!isMyTurn || !me) return;
    if (marketIndex === 0) sendAction({ type: "ACQUIRE", marketIndex, payment: zeroSpices() });
    else if (me.spices.reduce((a, b) => a + b, 0) < marketIndex) setError("没有足够的香料支付市场位置费用");
    else setModal({ kind: "acquire", marketIndex, payment: zeroSpices() });
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${room?.code}`);
    setCopied(true); window.setTimeout(() => setCopied(false), 1400);
  };

  const startLocalGame = () => {
    const pname = name.trim() || "玩家一";
    setLocalMode(true);
    setLocalState(createLobby(pname, maxPlayers, "local-host"));
    setServerRoom(null);
  };

  const exitGame = () => {
    window.location.hash = "";
    setServerRoom(null);
    setLocalState(null);
    setLocalMode(false);
    setLocalPass(false);
    setHotspotRole("off");
    setPlayerState(null);
    setMyPlayerId("");
    setPlayerStatus("");
    setPlayerAnswerCode("");
    setPlayerQr("");
    setHostPairings([]);
    setHostConnections([]);
    playerChannelRef.current = null;
    hotspotConns.current.clear();
  };

  const reconnectKnownPlayer = async () => {
    if (!room) return;
    const storedToken = localStorage.getItem(`silk-token-${room.code}`);
    if (!storedToken) { setServerRoom(null); return; }
    const playerId = localStorage.getItem(`silk-player-${room.code}`);
    const player = room.state.players.find((p) => p.id === playerId);
    if (player) { setName(player.name); return; }
    setServerRoom(null);
  };

  if (hotspotRole === "player" && !playerState) {
    return <main className={`lobby-shell theme-${visualTheme}`}>
      <section className="hotspot-panel">
        <p className="eyebrow">📶 加入热点房</p>
        <h1>连接房主</h1>
        {playerStatus && <div className="player-status">{playerStatus}</div>}
        <label>我的昵称<input value={playerName} maxLength={12} onChange={(e) => setPlayerName(e.target.value)} placeholder="游戏中显示的名字" /></label>
        <label>房主邀请码<textarea value={hostCodeInput} rows={4} onChange={(e) => setHostCodeInput(e.target.value)} placeholder="粘贴房主的邀请码（或用手机相机扫房主屏幕的二维码后复制）" /></label>
        {!playerAnswerCode && <button className="primary wide" disabled={busy || !playerName.trim() || !hostCodeInput.trim()} onClick={connectToHost}>连接</button>}
        {playerAnswerCode && <div className="answer-box">
          <p>请把下面的 <strong>应答码</strong> 告诉房主并让他输入（或让房主扫你的二维码）</p>
          {playerQr && <img className="pairing-qr" src={playerQr} alt="应答码二维码" />}
          <div className="code-block">{playerAnswerCode}</div>
          <button className="primary wide" onClick={() => navigator.clipboard.writeText(playerAnswerCode).then(() => setCopied(true))}>{copied ? "已复制" : "复制应答码"}</button>
          <p className="hint">房主确认后会自动连接并进入房间</p>
        </div>}
        {error && <div className="error-box">{error}</div>}
        <button className="text-button" onClick={exitGame}>返回</button>
      </section>
    </main>;
  }

  if (!room || (!me && room.state.status !== "lobby")) {
    return <main className="landing-shell">
      <div className="brand-mark">丝路</div>
      <section className="landing-copy">
        <p className="eyebrow">在线香料贸易桌游</p>
        <h1>香料商路</h1>
        <p>招募商人，转换香料，抢先完成高分订单。</p>
        <div className="rule-pills"><span>2–5 人</span><span>约 20 分钟</span><span>浏览器联机</span></div>
      </section>
      <section className="entry-card">
        {!CARD_CATALOG_READY && <div className="catalog-notice"><b>卡牌库整理中</b><span>旧卡已全部移除，等待录入新卡。</span></div>}
        {!account && <div className="auth-tabs" role="tablist" aria-label="登录方式">
          {(["guest", "login", "register"] as AuthMode[]).map((mode) => <button role="tab" aria-selected={authMode === mode} className={authMode === mode ? "active" : ""} key={mode} onClick={() => { setAuthMode(mode); setAuthError(""); }}>{mode === "guest" ? "游客" : mode === "login" ? "账号登录" : "注册"}</button>)}
        </div>}
        {!authReady && <div className="auth-loading">正在读取登录状态…</div>}
        {authReady && account && <div className="account-card">
          <button className="profile-avatar" aria-label="更换头像" onClick={() => setShowAvatarPicker((visible) => !visible)}>{account.avatar}<small>更换</small></button>
          <div><b>{account.nickname}</b><span>@{account.username}</span></div>
          <button className="account-logout" disabled={authBusy} onClick={() => accountRequest("logout")}>退出</button>
          {showAvatarPicker && <div className="avatar-picker" aria-label="选择头像">{PROFILE_AVATARS.map((avatar) => <button aria-pressed={account.avatar === avatar} key={avatar} disabled={authBusy} onClick={() => accountRequest("avatar", avatar)}>{avatar}</button>)}</div>}
        </div>}
        {authReady && !account && authMode === "login" && <div className="auth-form">
          <label>账号<input value={username} maxLength={24} autoComplete="username" onChange={(event) => setUsername(event.target.value)} placeholder="字母、数字或下划线" /></label>
          <label>密码<input type="password" value={password} maxLength={72} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" /></label>
          <button className="primary wide" disabled={authBusy || !username.trim() || !password} onClick={() => accountRequest("login")}>登录账号</button>
        </div>}
        {authReady && !account && authMode === "register" && <div className="auth-form">
          <label>账号<input value={username} maxLength={24} autoComplete="username" onChange={(event) => setUsername(event.target.value)} placeholder="3–24 位字母、数字或下划线" /></label>
          <label>密码<input type="password" value={password} maxLength={72} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" /></label>
          <label>昵称<input value={registerNickname} maxLength={12} onChange={(event) => setRegisterNickname(event.target.value)} placeholder="游戏中显示的名字" /></label>
          <button className="primary wide" disabled={authBusy || !username.trim() || password.length < 6 || !registerNickname.trim()} onClick={() => accountRequest("register")}>注册并登录</button>
        </div>}
        {authReady && (account || authMode === "guest") && <div className="game-entry-fields">
          {!account && <label>游客昵称<input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} placeholder="商队领队" /></label>}
          <div className="create-row">
            <label>人数<select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
              {[2, 3, 4, 5].map((n) => <option value={n} key={n}>{n} 人</option>)}
            </select></label>
            <button className="primary" disabled={busy || !name.trim()} onClick={() => request({ command: "create", name, maxPlayers })}>创建房间</button>
          </div>
          <div className="divider"><span>或加入朋友</span></div>
          <div className="join-row">
            <input aria-label="房间码" value={joinCode} maxLength={6} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="六位房间码" />
            <button disabled={busy || !name.trim() || joinCode.length !== 6} onClick={() => request({ command: "join", name, code: joinCode })}>加入</button>
          </div>
          <div className="divider"><span>或离线游玩</span></div>
          <button className="primary wide offline-entry" onClick={startLocalGame}>✈️ 离线游戏（飞机模式）<small>无需网络 · 可对战人机或同屏轮流</small></button>
          <div className="divider"><span>或热点联机（无外网多设备）</span></div>
          <div className="hotspot-entries">
            <button className="primary wide" onClick={startHostMode} disabled={busy}>📡 当房主<small>开热点，生成配对码让朋友加入</small></button>
            <button className="primary wide ghost" onClick={startPlayerSetup}>📶 加入热点房<small>扫码或输入房主邀请码</small></button>
          </div>
        </div>}
        {room && !me && room.state.status === "lobby" && <button className="text-button" onClick={reconnectKnownPlayer}>返回已有席位</button>}
        {authError && <div className="error-box">{authError}</div>}
        {error && <div className="error-box">{error}</div>}
        <button className="rules-link" onClick={() => setShowRules(true)}><span>◎</span> 查看规则说明书</button>
      </section>
      <footer>非官方玩法原型 · 使用原创界面与牌面</footer>
      {showRules && <RulesGuide onClose={() => setShowRules(false)} />}
    </main>;
  }

  if (!me) {
    return <main className="landing-shell"><section className="entry-card"><h2>加入房间 {room.code}</h2>
      <label>你的昵称<input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} placeholder="商队领队" /></label>
      <button className="primary wide" disabled={!name.trim() || busy} onClick={() => request({ command: "join", name, code: room.code })}>加入商队</button>
      {error && <div className="error-box">{error}</div>}
    </section></main>;
  }

  if (room.state.status === "lobby") {
    const isHost = me.id === room.state.hostId;
    return <main className={`lobby-shell theme-${visualTheme}`}>
      <header className="topbar"><div className="wordmark">香料商路</div><div className="header-actions"><ThemeSwitcher value={visualTheme} onChange={setVisualTheme} />{localMode ? <span className="offline-badge">✈️ 离线模式</span> : hotspotRole === "host" ? <span className="offline-badge">📡 热点房主</span> : hotspotRole === "player" ? <span className="offline-badge">📶 热点玩家</span> : <button className="room-code" onClick={copyInvite}><small>房间码</small>{room.code}<span>{copied ? "已复制" : "复制邀请"}</span></button>}</div></header>
      <section className="lobby-panel">
        <p className="eyebrow">等待商队集结</p><h1>{room.state.players.length} / {room.state.maxPlayers} 位玩家</h1>
        <div className="seats">
          {Array.from({ length: room.state.maxPlayers }).map((_, i) => {
            const player = room.state.players[i];
            return <div className={`seat ${player ? "filled" : ""}`} key={i}>
              <span className="avatar" style={{ background: player?.color }}>{player ? player.avatar ?? player.name.slice(0, 1) : i + 1}</span>
              <div><b>{player?.name ?? "等待加入"}</b><small>{player?.id === room.state.hostId ? "房主" : player?.isBot ? `${botLabels[player.botDifficulty ?? "normal"]}人机` : player ? "已就绪" : "空席位"}</small></div>
              {isHost && player?.isBot && <button className="remove-bot" disabled={busy} onClick={() => request({ command: "removeBot", code: room.code, token, botId: player.id })}>移除</button>}
            </div>;
          })}
        </div>
        {hotspotRole === "host" && <section className="hotspot-host-panel">
          <div className="hotspot-head"><b>📡 热点配对</b><small>朋友连上你的热点后，扫码或输入邀请码加入</small></div>
          <button className="primary" disabled={busy || room.state.players.length >= room.state.maxPlayers} onClick={addHostPairing}>生成配对码</button>
          {hostPairings.map((pairing) => <div className="pairing-card" key={pairing.id}>
            <div className="pairing-qr">{pairing.qr && <img src={pairing.qr} alt="邀请码二维码" />}</div>
            <div className="pairing-actions">
              <div className="code-block">{pairing.offerCode}</div>
              <div className="pairing-buttons">
                <button disabled={!pairing.offerCode} onClick={() => navigator.clipboard.writeText(pairing.offerCode).then(() => setCopied(true))}>{copied ? "已复制" : "复制邀请码"}</button>
                {pairing.status === "connected" && <span className="pairing-status ok">已连接</span>}
                {pairing.status === "failed" && <span className="pairing-status bad">已断开</span>}
              </div>
              {pairing.status === "waiting" && <div className="answer-row">
                <input value={pairing.answerInput} onChange={(e) => setHostPairings((list) => list.map((p) => p.id === pairing.id ? { ...p, answerInput: e.target.value } : p))} placeholder="粘贴玩家的应答码" />
                <button disabled={busy || !pairing.answerInput.trim()} onClick={() => acceptPairingAnswer(pairing.id, pairing.answerInput)}>确认连接</button>
              </div>}
            </div>
          </div>)}
          {hostConnections.length > 0 && <div className="host-players"><b>已连接玩家</b>{hostConnections.map((c) => <span key={c.id}>{c.name}</span>)}</div>}
        </section>}
        {isHost && <div className="bot-controls">
          <div><b>添加人机对手</b><small>可与真人混合对战</small></div>
          {(["easy", "normal", "hard"] as BotDifficulty[]).map((difficulty) => <button key={difficulty} disabled={busy || room.state.players.length >= room.state.maxPlayers} onClick={() => request({ command: "addBot", code: room.code, token, difficulty })}>{botLabels[difficulty]}</button>)}
        </div>}
        {localMode && isHost && <div className="local-add-row">
          <input aria-label="同屏玩家昵称" value={localAddName} maxLength={12} placeholder="同屏玩家昵称（传设备轮流玩）" onChange={(e) => setLocalAddName(e.target.value)} />
          <button disabled={busy || !localAddName.trim() || room.state.players.length >= room.state.maxPlayers} onClick={() => { request({ command: "join", name: localAddName.trim() }); setLocalAddName(""); }}>添加同屏玩家</button>
        </div>}
        {!CARD_CATALOG_READY && <div className="catalog-lobby-note">卡牌已清空，等待新卡录入后开放游戏。</div>}
        {isHost ? <button className="primary start-button" disabled={busy || room.state.players.length < 2 || !CARD_CATALOG_READY} onClick={() => request({ command: "start", code: room.code, token })}>{CARD_CATALOG_READY ? "开始游戏" : "等待卡牌录入"}</button>
          : <div className="waiting-pulse"><i />等待房主开始游戏</div>}
        {error && <div className="error-box">{error}</div>}
      </section>
    </main>;
  }

  if (!CARD_CATALOG_READY) {
    return <main className={`catalog-shell theme-${visualTheme}`}>
      <section className="catalog-empty-state"><div className="empty-card-stack"><i /><i /><i /></div><p className="eyebrow">卡牌库整理中</p><h1>所有旧卡已移除</h1><p>当前对局已暂停。等待新卡片按顺序录入后，即可重新开始游戏。</p><button className="primary" onClick={exitGame}>返回首页</button></section>
    </main>;
  }

  if (botThinking) {
    return <main className={`lobby-shell theme-${visualTheme}`}>
      <section className="bot-thinking">
        <div className="bot-avatar">🤖</div>
        <h2>AI 思考中…</h2>
        <p>人机正在决定行动，请稍候</p>
      </section>
    </main>;
  }

  if (localMode && localPass && room.state.status === "playing" && me && !me.isBot) {
    return <main className={`lobby-shell theme-${visualTheme}`}>
      <section className="pass-screen">
        <span className="avatar big" style={{ background: me.color }}>{me.avatar ?? me.name.slice(0, 1)}</span>
        <p className="eyebrow">轮到你了</p>
        <h1>{me.name}</h1>
        <p>请把设备交给 <b>{me.name}</b>，其他人先别看屏幕</p>
        <button className="primary" onClick={() => setLocalPass(false)}>开始回合</button>
        {error && <div className="error-box">{error}</div>}
      </section>
    </main>;
  }

  const state = room.state;
  const current = state.players[state.currentPlayer];
  const ranking = [...state.players].sort((a, b) => scorePlayer(b) - scorePlayer(a));
  const latestActions = new Map<string, ActionEvent>();
  (state.actionEvents ?? []).forEach((event) => latestActions.set(event.playerId, event));
  const totalPlayers = state.players.length;
  const seatSlot = (index: number): string | null => {
    const seat = (index - myIndex + totalPlayers) % totalPlayers;
    if (seat === 0) return null;
    return (TABLE_SLOTS[totalPlayers] ?? ["top"])[seat - 1] ?? "top";
  };

  return <main className={`game-shell theme-${visualTheme}`}>
    <header className="game-header">
      <div className="wordmark">香料商路</div>
      <div className="round-info"><span>第 {state.round} 轮</span><b>{state.status === "finished" ? "结算" : mustDiscard ? "请选择放回的香料" : isMyTurn ? "轮到你行动" : `等待 ${current.name}`}</b>{state.finalRound && <em>最后一轮</em>}</div>
      <div className="header-actions"><ThemeSwitcher value={visualTheme} onChange={setVisualTheme} />{localMode ? <span className="offline-badge mini">✈️ 离线</span> : hotspotRole !== "off" ? <span className="offline-badge mini">{hotspotRole === "host" ? "📡 房主" : "📶 热点"}</span> : <button className="room-code mini" onClick={copyInvite}><small>房间</small>{state.status === "finished" ? "战报" : room.code}</button>}</div>
    </header>

    <section className="table">
      <section className="board">
        <div className="market-heading"><div><span>订单市场</span><small>支付香料，赢取声望</small></div><div className="coin-bank"><span className="coin gold">{state.goldSupply}</span><span className="coin silver">{state.silverSupply}</span></div></div>
        <div className="orders-row">
          {state.orderMarket.map((id, index) => <button className="order-card" key={id} disabled={!isMyTurn || !canAfford(me.spices, ORDER_CARDS[id].cost)} onClick={() => sendAction({ type: "CLAIM", orderIndex: index })}>
            {index === 0 && state.goldSupply > 0 && <span className="coin-float gold">+3</span>}
            {((index === 1 && state.goldSupply > 0) || (index === 0 && state.goldSupply === 0)) && state.silverSupply > 0 && <span className="coin-float silver">+1</span>}
            <OrderFace orderId={id} />
          </button>)}
        </div>

        <div className="market-heading merchant-title"><div><span>商人市场</span><small>越靠右，招募费用越高</small></div></div>
        <div className="merchant-row">
          {state.merchantMarket.map((slot, index) => <button className={`merchant-card market-card card-${MERCHANT_CARDS[slot.cardId].type}`} disabled={!isMyTurn} key={slot.cardId} onClick={() => acquire(index)}>
            <span className="market-cost">{index === 0 ? "免费" : `支付 ${index}`}</span>
            <MerchantFace card={MERCHANT_CARDS[slot.cardId]} bonus={slot.bonus} />
          </button>)}
        </div>
      </section>

      <div className="seats-layer">
        {state.players.map((p, index) => {
          const slot = seatSlot(index);
          if (!slot) return null;
          return <div className={`player-seat ${slot} ${index === state.currentPlayer && state.status === "playing" ? "active" : ""}`} key={p.id}>
            <div className={`player-strip ${p.id === me.id ? "me" : ""}`}>
              <span className="avatar" style={{ background: p.color }}>{p.avatar ?? p.name.slice(0, 1)}</span>
              <div className="player-meta">
                <b>{p.name}{p.isBot && <small> · {p.afkSince ? "AI代管中" : `${botLabels[p.botDifficulty ?? "normal"]}人机`}</small>}</b>
                <SpiceRow values={p.spices} />
                <div className="seat-sub"><span className="coin small gold">{p.gold}</span><span className="coin small silver">{p.silver}</span></div>
              </div>
              <div className="player-score"><b>{scorePlayer(p)}<small className="score-unit">分</small></b><small>{p.orders.length} 单</small>{scoreDeltas.has(p.id) && scoreDeltas.get(p.id)! > 0 && <em className="score-delta">+{scoreDeltas.get(p.id)}</em>}</div>
              {hotspotRole === "host" && p.id !== hostSelfId && !p.isBot && state.status === "playing" && <button className="afk-kick" onClick={() => markPlayerAfk(p.id)}>代管</button>}
            </div>
            {latestActions.has(p.id) && <LastActionBadge event={latestActions.get(p.id)!} />}
            {activeChat?.playerId === p.id && <div className="player-speech"><b>{activeChat.phrase}</b><span>🔊</span></div>}
          </div>;
        })}
      </div>

      <aside className="game-log"><b>商路动态</b>{state.log.slice(-7).reverse().map((line, i) => <p key={`${line}-${i}`}>{line}</p>)}</aside>
    </section>

    <section className="me-area">
      {activeChat?.playerId === me.id && <div className="player-speech me-speech"><b>{activeChat.phrase}</b><span>🔊</span></div>}
      <div className="me-strip">
        <span className="avatar" style={{ background: me.color }}>{me.avatar ?? me.name.slice(0, 1)}</span>
        <div className="player-meta"><b>{me.name}<small> 你</small></b><span className="me-score">{scorePlayer(me)} 分 · {me.orders.length} 单{scoreDeltas.has(me.id) && scoreDeltas.get(me.id)! > 0 && <em className="score-delta"> +{scoreDeltas.get(me.id)}</em>}</span></div>
        <div className="quick-chat"><b>语音快捷聊</b><div className="quick-chat-row">{CHAT_PHRASES.map((phrase) => <button disabled={busy} key={phrase} onClick={() => request({ command: "chat", code: room.code, token, phrase: phrase as ChatPhrase })}><span>🔊</span>{phrase}</button>)}</div></div>
      </div>
      <section className="hand-panel">
        <div className="hand-head"><div><span>你的商队</span><SpiceRow values={me.spices} /></div><div className="wallet"><span className="coin gold">{me.gold}</span><span className="coin silver">{me.silver}</span></div></div>
        <div className="hand-row">
          {me.hand.map((cardId) => <button className={`merchant-card hand-card card-${MERCHANT_CARDS[cardId].type}`} disabled={!isMyTurn} key={cardId} onClick={() => handleCard(cardId)}><MerchantFace card={MERCHANT_CARDS[cardId]} /></button>)}
          {!me.hand.length && <div className="empty-hand">手牌已全部打出</div>}
        </div>
        <button className="rest-button" disabled={!isMyTurn || !me.played.length} onClick={() => sendAction({ type: "REST" })}><span>☾</span>休息并收回 {me.played.length} 张牌</button>
      </section>
    </section>

{error && <div className="toast" onClick={() => setError("")}>{error}</div>}
    {activeEvent && <ActionReveal key={activeEvent.id} event={activeEvent} />}
    {modal && <ActionModal modal={modal} setModal={setModal} meSpices={me.spices} onConfirm={sendAction} busy={busy} />}
    {state.status === "finished" && <div className="result-backdrop"><section className="result-card"><p className="eyebrow">商路结算</p><h1>{state.winnerIds.includes(me.id) ? "你赢得了商路盛誉" : `${ranking[0].name} 赢得了胜利`}</h1>
      <div className="ranking">{ranking.map((p, i) => <div className={state.winnerIds.includes(p.id) ? "winner" : ""} key={p.id}><span>{i + 1}</span><i className="avatar" style={{ background: p.color }}>{p.avatar ?? p.name.slice(0, 1)}</i><b>{p.name}</b><small>{p.orders.length} 张订单</small><strong>{scorePlayer(p)} 分</strong></div>)}</div>
      <button className="primary" onClick={exitGame}>返回首页</button>
    </section></div>}
  </main>;
}

function ActionModal({ modal, setModal, meSpices, onConfirm, busy }: {
  modal: Modal; setModal: (modal: Modal | null) => void; meSpices: Spices;
  onConfirm: (action: GameAction) => void; busy: boolean;
}) {
  const card = modal.kind === "trade" || modal.kind === "upgrade" ? MERCHANT_CARDS[modal.cardId] : null;
  const paymentTotal = modal.kind === "acquire" ? modal.payment.reduce((a, b) => a + b, 0) : 0;
  const discardTotal = modal.kind === "discard" ? modal.selection.reduce((a, b) => a + b, 0) : 0;
  const upgradePreview = useMemo(() => {
    const result = [...meSpices] as Spices;
    if (modal.kind === "upgrade") modal.choices.forEach((tier) => { result[tier] -= 1; result[tier + 1] += 1; });
    return result;
  }, [meSpices, modal]);

  return <div className="modal-backdrop" onMouseDown={(e) => { if (modal.kind !== "discard" && e.currentTarget === e.target) setModal(null); }}><section className="action-modal">
    {modal.kind !== "discard" && <button className="close" aria-label="关闭" onClick={() => setModal(null)}>×</button>}
    {modal.kind === "trade" && card?.type === "trade" && <>
      <p className="eyebrow">重复交易</p><h2>选择交易次数</h2>
      <div className="modal-rule"><SpiceRow values={card.cost} /><Arrow /><SpiceRow values={card.gain} /></div>
      <div className="stepper"><button onClick={() => setModal({ ...modal, times: Math.max(1, modal.times - 1) })}>−</button><b>{modal.times} 次</b><button disabled={!canAfford(meSpices, card.cost, modal.times + 1)} onClick={() => setModal({ ...modal, times: modal.times + 1 })}>＋</button></div>
      <button className="primary wide" disabled={busy} onClick={() => onConfirm({ type: "PLAY", cardId: modal.cardId, times: modal.times })}>确认交易</button>
    </>}
    {modal.kind === "upgrade" && card?.type === "upgrade" && <>
      <p className="eyebrow">香料升级</p><h2>还可选择 {card.amount - modal.choices.length} 次</h2>
      <div className="upgrade-preview"><SpiceRow values={meSpices} /><Arrow /><SpiceRow values={upgradePreview} /></div>
      <div className="upgrade-options">{[0, 1, 2].map((tier) => <button key={tier} disabled={modal.choices.length >= card.amount || upgradePreview[tier] < 1} onClick={() => setModal({ ...modal, choices: [...modal.choices, tier as Spice] })}><i className={`gem ${spiceClass[tier]}`} />升级{SPICE_NAMES[tier]}</button>)}</div>
      {modal.choices.length > 0 && <button className="undo" onClick={() => setModal({ ...modal, choices: modal.choices.slice(0, -1) })}>撤回上一步</button>}
      <button className="primary wide" disabled={busy || !modal.choices.length} onClick={() => onConfirm({ type: "PLAY", cardId: modal.cardId, upgrades: modal.choices })}>确认升级</button>
    </>}
    {modal.kind === "acquire" && <>
      <p className="eyebrow">市场费用</p><h2>选择 {modal.marketIndex} 个香料</h2>
      <p className="modal-help">这些香料会依次留在左侧商人牌上。</p>
      <div className="payment-options">{meSpices.map((count, tier) => <button key={tier} disabled={count <= modal.payment[tier] || paymentTotal >= modal.marketIndex} onClick={() => { const payment = [...modal.payment] as Spices; payment[tier] += 1; setModal({ ...modal, payment }); }}><i className={`gem ${spiceClass[tier]}`} /><span>{SPICE_NAMES[tier]}</span><b>{modal.payment[tier]} / {count}</b></button>)}</div>
      <button className="undo" disabled={!paymentTotal} onClick={() => setModal({ ...modal, payment: zeroSpices() })}>重新选择</button>
      <button className="primary wide" disabled={busy || paymentTotal !== modal.marketIndex} onClick={() => onConfirm({ type: "ACQUIRE", marketIndex: modal.marketIndex, payment: modal.payment })}>确认招募</button>
    </>}
    {modal.kind === "discard" && <>
      <p className="eyebrow">商队容量上限</p><h2>选择放回 {modal.required} 个香料</h2>
      <p className="modal-help">你的商队最多携带10个香料。可以自由选择放回哪些香料。</p>
      <div className="payment-options">{meSpices.map((count, tier) => <button key={tier} disabled={count <= modal.selection[tier] || discardTotal >= modal.required} onClick={() => { const selection = [...modal.selection] as Spices; selection[tier] += 1; setModal({ ...modal, selection }); }}><i className={`gem ${spiceClass[tier]}`} /><span>{SPICE_NAMES[tier]}</span><b>{modal.selection[tier]} / {count}</b></button>)}</div>
      <button className="undo" disabled={!discardTotal} onClick={() => setModal({ ...modal, selection: zeroSpices() })}>重新选择</button>
      <button className="primary wide" disabled={busy || discardTotal !== modal.required} onClick={() => onConfirm({ type: "DISCARD", spices: modal.selection })}>确认放回</button>
    </>}
  </section></div>;
}
