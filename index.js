// index.js
// ───────────────────────────────────────────────────────────────────────────────
// Telegram celeb bot: paging UI + per-item bio link + media snippet helper
// ───────────────────────────────────────────────────────────────────────────────

require('dotenv').config(); // harmless if .env doesn't exist
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Load celebs.json once at startup
const celebs = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'celebs.json'), 'utf8')
);

// ── Bot setup ───────────────────────────────────────────────────────────────────
const token = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const bot = new TelegramBot(token, { polling: true });

// ── Paging state (per chat) ─────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 7;
const pageByChat = new Map();

// ── Helpers ─────────────────────────────────────────────────────────────────────
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

  // Link comes only from THIS celeb (no cross-talk between items)
  if (c.bio && typeof c.bio === 'string' && c.bio.trim().length > 0) {
    buttons.push([{ text: '🔗 View Leaks', url: c.bio }]);
  }

  // Back button returns to the page user came from
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

// ── Commands / Callbacks ────────────────────────────────────────────────────────
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

// ── Media snippet helper (photos, videos, GIFs, round videos, docs) ────────────
async function sendMediaSnippet(chatId, kind, fileId, meta = {}) {
  try {
    let fileUrl = '(unavailable: no BOT_TOKEN or file_path)';
    try {
      const file = await bot.getFile(fileId);
      if (file && file.file_path) {
        fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      }
    } catch {
      // ignore: getFile may fail for some media types or if token missing
    }

    const payload = { file_id: fileId };
    // attach any extras we detected (non-breaking)
    Object.keys(meta || {}).forEach((k) => {
      if (meta[k] !== undefined && meta[k] !== null) payload[k] = meta[k];
    });

    const header = `Got it! Here is the snippet you can paste into celebs.json:`;
    const code = '```json\n' + JSON.stringify(payload, null, 2) + '\n```';
    const extra =
      fileUrl ? `\nDirect file URL (optional):\n${fileUrl}` : '';

    await bot.sendMessage(chatId, `${header}\n\n${code}${extra}`, {
      parse_mode: 'Markdown'
    });
  } catch (e) {
    await bot.sendMessage(chatId, 'Sorry, I could not read that media.');
  }
}

// Photos
bot.on('photo', async (msg) => {
  const best = msg.photo?.[msg.photo.length - 1];
  if (!best) return bot.sendMessage(msg.chat.id, 'No photo found.');
  await sendMediaSnippet(msg.chat.id, 'photo', best.file_id, {
    width: best.width, height: best.height
  });
});

// Videos (regular clips)
bot.on('video', async (msg) => {
  const v = msg.video;
  if (!v) return bot.sendMessage(msg.chat.id, 'No video found.');
  await sendMediaSnippet(msg.chat.id, 'video', v.file_id, {
    width: v.width, height: v.height, duration: v.duration, mime_type: v.mime_type
  });
});

// Animations (GIFs / MP4 animations)
bot.on('animation', async (msg) => {
  const a = msg.animation;
  if (!a) return bot.sendMessage(msg.chat.id, 'No animation found.');
  await sendMediaSnippet(msg.chat.id, 'animation', a.file_id, {
    width: a.width, height: a.height, duration: a.duration, mime_type: a.mime_type
  });
});

// Round video messages
bot.on('video_note', async (msg) => {
  const vn = msg.video_note;
  if (!vn) return bot.sendMessage(msg.chat.id, 'No video note found.');
  await sendMediaSnippet(msg.chat.id, 'video_note', vn.file_id, {
    length: vn.length, duration: vn.duration
  });
});

// Documents that might be video/GIF files
bot.on('document', async (msg) => {
  const d = msg.document;
  if (!d) return bot.sendMessage(msg.chat.id, 'No document found.');
  // We include mime_type and file_name to help you identify the asset
  await sendMediaSnippet(msg.chat.id, 'document', d.file_id, {
    mime_type: d.mime_type, file_name: d.file_name, file_size: d.file_size
  });
});

// ── Optional: basic error logging ───────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('Polling error:', err?.message || err);
});
