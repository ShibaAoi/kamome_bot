require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { createWorker } = require('tesseract.js');

const rootDir = path.resolve(__dirname, '..');
const pidPath = path.join(rootDir, 'temp', 'ocr-agent.pid');
const cachePath = path.join(rootDir, 'temp', 'tesseract-cache');
const workerUrl = String(process.env.WORKER_URL || 'https://kamome-menu.shiba-6d3.workers.dev').replace(/\/$/, '');
const token = process.env.LOCAL_OCR_TOKEN || '';
const pollMilliseconds = Math.max(5, Number(process.env.OCR_POLL_SECONDS || 15)) * 1000;
const language = process.env.OCR_LANGUAGE || 'jpn';
let tesseractWorker = null;
let stopping = false;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isProcessRunning(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function acquirePid() {
  fs.mkdirSync(path.dirname(pidPath), { recursive: true });
  if (fs.existsSync(pidPath)) {
    const existingPid = Number(fs.readFileSync(pidPath, 'utf8').trim());
    if (Number.isInteger(existingPid) && isProcessRunning(existingPid)) {
      throw new Error(`OCRエージェントは既に起動しています (PID ${existingPid})。`);
    }
  }
  fs.writeFileSync(pidPath, String(process.pid), 'utf8');
}

function releasePid() {
  try {
    if (fs.readFileSync(pidPath, 'utf8').trim() === String(process.pid)) fs.rmSync(pidPath, { force: true });
  } catch {}
}

async function api(pathname, options = {}) {
  return fetch(`${workerUrl}${pathname}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(30_000),
  });
}

async function claimJob() {
  const response = await api('/ocr/jobs/claim', { method: 'POST' });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`OCRジョブ取得失敗 (${response.status})`);
  return response.json();
}

async function getTesseractWorker() {
  if (!tesseractWorker) {
    fs.mkdirSync(cachePath, { recursive: true });
    console.log(`[ocr] 日本語認識データを準備しています (${language})。`);
    tesseractWorker = await createWorker(language, 1, {
      cachePath,
      logger: (status) => {
        if (status.status === 'recognizing text' && Number.isFinite(status.progress)) {
          console.log(`[ocr] 認識中 ${Math.round(status.progress * 100)}%`);
        }
      },
    });
  }
  return tesseractWorker;
}

async function report(jobId, action, payload) {
  const response = await api(`/ocr/jobs/${jobId}/${action}`, { method: 'POST', body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `OCR結果送信失敗 (${response.status})`);
  return body;
}

async function processJob(job) {
  console.log(`[ocr] ${job.id} (${job.originalFileName}) を処理します。`);
  try {
    const imageResponse = await fetch(job.attachmentUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imageResponse.ok) throw new Error(`Discord画像取得失敗 (${imageResponse.status})`);
    const image = Buffer.from(await imageResponse.arrayBuffer());
    if (!image.length || image.length > 10 * 1024 * 1024) throw new Error('画像サイズが不正です。');
    const worker = await getTesseractWorker();
    const result = await worker.recognize(image);
    const response = await report(job.id, 'complete', { text: result.data.text });
    console.log(`[ocr] ${job.id} を完了しました（${response.menuCount}日分）。`);
  } catch (error) {
    console.error(`[ocr] ${job.id}: ${error.message}`);
    await report(job.id, 'fail', { error: error.message }).catch((reportError) => console.error(`[ocr] 失敗通知: ${reportError.message}`));
  }
}

async function stop() {
  if (stopping) return;
  stopping = true;
  if (tesseractWorker) await tesseractWorker.terminate().catch(() => {});
  releasePid();
}

async function main() {
  if (!token) throw new Error('LOCAL_OCR_TOKEN が未設定です。');
  acquirePid();
  process.on('exit', releasePid);
  process.on('SIGINT', () => stop().finally(() => process.exit(0)));
  process.on('SIGTERM', () => stop().finally(() => process.exit(0)));
  console.log(`[ocr] 待機を開始しました: ${workerUrl}`);
  while (!stopping) {
    try {
      const job = await claimJob();
      if (job) await processJob(job);
    } catch (error) {
      console.error(`[ocr] ${error.message}`);
    }
    if (!stopping) await sleep(pollMilliseconds);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[ocr] ${error.message}`);
    releasePid();
    process.exitCode = 1;
  });
}

module.exports = { acquirePid, claimJob, processJob };
