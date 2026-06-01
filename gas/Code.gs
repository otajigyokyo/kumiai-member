const SPREADSHEET_ID = '14u979d9GilWEBkWx8vik2nzGQiNedK5tALuZkkAyEOQ';
const SHEET_NAME = '組合員連絡先';
const HEADERS = ['タイムスタンプ', '買参番号', '店名', '代表者氏名', '電話番号（店）', '電話番号（携帯）', 'メールアドレス'];
const OFFICE_EMAIL = 'info@jigyokyo.com';
const OFFICE_TEL = '03-5492-4065';
const FORM_URL = 'https://member.jigyokyo.com/';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { baisan, shopname, name, tel_shop, tel_mobile, email } = data;
    if (!baisan || !shopname || !name || (!tel_shop && !tel_mobile) || !email) {
      return jsonResponse({ status: 'error', message: '必須項目が不足しています' });
    }
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (lockErr) {
      return jsonResponse({ status: 'error', message: '混雑しています。少し時間をおいて再度お試しください' });
    }
    let result;
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      let sheet = ss.getSheetByName(SHEET_NAME);
      const telShopCol = HEADERS.indexOf('電話番号（店）') + 1;
      const telMobileCol = HEADERS.indexOf('電話番号（携帯）') + 1;
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME);
        sheet.appendRow(HEADERS);
        sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
        setTelColumnFormat_(sheet, telShopCol, telMobileCol);
      } else if (sheet.getLastColumn() < HEADERS.length) {
        // 旧フォーマット（6列）から新フォーマット（7列）へ移行:
        // 電話番号（店）列の直後に電話番号（携帯）列を挿入し、ヘッダー行を上書き
        sheet.insertColumnAfter(5);
        sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
        sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
        setTelColumnFormat_(sheet, telShopCol, telMobileCol);
      }
      const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
      const rowData = [now, baisan, shopname, name, tel_shop || '', tel_mobile || '', email];
      const lastRow = sheet.getLastRow();
      let updated = false;
      if (lastRow > 1) {
        const baisanCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
        for (let i = 0; i < baisanCol.length; i++) {
          if (String(baisanCol[i][0]) === String(baisan)) {
            const targetRow = i + 2;
            sheet.getRange(targetRow, telShopCol).setNumberFormat('@STRING@');
            sheet.getRange(targetRow, telMobileCol).setNumberFormat('@STRING@');
            sheet.getRange(targetRow, 1, 1, HEADERS.length).setValues([rowData]);
            updated = true; break;
          }
        }
      }
      if (!updated) {
        sheet.appendRow(rowData);
        const newLastRow = sheet.getLastRow();
        sheet.getRange(2, telShopCol, newLastRow - 1, 1).setNumberFormat('@STRING@');
        sheet.getRange(2, telMobileCol, newLastRow - 1, 1).setNumberFormat('@STRING@');
      }
      result = { status: 'ok', action: updated ? 'updated' : 'created' };
    } finally {
      lock.releaseLock();
    }
    sendConfirmationMail(data);
    return jsonResponse(result);
  } catch (err) { return jsonResponse({ status: 'error', message: err.message }); }
}

function setTelColumnFormat_(sheet, telShopCol, telMobileCol) {
  const maxRows = sheet.getMaxRows();
  if (maxRows < 2) return;
  sheet.getRange(2, telShopCol, maxRows - 1, 1).setNumberFormat('@STRING@');
  sheet.getRange(2, telMobileCol, maxRows - 1, 1).setNumberFormat('@STRING@');
}

function maskTel(tel) {
  const digits = String(tel).replace(/\D/g, '');
  if (digits.length <= 4) return tel;
  const last4 = digits.slice(-4);
  const maskedLen = digits.length - 4;
  return '*'.repeat(maskedLen) + last4;
}

function sendConfirmationMail(data) {
  const subject = '【大田市場花き事業協同組合】連絡先のご登録ありがとうございました';
  const body = [
    data.name + ' 様',
    '',
    'このたびは、組合員連絡先のご登録ありがとうございました。',
    '以下の内容で承りました。',
    '',
    '【ご登録内容】',
    '  買参番号    : ' + data.baisan,
    '  店名       : ' + data.shopname,
    '  代表者氏名  : ' + data.name,
    ...(data.tel_shop   ? ['  電話番号（店）  : ' + maskTel(data.tel_shop)]   : []),
    ...(data.tel_mobile ? ['  電話番号（携帯）: ' + maskTel(data.tel_mobile)] : []),
    '  メールアドレス: ' + data.email,
    '',
    'ご登録内容に変更がある場合は、再度同じ買参番号で',
    FORM_URL + ' からご登録いただくと、最新内容に',
    '更新されます。',
    '',
    'このメールにお心当たりがない場合や、ご不明な点が',
    'ございましたら、お手数ですが下記までご連絡ください。',
    '',
    '──────────────────────────────',
    '大田市場花き事業協同組合 事務局',
    'メール: ' + OFFICE_EMAIL,
    '電話 : ' + OFFICE_TEL,
    FORM_URL,
    '──────────────────────────────',
  ].join('\n');
  try {
    MailApp.sendEmail({
      to: data.email,
      subject: subject,
      body: body,
      name: '大田市場花き事業協同組合',
      replyTo: OFFICE_EMAIL,
    });
  } catch (mailErr) {
    Logger.log('メール送信失敗: ' + data.email + ' / ' + mailErr.message);
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse({ status: 'ok', message: '組合員連絡先登録API稼働中' });
}
