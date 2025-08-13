const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = process.env.BOT_TOKEN;
if (!token) { console.error('❌ Missing BOT_TOKEN'); process.exit(1); }

const bot = new TelegramBot(token, { polling: true });

// ---------- config ----------
const PAGE_SIZE = 10;

// Load celebs from file
function loadCelebs() {
  try {
    const raw = fs.readFileSync('celebs.json', 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Failed to load celebs.json:', e.message);
    return [];
  }
}

// Build keyboard for a page
function listKeyboard(celebs, page = 1) {
  const total = celebs.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  page = Math.min(Math.max(1, page), pages);

  const start = (page - 1) * PAGE_SIZE;
  const items = celebs.slice(start, start + PAGE_SIZE);

  const rows = items.map((c, i) => [
    { text: c.name, callback_data: `celeb:${start + i}:${page}` }
  ]);

  // nav row
  rows.push([
    { text: '⬅️ Prev', callback_data: `page:${Math.max(1, page - 1)}` },
    { text: `Page ${page}/${pages}`, callback_data: 'noop' },
    { text: 'Next ➡️', callback_data: `page:${Math.min(pages, page + 1)}` }
  ]);

  return { inline_keyboard: rows };
}

async function sendCatalog(ctx, page = 1) {
  const celebs = loadCelebs();
  return bot.sendMessage(ctx.chat.id, 'Choose a celebrity:', {
    reply_markup: listKeyboard(celebs, page)
  });
}

async function showCeleb(chatId, celeb, page) {
  const source = celeb.fileId || celeb.url || celeb.photo;
  const kb = {
    inline_keyboard: [
      ...(celeb.bio ? [[{ text: '🔗 View Bio', url: celeb.bio }]] : []),
      [
        { text: '⬅️ Back to list', callback_data: `page:${page}` }
      ]
    ]
  };

  if (!source) {
    return bot.sendMessage(chatId, `${celeb.name}`, { reply_markup: kb });
  }

  try {
    return await bot.sendPhoto(chatId, source, {
      caption: celeb.name,
      reply_markup: kb
    });
  } catch (e) {
    console.error('sendPhoto failed:', e.message);
    return bot.sendMessage(chatId, `${celeb.name}\n(Unable to load image)`, {
      reply_markup: kb
    });
  }
}

// ---------- handlers ----------
bot.onText(/\/start|\/list/, (msg) => sendCatalog(msg, 1));

bot.on('callback_query', async (q) => {
  const celebs = loadCelebs();
  const data = q.data;

  try {
    if (data === 'noop') {
      return bot.answerCallbackQuery(q.id);
    }

    if (data.startsWith('page:')) {
      const page = Number(data.split(':')[1] || '1');
      await bot.sendMessage(q.message.chat.id, 'Choose a celebrity:', {
        reply_markup: listKeyboard(celebs, page)
      });
      return bot.answerCallbackQuery(q.id);
    }

    if (data.startsWith('celeb:')) {
      const [_, idxStr, pageStr] = data.split(':');
      const idx = Number(idxStr);
      const page = Number(pageStr || '1');
      const celeb = celebs[idx];
      if (!celeb) {
        await bot.answerCallbackQuery(q.id, { text: 'Not found', show_alert: true });
        return;
      }
      await showCeleb(q.message.chat.id, celeb, page);
      return bot.answerCallbackQuery(q.id);
    }
  } catch (err) {
    console.error('callback_query error:', err);
    try { await bot.answerCallbackQuery(q.id, { text: 'Error', show_alert: true }); } catch {}
  }
});

bot.on('polling_error', e => console.error('polling_error:', e.message));
console.log('✅ Bot running with pagination.');
