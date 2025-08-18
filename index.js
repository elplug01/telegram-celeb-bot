// index.js
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ======= Config =======
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';

// Channel can be a username like "@Botacatest" or a numeric chat id (e.g. -1001234567890)
const CHANNEL = process.env.CHANNEL || '@Botacatest';

// How often to post (minutes)
const POST_EVERY_MINUTES = parseInt(process.env.POST_MINUTES || '5', 10);

// Media to post each cycle (Telegram file_id is most reliable)
const VIDEO_FILE_ID =
  process.env.POST_VIDEO_FILE_ID ||
  'BAACAgEAAxkBAAID0WiieDS5loQVTRlJv4YldD5W1vkfAALjBQACPHwRRTzftenee1R1NgQ';

// ======= Load celebs list (for the bot menu) =======
const celebsPath = path.join(__dirname, 'celebs.json');
const celebs = JSON.parse(fs.readFileSync(celebsPath, 'utf8'));

// ======= Bot setup =======
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ======= Paging state (per chat) =======
const ITEMS_PER_PAGE = 7;
const pageByChat = new Map();

// ======= Helpers =======
function clamp(n, min, max) { return Math.max(min, Math.min(n, max)); }

function sendPage(chatId, page) {
  const totalPages = Math.max(1, Math.ceil(celebs.length / ITEMS_PER_PAGE));
  const safePage = clamp(page, 0, totalPages - 1);
  pageByChat.set(chatId, safePage);

  const start = safePage * ITEMS_PER_PAGE;
  const pageCelebs = celebs.slice(start, start + ITEMS_PER_PAGE);

  const keyboard = pageCelebs.map((c, i) => ([
    { text: c.name, callback_data: `celeb_${start + i}` }
  ]));

  const navRow = [];
  if (safePage > 0) navRow.push({ text: '⬅ Prev', callback_data: `page_${safePage - 1}` });
  navRow.push({ text: `Page ${safePage + 1}/${totalPages}`, callback_data: 'noop' });
  if (safePage < totalPages - 1) navRow.push({ text: 'Next ➡', callback_data: `page_${safePage + 1}` });
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

  if (c.bio && typeof c.bio === 'string' && c.bio.trim().length > 0) {
    buttons.push([{ text: '🔗 View Leaks', url: c.bio }]);
  }

  const page = pageByChat.get(chatId) ?? Math.floor(index / ITEMS_PER_PAGE);
  buttons.push([{ text: '⬅ Back', callback_data: `page_${page}` }]);

  const opts = { caption, reply_markup: { inline_keyboard: buttons } };

  if (c.file_id && typeof c.file_id === 'string') {
    return bot.sendPhoto(chatId, c.file_id, opts).catch(() =>
      bot.sendMessage(chatId, 'Could not load the photo for this item.')
    );
  }
  if (c.url && typeof c.url === 'string') {
    return bot.sendPhoto(chatId, c.url, opts).catch(() =>
      bot.sendMessage(chatId, 'Could not load the photo for this item.')
    );
  }
  return bot.sendMessage(chatId, caption, opts);
}

// ======= Commands / Callbacks =======
bot.onText(/\/start|\/menu/, (msg) => {
  pageByChat.set(msg.chat.id, 0);
  sendPage(msg.chat.id, 0);
});

bot.on('callback_query', (q) => {
  const chatId = q.message.chat.id;
  const data = q.data || '';

  if (data.startsWith('page_')) {
    const page = parseInt(data.split('_')[1], 10) || 0;
    return sendPage(chatId, page);
  }
  if (data.startsWith('celeb_')) {
    const idx = parseInt(data.split('_')[1], 10);
    return sendCeleb(chatId, idx);
  }
  if (data === 'noop') {
    return bot.answerCallbackQuery(q.id);
  }
});

// ======= Reply with snippet when users send a PHOTO =======
bot.on('photo', async (msg) => {
  try {
    const best = msg.photo?.[msg.photo.length - 1];
    if (!best) throw new Error('No photo sizes');

    const file = await bot.getFile(best.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const snippet = '```json\n' + JSON.stringify({ file_id: best.file_id }, null, 2) + '\n```';
    await bot.sendMessage(
      msg.chat.id,
      `Got it! Here is the snippet you can paste into celebs.json:\n\n${snippet}\nDirect file URL (optional):\n${fileUrl}`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    bot.sendMessage(msg.chat.id, 'Sorry, I could not read that photo.');
  }
});

// ======= Reply with snippet when users send a VIDEO (mp4) =======
bot.on('video', async (msg) => {
  try {
    const v = msg.video;
    if (!v) throw new Error('No video');

    const file = await bot.getFile(v.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const payload = {
      file_id: v.file_id,
      width: v.width,
      height: v.height,
      duration: v.duration,
      mime_type: v.mime_type
    };
    const snippet = '```json\n' + JSON.stringify(payload, null, 2) + '\n```';

    await bot.sendMessage(
      msg.chat.id,
      `Got it! Video details for celebs.json (usually you only need "file_id"):\n\n${snippet}\nDirect file URL (optional):\n${fileUrl}`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    bot.sendMessage(msg.chat.id, 'Sorry, I could not read that media.');
  }
});

// ======= Reply with snippet when users send a GIF/animation =======
bot.on('animation', async (msg) => {
  try {
    const a = msg.animation;
    if (!a) throw new Error('No animation');

    const file = await bot.getFile(a.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const payload = {
      file_id: a.file_id,
      width: a.width,
      height: a.height,
      duration: a.duration,
      mime_type: a.mime_type
    };
    const snippet = '```json\n' + JSON.stringify(payload, null, 2) + '\n```';

    await bot.sendMessage(
      msg.chat.id,
      `Got it! Animation details (usually you only need "file_id"):\n\n${snippet}\nDirect file URL (optional):\n${fileUrl}`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    bot.sendMessage(msg.chat.id, 'Sorry, I could not read that media.');
  }
});

// ======= AUTO-POSTER (every N minutes) =======
// This version does NOT post on boot. It waits for the first interval to avoid duplicate
// posts during rolling deploys. It also deletes the previous post each cycle.

let lastPostedMessageId = null;
let postInFlight = false;

async function postOnce() {
  if (postInFlight) {
    console.log('[poster] Skipping: send in flight');
    return;
  }
  postInFlight = true;
  try {
    if (lastPostedMessageId) {
      try {
        await bot.deleteMessage(CHANNEL, lastPostedMessageId);
        console.log('[poster] Deleted previous message:', lastPostedMessageId);
      } catch (e) {
        console.warn('[poster] Could not delete previous (maybe already gone):', e.message);
      }
      lastPostedMessageId = null;
    }

    const sent = await bot.sendVideo(CHANNEL, VIDEO_FILE_ID, {
      caption: '🔥 Check out our bot here: https://t.me/Freakysl_bot',
      supports_streaming: true
    });
    lastPostedMessageId = sent.message_id;
    console.log('[poster] Posted message:', lastPostedMessageId);
  } catch (e) {
    console.error('[poster] Post failed:', e.message);
  } finally {
    postInFlight = false;
  }
}

function startScheduler() {
  const minutes = POST_EVERY_MINUTES;
  const ms = minutes * 60 * 1000;

  const INSTANCE_ID =
    process.env.RAILWAY_DEPLOYMENT_ID ||
    process.env.RAILWAY_ENVIRONMENT_ID ||
    `local-${Math.random().toString(36).slice(2, 8)}`;

  console.log(`[poster] Scheduler starting (every ${minutes} min). instance=${INSTANCE_ID}`);

  // Wait one full interval before the first post to avoid double-post on deploys
  setTimeout(function tick() {
    postOnce().finally(() => setTimeout(tick, ms));
  }, ms);
}

startScheduler();

console.log('Bot is running…');
