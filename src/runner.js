const fs = require('node:fs');
const path = require('node:path');
const { main } = require('./index');

const pidPath = path.resolve(__dirname, '..', 'temp', 'bot.pid');

function isRunning(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

fs.mkdirSync(path.dirname(pidPath), { recursive: true });
if (fs.existsSync(pidPath)) {
  const existingPid = Number(fs.readFileSync(pidPath, 'utf8').trim());
  if (Number.isInteger(existingPid) && isRunning(existingPid)) {
    console.log(`[runner] Botは既に起動しています (PID ${existingPid})。`);
    process.exit(0);
  }
}

fs.writeFileSync(pidPath, String(process.pid), 'utf8');
process.on('exit', () => {
  try {
    if (fs.readFileSync(pidPath, 'utf8').trim() === String(process.pid)) fs.rmSync(pidPath, { force: true });
  } catch {}
});

main().catch((error) => {
  console.error('[fatal]', error);
  process.exitCode = 1;
});

