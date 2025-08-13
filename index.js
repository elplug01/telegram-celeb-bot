const TelegramBot = require('node-telegram-bot-api');
const celebs = require('./celebs.json'); // expects [{name,bio,url}, …]

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('Missing BOT_TOKEN env var');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// ----- helpers -----
function listKeyboard() {
  return {
    inline_keyboard: celebs.map((c, i) => [
      { text: c.name, callback_data: `celeb_${i}` }
    ])
  };
}

// ----- commands -----
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Select a celeb:', { reply_markup: listKeyboard() });
});

bot.onText(/\/list/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Select a celeb:', { reply_markup: listKeyboard() });
});

// ----- button clicks -----
bot.on('callback_query', async (q) => {
  try {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'back_to_list') {
      await bot.sendMessage(chatId, 'Select a celeb:', { reply_markup: listKeyboard() });
      return bot.answerCallbackQuery(q.id);
    }

    if (data.startsWith('celeb_')) {
      const index = Number(data.split('_')[1]);
      const c = celebs[index];
      if (!c) return bot.answerCallbackQuery(q.id, { text: 'Not found' });

      // Send photo with buttons: View Bio (URL) + Back
      await bot.sendPhoto(chatId, c.url, {
        caption: `${c.name}`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 View Bio', url: c.bio }],
            [{ text: '⬅️ Back', callback_data: 'back_to_list' }]
          ]
        }
      });

      return bot.answerCallbackQuery(q.id);
    }
  } catch (err) {
    console.error('callback_query error:', err.message);
  }
});

// Optional: log polling errors
bot.on('polling_error', (e) => console.error('Polling error:', e.message));
