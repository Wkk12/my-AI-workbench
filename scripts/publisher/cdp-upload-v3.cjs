#!/usr/bin/env node
/**
 * CDP file upload via FileChooser interception (v3)
 * Properly triggers React/Vue re-render by intercepting the native file chooser dialog.
 * Usage: node cdp-upload-v3.cjs <cdpPort> <clickSelector> <file1> [file2...]
 */

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const CDP_PORT = parseInt(process.argv[2], 10);
const CLICK_SELECTOR = process.argv[3]; // CSS selector of element to click to open file chooser
const FILE_PATHS = process.argv.slice(4);

if (!CDP_PORT || !CLICK_SELECTOR || FILE_PATHS.length === 0) {
  console.error("Usage: node cdp-upload-v3.cjs <cdpPort> <clickSelector> <file1> [file2...]");
  process.exit(1);
}

// Resolve paths
const files = FILE_PATHS.map(f => path.resolve(f));
for (const f of files) {
  if (!fs.existsSync(f)) {
    console.error("File not found:", f);
    process.exit(1);
  }
}

async function main() {
  // Get available targets
  const targetsResp = await fetch(`http://localhost:${CDP_PORT}/json`);
  const targets = await targetsResp.json();
  const pageTarget = targets.find(
    t => t.type === "page" && (t.url.includes("creator.xiaohongshu.com") || t.url.includes("xiaohongshu"))
  );
  if (!pageTarget) {
    console.error("No xiaohongshu page target found");
    process.exit(1);
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(resolve => ws.once("open", resolve));

  let msgId = 0;
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 10000);
    ws.send(JSON.stringify({ id, method, params }));
    const handler = data => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timer);
        ws.removeListener("message", handler);
        resolve(msg.result);
      }
    };
    ws.on("message", handler);
  });

  try {
    // Enable file chooser interception
    await send("Page.setInterceptFileChooserDialog", { enabled: true });
    console.log("CDP: file chooser interception enabled");

    // Set up file chooser handler BEFORE clicking
    let handled = false;
    ws.on("message", async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === "Page.fileChooserOpened" && !handled) {
        handled = true;
        console.log("CDP: file chooser opened, accepting", files.length, "file(s)");
        await send("Page.handleFileChooser", {
          action: "accept",
          files: files,
        });
        console.log("CDP: files sent:", files.map(f => path.basename(f)).join(", "));
        // Allow time for processing then close
        setTimeout(() => ws.close(), 2000);
      }
    });

    // Click the element to open file chooser
    const clickResult = await send("Runtime.evaluate", {
      expression: `
        (function() {
          var el = document.querySelector('${CLICK_SELECTOR.replace(/'/g, "\\'")}');
          if (el) { el.click(); return 'clicked: ' + el.tagName; }
          return 'not found: ${CLICK_SELECTOR}';
        })()
      `,
    });
    console.log("CDP: click result:", clickResult.result?.value || "unknown");

    // Wait up to 15 seconds for file chooser
    await new Promise(resolve => setTimeout(resolve, 15000));
    if (!handled) {
      console.error("CDP: timeout - no file chooser detected");
      ws.close();
      process.exit(1);
    }
  } catch (e) {
    console.error("CDP error:", e.message);
    ws.close();
    process.exit(1);
  }
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
