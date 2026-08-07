const SPREADSHEET_ID = '14u979d9GilWEBkWx8vik2nzGQiNedK5tALuZkkAyEOQ';
const UNIFIED_VIEW_SHEET = '統合ビュー';
const LOG_SHEET = '配信ログ';
const LOG_HEADERS = ['送信日時', '配信ID', '操作者', '買参番号', '店名', '宛先', '件名', '結果'];
const ORG_NAME = '大田市場花き事業協同組合';
const OFFICE_EMAIL = 'info@jigyokyo.com';
const OFFICE_TEL = '03-5492-4065';

const OTP_TTL_SEC = 600;
const OTP_RESEND_INTERVAL_SEC = 60;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_SEC = 6 * 60 * 60;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'request_otp') return jsonResponse(requestOtp_(data));
    if (action === 'verify_otp') return jsonResponse(verifyOtp_(data));

    const operatorEmail = resolveSession_(data.token);
    if (!operatorEmail) {
      return jsonResponse({ status: 'error', code: 'auth_error', message: 'セッションが切れました。再度ログインしてください' });
    }

    if (action === 'get_recipients') return jsonResponse(getRecipients_());
    if (action === 'send_test') return jsonResponse(sendTest_(data, operatorEmail));
    if (action === 'send_all') return jsonResponse(sendAll_(data, operatorEmail));
    if (action === 'get_history') return jsonResponse(getHistory_());
    return jsonResponse({ status: 'error', message: '不明なactionです' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

function doGet() {
  return jsonResponse({ status: 'ok', message: '組合員メール配信 管理API稼働中' });
}

/* ===== 認証（OTP / セッション） ===== */

function getAdminEmails_() {
  const raw = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '';
  return raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

function requestOtp_(data) {
  const email = String(data.email || '').trim().toLowerCase();
  const generic = { status: 'ok', message: '認証コードを送信しました（該当アドレスの場合）' };
  if (!email) return generic;
  if (getAdminEmails_().indexOf(email) === -1) return generic;

  const cache = CacheService.getScriptCache();
  const throttleKey = 'otp_throttle:' + email;
  if (cache.get(throttleKey)) return generic;

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('otp:' + email, JSON.stringify({ otp: otp, attempts: 0 }), OTP_TTL_SEC);
  cache.put(throttleKey, '1', OTP_RESEND_INTERVAL_SEC);

  try {
    MailApp.sendEmail({
      to: email,
      subject: '【組合員メール配信】ログイン認証コード',
      body: [
        '組合員メール配信 管理画面のログイン認証コードです。',
        '',
        '認証コード: ' + otp,
        '',
        '有効期限: 10分',
        '',
        'このコードに心当たりがない場合は、本メールを破棄してください。',
      ].join('\n'),
      name: ORG_NAME,
    });
  } catch (mailErr) {
    Logger.log('OTPメール送信失敗: ' + email + ' / ' + mailErr.message);
  }
  return generic;
}

function verifyOtp_(data) {
  const email = String(data.email || '').trim().toLowerCase();
  const otpInput = String(data.otp || '').trim();
  const cache = CacheService.getScriptCache();
  const key = 'otp:' + email;
  const raw = cache.get(key);
  if (!raw) return { status: 'error', message: '認証コードが無効です。再度送信してください' };

  const record = JSON.parse(raw);
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    cache.remove(key);
    return { status: 'error', message: '試行回数の上限を超えました。再度送信してください' };
  }
  if (record.otp !== otpInput) {
    record.attempts++;
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      cache.remove(key);
      return { status: 'error', message: '試行回数の上限を超えました。再度送信してください' };
    }
    cache.put(key, JSON.stringify(record), OTP_TTL_SEC);
    return { status: 'error', message: '認証コードが正しくありません' };
  }

  cache.remove(key);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('session:' + token, email, SESSION_TTL_SEC);
  return { status: 'ok', token: token, email: email };
}

function resolveSession_(token) {
  if (!token) return null;
  return CacheService.getScriptCache().get('session:' + String(token));
}

/* ===== 配信先 ===== */

function isValidEmail_(email) {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
}

// 統合ビュー A2:C を走査し、送信対象(valid)と除外対象(skipped: 形式不正/重複)に分ける
function buildRecipientPlan_() {
  const valid = [];
  const skipped = [];
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(UNIFIED_VIEW_SHEET);
  if (!sheet) return { valid: valid, skipped: skipped };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { valid: valid, skipped: skipped };

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const seen = {};
  values.forEach(function (row) {
    const baisan = String(row[0] || '').trim();
    const shopname = String(row[1] || '').trim();
    const email = String(row[2] || '').trim();
    if (!baisan && !shopname && !email) return;

    if (!email || !isValidEmail_(email)) {
      skipped.push({ baisan: baisan, shopname: shopname, email: email, reason: '形式不正' });
      return;
    }
    const key = email.toLowerCase();
    if (seen[key]) {
      skipped.push({ baisan: baisan, shopname: shopname, email: email, reason: '重複' });
      return;
    }
    seen[key] = true;
    valid.push({ baisan: baisan, shopname: shopname, email: email });
  });
  return { valid: valid, skipped: skipped };
}

function getRecipients_() {
  const plan = buildRecipientPlan_();
  return { status: 'ok', recipients: plan.valid, excluded: plan.skipped.length };
}

/* ===== 本文組み立て ===== */

function renderBody_(template, ctx) {
  const filled = String(template)
    .split('{{店名}}').join(ctx.shopname || '')
    .split('{{買参番号}}').join(ctx.baisan || '');
  const footer = [
    '',
    '─────────────────',
    ORG_NAME,
    'TEL: ' + OFFICE_TEL + ' / Mail: ' + OFFICE_EMAIL,
    '※本メールに関するお問い合わせは事務局までご連絡ください',
  ].join('\n');
  return filled + '\n' + footer;
}

/* ===== テスト送信 ===== */

function sendTest_(data, operatorEmail) {
  const subject = String(data.subject || '').trim();
  const body = String(data.body || '');
  if (!subject || !body) return { status: 'error', message: '件名と本文を入力してください' };

  const rendered = renderBody_(body, { shopname: 'サンプル花店', baisan: '9999' });
  try {
    MailApp.sendEmail({
      to: operatorEmail,
      subject: '【テスト】' + subject,
      body: rendered,
      name: ORG_NAME,
      replyTo: OFFICE_EMAIL,
    });
  } catch (err) {
    return { status: 'error', message: 'テスト送信に失敗しました: ' + err.message };
  }
  return { status: 'ok' };
}

/* ===== 一斉送信 ===== */

function ensureLogSheet_(ss) {
  let sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET);
    sheet.appendRow(LOG_HEADERS);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// 同一配信IDについて、既に成功送信済みのアドレス／既にログ済みのスキップ行を集計
function getLoggedKeysForDelivery_(logSheet, deliveryId) {
  const sentEmails = {};
  const loggedSkipKeys = {};
  const lastRow = logSheet.getLastRow();
  if (lastRow < 2) return { sentEmails: sentEmails, loggedSkipKeys: loggedSkipKeys };

  const values = logSheet.getRange(2, 1, lastRow - 1, LOG_HEADERS.length).getValues();
  values.forEach(function (row) {
    if (String(row[1]) !== deliveryId) return;
    const baisan = row[3], shopname = row[4], email = row[5];
    const outcome = String(row[7]);
    if (outcome.indexOf('成功') === 0) {
      sentEmails[String(email).toLowerCase()] = true;
    } else if (outcome.indexOf('スキップ') === 0) {
      loggedSkipKeys[baisan + '' + shopname + '' + email] = true;
    }
  });
  return { sentEmails: sentEmails, loggedSkipKeys: loggedSkipKeys };
}

function sendAll_(data, operatorEmail) {
  const subject = String(data.subject || '').trim();
  const body = String(data.body || '');
  if (!subject || !body) return { status: 'error', message: '件名と本文を入力してください' };

  const lock = LockService.getScriptLock();
  let gotLock;
  try {
    gotLock = lock.tryLock(5000);
  } catch (e) {
    gotLock = false;
  }
  if (!gotLock) {
    return { status: 'error', message: '他の一斉送信が進行中です。しばらく待ってから再度お試しください' };
  }

  try {
    const deliveryId = data.deliveryId ? String(data.deliveryId) : Utilities.getUuid();
    const plan = buildRecipientPlan_();

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ensureLogSheet_(ss);
    const logged = getLoggedKeysForDelivery_(logSheet, deliveryId);

    const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    const logRows = [];

    plan.skipped.forEach(function (s) {
      const key = s.baisan + '' + s.shopname + '' + s.email;
      if (logged.loggedSkipKeys[key]) return;
      logRows.push([now, deliveryId, operatorEmail, s.baisan, s.shopname, s.email, subject, 'スキップ: ' + s.reason]);
    });

    let remainingQuota = MailApp.getRemainingDailyQuota();
    let quotaExhausted = false;
    let sentThisRun = 0;
    let failedThisRun = 0;
    let alreadySent = 0;
    const failedDetails = [];

    for (let i = 0; i < plan.valid.length; i++) {
      const r = plan.valid[i];
      const key = r.email.toLowerCase();
      if (logged.sentEmails[key]) { alreadySent++; continue; }
      if (remainingQuota <= 0) { quotaExhausted = true; break; }

      let outcome;
      try {
        MailApp.sendEmail({
          to: r.email,
          subject: subject,
          body: renderBody_(body, { shopname: r.shopname, baisan: r.baisan }),
          name: ORG_NAME,
          replyTo: OFFICE_EMAIL,
        });
        remainingQuota--;
        sentThisRun++;
        outcome = '成功';
      } catch (err) {
        failedThisRun++;
        outcome = '失敗: ' + err.message;
        failedDetails.push({ email: r.email, shopname: r.shopname, baisan: r.baisan, error: err.message });
      }
      logRows.push([now, deliveryId, operatorEmail, r.baisan, r.shopname, r.email, subject, outcome]);
    }

    if (logRows.length) {
      logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, LOG_HEADERS.length).setValues(logRows);
    }

    return {
      status: 'ok',
      deliveryId: deliveryId,
      totalRecipients: plan.valid.length,
      sentThisRun: sentThisRun,
      failedThisRun: failedThisRun,
      alreadySent: alreadySent,
      skippedInvalid: plan.skipped.length,
      quotaExhausted: quotaExhausted,
      failedDetails: failedDetails,
    };
  } finally {
    lock.releaseLock();
  }
}

/* ===== 配信履歴 ===== */

function getHistory_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(LOG_SHEET);
  if (!logSheet) return { status: 'ok', history: [] };
  const lastRow = logSheet.getLastRow();
  if (lastRow < 2) return { status: 'ok', history: [] };

  const values = logSheet.getRange(2, 1, lastRow - 1, LOG_HEADERS.length).getValues();
  const groups = {};
  values.forEach(function (row, idx) {
    const deliveryId = String(row[1]);
    if (!groups[deliveryId]) {
      groups[deliveryId] = {
        deliveryId: deliveryId, datetime: row[0], operator: row[2], subject: row[6],
        success: 0, failed: 0, skipped: 0, lastIndex: idx,
      };
    }
    const g = groups[deliveryId];
    const outcome = String(row[7]);
    if (outcome.indexOf('成功') === 0) g.success++;
    else if (outcome.indexOf('失敗') === 0) g.failed++;
    else g.skipped++;
    g.datetime = row[0];
    g.lastIndex = idx;
  });

  const list = Object.keys(groups).map(function (id) { return groups[id]; });
  list.sort(function (a, b) { return b.lastIndex - a.lastIndex; });

  const top20 = list.slice(0, 20).map(function (g) {
    return {
      deliveryId: g.deliveryId,
      datetime: String(g.datetime),
      operator: g.operator,
      subject: g.subject,
      total: g.success + g.failed + g.skipped,
      success: g.success,
      failed: g.failed,
      skipped: g.skipped,
    };
  });
  return { status: 'ok', history: top20 };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
