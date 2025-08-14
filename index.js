// index.js
const { Telegraf, Markup } = require('telegraf');
const rawCelebs = require('./celebs.json');

// ----- BOT TOKEN (supports TELEGRAM_BOT_TOKEN or BOT_TOKEN) -----
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN (or BOT_TOKEN) env var');
  process.exit(1);
}
const bot = new Telegraf(TOKEN);

// ----- helpers -----
const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 45);

// Normalize celebs (ensure slug exists)
const celebs = (rawCelebs || [])
  .filter(c => c && c.name)
  .map(c => ({
    ...c,
    slug: c.slug ? String(c.slug) : slugify(c.name)
  }));

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

// Edit the same message when possible; else send new and delete old
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

// ----- COMMANDS / ACTIONS -----
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
  const celeb = celebs.find(c => c.slug === slug);
  if (!celeb) return ctx.answerCbQuery('Not found');

  const mediaId = celeb.file_id || celeb.image; // prefer Telegram file_id if you have it

  const buttons = Markup.inlineKeyboard([
    [Markup.button.url('🔗 View Leaks', celeb.url)],
    [Markup.button.callback('⬅️ Back', 'back:1')]
  ]);

  // Try editing in-place to a photo; fallback to sending a fresh photo.
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageMedia(
      { type: 'photo', media: mediaId, caption: celeb.name },
      { reply_markup: buttons.reply_markup }
    ),
    async () => ctx.replyWithPhoto(
      typeof mediaId === 'string' && mediaId.startsWith('http')
        ? { url: mediaId }
        : mediaId,
      { caption: celeb.name, reply_markup: buttons.reply_markup }
    )
  ).catch(async () => {
    // Final fallback: text only (no URL preview)
    await editOrSendNew(
      ctx,
      async () => ctx.editMessageText(
        `**${celeb.name}**`,
        {
          ...buttons,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }
      ),
      async () => ctx.reply(
        `**${celeb.name}**`,
        {
          ...buttons,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }
      )
    );
  });
});

bot.action(/^back:(\d+)$/, async (ctx) => {
  await editOrSendNew(
    ctx,
    async () => ctx.editMessageText('Choose a celebrity:', buildMenu(1)),
    async () => ctx.reply('Choose a celebrity:', buildMenu(1))
  );
});

bot.action('noop', (ctx) => ctx.answerCbQuery(''));

// --- Helper: reply with file_id when you send a photo to the bot ---
bot.on('photo', async (ctx) => {
  try {
    const sizes = ctx.message.photo || [];
    const best = sizes[sizes.length - 1];
    if (best?.file_id) {
      await ctx.reply(`file_id:\n\`${best.file_id}\`\n\nPaste this into celebs.json as "file_id" for that person.`, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    }
  } catch {}
});

bot.launch();
console.log('Bot running…');

// Graceful stop for Railway
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
