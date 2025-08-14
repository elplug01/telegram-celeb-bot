// index.js — node-telegram-bot-api version
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ----- Load data -----
const celebsPath = path.join(__dirname, 'celebs.json');
let celebs = [];
try {
  celebs = JSON.parse(fs.readFileSync(celebsPath, 'utf8'));
} catch (e) {
  console.error('Failed to load celebs.json:', e.message);
  process.exit(1);
}

// ----- Bot token -----
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
if (!TOKEN || TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('Missing TELEGRAM_BOT_TOKEN (or BOT_TOKEN).');
  process.exit(1);
}
const bot = new TelegramBot(TOKEN, { polling: true });

// ----- Pagination state -----
const ITEMS_PER_PAGE = 7;
const state = new Map(); // chatId -> { page, listMsgId }

// Helpers
function totalPages() {
  return Math.max(1, Math.ceil(celebs.length / ITEMS_PER_PAGE));
}

function pageOfIndex(i) {
  return Math.floor(i / ITEMS_PER_PAGE);
}

function buildListKeyboard(page) {
  const start = page * ITEMS_PER_PAGE;
  const slice = celebs.slice(start, start + ITEMS_PER_PAGE);

  const rows = slice.map((c, i) => ([
    { text: c.name, callback_data: `celeb_${start + i}` }
  ]));

  const nav = [];
  if (page > 0) nav.push({ text: '⬅ Prev', callback_data: `page_${page - 1}` });
  nav.push({ text: `Page ${page + 1}/${totalPages()}`, callback_data: `noop_${page}` });
  if (page < totalPages() - 1) nav.push({ text: 'Next ➡', callback_data: `page_${page + 1}` });

  rows.push(nav);
  return { inline_keyboard: rows };
}

async function showList(chatId, page, preferEdit = true) {
  const st = state.get(chatId) || {};
  const keyboard = buildListKeyboard(page);

  // Try to edit the previous list message for snappy paging
  if (preferEdit && st.listMsgId) {
    try {
      await bot.editMessageText(`Choose a celebrity:`, {
        chat_id: chatId,
        message_id: st.listMsgId,
        reply_markup: keyboard
      });
      // also update the page
      state.set(chatId, { ...st, page });
      return;
    } catch (_) {
      // fall through to send new
    }
  }

  // Send new message and delete the old one to keep it clean
  const sent = await bot.sendMessage(chatId, `Choose a celebrity:`, {
    reply_markup: keyboard
  });

  if (st.listMsgId) {
    try { await bot.deleteMessage(chatId, st.listMsgId); } catch {}
  }

  state.set(chatId, { page, listMsgId: sent.message_id });
}

async function showCeleb(chatId, index) {
  const c = celebs[index];
  if (!c) {
    await bot.sendMessage(chatId, 'Not found.');
    return;
  }

  const backPage = pageOfIndex(index);
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔗 View leaks', url: c.bio }],
      [{ text: '⬅ Back', callback_data: `page_${backPage}` }]
    ]
  };

  // Prefer file_id for instant send; fallback to URL
  try {
    if (c.file_id) {
      await bot.sendPhoto(chatId, c.file_id, {
        caption: c.name,
        reply_markup: keyboard
      });
    } else if (c.url) {
      await bot.sendPhoto(chatId, c.url, {
        caption: c.name,
        reply_markup: keyboard
      });
    } else {
      await bot.sendMessage(chatId, `${c.name}\n${c.bio}`, { reply_markup: keyboard });
    }
  } catch (err) {
    console.error('sendPhoto failed; fallback to text. Reason:', err?.message || err);
    await bot.sendMessage(chatId, `${c.name}\n${c.bio}`, { reply_markup: keyboard });
  }
}

// ----- Commands & Callbacks -----
bot.onText(/\/start|\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  state.set(chatId, { page: 0, listMsgId: null });
  await showList(chatId, 0, false);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat?.id;
  const data = query.data || '';

  // Always answer to stop the "loading..." spinner
  try { await bot.answerCallbackQuery(query.id); } catch {}

  if (!chatId) return;

  if (data.startsWith('page_')) {
    const page = parseInt(data.split('_')[1], 10) || 0;
    await showList(chatId, Math.min(Math.max(0, page), totalPages() - 1), true);
    return;
  }

  if (data.startsWith('celeb_')) {
    const idx = parseInt(data.split('_')[1], 10);
    await showCeleb(chatId, idx);
    return;
  }

  if (data.startsWith('noop_')) {
    // do nothing (prevents edits when tapping the page indicator)
    return;
  }
});

// ----- Graceful stop -----
process.once('SIGINT', () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));

console.log('Bot running…');
