#!/bin/sh
# ============================================================
# SR 工单系统备份脚本：SQLite 数据库 + 证据附件目录
#   - 数据库使用 sqlite3 .backup 在线一致性快照（兼容 WAL）
#   - 附件目录整体 tar.gz 打包
#   - 默认保留 14 天，超期自动清理
# 用法（宿主机）：./scripts/backup.sh
# 用法（容器）：由 crond 每日 03:00 调用，路径经环境变量注入
# ============================================================
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${SR_DATA_DIR:-$ROOT/apps/api/data}"
STORAGE_DIR="${SR_STORAGE_DIR:-$ROOT/apps/api/storage}"
BACKUP_DIR="${SR_BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${SR_BACKUP_KEEP_DAYS:-14}"

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

DB_FILE="$DATA_DIR/sr-review.db"
if [ -f "$DB_FILE" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/sr-review-$STAMP.db'"
  else
    # 无 sqlite3 时退化为文件拷贝（若启用 WAL 建议安装 sqlite3）
    cp "$DB_FILE" "$BACKUP_DIR/sr-review-$STAMP.db"
  fi
  echo "[backup] 数据库已备份：sr-review-$STAMP.db"
else
  echo "[backup] 未找到数据库文件：$DB_FILE（跳过）"
fi

if [ -d "$STORAGE_DIR" ] && [ -n "$(ls -A "$STORAGE_DIR" 2>/dev/null)" ]; then
  tar -czf "$BACKUP_DIR/storage-$STAMP.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"
  echo "[backup] 附件已备份：storage-$STAMP.tar.gz"
else
  echo "[backup] 附件目录为空或不存在：$STORAGE_DIR（跳过）"
fi

find "$BACKUP_DIR" -type f -mtime "+$KEEP_DAYS" -delete
echo "[backup] 完成，保留最近 $KEEP_DAYS 天备份：$BACKUP_DIR"
