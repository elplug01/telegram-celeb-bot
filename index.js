// index.js
const { Telegraf, Markup } = require('telegraf');
const rawCelebs = require('./celebs.json');

// ---- BOT TOKEN (Railway env var) ----
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN (or BOT_TOKEN) env var');
  process.exit(1);
}
const bot = new Telegraf(TOKEN);

// ---- utils ----
const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 45);

// normalize celebs
const celebs = (rawCelebs || [])
  .filter(c => c && c.name)
  .map(c => ({ ...c, slug: c.slug ? String(c.slug) : slugify(c.name) }));

// ---- menu + paging ----
const PAGE_SIZE = 10;

function buildMenu(page = 1) {
  const start = (page - 1) * PAGE_SIZE;
  const slice = celebs.slice(start, start + PAGE_SIZE);

  const rows = slice.map(c => [Markup.button.callback(c.name, `pick:${c.slug}`)]);

  const totalPages = Math.max(1, Math.ceil(celebs.length / PAGE_SIZE));
  const nav = [];
  if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `page:${page - 1}`));
  nav.push(Markup.button.callback(`Page ${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `page:${page + 1}`));
  rows.push(nav);

  return Markup.inlineKeyboard(rows);
}

// edit-in-place helper (fallback: send new and delete old)
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

// ---- handlers ----
bot.start((ctx) => ctx.reply('Choose a celebrity:', buildMenu(1)));

bot.action(/^page:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery(); // clear spinner fast
  const page = Number(ctx.match[1]);
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageReplyMarkup(buildMenu(page).reply_markup),
    async () => ctx.reply('Choose a celebrity:', buildMenu(page))
  );
});

bot.action(/^pick:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery(); // clear spinner fast
  const slug = ctx.match[1];
  const celeb = celebs.find(c => c.slug === slug);
  if (!celeb) return; // already answered

  const buttons = Markup.inlineKeyboard([
    [Markup.button.url('🔗 View Leaks', celeb.url)],
    [Markup.button.callback('⬅️ Back', 'back:1')]
  ]);

  // try to edit in place to a photo; if it fails, send a new photo message
  await editOrSendNew(
    ctx,
    async () =>
      ctx.editMessageMedia(
        { type: 'photo', media: celeb.image, caption: celeb.name },
        { reply_markup: buttons.reply_markup }
      ),
    async () =>
      ctx.replyWithPhoto({ url: celeb.image }, { caption: celeb.name, reply_markup: buttons.reply_markup })
  );
});

bot.action(/^back:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery(); // clear spinner fast
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageText('Choose a celebrity:', buildMenu(1)),
    async () => ctx.reply('Choose a celebrity:', buildMenu(1))
  );
});

bot.action('noop', async (ctx) => {
  await ctx.answerCbQuery(); // just dismiss spinner
});

bot.launch();
console.log('Bot running…');

// graceful shutdown for Railway
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
