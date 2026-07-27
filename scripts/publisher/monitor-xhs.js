#!/usr/bin/env node
/**
 * monitor-xhs.js — 小红书消息监控（点赞/评论/涨粉）
 *
 * 用法: node monitor-xhs.js
 * 输出: JSON { platform, fansCount, likeCount, commentCount, hasNew, checkedAt }
 *
 * 原理: browser-act 打开小红书创作后台 → 抓取关键 API 响应 → 对比上次 → 有新消息则告警
 *
 * 前置: Chrome 已登录 creator.xiaohongshu.com（cookie 持久化）
 * 告警: 写入 monitor_alert.txt（心跳会推送到微信）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  session: 'xhs_monitor',
  browserId: 'chrome_local_104622926254309377',
  xhsUrl: 'https://creator.xiaohongshu.com/new/home',
  stateFile: path.join(__dirname, '.monitor-xhs-state.json'),
  alertFile: path.join('/Users/wkk/.openclaw/workspace/sweetkiki', 'monitor_alert.txt'),
  timeout: 30000,
};

function bc(cmd, opts = {}) {
  const full = 'browser-act --session ' + CONFIG.session + ' ' + cmd;
  try {
    return execSync(full, { encoding: 'utf8', timeout: CONFIG.timeout, ...opts }).trim();
  } catch (e) {
    if (opts.ignoreError) return '';
    throw e;
  }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8')); }
  catch { return { xhs: { fansCount: -1, likeCount: -1, commentCount: -1, lastCheck: null } }; }
}

function saveState(state) {
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

function writeAlert(text) {
  const dir = path.dirname(CONFIG.alertFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG.alertFile, text);
}

async function main() {
  console.error('🔍 检查小红书消息…');

  // 1. 确保 session 存在
  try {
    bc('navigate ' + CONFIG.xhsUrl);
  } catch {
    console.error('  ⚠️ Session 不存在，创建新 session…');
    bc('browser open ' + CONFIG.browserId + ' "' + CONFIG.xhsUrl + '"');
    execSync('sleep 5');
  }
  execSync('sleep 3');

  // 2. 抓取 personal_info API
  const infoReq = parseApiResponse(
    bc('network requests --filter personal_info --type xhr', { ignoreError: true }),
    'personal_info'
  );

  // 3. 抓取 datacenter/account/base API  
  const accountReq = parseApiResponse(
    bc('network requests --filter "datacenter/account/base" --type xhr', { ignoreError: true }),
    'datacenter/account/base'
  );

  // 3a. 抓取 note_detail_new（笔记级数据）
  const noteReq = parseApiResponse(
    bc('network requests --filter note_detail_new --type xhr', { ignoreError: true }),
    'note_detail_new'
  );

  if (!infoReq || !accountReq) {
    // Check if logged in
    const href = bc('eval "window.location.href"', { ignoreError: true });
    if (href.includes('login')) {
      console.log(JSON.stringify({ error: 'login_required', platform: 'xiaohongshu' }));
      return;
    }
    console.log(JSON.stringify({ error: 'api_not_found', platform: 'xiaohongshu' }));
    return;
  }

  // 4. 解析个人数据
  let fansCount = 0, likeCount = 0;
  try {
    const info = JSON.parse(infoReq.body);
    const data = info.data || info;
    fansCount = data.fans_count || 0;
    likeCount = data.faved_count || 0;
  } catch (e) { console.error('  ⚠️ 个人数据解析失败:', e.message); }

  // 5. 解析账号数据（近7日新增）
  let commentCount = 0, riseFans = 0;
  try {
    const account = JSON.parse(accountReq.body);
    const seven = account.data?.seven || {};
    riseFans = seven.rise_fans_count || 0;
    // 统计近7日评论总数
    if (seven.comment_list) {
      commentCount = seven.comment_list.reduce((sum, d) => sum + (d.count || 0), 0);
    }
  } catch (e) { console.error('  ⚠️ 账号数据解析失败:', e.message); }

  // 6. 对比上次
  const state = loadState();
  const prev = state.xhs || { fansCount: -1, likeCount: -1, commentCount: -1 };
  const checkedAt = new Date().toISOString();

  const hasNewFans = prev.fansCount >= 0 && fansCount > prev.fansCount;
  const hasNewLikes = prev.likeCount >= 0 && likeCount > prev.likeCount;
  const hasNewComments = prev.commentCount >= 0 && commentCount > prev.commentCount;
  const hasNew = hasNewFans || hasNewLikes || hasNewComments;

  // 7. 保存状态
  state.xhs = { fansCount, likeCount, commentCount, lastCheck: checkedAt };
  saveState(state);

  // 8a. 解析笔记数据
  let noteData = null;
  if (noteReq) {
    try {
      noteData = JSON.parse(noteReq.body);
    } catch {}
  }

  // 8. 结果
  const result = {
    platform: 'xiaohongshu',
    fansCount,
    likeCount,
    commentCount,
    riseFans,
    hasNew,
    newFans: hasNewFans ? fansCount - prev.fansCount : 0,
    newLikes: hasNewLikes ? likeCount - prev.likeCount : 0,
    newComments: hasNewComments ? commentCount - prev.commentCount : 0,
    noteViews: noteData?.data?.seven?.view_count || 0,
    noteLikes: noteData?.data?.seven?.like_count || 0,
    noteComments: noteData?.data?.seven?.comment_count || 0,
    checkedAt,
  };

  // 9. 告警
  if (hasNew) {
    const parts = [];
    if (hasNewFans) parts.push(`涨粉 +${result.newFans}`);
    if (hasNewLikes) parts.push(`获赞 +${result.newLikes}`);
    if (hasNewComments) parts.push(`评论 +${result.newComments}`);
    const alert = `📕 小红书 ${parts.join(' | ')}\n粉丝: ${fansCount} | 赞: ${likeCount} | 7日评论: ${commentCount}`;
    writeAlert(alert);
    result.alert = alert;
    console.error('  🚨 ' + alert);
  }

  console.log(JSON.stringify(result));
  console.error(`  ✅ 完成: 粉=${fansCount} 赞=${likeCount} 评=${commentCount} 新增=${riseFans}`);
}

function parseApiResponse(networkOutput, filter) {
  const lines = networkOutput.split('\n');
  // Filter lines matching the path
  const matched = lines.filter(l => l.includes(filter));
  if (matched.length === 0) return null;
  
  // Use the last one
  const last = matched[matched.length - 1];
  const requestId = last.split(',')[0];
  
  // Fetch the response body
  let response;
  try {
    response = bc('network request ' + requestId, { ignoreError: true });
  } catch { return null; }
  
  const bodyMatch = response.match(/^response_body=(.+)$/m);
  if (!bodyMatch) return null;
  
  return { requestId, body: bodyMatch[1] };
}

main().catch(e => {
  console.log(JSON.stringify({ error: 'exception', message: e.message, platform: 'xiaohongshu' }));
  console.error('❌ ' + e.message);
  process.exit(1);
});
