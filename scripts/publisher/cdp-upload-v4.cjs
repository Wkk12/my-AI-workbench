#!/usr/bin/env node
/**
 * CDP upload v4 — triggers native file dialog + intercepts it
 */
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const CDP_PORT = parseInt(process.argv[2], 10);
const FILE_PATH = process.argv[3];

if (!CDP_PORT || !FILE_PATH) {
  console.error("Usage: node cdp-upload-v4.cjs <cdpPort> <filePath>");
  process.exit(1);
}

const absPath = path.resolve(FILE_PATH);
if (!fs.existsSync(absPath)) { console.error("File not found:", absPath); process.exit(1); }

async function main() {
  const targets = await fetch(`http://localhost:${CDP_PORT}/json`).then(r => r.json());
  const page = targets.find(t => t.type === "page" && t.url.includes("creator.xiaohongshu.com"));
  if (!page) { console.error("No page target"); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.once("open", r));
  
  let id = 0;
  const send = (m, p) => new Promise((resolve, reject) => {
    const mid = ++id;
    const timer = setTimeout(() => { reject(new Error(`timeout: ${m}`)); }, 15000);
    ws.send(JSON.stringify({ id: mid, method: m, params: p }));
    const handler = data => {
      const msg = JSON.parse(data.toString());
      if (msg.id === mid) { clearTimeout(timer); ws.removeListener("message", handler); resolve(msg.result); }
    };
    ws.on("message", handler);
  });

  try {
    // 1. Enable file chooser interception
    await send("Page.setInterceptFileChooserDialog", { enabled: true });
    console.log("1. interception enabled");

    // 2. Find and click the file input
    const docResult = await send("DOM.getDocument", { depth: -1 });
    const qsaResult = await send("DOM.querySelectorAll", {
      nodeId: docResult.root.nodeId,
      selector: "input[type=\"file\"]",
    });
    
    if (!qsaResult.nodeIds?.length) { console.error("No file input found"); ws.close(); process.exit(1); }
    const inputId = qsaResult.nodeIds[qsaResult.nodeIds.length - 1];
    
    // Get box model to click it
    const boxModel = await send("DOM.getBoxModel", { nodeId: inputId });
    if (boxModel?.model?.content) {
      const [x1, y1, x2, y2] = boxModel.model.content;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 });
    } else {
      // Fallback: click via JS
      await send("Runtime.evaluate", { expression: "document.querySelector('input[type=\"file\"]').click()" });
    }
    console.log("2. clicked file input, waiting for chooser...");

    // 3. Wait for file chooser
    let handled = false;
    const handler = async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === "Page.fileChooserOpened" && !handled) {
        handled = true;
        console.log("3. file chooser opened");
        await send("Page.handleFileChooser", { action: "accept", files: [absPath] });
        console.log("4. file accepted:", path.basename(absPath));
        
        // Wait 2s then dispatch events
        await new Promise(r => setTimeout(r, 2000));
        await send("Runtime.evaluate", {
          expression: `
            (function(){
              var inp = document.querySelectorAll('input[type="file"]');
              inp = inp[inp.length-1];
              if (inp && inp.files && inp.files.length > 0) {
                inp.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
                inp.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true}));
                return 'events dispatched, files:'+inp.files.length;
              }
              return 'no files on input';
            })()
          `
        });
        ws.close();
      }
    };
    ws.on("message", handler);

    // Timeout
    await new Promise(r => setTimeout(r, 10000));
    if (!handled) {
      console.error("timeout: no file chooser");
      ws.close();
      process.exit(1);
    }
  } catch (e) {
    console.error("error:", e.message);
    ws.close();
    process.exit(1);
  }
}

main();
