export type Spice = 0 | 1 | 2 | 3;
export type Spices = [number, number, number, number];

export type MerchantCard =
  | { id: string; type: "produce"; gain: Spices }
  | { id: string; type: "upgrade"; amount: number }
  | { id: string; type: "trade"; cost: Spices; gain: Spices };

export type OrderCard = { id: string; cost: Spices; points: number };
export type MarketSlot = { cardId: string; bonus: Spices };

export type Player = {
  id: string;
  token?: string;
  name: string;
  color: string;
  spices: Spices;
  hand: string[];
  played: string[];
  orders: string[];
  gold: number;
  silver: number;
};

export type GameState = {
  status: "lobby" | "playing" | "finished";
  maxPlayers: number;
  hostId: string;
  players: Player[];
  merchantDeck: string[];
  orderDeck: string[];
  merchantMarket: MarketSlot[];
  orderMarket: string[];
  goldSupply: number;
  silverSupply: number;
  currentPlayer: number;
  round: number;
  finalRound: boolean;
  winnerIds: string[];
  log: string[];
};

export type GameAction =
  | { type: "REST" }
  | { type: "PLAY"; cardId: string; upgrades?: Spice[]; times?: number }
  | { type: "ACQUIRE"; marketIndex: number; payment: Spices }
  | { type: "CLAIM"; orderIndex: number };

export const SPICE_NAMES = ["姜黄", "藏红花", "小豆蔻", "肉桂"];
export const PLAYER_COLORS = ["#e6a23c", "#df6b57", "#5f9b76", "#5f7dad", "#8b6bb1"];
export const zeroSpices = (): Spices => [0, 0, 0, 0];
const s = (a = 0, b = 0, c = 0, d = 0): Spices => [a, b, c, d];

export const MERCHANT_CARDS: Record<string, MerchantCard> = Object.fromEntries(
  ([
    { id: "start-gain", type: "produce", gain: s(2) },
    { id: "start-up", type: "upgrade", amount: 2 },
    { id: "m01", type: "produce", gain: s(3) },
    { id: "m02", type: "produce", gain: s(2, 1) },
    { id: "m03", type: "produce", gain: s(0, 2) },
    { id: "m04", type: "produce", gain: s(1, 0, 1) },
    { id: "m05", type: "produce", gain: s(0, 0, 1) },
    { id: "m06", type: "upgrade", amount: 2 },
    { id: "m07", type: "upgrade", amount: 3 },
    { id: "m08", type: "trade", cost: s(2), gain: s(0, 2) },
    { id: "m09", type: "trade", cost: s(3), gain: s(0, 0, 1) },
    { id: "m10", type: "trade", cost: s(0, 2), gain: s(0, 0, 0, 1) },
    { id: "m11", type: "trade", cost: s(1, 1), gain: s(0, 0, 2) },
    { id: "m12", type: "trade", cost: s(0, 0, 2), gain: s(0, 0, 0, 3) },
    { id: "m13", type: "trade", cost: s(0, 0, 0, 1), gain: s(0, 3) },
    { id: "m14", type: "trade", cost: s(0, 0, 1), gain: s(2, 2) },
    { id: "m15", type: "trade", cost: s(0, 1), gain: s(2, 0, 1) },
    { id: "m16", type: "trade", cost: s(4), gain: s(0, 0, 2) },
    { id: "m17", type: "trade", cost: s(2, 0, 1), gain: s(0, 0, 0, 2) },
    { id: "m18", type: "trade", cost: s(1, 0, 0, 1), gain: s(0, 0, 2) },
    { id: "m19", type: "trade", cost: s(0, 3), gain: s(0, 0, 0, 2) },
    { id: "m20", type: "trade", cost: s(2, 2), gain: s(0, 0, 0, 2) },
  ] as MerchantCard[]).map((card) => [card.id, card]),
);

export const ORDER_CARDS: Record<string, OrderCard> = Object.fromEntries(
  [
    ["o01", s(2, 2, 2), 9], ["o02", s(0, 2, 2, 1), 12],
    ["o03", s(0, 0, 3, 2), 16], ["o04", s(0, 0, 0, 5), 20],
    ["o05", s(3, 2, 1, 1), 11], ["o06", s(2, 0, 2, 2), 14],
    ["o07", s(0, 4, 0, 2), 13], ["o08", s(5, 0, 0, 2), 10],
    ["o09", s(0, 3, 3), 13], ["o10", s(0, 0, 2, 3), 17],
    ["o11", s(2, 3, 0, 1), 10], ["o12", s(1, 1, 1, 2), 12],
    ["o13", s(0, 2, 0, 3), 16], ["o14", s(4, 0, 2), 8],
    ["o15", s(2, 2, 0, 2), 13], ["o16", s(0, 5, 1), 11],
    ["o17", s(3, 0, 0, 3), 15], ["o18", s(1, 0, 3, 1), 12],
  ].map(([id, cost, points]) => [id, { id, cost, points }]),
);

const shuffle = <T,>(values: T[]) => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export function createLobby(hostName: string, maxPlayers: number, token: string): GameState {
  const host: Player = {
    id: crypto.randomUUID(), token, name: hostName, color: PLAYER_COLORS[0],
    spices: zeroSpices(), hand: [], played: [], orders: [], gold: 0, silver: 0,
  };
  return {
    status: "lobby", maxPlayers, hostId: host.id, players: [host], merchantDeck: [],
    orderDeck: [], merchantMarket: [], orderMarket: [], goldSupply: 0, silverSupply: 0,
    currentPlayer: 0, round: 1, finalRound: false, winnerIds: [], log: [`${hostName} 创建了商队`],
  };
}

export function addPlayer(state: GameState, name: string, token: string): GameState {
  if (state.status !== "lobby") throw new Error("游戏已经开始");
  if (state.players.length >= state.maxPlayers) throw new Error("房间已满");
  if (state.players.some((p) => p.name === name)) throw new Error("这个昵称已被使用");
  state.players.push({
    id: crypto.randomUUID(), token, name, color: PLAYER_COLORS[state.players.length],
    spices: zeroSpices(), hand: [], played: [], orders: [], gold: 0, silver: 0,
  });
  state.log.push(`${name} 加入了商队`);
  return state;
}

export function startGame(state: GameState): GameState {
  if (state.status !== "lobby") throw new Error("游戏已经开始");
  if (state.players.length < 2) throw new Error("至少需要两名玩家");
  const merchantDeck = shuffle(Object.keys(MERCHANT_CARDS).filter((id) => !id.startsWith("start")));
  const orderDeck = shuffle(Object.keys(ORDER_CARDS));
  state.players.forEach((p, index) => {
    p.hand = ["start-gain", "start-up"];
    p.spices = index === 0 ? s(3) : index < 3 ? s(4) : s(3, 1);
  });
  state.merchantMarket = merchantDeck.splice(0, 6).map((cardId) => ({ cardId, bonus: zeroSpices() }));
  state.orderMarket = orderDeck.splice(0, 5);
  state.merchantDeck = merchantDeck;
  state.orderDeck = orderDeck;
  state.goldSupply = state.players.length * 2;
  state.silverSupply = state.players.length * 2;
  state.status = "playing";
  state.log.push("商路开启，第一轮开始");
  return state;
}

const total = (v: Spices) => v.reduce((a, b) => a + b, 0);
export const canAfford = (have: Spices, cost: Spices, times = 1) => cost.every((n, i) => have[i] >= n * times);
const add = (target: Spices, values: Spices, factor = 1) => values.forEach((n, i) => { target[i] += n * factor; });
const pay = (target: Spices, values: Spices, factor = 1) => values.forEach((n, i) => { target[i] -= n * factor; });

function autoDiscard(player: Player) {
  let excess = total(player.spices) - 10;
  for (let tier = 0; tier < 4 && excess > 0; tier++) {
    const removed = Math.min(player.spices[tier], excess);
    player.spices[tier] -= removed;
    excess -= removed;
  }
}

export function scorePlayer(player: Player) {
  return player.orders.reduce((sum, id) => sum + ORDER_CARDS[id].points, 0)
    + player.gold * 3 + player.silver + player.spices[1] + player.spices[2] + player.spices[3];
}

function finishTurn(state: GameState) {
  const wasLast = state.currentPlayer === state.players.length - 1;
  if (state.finalRound && wasLast) {
    state.status = "finished";
    const scores = state.players.map(scorePlayer);
    const best = Math.max(...scores);
    state.winnerIds = state.players.filter((_, i) => scores[i] === best).map((p) => p.id);
    state.log.push("本轮结束，商路结算完成");
    return;
  }
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  if (wasLast) state.round += 1;
}

export function applyGameAction(state: GameState, playerId: string, action: GameAction): GameState {
  if (state.status !== "playing") throw new Error("游戏不在进行中");
  const player = state.players[state.currentPlayer];
  if (player.id !== playerId) throw new Error("还没轮到你");

  if (action.type === "REST") {
    if (!player.played.length) throw new Error("当前没有需要收回的牌");
    player.hand.push(...player.played);
    player.played = [];
    state.log.push(`${player.name} 休息并收回全部商人牌`);
  }

  if (action.type === "PLAY") {
    if (!player.hand.includes(action.cardId)) throw new Error("这张牌不在手中");
    const card = MERCHANT_CARDS[action.cardId];
    if (!card) throw new Error("商人牌不存在");
    if (card.type === "produce") {
      add(player.spices, card.gain);
      state.log.push(`${player.name} 获得了一批香料`);
    } else if (card.type === "trade") {
      const times = Math.max(1, Math.floor(action.times ?? 1));
      if (!canAfford(player.spices, card.cost, times)) throw new Error("香料不足，无法完成交易");
      pay(player.spices, card.cost, times);
      add(player.spices, card.gain, times);
      state.log.push(`${player.name} 完成了 ${times} 次香料交易`);
    } else {
      const choices = action.upgrades ?? [];
      if (!choices.length || choices.length > card.amount) throw new Error("升级次数不正确");
      for (const tier of choices) {
        if (tier < 0 || tier > 2 || player.spices[tier] < 1) throw new Error("无法升级所选香料");
        player.spices[tier] -= 1;
        player.spices[tier + 1] += 1;
      }
      state.log.push(`${player.name} 升级了 ${choices.length} 个香料`);
    }
    player.hand = player.hand.filter((id) => id !== action.cardId);
    player.played.push(action.cardId);
    autoDiscard(player);
  }

  if (action.type === "ACQUIRE") {
    const index = action.marketIndex;
    if (index < 0 || index >= state.merchantMarket.length) throw new Error("市场位置无效");
    if (total(action.payment) !== index || !canAfford(player.spices, action.payment)) throw new Error("支付的香料数量不正确");
    pay(player.spices, action.payment);
    const paidTiers: Spice[] = [];
    action.payment.forEach((n, tier) => { for (let i = 0; i < n; i++) paidTiers.push(tier as Spice); });
    paidTiers.forEach((tier, slot) => { state.merchantMarket[slot].bonus[tier] += 1; });
    const selected = state.merchantMarket[index];
    player.hand.push(selected.cardId);
    add(player.spices, selected.bonus);
    state.merchantMarket.splice(index, 1);
    const next = state.merchantDeck.shift();
    if (next) state.merchantMarket.push({ cardId: next, bonus: zeroSpices() });
    autoDiscard(player);
    state.log.push(`${player.name} 招募了一名新商人`);
  }

  if (action.type === "CLAIM") {
    const index = action.orderIndex;
    const orderId = state.orderMarket[index];
    const order = ORDER_CARDS[orderId];
    if (!order || !canAfford(player.spices, order.cost)) throw new Error("香料不足，无法完成订单");
    pay(player.spices, order.cost);
    player.orders.push(orderId);
    if (index === 0 && state.goldSupply > 0) { player.gold += 1; state.goldSupply -= 1; }
    else if ((index === 1 && state.goldSupply > 0 || index === 0) && state.silverSupply > 0) { player.silver += 1; state.silverSupply -= 1; }
    state.orderMarket.splice(index, 1);
    const next = state.orderDeck.shift();
    if (next) state.orderMarket.push(next);
    state.log.push(`${player.name} 完成了价值 ${order.points} 分的订单`);
    const target = state.players.length <= 3 ? 6 : 5;
    if (player.orders.length >= target) {
      state.finalRound = true;
      state.log.push(`${player.name} 触发了最后一轮`);
    }
  }

  finishTurn(state);
  return state;
}

export function describeMerchant(card: MerchantCard) {
  if (card.type === "produce") return "获取香料";
  if (card.type === "upgrade") return `升级 ${card.amount} 次`;
  return "重复交易";
}
