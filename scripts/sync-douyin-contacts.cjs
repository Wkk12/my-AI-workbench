/**
 * 抖音联系人同步 Worker
 * 自动从抖音创作者私信页面提取所有联系人，保存为 contacts json
 * 
 * 用法: node scripts/sync-douyin-contacts.cjs
 * 输出: data/douyin-contacts.json
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SESSION = "dy_monitor";
const MESSAGE_URL = "https://creator.douyin.com/creator-micro/data/following/chat";
const OUTPUT_FILE = path.join(__dirname, "..", "data", "douyin-contacts.json");

function ba(cmd, timeout = 30000) {
  try {
    return execSync(`browser-act --session ${SESSION} ${cmd}`, {
      encoding: "utf-8", timeout,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const err = e.stderr?.toString() || e.message;
    throw new Error(`browser-act failed: ${err.slice(0, 200)}`);
  }
}

function baStdin(js, timeout = 15000) {
  try {
    return execSync(`browser-act --session ${SESSION} eval --stdin`, {
      input: js,
      encoding: "utf-8", timeout,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const err = e.stderr?.toString() || e.message;
    throw new Error(`browser-act eval failed: ${err.slice(0, 200)}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getVisibleNames() {
  const js = `(() => {
    const els = document.querySelectorAll('[class*=item-header-name]');
    return JSON.stringify(Array.from(els).map(e => e.textContent.trim()).filter(n => n));
  })()`;
  return JSON.parse(baStdin(js));
}

function isGroupName(name) {
  if (!name || name.length === 0) return true;
  if (name.includes("群") && (name.includes("❤️") || name.includes("讨论") || name.includes("粉丝") || name.includes("变美"))) return true;
  if (name.includes("群消息")) return true;
  return false;
}

async function main() {
  console.log("🔄 正在连接浏览器会话...");

  // 1. 导航到私信页面
  try {
    ba(`navigate ${MESSAGE_URL}`, 30000);
    await sleep(3000);
    
    // 轮询等待联系人加载
    for (let w = 0; w < 20; w++) {
      const names = getVisibleNames();
      if (names.length > 0) {
        console.log(`✅ 页面已加载，发现 ${names.length} 个可见联系人`);
        break;
      }
      if (w === 19) {
        console.log("❌ 超时：未发现任何联系人");
        process.exit(1);
      }
      await sleep(1000);
    }
    ba("wait stable");
  } catch (e) {
    console.log("❌ 导航失败:", e.message);
    process.exit(1);
  }

  // 2. 滚动加载所有联系人
  console.log("📋 扫描中...");
  const allNames = new Set();
  let prevSize = 0;
  let unchanged = 0;

  for (let s = 0; s < 30; s++) {
    const names = getVisibleNames();
    names.forEach(n => allNames.add(n));

    if (allNames.size > prevSize) {
      unchanged = 0;
      prevSize = allNames.size;
    } else {
      unchanged++;
      if (unchanged >= 4) break;
    }

    process.stdout.write(`\r  滚动 ${s + 1}/30, 已发现 ${allNames.size} 个联系人`);

    // 滚动
    baStdin(`(() => {
      document.querySelector('[class*=chat-content]')?.scrollBy(0, 500);
      document.querySelector('[class*=scroll]')?.scrollBy(0, 500);
    })()`);
    await sleep(1500);
    ba("wait stable");
  }
  process.stdout.write("\n");

  // 3. 过滤
  const contacts = Array.from(allNames).filter(n => !isGroupName(n));
  
  if (contacts.length === 0) {
    console.log("❌ 过滤后无联系人");
    process.exit(1);
  }

  console.log(`✅ 发现 ${contacts.length} 个联系人:`);
  contacts.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));

  // 4. 保存
  const output = {
    syncedAt: new Date().toISOString(),
    total: contacts.length,
    contacts: contacts.map(name => ({ name })),
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  
  console.log(`\n💾 已保存到 ${OUTPUT_FILE}`);
  console.log(`📊 共 ${contacts.length} 个联系人`);
}

main().catch(e => {
  console.error("❌ 同步失败:", e.message);
  process.exit(1);
});
