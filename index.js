const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = process.env.BOT_TOKEN;
if (!token) { console.error('❌ Missing BOT_TOKEN'); process.exit(1); }

const bot = new TelegramBot(token, { polling: true });
const PAGE_SIZE = 10;

// ---- data helpers ----
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

function listKeyboard(celebs, page = 1) {
  const total = celebs.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  page = Math.min(Math.max(1, page), pages);

  const start = (page - 1) * PAGE_SIZE;
  const items = celebs.slice(start, start + PAGE_SIZE);

  const rows = items.map((c, i) => [
    { text: c.name, callback_data: `celeb:${start + i}:${page}` }
  ]);

  rows.push([
    { text: '⬅️ Prev', callback_data: `page:${Math.max(1, page - 1)}` },
    { text: `Page ${page}/${pages}`, callback_data: 'noop' },
    { text: 'Next ➡️', callback_data: `page:${Math.min(pages, page + 1)}` }
  ]);

  return { inline_keyboard: rows };
}

// ---- UI helpers ----
async function sendMenu(chatId, page = 1) {
  const celebs = loadCelebs();
  return bot.sendMessage(chatId, 'Choose a celebrity:', {
    reply_markup: listKeyboard(celebs, page)
  });
}

async function editMenuInPlace(qMessage, page = 1) {
  const celebs = loadCelebs();
  const chat_id = qMessage.chat.id;
  const message_id = qMessage.message_id;

  // edit both text and keyboard to keep it neat
  try {
    await bot.editMessageText('Choose a celebrity:', {
      chat_id,
      message_id,
      reply_markup: listKeyboard(celebs, page)
    });
  } catch (e) {
    // Telegram throws “message is not modified” if nothing changed; ignore
    if (!String(e.message).includes('message is not modified')) {
      console.error('editMessageText error:', e.message);
    }
  }
}

async function showCeleb(chatId, celeb, page) {
  const src = celeb.fileId || celeb.url || celeb.photo;
  const kb = {
    inline_keyboard: [
      ...(celeb.bio ? [[{ text: '🔗 View Bio', url: celeb.bio }]] : []),
      [{ text: '⬅️ Back to list', callback_data: `back:${page}` }]
    ]
  };
  if (!src) {
    return bot.sendMessage(chatId, celeb.name, { reply_markup: kb });
  }
  try {
    return await bot.sendPhoto(chatId, src, {
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

// ---- commands ----
bot.onText(/\/start|\/list/, (msg) => sendMenu(msg.chat.id, 1));

// ---- callbacks ----
bot.on('callback_query', async (q) => {
  const celebs = loadCelebs();
  const data = q.data;
  const chatId = q.message.chat.id;
  const msgId = q.message.message_id;

  try {
    if (data === 'noop') {
      return bot.answerCallbackQuery(q.id);
    }

    // paginate in place (edit the same message)
    if (data.startsWith('page:')) {
      const page = Number(data.split(':')[1] || '1');
      await editMenuInPlace(q.message, page);
      return bot.answerCallbackQuery(q.id);
    }

    // celeb selected: delete the menu message, then send photo
    if (data.startsWith('celeb:')) {
      const [_, idxStr, pageStr] = data.split(':');
      const idx = Number(idxStr);
      const page = Number(pageStr || '1');
      const celeb = celebs[idx];
      if (!celeb) {
        await bot.answerCallbackQuery(q.id, { text: 'Not found', show_alert: true });
        return;
      }
      // remove the menu to avoid stacking
      try { await bot.deleteMessage(chatId, msgId); } catch {}
      await showCeleb(chatId, celeb, page);
      return bot.answerCallbackQuery(q.id);
    }

    // back from photo: delete the photo message, re-open menu
    if (data.startsWith('back:')) {
      const page = Number(data.split(':')[1] || '1');
      try { await bot.deleteMessage(chatId, msgId); } catch {}
      await sendMenu(chatId, page);
      return bot.answerCallbackQuery(q.id);
    }
  } catch (err) {
    console.error('callback_query error:', err);
    try { await bot.answerCallbackQuery(q.id, { text: 'Error', show_alert: true }); } catch {}
  }
});

bot.on('polling_error', e => console.error('polling_error:', e.message));
console.log('✅ Bot running (pagination edits in place).');
