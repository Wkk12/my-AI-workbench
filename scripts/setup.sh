#!/bin/bash
# setup.sh — my-AI-workbench 环境初始化（7 步，与 /api/publish/check 对应）
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "🔧  my-AI-workbench 发布环境初始化"
echo "=================================="
echo "  也可以使用网页向导: http://localhost:3000/setup"
echo ""

# ===== 步骤 1: Node.js =====
echo "📍 步骤 1/7: Node.js 运行时"
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  echo "  ✅ $NODE_VER"
else
  echo "  ❌ 请安装 Node.js 22+: https://nodejs.org"
  exit 1
fi

# npm 依赖
echo ""
echo "📦 npm 依赖..."
cd "$PROJECT_ROOT"
npm install --silent 2>/dev/null && echo "  ✅ 已安装" || echo "  ⚠️ npm install 失败，请手动执行"

# ===== 步骤 2: Python 3 + uv =====
echo ""
echo "📍 步骤 2/7: Python 3 + uv"

if command -v python3 &>/dev/null; then
  echo "  ✅ python3 $(python3 --version 2>&1)"
else
  echo "  ❌ 需要 Python 3.12+: https://python.org/downloads/"
  echo "     Windows: 从 python.org 下载安装包，勾选 'Add Python to PATH'"
  exit 1
fi

if command -v uv &>/dev/null; then
  echo "  ✅ uv $(uv --version 2>&1 | head -1)"
else
  echo "  📥 安装 uv..."

  case "$OSTYPE" in
    darwin*|linux*)
      curl -LsSf https://astral.sh/uv/install.sh | sh
      ;;
    msys*|cygwin*|win*)
      powershell -c "irm https://astral.sh/uv/install.ps1 | iex" 2>/dev/null || {
        echo "  ⚠️ Windows 请手动安装 uv:"
        echo "     powershell -c \"irm https://astral.sh/uv/install.ps1 | iex\""
        echo "     或访问: https://docs.astral.sh/uv/getting-started/installation/"
      }
      ;;
  esac

  export PATH="$HOME/.local/bin:$PATH"
  if command -v uv &>/dev/null; then
    echo "  ✅ uv 安装完成"
  else
    echo "  ⚠️ uv 安装可能失败，请手动安装: https://docs.astral.sh/uv/getting-started/installation/"
  fi
fi

# ===== 步骤 3: browser-act =====
echo ""
echo "📍 步骤 3/7: browser-act 浏览器自动化"

if command -v browser-act &>/dev/null; then
  echo "  ✅ browser-act 已安装"
else
  echo "  📥 安装 browser-act..."
  uv tool install browser-act-cli --python 3.12
  export PATH="$HOME/.local/bin:$PATH"

  # Windows 下检查 .exe 后缀
  if command -v browser-act &>/dev/null || command -v browser-act.exe &>/dev/null; then
    echo "  ✅ 安装完成"
  else
    echo "  ⚠️ 可能未加入 PATH，请确保 ~/.local/bin 在 PATH 中"
  fi
fi

# ===== 步骤 4: Google Chrome =====
echo ""
echo "📍 步骤 4/7: Google Chrome 浏览器"

HAS_CHROME=false

case "$OSTYPE" in
  darwin*)
    if [ -d "/Applications/Google Chrome.app" ]; then
      HAS_CHROME=true
      echo "  ✅ Chrome 已安装"
    fi
    ;;
  msys*|cygwin*|win*)
    for p in \
      "/c/Program Files/Google/Chrome/Application/chrome.exe" \
      "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
      "$APPDATA/../Local/Google/Chrome/Application/chrome.exe"
    do
      if [ -f "$p" ]; then
        HAS_CHROME=true
        echo "  ✅ Chrome 已安装: $p"
        break
      fi
    done
    ;;
  linux*)
    if command -v google-chrome &>/dev/null || command -v chromium &>/dev/null; then
      HAS_CHROME=true
      echo "  ✅ Chrome/Chromium 已安装"
    fi
    ;;
esac

if [ "$HAS_CHROME" = false ]; then
  echo "  ⚠️ 未检测到 Chrome，请下载: https://www.google.com/chrome/"
fi

# ===== 步骤 5: Chrome 浏览器配置 =====
echo ""
echo "📍 步骤 5/7: Chrome 浏览器配置"

BROWSER_DATA="$PROJECT_ROOT/data/browser-id.json"

if command -v browser-act &>/dev/null; then
  EXISTING=$(browser-act browser list 2>/dev/null | grep -o 'chrome_local_[0-9]*' | head -1 || true)

  if [ -n "$EXISTING" ]; then
    echo "  ✅ 已有 Chrome 配置: $EXISTING"
  else
    echo "  📥 创建 Chrome 配置 (workbench)..."
    browser-act browser create chrome --name workbench 2>&1 | tail -1
    EXISTING=$(browser-act browser list 2>/dev/null | grep -o 'chrome_local_[0-9]*' | head -1 || true)
    echo "  ✅ 已创建: $EXISTING"
  fi

  mkdir -p "$PROJECT_ROOT/data"
  echo "{\"browserId\":\"$EXISTING\"}" > "$BROWSER_DATA"
  echo "  📁 浏览器 ID 已保存到 data/browser-id.json"
else
  echo "  ⏭️ 跳过（browser-act 未安装，首次发布时会自动配置）"
fi

# ===== 步骤 6: QWAPI Key =====
echo ""
echo "📍 步骤 6/7: AI 接口 Key (QWAPI)"

QWAPI_KEY="${QWAPI_API_KEY:-}"
if [ -n "$QWAPI_KEY" ]; then
  echo "  ✅ QWAPI_API_KEY 已设置"
else
  echo "  ⚠️ 未检测到 QWAPI_API_KEY"
  echo "     注册: https://qweapi.com → 获取 Key"
  echo "     配置方式:"
  echo "       macOS/Linux: echo 'QWAPI_API_KEY=你的Key' >> ~/.hermes/.env"
  echo "       或在网页设置中填入: http://localhost:3000/self-dev/settings"
fi

# ===== 步骤 7: 平台登录（提示） =====
echo ""
echo "📍 步骤 7/7: 平台登录"

echo "  ℹ️ 请在 Chrome 中登录各创作者平台（登录态会保存，后续无需重复）:"
echo "     📕 小红书: https://creator.xiaohongshu.com"
echo "     🎵 抖音:   https://creator.douyin.com"

echo ""
echo "=============================="
echo "🎉 环境初始化完成！"
echo ""
echo "📋 后续操作:"
echo "   1. 启动开发服务器: npm run dev"
echo "   2. 打开 http://localhost:3000/setup 点击「完成配置」"
echo "   3. 回到内容创作页，开始一键发布！"
echo ""
echo "💡 提示：也可以直接使用网页向导完成配置:"
echo "   http://localhost:3000/setup"
