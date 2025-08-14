// index.js
const { Telegraf, Markup } = require('telegraf');
const rawCelebs = require('./celebs.json');

// ---------- TOKEN (Railway var) ----------
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN (or BOT_TOKEN) env var');
  process.exit(1);
}
const bot = new Telegraf(TOKEN);

// ---------- helpers ----------
const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 45);

// normalize celebs (ensure slug)
const celebs = (rawCelebs || [])
  .filter((c) => c && c.name)
  .map((c) => ({ ...c, slug: c.slug ? String(c.slug) : slugify(c.name) }));

const PAGE_SIZE = 10;

function buildMenu(page = 1) {
  const start = (page - 1) * PAGE_SIZE;
  const slice = celebs.slice(start, start + PAGE_SIZE);

  const rows = slice.map((c) => [
    Markup.button.callback(c.name, `pick:${c.slug}`),
  ]);

  const totalPages = Math.max(1, Math.ceil(celebs.length / PAGE_SIZE));
  const nav = [];
  if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `page:${page - 1}`));
  nav.push(Markup.button.callback(`Page ${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `page:${page + 1}`));
  rows.push(nav);

  return Markup.inlineKeyboard(rows);
}

// Edit the existing message if possible; otherwise send a new one and delete old
async function editOrSendNew(ctx, editFn, sendFn) {
  const msgId = ctx.callbackQuery?.message?.message_id;
  try {
    await editFn();
  } catch {
    const sent = await sendFn();
    if (msgId) {
      try { await ctx.deleteMessage(msgId); } catch {}
    }
    return sent;
  }
}

// ---------- commands / actions ----------
bot.start((ctx) => ctx.reply('Choose a celebrity:', buildMenu(1)));

bot.action(/^page:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageReplyMarkup(buildMenu(page).reply_markup),
    async () => ctx.reply('Choose a celebrity:', buildMenu(page))
  );
});

bot.action(/^pick:(.+)$/, async (ctx) => {
  const slug = ctx.match[1];
  const celeb = celebs.find((c) => c.slug === slug);
  if (!celeb) return ctx.answerCbQuery('Not found');

  const buttons = Markup.inlineKeyboard([
    [Markup.button.url('🔗 View Leaks', celeb.url)],
    [Markup.button.callback('⬅️ Back', 'back:1')],
  ]);

  // Prefer Telegram file_id (instant, no blue link card). Fall back to image URL.
  const media = celeb.file_id
    ? { type: 'photo', media: celeb.file_id, caption: celeb.name }
    : { type: 'photo', media: celeb.image,   caption: celeb.name };

  await editOrSendNew(
    ctx,
    async () => ctx.editMessageMedia(media, { reply_markup: buttons.reply_markup }),
    async () =>
      celeb.file_id
        ? ctx.replyWithPhoto(celeb.file_id, { caption: celeb.name, reply_markup: buttons.reply_markup })
        : ctx.replyWithPhoto({ url: celeb.image }, { caption: celeb.name, reply_markup: buttons.reply_markup })
  );
});

bot.action(/^back:(\d+)$/, async (ctx) => {
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageText('Choose a celebrity:', buildMenu(1)),
    async () => ctx.reply('Choose a celebrity:', buildMenu(1))
  );
});

bot.action('noop', (ctx) => ctx.answerCbQuery(''));

// ---------- file_id helper: reply with file_id when you DM a photo ----------
bot.on('photo', async (ctx) => {
  try {
    const sizes = ctx.message.photo;              // different resolutions
    const largest = sizes[sizes.length - 1];      // highest quality
    await ctx.reply(`file_id:\n${largest.file_id}`);
  } catch (err) {
    console.error('Error handling photo:', err);
  }
});

// If user sends an image as “Send as File”, grab id too
bot.on('document', async (ctx) => {
  try {
    const doc = ctx.message.document;
    if (doc?.mime_type?.startsWith('image/')) {
      await ctx.reply(`file_id (document):\n${doc.file_id}`);
    }
  } catch (err) {
    console.error('Error handling document:', err);
  }
});

// ---------- launch ----------
bot.launch();
console.log('Bot running…');

// graceful stop for Railway
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
