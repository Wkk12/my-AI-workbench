# 🐛 BUGS.md — 项目踩坑日记

> 每个 bug 背后都是一个被浪费的小时。记下来，别再踩。

---

## #1 macOS 平台兼容性：`grep -oP` + `lsof` 进程名截断

**日期**：2026-07-10  
**影响**：小红书/抖音发布 → CDP 多文件上传失败 → 死循环重试  
**严重度**：🔴 阻断

### 故障链

```
lsof 输出进程名被截断 (Google Chrome → Google)
  → grep "Google Chrome" 匹配不到
    → grep -oP (BSD grep 不支持)
      → CDP 端口检测失败
        → 回退到硬编码端口 62414（实际是 62544）
          → CDP 连接失败
            → 图片上传失败
              → 发布失败 → 用户重试 → 死循环
```

### 三行代码，两个 bug

```javascript
// ❌ 原版 (publish-xhs.js line ~249)
const portOut = execSync(
  'lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep "Google Chrome" | grep -oP "localhost:\\K\\d+" | head -1 || echo 62414',
  { encoding: 'utf8', timeout: 5000 }
).trim();
```

| Bug | 原因 | macOS 的表现 |
|-----|------|-------------|
| `grep "Google Chrome"` | `lsof` 输出列宽限制，进程名被截断为 `Google`（COMMAND 列最多 15 字符） | 永远匹配不上 |
| `grep -oP` | macOS 自带 BSD grep，不支持 `-P`（Perl 正则）和 `\K`（lookbehind） | 报错 `grep: invalid option -- P` |

```javascript
// ✅ 修复后
const portOut = execSync(
  "lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep 'Google' | sed -n 's/.*localhost:\\([0-9]*\\).*/\\1/p' | head -1 || echo 62414",
  { encoding: 'utf8', timeout: 5000 }
).trim();
```

### 为什么故障没被检测到

1. `try/catch` 吞了 `grep -P` 的错误 → 静默回退到 `62414`
2. 端口 `62414` 没有进程监听 → CDP 连接超时，不是立即失败
3. CDP 错误信息 `Cannot connect to Chrome CDP at port 62414: fetch failed` 被淹没在长日志里
4. 用户重试 → 同一条代码路径 → 同样失败 → 死循环

### 铁律

- ❌ **永远不要在跨平台脚本里用 `grep -P`**，用 `sed` 或 `awk`
- ❌ **永远不要用硬编码端口兜底**，应该扫描多个候选端口或直接失败
- ✅ **`lsof` 的进程名会被截断**，`grep` 时用短名前缀匹配
- ✅ **CDP 端口检测用 `curl http://localhost:{port}/json` 验证**（比 `lsof` 更可靠）
- ✅ **发布脚本应加最大重试次数**：3 次失败后放弃并输出清晰错误

### 影响范围

| 文件 | 行号 | 状态 |
|------|------|------|
| `scripts/publisher/publish-xhs.js` | ~249 | ✅ 已修复 |
| `scripts/publisher/publish-douyin.js` | ~268 | ✅ 已修复 |

### 检测方法

发布到 mac 平台前，运行：
```bash
# 验证 CDP 端口检测
lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep "Google" | sed -n 's/.*localhost:\([0-9]*\).*/\1/p' | head -1

# 验证 CDP 可用
curl -s http://localhost:{port}/json | python3 -c "import sys,json; print(len(json.load(sys.stdin)),'targets')"
```
