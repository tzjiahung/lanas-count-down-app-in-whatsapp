const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

(async () => {
  const { state } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });

  setTimeout(async () => {
    const groups = await sock.groupFetchAllParticipating();
    console.log('\n📋 Your WhatsApp groups:');
    Object.values(groups).forEach(g => console.log(' -', g.subject));
    process.exit();
  }, 8000);
})();
