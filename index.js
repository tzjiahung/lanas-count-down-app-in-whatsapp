const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cron = require('node-cron');
const express = require('express');

// ─── Config ───────────────────────────────────────────────────────────────────
const GROUP_NAME  = process.env.GROUP_NAME  || 'My Group';   // exact WhatsApp group name
const SEND_HOUR   = process.env.SEND_HOUR   || '8';          // 24h format, e.g. '8' = 8 AM
const TIMEZONE    = process.env.TIMEZONE    || 'UTC';
const TARGET_DATE = '2026-04-17';
// ──────────────────────────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

let qrCodeData = null;
let isReady    = false;

// Simple web page to show the QR code for scanning
app.get('/', async (req, res) => {
  if (isReady) {
    return res.send(`
      <h1>✅ Bot is connected and running!</h1>
      <p>Daily countdown messages are being sent to <strong>${GROUP_NAME}</strong> every day at ${SEND_HOUR}:00.</p>
    `);
  }

  if (!qrCodeData) {
    return res.send(`
      <h1>⏳ Starting up...</h1>
      <p>Please refresh this page in a few seconds.</p>
      <meta http-equiv="refresh" content="3">
    `);
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
    <p><em>QR codes expire after ~20 seconds. Refresh this page to get a new one.</em></p>
    <meta http-equiv="refresh" content="20">
  `);
});

app.listen(PORT, () => console.log(`🌐 Open the app URL to scan the QR code (port ${PORT})`));

// ─── WhatsApp Client ───────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  },
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
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
  if (daysLeft <= 0)  return null; // trip has passed, stop sending
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
    console.error(`❌ Group "${GROUP_NAME}" not found. Double-check the GROUP_NAME setting.`);
    return;
  }

  await group.sendMessage(message);
  console.log(`✅ Sent: ${message}`);
}

function scheduleCountdown() {
  // Runs every day at SEND_HOUR:00
  cron.schedule(`0 ${SEND_HOUR} * * *`, sendCountdown, { timezone: TIMEZONE });
  console.log(`📅 Scheduled: daily at ${SEND_HOUR}:00 (${TIMEZONE})`);
}

client.initialize();
