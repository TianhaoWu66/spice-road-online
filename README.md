# 香料商路 · Spice Road

在线香料贸易桌游：招募商人、转换香料、抢先完成高分订单。**浏览器联机，2–5 人**，支持人机、真人录音语音、挂机代管与中途上车。

🌐 在线试玩：https://xiangliaoshiji.pythonanywhere.com/

---

## ✨ 功能特性

- **联机对战**：房间码加入，2–5 人，约 20 分钟一局
- **账号系统**：注册 / 登录 / 游客模式，支持自定义头像
- **人机对手**：简单 / 普通 / 困难 三档 AI
- **语音快捷聊**：真人录音语音包（无录音时回退浏览器 TTS）
- **挂机代管**：轮到某玩家 40 秒无操作，AI 自动代打，游戏不中断；玩家回来自动恢复
- **中途加入**：游戏开始后，新玩家可加入并直接接替 AI 席位
- **多主题**：羊皮纸 / 夜市 / 青瓷 三种卡面风格

## 🧱 技术栈

| 部分 | 技术 |
| --- | --- |
| 前端 | React 19 + Next.js（原版）/ Vite 静态构建（部署版）+ Tailwind CSS |
| 游戏引擎 | TypeScript（`lib/game.ts`，纯逻辑，前后端共用） |
| 原版后端 | Cloudflare Workers + D1（`app/api`、`db/`、`drizzle/`） |
| 部署版后端 | PythonAnywhere + Flask + SQLite（`pythonanywhere/`） |

## 📁 目录结构

```
app/                    前端页面（游戏主界面 game.tsx）
lib/                    游戏引擎与账号逻辑（TS 源码）
pythonanywhere/         PythonAnywhere 部署版（Flask + SQLite + 静态前端 + 测试）
  ├─ app.py             Flask 应用（API + 静态托管）
  ├─ game.py            游戏引擎 Python 移植版
  ├─ accounts.py        账号 / 会话
  └─ frontend/          Vite 静态前端构建源
db/  drizzle/           D1 数据库 schema 与迁移
```

## 🚀 本地运行

```bash
# 部署版（PythonAnywhere 同款）
cd pythonanywhere
pip install flask
python app.py            # http://127.0.0.1:5000

# 重建静态前端（改动前端后需要）
npx vite build --config pythonanywhere/frontend/vite.config.ts
```

## ✅ 测试

```bash
python pythonanywhere/test_api.py      # API 契约（46 项）
python pythonanywhere/test_engine.py   # 游戏引擎（45 项，含完整对局）
```

## 🤝 如何参与共创

- 发现 Bug / 有新想法 → 提 [Issue](../../issues)
- 直接改代码 → 提 [Pull Request](../../pulls)
- 想贡献的方向：
  - **卡牌库**：`lib/game.ts` 的 `MERCHANT_CARDS` / `ORDER_CARDS`
  - **语音包**：把录音放到 `pythonanywhere/frontend/public/audio/`，并在 `app/game.tsx` 的 `CHAT_AUDIO` 加一行映射
  - **新主题 / 界面**：`app/globals.css` 与 `app/game.tsx` 的 `ThemeSwitcher`
  - **人机 AI**：`lib/game.ts` 的 `chooseBotAction` / `actionScore`
  - **规则平衡**：开局香料、订单分值、金币/银币机制

## 📦 部署（PythonAnywhere）

详见 [`pythonanywhere/README.md`](pythonanywhere/README.md)：上传 → 建 Web 应用（Python 3.12）→ 配置 WSGI → 完成。

> 原仓库基于 [vinext-starter](https://github.com/cloudflare/vinext)，部署版为 Flask + SQLite 重写，API 契约与原版一致。
