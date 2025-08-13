const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// Load celeb data from JSON
const celebs = JSON.parse(fs.readFileSync('celebs.json', 'utf8'));

// Create bot instance
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Welcome! Choose a celebrity:", {
        reply_markup: {
            inline_keyboard: celebs.map((celeb, index) => [
                { text: celeb.name, callback_data: `celeb_${index}` }
            ])
        }
    });
});

// Handle button clicks
bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;

    if (data.startsWith('celeb_')) {
        const index = parseInt(data.split('_')[1]);
        const celeb = celebs[index];

        bot.sendPhoto(msg.chat.id, celeb.url, {
            caption: `${celeb.name}\nBio: ${celeb.bio}`
        });
    }
});
