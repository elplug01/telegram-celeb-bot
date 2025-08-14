// index.js
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ---------- Config ----------
const TOKEN = process.env.BOT_TOKEN || 'PASTE_YOUR_BOT_TOKEN_HERE';
const ITEMS_PER_PAGE = 7;

// ---------- Data ----------
const celebsPath = path.join(__dirname, 'celebs.json');
let celebs = [];
try {
  celebs = JSON.parse(fs.readFileSync(celebsPath, 'utf8'));
} catch (e) {
  console.error('Failed to read celebs.json:', e.message);
  process.exit(1);
}

// ---------- Bot ----------
const bot = new TelegramBot(TOKEN, { polling: true });

// Track current page per chat
const currentPage = new Map();

// /start -> first page
bot.onText(/\/start/i, (msg) => {
  const chatId = msg.chat.id;
  currentPage.set(chatId, 0);
  sendCelebList(chatId, 0);
});

// Handle all button clicks
bot.on('callback_query', async (q) => {
  try {
    const chatId = q.message.chat.id;
    const data = q.data || '';

    if (data.startsWith('page_')) {
      const page = Number(data.split('_')[1]) || 0;
      currentPage.set(chatId, page);
      await sendCelebList(chatId, page);
    } else if (data.startsWith('celeb_')) {
      const index = Number(data.split('_')[1]) || 0;
      await sendCelebCard(chatId, index);
    } else if (data === 'back_to_list') {
      const page = currentPage.get(chatId) ?? 0;
      await sendCelebList(chatId, page);
    }

    // Answer callback to remove 'loading' spinner
    bot.answerCallbackQuery(q.id).catch(() => {});
  } catch (err) {
    console.error('callback_query error:', err);
  }
});

// ---------- UI helpers ----------
function sendCelebList(chatId, page) {
  const totalPages = Math.max(1, Math.ceil(celebs.length / ITEMS_PER_PAGE));
  const validPage = Math.min(Math.max(0, page), totalPages - 1);
  currentPage.set(chatId, validPage);

  const startIdx = validPage * ITEMS_PER_PAGE;
  const pageCelebs = celebs.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const rows = pageCelebs.map((c, i) => ([
    { text: c.name, callback_data: `celeb_${startIdx + i}` }
  ]));

  const nav = [];
  if (validPage > 0) nav.push({ text: '⬅ Prev', callback_data: `page_${validPage - 1}` });
  nav.push({ text: `Page ${validPage + 1}/${totalPages}`, callback_data: `page_${validPage}` });
  if (validPage < totalPages - 1) nav.push({ text: 'Next ➡', callback_data: `page_${validPage + 1}` });
  rows.push(nav);

  return bot.sendMessage(chatId, 'Choose a creator:', {
    reply_markup: { inline_keyboard: rows }
  });
}

async function sendCelebCard(chatId, index) {
  const c = celebs[index];
  if (!c) return bot.sendMessage(chatId, 'Not found.');

  const caption = `${c.name}`;
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔗 View Leaks', url: c.bio }],
      [{ text: '⬅ Back', callback_data: 'back_to_list' }]
    ]
  };

  // prefer Telegram file_id (instant) then fallback to URL
  if (c.file_id) {
    return bot.sendPhoto(chatId, c.file_id, { caption, reply_markup: keyboard })
      .catch(() => bot.sendMessage(chatId, `${caption}\n${c.bio}`, { reply_markup: keyboard }));
  }
  if (c.url) {
    return bot.sendPhoto(chatId, c.url, { caption, reply_markup: keyboard })
      .catch(() => bot.sendMessage(chatId, `${caption}\n${c.bio}`, { reply_markup: keyboard }));
  }
  return bot.sendMessage(chatId, `${caption}\n${c.bio}`, { reply_markup: keyboard });
}

// ---------- Inbound media → return file_id ----------
bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;

    // Photos (Telegram sends an array of sizes; last is the largest)
    if (msg.photo && Array.isArray(msg.photo) && msg.photo.length) {
      const best = msg.photo[msg.photo.length - 1];
      await replyWithFileInfo(chatId, best.file_id);
      return;
    }

    // Image sent as a document (to avoid compression)
    if (msg.document && msg.document.mime_type && msg.document.mime_type.startsWith('image/')) {
      await replyWithFileInfo(chatId, msg.document.file_id);
      return;
    }

    // Albums: handled because each item arrives as a separate message with its own file_id.
    // Nothing else to do here.

  } catch (err) {
    console.error('message handler error:', err);
  }
});

async function replyWithFileInfo(chatId, fileId) {
  try {
    const file = await bot.getFile(fileId);
    const filePath = file.file_path; // e.g. photos/file_12345.jpg
    const directUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

    const text =
      'Got it! Here is the info you can paste into celebs.json:\n' +
      '```\n' +
      `"file_id": "${fileId}"\n` +
      '```\n' +
      `Direct file URL (optional):\n${directUrl}`;

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('getFile error:', e.message);
    await bot.sendMessage(chatId, 'Sorry, I could not read that photo.');
  }
}

// ---------- Errors ----------
bot.on('polling_error', (err) => {
  // Avoid noisy stack — show concise reason
  console.error('polling_error:', err?.response?.body || err.message || err);
});
