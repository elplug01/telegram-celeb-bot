// index.js
const { Telegraf, Markup } = require('telegraf');
const rawCelebs = require('./celebs.json');

// ---- TOKEN (Railway env) ----
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN or BOT_TOKEN env var');
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
  .filter(c => c && c.name)
  .map(c => ({ ...c, slug: c.slug ? String(c.slug) : slugify(c.name) }));

const PAGE_SIZE = 10;

// Remember last “menu message” per chat so we can delete it
const lastMenuMsgId = new Map(); // chatId -> message_id

function buildMenu(page = 1) {
  const start = (page - 1) * PAGE_SIZE;
  const slice = celebs.slice(start, start + PAGE_SIZE);

  const rows = slice.map(c => [
    Markup.button.callback(c.name, `pick:${c.slug}`)
  ]);

  const totalPages = Math.max(1, Math.ceil(celebs.length / PAGE_SIZE));
  const nav = [];
  if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `page:${page - 1}`));
  nav.push(Markup.button.callback(`Page ${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `page:${page + 1}`));
  rows.push(nav);

  return Markup.inlineKeyboard(rows);
}

async function sendMenu(ctx, page = 1) {
  const sent = await ctx.reply('Choose a celebrity:', buildMenu(page));
  lastMenuMsgId.set(ctx.chat.id, sent.message_id);
  return sent;
}

async function deleteIfExists(ctx, messageId) {
  if (!messageId) return;
  try { await ctx.telegram.deleteMessage(ctx.chat.id, messageId); } catch {}
}

// ---- commands / actions ----
bot.start(async (ctx) => {
  await sendMenu(ctx, 1);
});

// fast paging: edit when possible, otherwise send new and delete old
bot.action(/^page:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery(); // clear the spinner immediately
  const page = Number(ctx.match[1]);
  try {
    await ctx.editMessageReplyMarkup(buildMenu(page).reply_markup);
  } catch {
    // if we can't edit (too old / different message), send new and delete old menu
    const oldId = lastMenuMsgId.get(ctx.chat.id);
    const sent = await sendMenu(ctx, page);
    if (oldId && oldId !== sent.message_id) await deleteIfExists(ctx, oldId);
  }
});

bot.action(/^pick:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery(); // clear spinner

  const slug = ctx.match[1];
  const celeb = celebs.find(c => c.slug === slug);
  if (!celeb) return;

  const buttons = Markup.inlineKeyboard([
    [Markup.button.url('🔗 View Leaks', celeb.url)],
    [Markup.button.callback('⬅️ Back', 'back:1')]
  ]);

  // Delete the last menu (if we can), then send the photo
  const oldMenuId = lastMenuMsgId.get(ctx.chat.id);

  // Try to send photo; if it fails, fall back to text + link
  try {
    const sent = await ctx.replyWithPhoto(
      { url: celeb.image },
      { caption: celeb.name, reply_markup: buttons.reply_markup }
    );
    if (oldMenuId) await deleteIfExists(ctx, oldMenuId);
    // store this as the “last content” so Back can delete it
    lastMenuMsgId.set(ctx.chat.id, sent.message_id);
  } catch (err) {
    console.error('Photo send failed, falling back to text:', err?.message || err);
    const sent = await ctx.reply(
      `${celeb.name}\n${celeb.url}`,
      buttons
    );
    if (oldMenuId) await deleteIfExists(ctx, oldMenuId);
    lastMenuMsgId.set(ctx.chat.id, sent.message_id);
  }
});

bot.action(/^back:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery(); // clear spinner
  // delete the current (photo/text) message and show menu page 1
  const currentId = ctx.callbackQuery?.message?.message_id;
  if (currentId) await deleteIfExists(ctx, currentId);
  await sendMenu(ctx, 1);
});

bot.action('noop', (ctx) => ctx.answerCbQuery(''));

// ---- launch ----
bot.launch();
console.log('Bot running…');

// Graceful stop (Railway)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
