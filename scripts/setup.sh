#!/bin/bash
# setup.sh — my-AI-workbench 环境初始化
set -e

echo "🛠️  my-AI-workbench 环境检查"
echo "=============================="

# 1. Node.js
echo ""
echo "📦 Node.js..."
if command -v node &>/dev/null; then
  echo "  ✅ node $(node -v)"
else
  echo "  ❌ 请安装 Node.js 22+: https://nodejs.org"
  exit 1
fi

# 2. npm 依赖
echo ""
echo "📦 npm 依赖..."
npm install --silent 2>/dev/null && echo "  ✅ 已安装" || echo "  ⚠️ npm install 失败，请手动执行"

# 3. Python + uv (browser-act 的前置)
echo ""
echo "🐍 Python + uv..."
if command -v python3 &>/dev/null; then
  echo "  ✅ python3 $(python3 --version 2>&1)"
else
  echo "  ❌ 需要 Python 3.12+: https://python.org"
fi

if command -v uv &>/dev/null; then
  echo "  ✅ uv $(uv --version 2>&1 | head -1)"
else
  echo "  📥 安装 uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# 4. browser-act（核心依赖：浏览器自动化）
echo ""
echo "🌐 browser-act..."
if command -v browser-act &>/dev/null; then
  echo "  ✅ browser-act 已安装"
else
  echo "  📥 安装 browser-act..."
  uv tool install browser-act-cli --python 3.12
  export PATH="$HOME/.local/bin:$PATH"
  echo "  ✅ 安装完成"
fi

# 5. Chrome 浏览器
echo ""
echo "🌐 Chrome 浏览器..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  if [ -d "/Applications/Google Chrome.app" ]; then
    echo "  ✅ Chrome 已安装"
  else
    echo "  ⚠️ 未检测到 Chrome，browser-act 需要 Chrome"
    echo "     macOS: brew install --cask google-chrome"
  fi
elif [[ "$OSTYPE" == "linux"* ]]; then
  if command -v google-chrome &>/dev/null || command -v chromium &>/dev/null; then
    echo "  ✅ Chrome/Chromium 已安装"
  else
    echo "  ⚠️ 未检测到 Chrome"
    echo "     Ubuntu: sudo apt install google-chrome-stable"
  fi
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
  echo "  ℹ️ Windows: 请手动安装 Chrome"
fi

# 6. 浏览器配置
echo ""
echo "🔧 浏览器配置..."
if command -v browser-act &>/dev/null; then
  if browser-act browser list 2>/dev/null | grep -q "chrome_local"; then
    echo "  ✅ Chrome 浏览器已配置"
  else
    echo "  ⚠️ 需要创建 Chrome 浏览器:"
    echo "     browser-act browser create chrome --name workbench"
  fi
else
  echo "  ⏭️ 跳过（browser-act 未安装）"
fi

# 7. API Key
echo ""
echo "🔑 API Key..."
QWAPI_KEY="${QWAPI_API_KEY:-}"
if [ -n "$QWAPI_KEY" ]; then
  echo "  ✅ QWAPI_API_KEY 已设置"
else
  echo "  ⚠️ 未检测到 QWAPI_API_KEY"
  echo "     注册: https://qweapi.com → 获取 Key"
  echo "     设置: echo 'QWAPI_API_KEY=你的Key' >> ~/.hermes/.env"
fi

echo ""
echo "=============================="
echo "🎉 初始化完成！"
echo "   启动开发服务器: npm run dev"
echo "   发布内容: 打开 http://localhost:3000 → 内容创作"
