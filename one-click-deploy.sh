#!/bin/bash
# ============================================================
# 喵站工作台 · 一键部署
# 包含：数据迁移 → 服务器部署 → 本地测试
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN}  🐱 喵站工作台 · 一键部署脚本${NC}"
echo -e "${CYAN}=========================================${NC}"
echo ""

# ── 检查当前目录 ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

if [ ! -f "$PROJECT_DIR/package.json" ] || ! grep -q "my-ai-workbench" "$PROJECT_DIR/package.json" 2>/dev/null; then
  echo -e "${RED}  ❌ 请在 my-AI-workbench 项目根目录运行此脚本${NC}"
  echo -e "${YELLOW}  💡 用法: cd ~/Desktop/my-AI-workbench && bash one-click-deploy.sh${NC}"
  exit 1
fi

echo -e "${GREEN}  ✅ 当前目录: my-AI-workbench${NC}"
echo ""

# ═══════════════════════════════════════════
# 第1步：数据迁移（JSON → SQLite）
# ═══════════════════════════════════════════
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  第 1 步：数据迁移 (JSON → SQLite)      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}  📦 正在迁移数据到 SQLite 数据库...${NC}"
if npx tsx scripts/migrate-json-to-db.ts; then
  echo ""
  echo -e "${GREEN}  ✅ 数据迁移完成！${NC}"
  echo -e "${YELLOW}  💡 原 data/ 目录下的 JSON 文件已保留作为备份${NC}"
else
  echo -e "${RED}  ❌ 数据迁移失败，请检查错误信息${NC}"
  exit 1
fi

# ═══════════════════════════════════════════
# 第2步：服务器部署（可选）
# ═══════════════════════════════════════════
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  第 2 步：部署到阿里云服务器 (可选)     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

read -p "  是否部署到阿里云服务器？(y/N): " DEPLOY_CHOICE
if [ "$DEPLOY_CHOICE" = "y" ] || [ "$DEPLOY_CHOICE" = "Y" ]; then
  echo ""
  echo -e "${YELLOW}  🚀 启动服务器部署...${NC}"
  bash "$PROJECT_DIR/scripts/deploy.sh"
else
  echo -e "${YELLOW}  ⏭️  跳过服务器部署${NC}"
fi

# ═══════════════════════════════════════════
# 第3步：本地测试
# ═══════════════════════════════════════════
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  第 3 步：本地开发测试                  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

read -p "  是否启动本地开发服务器？(y/N): " DEV_CHOICE
if [ "$DEV_CHOICE" = "y" ] || [ "$DEV_CHOICE" = "Y" ]; then
  echo ""
  echo -e "${YELLOW}  🚀 启动开发服务器 (npm run dev)...${NC}"
  echo -e "${YELLOW}  🌐 访问地址: ${GREEN}http://localhost:3000${NC}"
  echo -e "${YELLOW}  💡 按 Ctrl+C 停止服务器${NC}"
  echo ""
  npm run dev
else
  echo -e "${YELLOW}  ⏭️  跳过本地测试${NC}"
  echo -e "${YELLOW}  💡 需要时手动运行: ${GREEN}npm run dev${NC}"
  echo -e "${YELLOW}     访问: ${GREEN}http://localhost:3000${NC}"
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  🎉 一键部署流程完成！${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
