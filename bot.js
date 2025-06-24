// ────────────────────────────────────────────────────────────
// 🎉 Telegram Referral & Force-Join Bot v5 🎉
// ────────────────────────────────────────────────────────────

const fs           = require('fs');
const path         = require('path');
const TelegramBot  = require('node-telegram-bot-api');
const readlineSync = require('readline-sync');

// ✨✨✨ Prompt for Bot Token & Admin ID ✨✨✨
const TOKEN    = readlineSync.question('🔑 لطفاً Bot Token را وارد کنید: ');
const ADMIN_ID = readlineSync.question('🆔 لطفاً Admin ID را وارد کنید: ');

// ===== Helper =====
const delay = ms => new Promise(res => setTimeout(res, ms));

// ===== Data Persistence =====
class DataHandler {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.files = [
      'users.json','referrals.json','points.json','orders.json',
      'settings.json','blocked.json','temp.json','contacts.json',
      'support.json','stats.json','locks.json'
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
        if (f === 'locks.json') init = { channels: [] };
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
const bot  = new TelegramBot(TOKEN, { polling: true });

// ===== Rate-Limit & Spam Delay =====
const userSpam     = new Map();
const SPAM_WINDOW  = 1000;
const SPAM_LIMIT   = 3;
const SPAM_PENALTY = 3000;
async function checkSpam(uid) {
  const now = Date.now();
  let { count=0, last=0 } = userSpam.get(uid) || {};
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
const mainMenu = { reply_markup:{ resize_keyboard:true, keyboard:[
  ['زیرمجموعه‌گیری 🤝','امتیازات 📊'],
  ['تبدیل امتیاز به رفرال 🎁','🏪 پشتیبانی 🏪'],
  ['🆔 اطلاعات من','راهنما 📖']
]} };

const adminMenu = { reply_markup:{ resize_keyboard:true, keyboard:[
  ['📢 ارسال همگانی','📁 دریافت فایل‌ها'],
  ['📊 آمار','🚫 مسدود کردن'],
  ['✅ رفع مسدودی','✏️ ویرایش متن دعوت'],
  ['⚙️ تنظیم ارجاع','⚙️ تنظیم خوش‌آمدگویی'],
  ['➕ افزودن امتیاز','➖ کسر امتیاز'],
  ['🎁 هدیه امتیاز به همه','🔒 افزودن قفل'],
  ['🔓 حذف قفل','بازگشت 🔙']
]} };

// ===== Force-Join Middleware =====
bot.on('message', async msg => {
  const uid = msg.from.id;
  if (String(uid) === ADMIN_ID) return;
  const { channels } = data.get('locks.json');
  if (channels.length) {
    for (let ch of channels) {
      try {
        const mem = await bot.getChatMember(ch, uid);
        if (['left','kicked'].includes(mem.status)) {
          return bot.sendMessage(msg.chat.id,
            '❗️ برای استفاده از ربات باید در کانال عضو شوید.',
            { reply_markup:{ inline_keyboard:[[{ text:'➡️ عضویت', url:`https://t.me/${ch.replace(/^@/,'')}` }]] }}
          );
        }
      } catch(e){}
    }
  }
});

// ===== Core Handlers =====
// /start + referral
bot.onText(/\/start(?:\s+(\d+))?/, async (msg, match) => {
  const uid = String(msg.chat.id);
  if (await checkSpam(uid)) return;
  const users = data.get('users.json');
  const points = data.get('points.json');
  const referrals = data.get('referrals.json');

  // register user
  if (!users[uid]) users[uid]={id:uid};
  data.set('users.json', users);

  // handle referral
  const refId = match[1];
  if (refId && refId !== uid) {
    referrals[refId] = (referrals[refId]||0)+1;
    points[refId] = (points[refId]||0) + data.get('settings.json').referralRate;
    data.set('referrals.json', referrals);
    data.set('points.json', points);
  }

  // welcome
  const text = data.get('settings.json').welcomeGift
    ? `🎁 شما ${data.get('settings.json').welcomeGift} امتیاز هدیه گرفتید!`
    : '';

  bot.sendMessage(uid,
    `👋 خوش آمدید!
${text}

برای دعوت دوستان خود از این لینک استفاده کنید:
https://t.me/${bot.username}?start=${uid}`,
    mainMenu
  );
});

// Menu actions
bot.on('message', async msg => {
  const uid = String(msg.chat.id);
  if (await checkSpam(uid)) return;
  const text = msg.text;

  // Blocked?
  const blocked = data.get('blocked.json');
  if (blocked[uid]) return;

  // Go back
  if (uid===ADMIN_ID && text==='بازگشت 🔙') return bot.sendMessage(uid,'🏠', adminMenu);
  if (uid!==ADMIN_ID && text==='بازگشت 🔙') return bot.sendMessage(uid,'🏠', mainMenu);

  // User commands
  if (text==='زیرمجموعه‌گیری 🤝') {
    const count = data.get('referrals.json')[uid]||0;
    bot.sendMessage(uid, `📨 زیرمجموعه‌های شما: ${count}`, mainMenu);
  } else if (text==='امتیازات 📊') {
    const pts = data.get('points.json')[uid]||0;
    bot.sendMessage(uid, `💰 امتیازات شما: ${pts}`, mainMenu);
  } else if (text==='تبدیل امتیاز به رفرال 🎁') {
    const pts = data.get('points.json')[uid]||0;
    if (pts >= data.get('settings.json').referralRate) {
      data.get('points.json')[uid] = pts - data.get('settings.json').referralRate;
      data.get('referrals.json')[uid] = (data.get('referrals.json')[uid]||0) + 1;
      data.set('points.json', data.get('points.json'));
      data.set('referrals.json', data.get('referrals.json'));
      bot.sendMessage(uid,'✅ تبدیل با موفقیت انجام شد', mainMenu);
    } else {
      bot.sendMessage(uid,'❌ امتیاز کافی ندارید', mainMenu);
    }
  } else if (text==='🏪 پشتیبانی 🏪') {
    bot.sendMessage(uid,'📝 پیام خود را ارسال کنید:');
    data.cache.waiting='support';
  } else if (data.cache.waiting==='support') {
    const sup = data.get('support.json');
    sup[Date.now()] = { user: uid, text };
    data.set('support.json', sup);
    delete data.cache.waiting;
    bot.sendMessage(uid,'📤 درخواست شما ثبت شد', mainMenu);
  } else if (text==='🆔 اطلاعات من') {
    const refs = data.get('referrals.json')[uid]||0;
    const pts  = data.get('points.json')[uid]||0;
    bot.sendMessage(uid,
      `🆔 شناسه شما: ${uid}
📨 زیرمجموعه‌ها: ${refs}
💰 امتیازات: ${pts}`, mainMenu);
  } else if (text==='راهنما 📖') {
    bot.sendMessage(uid,'📚 برای استفاده: از دکمه‌های منو انتخاب کنید.', mainMenu);
  }

  // Admin commands
  if (uid===ADMIN_ID) {
    if (text==='📢 ارسال همگانی') {
      bot.sendMessage(uid,'✉️ متن را ارسال کنید:'); data.cache.waiting='broadcast';
    } else if (data.cache.waiting==='broadcast') {
      Object.keys(data.get('users.json')).forEach(id => bot.sendMessage(id, text));
      delete data.cache.waiting;
      bot.sendMessage(uid,'✅ پیام ارسال شد', adminMenu);
    } else if (text==='📁 دریافت فایل‌ها') {
      data.files.forEach(f => bot.sendDocument(uid, { source: path.join(__dirname,'data',f) }));
    } else if (text==='📊 آمار') {
      const count = Object.keys(data.get('users.json')).length;
      bot.sendMessage(uid, `👥 کاربران: ${count}`, adminMenu);
    } else if (text==='🚫 مسدود کردن') {
      bot.sendMessage(uid,'🆔 کاربر را ارسال کنید:'); data.cache.waiting='block';
    } else if (data.cache.waiting==='block') {
      data.get('blocked.json')[text] = true;
      data.set('blocked.json', data.get('blocked.json'));
      delete data.cache.waiting;
      bot.sendMessage(uid,'✅ مسدود شد', adminMenu);
    } else if (text==='✅ رفع مسدودی') {
      bot.sendMessage(uid,'🆔 کاربر را ارسال کنید:'); data.cache.waiting='unblock';
    } else if (data.cache.waiting==='unblock') {
      delete data.get('blocked.json')[text];
      data.set('blocked.json', data.get('blocked.json'));
      delete data.cache.waiting;
      bot.sendMessage(uid,'✅ رفع مسدودی شد', adminMenu);
    } else if (text==='✏️ ویرایش متن دعوت') {
      bot.sendMessage(uid,'📝 متن جدید را ارسال کنید:'); data.cache.waiting='editText';
    } else if (data.cache.waiting==='editText') {
      const s = data.get('settings.json');
      s.referralText = text;
      data.set('settings.json', s);
      delete data.cache.waiting;
      bot.sendMessage(uid,'✅ ویرایش شد', adminMenu);
    } else if (text==='⚙️ تنظیم ارجاع') {
      bot.sendMessage(uid,'🔢 مقدار امتیاز هر رفرال:'); data.cache.waiting='setRate';
    } else if (data.cache.waiting==='setRate') {
      const s = data.get('settings.json');
      s.referralRate = Number(text);
      data.set('settings.json', s);
      delete data.cache.waiting;
      bot.sendMessage(uid,'✅ انجام شد', adminMenu);
    } else if (text==='⚙️ تنظیم خوش‌آمدگویی') {
      bot.sendMessage(uid,'🔢 امتیاز خوش‌آمدگویی:'); data.cache.waiting='setGift';
    } else if (data.cache.waiting==='setGift') {
      const s = data.get('settings.json');
      s.welcomeGift = Number(text);
      data.set('settings.json', s);
      delete data.cache.waiting;
      bot.sendMessage(uid,'✅ انجام شد', adminMenu);
    } else if (text==='➕ افزودن امتیاز') {
      bot.sendMessage(uid,'🆔 و امتیاز را با فاصله بنویسید:'); data.cache.waiting='addPts';
    } else if (data.cache.waiting==='addPts') {
      const [id, amt] = text.split(' ');
      const pts = data.get('points.json');
      pts[id] = (pts[id]||0) + Number(amt);
      data.set('points.json', pts);
      delete data.cache.waiting;
      bot.sendMessage(uid,'✅ انجام شد', adminMenu);
    } else if (text==='➖ کسر امتیاز') {
      bot.sendMessage(uid,'🆔 و امتیاز را بنویسید:'); data.cache.waiting='rmPts';
    } else if (data.cache.waiting==='rmPts') {
      const [id, amt] = text.split(' ');
      const pts = data.get('points.json');
      pts[id] = (pts[id]||0) - Number(amt);
      data.set('points.json', pts);
      delete data.cache.waiting;
      bot.sendMessage(uid,'✅ انجام شد', adminMenu);
    } else if (text==='🎁 هدیه امتیاز به همه') {
      bot.sendMessage(uid,'🎁 مقدار را بنویسید:'); data.cache.waiting='giftAll';
    } else if (data.cache.waiting==='giftAll') {
      const amt = Number(text);
      const pts = data.get('points.json');
      Object.keys(data.get('users.json')).forEach(id => {
        pts[id] = (pts[id]||0) + amt;
      });
      data.set('points.json', pts);
      delete data.cache.waiting;
      bot.sendMessage(uid,'✅ انجام شد', adminMenu);
    }
  }
});

// ===== Shutdown =====
bot.on('polling_error', console.error);
process.on('unhandledRejection', console.error);
['SIGINT','SIGTERM'].forEach(sig => process.on(sig, () => {
  data.files.forEach(f => data.set(f, data.get(f)));
  process.exit();
}));

console.log('🤖 Bot v5 with Full Handlers is running! 🚀');