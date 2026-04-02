const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const cron = require('node-cron');
const express = require('express');

// ─── Config ───────────────────────────────────────────────────────────────────
const GROUP_NAME  = process.env.GROUP_NAME  || 'My Group';
const SEND_HOUR   = process.env.SEND_HOUR   || '8';
const TIMEZONE    = process.env.TIMEZONE    || 'UTC';
const TARGET_DATE = '2026-04-17';
// ──────────────────────────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

let sock        = null;
let qrCodeData  = null;
let isConnected = false;
let cronStarted = false;

app.get('/groups', async (req, res) => {
  if (!isConnected) return res.send('<h1>⏳ Bot not connected yet.</h1>');
  const groups = await sock.groupFetchAllParticipating();
  const names = Object.values(groups).map(g => g.subject);
  res.send(`<h1>Your WhatsApp Groups</h1><ul>${names.map(n => `<li>${n}</li>`).join('')}</ul>`);
});

app.get('/', async (req, res) => {
  if (isConnected) {
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

// ─── WhatsApp Connection ───────────────────────────────────────────────────────
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  sock = makeWASocket({ auth: state, printQRInTerminal: false });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeData = qr;
      console.log('QR code ready — open the app URL in a browser to scan it');
    }

    if (connection === 'close') {
      isConnected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) connectToWhatsApp();
    }

    if (connection === 'open') {
      isConnected = true;
      qrCodeData  = null;
      console.log('✅ WhatsApp connected! Bot is running.');
      if (!cronStarted) {
        scheduleCountdown();
        cronStarted = true;
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

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

  const groups = Object.values(await sock.groupFetchAllParticipating());
  const group  = groups.find(g => g.subject === GROUP_NAME);

  if (!group) {
    console.error(`❌ Group "${GROUP_NAME}" not found. Check GROUP_NAME setting.`);
    return;
  }

  await sock.sendMessage(group.id, { text: message });
  console.log(`✅ Sent: ${message}`);
}

function scheduleCountdown() {
  cron.schedule(`0 ${SEND_HOUR} * * *`, sendCountdown, { timezone: TIMEZONE });
  console.log(`📅 Scheduled: daily at ${SEND_HOUR}:00 (${TIMEZONE})`);
}

connectToWhatsApp();
