const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const celebrities = [
    { name: 'Mia Khalifa', url: 'https://rentry.co/mia-khalifa' },
    { name: 'Megnut', url: 'https://rentry.co/megnut' },
    { name: 'Lela Sonha', url: 'https://rentry.co/lela-sonha' },
    { name: 'SweetieFox', url: 'https://rentry.co/sweetiefox' },
    { name: 'Vanessa Bohorquez', url: 'https://rentry.co/vanessa-bohorquez' },
    { name: 'Kayla Moody', url: 'https://rentry.co/kayla-moody' },
    { name: 'Fetching_Butterflies', url: 'https://rentry.co/fetching-butterflies' },
    { name: 'Kenzie Anne', url: 'https://rentry.co/kenzie-anne' },
    { name: 'Leah Chan', url: 'https://rentry.co/leah-chan' },
    { name: 'Elle Brooke', url: 'https://rentry.co/elle-brooke' },
    { name: 'Belle Delphine', url: 'https://rentry.co/belle-delphine' }
];

const ITEMS_PER_PAGE = 10;

bot.start((ctx) => {
    sendCelebrityList(ctx, 1);
});

function sendCelebrityList(ctx, page) {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const celebPage = celebrities.slice(startIndex, endIndex);

    const buttons = celebPage.map(c => [Markup.button.callback(c.name, `pick:${c.name}`)]);

    if (page > 1) {
        buttons.push([Markup.button.callback('⬅️ Prev', `page:${page - 1}`)]);
    }
    if (endIndex < celebrities.length) {
        buttons.push([Markup.button.callback('Next ➡️', `page:${page + 1}`)]);
    }

    ctx.reply(`Choose a celebrity:`, Markup.inlineKeyboard(buttons));
}

bot.action(/page:(\d+)/, (ctx) => {
    const page = parseInt(ctx.match[1]);
    ctx.editMessageText(`Choose a celebrity:`, Markup.inlineKeyboard(
        getCelebrityButtons(page)
    ));
});

function getCelebrityButtons(page) {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const celebPage = celebrities.slice(startIndex, endIndex);

    const buttons = celebPage.map(c => [Markup.button.callback(c.name, `pick:${c.name}`)]);

    if (page > 1) {
        buttons.push([Markup.button.callback('⬅️ Prev', `page:${page - 1}`)]);
    }
    if (endIndex < celebrities.length) {
        buttons.push([Markup.button.callback('Next ➡️', `page:${page + 1}`)]);
    }
    return buttons;
}

bot.action(/pick:(.+)/, (ctx) => {
    const celebName = ctx.match[1];
    const celeb = celebrities.find(c => c.name === celebName);
    if (!celeb) return ctx.answerCbQuery('Celebrity not found.');

    const buttons = Markup.inlineKeyboard([
        [Markup.button.url('🔗 View Leaks', celeb.url)], // Changed here
        [Markup.button.callback('⬅️ Back', 'page:1')]
    ]);

    ctx.editMessageText(`${celeb.name}`, buttons);
});

bot.launch();
