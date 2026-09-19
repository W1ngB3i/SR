# syntax=docker/dockerfile:1
# ============================================================
# SR 公会审核工单系统 · 多阶段构建
#   target=api             后端 API（node:22-alpine）
#   target=user-frontend   申请人端静态站（nginx + /api 反代）
#   target=admin-frontend  管理后台静态站（nginx + /api 反代）
#   target=backup          每日定时备份容器（sqlite + crond）
# ============================================================

# ---------- 构建阶段：安装依赖并产出全部构建物 ----------
FROM node:22-alpine AS build
# better-sqlite3 在 alpine(musl) 上需源码编译
RUN apk add --no-cache python3 make g++
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# 先拷贝清单利用层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/user-frontend/package.json apps/user-frontend/package.json
COPY apps/admin-frontend/package.json apps/admin-frontend/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @sr/shared build \
    && pnpm --filter @sr/ui build \
    && pnpm --filter @sr/api build \
    && pnpm --filter @sr/user-frontend build \
    && pnpm --filter @sr/admin-frontend build

# 裁剪开发依赖，仅保留运行时依赖与 workspace 链接
RUN pnpm prune --prod

# ---------- API 运行时 ----------
FROM node:22-alpine AS api
WORKDIR /app
ENV PORT=8787
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
EXPOSE 8787
CMD ["node", "apps/api/dist/server.js"]

# ---------- 静态站点公共 nginx 片段 ----------
FROM nginx:1.27-alpine AS nginx-base
RUN rm -f /etc/nginx/conf.d/default.conf

# ---------- 申请人端 ----------
FROM nginx-base AS user-frontend
COPY deploy/nginx/app.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/user-frontend/dist /usr/share/nginx/html
EXPOSE 80

# ---------- 管理后台 ----------
FROM nginx-base AS admin-frontend
COPY deploy/nginx/app.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-frontend/dist /usr/share/nginx/html
EXPOSE 80

# ---------- 定时备份容器：每日 03:00 备份数据库与证据附件 ----------
FROM alpine:3.20 AS backup
RUN apk add --no-cache sqlite tzdata
COPY scripts/backup.sh /scripts/backup.sh
RUN echo '0 3 * * * sh /scripts/backup.sh' > /etc/crontabs/root \
    && chmod +x /scripts/backup.sh
CMD ["crond", "-f", "-l", "8"]
