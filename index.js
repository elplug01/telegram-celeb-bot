const TelegramBot = require("node-telegram-bot-api");
const celebs = require("./celebs.json");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome! Type /list to see all celebs.");
});

bot.onText(/\/list/, (msg) => {
  let reply = celebs.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
  bot.sendMessage(msg.chat.id, reply + "\n\nSend /celeb <number> to get details.");
});

bot.onText(/\/celeb (\d+)/, (msg, match) => {
  const index = parseInt(match[1], 10) - 1;
  if (index >= 0 && index < celebs.length) {
    const celeb = celebs[index];
    bot.sendPhoto(msg.chat.id, celeb.picture, {
      caption: `${celeb.name}\nBio: ${celeb.bio}`
    });
  } else {
    bot.sendMessage(msg.chat.id, "Invalid number.");
  }
});
