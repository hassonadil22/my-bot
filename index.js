const TelegramBot = require("node-telegram-bot-api");
const XLSX = require("xlsx");
const fs = require("fs");

const BOT_TOKEN = "7052208782:AAEafU1LWKMmPIO8aYKQ042cUyaZu4eYLhQ";
const CHANNEL_ID = "-1002691632218"; // معرف قناة الموظفين (وليس رابط الدعوة)
const ALERT_CHANNEL_ID = "-1002694863527"; // قناة الإدارة

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// قراءة ملف الموظفين
const workbook = XLSX.readFile("employees.xlsx");
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const employees = XLSX.utils.sheet_to_json(sheet);

// متابعة محاولات المستخدمين
let attempts = {}; // { userId: { allowed: true/false, done: true/false } }

// أمر /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "👋 أهلاً! أرسل اسمك والرقم الوظيفي بهذا الشكل:\n\nالاسم - الرقم");
});

// استلام كل الرسائل
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (text.startsWith("/start")) return;

  if (attempts[userId]?.done) {
    return bot.sendMessage(chatId, "🚫 لا يمكنك إعادة المحاولة. تم التحقق من بياناتك مسبقًا.");
  }

  const parts = text.split("-");
  if (parts.length !== 2) {
    return bot.sendMessage(chatId, "❌ الرجاء كتابة الاسم والرقم بهذا الشكل:\nالاسم - الرقم");
  }

  const name = parts[0].trim();
  const empNumber = parts[1].trim();

  const found = employees.find((e) => String(e["الرقم الوظيفي"]) === empNumber);

  if (found) {
    attempts[userId] = { done: true };

    try {
      const inviteLink = await bot.createChatInviteLink(CHANNEL_ID, {
        member_limit: 1, // يستخدمه موظف واحد فقط
        expire_date: Math.floor(Date.now() / 1000) + 600, // ينتهي بعد 10 دقائق (اختياري)
      });

      bot.sendMessage(chatId, `✅ تم التحقق من بياناتك بنجاح!\nرابط قناة الموظفين (صالح لمرة واحدة فقط ولمدة 10 دقائق):\n${inviteLink.invite_link}`);

      bot.sendMessage(ALERT_CHANNEL_ID, `📥 تم تسجيل موظف جديد:\nالاسم: ${name}\nالرقم: ${empNumber}\nالمعرف: ${userId}`);
    } catch (error) {
      console.error("❌ خطأ في إنشاء رابط الدعوة:", error);
      bot.sendMessage(chatId, "حدث خطأ أثناء إنشاء رابط القناة. يرجى المحاولة لاحقًا.");
      bot.sendMessage(ALERT_CHANNEL_ID, `⚠️ فشل في إنشاء رابط دعوة للموظف:\nالاسم: ${name}\nالرقم: ${empNumber}`);
    }
  } else {
    if (attempts[userId]?.done) {
      return bot.sendMessage(chatId, "🚫 لا يمكنك المحاولة مجددًا.");
    }

    attempts[userId] = { done: false };

    bot.sendMessage(chatId, "❌ الرقم الوظيفي غير صحيح، سيتم إشعار الإدارة لمراجعة الطلب.");

    bot.sendMessage(ALERT_CHANNEL_ID, `🚨 محاولة فاشلة:\nالاسم: ${name}\nالرقم: ${empNumber}\nمعرف المستخدم: ${userId}\n\nهل تريد السماح له بإعادة المحاولة؟`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ السماح بالمحاولة", callback_data: `allow_${userId}` }],
          [{ text: "❌ رفض", callback_data: `deny_${userId}` }],
        ],
      },
    });
  }
});

// الرد على أزرار الإدارة
bot.on("callback_query", (query) => {
  const data = query.data;
  const userId = data.split("_")[1];

  if (data.startsWith("allow_")) {
    if (attempts[userId]) {
      attempts[userId].done = false;
      bot.sendMessage(userId, "🔄 تم السماح لك بإعادة المحاولة من قبل الإدارة.");
      bot.sendMessage(ALERT_CHANNEL_ID, `✅ تم السماح للمستخدم ${userId} بإعادة المحاولة.`);
    }
  } else if (data.startsWith("deny_")) {
    attempts[userId] = { done: true };
    bot.sendMessage(userId, "🚫 تم رفض محاولتك من قبل الإدارة.");
    bot.sendMessage(ALERT_CHANNEL_ID, `❌ تم رفض المستخدم ${userId}.`);
  }

  bot.answerCallbackQuery(query.id);
});
