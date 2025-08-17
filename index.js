const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ── Safe celebs.json load ───────────────────────────────────────────────────────
let celebs = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, 'celebs.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('celebs.json must be an array');
  celebs = parsed;
} catch (err) {
  console.error('Failed to load celebs.json:', err.message);
  celebs = []; // keep running; bot will show empty list
}

// ── Bot setup ───────────────────────────────────────────────────────────────────
const token = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
if (!process.env.BOT_TOKEN && token === 'YOUR_BOT_TOKEN_HERE') {
  console.warn('⚠ BOT_TOKEN not set; using placeholder token.');
}
const bot = new TelegramBot(token, { polling: true });

// ── Paging state (per chat) ─────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 7;
const pageByChat = new Map();
const TOTAL_PAGES = Math.max(1, Math.ceil(celebs.length / ITEMS_PER_PAGE));

// ── Helpers ─────────────────────────────────────────────────────────────────────
const clamp = (n, min, max) => Math.max(min, Math.min(n, max));

function buildPageKeyboard(page) {
  const start = page * ITEMS_PER_PAGE;
  const pageCelebs = celebs.slice(start, start + ITEMS_PER_PAGE);

  const keyboard = pageCelebs.map((c, i) => ([
    { text: c.name, callback_data: `celeb_${start + i}` }
  ]));

  const navRow = [];
  if (page > 0) navRow.push({ text: '⬅ Prev', callback_data: `page_${page - 1}` });
  navRow.push({ text: `Page ${page + 1}/${TOTAL_PAGES}`, callback_data: 'noop' });
  if (page < TOTAL_PAGES - 1) navRow.push({ text: 'Next ➡', callback_data: `page_${page + 1}` });
  keyboard.push(navRow);

  return { inline_keyboard: keyboard };
}

async function sendOrEditPage(chatId, messageId, page) {
  const safePage = clamp(page, 0, TOTAL_PAGES - 1);
  pageByChat.set(chatId, safePage);

  const reply_markup = buildPageKeyboard(safePage);
  const text = 'Choose a creator:';

  if (messageId) {
    // We’re navigating — edit in place to reduce message spam/API load
    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup });
    } catch {
      // If editing fails (deleted/old), just send a new one
      await bot.sendMessage(chatId, text, { reply_markup });
    }
  } else {
    await bot.sendMessage(chatId, text, { reply_markup });
  }
}

async function sendCeleb(chatId, index, messageIdForBack) {
  const c = celebs[index];
  if (!c) return bot.sendMessage(chatId, 'That item is missing.');

  const caption = c.name;
  const buttons = [];

  if (c.bio && typeof c.bio === 'string' && c.bio.trim()) {
    buttons.push([{ text: '🔗 View Leaks', url: c.bio }]);
  }

  // Back to the same page
  const page = pageByChat.get(chatId) ?? Math.floor(index / ITEMS_PER_PAGE);
  buttons.push([{ text: '⬅ Back', callback_data: `page_${page}` }]);

  const opts = { caption, reply_markup: { inline_keyboard: buttons } };

  if (c.file_id && typeof c.file_id === 'string') {
    try {
      await bot.sendPhoto(chatId, c.file_id, opts);
    } catch {
      await bot.sendMessage(chatId, 'Could not load the photo for this item.');
    }
    return;
  }
  if (c.url && typeof c.url === 'string') {
    try {
      await bot.sendPhoto(chatId, c.url, opts);
    } catch {
      await bot.sendMessage(chatId, 'Could not load the photo for this item.');
    }
    return;
  }
  await bot.sendMessage(chatId, caption, opts);
}

// ── Commands / Callbacks ────────────────────────────────────────────────────────
bot.onText(/\/start|\/menu/, (msg) => {
  pageByChat.set(msg.chat.id, 0);
  sendOrEditPage(msg.chat.id, null, 0);
});

bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const msgId = q.message.message_id;
  const data = q.data || '';

  try {
    if (data.startsWith('page_')) {
      const page = parseInt(data.split('_')[1], 10) || 0;
      await sendOrEditPage(chatId, msgId, page);
    } else if (data.startsWith('celeb_')) {
      const idx = parseInt(data.split('_')[1], 10);
      await sendCeleb(chatId, idx, msgId);
    }
  } finally {
    // Always answer to remove Telegram's loading state
    bot.answerCallbackQuery(q.id).catch(() => {});
  }
});

// ── Optional: return file_id when users send photos (to help fill celebs.json) ─
bot.on('photo', async (msg) => {
  try {
    const best = msg.photo?.[msg.photo.length - 1];
    if (!best) throw new Error('No photo sizes');

    const file = await bot.getFile(best.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

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

// ── Crash guards ────────────────────────────────────────────────────────────────
process.on('unhandledRejection', (err) => console.error('UnhandledRejection:', err));
process.on('uncaughtException', (err) => console.error('UncaughtException:', err));
