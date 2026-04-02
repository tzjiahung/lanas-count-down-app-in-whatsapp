const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cron = require('node-cron');
const express = require('express');

// ─── Config ───────────────────────────────────────────────────────────────────
const GROUP_NAME  = process.env.GROUP_NAME  || 'My Group';
const SEND_HOUR   = process.env.SEND_HOUR   || '21';
const TIMEZONE    = process.env.TIMEZONE    || 'UTC';
const TARGET_DATE = '2026-04-17';
// ──────────────────────────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

let qrCodeData = null;
let isReady    = false;

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

// ─── Countdown Logic ───────────────────────────────────────────────────────────
function getDaysLeft() {
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(TARGET_DATE);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function buildMessage(daysLeft) {
  if (daysLeft <= 0)  return null;
  if (daysLeft === 1) return '🔥 *ONLY 1 DAY LEFT!!* ✈️🌴';
  return `🔥 *ONLY ${daysLeft} DAYS LEFT!!* ✈️🌴`;
}

async function sendCountdown() {
  const daysLeft = getDaysLeft();
  const message  = buildMessage(daysLeft);

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

  await group.sendMessage(message);
  console.log(`✅ Sent: ${message}`);
}

function scheduleCountdown() {
  cron.schedule(`0 ${SEND_HOUR} * * *`, sendCountdown, { timezone: TIMEZONE });
  console.log(`📅 Scheduled: daily at ${SEND_HOUR}:00 (${TIMEZONE})`);
}

client.initialize();
