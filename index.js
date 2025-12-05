// index.js
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ======= Config =======
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';

// Channels to auto-post into
const CHANNELS = (process.env.CHANNELS || '-1002275235359')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Post every 2 minutes (TEST MODE)
const POST_EVERY_MINUTES = 2;

// Caption + Button
const CAPTION = 'Free Onlyfans';
const VIDS_URL = 'https://t.me/offreel';

// Video rotation file_ids
const ROTATION = [
  "AgAD_AcAAu_AmUU",      // video 1
  "AgADBQgAAu_AmUU",      // video 2
  "AgAD_QcAAu_AmUU",      // video 3
  "AgADAcAAu_AmUU"        // older file_id format examples
];

// ======= Celebs menu load =======
const celebsPath = path.join(__dirname, 'celebs.json');
const celebs = JSON.parse(fs.readFileSync(celebsPath, 'utf8'));

// ======= Bot Setup =======
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const ITEMS_PER_PAGE = 7;
const pageByChat = new Map();

// ======= Menu Helpers =======
function clamp(n, min, max) {
  return Math.max(min, Math.min(n, max));
}

function sendPage(chatId, page) {
  const totalPages = Math.ceil(celebs.length / ITEMS_PER_PAGE);
  const safePage = clamp(page, 0, totalPages - 1);
  pageByChat.set(chatId, safePage);

  const start = safePage * ITEMS_PER_PAGE;
  const slice = celebs.slice(start, start + ITEMS_PER_PAGE);

  const rows = slice.map((c, i) => [
    { text: c.name, callback_data: `celeb_${start + i}` }
  ]);

  const nav = [];
  if (safePage > 0) nav.push({ text: "⬅ Prev", callback_data: `page_${safePage - 1}` });
  nav.push({ text: `Page ${safePage + 1}/${totalPages}`, callback_data: "noop" });
  if (safePage < totalPages - 1) nav.push({ text: "Next ➡", callback_data: `page_${safePage + 1}` });

  rows.push(nav);

  bot.sendMessage(chatId, "Choose a creator:", {
    reply_markup: { inline_keyboard: rows }
  });
}

function sendCeleb(chatId, index) {
  const c = celebs[index];
  if (!c) return bot.sendMessage(chatId, "Missing item.");

  const buttons = [];

  if (c.bio) {
    buttons.push([{ text: "🔗 View Leaks", url: c.bio }]);
  }

  const page = pageByChat.get(chatId) ?? Math.floor(index / ITEMS_PER_PAGE);
  buttons.push([{ text: "⬅ Back", callback_data: `page_${page}` }]);

  const opts = { caption: c.name, reply_markup: { inline_keyboard: buttons } };

  if (c.file_id) {
    bot.sendPhoto(chatId, c.file_id, opts).catch(() =>
      bot.sendMessage(chatId, "Could not load photo.")
    );
  } else if (c.url) {
    bot.sendPhoto(chatId, c.url, opts).catch(() =>
      bot.sendMessage(chatId, "Could not load photo.")
    );
  } else {
    bot.sendMessage(chatId, c.name, opts);
  }
}

// ======= Commands =======
bot.onText(/\/start|\/menu/, msg => {
  pageByChat.set(msg.chat.id, 0);
  sendPage(msg.chat.id, 0);
});

bot.on("callback_query", q => {
  const chatId = q.message.chat.id;

  if (q.data.startsWith("page_")) {
    const page = parseInt(q.data.split("_")[1]);
    return sendPage(chatId, page);
  }

  if (q.data.startsWith("celeb_")) {
    const index = parseInt(q.data.split("_")[1]);
    return sendCeleb(chatId, index);
  }

  if (q.data === "noop") return bot.answerCallbackQuery(q.id);
});

// ======= Auto-Poster =======
let lastMessage = new Map();
let rotationIndex = 0;

async function postOnce() {
  const fileId = ROTATION[rotationIndex];

  const button = {
    inline_keyboard: [
      [{ text: "👉 Vids", url: VIDS_URL }]
    ]
  };

  for (const channel of CHANNELS) {
    const prev = lastMessage.get(channel);

    if (prev) {
      try {
        await bot.deleteMessage(channel, prev);
      } catch (e) {}
    }

    try {
      const sent = await bot.sendVideo(channel, fileId, {
        caption: CAPTION,
        supports_streaming: true,
        reply_markup: button
      });

      lastMessage.set(channel, sent.message_id);
    } catch (e) {
      console.log("Post failed:", e.message);
    }
  }

  rotationIndex = (rotationIndex + 1) % ROTATION.length;
}

// Run NOW + every 2 minutes
postOnce();
setInterval(postOnce, POST_EVERY_MINUTES * 60 * 1000);

console.log("Bot running...");
