// index.js
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ======= Config =======
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CHANNEL = process.env.CHANNEL || '@Botacatest';
const POST_EVERY_MINUTES = parseInt(process.env.POST_MINUTES || '5', 10);

// Buttons
const BUTTON_TEXT = '👉 Full Leaks';
const BUTTON_URL  = 'https://t.me/Freakysl_bot';
const SECOND_BUTTON_TEXT = '👉 Vids';
const SECOND_BUTTON_URL  = 'https://t.me/offreel';

// ======= Rotation list (sequential) =======
const VIDEO_IDS = [
  'BAACAgEAAxkBAAID0WiieDS5loQVTRlJv4YldD5W1vkfAALjBQACPHwRRTzftenee1R1NgQ',
  'BAACAgEAAxkBAAID7Wii7DuLDfdcDFg4Noc1RPn3wp9NAAIgBQACPHwZRTwj5utrtNBfNgQ',
  'BAACAgEAAxkBAAID-2ijA_vIzqGDcWMuzpnU6c3KvfF1AAIkBQACPHwZRY9A7UCE5qikNgQ',
  'BAACAgEAAxkBAAID_WijBBemq9RHGdhAnedzYoeBkJLgAAIlBQACPHwZRf2StGh_jSKhNgQ',
  'BAACAgEAAxkBAAID_2ijBDC9Kfy36JNcI0_rfF7HSMAiAAImBQACPHwZRUXG3ilAkzO_NgQ'
];

// ======= Load celebs list =======
const celebsPath = path.join(__dirname, 'celebs.json');
const celebs = JSON.parse(fs.readFileSync(celebsPath, 'utf8'));

// ======= Bot setup =======
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ======= Paging state =======
const ITEMS_PER_PAGE = 7;
const pageByChat = new Map();

// ======= State for poster =======
const STATE_PATH = path.join(__dirname, 'poster_state.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { lastMessageId: null, rotateIndex: 0 }; }
}
function saveState(state) {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state), 'utf8'); }
  catch (e) { console.warn('[poster] Could not save state:', e.message); }
}
let { lastMessageId, rotateIndex } = loadState();

// ======= Helpers =======
function clamp(n, min, max) { return Math.max(min, Math.min(n, max)); }
function sendPage(chatId, page) { /* ... unchanged ... */ }
function sendCeleb(chatId, index) { /* ... unchanged ... */ }

// ======= Commands / Callbacks =======
bot.onText(/\/start|\/menu/, (msg) => {
  pageByChat.set(msg.chat.id, 0);
  sendPage(msg.chat.id, 0);
});
bot.on('callback_query', (q) => { /* ... unchanged ... */ });

// ======= Media detection =======
bot.on('photo', async (msg) => { /* ... unchanged ... */ });
bot.on('video', async (msg) => { /* ... unchanged ... */ });

// ======= AUTO-POSTER =======
let postInFlight = false;

function pickNextVideoId() {
  const id = VIDEO_IDS[rotateIndex % VIDEO_IDS.length];
  rotateIndex = (rotateIndex + 1) % VIDEO_IDS.length;
  saveState({ lastMessageId, rotateIndex });
  return id;
}

async function postOnce() {
  if (postInFlight) return;
  postInFlight = true;
  try {
    if (lastMessageId) {
      try { await bot.deleteMessage(CHANNEL, lastMessageId); } catch {}
      lastMessageId = null;
      saveState({ lastMessageId, rotateIndex });
    }

    const videoId = pickNextVideoId();

    const sent = await bot.sendVideo(CHANNEL, videoId, {
      caption: '🔥 Free OnlyFans 🔥',
      supports_streaming: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: BUTTON_TEXT, url: BUTTON_URL }],
          [{ text: SECOND_BUTTON_TEXT, url: SECOND_BUTTON_URL }]
        ]
      }
    });

    lastMessageId = sent.message_id;
    saveState({ lastMessageId, rotateIndex });
  } catch (e) {
    console.error('[poster] Post failed:', e.message);
  } finally {
    postInFlight = false;
  }
}

function startScheduler() {
  const ms = POST_EVERY_MINUTES * 60 * 1000;
  setTimeout(function tick() {
    postOnce().finally(() => setTimeout(tick, ms));
  }, ms);
}
startScheduler();

console.log('Bot is running…');
