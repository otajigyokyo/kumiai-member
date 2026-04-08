const SHEET_NAME = '組合員連絡先';
const HEADERS = ['タイムスタンプ', '買参番号', '店名', '代表者氏名', '電話番号', 'メールアドレス'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { baisan, shopname, name, tel, email } = data;
    if (!baisan || !shopname || !name || !tel || !email) {
      return jsonResponse({ status: 'error', message: '必須項目が不足しています' });
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    const rowData = [now, baisan, shopname, name, tel, email];
    const lastRow = sheet.getLastRow();
    let updated = false;
    if (lastRow > 1) {
      const baisanCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
      for (let i = 0; i < baisanCol.length; i++) {
        if (String(baisanCol[i][0]) === String(baisan)) {
          sheet.getRange(i + 2, 1, 1, HEADERS.length).setValues([rowData]);
          updated = true; break;
        }
      }
    }
    if (!updated) sheet.appendRow(rowData);
    return jsonResponse({ status: 'ok', action: updated ? 'updated' : 'created' });
  } catch (err) { return jsonResponse({ status: 'error', message: err.message }); }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse({ status: 'ok', message: '組合員連絡先登録API稼働中' });
}
