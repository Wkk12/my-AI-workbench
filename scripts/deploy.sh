#!/bin/bash
# ============================================================
# 喵站工作台 · 服务器部署脚本
# 将项目部署到阿里云服务器
# ============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "========================================="
echo "  🐱 喵站工作台 · 服务器一键部署"
echo "========================================="
echo ""

# ── 第1步：收集服务器信息 ──
echo "📋 步骤 1/5: 服务器信息"
echo "-----------------------------------------"

if [ -z "$DEPLOY_HOST" ]; then
  read -p "  请输入阿里云服务器 IP 地址: " DEPLOY_HOST
fi
echo "  ✅ 服务器 IP: $DEPLOY_HOST"

if [ -z "$DEPLOY_USER" ]; then
  read -p "  请输入 SSH 用户名 (默认: root): " DEPLOY_USER
  DEPLOY_USER=${DEPLOY_USER:-root}
fi
echo "  ✅ SSH 用户: $DEPLOY_USER"

DEPLOY_PATH=${DEPLOY_PATH:-/opt/my-AI-workbench}
echo "  ✅ 部署路径: $DEPLOY_PATH"

# ── 第2步：检查 SSH 连接 ──
echo ""
echo "📋 步骤 2/5: 检查 SSH 连接"
echo "-----------------------------------------"
if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${DEPLOY_USER}@${DEPLOY_HOST}" "echo OK" 2>/dev/null; then
  echo "  ✅ SSH 连接成功"
else
  echo "  ❌ SSH 连接失败，请检查 IP 地址和用户名"
  exit 1
fi

# ── 第3步：rsync 项目文件 ──
echo ""
echo "📋 步骤 3/5: 同步项目文件"
echo "-----------------------------------------"
echo "  📦 正在打包并上传项目..."

# 创建远程目录
ssh "${DEPLOY_USER}@${DEPLOY_HOST}" "mkdir -p ${DEPLOY_PATH}"

# rsync 排除 node_modules、.next、prisma/*.db
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'prisma/*.db' \
  --exclude '*.db' \
  --exclude '.git' \
  --exclude '.env' \
  "$PROJECT_DIR/" \
  "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

echo "  ✅ 项目文件同步完成"

# ── 第4步：服务器端安装和构建 ──
echo ""
echo "📋 步骤 4/5: 服务器端安装依赖 & 构建"
echo "-----------------------------------------"

ssh "${DEPLOY_USER}@${DEPLOY_HOST}" << 'DEPLOY_SCRIPT'
set -e

DEPLOY_PATH=${DEPLOY_PATH:-/opt/my-AI-workbench}
cd "$DEPLOY_PATH"

echo "  📦 检查 Node.js..."
if ! command -v node &> /dev/null; then
  echo "  ❌ 服务器未安装 Node.js，请先安装 Node.js 22+"
  echo "  💡 安装命令: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi

NODE_VERSION=$(node --version)
echo "  ✅ Node.js: $NODE_VERSION"

echo ""
echo "  📦 安装项目依赖 (npm ci)..."
npm ci --production=false 2>&1 | tail -5

echo ""
echo "  📦 生成 Prisma Client..."
npx prisma generate 2>&1

echo ""
echo "  📦 运行数据库迁移..."
npx prisma migrate deploy 2>&1

echo ""
echo "  📦 构建 Next.js 项目 (npm run build)..."
npm run build 2>&1 | tail -10

echo ""
echo "  📦 启动/重启 PM2 服务..."
if command -v pm2 &> /dev/null; then
  pm2 delete workbench 2>/dev/null || true
  pm2 start npm --name workbench -- run start
  pm2 save
  echo "  ✅ PM2 服务已启动"
else
  echo "  ⚠️ pm2 未安装，使用 nohup 启动"
  echo "  💡 建议安装 pm2: npm install -g pm2"
  nohup npm run start > /tmp/workbench.log 2>&1 &
  echo "  ✅ 服务已后台启动，日志: /tmp/workbench.log"
fi

echo ""
echo "  ✅ 服务器端部署完成!"
DEPLOY_SCRIPT

# ── 第5步：输出结果 ──
echo ""
echo "========================================="
echo "  🎉 部署完成!"
echo "========================================="
echo ""
echo "  🌐 访问地址: http://${DEPLOY_HOST}:3000"
echo ""
echo "  💡 管理命令 (SSH 到服务器后):"
echo "     pm2 status          # 查看服务状态"
echo "     pm2 logs workbench  # 查看日志"
echo "     pm2 restart workbench  # 重启服务"
echo "     pm2 stop workbench  # 停止服务"
echo ""
echo "  💡 如需配置 HTTPS/反向代理，建议使用 nginx"
echo ""
