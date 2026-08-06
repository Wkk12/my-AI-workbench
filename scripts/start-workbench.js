const { execSync } = require('child_process');
const path = require('path');

// Start Next.js production server
const nextPath = path.join(__dirname, 'node_modules', '.bin', 'next');
console.log('Starting Workbench...');
try {
  execSync(`"${nextPath}" start`, { stdio: 'inherit', cwd: __dirname });
} catch (e) {
  console.error('Failed to start:', e.message);
}
