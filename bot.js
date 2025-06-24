// ─────────────────────────────────────────────────────────
// 🎉 Telegram Referral Bot v4 with Support & User Info 🎉
// ─────────────────────────────────────────────────────────

const fs         = require('fs');
const path       = require('path');
const TelegramBot = require('node-telegram-bot-api');

// ===== Helper =====
const delay = ms => new Promise(res => setTimeout(res, ms));

// ===== Data Persistence =====
class DataHandler {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.files = [
      'users.json', 'referrals.json', 'points.json', 'orders.json',
      'settings.json', 'blocked.json', 'temp.json', 'contacts.json',
      'support.json', 'stats.json'
    ];
    this._ensureFiles();
    this.cache = {};
    this._loadAll();
  }

  _ensureFiles() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir);
    this.files.forEach(f => {
      const fp = path.join(this.dataDir, f);
      if (!fs.existsSync(fp)) {
        let init = {};
        if (f === 'settings.json') init = {
          referralRate: 1,
          welcomeGift: 1,
          referralText: 'برای دعوت دوستان خود از این لینک استفاده کنید: LINK'
        };
        fs.writeFileSync(fp, JSON.stringify(init, null, 2));
      }
    });
  }

  _loadAll() {
    this.files.forEach(f => {
      this.cache[f] = JSON.parse(
        fs.readFileSync(path.join(this.dataDir, f), 'utf8')
      );
    });
  }

  get(name) { return this.cache[name] || {}; }
  set(name, data) {
    this.cache[name] = data;
    fs.writeFileSync(
      path.join(this.dataDir, name),
      JSON.stringify(data, null, 2)
    );
  }
}

const data = new DataHandler();

// Read bot token & admin ID (line1: TOKEN, line2: ADMIN_ID)
const [TOKEN, ADMIN_ID] = fs
  .readFileSync(path.join(__dirname, 'tg.txt'), 'utf8')
  .trim()
  .split(/\r?\n/);

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== Rate-Limit & Spam Delay =====
const userSpam     = new Map();
const SPAM_WINDOW  = 1000;
const SPAM_LIMIT   = 3;
const SPAM_PENALTY = 3000;
async function checkSpam(uid) {
  const now = Date.now();
  let { count = 0, last = 0 } = userSpam.get(uid) || {};
  if (now - last < SPAM_WINDOW) count++;
  else count = 1;
  userSpam.set(uid, { count, last: now });
  if (count > SPAM_LIMIT) {
    await bot.sendMessage(uid, '🕯 کمی آرام تر با ربات کار کنید. 🌟');
    await delay(SPAM_PENALTY);
    return bot.sendMessage(uid, '🏠', mainMenu);
  }
  return false;
}

// ===== Keyboards =====
const mainMenu = {
  reply_markup: {
    keyboard: [
      ['زیرمجموعه‌گیری 🤝', 'امتیازات 📊', 'تبدیل امتیاز به رفرال 🎁'],
      ['🏪 پشتیبانی 🏪', '🆔️ اطلاعات من 🆔️'],
      ['راهنما 📖', 'بازگشت 🔙']
    ],
    resize_keyboard: true
  }
};

const adminMenu = {
  reply_markup: {
    keyboard: [
      ['📢 ارسال همگانی', '📁 دریافت فایل‌ها'],
      ['📊 آمار', '🚫 مسدود کردن', '✅ رفع مسدودی'],
      ['✏️ ویرایش متن دعوت'],
      ['⚙️ تنظیم ارجاع', '⚙️ تنظیم خوش‌آمدگویی'],
      ['➕ افزودن امتیاز', '➖ کسر امتیاز', '🎁 هدیه امتیاز به همه'],
      ['راهنما 📖', 'بازگشت 🔙']
    ],
    resize_keyboard: true
  }
};

// ===== /start Handler =====
bot.onText(/\/start(?:\s+(\d+))?/, async (msg, m) => {
  const uid = String(msg.chat.id);
  if (await checkSpam(uid)) return;

  const users  = data.get('users.json');
  const pts    = data.get('points.json');
  const setts  = data.get('settings.json');
  const contacts = data.get('contacts.json');
  const isNew  = !users[uid];

  // Register & gift
  if (isNew) {
    users[uid] = {
      joined: new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Kabul' })
    };
    data.set('users.json', users);
    pts[uid] = (pts[uid] || 0) + setts.welcomeGift;
    data.set('points.json', pts);
    await bot.sendMessage(uid, `🎁 خوش‌آمدید! ${setts.welcomeGift} امتیاز هدیه گرفتید.`);
  }

  // Referral
  const refId = m[1];
  if (refId && refId !== uid) {
    const key = `${refId}_${uid}`;
    const refs = data.get('referrals.json');
    if (!refs[key] && !data.get('blocked.json')[uid]) {
      refs[key] = true;
      data.set('referrals.json', refs);
      pts[refId] = (pts[refId] || 0) + setts.referralRate;
      data.set('points.json', pts);
      bot.sendMessage(refId, `✨ یک ارجاع جدید! شما ${setts.referralRate} امتیاز گرفتید.`);
    }
  }

  // Mandatory auth if no contact
  if (!contacts[uid]) {
    return bot.sendMessage(uid, '📞 لطفاً ابتدا با فشردن دکمه احراز هویت تایید کنید که انسان هستید 🙏', {
      reply_markup: {
        keyboard: [[{ text: '🔑 احراز هویت 🔑', request_contact: true }]],
        resize_keyboard: true
      }
    });
  }

  // Show appropriate menu
  const isAdmin = uid === ADMIN_ID;
  bot.sendMessage(uid,
    isAdmin ? '🌸' : '🤖',
    isAdmin ? adminMenu : mainMenu
  );
});

// ===== Contact Handler =====
bot.on('contact', async msg => {
  const uid = String(msg.from.id);
  const cts = data.get('contacts.json');
  const pts = data.get('points.json')[uid] || 0;
  const refsCount = Object.keys(data.get('referrals.json'))
                       .filter(k => k.startsWith(uid + '_')).length;
  const joined = data.get('users.json')[uid]?.joined || '';
  cts[uid] = {
    number: msg.contact.phone_number,
    name: msg.contact.first_name,
    username: msg.contact.username || null,
    userId: uid,
    points: pts,
    referrals: refsCount,
    joinedDate: joined
  };
  data.set('contacts.json', cts);
  return bot.sendMessage(uid, '✅ احراز هویت با موفقیت انجام شد. با خیال راحت از ربات استفاده کنید 💖', mainMenu);
});

// ===== /help Handler =====
bot.on('message', async msg => {
  const uid = String(msg.chat.id), txt = msg.text || '';
  if (txt === 'راهنما 📖' || txt === '/help') {
    if (uid === ADMIN_ID) {
      // Admin help
      const helpText =
`🛠️ *دستورات ادمین*  
⚙️ تنظیم ارجاع/خوش‌آمدگویی  
➕ افزودن امتیاز  
➖ کسر امتیاز  
🎁 هدیه امتیاز به همه  
📢 ارسال همگانی  
🚫 مسدود/✅ رفع مسدودی  
✏️ ویرایش متن دعوت`;
      return bot.sendMessage(uid, helpText, { parse_mode: 'Markdown', reply_markup: adminMenu });
    } else {
      // User help
      const helpText =
`📚 *راهنمای ربات*  
👥 زیرمجموعه‌گیری: دریافت لینک دعوت 🎁  
⭐ امتیازات: نمایش امتیاز و تعداد زیرمجموعه  🔋  
🏪 پشتیبانی: ارسال پیام به ادمین 🎥📷📄  
🆔️ اطلاعات من: نمایش جزئیات حساب شما  
📞 احراز هویت: تایید شماره تلفن 🔑`;
      return bot.sendMessage(uid, helpText, { parse_mode: 'Markdown', reply_markup: mainMenu });
    }
  }
});

// ===== Main Message Handler =====
bot.on('message', async msg => {
  const uid = String(msg.chat.id), txt = msg.text || '';
  if (await checkSpam(uid)) return;

  // Back button
  if (txt === 'بازگشت 🔙') {
    const isAdmin = uid === ADMIN_ID;
    return bot.sendMessage(uid,
      isAdmin ? '🏠' : '🛍',
      isAdmin ? adminMenu : mainMenu
    );
  }

  // Blocked
  if (data.get('blocked.json')[uid] && txt !== '✅ رفع مسدودی') {
    return bot.sendMessage(uid, '🚫 شما مسدود هستید.');
  }

  // Admin flows
  if (uid === ADMIN_ID) {
    const temp = data.get('temp.json');
    switch (txt) {
      case '📢 ارسال همگانی':
        data.set('temp.json', { action: 'broadcast' });
        return bot.sendMessage(uid, '📢 پیام همگانی را ارسال کنید:');
      case '📁 دریافت فایل‌ها':
        data.files.forEach(async f => {
          if (f.endsWith('.json')) await bot.sendDocument(uid, path.join(data.dataDir, f));
        });
        return;
      case '📊 آمار': {
        const uCount = Object.keys(data.get('users.json')).length;
        const rCount = Object.keys(data.get('referrals.json')).length;
        const pCount = Object.values(data.get('points.json')).reduce((a, b) => a + b, 0);
        return bot.sendMessage(uid, `📈 کاربران: ${uCount}\n🤝 ارجاعات: ${rCount}\n⭐ امتیازات: ${pCount}`);
      }
      case '🚫 مسدود کردن':
        data.set('temp.json', { action: 'block' });
        return bot.sendMessage(uid, '🚫 آیدی کاربر برای مسدودی را وارد کنید:');
      case '✅ رفع مسدودی':
        data.set('temp.json', { action: 'unblock' });
        return bot.sendMessage(uid, '✅ آیدی کاربر برای رفع مسدودی را وارد کنید:');
      case '✏️ ویرایش متن دعوت':
        data.set('temp.json', { action: 'editRefText' });
        return bot.sendMessage(uid, '✏️ متن جدید دعوت (از LINK برای جای‌گذاری لینک استفاده کنید):');
      case '⚙️ تنظیم ارجاع':
        data.set('temp.json', { action: 'setRef' });
        return bot.sendMessage(uid, '⚙️ مقدار امتیاز هر ارجاع را وارد کنید:');
      case '⚙️ تنظیم خوش‌آمدگویی':
        data.set('temp.json', { action: 'setWelcome' });
        return bot.sendMessage(uid, '⚙️ مقدار امتیاز خوش‌آمدگویی را وارد کنید:');
      case '➕ افزودن امتیاز':
        data.set('temp.json', { action: 'add' });
        return bot.sendMessage(uid, '➕ فرمت: userId مقدار\nمثال: 123456 5');
      case '➖ کسر امتیاز':
        data.set('temp.json', { action: 'remove' });
        return bot.sendMessage(uid, '➖ فرمت: userId مقدار\nمثال: 123456 2');
      case '🎁 هدیه امتیاز به همه':
        data.set('temp.json', { action: 'giftAll' });
        return bot.sendMessage(uid, '🎁 مقدار امتیاز هدیه به همه را وارد کنید:');
    }
    // Handle support reply initiation
    if (temp.action === 'await_support_response') {
      const targetId = temp.targetUser;
      await bot.sendMessage(targetId, txt);
      data.set('temp.json', {});
      return bot.sendMessage(uid, '✅ پیام به کاربر ارسال شد.', adminMenu);
    }

    // Handle admin temp actions...
    if (temp.action === 'broadcast') {
      Object.keys(data.get('users.json')).forEach(async id => {
        await bot.sendMessage(id, txt);
        await delay(50);
      });
      data.set('temp.json', {});
      return bot.sendMessage(uid, '✅ پیام همگانی ارسال شد.', adminMenu);
    }
    if (temp.action === 'block') {
      const bm = data.get('blocked.json'); bm[txt] = true; data.set('blocked.json', bm);
      data.set('temp.json', {});
      return bot.sendMessage(uid, `🚫 کاربر ${txt} مسدود شد.`, adminMenu);
    }
    if (temp.action === 'unblock') {
      const bm = data.get('blocked.json'); delete bm[txt]; data.set('blocked.json', bm);
      data.set('temp.json', {});
      return bot.sendMessage(uid, `✅ کاربر ${txt} رفع مسدودی شد.`, adminMenu);
    }
    if (temp.action === 'editRefText') {
      const s = data.get('settings.json'); s.referralText = txt; data.set('settings.json', s);
      data.set('temp.json', {});
      return bot.sendMessage(uid, '✏️ متن دعوت‌نامه به‌روز شد.', adminMenu);
    }
    if (temp.action === 'setRef') {
      const v = parseInt(txt, 10) || 1;
      const s = data.get('settings.json'); s.referralRate = v; data.set('settings.json', s);
      data.set('temp.json', {});
      return bot.sendMessage(uid, `✅ امتیاز ارجاع روی ${v} تنظیم شد.`, adminMenu);
    }
    if (temp.action === 'setWelcome') {
      const v = parseInt(txt, 10) || 1;
      const s = data.get('settings.json'); s.welcomeGift = v; data.set('settings.json', s);
      data.set('temp.json', {});
      return bot.sendMessage(uid, `✅ امتیاز خوش‌آمدگویی روی ${v} تنظیم شد.`, adminMenu);
    }
    if (temp.action === 'add' || temp.action === 'remove') {
      const [id, amt] = txt.split(/\s+/);
      const amount    = parseInt(amt, 10) || 0;
      const pts       = data.get('points.json');
      if (!pts[id]) pts[id] = 0;
      if (temp.action === 'add') pts[id] += amount;
      else pts[id] = Math.max(0, pts[id] - amount);
      data.set('points.json', pts);
      data.set('temp.json', {});
      return bot.sendMessage(uid, `✅ امتیاز ${temp.action === 'add' ? 'افزوده' : 'کسر'} شد.`, adminMenu);
    }
    if (temp.action === 'giftAll') {
      const amount = parseInt(txt, 10) || 0;
      const pts    = data.get('points.json');
      Object.keys(data.get('users.json')).forEach(id => {
        pts[id] = (pts[id] || 0) + amount;
      });
      data.set('points.json', pts);
      data.set('temp.json', {});
      return bot.sendMessage(uid, `🎁 به همه کاربران ${amount} امتیاز هدیه شد!`, adminMenu);
    }
  }

  // --- User flows ---
  const pts    = data.get('points.json');
  const orders = data.get('orders.json');

  // زیرمجموعه‌گیری 🤝
  if (txt === 'زیرمجموعه‌گیری 🤝') {
    const s  = data.get('settings.json');
    const me = await bot.getMe();
    const link = `https://t.me/${me.username}?start=${uid}`;
    return bot.sendMessage(uid,
      `───────────────\n${s.referralText.replace('LINK', link)}\n───────────────`,
      mainMenu
    );
  }

  // امتیازات 📊
  if (txt === 'امتیازات 📊') {
    const myPts  = pts[uid] || 0;
    const myRefs = Object.keys(data.get('referrals.json'))
                   .filter(k => k.startsWith(`${uid}_`)).length;
    return bot.sendMessage(uid,
      `───────────────\nامتیازات: ${myPts}\nزیرمجموعه: ${myRefs}\n───────────────`,
      mainMenu
    );
  }

  // تبدیل امتیاز به رفرال 🎁
  if (txt === 'تبدیل امتیاز به رفرال 🎁') {
    if (orders[uid]) {
      return bot.sendMessage(uid, '❗️ شما یک سفارش فعال دارید الی تکمیل سفارش اولی صبر کنید 🙏.', mainMenu);
    }
    const userPts = pts[uid] || 0;
    if (userPts < 3) {
      return bot.sendMessage(uid, 'شما امتیاز کافی برای تبدیل به رفرال ندارید لطفا ابتدا زیرمجموعه‌گیری کنید و یا امتیاز از ادمین با این آیدی @Bitcoin_Globals خریداری 🛍 کنید. حداقل امتیاز برای خرید یا تبدیل به رفرال 3 امتیاز است.🛍🔑🔋🏦', mainMenu);
    }
    data.set('temp.json', { action: 'convert', step: 1, max: userPts });
    return bot.sendMessage(uid,
      `شما ${userPts} امتیاز دارید.\n1️⃣ تعداد (3️⃣ تا ${userPts}) را وارد کنید:`,
      { reply_markup: { keyboard: [['بازگشت 🔙']], resize_keyboard: true } }
    );
  }

  // پشتیبانی 🏪
  if (txt === '🏪 پشتیبانی 🏪') {
    const supportData = data.get('support.json');
    const lastTime = supportData[uid] || 0;
    const now = Date.now();
    if (now - lastTime < 20 * 60 * 1000) {
      const remaining = Math.ceil((20 * 60 * 1000 - (now - lastTime)) / 60000);
      return bot.sendMessage(uid, `⏳ لطفا پس از ${remaining} دقیقه دوباره تلاش کنید.`, mainMenu);
    }
    data.set('temp.json', { action: 'await_support', time: now });
    return bot.sendMessage(uid, '✉️ پیام خود (ویدیو، عکس، فایل یا متن) را ارسال کنید:', {
      reply_markup: { keyboard: [['بازگشت 🔙']], resize_keyboard: true }
    });
  }

  // اطلاعات من 🆔️
  if (txt === '🆔️ اطلاعات من 🆔️') {
    const stats = data.get('stats.json')[uid] || { spent: 0, purchases: 0 };
    const userContact = data.get('contacts.json')[uid] || {};
    const username = userContact.username ? '@' + userContact.username : '---';
    return bot.sendMessage(uid,
      `───────────────\nشناسه کاربری 🆔️: \`${uid}\`\nیوزرنیم: ${username}\nتعداد امتیاز خرج شده: ${stats.spent}\nتعداد خرید 🛍: ${stats.purchases}\n───────────────`,
      { parse_mode: 'Markdown', reply_markup: mainMenu }
    );
  }

  // Handle support message content (text, photo, video, document)
  const temp = data.get('temp.json');
  if (temp.action === 'await_support') {
    // Forward content to admin with reply button
    const supportData = data.get('support.json');
    supportData[uid] = Date.now();
    data.set('support.json', supportData);

    let forwardOpts = { caption: `👤 از کاربر: \`${uid}\``, parse_mode: 'Markdown' };
    let sendMethod;
    if (msg.photo) sendMethod = bot.sendPhoto;
    else if (msg.video) sendMethod = bot.sendVideo;
    else if (msg.document) sendMethod = bot.sendDocument;
    else { sendMethod = bot.sendMessage; forwardOpts = { parse_mode: 'Markdown' }; }

    const replyMarkup = {
      reply_markup: {
        inline_keyboard: [[{ text: 'پاسخ 📨', callback_data: `support_reply_${uid}` }]]
      }
    };

    // Forward based on type
    if (sendMethod === bot.sendMessage) {
      await sendMethod(ADMIN_ID, `✉️ پیام پشتیبانی از کاربر ${uid}:\n${txt}`, replyMarkup);
    } else if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      await bot.sendPhoto(ADMIN_ID, fileId, { ...forwardOpts, ...replyMarkup });
    } else if (msg.video) {
      await bot.sendVideo(ADMIN_ID, msg.video.file_id, { ...forwardOpts, ...replyMarkup });
    } else if (msg.document) {
      await bot.sendDocument(ADMIN_ID, msg.document.file_id, { ...forwardOpts, ...replyMarkup });
    }

    data.set('temp.json', {});
    return bot.sendMessage(uid, '✅ پیام شما ارسال شد و ادمین به زودی پاسخ خواهد داد.', mainMenu);
  }

  // Conversion steps
  if (temp.action === 'convert') {
    if (temp.step === 1) {
      const amount = parseInt(txt, 10);
      if (!amount || amount < 3 || amount > temp.max) {
        return bot.sendMessage(uid, `⚠️ عددی بین 3️⃣ تا ${temp.max} وارد کنید.`, mainMenu);
      }
      temp.requestAmount = amount; temp.step = 2;
      data.set('temp.json', temp);
      return bot.sendMessage(uid, '2️⃣ اکنون کد دعوت و یا لینک دعوت را وارد کنید:', {
        reply_markup: { keyboard: [['بازگشت 🔙']], resize_keyboard: true }
      });
    }
    if (temp.step === 2) {
      temp.referralCode = txt; temp.step = 3;
      data.set('temp.json', temp);
      return bot.sendMessage(uid, '3️⃣ برای تایید روی دکمه کلیک کنید:', {
        reply_markup: {
          inline_keyboard: [[{ text: 'تایید و ارسال سفارش ✅', callback_data: 'user_confirm' }]]
        }
      });
    }
  }
});

// ===== Callback Queries =====
bot.on('callback_query', async cq => {
  const uid = String(cq.from.id);
  if (await checkSpam(uid)) return bot.answerCallbackQuery(cq.id);
  const temp = data.get('temp.json');

  // User confirms conversion
  if (cq.data === 'user_confirm' && temp.action === 'convert') {
    const pts    = data.get('points.json');
    const orders = data.get('orders.json');
    const stats  = data.get('stats.json');
    const oldPts = pts[uid] || 0;
    const req    = temp.requestAmount;
    pts[uid]     = oldPts - req;
    orders[uid]  = { old: oldPts, req, code: temp.referralCode };
    data.set('points.json', pts);
    data.set('orders.json', orders);

    // Update stats
    if (!stats[uid]) stats[uid] = { spent: 0, purchases: 0 };
    stats[uid].spent += req;
    stats[uid].purchases += 1;
    data.set('stats.json', stats);

    // Notify admin
    const refs = Object.keys(data.get('referrals.json'))
                   .filter(k => k.startsWith(`${uid}_`)).length;
    const msg =
      `🎁 سفارش جدید\n` +
      `👤 @${cq.from.username || '---'}\n` +
      `🆔 \`${uid}\`\n` +
      `⭐ قبل: ${oldPts}\n` +
      `🤝 زیرمجموعه‌ها: ${refs}\n` +
      `📥 درخواست: ${req}\n` +
      `🔑 کد یا لینک : ${temp.referralCode}`;
    await bot.sendMessage(ADMIN_ID, msg, {
      reply_markup: { inline_keyboard: [[{ text: '✅ تایید', callback_data: `admin_ok_${uid}` }]] }
    });

    data.set('temp.json', {});
    return bot.sendMessage(uid, '✨ سفارش شما ثبت شد! و در صف قرار گرفت 🛍', mainMenu);
  }

  // Admin confirms order
  if (cq.data.startsWith('admin_ok_') && uid === ADMIN_ID) {
    const userId = cq.data.split('_')[2];
    const orders = data.get('orders.json');
    delete orders[userId];
    data.set('orders.json', orders);

    await bot.sendMessage(userId, '🎉 سفارش شما تایید شد ✅ و تکمیل گردید 🌸');
    return bot.editMessageText(
      cq.message.text + '\n✅ تایید شد',
      { chat_id: ADMIN_ID, message_id: cq.message.message_id }
    );
  }

  // Admin initiates support reply
  if (cq.data.startsWith('support_reply_') && uid === ADMIN_ID) {
    const userId = cq.data.split('_')[2];
    data.set('temp.json', { action: 'await_support_response', targetUser: userId });
    await bot.answerCallbackQuery(cq.id, { text: 'لطفاً پیام خود را بنویسید.' });
    return;
  }
});

// ===== Error & Shutdown =====
bot.on('polling_error', console.error);
process.on('unhandledRejection', console.error);
['SIGINT', 'SIGTERM'].forEach(sig =>
  process.on(sig, () => {
    data.files.forEach(f => data.set(f, data.get(f)));
    process.exit();
  })
);

console.log('🤖 Bot v4 is running! 🚀');