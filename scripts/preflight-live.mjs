const required = ['DATABASE_URL', 'JWT_SECRET', 'DASHBOARD_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (process.env.JWT_SECRET === 'change-me-with-32-plus-random-chars') {
  console.error('Preflight blocked. JWT_SECRET still uses the example value.');
  process.exit(1);
}

if (process.env.DASHBOARD_PASSWORD === 'change-me') {
  console.error('Preflight blocked. DASHBOARD_PASSWORD still uses the example value.');
  process.exit(1);
}

const liveRequested = process.env.PAPER_TRADING === 'false';
if (liveRequested) {
  const liveMissing = ['BYBIT_API_KEY', 'BYBIT_API_SECRET'].filter((key) => !process.env[key]);
  if (liveMissing.length) {
    console.error(`Live mode blocked. Missing: ${liveMissing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.BYBIT_TESTNET !== 'false') {
    console.error('Live mode blocked. BYBIT_TESTNET must be false only after checklist approval.');
    process.exit(1);
  }
}

console.log('Preflight passed. Safe configuration detected.');
