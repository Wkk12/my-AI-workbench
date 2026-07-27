/**
 * 抖音续火花 Worker v2 — 鲁棒版
 * 
 * 改进点：
 * 1. 不用 CSS 类名选择器（可能变化），改用文本扫描定位联系人
 * 2. 导航后验证页面状态（确保聊天列表已加载）
 * 3. 支持多级容错（首页→侧边栏→私信管理→等待加载→搜索）
 * 4. 会话过期自动检测
 * 
 * 用法: node scripts/spark-renew-worker.cjs '{"targets":["name1","name2"],"message":"文案"}'
 */
const { execSync } = require("child_process");

// 解析参数
const jsonArg = process.argv[2];
if (!jsonArg) { console.log("SPARK_ERROR:缺少 JSON 参数"); process.exit(1); }

let config;
try { config = JSON.parse(jsonArg); } catch { console.log("SPARK_ERROR:JSON 解析失败"); process.exit(1); }

const targets = config.targets;
const MESSAGE = config.message || "美少女珂来续火花啦~";
if (!targets || !targets.length) { console.log("SPARK_ERROR:缺少 targets"); process.exit(1); }

const SESSION = "dy_monitor";
const CHAT_URL = "https://creator.douyin.com/creator-micro/data/following/chat";
const HOME_URL = "https://creator.douyin.com/creator-micro/home";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ba(cmd, timeout = 30000) {
  try {
    return execSync(`browser-act --session ${SESSION} ${cmd}`, {
      encoding: "utf-8", timeout, stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const err = e.stderr?.toString() || e.message;
    // 检测会话失效
    if (err.includes("230301") || err.includes("No active session") || err.includes("SESSION_DEAD")) {
      throw new Error("SESSION_DEAD");
    }
    throw new Error(`ba failed: ${cmd.slice(0,60)} - ${err.slice(0,200)}`);
  }
}

function bail(msg) { console.log("SPARK_ERROR:" + msg); process.exit(1); }

// ─── 核心：文本扫描搜索联系人 ───
/** 
 * 在页面中通过文本内容搜索联系人并点击
 * 不依赖 CSS 类名，扫描所有包含目标文本的元素
 */
async function searchAndClickContact(name) {
  const safeName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
  
  // 在聊天列表区域搜索：查找所有 div/span，匹配文本后点击父级可点击元素
  const js = `(()=>{
    var target='${safeName}';
    // 先尝试精确匹配的 .item-header-name-* 类元素（兼容旧版）
    var headers=document.querySelectorAll('[class*=item-header-name]');
    for(var i=0;i<headers.length;i++){
      if(headers[i].textContent.trim()===target){
        var li=headers[i].closest('li')||headers[i].closest('[role=list-item]');
        if(li){
          var a=li.querySelector('a');
          if(a){a.click();return'OK';}
          li.click();return'OK';
        }
      }
    }
    // 回退方案：扫描页面上所有叶子文本节点
    var all=document.querySelectorAll('div,span,li');
    for(var i=0;i<all.length;i++){
      var el=all[i];
      if(el.children.length===0 && el.textContent.trim()===target){
        var clickable=el.closest('[role=list-item]')||el.closest('li')||el.parentElement;
        if(clickable){
          var a2=clickable.querySelector('a');
          if(a2){a2.click();return'OK';}
          clickable.click();return'OK';
        }
      }
    }
    return'NOT_FOUND';
  })()`;

  return ba(`eval "${js.replace(/"/g, '\\"')}"`);
}

/** 滚动聊天列表 */
async function scrollChatList() {
  return ba(`eval "(()=>{var g=document.querySelector('[aria-label=grid]');if(g){g.scrollBy(0,400);return'SCROLLED';}return'NO_GRID';})()"`);
}

/** 检查页面是否有聊天输入框 */
function hasChatInput() {
  try {
    const st = ba("state", 10000);
    return st.includes("chat-input");
  } catch { return false; }
}

function isGroupChat() {
  try {
    const st = ba("state", 10000);
    return st.includes("群成员") || st.includes("群聊");
  } catch { return false; }
}

/** 返回聊天列表（点击返回按钮或重新导航） */
async function goBack() {
  try {
    ba("click 71", 5000);
    await sleep(2000);
  } catch {
    try { await navigateToChat(); } catch {}
  }
}

/** 导航到聊天页（带状态验证） */
async function navigateToChat() {
  // 先回首页建立会话
  try { ba(`navigate ${HOME_URL}`, 30000); await sleep(3000); } catch {}
  
  // 导航到私信页
  ba(`navigate ${CHAT_URL}`, 30000);
  await sleep(5000);
  ba("wait stable");
  
  // 验证聊天列表是否加载
  const itemCount = ba(`eval "document.querySelectorAll('[class*=item-header-name]').length + ',' + document.querySelectorAll('[role=list-item]').length"`);
  const [headerCount, listItemCount] = itemCount.split(",").map(Number);
  
  if (headerCount === 0 && listItemCount === 0) {
    // 聊天列表未加载，尝试点击"朋友私信"标签
    console.error("  📋 聊天列表为空，尝试激活标签...");
    ba(`eval "(()=>{var tabs=document.querySelectorAll('[role=tab]');for(var i=0;i<tabs.length;i++){var t=tabs[i];if(t.textContent.includes('朋友')){t.click();return'CLICKED_FRIENDS';}}return'NO_TAB';})()"`);
    await sleep(4000);
    ba("wait stable");
    
    // 再次检查
    const count2 = ba(`eval "document.querySelectorAll('[class*=item-header-name]').length + ',' + document.querySelectorAll('[role=list-item]').length"`);
    const [h2, l2] = count2.split(",").map(Number);
    if (h2 === 0 && l2 === 0) {
      throw new Error("CHAT_LIST_EMPTY: 聊天列表未能加载，请检查抖音登录态");
    }
  }
  
  console.error(`  ✅ 聊天列表已加载: ${headerCount || listItemCount} 个联系人`);
}

// ─── 主流程 ───
async function main() {
  try {
    await navigateToChat();
  } catch (e) {
    if (e.message.includes("SESSION_DEAD")) bail("抖音会话已失效(dy_monitor 离线)");
    bail("导航到聊天页失败: " + e.message);
  }

  const results = [];
  const MAX_SCROLL = 20; // 增加到 20 次

  for (let i = 0; i < targets.length; i++) {
    const name = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${name}... `);

    try {
      // 先在当前视口搜索
      let found = await searchAndClickContact(name);
      
      // 如果找不到，滚动并继续搜索
      let scrollCount = 0;
      while (found !== "OK" && scrollCount < MAX_SCROLL) {
        const sr = await scrollChatList();
        if (sr !== "SCROLLED") break;
        await sleep(1500);
        found = await searchAndClickContact(name);
        scrollCount++;
      }

      if (found !== "OK") {
        process.stdout.write(found + ` (滚动${scrollCount}次)\n`);
        results.push(name + ":" + found);
        continue;
      }

      await sleep(3000);
      ba("wait stable");

      // 跳过群聊
      if (isGroupChat()) {
        process.stdout.write("群聊跳过\n");
        results.push(name + ":群聊跳过");
        await goBack();
        continue;
      }

      // 检查输入框
      if (!hasChatInput()) {
        process.stdout.write("无输入框\n");
        results.push(name + ":无输入框");
        await goBack();
        continue;
      }

      // 发送消息
      const msgSafe = MESSAGE.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
      const typeResult = ba(`eval "(()=>{var d=document.querySelector('.chat-input-nSWBco');if(!d)return'NO_INPUT';d.focus();d.textContent='${msgSafe}';d.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true}));d.dispatchEvent(new Event('change',{bubbles:true}));var b=document.querySelector('.chat-btn');return b&&!b.disabled?'BTN_READY':'BTN_DISABLED'})()"`);
      
      if (typeResult.includes("NO_INPUT")) {
        process.stdout.write("输入失败\n");
        results.push(name + ":输入失败");
        await goBack();
        continue;
      }

      await sleep(500);
      ba("keys Enter");
      await sleep(2000);
      process.stdout.write("已发送\n");
      results.push(name + ":已发送");

      await goBack();

    } catch (e) {
      if (e.message.includes("SESSION_DEAD")) {
        process.stdout.write("会话过期\n");
        results.push(name + ":SESSION_DEAD");
        break; // 会话过期，后面的也都发不了
      }
      process.stdout.write("错误\n");
      results.push(name + ":错误-" + e.message.slice(0, 80));
      try { await navigateToChat(); } catch {}
    }

    if (i < targets.length - 1) {
      await sleep(3000 + Math.random() * 5000);
    }
  }

  console.log("SPARK_RESULT:" + JSON.stringify(results));
}

main().catch(e => bail(e.message));
