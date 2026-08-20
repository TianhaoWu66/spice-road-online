# 香料商路 · PythonAnywhere 部署包

这是「香料商路」在线桌游的 **PythonAnywhere 版**。

> 原站是 Next.js + Cloudflare D1，PythonAnywhere 不能运行 Node.js，
> 所以这里把后端用 **Flask + SQLite** 重写（`app.py` / `game.py` / `accounts.py`），
> 前端导出为纯静态文件（`static/`）。API 契约与原版完全一致，游戏功能
> （多人房间、账号、机器人、语音快捷聊）全部保留。

## 目录

| 文件 | 说明 |
| --- | --- |
| `app.py` | Flask 应用：静态前端 + `/api/room` + `/api/auth`（SQLite 存储） |
| `game.py` | 游戏核心逻辑（Python 移植版，与原版行为一致） |
| `accounts.py` | 账号/登录（PBKDF2 密码哈希 + 会话 cookie） |
| `profile.py` | 头像常量 |
| `static/` | 构建好的前端（纯静态） |
| `requirements.txt` | 依赖：flask |
| `pythonanywhere_wsgi.py` | WSGI 入口示例（照抄到 PythonAnywhere 的 WSGI 文件即可） |

## 上传步骤（PythonAnywhere 免费版即可）

1. 注册/登录 https://www.pythonanywhere.com
2. **Files 页**：新建目录 `spice-road`，把本包所有文件上传进去
   （`app.py`、`game.py`、`accounts.py`、`profile.py`、`requirements.txt`、`static/` 文件夹）。
3. **Consoles 页 → 打开一个 Bash 控制台**，安装依赖：

   ```bash
   cd ~/spice-road
   pip install --user -r requirements.txt
   ```

4. **Web 页** → Add a new web app → 选 **Manual configuration** → Python 3.12。
5. 在 **Code** 区，把 **WSGI configuration file** 的内容替换为
   `pythonanywhere_wsgi.py` 里的代码（把 `/home/你的用户名` 改成你的实际路径）。
6. 点 **Reload**。
7. 打开 `https://<你的用户名>.pythonanywhere.com/` 即可游玩。

> 提示：数据库文件 `site.db` 会自动创建在 `~/spice-road/` 下（首次访问时）。
> 免费版限制（512MB 磁盘、无 always-on）对此游戏完全够用。
> 若上传后打不开，先看 **Web 页 → Error log**，通常是 WSGI 路径写错。

## 本地运行（可选）

```bash
pip install flask
python app.py          # 打开 http://127.0.0.1:5000
```

## 测试

```bash
python test_api.py     # API 契约测试（35 项）
python test_engine.py  # 游戏引擎测试（39 项，含完整对局）
```

## 与原站的区别

- 部署地址变成 `https://<用户名>.pythonanywhere.com/`，不再是原来的 chatgpt.site 域名。
- 房间和账号数据存在 PythonAnywhere 的 SQLite 里，和原站数据互不相通（全新开始）。
- 用哪个托管，就分享哪个链接给朋友。
