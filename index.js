const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cron = require('node-cron');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const GROUP_NAME  = process.env.GROUP_NAME  || 'pamp-lana-test';
const SEND_HOUR   = process.env.SEND_HOUR   || '21';
const TIMEZONE    = process.env.TIMEZONE    || 'UTC';
const TARGET_DATE = '2026-04-17';
const GIFS_DIR    = path.join(__dirname, 'gifs');
const USED_FILE   = path.join(__dirname, 'used_gifs.json');
// ──────────────────────────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

let qrCodeData = null;
let isReady    = false;

app.get('/test', async (req, res) => {
  if (!isReady) return res.send('<h1>⏳ Bot not connected yet.</h1>');
  await sendCountdown();
  res.send('<h1>✅ Test message sent! Check your WhatsApp group.</h1>');
});

app.get('/groups', async (req, res) => {
  if (!isReady) return res.send('<h1>⏳ Bot not connected yet.</h1>');
  const chats = await client.getChats();
  const groups = chats.filter(c => c.isGroup);
  res.send(`<h1>Your WhatsApp Groups</h1><ul>${groups.map(g => `<li>${g.name}</li>`).join('')}</ul>`);
});

app.get('/', async (req, res) => {
  if (isReady) {
    return res.send(`<h1>✅ Bot is connected and running!</h1><p>Sending daily countdown to <strong>${GROUP_NAME}</strong> at ${SEND_HOUR}:00.</p>`);
  }
  if (!qrCodeData) {
    return res.send(`<h1>⏳ Starting up...</h1><p>Please refresh in a few seconds.</p><meta http-equiv="refresh" content="3">`);
  }
  const qrImage = await qrcode.toDataURL(qrCodeData);
  res.send(`
    <h1>📱 Scan this QR code with WhatsApp</h1>
    <ol>
      <li>Open WhatsApp on your phone</li>
      <li>Go to <strong>Settings → Linked Devices → Link a Device</strong></li>
      <li>Scan the QR code below</li>
    </ol>
    <img src="${qrImage}" style="width:300px;height:300px;" />
    <p><em>QR codes expire. Refresh this page to get a new one if needed.</em></p>
    <meta http-equiv="refresh" content="20">
  `);
});

app.listen(PORT, () => console.log(`🌐 Open the app URL to scan the QR code (port ${PORT})`));

// ─── WhatsApp Client ───────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: '/usr/bin/chromium',
    headless: true,
    timeout: 120000,
    protocolTimeout: 120000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
    ],
  },
});

client.on('qr', (qr) => {
  qrCodeData = qr;
  console.log('QR code ready — open the app URL in a browser to scan it');
});

client.on('ready', () => {
  isReady    = true;
  qrCodeData = null;
  console.log('✅ WhatsApp connected! Bot is running.');
  scheduleCountdown();
});

client.on('disconnected', (reason) => {
  console.log('⚠️  WhatsApp disconnected:', reason);
  isReady = false;
});

// ─── Gif Picker (no repeats until all used) ────────────────────────────────────
function pickGif() {
  const allGifs = fs.readdirSync(GIFS_DIR).filter(f => f.endsWith('.gif'));

  let used = [];
  if (fs.existsSync(USED_FILE)) {
    used = JSON.parse(fs.readFileSync(USED_FILE, 'utf8'));
  }

  const remaining = allGifs.filter(f => !used.includes(f));
  const pool = remaining.length > 0 ? remaining : allGifs; // reset when all used

  const chosen = pool[Math.floor(Math.random() * pool.length)];

  const newUsed = remaining.length > 0 ? [...used, chosen] : [chosen];
  fs.writeFileSync(USED_FILE, JSON.stringify(newUsed));

  return chosen;
}

// ─── Countdown Logic ───────────────────────────────────────────────────────────
function getDaysLeft() {
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(TARGET_DATE);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function buildMessage(daysLeft, name) {
  if (daysLeft <= 0) return null;
  return `heheheh only ${daysLeft} day${daysLeft === 1 ? '' : 's'} till our pamplona girls trip!!! ❤️\ntoday ${name} is counting down for us keke\nremember to look through our itinerary here: https://docs.google.com/document/d/1XTdl6_gjwZ4XHcFLudFPn5mKciNnzpM8gQPx9OdfyCI/edit?usp=sharing\nmeet yall very soon!`;
}

async function sendCountdown() {
  const daysLeft = getDaysLeft();
  const gifFile  = pickGif();
  const name     = path.basename(gifFile, '.gif');
  const message  = buildMessage(daysLeft, name);

  if (!message) {
    console.log('📅 Target date reached — no message sent.');
    return;
  }

  const chats = await client.getChats();
  const group  = chats.find(chat => chat.isGroup && chat.name === GROUP_NAME);

  if (!group) {
    console.error(`❌ Group "${GROUP_NAME}" not found. Check GROUP_NAME setting.`);
    return;
  }

  const media = MessageMedia.fromFilePath(path.join(GIFS_DIR, gifFile));
  await group.sendMessage(media, { caption: message });
  console.log(`✅ Sent with gif "${gifFile}": ${message}`);
}

function scheduleCountdown() {
  cron.schedule(`0 ${SEND_HOUR} * * *`, sendCountdown, { timezone: TIMEZONE });
  console.log(`📅 Scheduled: daily at ${SEND_HOUR}:00 (${TIMEZONE})`);
}

client.initialize();
