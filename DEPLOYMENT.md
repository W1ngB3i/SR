# SR 审核工单系统 · 部署教程

本文面向部署人员，覆盖从零部署、初始化、版本升级到备份恢复的完整流程。开发者文档见 [README.md](./README.md)。

## 0. 架构与端口

| 组件 | 默认端口 | 说明 |
| --- | --- | --- |
| 用户端（提交 / 查询 / 公示） | 5173 | 静态站（React + AntD，HashRouter） |
| 管理后台（工单池 / 回执 / 配置） | 5174 | 静态站，仅限工作人员使用 |
| API | 8787 | Express + SQLite，接口前缀 `/api` |

- 双前端容器内置 nginx，将 `/api` 反代到 API，**API 无需直接对外暴露**。
- 数据 = SQLite 数据库 + 证据附件（单文件 ≤ 200MB、每单 ≤ 6 个），请按附件量预留磁盘。

## 1. 服务器要求

- Linux x86_64（Ubuntu 22.04 / Debian 12 / Rocky 9 等均可）
- 方式一：Docker ≥ 24（含 compose 插件）
- 方式二：Node.js ≥ 22 + pnpm ≥ 12
- 内存 ≥ 1GB 即可

## 2. 方式一：Docker Compose（推荐）

### 2.1 首次部署

```bash
# 1) 获取代码
git clone <仓库地址> sr-review && cd sr-review

# 2) 准备环境变量
cp .env.example .env
# 编辑 .env：
#   JWT_SECRET 必填，生成方式：openssl rand -base64 48
#   可选调整对外端口：USER_FRONTEND_PORT / ADMIN_FRONTEND_PORT
#   可选接入 QQ 机器人：QQ_BOT_APPID / QQ_BOT_SECRET
#                        PUBLIC_SITE_URL / ADMIN_SITE_URL（见第 9 节）

# 3) 构建并启动（4 个容器：api / user-frontend / admin-frontend / backup）
docker compose up -d --build
```

### 2.2 验证

```bash
docker compose ps                              # 四个服务均 Up（api 为 healthy，探针走容器内 /healthz）
curl -s http://localhost:5173/api/v1/public/rules | head -c 200   # 经前端 nginx 反代到 API
```

说明：`/healthz` 挂在 API 根路径、仅容器内可达（8787 未对宿主机开放），因此对外验证请调用任意业务接口。

浏览器访问 `http://<服务器IP>:5173`（用户端）与 `http://<服务器IP>:5174`（管理后台）。

### 2.3 数据落盘位置

| 命名卷 | 内容 |
| --- | --- |
| `api-data` | SQLite 数据库（sr-review.db） |
| `api-storage` | 证据附件 |
| `api-backups` | 每日自动备份产物 |

## 3. 方式二：裸机（Node.js）

### 3.1 首次部署

```bash
corepack enable
git clone <仓库地址> sr-review && cd sr-review

pnpm install          # 全量安装（禁止 --filter，详见 README 工程注意点）
pnpm -r build         # 按拓扑序编译 shared → api → ui → 前端

# 初始化数据库（含演示数据；对已有库执行会清空全部数据，慎用）
npx pnpm -C apps/api db:reset
```

### 3.2 用 systemd 托管 API

```ini
# /etc/systemd/system/sr-api.service（WorkingDirectory 按实际仓库路径修改）
[Unit]
Description=SR Review API
After=network.target

[Service]
WorkingDirectory=/opt/sr-review
Environment=NODE_ENV=production
Environment=JWT_SECRET=<openssl rand -base64 48 的结果>
Environment=SR_DATA_DIR=/opt/sr-review/apps/api/data
Environment=SR_STORAGE_DIR=/opt/sr-review/apps/api/storage
# 可选：QQ 机器人（AppID 与 Secret 齐备才投递消息，不需要机器人时整段删除）
Environment=QQ_BOT_APPID=
Environment=QQ_BOT_SECRET=
Environment=PUBLIC_SITE_URL=http://<服务器公网IP>:5173
Environment=ADMIN_SITE_URL=http://<服务器公网IP>:5174
ExecStart=/usr/bin/node apps/api/dist/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now sr-api
```

### 3.3 前端静态托管（nginx 示例）

两个 `dist` 目录使用 HashRouter，任意静态服务器可托管，同域反代 `/api` 即可：

```nginx
server {
    listen 5173;
    root /opt/sr-review/apps/user-frontend/dist;
    client_max_body_size 250m;               # 对齐附件上传上限
    location /api/ { proxy_pass http://127.0.0.1:8787; }
    location / { try_files $uri $uri/ /index.html; }
}
# 管理后台同理：换端口 5174，root 指向 apps/admin-frontend/dist
```

## 4. 部署后初始化清单

1. 用种子账号登录管理后台（5174，口令统一 `sr123456`），**立即修改口令**：
   `wangbei`（总管）、`yuye`（副总管）、`admin`（系统管理员）等。
2. 「人员管理」创建正式审核员账号，提醒其首次登录后修改口令。
3. 「规则配置」核对部门 / 审核模式 / 公告（默认已内置 8 部门 31 模式目录）。
4. 验证接洽码流程：审核员（含总管 / 副总管）在「接洽码」页生成一次性码，线下交付申请人，申请人凭码提交工单（一码一单，用后作废）。
5. 防火墙仅放行 5173 / 5174（或 80/443），**8787 不要对公网开放**。
6. 如需 QQ 机器人（可选）：按第 9 节配置并验证，然后在「系统配置 → 接洽码绑定」决定是否强制只认机器人签发的接洽码。

## 5. 版本升级

```bash
# Docker 部署
git pull
docker compose up -d --build      # 重建镜像并重启

# 裸机部署
git pull && pnpm install && pnpm -r build
systemctl restart sr-api
```

**目录迁移**（版本说明有要求时执行；幂等，可重复）：

```bash
# Docker：
docker compose exec api node apps/api/dist/db/cli.js sync-catalog

# 裸机：
npx pnpm -C apps/api db:sync-catalog
```

说明：

- 表结构随 API 启动自动补齐（`CREATE TABLE IF NOT EXISTS`），**无需手工执行 SQL**。
- `sync-catalog` 只更新 `department` / `mode` 目录并停用旧部门，不改动账号、工单与回执；执行前建议先备份。
- 全新部署无需执行（`db:reset` 已写入最新目录）。

## 6. 备份与恢复

**自动备份**（Docker 部署）：backup 容器每日 03:00（Asia/Shanghai）将数据库一致性快照与附件打包到 `api-backups` 卷，保留 14 天。

**手动备份**（宿主机）：

```bash
./scripts/backup.sh
# 产物写入 ./backups/：sr-review-<时间戳>.db + storage-<时间戳>.tar.gz
# 路径与保留期可用 SR_DATA_DIR / SR_STORAGE_DIR / SR_BACKUP_DIR / SR_BACKUP_KEEP_DAYS 覆盖
```

**恢复**（以 Docker 为例）：

```bash
docker compose stop api
docker compose run --rm -v sr-review_api-data:/data -v "$PWD/backups:/bk" alpine \
  sh -c "cp /bk/sr-review-<时间戳>.db /data/sr-review.db && rm -f /data/sr-review.db-wal /data/sr-review.db-shm"
# 附件：tar -xzf backups/storage-<时间戳>.tar.gz -C <api-storage 卷路径>
docker compose start api
```

裸机部署：停服后用备份 db 覆盖 `SR_DATA_DIR/sr-review.db`（一并删除残留 `-wal` / `-shm`），附件解包覆盖 `SR_STORAGE_DIR`，再启动。

## 7. 常见问题

| 现象 | 处理 |
| --- | --- |
| compose 启动报 `JWT_SECRET` 错误 | 未设置 `.env`，按 2.1 生成并填写 |
| 健康检查不通过 | `docker compose logs api` 查看报错；确认 8787 未被占用 |
| 上传附件报 413 | 前置反代未放开体积，nginx 需 `client_max_body_size 250m;` |
| 忘记管理员口令 | 用另一管理员在「人员管理」重置；全部遗忘需离线处理数据库（求助开发） |
| 磁盘增长 | 附件集中在 `api-storage`，可按需归档；备份保留期可调 `SR_BACKUP_KEEP_DAYS` |

## 8. HTTPS（可选）

前端容器为纯 HTTP。需要域名 + TLS 时，在宿主机加一层 nginx / Caddy 反代 5173 / 5174 并托管证书，应用侧无需任何改动。

## 9. QQ 机器人接入（可选）

不配置机器人时，系统一切功能照常，只是不会往 QQ 群推送通知——**这一节可以整段跳过**。

### 9.1 准备凭据

在 QQ 开放平台（`q.qq.com`）创建机器人应用，在「开发设置」页取得 **AppID** 与 **AppSecret**，填入 `.env`：

> 旧版的 **Token** 鉴权平台已弃用：v2 开放接口用 AppID + Secret 换取 AccessToken（应用会自动换并缓存），回调验签也用同一个 Secret，因此**无需 Token**。

```ini
QQ_BOT_APPID=<AppID>
QQ_BOT_SECRET=<AppSecret>
QQ_BOT_SANDBOX=false            # 联调阶段可先设 true
PUBLIC_SITE_URL=http://<对外地址>:5173     # 申请人侧入口
ADMIN_SITE_URL=http://<对外地址>:5174      # 审核工作台
```

两个 `*_SITE_URL` 必须是**玩家与审核员能打开的地址**（公网域名或 IP），否则机器人消息里的按钮点了没反应。

> **主动消息配额**：机器人 @审核员 的「新工单」通知与 @申请人 的「审核结果」通知发生在交互窗口之外，属**主动消息**——群聊每月 4 条、单聊每月 4 条，且**群主需在群设置里开启「机器人主动在群聊内发言」**。
> 超出配额或未开启时消息会发送失败，可在「机器人管理 → 消息日志」看到失败原因。群内的「拿接洽码 / 发送认证 ID」属被动回复，不受此限。

改完重启：`docker compose up -d --build`（裸机：`systemctl restart sr-api`）。

### 9.2 配置回调地址

在开放平台的「回调配置 / 事件订阅」中填写：

```
http://<对外地址>:5173/api/robot/webhook
```

（即通过前端 nginx 反代到 API；API 本身无需对公网暴露。）

平台会立刻发起一次地址校验请求，应用已内置 Ed25519 应答，**无需手工处理**。保存成功后页面提示校验通过即接入完成。

### 9.3 启用并验证

1. 管理后台（5174）→「机器人管理」页，顶部「接入状态」应显示**已接通**。若显示未配置，说明 `.env` 里 AppID / Secret 没生效，检查容器环境变量后重建。
2. 审核员：在管理后台右上角点击自己的**认证 ID** 复制，在 QQ 群里 @机器人 并发送该 ID。机器人回复「已绑定为…」即成功；页面「身份绑定」列表会出现该条记录，请补上部门与 QQ 号（**部门决定新工单 @谁**）。
3. 申请人：在群里 @机器人 发送「拿接洽码」，机器人回复接洽码与「去申请」按钮；点击后用户端会自动预填接洽码。
4. 提交一条测试工单，观察该部门审核员是否被 @；走完复核公示后，申请人是否收到结果通知。
5. 「消息日志」中 `失败` 的消息会显示失败原因，可直接点「重发」；`未发送` 表示当时没有匹配到接收人（例如该部门还没人完成绑定），补录绑定即可，无需重发。

### 9.4 是否强制绑定接洽码

管理后台「系统配置 → 接洽码绑定」：

- 关闭（默认）：审核员在「接洽码」页手工签发的码同样可以提单，机器人只是多一条自助入口。
- 开启：只有机器人签发（已绑定 QQ）的接洽码才能提单，审核结果才能自动推送给申请人。**建议在机器人流程跑通后再开启。**

### 9.5 排查

| 现象 | 处理 |
| --- | --- |
| 「机器人管理」显示未配置 | `.env` 里 AppID / Secret 未生效：`docker compose exec api printenv \| grep QQ_BOT` 核对，改完需重建容器 |
| 回调地址校验失败 | 确认公网可达且路径为 `/api/robot/webhook`；确认 Secret 填对；接口返回 503 表示 `.env` 里 `QQ_BOT_SECRET` 为空 |
| 群内 @机器人 无任何反应 | 开放平台事件订阅是否包含群 @消息；查看「消息日志」是否有 `收到` 记录 |
| 日志有 `failed` 且提示 401 / 403 | AppID 或 AppSecret 不匹配，重新从开放平台「开发设置」复制 |
| 群内拿码正常，但工单通知发不出 | 通知属主动消息：确认群主已开启「机器人主动在群聊内发言」，并留意每月 4 条的配额（失败原因见「消息日志」） |
| 审核员收不到新工单 @ | 该审核员身份绑定缺「部门」，或部门与工单不匹配；群里 @机器人 重发认证 ID 可重绑 |
| 申请人收不到结果 | 其接洽码未绑定 QQ（后台「接洽码」页筛选「未绑定 QQ」可核对），需走机器人重新取码 |
