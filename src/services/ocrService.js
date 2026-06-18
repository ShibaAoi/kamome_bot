async function recognizeImage() {
  const provider = (process.env.OCR_PROVIDER || 'mock').toLowerCase();
  if (provider === 'mock') return process.env.MOCK_OCR_TEXT || '';
  throw new Error(`OCR_PROVIDER "${provider}" は未実装です。ocrService.js にプロバイダーを追加してください。`);
}

module.exports = { recognizeImage };

