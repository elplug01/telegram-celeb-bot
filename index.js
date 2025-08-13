// index.js
const { Telegraf, Markup } = require('telegraf');
let rawCelebs = require('./celebs.json');

// ----- BOT TOKEN (Railway env var) -----
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN env var');
  process.exit(1);
}
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ----- UTIL: slug + safe label -----
const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 45);

// Normalize celebs (ensure slug exists)
const celebs = rawCelebs
  .filter(c => c && c.name) // keep only valid rows
  .map(c => ({
    ...c,
    slug: c.slug ? String(c.slug) : slugify(c.name),
  }));

// ----- EMOJI MAP (1 emoji per name) -----
const emojiMap = {
  "Ellie Leen": "🌼", "Xenon": "💜", "Lada Lyumos": "🎭",
  "Alina Becker": "🎀","Corrina Kopf": "💄","Mikayla Demaiter": "🏒","HannahOwo": "🎮","Amouranth": "🔥","Octokuro": "🖤","Selti": "🧊","Grace Charis": "⛳️","Vladislava Shelygina": "❄️",
  "Mia Khalifa": "🖋️","Megnut": "🥜","Lela Sonha": "🌙","SweetieFox": "🦊","Vanessa Bohorquez": "🌴","Kayla Moody": "✨","Fetching_Butterflies": "🦋","Kenzie Anne": "💎","Leah Chan": "🎨","Elle Brooke": "⚽️",
  "Bunni.Emmie": "🐰","MsSethi": "🌶️","Dainty Wilder": "🌸","Izzybunnies": "🐇","Funsizedasian": "🍡","Whitecrush": "🤍","Lehlani": "🌺","RealSkyBri": "☁️","Isla Moon": "🌕","Audrey & Sadie": "👯‍♀️",
  "Quinn Finite": "♾️","Jodielawsonx": "📸","Avva Ballerina": "🩰","MsPuiyi": "🌟","Bigtittygothegg": "🥚","Peachthot": "🍑","Avva Addams": "🖤","LittleSula": "🧸","Mia Malkova": "🌼","Bishoujomom": "🌸",
  "Kimberly Yang": "💮","mysticbeing": "🔮","Bronwin Aurora": "🌅","Reiinapop": "🍭","hot4lexi": "🔥","aliceoncam": "🎥","Emblack": "🖤","Miss Fetilicious": "🍯","Angela White": "🤍","soogsx": "💫",
  "Emily Lynne": "🌿","Jasminx": "🌼","MsFiiire": "🔥","Railey Diesel": "🛠️","Beckyxxoo": "💋","Evie Rain": "🌧️","f_urbee": "🐝","Jameliz": "💃","shinratensei98": "🌀","zartprickelnd": "✨",
  "Rae Lil Black": "🕶️","Lana Rhoades": "💎","Noemiexlili": "🌙","Sophia Smith": "📚","Kittyxkum": "🐱","Gill Ellis Young": "🎓","Sarawxp": "🌊","Stormy_Succubus": "🌩️","Your_submissive_doll": "🪆","Rocksylight": "🪨",
  "Mackenzie Jones": "🎵","cherrishlulu": "🍒","Alyssa9": "9️⃣","Nikanikaa": "🌟","Olivia Casta": "🌹","Lady Melamori": "🎀","Waifumiia": "🧋","Eva Elfie": "🧚","Belle Delphine": "🧼","Amanda Cerny": "🎬",
  "Sophie Mudd": "🧁","Sara Underwood": "🌲","Genesis Mia Lopez": "📖","Demi Rose": "🌹","Alice Delish": "🍰","Rachel Cook": "🍳","Hana Bunny": "🐰","Shiftymine": "⛏️","Izzy Green": "🍀","sunnyrayxo": "☀️",
  "Vyvan Le": "🪷","Potatogodzilla": "🥔","Natalie Roush": "🚗","Morgpie": "🥧","Byoru": "🍡","Jessica Nigri": "🎮","Alinity": "🐾","Miniloonaa": "🌙","cherrycrush": "🍒","Vinnegal": "🧪",
  "Norafawn": "🦌","Veronica Perasso": "💃","Haneame": "🎎","Hime_Tsu": "👑","Iggy Azalea": "🎤","Makoshake": "🥤","Bebahan": "🐝","Voulezj": "💄","peachjars": "🍑","Okichloeo": "🧜‍♀️"
};

const label = (name) => `${emojiMap[name] || '⭐'}  ${name}`;

// ----- PAGINATION -----
const PAGE_SIZE = 10;

function buildMenu(page = 1) {
  const start = (page - 1) * PAGE_SIZE;
  const slice = celebs.slice(start, start + PAGE_SIZE);

  const rows = slice.map(c => {
    const cbData = `pick:${c.slug || slugify(c.name)}`; // always defined
    return [Markup.button.callback(label(c.name), cbData)];
  });

  const totalPages = Math.max(1, Math.ceil(celebs.length / PAGE_SIZE));
  const nav = [];
  if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `page:${page - 1}`));
  nav.push(Markup.button.callback(`Page ${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `page:${page + 1}`));
  rows.push(nav);

  return Markup.inlineKeyboard(rows);
}

// ----- COMMANDS / ACTIONS -----
bot.start((ctx) => ctx.reply('Choose a celebrity:', buildMenu(1)));

bot.action(/^page:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  try {
    await ctx.editMessageReplyMarkup(buildMenu(page).reply_markup);
  } catch (e) {
    // If original message not editable (e.g., too old), just send new one
    await ctx.reply('Choose a celebrity:', buildMenu(page));
  }
});

bot.action(/^pick:(.+)$/, async (ctx) => {
  const slug = ctx.match[1];
  const celeb = celebs.find(c => c.slug === slug);
  if (!celeb) return ctx.answerCbQuery('Not found');

  const buttons = Markup.inlineKeyboard([
    [Markup.button.url('🔗 View Bio', celeb.url)],
    [Markup.button.callback('⬅️ Back', `back:1`)]
  ]);

  try {
    await ctx.replyWithPhoto({ url: celeb.image }, { caption: celeb.name, reply_markup: buttons.reply_markup });
  } catch (err) {
    console.error('send photo error:', err?.message || err);
    await ctx.reply(`${celeb.name}\n${celeb.url}`, buttons);
  }
});

bot.action(/^back:(\d+)$/, (ctx) => ctx.reply('Choose a celebrity:', buildMenu(1)));
bot.action('noop', (ctx) => ctx.answerCbQuery(''));

bot.launch();
console.log('Bot running…');

// Graceful stop for Railway
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
