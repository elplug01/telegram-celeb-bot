// index.js
const { Telegraf, Markup } = require('telegraf');
const celebs = require('./celebs.json');

// ========= BOT TOKEN =========
// Railway uses the env var you already set (TELEGRAM_BOT_TOKEN)
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ========= EMOJI MAP =========
// One emoji per name/slug. If a name isn't listed here, we fall back to ⭐.
const emojiMap = {
  // ---- your original 3 ----
  "Ellie Leen": "🌼",
  "Xenon": "💜",
  "Lada Lyumos": "🎭",

  // ---- big batch you added (examples) ----
  "Alina Becker": "🎀",
  "Corrina Kopf": "💄",
  "Mikayla Demaiter": "🏒",
  "HannahOwo": "🎮",
  "Amouranth": "🔥",
  "Octokuro": "🖤",
  "Selti": "🧊",
  "Grace Charis": "⛳️",
  "Vladislava Shelygina": "❄️",

  "Mia Khalifa": "🖋️",
  "Megnut": "🥜",
  "Lela Sonha": "🌙",
  "SweetieFox": "🦊",
  "Vanessa Bohorquez": "🌴",
  "Kayla Moody": "✨",
  "Fetching_Butterflies": "🦋",
  "Kenzie Anne": "💎",
  "Leah Chan": "🎨",
  "Elle Brooke": "⚽️",
  "Bunni.Emmie": "🐰",
  "MsSethi": "🌶️",
  "Dainty Wilder": "🌸",
  "Izzybunnies": "🐇",
  "Funsizedasian": "🍡",
  "Whitecrush": "🤍",
  "Lehlani": "🌺",
  "RealSkyBri": "☁️",
  "Isla Moon": "🌕",
  "Audrey & Sadie": "👯‍♀️",
  "Quinn Finite": "♾️",
  "Jodielawsonx": "📸",
  "Avva Ballerina": "🩰",
  "MsPuiyi": "🌟",
  "Bigtittygothegg": "🥚",
  "Peachthot": "🍑",
  "Avva Addams": "🖤",
  "LittleSula": "🧸",
  "Mia Malkova": "🌼",
  "Bishoujomom": "🌸",
  "Kimberly Yang": "💮",
  "mysticbeing": "🔮",
  "Bronwin Aurora": "🌅",
  "Reiinapop": "🍭",
  "hot4lexi": "🔥",
  "aliceoncam": "🎥",
  "Emblack": "🖤",
  "Miss Fetilicious": "🍯",
  "Angela White": "🤍",
  "soogsx": "💫",
  "Emily Lynne": "🌿",
  "Jasminx": "🌼",
  "MsFiiire": "🔥",
  "Railey Diesel": "🛠️",
  "Beckyxxoo": "💋",
  "Evie Rain": "🌧️",
  "f_urbee": "🐝",
  "Jameliz": "💃",
  "shinratensei98": "🌀",
  "zartprickelnd": "✨",
  "Rae Lil Black": "🕶️",
  "Lana Rhoades": "💎",
  "Noemiexlili": "🌙",
  "Sophia Smith": "📚",
  "Kittyxkum": "🐱",
  "Gill Ellis Young": "🎓",
  "Sarawxp": "🌊",
  "Stormy_Succubus": "🌩️",
  "Your_submissive_doll": "🪆",
  "Rocksylight": "🪨",
  "Mackenzie Jones": "🎵",
  "cherrishlulu": "🍒",
  "Alyssa9": "9️⃣",
  "Nikanikaa": "🌟",
  "Olivia Casta": "🌹",
  "Lady Melamori": "🎀",
  "Waifumiia": "🧋",
  "Eva Elfie": "🧚",
  "Belle Delphine": "🧼",
  "Amanda Cerny": "🎬",
  "Sophie Mudd": "🧁",
  "Sara Underwood": "🌲",
  "Genesis Mia Lopez": "📖",
  "Demi Rose": "🌹",
  "Alice Delish": "🍰",
  "Rachel Cook": "🍳",
  "Hana Bunny": "🐰",
  "Shiftymine": "⛏️",
  "Izzy Green": "🍀",
  "sunnyrayxo": "☀️",
  "Vyvan Le": "🪷",
  "Potatogodzilla": "🥔",
  "Natalie Roush": "🚗",
  "Morgpie": "🥧",
  "Byoru": "🍡",
  "Jessica Nigri": "🎮",
  "Alinity": "🐾",
  "Miniloonaa": "🌙",
  "cherrycrush": "🍒",
  "Vinnegal": "🧪",
  "Norafawn": "🦌",
  "Veronica Perasso": "💃",
  "Haneame": "🎎",
  "Hime_Tsu": "👑",
  "Iggy Azalea": "🎤",
  "Makoshake": "🥤",
  "Bebahan": "🐝",
  "Voulezj": "💄",
  "peachjars": "🍑",
  "Okichloeo": "🧜‍♀️"
};

// Helper: label with emoji
const withEmoji = (name) => `${emojiMap[name] || '⭐'}  ${name}`;

// ========= PAGINATION SETTINGS =========
const PAGE_SIZE = 10;

// Build a page of buttons
function buildMenu(page = 1) {
  const start = (page - 1) * PAGE_SIZE;
  const slice = celebs.slice(start, start + PAGE_SIZE);

  const rows = slice.map(c =>
    [Markup.button.callback(withEmoji(c.name), `pick:${c.slug}`)]
  );

  const totalPages = Math.ceil(celebs.length / PAGE_SIZE);
  const nav = [];

  if (page > 1) nav.push(Markup.button.callback('⬅️ Prev', `page:${page - 1}`));
  nav.push(Markup.button.callback(`Page ${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('Next ➡️', `page:${page + 1}`));

  if (nav.length) rows.push(nav);
  return Markup.inlineKeyboard(rows);
}

// ========= COMMANDS =========
bot.start((ctx) => {
  return ctx.reply('Choose a celebrity:', buildMenu(1));
});

bot.action(/^page:(\d+)$/, (ctx) => {
  const page = Number(ctx.match[1]);
  return ctx.editMessageReplyMarkup(buildMenu(page).reply_markup).catch(() => {});
});

// Show one celeb (photo + “View Bio” + “Back”)
bot.action(/^pick:(.+)$/, async (ctx) => {
  const slug = ctx.match[1];
  const celeb = celebs.find(c => c.slug === slug);
  if (!celeb) return;

  const buttons = Markup.inlineKeyboard([
    [Markup.button.url('🔗 View Bio', celeb.url)],
    [Markup.button.callback('⬅️ Back', `back:1`)]
  ]);

  await ctx.replyWithPhoto(
    { url: celeb.image },
    { caption: celeb.name, reply_markup: buttons.reply_markup }
  );
});

bot.action(/^back:(\d+)$/, (ctx) => {
  const page = Number(ctx.match[1] || 1);
  return ctx.reply('Choose a celebrity:', buildMenu(page));
});

// ignore no-op button
bot.action('noop', (ctx) => ctx.answerCbQuery(''));

// ========= START =========
bot.launch();
console.log('Bot running…');
