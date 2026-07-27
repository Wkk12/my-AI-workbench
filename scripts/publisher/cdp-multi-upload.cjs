#!/usr/bin/env node
/**
 * CDP multi-file upload helper (v2)
 * Connects to Chrome DevTools Protocol and uploads multiple files to a file input.
 * Scans ALL page targets to find the one with the file input.
 * Also dispatches change/input events to trigger page JavaScript processing.
 *
 * Usage: node cdp-multi-upload.cjs <cdpPort> <cssSelector> <file1> [file2...]
 */

const CDP_PORT = parseInt(process.argv[2], 10);
const INPUT_SELECTOR = process.argv[3];
const FILE_PATHS = process.argv.slice(4);

if (!CDP_PORT || !INPUT_SELECTOR || FILE_PATHS.length === 0) {
  console.error('Usage: node cdp-multi-upload.cjs <cdpPort> <cssSelector> <file1> [file2...]');
  process.exit(1);
}

const fs = require('fs');
const path = require('path');

// Verify all files exist
const absPaths = FILE_PATHS.map(p => {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }
  return abs;
});

/**
 * Try to upload files via a single CDP target
 * Returns true if successful
 */
async function tryUploadTarget(wsUrl, targetUrl, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await connectAndUpload(wsUrl, targetUrl);
      if (result) return true;
      // If found element but upload failed, retry
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw e;
      }
    }
  }
  return false;
}

async function connectAndUpload(wsUrl, targetUrl) {
  const ws = new WebSocket(wsUrl);
  
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket timeout'));
    }, 8000);
    ws.onopen = () => { clearTimeout(timeout); resolve(); };
    ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket connect error')); };
  });

  let msgId = 0;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  try {
    // 1. Enable DOM and get document
    await send('DOM.enable');
    const doc = await send('DOM.getDocument', { depth: -1 });

    // 2. Find the file input — try multiple selectors
    const selectors = [INPUT_SELECTOR, 'input[type="file"]', '.upload-input', 'input[accept*="image"]'];
    let fileInputId = null;

    for (const sel of selectors) {
      const { nodeIds } = await send('DOM.querySelectorAll', {
        nodeId: doc.root.nodeId,
        selector: sel,
      });
      if (nodeIds && nodeIds.length > 0) {
        // Use the LAST input (usually the active upload input)
        fileInputId = nodeIds[nodeIds.length - 1];
        break;
      }
    }

    if (!fileInputId) {
      ws.close();
      return false; // Not found on this target
    }

    // 3. Set multiple files
    console.error(`  CDP: ${absPaths.length} file(s) → #${fileInputId} (${targetUrl ? new URL(targetUrl).hostname : 'unknown'})`);

    await send('DOM.setFileInputFiles', {
      files: absPaths,
      nodeId: fileInputId,
    });

    // 4. Dispatch change event
    await send('Runtime.enable');
    const dispatchScript = `
      (function() {
        var inputs = document.querySelectorAll('input[type="file"]');
        var inp = inputs[inputs.length - 1];
        if (!inp) return 'WARN: no file input found after upload';
        
        var hadFiles = inp.files.length;
        var names = [];
        for (var i = 0; i < hadFiles; i++) names.push(inp.files[i].name);
        
        // React needs native InputEvent for onChange to fire
        inp.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        
        // Also trigger React's internal event system via the root element
        if (hadFiles > 0) {
          return 'OK: ' + hadFiles + ' files (' + names.join(', ') + ')';
        }
        return 'WARN: 0 files on input, but change event dispatched';
      })()`;

    const result = await send('Runtime.evaluate', {
      expression: dispatchScript,
      returnByValue: true,
    });

    const value = result.result?.value || 'unknown';
    // Accept any non-FAIL result
    if (value.startsWith('FAIL')) {
      console.error(`  CDP events: ${value}`);
    } else {
      console.error(`  CDP events: ${value}`);
    }

    ws.close();
    return true;
  } catch (e) {
    ws.close();
    throw e;
  }
}

async function main() {
  // 1. Connect to browser and list ALL targets
  const browserUrl = `http://localhost:${CDP_PORT}/json`;
  let targets;
  try {
    const resp = await fetch(browserUrl);
    targets = await resp.json();
  } catch (e) {
    console.error(`Cannot connect to Chrome CDP at port ${CDP_PORT}: ${e.message}`);
    process.exit(1);
  }

  if (!targets || targets.length === 0) {
    console.error('No targets found at CDP port');
    process.exit(1);
  }

  // 2. Filter page targets (exclude devtools, extensions, etc.)
  const pageTargets = targets.filter(t => 
    t.type === 'page' && 
    t.url && 
    !t.url.startsWith('devtools://') &&
    !t.url.startsWith('chrome://') &&
    !t.url.startsWith('chrome-extension://') &&
    !t.url.startsWith('about:')
  );

  console.error(`  CDP: ${pageTargets.length} page targets to scan`);

  // 3. Try each target until we find the file input
  let found = false;
  for (const target of pageTargets) {
    if (!target.webSocketDebuggerUrl) continue;
    
    try {
      found = await tryUploadTarget(target.webSocketDebuggerUrl, target.url);
      if (found) {
        console.log('OK');
        process.exit(0);
      }
    } catch (e) {
      // Continue to next target
      continue;
    }
  }

  // If no target had the file input, also try non-page targets as fallback
  if (!found) {
    const otherTargets = targets.filter(t => 
      t.webSocketDebuggerUrl && 
      !pageTargets.includes(t)
    );
    for (const target of otherTargets) {
      try {
        found = await tryUploadTarget(target.webSocketDebuggerUrl, target.url);
        if (found) {
          console.log('OK');
          process.exit(0);
        }
      } catch (e) {
        continue;
      }
    }
  }

  console.error(`\n❌ No element found for "${INPUT_SELECTOR}" in ${targets.length} targets`);
  process.exit(1);
}

main().catch(e => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
