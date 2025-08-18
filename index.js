// index.js
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ---------- CONFIG (edit these 3 if needed) ----------
const TOKEN   = '7623685237:AAFlNTEvtgQWDOoosNX5gBM9hZnEs_GfOO4';
const CHANNEL = '@Botacatest';                 // your public channel @
const VIDEO_FILE_ID = 'BAACAgEAAxkBAAID0WiieDS5loQVTRlJv4YldD5W1vkfAALjBQACPHwRRTzftenee1R1NgQ';
// post every N minutes
const POST_EVERY_MINUTES = 5;
// -----------------------------------------------------

// Try to read celebs.json (optional feature)
let celebs = [];
try {
  const p = path.join(__dirname, 'celebs.json');
  if (fs.existsSync(p)) {
    celebs = JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(`[boot] Loaded celebs.json with ${celebs.length} entries`);
  } else {
    console.log('[boot] celebs.json not found — menu will still work but be empty.');
  }
} catch (e) {
  console.error('[boot] Failed to parse celebs.json:', e.message);
}

// --------- SINGLE INSTANCE LOCK ----------
const LOCK_PATH = path.join(__dirname, '.bot.lock');
try {
  if (fs.existsSync(LOCK_PATH)) {
    const oldPid = parseInt(fs.readFileSync(LOCK_PATH, 'utf8'), 10);
    if (!isNaN(oldPid)) {
      try {
        // if process exists, this won't throw
        process.kill(oldPid, 0);
        console.error(`[lock] Another instance is running (pid ${oldPid}). Exiting.`);
        process.exit(1);
      } catch {
        console.warn(`[lock] Stale lock for pid ${oldPid}. Taking over.`);
      }
    }
  }
  fs.writeFileSync(LOCK_PATH, String(process.pid));
  process.on('exit', () => { try { fs.unlinkSync(LOCK_PATH); } catch {} });
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
} catch (e) {
  console.error('[lock] Could not create lock:', e.message);
  process.exit(1);
}

// --------- BOT SETUP ----------
const bot = new TelegramBot(TOKEN, { polling: true });

// Paging state (per chat)
const ITEMS_PER_PAGE = 7;
const pageByChat = new Map();
const clamp = (n, min, max) => Math.max(min, Math.min(n, max));

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

  if (c.bio && typeof c.bio === 'string' && c.bio.trim()) {
    buttons.push([{ text: '🔗 View Leaks', url: c.bio }]);
  }
  const page = pageByChat.get(chatId) ?? Math.floor(index / ITEMS_PER_PAGE);
  buttons.push([{ text: '⬅ Back', callback_data: `page_${page}` }]);

  const opts = { caption, reply_markup: { inline_keyboard: buttons } };

  if (c.file_id) {
    return bot.sendPhoto(chatId, c.file_id, opts).catch(() =>
      bot.sendMessage(chatId, 'Could not load the photo for this item.')
    );
  }
  if (c.url) {
    return bot.sendPhoto(chatId, c.url, opts).catch(() =>
      bot.sendMessage(chatId, 'Could not load the photo for this item.')
    );
  }
  return bot.sendMessage(chatId, caption, opts);
}

// Commands
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

// When users send photos, reply with snippet (helper)
bot.on('photo', async (msg) => {
  try {
    const best = msg.photo?.[msg.photo.length - 1];
    if (!best) throw new Error('No photo sizes');

    const file = await bot.getFile(best.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    await bot.sendMessage(
      msg.chat.id,
      `Got it! Here is the snippet you can paste into celebs.json:\n\n` +
      '```json\n' +
      JSON.stringify({ file_id: best.file_id }, null, 2) +
      '\n```\n' +
      `Direct file URL (optional):\n${fileUrl}`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    bot.sendMessage(msg.chat.id, 'Sorry, I could not read that photo.');
  }
});

// --------- AUTO-POSTER (single scheduler) ----------
let lastPostedMessageId = null;
let postInFlight = false;
let schedulerRunning = false;

async function postOnce() {
  if (postInFlight) {
    console.log('[poster] Skipping: previous send still in flight');
    return;
  }
  postInFlight = true;

  try {
    // delete previous message if present
    if (lastPostedMessageId) {
      try {
        await bot.deleteMessage(CHANNEL, lastPostedMessageId);
        console.log('[poster] Deleted previous message:', lastPostedMessageId);
      } catch (e) {
        // If it was already deleted or not found, just log and continue
        console.warn('[poster] Could not delete previous message (might be gone):', e.message);
      }
      lastPostedMessageId = null;
    }

    // send the new clip
    const sent = await bot.sendVideo(CHANNEL, VIDEO_FILE_ID, {
      caption: 'Tap to open the bot ➜ https://t.me/Freakysl_bot',
      supports_streaming: true
    });

    lastPostedMessageId = sent.message_id;
    console.log('[poster] Posted new message:', lastPostedMessageId);
  } catch (e) {
    console.error('[poster] Failed to post video:', e.message);
  } finally {
    postInFlight = false;
  }
}

function startScheduler() {
  if (schedulerRunning) {
    console.log('[poster] Scheduler already running, ignoring second start.');
    return;
  }
  schedulerRunning = true;

  const ms = POST_EVERY_MINUTES * 60 * 1000;

  // One-shot loop using setTimeout to avoid overlaps
  const loop = async () => {
    await postOnce();
    setTimeout(loop, ms);
  };

  console.log(`[poster] Starting scheduler: every ${POST_EVERY_MINUTES} minute(s).`);
  // Kick off immediately, then every N minutes thereafter
  loop();
}

// log bot identity and then start scheduler once
(async () => {
  try {
    const me = await bot.getMe();
    console.log(`[boot] Logged in as @${me.username} (id ${me.id})`);
  } catch (e) {
    console.warn('[boot] getMe failed (continuing anyway):', e.message);
  }
  startScheduler();
})();
