// index.js
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

// ===== Config =====
const token = process.env.BOT_TOKEN || '7623685237:AAFlNTEvtgQWDOoosNX5gBM9hZnEs_GfOO4';
const bot = new TelegramBot(token, { polling: true });
const ITEMS_PER_PAGE = 7;
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// ===== Data =====
const celebsFile = path.join(__dirname, 'celebs.json');
let celebs = [];
try {
  celebs = JSON.parse(fs.readFileSync(celebsFile, 'utf8'));
} catch (e) {
  console.error('Failed to load celebs.json:', e.message);
  celebs = [];
}

// ===== Utils =====
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function safeName(str) {
  return String(str || 'file').replace(/[^a-z0-9_\-\.]+/gi, '_').slice(0, 60);
}
function extFromUrl(u, fallback = '.jpg') {
  try {
    const parsed = url.parse(u);
    const ext = path.extname(parsed.pathname || '');
    return ext || fallback;
  } catch {
    return fallback;
  }
}
function downloadToFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(fileUrl, (res) => {
        if (res.statusCode !== 200) {
          file.close(); fs.unlink(destPath, () => {});
          return reject(new Error(`HTTP ${res.statusCode} for ${fileUrl}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(destPath)));
      })
      .on('error', (err) => {
        file.close(); fs.unlink(destPath, () => {});
        reject(err);
      });
  });
}
async function downloadByFileId(file_id, baseName = 'photo') {
  try {
    const file = await bot.getFile(file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const ext = path.extname(file.file_path) || '.jpg';
    ensureDir(DOWNLOAD_DIR);
    const dest = path.join(DOWNLOAD_DIR, `${safeName(baseName)}_${Date.now()}${ext}`);
    await downloadToFile(fileUrl, dest);
    console.log('Saved:', dest);
    return dest;
  } catch (e) {
    console.error('downloadByFileId error:', e.message);
    return null;
  }
}
async function downloadByUrl(photoUrl, baseName = 'photo') {
  try {
    ensureDir(DOWNLOAD_DIR);
    const dest = path.join(DOWNLOAD_DIR, `${safeName(baseName)}_${Date.now()}${extFromUrl(photoUrl)}`);
    await downloadToFile(photoUrl, dest);
    console.log('Saved:', dest);
    return dest;
  } catch (e) {
    console.error('downloadByUrl error:', e.message);
    return null;
  }
}

// Track page per chat
const currentPage = {};

// ===== Handlers =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  currentPage[chatId] = 0;
  sendCelebList(chatId, 0);
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data || '';
  try {
    if (data.startsWith('page_')) {
      const page = Math.max(0, parseInt(data.split('_')[1], 10) || 0);
      currentPage[chatId] = page;
      sendCelebList(chatId, page);
    } else if (data.startsWith('celeb_')) {
      const index = Math.max(0, parseInt(data.split('_')[1], 10) || 0);
      sendCelebPhoto(chatId, index);
    }
  } catch (e) {
    console.error('callback error:', e.message);
  } finally {
    bot.answerCallbackQuery(query.id).catch(() => {});
  }
});

// When you SEND a photo to the bot, reply with its file_id (and download it)
bot.on('message', async (msg) => {
  if (!msg.photo) return;
  const chatId = msg.chat.id;
  const sizes = msg.photo;
  const largest = sizes[sizes.length - 1];
  const fileId = largest.file_id;

  try {
    await bot.sendMessage(chatId, `file_id:\n\`${fileId}\``, { parse_mode: 'Markdown' });
    await downloadByFileId(fileId, `from_user_${chatId}`);
  } catch (e) {
    console.error('photo handler error:', e.message);
    bot.sendMessage(chatId, 'Sorry, I could not read that photo.').catch(() => {});
  }
});

// ===== Features =====
function sendCelebList(chatId, page) {
  const totalPages = Math.max(1, Math.ceil(celebs.length / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * ITEMS_PER_PAGE;
  const pageCelebs = celebs.slice(start, start + ITEMS_PER_PAGE);

  const keyboard = pageCelebs.map((celeb, i) => ([
    { text: celeb.name, callback_data: `celeb_${start + i}` }
  ]));

  const nav = [];
  if (safePage > 0) nav.push({ text: '⬅ Prev', callback_data: `page_${safePage - 1}` });
  nav.push({ text: `Page ${safePage + 1}/${totalPages}`, callback_data: `page_${safePage}` });
  if (safePage < totalPages - 1) nav.push({ text: 'Next ➡', callback_data: `page_${safePage + 1}` });
  keyboard.push(nav);

  bot.sendMessage(chatId, 'Choose a creator:', {
    reply_markup: { inline_keyboard: keyboard }
  }).catch(err => console.error('sendCelebList error:', err.message));
}

async function sendCelebPhoto(chatId, index) {
  const celeb = celebs[index];
  if (!celeb) return bot.sendMessage(chatId, 'Not found.').catch(() => {});

  const originPage = Math.floor(index / ITEMS_PER_PAGE);
  const backBtn = [{ text: '⬅ Back', callback_data: `page_${originPage}` }];
  const actionRow = [];
  if (celeb.bio) actionRow.push({ text: '🔗 View Leaks', url: celeb.bio });
  actionRow.push(...backBtn);

  try {
    if (celeb.file_id) {
      await bot.sendPhoto(chatId, celeb.file_id, {
        caption: celeb.name,
        reply_markup: { inline_keyboard: [actionRow] }
      });
      // download from Telegram CDN
      await downloadByFileId(celeb.file_id, celeb.name);
    } else if (celeb.url) {
      await bot.sendPhoto(chatId, celeb.url, {
        caption: celeb.name,
        reply_markup: { inline_keyboard: [actionRow] }
      });
      // download from external URL
      await downloadByUrl(celeb.url, celeb.name);
    } else {
      await bot.sendMessage(chatId, 'No photo available for this celebrity.');
    }
  } catch (e) {
    console.error('sendCelebPhoto error:', e.message);
    bot.sendMessage(chatId, 'Failed to send that photo.').catch(() => {});
  }
}

// Log polling errors so deploy logs are clear
bot.on('polling_error', (err) => {
  console.error('polling_error:', err?.code || '', err?.response?.body || err.message);
});
