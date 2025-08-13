const TelegramBot = require('node-telegram-bot-api');
const celebs = require('./celebs.json');

const token = process.env.BOT_TOKEN; // Make sure BOT_TOKEN is set in Railway Variables
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Welcome! Type /list to see all celebs.');
});

bot.onText(/\/list/, (msg) => {
  let message = celebs.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
  message += '\n\nSend /celeb <number> to get details.';
  bot.sendMessage(msg.chat.id, message);
});

bot.onText(/\/celeb (.+)/, (msg, match) => {
  const index = parseInt(match[1]) - 1;
  if (index >= 0 && index < celebs.length) {
    const celeb = celebs[index];
    bot.sendMessage(msg.chat.id, `${celeb.name}\n${celeb.bio}\n${celeb.url}`);
  } else {
    bot.sendMessage(msg.chat.id, 'Invalid number. Use /list to see options.');
  }
});
