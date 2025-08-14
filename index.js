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

// Normalize celebs
const celebs = (rawCelebs || [])
  .filter(c => c && c.name)
  .map(c => ({ ...c, slug: c.slug ? String(c.slug) : slugify(c.name) }));

// Button label (no emoji for speed/clean look)
const label = (name) => name;

// ---- paging config ----
const PAGE_SIZE = 10;

// Build a single page’s keyboard
function buildPage(page) {
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

// ---- PREBUILD ALL PAGES (cache) ----
const TOTAL_PAGES = Math.max(1, Math.ceil(celebs.length / PAGE_SIZE));
const PAGE_CACHE = Array.from({ length: TOTAL_PAGES }, (_, i) => buildPage(i + 1));

// Small helper: edit in place; if not editable, send new and delete old
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
  await ctx.answerCbQuery(); // clears "Loading…"
  const page = Math.min(Math.max(1, Number(ctx.match[1])), TOTAL_PAGES);
  // super fast: reuse cached reply_markup
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageReplyMarkup(PAGE_CACHE[page - 1].reply_markup),
    async () => ctx.reply('Choose a celebrity:', PAGE_CACHE[page - 1])
  );
});

bot.action(/^pick:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const slug = ctx.match[1];
  const celeb = celebs.find(c => c.slug === slug);
  if (!celeb) return ctx.answerCbQuery('Not found');

  const buttons = Markup.inlineKeyboard([
    [Markup.button.url('🔗 View Bio', celeb.url)],
    [Markup.button.callback('⬅️ Back', 'back:1')]
  ]);

  // Try editing the message media (fastest); fallback to sending and deleting old
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
  await ctx.answerCbQuery();
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageText('Choose a celebrity:', PAGE_CACHE[0]),
    async () => ctx.reply('Choose a celebrity:', PAGE_CACHE[0])
  );
});

bot.action('noop', (ctx) => ctx.answerCbQuery());

bot.launch();
console.log('Bot running…');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
