// index.js
const { Telegraf, Markup } = require('telegraf');
const rawCelebs = require('./celebs.json');

// ---- TOKEN (Railway env vars) ----
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

// Normalize celebs (need name, and image or url)
const celebs = (rawCelebs || [])
  .filter(c => c && c.name && (c.image || c.url))
  .map(c => ({ ...c, slug: c.slug ? String(c.slug) : slugify(c.name) }));

// label without emojis (fast)
const label = (name) => name;

// ---- paging config ----
const PAGE_SIZE = 10;
const TOTAL_PAGES = Math.max(1, Math.ceil(celebs.length / PAGE_SIZE));

// Build one page keyboard
function buildPage(page) {
  const start = (page - 1) * PAGE_SIZE;
  const slice = celebs.slice(start, start + PAGE_SIZE);

  const rows = slice.map(c => [Markup.button.callback(label(c.name), `pick:${c.slug}`)]);

  const nav = [];
  if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `page:${page - 1}`));
  nav.push(Markup.button.callback(`Page ${page}/${TOTAL_PAGES}`, 'noop'));
  if (page < TOTAL_PAGES) nav.push(Markup.button.callback('Next ➡️', `page:${page + 1}`));
  rows.push(nav);

  return Markup.inlineKeyboard(rows);
}

// ---- PREBUILD ALL PAGES (cache) ----
const PAGE_CACHE = Array.from({ length: TOTAL_PAGES }, (_, i) => buildPage(i + 1));

// ---- helpers: edit or send-new+delete-old ----
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

// ---- COMMANDS / ACTIONS ----
bot.start(async (ctx) => {
  await ctx.reply('Choose a celebrity:', PAGE_CACHE[0]);
});

bot.action(/^page:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery(); // clear spinner
  const page = Math.min(Math.max(1, Number(ctx.match[1])), TOTAL_PAGES);
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageReplyMarkup(PAGE_CACHE[page - 1].reply_markup),
    async () => ctx.reply('Choose a celebrity:', PAGE_CACHE[page - 1])
  );
});

// Pick -> ACK -> delete menu -> send photo (robust) -> else text fallback
bot.action(/^pick:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery(); // instant feedback

  const slug = ctx.match[1];
  const celeb = celebs.find(c => c.slug === slug);
  if (!celeb) return ctx.reply('Not found. Try again.');

  // delete the menu message so chat stays clean
  const menuId = ctx.callbackQuery?.message?.message_id;
  if (menuId) { try { await ctx.deleteMessage(menuId); } catch {} }

  const buttons = Markup.inlineKeyboard([
    [Markup.button.url('🔗 View Bio', celeb.url)],
    [Markup.button.callback('⬅️ Back', 'back:1')]
  ]);

  const photoInput = celeb.file_id || celeb.fileId || celeb.image || celeb.url;

  // Try sending the photo two ways; if both fail, send text only (no preview)
  try {
    await ctx.replyWithPhoto(photoInput, { caption: celeb.name, reply_markup: buttons.reply_markup });
  } catch (e1) {
    try {
      await ctx.replyWithPhoto({ url: photoInput }, { caption: celeb.name, reply_markup: buttons.reply_markup });
    } catch (e2) {
      await ctx.reply(
        `<b>${celeb.name}</b>${celeb.url ? `\n<a href="${celeb.url}">Open bio</a>` : ''}`,
        { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: buttons.reply_markup }
      );
    }
  }
});

// Back -> ACK -> delete card -> show Page 1 (cached)
bot.action(/^back:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const cardId = ctx.callbackQuery?.message?.message_id;
  if (cardId) { try { await ctx.deleteMessage(cardId); } catch {} }
  await ctx.reply('Choose a celebrity:', PAGE_CACHE[0]);
});

bot.action('noop', (ctx) => ctx.answerCbQuery(''));

bot.launch();
console.log('Bot running…');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
