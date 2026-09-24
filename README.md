# SR 公会审核工单系统

面向 MC 圈公会（SR）的审核业务平台：申请人在用户端提交审核工单并凭查询码跟进进度；审核员在管理工作台接单、填写回执、复核公示；管理员维护规则、人员与系统配置。

| 端点 | 说明 | 技术 |
| --- | --- | --- |
| 用户端 `/` 落地页（公会介绍）· `/apply` 提交 / 查询 / 公示 / 规则 | 无需账号，凭「圈名 + 查询码」 | React 18 + AntD 6 |
| 审核工作台 `/pool`（工单池 / 回执 / 复核） | 审核员 / 副总管 / 总管 | React 18 + AntD 6 |
| 管理 API `/api/v1` | 全部业务接口 | Express 4 + SQLite |

共享契约（DTO / 校验 / 枚举 / 路径）收敛在 `packages/shared`，双端前端与 API 均以其为准。

> 部署教程见 [DEPLOYMENT.md](./DEPLOYMENT.md)（从零部署、初始化、升级与备份恢复）。

---

## 一、快速部署（生产）

环境要求：Node.js ≥ 22、pnpm ≥ 12。

```bash
# 1. 安装依赖（务必全量安装，不要用 --filter）
pnpm install

# 2. 构建（按拓扑序编译 shared → api → ui → 两个前端）
pnpm -r build

# 3. 初始化数据库并写入种子数据（演示部门 / 模式 / 账号）
npx pnpm -C apps/api db:reset

# 4. 启动 API（默认 8787；生产必须显式注入 JWT_SECRET）
JWT_SECRET=$(openssl rand -base64 48) node apps/api/dist/server.js

# 5. 发布前端静态资源
#    apps/user-frontend/dist 与 apps/admin-frontend/dist
#    使用 HashRouter，任意静态服务器即可，无需 history 回退配置。
#    开发期由 Vite 代理 /api → 8787；生产自行指向 API 地址（API 已启用 CORS）。
#    前端请求使用相对路径 /api，与 API 同域部署时零配置；
#    跨域部署时需在静态服务器上把 /api 反代到 API。
```

### Docker 一键部署（推荐）

```bash
cp .env.example .env      # 编辑 .env：必须设置 JWT_SECRET（缺失时 compose 拒绝启动）
docker compose up -d --build
```

启动后：用户端 `http://localhost:5173`、管理后台 `http://localhost:5174`，`/api` 由站点内 nginx 反代到 API 容器。数据落在命名卷 `api-data` / `api-storage`。另含 `backup` 容器：每日 03:00 自动备份数据库与证据附件到 `api-backups` 卷。

### 备份与恢复

- 容器备份由 `backup` 服务自动执行；宿主机手动备份：`./scripts/backup.sh`（可用 `SR_DATA_DIR` / `SR_STORAGE_DIR` / `SR_BACKUP_DIR` / `SR_BACKUP_KEEP_DAYS` 覆盖路径，默认保留 14 天）。
- 备份产物：`sr-review-<时间戳>.db`（sqlite3 `.backup` 在线一致性快照，兼容 WAL）+ `storage-<时间戳>.tar.gz`（附件）。
- 恢复：停服后用备份 db 覆盖 `SR_DATA_DIR/sr-review.db`，tar.gz 解包覆盖附件目录，重启即可。

### 健康检查

`GET /healthz` 返回 `{ ok, uptime, timestamp }`，供负载均衡 / 容器探针使用（compose 已配置 healthcheck）。

可选环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | API 监听端口 |
| `SR_DATA_DIR` | `apps/api/data` | 数据库与 JWT 密钥目录 |
| `SR_STORAGE_DIR` | `apps/api/storage` | 证据文件落盘目录 |
| `JWT_SECRET` | 自动生成并持久化 | **生产必须显式指定**（`NODE_ENV=production` 时未注入会拒绝启动） |
| `QQ_BOT_APPID` / `QQ_BOT_SECRET` / `QQ_BOT_TOKEN` | 空 | QQ 机器人凭据；三项齐备才真正投递消息，任一缺失时只记消息日志 |
| `QQ_BOT_SANDBOX` | `false` | 机器人开放接口是否走沙箱域名 |
| `PUBLIC_SITE_URL` | `http://localhost:5173` | 机器人按钮「去申请 / 查看结果」指向的外部地址 |
| `ADMIN_SITE_URL` | `http://localhost:5174` | 机器人按钮「去接单」指向的外部地址 |

种子账号（口令统一 `sr123456`，**上线后立即修改**）：

| 账号 | 角色 | 可见范围 |
| --- | --- | --- |
| `wangbei` | 总管 chief | 全部功能 |
| `yuye` | 副总管 deputy | 全部功能 |
| `xingchen` / `liuyun` / `beian` | 审核员 reviewer | 工单池 + 本人经办 |
| `admin` | 系统管理员 admin | 仪表盘 / 人员 / 日志 / 配置（不见工单） |

## 二、本地开发

```bash
pnpm install                # 全量安装
npx pnpm -C apps/api dev    # API：8787（tsx watch）
npx pnpm -C apps/user-frontend dev    # 用户端：5173
npx pnpm -C apps/admin-frontend dev    # 管理端：5174
pnpm -r typecheck           # 全仓类型检查
pnpm -r test                # shared + api 单测（45 例）
pnpm -C e2e test            # E2E 主链路（Playwright，独立实例，不污染本地数据）
```

---

## 三、开发者文档

### 3.1 仓库结构

```
apps/
  api/              Express API（routes / services / db / middleware）
  user-frontend/    申请人端（提交、查询、公示、规则）
  admin-frontend/   审核员端 + 管理后台（工单池、工作台、配置）
packages/
  shared/           前后端契约：DTO、zod schema、枚举、API 路径
  ui/               深空玻璃设计系统：tokens、GlassCard、StatusTag、GSAP motion
```

pnpm workspace（`nodeLinker: hoisted`）。`allowBuilds` 已放行 `better-sqlite3`、`esbuild` 原生构建。

### 3.2 契约先行（@sr/shared）

所有接口出入参以 `packages/shared/src` 为唯一事实源：`types.ts`（DTO）、`schemas.ts`（zod）、`enums.ts`、`apiPaths.ts`。**包消费的是 `dist` 编译产物**——修改 shared 源码后必须重建：

```bash
npx pnpm -C packages/shared build
```

API 侧用 `schema.safeParse` 做入参校验并将 zod issue 转为 `FIELD_REQUIRED` details（字段 → 错误数组），前端 `ApiClientError.details` 据此回填表单红字。

### 3.3 数据模型（SQLite，`apps/api/src/db/schema.sql`）

`user`（账号与角色 + 所属部门 `department_id`，兼作机器人认证 ID 的来源）、`department` / `mode`（部门与审核模式，级联约束删除）、`ticket`（工单主体 + 查询码 + 冷却判定字段）、`ticket_event`（流转事件，时间线数据源）、`receipt`（回执：PE / PC 成绩、是否通过、去向部门、评语、草稿态）、`attachment`（证据：kind = image / video / other）、`appeal`（申诉：凭圈名 + 查询码提交，总管 / 副总管采纳或驳回）、`contact_key`（一次性接洽码：审核员生成或机器人签发，提单事务内原子消耗；`bind_openid` / `bound_at` / `guild_id` 记录机器人绑定与取码所在群，用于提交校验和结果推送）、`robot_identities`（QQ 身份绑定：openid ↔ 角色 / 部门 / 账号）、`robot_message`（机器人收发消息日志，含失败原因供重发）、`announcement`（公告，置顶与过期）、`audit_log`（后台操作审计，before / after JSON）、`config`（系统配置 K/V）。

历史库升级由 `apps/api/src/db/index.ts` 的 `migrate()` 幂等补齐新增列（含 `contact_key.created_by` 放开 NOT NULL）。

### 3.4 工单状态机

```
pending_claim ──claim/assign──▶ reviewing ──receipt(submit)──▶ resulted
                                   │  ▲                            │
                                   │  └── review reject（回执转草稿重填）◀┘
                                   └──supplement-request──▶ supplementing
supplementing ──申请人补充──▶ reviewing
resulted ──review confirm / publish──▶ published（终态，脱敏公示）
release：reviewing / supplementing ─▶ pending_claim
```

约束：`assign` 仅 `pending_claim`；`supplement-request` 仅负责人在 `reviewing` 发起；回执按模块校验——含 PE 模块必填 `pe_grade`、含 PC 必填 `pc_grade`、`pass` 必填，`pass=true` 时 `target_department` 必填。例外通道：总管 / 副总管可直接 `UPDATE` 绕过终态约束把 `published` 拉回 `resulted`（撤销公示），全程留痕 `unpublished` 事件。

### 3.5 角色权限

| 端点组 / 功能 | reviewer | deputy | chief | admin |
| --- | --- | --- | --- | --- |
| 工单池 / 接单 / 回执 / 退回补充 | ✅ | ✅ | ✅ | ❌ |
| 指派 / 释放 / 置顶 / 复核 / 公示 | ❌ | ✅ | ✅ | ❌ |
| 规则配置 / 公告管理 | ❌ | ✅ | ✅ | ❌ |
| 机器人管理（身份绑定 / 接洽码 / 消息日志） | ❌ | ✅ | ✅ | ❌ |
| 仪表盘 / 人员 / 审计 / 系统配置 | ❌ | ✅ | ✅ | ✅ |

**总管 / 副总管全权通道**（放开跨工单干预，全部写审计日志）：

| 操作 | 权限 | 说明 |
| --- | --- | --- |
| 代提交 / 修订任意工单回执 | deputy + chief | 不限负责人；`resulted` 工单修订不改变状态；已公示工单仅支持提交修订，公示数据即时更新 |
| 退回任意审核中工单补充材料 | deputy + chief | 不限负责人 |
| 修订工单基础信息 | deputy + chief | 圈名 / 接洽码 / 部门模式 / 模块 / 自证，留 `ticket_updated` 事件 |
| 撤销公示 | deputy + chief | `published → resulted`，修订后可重新公示 |
| 删除工单 | deputy + chief | 级联清理回执 / 事件 / 附件（含磁盘文件），不可恢复 |
| 申诉处理（采纳 / 驳回） | deputy + chief | 管理后台「申诉处理」页 |

服务端 `requireRoles` 强制校验，前端仅做导航裁剪。

### 3.6 API 一览（前缀 `/api/v1`）

- 公开：`GET /healthz`、`GET /public/rules`、`GET /public/announcements`、`GET /public/published`、`GET /public/tickets/lookup?circle_name&query_code`
- 申请人（无账号，频控 + 冷却）：`POST /tickets`（multipart：`ticket` 为 JSON 字符串、`files` 证据 ≤6）、`POST /tickets/:id/supplement`、`POST /tickets/:id/appeals`（凭圈名 + 查询码申诉）
- 认证：`POST /auth/login`（JWT Bearer）
- 工单（登录）：`GET /tickets`（tab=待接单/我的在办/全部 + 筛选）、`GET /tickets/assignables`、`GET /tickets/:id`、`POST /tickets/:id/{claim,assign,release,pin,supplement-request,review,publish}`、`PUT /tickets/:id/receipt`、`PUT /tickets/:id/info`（总管/副总管修订基础信息）、`POST /tickets/:id/unpublish`（撤销公示）、`DELETE /tickets/:id`（删除）
- 接洽码（登录，审核系角色）：`GET /contact-keys`（我的生成记录）、`POST /contact-keys`（生成一次性接洽码，提单时原子消耗）
- 管理：`/admin/departments|modes|users|announcements|appeals|audit-logs|stats|config` CRUD 与读
- 机器人（见 3.10）：
  - 平台回调（无版本前缀、无鉴权但强制验签）：`POST /api/robot/webhook`
  - 管理（总管 / 副总管）：`GET /admin/robot-status`、`GET|POST /admin/robot-identities`、`PUT|DELETE /admin/robot-identities/:openid`、`GET /admin/robot-messages`（支持 `status` / `kind` 筛选与分页）、`POST /admin/robot-messages/:id/resend`、`GET /admin/contact-keys`（`bound=bound|unbound`）

### 3.7 前端约定

- **路由**：HashRouter（静态托管零配置）；admin 端 `homePathFor(role)` 按角色落地（审核系 → 工单池，admin → 仪表盘）。
- **会话**：JWT + 用户信息存 localStorage（`sr_admin_auth`）；`client.ts` 收到 401 广播 `sr:unauthorized`，AuthProvider 监听后清会话回登录页。
- **设计系统**：`@sr/ui` 提供 tokens（`--sr-*` 变量）、`GlassCard` / `StatusTag` / `GradeBadge`、GSAP 封装 `revealNode` / `staggerReveal`。动效约定：错峰入场、自然阻尼、长周期背景漂移；禁止呼吸发光 / 频闪 / 缩放上浮变色叠加。
- **表单**：antd Form + zod details 回填（`FIELD_REQUIRED` → `form.setFields`）。

### 3.8 已知工程注意点

1. **不要用 `pnpm install --filter <pkg>`**：hoisted 模式下会剪掉其它包依赖并留下失效 `.bin` 垫片；装包一律全量 `pnpm install`。
2. shared 改动未重建 dist 时，下游会报「无此导出」——先 `npx pnpm -C packages/shared build`。
3. `db:reset` 会清空 `sr-review.db` 并重置为种子态（6 账号 / 8 部门 / 31 模式 / 10 演示工单）。已有数据的库升级目录用 `db:sync-catalog`（幂等，不动账号与工单）。
4. 上传限制（扩展名白名单、单文件 200MB、每单 6 个）与提交冷却在「系统配置」页可调，实时生效。
5. `config.robot_require_bound_key` 默认 `false`：机器人接管入口后由总管在「系统配置 → 接洽码绑定」开启，届时只有机器人签发（已绑定 QQ）的接洽码才能提单，后台手工发码流程仍可保留。

### 3.9 E2E 主链路测试（`e2e/`）

Playwright 单条主链路用例：**生成接洽码 → 提交工单 → 总管接单 → 填回执 → 复核公示 → 用户查询回执 → 公示墙脱敏校验**。

- **独立实例**：`e2e/scripts/serve.mjs` 负责在临时目录拉起全新 SQLite（自动种子）+ API（8788）+ 两个前端（5273 / 5274），与本地开发服务（8787 / 5173 / 5174）完全隔离，不触碰真实数据。
- **端口可调**：环境变量 `SR_E2E_API_PORT` / `SR_E2E_USER_PORT` / `SR_E2E_ADMIN_PORT`；本地开发服务的端口/代理也可用 `SR_PORT` / `SR_API_TARGET` 注入。
- **首次运行**需安装浏览器：`pnpm -C e2e exec playwright install chromium`。
- CI 中为独立 job（`.github/workflows/ci.yml`），失败时上传 HTML 报告产物。

### 3.10 QQ 机器人双端接入

设计原则：**机器人只做触发与通知，表单填写与审核操作始终在网站端完成**。机器人未配置凭据时不投递、只记日志，因此本地开发与单测完全不受影响。

**两条入口**

1. 申请人：在 QQ 群内 @机器人 发送「拿接洽码」（也可发「申请码 / 要码」等）→ 机器人签发一次性接洽码并绑定其 openid，回复带「去申请」按钮（`PUBLIC_SITE_URL/apply?code=XXX`，用户端自动预填接洽码）。
2. 审核员：在管理后台右上角复制自己的**认证 ID**（即 `user.id`），在群里 @机器人 发送该 ID → 绑定为对应角色与部门，新工单自动 @该部门审核员。

**链路**

- `POST /api/robot/webhook` 处理 QQ 平台回调：**强制 Ed25519 验签，未配置 `QQ_BOT_SECRET` 时直接 503 拒绝**（接口经前端 nginx 对公网可达，不给未验签请求留口子）；`op:13` 回调地址验证用 Ed25519 应答（Bot Secret 循环填充 32 字节作种子）；`op:0` 事件仅处理 `GROUP_AT_MESSAGE_CREATE` / `C2C_MESSAGE_CREATE`，**先立即返回 200 再异步处理**（平台要求 5 秒内响应）。
- 出站消息：群聊的发送路径参数是**群 openid**（`POST /v2/groups/{group_openid}/messages`），@ 成员只能写在 `content` 里（`<qqbot-at-user id="openid" />`，旧的 `<@openid>` 协议平台已标注即将弃用）。对入站消息用 `msg_id` 做被动回复、用 `msg_seq` 区分同一条消息的多条回复。
- **主动消息配额**：工单创建 / 公示通知发生在交互窗口（群聊 5 分钟）之外，属主动消息，受平台配额约束（每个群每月 4 条），且需群主在群设置中开启「机器人主动在群聊内发言」，否则发送失败并记入「消息日志」。运营侧注意事项见 [DEPLOYMENT.md](./DEPLOYMENT.md) 第 9 节。
- 工单创建 → 按 `robot_identities.dept_id` 匹配该部门审核员并 @（附「去接单」按钮）；工单公示 → 通过 `contact_key.used_ticket_id` 反查申请人 openid 并推送结果（附「查看结果」按钮）。
- 所有收发消息落 `robot_message`；发送失败记录原因，可在「机器人管理 → 消息日志」一键重发。

**实现要点**

- Ed25519 签名 / AccessToken 缓存 / 消息发送在 `apps/api/src/services/qq.ts`；身份绑定、接洽码签发、入站处理与通知在 `services/robot.ts`；接洽码签发与反查在 `services/key.ts`。
- 审核员绑定采用「直接发后台认证 ID」，本期不做 OAuth 式的 openid 扫码绑定，也不做机器人侧的表单填写。
- 后台「机器人管理」页三块：身份绑定（可手工增删改）、接洽码绑定状态（筛选已绑定 / 未绑定）、消息日志（筛选 + 重发）。
