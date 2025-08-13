// Telegram celeb bot: buttons + inline thumbnails
const TelegramBot = require('node-telegram-bot-api');
const raw = require('./celebs.json');

const token = process.env.BOT_TOKEN;
if (!token) { console.error('❌ Missing BOT_TOKEN'); process.exit(1); }

const bot = new TelegramBot(token, { polling: true });

// ---- normalize celeb data (supports multiple key styles) ----
const celebs = raw.map((c, i) => ({
  id: i,
  name: c.name,
  bio: c.bio || c.bioUrl || '',
  url: c.url || c.imgUrl || c.picture || '',   // main photo
  thumb: c.thumb || c.thumbUrl || c.url || c.imgUrl || c.picture || '' // thumbnail (can reuse photo)
})).filter(c => c.name && c.url);

// ---- helpers ----
function listKeyboard() {
  return {
    inline_keyboard: [
      ...celebs.map((c) => [{ text: c.name, callback_data: `celeb_${c.id}` }]),
      [{ text: '🖼️ Browse with thumbnails', switch_inline_query_current_chat: '' }]
    ]
  };
}

async function sendCard(chatId, c) {
  return bot.sendPhoto(chatId, c.url, {
    caption: `${c.name}`,
    reply_markup: {
      inline_keyboard: [
        ...(c.bio ? [[{ text: '🔗 View Bio', url: c.bio }]] : []),
        [{ text: '⬅️ Back', callback_data: 'back_to_list' }]
      ]
    }
  });
}

// ---- commands ----
bot.onText(/\/start|\/list/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Select a celeb:', { reply_markup: listKeyboard() });
});

// ---- button clicks ----
bot.on('callback_query', async (q) => {
  try {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'back_to_list') {
      await bot.sendMessage(chatId, 'Select a celeb:', { reply_markup: listKeyboard() });
      return bot.answerCallbackQuery(q.id);
    }

    if (data.startsWith('celeb_')) {
      const id = Number(data.split('_')[1]);
      const c = celebs.find(x => x.id === id);
      if (!c) return bot.answerCallbackQuery(q.id, { text: 'Not found' });
      await sendCard(chatId, c);
      return bot.answerCallbackQuery(q.id);
    }
  } catch (e) {
    console.error('callback_query error:', e.message);
  }
});

// ---- inline mode (thumbnails) ----
// In BotFather you must run /setinline and set a placeholder first.
bot.on('inline_query', async (iq) => {
  try {
    const q = (iq.query || '').toLowerCase().trim();
    const matches = celebs.filter(c => !q || c.name.toLowerCase().includes(q));

    const results = matches.map((c) => ({
      type: 'photo',
      id: String(c.id),
      photo_url: c.url,   // full image
      thumb_url: c.thumb, // small preview (can be same as photo)
      caption: `${c.name}`,
      reply_markup: {
        inline_keyboard: [
          ...(c.bio ? [[{ text: '🔗 View Bio', url: c.bio }]] : []),
          [{ text: '⬅️ Back', callback_data: 'back_to_list' }]
        ]
      }
    }));

    await bot.answerInlineQuery(iq.id, results, { cache_time: 0, is_personal: true });
  } catch (e) {
    console.error('inline_query error:', e.message);
  }
});

// optional logging
bot.on('polling_error', (e) => console.error('polling_error:', e.message));
console.log('✅ Bot running with buttons + inline thumbnails…');
