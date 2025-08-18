const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ── Config ───────────────────────────────────────────────
const token = '7623685237:AAFlNTEvtgQWDOoosNX5gBM9hZnEs_GfOO4';
const bot = new TelegramBot(token, { polling: true });

const CHANNEL_ID = '@Botacatest'; 
const PROMO_INTERVAL_MINUTES = 2; // every 2 minutes for testing

// Replace with your video details
const PROMO_VIDEO = {
  file_id: 'BAACAgEAAxkBAAID0WiieDS5loQVTRlJv4YldD5W1vkfAALjBQACPHwRRTzftenee1R1NgQ',
  caption: '🔥 Check out our bot here: https://t.me/Freakysl_bot'
};

// ── Celebs data ──────────────────────────────────────────
const celebs = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'celebs.json'), 'utf8')
);

// ── Paging state (per chat) ──────────────────────────────
const ITEMS_PER_PAGE = 7;
const pageByChat = new Map();

// ── Helpers ──────────────────────────────────────────────
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

// ── Commands / Callbacks ────────────────────────────────
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

// ── Auto-promo message loop ─────────────────────────────
let lastPromoMessageId = null;

async function sendPromo() {
  try {
    if (lastPromoMessageId) {
      await bot.deleteMessage(CHANNEL_ID, lastPromoMessageId).catch(() => {});
    }

    const sent = await bot.sendVideo(CHANNEL_ID, PROMO_VIDEO.file_id, {
      caption: PROMO_VIDEO.caption
    });

    lastPromoMessageId = sent.message_id;
  } catch (err) {
    console.error('Error sending promo:', err.message);
  }
}

// Start loop
setInterval(sendPromo, PROMO_INTERVAL_MINUTES * 60 * 1000);
sendPromo();
