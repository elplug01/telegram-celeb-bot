// index.js
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ── Simple single-instance lock (prevents two processes running) ──
const LOCK_PATH = '/tmp/auto_poster.lock';
try {
  const fd = fs.openSync(LOCK_PATH, 'wx'); // fails if file exists
  fs.writeFileSync(fd, String(process.pid));
  process.on('exit', () => { try { fs.unlinkSync(LOCK_PATH); } catch {} });
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
} catch {
  console.error('Another instance is already running. Exiting.');
  process.exit(0);
}

// ── Load celebs.json for menu (optional) ──
let celebs = [];
try {
  celebs = JSON.parse(fs.readFileSync(path.join(__dirname, 'celebs.json'), 'utf8'));
} catch (_) {}

// ── Bot setup ──
const token = '7623685237:AAFlNTEvtgQWDOoosNX5gBM9hZnEs_GfOO4';
const bot = new TelegramBot(token, { polling: true });

// ── Menu paging (unchanged) ──
const ITEMS_PER_PAGE = 7;
const pageByChat = new Map();
const clamp = (n, a, b) => Math.max(a, Math.min(n, b));

function sendPage(chatId, page) {
  const totalPages = Math.max(1, Math.ceil(celebs.length / ITEMS_PER_PAGE));
  const safePage = clamp(page, 0, totalPages - 1);
  pageByChat.set(chatId, safePage);

  const start = safePage * ITEMS_PER_PAGE;
  const pageCelebs = celebs.slice(start, start + ITEMS_PER_PAGE);

  const keyboard = pageCelebs.map((c, i) => ([
    { text: c.name, callback_data: `celeb_${start + i}` }
  ]));

  const nav = [];
  if (safePage > 0) nav.push({ text: '⬅ Prev', callback_data: `page_${safePage - 1}` });
  nav.push({ text: `Page ${safePage + 1}/${totalPages}`, callback_data: 'noop' });
  if (safePage < totalPages - 1) nav.push({ text: 'Next ➡', callback_data: `page_${safePage + 1}` });
  keyboard.push(nav);

  bot.sendMessage(chatId, 'Choose a creator:', { reply_markup: { inline_keyboard: keyboard } });
}

function sendCeleb(chatId, index) {
  const c = celebs[index];
  if (!c) return bot.sendMessage(chatId, 'That item is missing.');

  const buttons = [];
  if (c.bio) buttons.push([{ text: '🔗 View Leaks', url: c.bio }]);

  const page = pageByChat.get(chatId) ?? Math.floor(index / ITEMS_PER_PAGE);
  buttons.push([{ text: '⬅ Back', callback_data: `page_${page}` }]);

  const opts = { caption: c.name, reply_markup: { inline_keyboard: buttons } };

  if (c.file_id) return bot.sendPhoto(chatId, c.file_id, opts).catch(() =>
    bot.sendMessage(chatId, 'Could not load the photo.')
  );
  if (c.url) return bot.sendPhoto(chatId, c.url, opts).catch(() =>
    bot.sendMessage(chatId, 'Could not load the photo.')
  );
  return bot.sendMessage(chatId, c.name, opts);
}

bot.onText(/\/start|\/menu/, (m) => sendPage(m.chat.id, 0));
bot.on('callback_query', (q) => {
  const chatId = q.message.chat.id;
  const data = q.data || '';
  if (data.startsWith('page_')) return sendPage(chatId, parseInt(data.split('_')[1], 10) || 0);
  if (data.startsWith('celeb_')) return sendCeleb(chatId, parseInt(data.split('_')[1], 10));
  if (data === 'noop') return bot.answerCallbackQuery(q.id);
});

// ── Auto Poster (every 5 minutes) ──
const CHANNEL = '@Botacatest';
const CLIP_FILE_ID = 'BAACAgEAAxkBAAID0WiieDS5loQVTRlJv4YldD5W1vkfAALjBQACPHwRRTzftenee1R1NgQ';
const POST_TEXT = '🔥 Check out our bot here: https://t.me/Freakysl_bot';
const INTERVAL_MS = 5 * 60 * 1000;

let lastPostedMessageId = null;
let inFlight = false;

async function safeDelete(chat, messageId) {
  if (!messageId) return;
  try { await bot.deleteMessage(chat, messageId); } catch (_) {}
}

async function postCycle() {
  if (inFlight) return; // prevent overlap inside this process
  inFlight = true;
  try {
    await safeDelete(CHANNEL, lastPostedMessageId);
    const sent = await bot.sendVideo(CHANNEL, CLIP_FILE_ID, {
      caption: POST_TEXT,
      supports_streaming: true
    });
    lastPostedMessageId = sent?.message_id || null;
  } catch (err) {
    console.error('Auto-post error:', err?.message || err);
  } finally {
    inFlight = false;
  }
}

// Kick off immediately, then every INTERVAL_MS
postCycle();
setInterval(postCycle, INTERVAL_MS);
