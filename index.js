// index.js
const { Telegraf, Markup } = require('telegraf');
let rawCelebs = require('./celebs.json');

// ----- BOT TOKEN -----
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN (or BOT_TOKEN) env var');
  process.exit(1);
}
const bot = new Telegraf(TOKEN);

// normalize celebs
const celebs = (rawCelebs || []).filter(c => c && c.name);

// page settings
const PAGE_SIZE = 10;

// build menu
function buildMenu(page = 1) {
  const start = (page - 1) * PAGE_SIZE;
  const slice = celebs.slice(start, start + PAGE_SIZE);
  const rows = slice.map(c => [Markup.button.callback(c.name, `pick:${c.name}`)]);
  const totalPages = Math.max(1, Math.ceil(celebs.length / PAGE_SIZE));
  const nav = [];
  if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `page:${page - 1}`));
  nav.push(Markup.button.callback(`Page ${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `page:${page + 1}`));
  rows.push(nav);
  return Markup.inlineKeyboard(rows);
}

// helper to edit or send new
async function editOrSendNew(ctx, editFn, sendFn) {
  const msgId = ctx.callbackQuery?.message?.message_id;
  try {
    await editFn();
  } catch {
    const sent = await sendFn();
    if (msgId) { try { await ctx.deleteMessage(msgId); } catch {} }
    return sent;
  }
}

// start
bot.start((ctx) => ctx.reply('Choose a celebrity:', buildMenu(1)));

// pagination
bot.action(/^page:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageReplyMarkup(buildMenu(page).reply_markup),
    async () => ctx.reply('Choose a celebrity:', buildMenu(page))
  );
});

// pick celeb
bot.action(/^pick:(.+)$/, async (ctx) => {
  const name = ctx.match[1];
  const celeb = celebs.find(c => c.name === name);
  if (!celeb) return ctx.answerCbQuery('Not found');

  const buttons = Markup.inlineKeyboard([
    [Markup.button.url('🔗 View Leaks', celeb.url)],
    [Markup.button.callback('⬅️ Back', 'back:1')]
  ]);

  await editOrSendNew(
    ctx,
    async () => {
      if (celeb.file_id) {
        await ctx.editMessageMedia(
          { type: 'photo', media: celeb.file_id, caption: celeb.name },
          { reply_markup: buttons.reply_markup }
        );
      } else {
        await ctx.editMessageMedia(
          { type: 'photo', media: celeb.image, caption: celeb.name },
          { reply_markup: buttons.reply_markup }
        );
      }
    },
    async () => {
      if (celeb.file_id) {
        await ctx.replyWithPhoto(celeb.file_id, { caption: celeb.name, reply_markup: buttons.reply_markup });
      } else {
        await ctx.replyWithPhoto({ url: celeb.image }, { caption: celeb.name, reply_markup: buttons.reply_markup });
      }
    }
  );
});

// back button
bot.action(/^back:(\d+)$/, async (ctx) => {
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageText('Choose a celebrity:', buildMenu(1)),
    async () => ctx.reply('Choose a celebrity:', buildMenu(1))
  );
});

bot.action('noop', (ctx) => ctx.answerCbQuery(''));

bot.launch();
console.log('Bot running…');

// stop signals
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
