"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { AirplaneGuest, AirplaneHost } from "../lib/airplane";
import {
  ActionEvent, BotDifficulty, canAfford, CARD_CATALOG_READY, CHAT_PHRASES, ChatEvent, ChatPhrase, describeMerchant, GameAction, GameState, MerchantCard, MERCHANT_CARDS,
  ORDER_CARDS, scorePlayer, Spice, Spices, SPICE_NAMES, zeroSpices,
} from "../lib/game";
import { isPhotoAvatar, PROFILE_AVATARS, ProfileAvatar } from "../lib/profile";

type RoomResponse = { code: string; version: number; token?: string; playerId?: string; state: GameState; error?: string };
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

function AvatarFace({ avatar, name, color, fallback }: { avatar?: string; name: string; color?: string; fallback?: string }) {
  if (avatar && avatar.startsWith("data:image/")) {
    return <span className="avatar" style={{ background: color }}><img src={avatar} alt={name} /></span>;
  }
  return <span className="avatar" style={{ background: color }}>{avatar ?? fallback ?? name.slice(0, 1)}</span>;
}

function PhotoCropModal({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: (dataUrl: `data:image/${string}`) => void }) {
  const CROP = 260;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      const min = Math.max(CROP / image.naturalWidth, CROP / image.naturalHeight);
      setZoom(Math.ceil(min * 100) / 100);
      setOffset({ x: 0, y: 0 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const minZoom = img ? Math.max(CROP / img.naturalWidth, CROP / img.naturalHeight) : 1;
  const maxZoom = Math.max(minZoom * 4, minZoom + 0.5);

  const clamp = (z: number, off: { x: number; y: number }) => {
    if (!img) return off;
    const maxX = Math.max(0, (img.naturalWidth * z - CROP) / 2);
    const maxY = Math.max(0, (img.naturalHeight * z - CROP) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, off.x)), y: Math.min(maxY, Math.max(-maxY, off.y)) };
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => {
        const next = Math.min(maxZoom, Math.max(minZoom, current * (event.deltaY < 0 ? 1.12 : 0.89)));
        setOffset((off) => clamp(next, off));
        return next;
      });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(event.pointerId);
    if (!prev) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size === 1) {
      setOffset((off) => clamp(zoom, { x: off.x + next.x - prev.x, y: off.y + next.y - prev.y }));
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0) {
        const factor = dist / pinchDist.current;
        setZoom((current) => {
          const next = Math.min(maxZoom, Math.max(minZoom, current * factor));
          setOffset((off) => clamp(next, off));
          return next;
        });
      }
      pinchDist.current = dist;
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDist.current = 0;
    if (pointers.current.size === 0) setDragging(false);
  };

  const confirm = () => {
    if (!img) return;
    const z = zoom;
    const srcSize = CROP / z;
    const srcX = img.naturalWidth / 2 - offset.x / z - srcSize / 2;
    const srcY = img.naturalHeight / 2 - offset.y / z - srcSize / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, 128, 128);
    onConfirm(canvas.toDataURL("image/jpeg", 0.85) as `data:image/${string}`);
  };

  return (
    <div className="photo-crop-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}>
      <section className="photo-crop-modal" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title">
        <h2 id="photo-crop-title">调整照片</h2>
        <p className="photo-crop-hint">拖动照片移动，滑杆或双指缩放；圆形内即最终头像区域</p>
        <div className={`crop-stage ${dragging ? "dragging" : ""}`} ref={stageRef}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer}>
          {img && <img className="crop-img" src={img.src} alt="头像照片" draggable={false}
            style={{ width: img.naturalWidth, height: img.naturalHeight, transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }} />}
          <div className="crop-ring" />
        </div>
        <input className="crop-zoom" type="range" min={minZoom} max={maxZoom} step={0.01} value={zoom} disabled={!img} aria-label="缩放照片"
          onChange={(event) => { const next = Number(event.target.value); setZoom(next); setOffset((off) => clamp(next, off)); }} />
        <div className="photo-crop-actions">
          <button className="photo-crop-cancel" onClick={onCancel}>取消</button>
          <button className="photo-crop-confirm" disabled={!img} onClick={confirm}>使用此区域</button>
        </div>
      </section>
    </div>
  );
}

function QrCode({ text, size = 230 }: { text: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, text, { width: size, margin: 1, errorCorrectionLevel: "L" }, (error) => { if (error) console.error(error); });
  }, [text, size]);
  return <canvas ref={ref} className="qr-canvas" />;
}

function FullscreenQr({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <div className="qr-fullscreen" onClick={onClose}>
      <p className="qr-fullscreen-title">{title}</p>
      <QrCode text={text} size={Math.min(480, Math.floor(window.innerWidth * 0.92))} />
      <button onClick={onClose}>关闭</button>
    </div>
  );
}

function QrScanner({ label, onDetect, onCancel }: { label: string; onDetect: (text: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState("");
  const onDetectRef = useRef(onDetect);
  useEffect(() => { onDetectRef.current = onDetect; }, [onDetect]);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (!video || !video.videoWidth || !ctx) { raf = requestAnimationFrame(tick); return; }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      try {
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(frame.data, frame.width, frame.height);
        if (result?.data) { onDetectRef.current(result.data); return; }
      } catch { /* 忽略单帧失败 */ }
      raf = requestAnimationFrame(tick);
    };
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持摄像头扫码");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((media) => {
        if (stopped) { media.getTracks().forEach((track) => track.stop()); return; }
        stream = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
          void videoRef.current.play();
          raf = requestAnimationFrame(tick);
        }
      })
      .catch((scanError) => setError("无法打开摄像头：" + (scanError instanceof Error ? scanError.message : String(scanError))));
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  return (
    <div className="qr-scanner">
      <div className="qr-scanner-head"><b>{label}</b><button aria-label="关闭扫码" onClick={onCancel}>×</button></div>
      <div className="qr-scanner-body"><video ref={videoRef} playsInline muted /><span className="qr-frame" /></div>
      {error ? <p className="qr-scanner-error">{error}</p> : <p className="qr-scanner-hint">将二维码放入框内，自动识别</p>}
      <button className="qr-scanner-cancel" onClick={onCancel}>取消</button>
    </div>
  );
}

function AirplaneInviteModal({ host, onClose }: { host: AirplaneHost; onClose: () => void }) {
  const [invite, setInvite] = useState("");
  const [scanner, setScanner] = useState(false);
  const [pasteAnswer, setPasteAnswer] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [message, setMessage] = useState("");
  const [peers, setPeers] = useState(0);
  const [players, setPlayers] = useState(host.playerCount);
  useEffect(() => {
    const offPeers = host.onPeers(setPeers);
    const offState = host.onState(() => setPlayers(host.playerCount));
    return () => { offPeers(); offState(); };
  }, [host]);
  const makeInvite = async () => {
    try {
      setInvite(await host.createInvite());
      setMessage("");
    } catch (inviteError) {
      setMessage(inviteError instanceof Error ? inviteError.message : "生成邀请失败");
    }
  };
  const onScanned = async (text: string) => {
    setScanner(false);
    await applyAnswer(text);
  };
  const applyAnswer = async (text: string) => {
    try {
      await host.acceptAnswer(text.trim());
      setInvite("");
      setPasteAnswer("");
      setMessage(`✓ 已连接一位玩家（当前房间 ${players + 1} 人）`);
    } catch (scanError) {
      setMessage(scanError instanceof Error ? scanError.message : "连接失败，请重试");
    }
  };
  const copyInvite = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setMessage("邀请码已复制，请发送给对方粘贴");
    } catch {
      setMessage("复制失败，请长按下方邀请码手动复制");
    }
  };
  const shareInvite = async () => {
    if (!invite) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(invite)}`;
    try {
      if (navigator.share) await navigator.share({ title: "香料商路 · 离线联机邀请", text: invite, url: shareUrl });
      else await copyInvite();
    } catch {
      /* 用户取消分享 */
    }
  };
  return (
    <div className="photo-crop-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="airplane-invite" role="dialog" aria-modal="true" aria-labelledby="airplane-invite-title">
        <h2 id="airplane-invite-title">✈️ 邀请玩家加入</h2>
        <p className="photo-crop-hint">房主开启手机热点，其他玩家连接热点后：① 点「生成邀请码」让对方扫码；② 对方扫码后生成回执，房主再扫对方手机上的回执。全程无需互联网。</p>
        <div className="invite-steps">
          <div className="invite-step"><b>1</b><div><span>每位玩家生成一份邀请码</span><button className="primary" onClick={makeInvite}>{invite ? "重新生成" : "生成邀请二维码"}</button></div></div>
          {invite && <div className="invite-qr"><QrCode text={invite} /><button className="qr-fullscreen-btn" onClick={() => setFullscreen(true)}>🔍 全屏二维码（更好扫）</button><p className="invite-code">{invite}</p></div>}
          {invite && <div className="invite-share-row"><button onClick={() => void copyInvite()}>复制邀请码</button><button onClick={() => void shareInvite()}>📤 系统分享</button></div>}
          <div className="invite-step"><b>2</b><div><span>玩家连接后会生成回执，房主扫描或粘贴回执完成连接</span><button onClick={() => setScanner(true)}>📷 扫描回执</button></div></div>
          <div className="invite-paste-answer">
            <textarea className="invite-paste" value={pasteAnswer} rows={3} onChange={(event) => setPasteAnswer(event.target.value)} placeholder="或把对方发来的回执粘贴到这里" />
            <button className="primary wide" disabled={!pasteAnswer.trim() || !invite} onClick={() => void applyAnswer(pasteAnswer)}>粘贴并连接</button>
          </div>
        </div>
        <div className="invite-status">已连接设备：{peers} · 房间内玩家：{players}/{host.maxPlayers}</div>
        {message && <p className="invite-message">{message}</p>}
        <button className="primary wide" onClick={onClose}>完成</button>
      </section>
      {scanner && <QrScanner label="扫描加入者回执" onDetect={onScanned} onCancel={() => setScanner(false)} />}
      {fullscreen && <FullscreenQr title="房主邀请码 · 让加入者扫描" text={invite} onClose={() => setFullscreen(false)} />}
    </div>
  );
}

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
      <div className="action-player"><AvatarFace avatar={event.playerAvatar} name={event.playerName} color={event.playerColor} /><div><b>{event.playerName}</b><small>{label}</small></div></div>
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
  const [room, setRoom] = useState<RoomResponse | null>(null);
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
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [airplane, setAirplane] = useState<{ role: "host" | "guest"; host?: AirplaneHost; guest?: AirplaneGuest } | null>(null);
  const [airplaneScreen, setAirplaneScreen] = useState<"menu" | "guest" | null>(null);
  const [guestOffer, setGuestOffer] = useState("");
  const [guestAnswer, setGuestAnswer] = useState("");
  const [guestConnected, setGuestConnected] = useState(false);
  const [scannerFor, setScannerFor] = useState<"offer" | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [guestQrFullscreen, setGuestQrFullscreen] = useState(false);
  const observedEventId = useRef<number | null>(null);
  const observedRoomCode = useRef<string | null>(null);
  const observedChatId = useRef<number | null>(null);
  const observedChatRoomCode = useRef<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem(`silk-token-${room?.code}`) ?? "" : "";
  const me = room?.state.players.find((p) => p.id === localStorage.getItem(`silk-player-${room?.code}`));
  const myIndex = room?.state.players.findIndex((p) => p.id === me?.id) ?? -1;
  const isLanServer = typeof window !== "undefined" && /^\d{1,3}(\.\d{1,3}){3}$/.test(window.location.hostname);
  const pendingDiscard = room?.state.pendingDiscard;
  const mustDiscard = pendingDiscard?.playerId === me?.id;
  const isMyTurn = room?.state.status === "playing" && room.state.currentPlayer === myIndex && !mustDiscard && !activeEvent && actionQueue.length === 0;

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { user?: AccountProfile | null };
      if (data.user) { setAccount(data.user); setName(data.user.nickname); }
    }).finally(() => setAuthReady(true));
  }, []);

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

  const handleAvatarPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAuthError("请选择图片文件（JPG/PNG 等）");
      return;
    }
    setCropFile(file);
  };

  const applyAvatarPhoto = async (dataUrl: `data:image/${string}`) => {
    setCropFile(null);
    setAvatarBusy(true);
    setAuthError("");
    try {
      await accountRequest("avatar", dataUrl);
    } catch (photoError) {
      setAuthError(photoError instanceof Error ? photoError.message : "照片处理失败");
    } finally {
      setAvatarBusy(false);
    }
  };

  const createOfflineRoom = async () => {
    if (!name.trim()) { setError("请输入昵称"); return; }
    const host = new AirplaneHost(name.trim(), maxPlayers);
    setAirplane({ role: "host", host });
    host.onState((state, version) => setRoom((current) => !current || version >= current.version ? { code: host.code, version, state } : current));
    const data = host.request({ command: "create", name: name.trim(), maxPlayers });
    if (data.error) {
      setError(data.error);
      host.dispose();
      setAirplane(null);
      return;
    }
    applyRoomResponse(data);
  };

  const connectGuest = async (offer?: string) => {
    const code = (offer ?? guestOffer).trim();
    if (!code) { setError("请先扫描或粘贴邀请码"); return; }
    setBusy(true);
    setError("");
    try {
      const guest = new AirplaneGuest();
      const answer = await guest.connect(code);
      setAirplane({ role: "guest", guest });
      setGuestAnswer(answer);
      guest.onOpen(() => setGuestConnected(true));
      guest.onState((state, version) => setRoom((current) => !current || version >= current.version ? { code: guest.roomCode, version, state } : current));
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "连接失败");
    } finally {
      setBusy(false);
    }
  };

  const extractInvite = (text: string): string => {
    const trimmed = text.trim();
    if (trimmed.startsWith("SR")) return trimmed;
    const match = trimmed.match(/[?&]invite=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  };

  const joinOfflineRoom = async () => {
    const guest = airplane?.role === "guest" ? airplane.guest : null;
    if (!guest) return;
    setBusy(true);
    setError("");
    try {
      const data = await guest.request({ command: "join", name: name.trim(), code: guest.roomCode });
      if (data.error) throw new Error(data.error);
      applyRoomResponse(data);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "加入失败");
    } finally {
      setBusy(false);
    }
  };

  const goHome = () => {
    airplane?.host?.dispose();
    airplane?.guest?.dispose();
    setAirplane(null);
    setAirplaneScreen(null);
    setGuestOffer("");
    setGuestAnswer("");
    setGuestConnected(false);
    setShowInvite(false);
    window.location.hash = "";
    setRoom(null);
  };

  const applyRoomResponse = (data: RoomResponse) => {
    setRoom(data);
    if (data.token) {
      localStorage.setItem(`silk-token-${data.code}`, data.token);
      const player = data.playerId
        ? data.state.players.find((candidate) => candidate.id === data.playerId)
        : data.state.players.find((candidate) => candidate.name === name.trim());
      if (player) localStorage.setItem(`silk-player-${data.code}`, player.id);
    }
    window.history.replaceState({}, "", `#${data.code}`);
  };

  const request = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      let data: RoomResponse;
      if (airplane?.role === "host" && airplane.host) {
        data = airplane.host.request(body);
        if (data.error) throw new Error(data.error);
      } else if (airplane?.role === "guest" && airplane.guest) {
        data = await airplane.guest.request(body);
        if (data.error) throw new Error(data.error);
      } else {
        const response = await fetch("/api/room", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        data = await response.json() as RoomResponse;
        if (!response.ok) throw new Error(data.error || "操作失败");
      }
      applyRoomResponse(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败");
      return null;
    } finally { setBusy(false); }
  }, [airplane, name]);

  const refresh = useCallback(async (code: string, quiet = false) => {
    try {
      let data: RoomResponse;
      if (airplane?.role === "host" && airplane.host) {
        data = airplane.host.request({ command: "__refresh" });
      } else if (airplane?.role === "guest" && airplane.guest) {
        data = await airplane.guest.request({ command: "__refresh" });
      } else {
        const response = await fetch(`/api/room?code=${code}`, { cache: "no-store" });
        data = await response.json() as RoomResponse;
        if (!response.ok) throw new Error(data.error || "读取房间失败");
      }
      if (data.error) throw new Error(data.error);
      setRoom((current) => !current || data.version >= current.version ? data : current);
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : "连接失败");
    }
  }, [airplane]);

  useEffect(() => {
    const code = window.location.hash.slice(1).toUpperCase();
    if (code.length === 6) { setJoinCode(code); refresh(code, true); }
  }, [refresh]);

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) {
      setGuestOffer(invite);
      setAirplaneScreen("guest");
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
  }, []);

  useEffect(() => {
    if (!room?.code) return;
    const timer = window.setInterval(() => refresh(room.code, true), 1500);
    return () => window.clearInterval(timer);
  }, [room?.code, refresh]);

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

  const reconnectKnownPlayer = async () => {
    if (!room) return;
    const storedToken = localStorage.getItem(`silk-token-${room.code}`);
    if (!storedToken) { setRoom(null); return; }
    const playerId = localStorage.getItem(`silk-player-${room.code}`);
    const player = room.state.players.find((p) => p.id === playerId);
    if (player) { setName(player.name); return; }
    setRoom(null);
  };

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
          <button className="profile-avatar" aria-label="更换头像" onClick={() => setShowAvatarPicker((visible) => !visible)}>{isPhotoAvatar(account.avatar) ? <img src={account.avatar} alt={account.nickname} /> : account.avatar}<small>更换</small></button>
          <div><b>{account.nickname}</b><span>@{account.username}</span></div>
          <button className="account-logout" disabled={authBusy} onClick={() => accountRequest("logout")}>退出</button>
          {showAvatarPicker && <div className="avatar-picker" aria-label="选择头像">{PROFILE_AVATARS.map((avatar) => <button aria-pressed={account.avatar === avatar} key={avatar} disabled={authBusy || avatarBusy} onClick={() => accountRequest("avatar", avatar)}>{avatar}</button>)}
            <button className="avatar-upload" aria-pressed={isPhotoAvatar(account.avatar)} disabled={authBusy || avatarBusy} onClick={() => avatarFileRef.current?.click()}>{avatarBusy ? "处理中…" : "📷 上传照片"}</button>
            <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void handleAvatarPhoto(file); }} />
          </div>}
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
          {isLanServer && <div className="lan-banner">📡 已连接局域网服务器 · 输房间码即可直连加入，无需二维码</div>}
          <div className="airplane-entry">
            <div className="airplane-title"><span>✈️</span><div><b>离线联机（飞机模式）</b><small>无需互联网 · 手机热点扫码直连</small></div></div>
            <div className="airplane-actions">
              <button disabled={busy || !name.trim()} onClick={() => void createOfflineRoom()}>创建离线房间</button>
              <button disabled={busy} onClick={() => { setAirplaneScreen("guest"); setError(""); }}>加入离线房间</button>
            </div>
          </div>
        </div>}
        {airplaneScreen === "guest" && <div className="guest-connect">
          {!airplane && <>
            <p className="eyebrow">离线联机</p>
            <h2>加入房主</h2>
            <p className="modal-help">确保你已连接房主的手机热点，然后扫描或粘贴房主生成的邀请码。</p>
            <button className="primary wide" onClick={() => setScannerFor("offer")}>📷 扫描房主邀请码</button>
            <div className="divider"><span>或粘贴邀请码</span></div>
            <textarea className="invite-paste" value={guestOffer} rows={3} onChange={(event) => setGuestOffer(event.target.value)} placeholder="粘贴以 SR2:/SR3: 开头的邀请码" />
            <button className="primary wide" disabled={!guestOffer.trim() || busy} onClick={() => void connectGuest()}>{busy ? "连接中…" : "连接房主"}</button>
            <button className="text-button" onClick={() => { setAirplaneScreen(null); setGuestOffer(""); setGuestAnswer(""); setGuestConnected(false); setScannerFor(null); }}>返回</button>
          </>}
          {airplane && guestAnswer && <div className="guest-answer">
            <p className="modal-help">连接已建立！请让房主扫描下方回执：</p>
            <QrCode text={guestAnswer} size={200} />
            <button className="qr-fullscreen-btn" onClick={() => setGuestQrFullscreen(true)}>🔍 全屏二维码（更好扫）</button>
            <p className="invite-code">{guestAnswer}</p>
            <div className="invite-share-row">
              <button onClick={async () => { try { await navigator.clipboard.writeText(guestAnswer); setError("回执已复制，请发给房主粘贴"); } catch { setError("复制失败，请长按上方文字复制"); } }}>复制回执</button>
              <button onClick={async () => { try { if (navigator.share) await navigator.share({ title: "香料商路 · 离线联机回执", text: guestAnswer }); else await navigator.clipboard.writeText(guestAnswer); } catch { /* 用户取消分享 */ } }}>📤 分享回执</button>
            </div>
            {guestConnected
              ? <button className="primary wide" disabled={!name.trim() || busy} onClick={() => void joinOfflineRoom()}>加入商队（{name.trim() || "请先输入昵称"}）</button>
              : <div className="waiting-pulse"><i />等待房主确认连接…</div>}
            <button className="text-button" onClick={() => { airplane.guest?.dispose(); setAirplane(null); setGuestAnswer(""); setGuestConnected(false); }}>取消连接</button>
          </div>}
          {scannerFor === "offer" && <QrScanner label="扫描房主邀请码" onDetect={(text) => { setScannerFor(null); const invite = extractInvite(text); if (!invite) { setError("未识别到有效的邀请码，请对准二维码重试"); return; } setGuestOffer(invite); void connectGuest(invite); }} onCancel={() => setScannerFor(null)} />}
        </div>}
        {guestQrFullscreen && <FullscreenQr title="我的回执 · 请让房主扫描" text={guestAnswer} onClose={() => setGuestQrFullscreen(false)} />}
        {room && !me && room.state.status === "lobby" && <button className="text-button" onClick={reconnectKnownPlayer}>返回已有席位</button>}
        {authError && <div className="error-box">{authError}</div>}
        {error && <div className="error-box">{error}</div>}
        <button className="rules-link" onClick={() => setShowRules(true)}><span>◎</span> 查看规则说明书</button>
      </section>
      <footer>非官方玩法原型 · 使用原创界面与牌面</footer>
      {showRules && <RulesGuide onClose={() => setShowRules(false)} />}
      {cropFile && <PhotoCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={applyAvatarPhoto} />}
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
      <header className="topbar"><div className="wordmark">香料商路</div><div className="header-actions">{airplane?.role === "host" && <button className="room-code invite-btn" onClick={() => setShowInvite(true)}><small>✈️</small>邀请玩家</button>}<ThemeSwitcher value={visualTheme} onChange={setVisualTheme} /><button className="room-code" onClick={copyInvite}><small>房间码</small>{room.code}<span>{copied ? "已复制" : "复制邀请"}</span></button></div></header>
      <section className="lobby-panel">
        <p className="eyebrow">等待商队集结</p><h1>{room.state.players.length} / {room.state.maxPlayers} 位玩家</h1>
        <div className="seats">
          {Array.from({ length: room.state.maxPlayers }).map((_, i) => {
            const player = room.state.players[i];
            const angle = (90 + i * (360 / room.state.maxPlayers)) * (Math.PI / 180);
            const seatStyle = { left: `${50 + 38 * Math.cos(angle)}%`, top: `${50 + 38 * Math.sin(angle)}%` };
            return <div className={`seat ${player ? "filled" : ""}`} style={seatStyle} key={i}>
              <AvatarFace avatar={player?.avatar} name={player?.name ?? ""} color={player?.color} fallback={player ? undefined : String(i + 1)} />
              <div><b>{player?.name ?? "等待加入"}</b><small>{player?.id === room.state.hostId ? "房主" : player?.isBot ? `${botLabels[player.botDifficulty ?? "normal"]}人机` : player ? "已就绪" : "空席位"}</small></div>
              {isHost && player?.isBot && <button className="remove-bot" disabled={busy} onClick={() => request({ command: "removeBot", code: room.code, token, botId: player.id })}>移除</button>}
            </div>;
          })}
        </div>
        {isHost && <div className="bot-controls">
          <div><b>添加人机对手</b><small>可与真人混合对战</small></div>
          {(["easy", "normal", "hard"] as BotDifficulty[]).map((difficulty) => <button key={difficulty} disabled={busy || room.state.players.length >= room.state.maxPlayers} onClick={() => request({ command: "addBot", code: room.code, token, difficulty })}>{botLabels[difficulty]}</button>)}
        </div>}
        {!CARD_CATALOG_READY && <div className="catalog-lobby-note">卡牌已清空，等待新卡录入后开放游戏。</div>}
        {isHost ? <button className="primary start-button" disabled={busy || room.state.players.length < 2 || !CARD_CATALOG_READY} onClick={() => request({ command: "start", code: room.code, token })}>{CARD_CATALOG_READY ? "开始游戏" : "等待卡牌录入"}</button>
          : <div className="waiting-pulse"><i />等待房主开始游戏</div>}
        {error && <div className="error-box">{error}</div>}
      </section>
      {showInvite && airplane?.role === "host" && airplane.host && <AirplaneInviteModal host={airplane.host} onClose={() => setShowInvite(false)} />}
    </main>;
  }

  if (!CARD_CATALOG_READY) {
    return <main className={`catalog-shell theme-${visualTheme}`}>
      <section className="catalog-empty-state"><div className="empty-card-stack"><i /><i /><i /></div><p className="eyebrow">卡牌库整理中</p><h1>所有旧卡已移除</h1><p>当前对局已暂停。等待新卡片按顺序录入后，即可重新开始游戏。</p><button className="primary" onClick={goHome}>返回首页</button></section>
    </main>;
  }

  const state = room.state;
  const current = state.players[state.currentPlayer];
  const ranking = [...state.players].sort((a, b) => scorePlayer(b) - scorePlayer(a));
  const latestActions = new Map<string, ActionEvent>();
  (state.actionEvents ?? []).forEach((event) => latestActions.set(event.playerId, event));

  const seatOf = (index: number) => {
    const total = state.players.length;
    const offset = (index - myIndex + total) % total;
    if (offset === 0) return "bottom";
    if (total === 2) return "top";
    if (total === 3) return offset === 1 ? "left" : "right";
    if (total === 4) return offset === 1 ? "left" : offset === 2 ? "top" : "right";
    return offset === 1 ? "left" : offset === 2 ? "top-left" : offset === 3 ? "top-right" : "right";
  };

  const seatStrip = (p: (typeof state.players)[number], index: number) => (
    <div className={`player-strip seat-${seatOf(index)} ${index === state.currentPlayer && state.status === "playing" ? "active" : ""} ${p.id === me.id ? "me" : ""}`} key={p.id}>
      <AvatarFace avatar={p.avatar} name={p.name} color={p.color} />
      <div className="player-meta"><b>{p.name}{p.id === me.id && <small> 你</small>}{p.isBot && <small> · {p.afkSince ? "AI代管中" : `${botLabels[p.botDifficulty ?? "normal"]}人机`}</small>}</b><SpiceRow values={p.spices} compact /></div>
      <div className="player-score"><b>{scorePlayer(p)}</b><small>分 · {p.orders.length} 单</small></div>
      {latestActions.has(p.id) && <LastActionBadge event={latestActions.get(p.id)!} />}
      {activeChat?.playerId === p.id && <div className="player-speech"><b>{activeChat.phrase}</b><span>🔊</span></div>}
    </div>
  );

  return <main className={`game-shell theme-${visualTheme}`}>
    <header className="game-header">
      <div className="wordmark">香料商路</div>
      <div className="round-info"><span>第 {state.round} 轮</span><b>{state.status === "finished" ? "结算" : mustDiscard ? "请选择放回的香料" : isMyTurn ? "轮到你行动" : `等待 ${current.name}`}</b>{state.finalRound && <em>最后一轮</em>}</div>
      <div className="header-actions">{airplane?.role === "host" && <button className="room-code mini invite-btn" onClick={() => setShowInvite(true)}><small>✈️</small>邀请</button>}<ThemeSwitcher value={visualTheme} onChange={setVisualTheme} /><button className="room-code mini" onClick={copyInvite}><small>房间</small>{state.status === "finished" ? "战报" : room.code}</button></div>
    </header>

    <div className="seats-top">
      {state.players.map((p, index) => seatOf(index).startsWith("top") ? seatStrip(p, index) : null)}
      <div className="seats-top-extra">
        {state.players.map((p, index) => (seatOf(index) === "left" || seatOf(index) === "right") ? seatStrip(p, index) : null)}
      </div>
    </div>

    <div className="table-stage">
      <div className="table-players">
        {state.players.map((p, index) => (seatOf(index) === "left" || seatOf(index) === "right") ? seatStrip(p, index) : null)}
      </div>
      <div className="players-mobile">
        {state.players.map((p, index) => seatStrip(p, index))}
      </div>

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

      <div className="quick-chat"><b>语音快捷聊</b>{CHAT_PHRASES.map((phrase) => <button disabled={busy} key={phrase} onClick={() => request({ command: "chat", code: room.code, token, phrase: phrase as ChatPhrase })}><span>🔊</span>{phrase}</button>)}</div>

      <aside className="game-log"><b>商路动态</b>{state.log.slice(-7).reverse().map((line, i) => <p key={`${line}-${i}`}>{line}</p>)}</aside>
    </div>

    <section className="hand-panel">
      <div className="hand-head">
        <div className="hand-me">{seatStrip(me, myIndex)}</div>
        <div className="hand-stats"><div><span>你的商队</span><SpiceRow values={me.spices} /></div><div className="wallet"><span className="coin gold">{me.gold}</span><span className="coin silver">{me.silver}</span></div></div>
      </div>
      <div className="hand-row">
        {me.hand.map((cardId) => <button className={`merchant-card hand-card card-${MERCHANT_CARDS[cardId].type}`} disabled={!isMyTurn} key={cardId} onClick={() => handleCard(cardId)}><MerchantFace card={MERCHANT_CARDS[cardId]} /></button>)}
        {!me.hand.length && <div className="empty-hand">手牌已全部打出</div>}
      </div>
      <button className="rest-button" disabled={!isMyTurn || !me.played.length} onClick={() => sendAction({ type: "REST" })}><span>☾</span>休息并收回 {me.played.length} 张牌</button>
    </section>
    {error && <div className="toast" onClick={() => setError("")}>{error}</div>}
    {activeEvent && <ActionReveal key={activeEvent.id} event={activeEvent} />}
    {modal && <ActionModal modal={modal} setModal={setModal} meSpices={me.spices} onConfirm={sendAction} busy={busy} />}
    {state.status === "finished" && <div className="result-backdrop"><section className="result-card"><p className="eyebrow">商路结算</p><h1>{state.winnerIds.includes(me.id) ? "你赢得了商路盛誉" : `${ranking[0].name} 赢得了胜利`}</h1>
      <div className="ranking">{ranking.map((p, i) => <div className={state.winnerIds.includes(p.id) ? "winner" : ""} key={p.id}><span>{i + 1}</span><AvatarFace avatar={p.avatar} name={p.name} color={p.color} /><b>{p.name}</b><small>{p.orders.length} 张订单</small><strong>{scorePlayer(p)} 分</strong></div>)}</div>
      <button className="primary" onClick={goHome}>返回首页</button>
    </section></div>}
    {showInvite && airplane?.role === "host" && airplane.host && <AirplaneInviteModal host={airplane.host} onClose={() => setShowInvite(false)} />}
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
