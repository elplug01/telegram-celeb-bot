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

// How often to post videos (minutes). Default: 2 (test). Set POST_MINUTES in Railway for production.
const POST_EVERY_MINUTES = parseInt(process.env.POST_MINUTES || '2', 10);

// Caption + Button
const CAPTION = 'Free Onlyfans';
const VIDS_URL = 'https://t.me/offreel';

// Video rotation file_ids
const ROTATION_RAW = process.env.POST_VIDEO_FILE_IDS;
const ROTATION = (
  ROTATION_RAW
    ? ROTATION_RAW.split(',')  // from env: "id1,id2,id3"
    : [
        'BAACAgEAAxkBAAID0WiieDS5loQVTRlJv4YldD5W1vkfAALjBQACPHwRRTzftenee1R1NgQ',
        'BAACAgEAAxkBAAID7Wii7DuLDfdcDFg4Noc1RPn3wp9NAAIgBQACPHwZRTwj5utrtNBfNgQ',
        'BAACAgEAAxkBAAID-2ijA_vIzqGDcWMuzpnU6c3KvfF1AAIkBQACPHwZRY9A7UCE5qikNgQ',
        'BAACAgEAAxkBAAID_WijBBemq9RHGdhAnedzYoeBkJLgAAIlBQACPHwZRf2StGh_jSKhNgQ',
        'BAACAgEAAxkBAAID_2ijBDC9Kfy36JNcI0_rfF7HSMAiAAImBQACPHwZRUXG3ilAkzO_NgQ'
      ]
).map(s => s.toString().trim());

// ======= Load celebs list (for the bot menu) =======
const celebsPath = path.join(__dirname, 'celebs.json');
const celebs = JSON.parse(fs.readFileSync(celebsPath, 'utf8'));

// ======= Bot setup =======
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ======= Paging state (per chat) =======
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
  navRow.push({ text: 'Page ' + (safePage + 1) + '/' + totalPages, callback_data: 'noop' });
  if (safePage < totalPages - 1) navRow.push({ text: 'Next ➡', callback_data: 'page_' + (safePage + 1) });
  keyboard.push(navRow);

  bot.sendMessage(chatId, 'Choose a creator:', {
    reply_markup: { inline_keyboard: keyboard }
  });
}

function sendCeleb(chatId, index) {
  const c = celebs[index];
  if (!c) {
    bot.sendMessage(chatId, 'That item is missing.');
    return;
  }

  const caption = c.name;
  const buttons = [];

  if (c.bio && typeof c.bio === 'string' && c.bio.trim().length > 0) {
    buttons.push([{ text: '🔗 View Leaks', url: c.bio }]);
  }

  const page = pageByChat.get(chatId) != null
    ? pageByChat.get(chatId)
    : Math.floor(index / ITEMS_PER_PAGE);

  buttons.push([{ text: '⬅ Back', callback_data: 'page_' + page }]);

  const opts = { caption: caption, reply_markup: { inline_keyboard: buttons } };

  if (c.file_id && typeof c.file_id === 'string') {
    bot.sendPhoto(chatId, c.file_id, opts).catch(() => {
      bot.sendMessage(chatId, 'Could not load the photo for this item.');
    });
    return;
  }

  if (c.url && typeof c.url === 'string') {
    bot.sendPhoto(chatId, c.url, opts).catch(() => {
      bot.sendMessage(chatId, 'Could not load the photo for this item.');
    });
    return;
  }

  bot.sendMessage(chatId, caption, opts);
}

// ======= Commands / Callbacks =======
bot.onText(/\/start|\/menu/, (msg) => {
  pageByChat.set(msg.chat.id, 0);
  sendPage(msg.chat.id, 0);
});

bot.on('callback_query', (q) => {
  const chatId = q.message.chat.id;
  const data = q.data || '';

  if (data.indexOf('page_') === 0) {
    const page = parseInt(data.split('_')[1], 10) || 0;
    sendPage(chatId, page);
    return;
  }

  if (data.indexOf('celeb_') === 0) {
    const idx = parseInt(data.split('_')[1], 10);
    sendCeleb(chatId, idx);
    return;
  }

  if (data === 'noop') {
    bot.answerCallbackQuery(q.id);
    return;
  }
});

// ======= Simple ID helpers (optional) =======
bot.on('photo', async (msg) => {
  try {
    const best = msg.photo && msg.photo[msg.photo.length - 1];
    if (!best) throw new Error('No photo sizes');
    const text = 'Photo file_id:\n' + best.file_id;
    await bot.sendMessage(msg.chat.id, text);
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Sorry, I could not read that photo.');
  }
});

bot.on('video', async (msg) => {
  try {
    const v = msg.video;
    if (!v || !v.file_id) throw new Error('No video');
    const text = 'Video file_id:\n' + v.file_id;
    await bot.sendMessage(msg.chat.id, text);
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Sorry, I could not read that video.');
  }
});

// ======= AUTO-POSTER (2 min, multi-channel, auto-delete) =======
const lastMessageByChannel = new Map(); // channel -> message_id
let rotationIndex = 0;
let postInFlight = false;

async function postOnce() {
  if (postInFlight) {
    console.log('[poster] Skipping: send in flight');
    return;
  }
  postInFlight = true;

  const fileId = ROTATION[rotationIndex];
  const reply_markup = {
    inline_keyboard: [
      [{ text: '👉 Vids', url: VIDS_URL }]
    ]
  };

  try {
    for (const channel of CHANNELS) {
      const prev = lastMessageByChannel.get(channel);
      if (prev) {
        try {
          await bot.deleteMessage(channel, prev);
          console.log('[poster] Deleted previous in', channel, 'id=', prev);
        } catch (e) {
          console.warn('[poster] Could not delete previous in', channel, ':', e.message);
        }
      }

      const sent = await bot.sendVideo(channel, fileId, {
        caption: CAPTION,
        supports_streaming: true,
        reply_markup: reply_markup
      });

      lastMessageByChannel.set(channel, sent.message_id);
      console.log('[poster] Posted to', channel, 'msg_id=', sent.message_id);
    }

    rotationIndex = (rotationIndex + 1) % ROTATION.length;
  } catch (e) {
    console.error('[poster] Post failed:', e.message);
  } finally {
    postInFlight = false;
  }
}

function startScheduler() {
  const minutes = POST_EVERY_MINUTES;
  const ms = minutes * 60 * 1000;

  console.log('[poster] Scheduler starting (every ' + minutes + ' min)');
  console.log('[poster] Channels:', CHANNELS.join(', '));
  console.log('[poster] Rotation size:', ROTATION.length);

  // First post immediately, then interval
  postOnce();
  setInterval(postOnce, ms);
}

startScheduler();

console.log('Bot is running…');
