const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = process.env.BOT_TOKEN;
if (!token) { console.error('❌ Missing BOT_TOKEN'); process.exit(1); }

const bot = new TelegramBot(token, { polling: true });

// Load celebs each start (so edits to celebs.json reflect after redeploy)
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

function listKeyboard(celebs) {
  // one button per row
  return {
    inline_keyboard: celebs.map((c, i) => [
      { text: c.name, callback_data: `celeb_${i}` }
    ])
  };
}

async function sendCard(chatId, celeb) {
  try {
    await bot.sendPhoto(chatId, celeb.url || celeb.photo || celeb.fileId, {
      caption: celeb.name,
      reply_markup: {
        inline_keyboard: [
          ...(celeb.bio ? [[{ text: '🔗 View Bio', url: celeb.bio }]] : []),
          [{ text: '⬅️ Back', callback_data: 'back_to_list' }]
        ]
      }
    });
  } catch (err) {
    console.error('sendPhoto failed:', err.message);
    // graceful fallback
    await bot.sendMessage(chatId, `${celeb.name}\n(Unable to load image)`, {
      reply_markup: {
        inline_keyboard: [
          ...(celeb.bio ? [[{ text: '🔗 View Bio', url: celeb.bio }]] : []),
          [{ text: '⬅️ Back', callback_data: 'back_to_list' }]
        ]
      }
    });
  }
}

// /start shows the list
bot.onText(/\/start|\/list/, (msg) => {
  const celebs = loadCelebs();
  bot.sendMessage(msg.chat.id, 'Welcome! Choose a celebrity:', {
    reply_markup: listKeyboard(celebs)
  });
});

// Handle button clicks
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;
  const celebs = loadCelebs();

  try {
    if (data === 'back_to_list') {
      await bot.sendMessage(chatId, 'Welcome! Choose a celebrity:', {
        reply_markup: listKeyboard(celebs)
      });
      return bot.answerCallbackQuery(q.id);
    }

    if (data.startsWith('celeb_')) {
      const index = Number(data.split('_')[1]);
      const celeb = celebs[index];
      if (!celeb) {
        await bot.answerCallbackQuery(q.id, { text: 'Not found', show_alert: true });
        return;
      }
      await sendCard(chatId, celeb);
      return bot.answerCallbackQuery(q.id);
    }
  } catch (e) {
    console.error('callback_query error:', e);
    try { await bot.answerCallbackQuery(q.id, { text: 'Error', show_alert: true }); } catch {}
  }
});

bot.on('polling_error', e => console.error('polling_error:', e.message));
console.log('✅ Bot running (buttons + View Bio + Back)');
