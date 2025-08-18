const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

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

// ── Optional: return file_id when users send photos ─────────────────────────────
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

// ── Optional: return file_id when users send videos / GIFs ─────────────────────
async function sendMediaSnippet(chatId, kind, fileId, meta = {}) {
  try {
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const snippet = {
      file_id: fileId,
      type: kind,
      ...(meta.duration ? { duration: meta.duration } : {}),
      ...(meta.width ? { width: meta.width } : {}),
      ...(meta.height ? { height: meta.height } : {}),
    };

    await bot.sendMessage(
      chatId,
      `Got it! Here is the snippet you can paste (save the file_id for reuse):\n\n` +
      '```json\n' + JSON.stringify(snippet, null, 2) + '\n```\n' +
      `Direct file URL (optional):\n${fileUrl}`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    await bot.sendMessage(chatId, 'Sorry, I couldn’t read that media.');
  }
}

bot.on('video', async (msg) => {
  const v = msg.video;
  if (!v) return bot.sendMessage(msg.chat.id, 'No video found.');
  await sendMediaSnippet(msg.chat.id, 'video', v.file_id, {
    duration: v.duration, width: v.width, height: v.height
  });
});

bot.on('animation', async (msg) => {
  const a = msg.animation;
  if (!a) return bot.sendMessage(msg.chat.id, 'No animation found.');
  await sendMediaSnippet(msg.chat.id, 'animation', a.file_id, {
    duration: a.duration, width: a.width, height: a.height
  });
});

bot.on('document', async (msg) => {
  const d = msg.document;
  if (!d) return;
  const mime = d.mime_type || '';
  if (!mime.startsWith('video/')) return; 
  await sendMediaSnippet(msg.chat.id, 'video', d.file_id);
});
