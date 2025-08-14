// index.js
const { Telegraf, Markup } = require('telegraf');
const rawCelebs = require('./celebs.json');

// ---- TOKEN (Railway) ----
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN (or BOT_TOKEN) env var');
  process.exit(1);
}
const bot = new Telegraf(TOKEN);

// ---- helpers ----
const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 45);

// normalize celebs
const celebs = (rawCelebs || [])
  .filter(c => c && c.name && (c.image || c.url))
  .map(c => ({ ...c, slug: c.slug ? String(c.slug) : slugify(c.name) }));

const label = (name) => name;

// pagination markup
const PAGE_SIZE = 10;
function buildMenu(page = 1) {
  const start = (page - 1) * PAGE_SIZE;
  const slice = celebs.slice(start, start + PAGE_SIZE);

  const rows = slice.map(c => [Markup.button.callback(label(c.name), `pick:${c.slug}`)]);

  const totalPages = Math.max(1, Math.ceil(celebs.length / PAGE_SIZE));
  const nav = [];
  if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `page:${page - 1}`));
  nav.push(Markup.button.callback(`Page ${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `page:${page + 1}`));
  rows.push(nav);

  return Markup.inlineKeyboard(rows);
}

// ---- routes ----
bot.start((ctx) => ctx.reply('Choose a celebrity:', buildMenu(1)));

bot.action(/^page:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery(); // clear spinner
  const page = Number(ctx.match[1]);

  try {
    await ctx.editMessageReplyMarkup(buildMenu(page).reply_markup);
  } catch {
    // if we can't edit (e.g., old msg), just send a new one and delete the old
    const oldId = ctx.callbackQuery?.message?.message_id;
    const m = await ctx.reply('Choose a celebrity:', buildMenu(page));
    if (oldId) { try { await ctx.deleteMessage(oldId); } catch {} }
    return m;
  }
});

bot.action(/^pick:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery(); // instant feedback

  const slug = ctx.match[1];
  const celeb = celebs.find(c => c.slug === slug);
  if (!celeb) return ctx.reply('Not found. Try again.');

  // remove the menu so we always show the photo fresh
  const menuId = ctx.callbackQuery?.message?.message_id;
  if (menuId) { try { await ctx.deleteMessage(menuId); } catch {} }

  const buttons = Markup.inlineKeyboard([
    [Markup.button.url('🔗 View Bio', celeb.url)],
    [Markup.button.callback('⬅️ Back', 'back:1')]
  ]);

  try {
    // prefer URL field "image"; fall back to sending link text if needed
    await ctx.replyWithPhoto(
      celeb.image ? { url: celeb.image } : { url: celeb.url },
      { caption: celeb.name, reply_markup: buttons.reply_markup }
    );
  } catch (err) {
    console.error('replyWithPhoto failed:', err?.message || err);
    await ctx.reply(`${celeb.name}\nOpen bio`, { reply_markup: buttons.reply_markup });
  }
});

bot.action(/^back:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  // delete the photo card message, then re-send the menu (page 1)
  const cardId = ctx.callbackQuery?.message?.message_id;
  if (cardId) { try { await ctx.deleteMessage(cardId); } catch {} }
  return ctx.reply('Choose a celebrity:', buildMenu(1));
});

bot.action('noop', (ctx) => ctx.answerCbQuery(''));

bot.launch();
console.log('Bot running…');

// graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
