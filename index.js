const TelegramBot = require('node-telegram-bot-api');

// Replace with your Telegram bot token
const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

// Celebs data
const celebs = [
  { name: "Ellie Leen", bioUrl: "https://rentry.co/2wmntw5u", picUrl: "https://i.postimg.cc/RhtMQ9Z9/IMG-5988.jpg" },
  { name: "Xenon", bioUrl: "https://rentry.co/qyuizuda", picUrl: "https://i.postimg.cc/RFzqqnNF/IMG-5989.jpg" },
  { name: "Lada Lyumos", bioUrl: "https://rentry.co/otdkui22", picUrl: "https://i.postimg.cc/2y0k3gX7/IMG-5990.jpg" }
];

// /start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome! Type /list to see all celebs.");
});

// /list command with buttons
bot.onText(/\/list/, (msg) => {
  const chatId = msg.chat.id;

  const options = {
    reply_markup: {
      inline_keyboard: celebs.map((celeb, index) => [{
        text: celeb.name,
        callback_data: `celeb_${index}`
      }])
    }
  };

  bot.sendMessage(chatId, "Select a celeb:", options);
});

// Handle button clicks
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith("celeb_")) {
    const index = parseInt(data.split("_")[1]);
    const celeb = celebs[index];

    bot.sendPhoto(chatId, celeb.picUrl, {
      caption: `${celeb.name}\nBio: ${celeb.bioUrl}`
    });
  }
});
