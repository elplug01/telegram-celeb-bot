// index.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CHANNEL = process.env.CHANNEL || '@Botacatest';

// post interval in minutes
const POST_EVERY_MINUTES = parseInt(process.env.POST_MINUTES || '5', 10);

// === VIDEO ROTATION ===
const VIDEOS = [
  "BAACAgEAAxkBAAID7Wii7DuLDfdcDFg4Noc1RPn3wp9NAAIgBQACPHwZRTwj5utrtNBfNgQ", // Video 1
  "BAACAgEAAxkBAAID-2ijA_vIzqGDcWMuzpnU6c3KvfF1AAIkBQACPHwZRY9A7UCE5qikNgQ", // Video 2
  "BAACAgEAAxkBAAID_WijBBemq9RHGdhAnedzYoeBkJLgAAIlBQACPHwZRf2StGh_jSKhNgQ", // Video 3
  "BAACAgEAAxkBAAID_2ijBDC9Kfy36JNcI0_rfF7HSMAiAAImBQACPHwZRUXG3ilAkzO_NgQ", // Video 4
  "BAACAgEAAxkBAAID0WiieDS5loQVTRlJv4YldD5W1vkfAALjBQACPHwRRTzftenee1R1NgQ"  // Original Video
];

let currentIndex = 0; // rotate sequentially

// ===== Bot setup =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

let lastPostedMessageId = null;
let postInFlight = false;

async function postOnce() {
  if (postInFlight) return;
  postInFlight = true;

  try {
    // delete last post if it exists
    if (lastPostedMessageId) {
      try {
        await bot.deleteMessage(CHANNEL, lastPostedMessageId);
        console.log("Deleted previous message:", lastPostedMessageId);
      } catch (e) {
        console.warn("Could not delete previous:", e.message);
      }
    }

    // pick current video
    const fileId = VIDEOS[currentIndex];
    currentIndex = (currentIndex + 1) % VIDEOS.length; // rotate

    const sent = await bot.sendVideo(CHANNEL, fileId, {
      caption: "🔥 Check out our bot here: https://t.me/Freakysl_bot",
      supports_streaming: true
    });

    lastPostedMessageId = sent.message_id;
    console.log("Posted message:", lastPostedMessageId);

  } catch (e) {
    console.error("Post failed:", e.message);
  } finally {
    postInFlight = false;
  }
}

function startScheduler() {
  const minutes = POST_EVERY_MINUTES;
  const ms = minutes * 60 * 1000;

  console.log(`[poster] Scheduler running every ${minutes} minutes`);

  // wait one full interval on boot
  setTimeout(function tick() {
    postOnce().finally(() => setTimeout(tick, ms));
  }, ms);
}

startScheduler();
console.log("Bot is running…");
