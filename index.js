const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Load celebrity data
const celebsFile = path.join(__dirname, 'celebs.json');
let celebs = JSON.parse(fs.readFileSync(celebsFile, 'utf8'));

// Telegram Bot Token
const token = 'YOUR_BOT_TOKEN_HERE';
const bot = new TelegramBot(token, { polling: true });

// Pagination
const ITEMS_PER_PAGE = 7;
let currentPage = {};

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    currentPage[chatId] = 0;
    sendCelebList(chatId, currentPage[chatId]);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('page_')) {
        const page = parseInt(data.split('_')[1]);
        currentPage[chatId] = page;
        sendCelebList(chatId, page);
    } else if (data.startsWith('celeb_')) {
        const index = parseInt(data.split('_')[1]);
        sendCelebPhoto(chatId, index);
    }
});

function sendCelebList(chatId, page) {
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageCelebs = celebs.slice(startIndex, endIndex);

    const keyboard = pageCelebs.map((celeb, index) => {
        return [{ text: celeb.name, callback_data: `celeb_${startIndex + index}` }];
    });

    const totalPages = Math.ceil(celebs.length / ITEMS_PER_PAGE);
    const navButtons = [];

    if (page > 0) {
        navButtons.push({ text: '⬅ Prev', callback_data: `page_${page - 1}` });
    }
    if (page < totalPages - 1) {
        navButtons.push({ text: 'Next ➡', callback_data: `page_${page + 1}` });
    }

    keyboard.push(navButtons);

    bot.sendMessage(chatId, `Page ${page + 1}/${totalPages}`, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

function sendCelebPhoto(chatId, index) {
    const celeb = celebs[index];
    if (celeb.file_id) {
        bot.sendPhoto(chatId, celeb.file_id);
    } else if (celeb.photo_url) {
        bot.sendPhoto(chatId, celeb.photo_url);
    } else {
        bot.sendMessage(chatId, "No photo available for this celebrity.");
    }
}
