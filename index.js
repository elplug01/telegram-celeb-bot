// index.js
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ======= Config =======
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';

// Channels to auto-post into (IDs or @usernames). You can override with CHANNELS in Railway.
const CHANNELS = (process.env.CHANNELS || '@Botacatest,@ofleakzz1')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// How often to post videos (minutes). Default: 120 min (2 hours).
const POST_EVERY_MINUTES = parseInt(process.env.POST_MINUTES || '120', 10);

// Caption + Button
const CAPTION = 'Free Onlyfans';
const VIDS_URL = 'https://t.me/offreel';

// Video rotation file_ids
const ROTATION_RAW = process.env.POST_VIDEO_FILE_IDS;
const ROTATION = (
  ROTATION_RAW
    ? ROTATION_RAW.split(',')
    : [
        'BAACAgEAAxkBAAID0WiieDS5loQVTRlJv4YldD5W1vkfAALjBQACPHwRRTzftenee1R1NgQ',
        'BAACAgEAAxkBAAID7Wii7DuLDfdcDFg4Noc1RPn3wp9NAAIgBQACPHwZRTwj5utrtNBfNgQ',
        'BAACAgEAAxkBAAID-2ijA_vIzqGDcWMuzpnU6c3KvfF1AAIkBQACPHwZRY9A7UCE5qikNgQ',
        'BAACAgEAAxkBAAID_WijBBemq9RHGdhAnedzYoeBkJLgAAIlBQACPHwZRf2StGh_jSKhNgQ',
        'BAACAgEAAxkBAAID_2ijBDC9Kfy36JNcI0_rfF7HSMAiAAImBQACPHwZRUXG3ilAkzO_NgQ'
      ]
).map(s => s.trim());

// ======= Load celebs list =======
const celebsPath = path.join(__dirname, 'celebs.json');
const celebs = JSON.parse(fs.readFileSync(celebsPath, 'utf8'));

// ======= Bot setup =======
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ======= Paging =======
const ITEMS_PER_PAGE = 7;
const pageByChat = new Map();

// ======= Helpers =======
function clamp(n, min, max) {
  return Math.max(min, Math.min(n, max));
}

function sendPage(chatId, page) {
  const totalPages = Math.max(1, Math.ceil(celebs.length / ITEMS_PER_PAGE));
  const safePage = clamp(page, 0, totalPages - 1);
  pageByChat.set(chatId, safePage);

  const start = safePage * ITEMS_PER_PAGE;
  const pageCelebs = celebs.slice(start, start + ITEMS_PER_PAGE);

  const keyboard = pageCelebs.map((c, i) => ([
    { text: c.name, callback_data: 'celeb_' + (start + i) }
  ]));

  const navRow = [];
  if (safePage > 0) navRow.push({ text: '⬅ Prev', callback_data: 'page_' + (safePage - 1) });
  navRow.push({ text: `Page ${safePage + 1}/${totalPages}`, callback_data: 'noop' });
  if (safePage < totalPages - 1) navRow.push({ text: 'Next ➡', callback_data: 'page_' + (safePage + 1) });
  keyboard.push(navRow);

  bot.sendMessage(chatId, 'Choose a creator:', {
    reply_markup: { inline_keyboard: keyboard }
  });
}

function sendCeleb(chatId, index) {
  const c = celebs[index];
  if (!c) return bot.sendMessage(chatId, 'That item is missing.');

  const caption = c.name;
  const buttons = [];

  if (c.bio && c.bio.trim()) {
    buttons.push([{ text: '🔗 View Leaks', url: c.bio }]);
  }

  const page = pageByChat.get(chatId) ?? Math.floor(index / ITEMS_PER_PAGE);
  buttons.push([{ text: '⬅ Back', callback_data: 'page_' + page }]);

  const opts = { caption, reply_markup: { inline_keyboard: buttons } };

  if (c.file_id) return bot.sendPhoto(chatId, c.file_id, opts);
  if (c.url) return bot.sendPhoto(chatId, c.url, opts);
  return bot.sendMessage(chatId, caption, opts);
}

// ======= Commands =======
bot.onText(/\/start|\/menu/, (msg) => {
  pageByChat.set(msg.chat.id, 0);
  sendPage(msg.chat.id, 0);
});

bot.on('callback_query', (q) => {
  const chatId = q.message.chat.id;
  const data = q.data || '';

  if (data.startsWith('page_')) {
    const page = Number(data.split('_')[1]);
    return sendPage(chatId, page);
  }

  if (data.startsWith('celeb_')) {
    const idx = Number(data.split('_')[1]);
    return sendCeleb(chatId, idx);
  }

  if (data === 'noop') return bot.answerCallbackQuery(q.id);
});

// ======= MEDIA ID HELPERS =======
bot.on('photo', msg => {
  const best = msg.photo?.at(-1);
  if (best) bot.sendMessage(msg.chat.id, `Photo file_id:\n${best.file_id}`);
});

bot.on('video', msg => {
  const v = msg.video;
  if (v?.file_id) bot.sendMessage(msg.chat.id, `Video file_id:\n${v.file_id}`);
});

// ======= AUTO-POSTER (2 hours, auto-delete) =======
const lastMessageByChannel = new Map();
let rotationIndex = 0;
let postInFlight = false;

async function postOnce() {
  if (postInFlight) return;
  postInFlight = true;

  const fileId = ROTATION[rotationIndex];
  const reply_markup = {
    inline_keyboard: [[{ text: '👉 Vids', url: VIDS_URL }]]
  };

  try {
    for (const channel of CHANNELS) {
      const prev = lastMessageByChannel.get(channel);
      if (prev) {
        try { await bot.deleteMessage(channel, prev); } catch {}
      }

      const sent = await bot.sendVideo(channel, fileId, {
        caption: CAPTION,
        supports_streaming: true,
        reply_markup
      });

      lastMessageByChannel.set(channel, sent.message_id);
    }

    rotationIndex = (rotationIndex + 1) % ROTATION.length;
  } catch (e) {
    console.error('Post error:', e.message);
  }

  postInFlight = false;
}

function startScheduler() {
  const ms = POST_EVERY_MINUTES * 60 * 1000;

  console.log(`Auto-poster every ${POST_EVERY_MINUTES} minutes`);
  console.log('Channels:', CHANNELS);

  postOnce();
  setInterval(postOnce, ms);
}

startScheduler();
console.log('Bot is running…');
