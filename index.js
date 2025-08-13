const TelegramBot = require('node-telegram-bot-api');

// Read token from environment variable
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Your celeb list (for now using URLs — later we can replace with file_id)
const celebs = [
  {
    name: "Ellie Leen",
    bio: "https://rentry.co/2wmntw5u",
    photo: "https://i.postimg.cc/RhtMQ9Z9/IMG-5988.jpg"
  },
  {
    name: "Xenon",
    bio: "https://rentry.co/qyuizuda",
    photo: "https://i.postimg.cc/RFzqqnNF/IMG-5989.jpg"
  },
  {
    name: "Lada Lyumos",
    bio: "https://rentry.co/otdkui22",
    photo: "https://i.postimg.cc/52Pg9XhH/IMG-5990.jpg"
  }
];

// Start command — show only celeb buttons (no browse thumbnails button)
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "Choose a celebrity:", {
    reply_markup: {
      inline_keyboard: celebs.map((c, i) => [
        { text: c.name, callback_data: `celeb_${i}` }
      ])
    }
  });
});

// Handle celeb button clicks
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith("celeb_")) {
    const index = parseInt(data.split("_")[1]);
    const celeb = celebs[index];

    bot.sendPhoto(chatId, celeb.photo, {
      caption: celeb.name,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 View Bio', url: celeb.bio }],
          [{ text: '⬅️ Back', callback_data: 'back_to_list' }]
        ]
      }
    });
  }

  if (data === 'back_to_list') {
    bot.sendMessage(chatId, "Choose a celebrity:", {
      reply_markup: {
        inline_keyboard: celebs.map((c, i) => [
          { text: c.name, callback_data: `celeb_${i}` }
        ])
      }
    });
  }
});
