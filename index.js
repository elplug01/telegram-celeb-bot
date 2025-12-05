// index.js
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ======= Config =======
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';

// Post to multiple channels (usernames or numeric IDs). You can also set CHANNELS in .env as a comma list.
const CHANNELS = (process.env.CHANNELS || '@Botacatest,@ofleakzz1')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// How often to post (minutes). 120 = every 2 hours.
const POST_EVERY_MINUTES = parseInt(process.env.POST_MINUTES || '120', 10);

// Buttons + caption
const CAPTION = 'Free Onlyfans';
const FULL_LEAKS_URL = process.env.FULL_LEAKS_URL || 'https://t.me/Freakysl_bot';
const VIDS_URL = 'https://t.me/offreel';

// Video rotation list (Telegram file_ids). You can override with POST_VIDEO_FILE_IDS in .env (comma list).
const ROTATION = (process.env.POST_VIDEO_FILE_IDS || [
  'BAACAgEAAxkBAAID0WiieDS5loQVTRlJv4YldD5W1vkfAALjBQACPHwRRTzftenee1R1NgQ', // original
  'BAACAgEAAxkBAAID7Wii7DuLDfdcDFg4Noc1RPn3wp9NAAIgBQACPHwZRTwj5utrtNBfNgQ', // video 1
  'BAACAgEAAxkBAAID-2ijA_vIzqGDcWMuzpnU6c3KvfF1AAIkBQACPHwZRY9A7UCE5qikNgQ', // video 2
  'BAACAgEAAxkBAAID_WijBBemq9RHGdhAnedzYoeBkJLgAAIlBQACPHwZRf2StGh_jSKhNgQ', // video 3
  'BAACAgEAAxkBAAID_2ijBDC9Kfy36JNcI0_rfF7HSMAiAAImBQACPHwZRUXG3ilAkzO_NgQ'  // video 4
]).map(s => s.toString().trim());

// ======= Load celebs list (for the bot menu) =======
const celebsPath = path.join(__dirname, 'celebs.json');
const celebs = JSON.parse(fs.readFileSync(celebsPath, 'utf8'));

// ======= Bot setup =======
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ======= Paging state (per chat) =======
const ITEMS_PER_PAGE = 7;
const pageByChat = new Map();

// ======= Helpers =======
function clamp(n, min, max) { return Math.max(min, Math.min(n, max)); }

function sendPage(chatId, page) {
  const totalPages = Math.max(1, Math.ceil(celebs.length / ITEMS_PER_PAGE));
  const safePage = clamp(page, 0, totalPages - 1);
  pageByChat.set(chatId, safePage);

  const start = safePage * ITEMS_PER_PAGE;
  const pageCelebs = celebs.slice(start, start + ITEMS_PER_PAGE);

  const keyboard = pageCelebs.map((c, i) => ([
    { text: c.name, callback_data: `celeb_${start + i}` }
  ]));

  const navRow = [];
  if (safePage > 0) navRow.push({ text: '⬅ Prev', callback_data: `page_${safePage - 1}` });
  navRow.push({ text: `Page ${safePage + 1}/${totalPages}`, callback_data: 'noop' });
  if (safePage < totalPages - 1) navRow.push({ text: 'Next ➡', callback_data: `page_${safePage + 1}` });
  keyboard.push(navRow);

  bot.sendMessage(chatId, 'Choose a creator:', {
    reply_markup: { inline_keyboard: keyboard }
  });
}

function sendCeleb(chatId, index) {
  const c = celebs[index];
  if (!c) return bot.sendMessage(chatId, 'That item is missing.');

  const caption = c.name;
  const buttons = [];

  if (c.bio && typeof c.bio === 'string' && c.bio.trim().length > 0) {
    buttons.push([{ text: '🔗 View Leaks', url: c.bio }]);
  }

  const page = pageByChat.get(chatId) ?? Math.floor(index / ITEMS_PER_PAGE);
  buttons.push([{ text: '⬅ Back', callback_data: `page_${page}` }]);

  const opts = { caption, reply_markup: { inline_keyboard: buttons } };

  if (c.file_id && typeof c.file_id === 'string') {
    return bot.sendPhoto(chatId, c.file_id, opts).catch(() =>
      bot.sendMessage(chatId, 'Could not load the photo for this item.')
    );
  }
  if (c.url && typeof c.url === 'string') {
    return bot.sendPhoto(chatId, c.url, opts).catch(() =>
      bot.sendMessage(chatId, 'Could not load the photo for this item.')
    );
  }
  return bot.sendMessage(chatId, caption, opts);
}

// ======= Commands / Callbacks =======
bot.onText(/\/start|\/menu/, (msg) => {
  pageByChat.set(msg.chat.id, 0);
  sendPage(msg.chat.id, 0);
});

bot.on('callback_query', (q) => {
  const chatId = q.message.chat.id;
  const data = q.data || '';

  if (data.startsWith('page_')) {
    const page = parseInt(data.split('_')[1], 10) || 0;
    return sendPage(chatId, page);
  }
  if (data.startsWith('celeb_')) {
    const idx = parseInt(data.split('_')[1], 10);
    return sendCeleb(chatId, idx);
  }
  if (data === 'noop') {
    return bot.answerCallbackQuery(q.id);
  }
});

// ======= Helpers for ID replies =======
// Reply with file_id if user sends photo
bot.on('photo', async (msg) => {
  try {
    const best = msg.photo?.[msg.photo.length - 1];
    if (!best) throw new Error('No photo sizes');
    const snippet = '```json\n' + JSON.stringify({ file_id: best.file_id }, null, 2) + '\n```';
    await bot.sendMessage(
      msg.chat.id,
      `Got it! Here is the snippet you can paste into celebs.json:\n\n${snippet}`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    bot.sendMessage(msg.chat.id, 'Sorry, I could not read that photo.');
  }
});

// Reply with file_id if user sends video
bot.on('video', async (msg) => {
  try {
    const v = msg.video;
    if (!v?.file_id) throw new Error('No video');
    const shortSnippet = JSON.stringify({ file_id: v.file_id });
    const full = {
      file_id: v.file_id,
      width: v.width,
      height: v.height,
      duration: v.duration,
      mime_type: v.mime_type
    };
    await bot.sendMessage(
      msg.chat.id,
      `Got it! Detected video. Paste this into celebs.json:\n${shortSnippet}\n\nDetailed:\n\`\`\`json\n${JSON.stringify(full, null, 2)}\n\`\`\``,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Sorry, I could not read that media.');
  }
});

// ======= AUTO-POSTER (every N minutes, multi-channel, auto-delete) =======
// Wait one full interval before first post to avoid double-posts on deploys
// Track last message per channel for deletion
const lastMessageByChannel = new Map(); // channel -> message_id
let rotationIndex = 0;
let postInFlight = false;

async function postOnce() {
  if (postInFlight) {
    console.log('[poster] Skipping: send in flight');
    return;
  }
  postInFlight = true;

  const fileId = ROTATION[rotationIndex];
  const reply_markup = {
    inline_keyboard: [
      [{ text: '👉 Vids', url: VIDS_URL }]
    ]
  };

  try {
    // For each channel: delete previous, post new
    for (const channel of CHANNELS) {
      const prev = lastMessageByChannel.get(channel);
      if (prev) {
        try {
          await bot.deleteMessage(channel, prev);
          console.log(`[poster] Deleted previous in ${channel}:`, prev);
        } catch (e) {
          console.warn(`[poster] Could not delete previous in ${channel}:`, e.message);
        }
      }

      const sent = await bot.sendVideo(channel, fileId, {
        caption: CAPTION,
        supports_streaming: true,
        reply_markup
      });

      lastMessageByChannel.set(channel, sent.message_id);
      console.log('[poster] Posted to', channel, 'msg_id=', sent.message_id);
    }

    // advance rotation
    rotationIndex = (rotationIndex + 1) % ROTATION.length;
  } catch (e) {
    console.error('[poster] Post failed:', e.message);
  } finally {
    postInFlight = false;
  }
}

function startScheduler() {
  const minutes = POST_EVERY_MINUTES;
  const ms = minutes * 60 * 1000;

  const INSTANCE_ID =
    process.env.RAILWAY_DEPLOYMENT_ID ||
    process.env.RAILWAY_ENVIRONMENT_ID ||
    `local-${Math.random().toString(36).slice(2, 8)}`;

  console.log(`[poster] Scheduler starting (every ${minutes} min). instance=${INSTANCE_ID}`);
  console.log('[poster] Channels:', CHANNELS.join(', '));
  console.log('[poster] Rotation size:', ROTATION.length);

  // Wait one full interval before the first post to avoid duplicate posts on deploys
  setTimeout(function tick() {
    postOnce().finally(() => setTimeout(tick, ms));
  }, ms);
}

startScheduler();

console.log('Bot is running…');
