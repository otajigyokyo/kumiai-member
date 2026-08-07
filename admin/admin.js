const GAS_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
const USE_MOCK = false;

let currentRecipientCount = 0;
let sendAllInProgress = false;

/* ===== モック ===== */

const MOCK_RECIPIENTS = [
  { baisan: '1001', shopname: '銀座東京フラワー', email: 'flower1@example.com' },
  { baisan: '1002', shopname: 'サンプル生花店', email: 'flower2@example.com' },
  { baisan: '1003', shopname: 'テスト花卉', email: 'flower3@example.com' },
];
let mockSessionToken = null;

function mockCall(action, body) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      if (action === 'request_otp') {
        resolve({ status: 'ok', message: '認証コードを送信しました（モック）' });
        return;
      }
      if (action === 'verify_otp') {
        if (body.otp === '123456') {
          mockSessionToken = 'mock-token';
          resolve({ status: 'ok', token: mockSessionToken, email: body.email });
        } else {
          resolve({ status: 'error', message: '認証コードが正しくありません（モックでは 123456 固定）' });
        }
        return;
      }
      if (body.token !== mockSessionToken) {
        resolve({ status: 'error', code: 'auth_error', message: 'セッションが切れました（モック）' });
        return;
      }
      if (action === 'get_recipients') {
        resolve({ status: 'ok', recipients: MOCK_RECIPIENTS, excluded: 1 });
        return;
      }
      if (action === 'send_test') {
        resolve({ status: 'ok' });
        return;
      }
      if (action === 'send_all') {
        resolve({
          status: 'ok',
          deliveryId: body.deliveryId,
          totalRecipients: MOCK_RECIPIENTS.length,
          sentThisRun: MOCK_RECIPIENTS.length,
          failedThisRun: 0,
          alreadySent: 0,
          skippedInvalid: 1,
          quotaExhausted: false,
          failedDetails: [],
        });
        return;
      }
      if (action === 'get_history') {
        resolve({
          status: 'ok',
          history: [
            { deliveryId: 'mock-1', datetime: '2026-08-01 10:00:00', operator: 'staff@example.com', subject: '【お知らせ】組合費のご案内', total: 3, success: 3, failed: 0 },
          ],
        });
        return;
      }
      resolve({ status: 'error', message: '不明なaction（モック）' });
    }, 400);
  });
}

/* ===== 通信 ===== */

async function callPublic(action, payload) {
  const body = Object.assign({ action: action }, payload);
  if (USE_MOCK) return mockCall(action, body);
  const res = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  return res.json();
}

async function call(action, payload) {
  const token = sessionStorage.getItem('admin_token');
  const body = Object.assign({ action: action, token: token }, payload);
  let json;
  try {
    json = USE_MOCK ? await mockCall(action, body) : await (await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })).json();
  } catch (e) {
    alert('通信エラーが発生しました。');
    return null;
  }
  if (json.code === 'auth_error') {
    alert(json.message || 'セッションが切れました。再度ログインしてください');
    logout();
    return null;
  }
  return json;
}

/* ===== ボタン状態 ===== */

function setButtonLoading(btn, loading) {
  btn.disabled = loading;
  const textEl = btn.querySelector('.btn-text');
  const loadEl = btn.querySelector('.btn-loading');
  if (textEl && loadEl) {
    textEl.style.display = loading ? 'none' : 'inline';
    loadEl.style.display = loading ? 'inline' : 'none';
  }
}

function setSendAllButtonsDisabled(disabled) {
  document.getElementById('btn-send-all').disabled = disabled;
  document.getElementById('btn-send-test').disabled = disabled;
}

/* ===== ログイン ===== */

async function requestOtp(isResend) {
  const emailInput = document.getElementById('login-email');
  const email = emailInput.value.trim();
  const err = document.getElementById('err-login-email');
  err.textContent = '';
  if (!email) {
    err.textContent = 'メールアドレスを入力してください';
    return;
  }
  const btn = document.getElementById('btn-request-otp');
  setButtonLoading(btn, true);
  try {
    await callPublic('request_otp', { email: email });
    document.getElementById('login-step-email').style.display = 'none';
    document.getElementById('login-step-otp').style.display = 'block';
    document.getElementById('login-otp').value = '';
    document.getElementById('err-login-otp').textContent = '';
    document.getElementById('login-otp').focus();
  } catch (e) {
    err.textContent = '通信エラーが発生しました。';
  } finally {
    setButtonLoading(btn, false);
  }
}

function backToEmailStep() {
  document.getElementById('login-step-otp').style.display = 'none';
  document.getElementById('login-step-email').style.display = 'block';
}

async function verifyOtp() {
  const email = document.getElementById('login-email').value.trim();
  const otp = document.getElementById('login-otp').value.trim();
  const err = document.getElementById('err-login-otp');
  err.textContent = '';
  if (!/^[0-9]{6}$/.test(otp)) {
    err.textContent = '6桁の数字を入力してください';
    return;
  }
  const btn = document.getElementById('btn-verify-otp');
  setButtonLoading(btn, true);
  try {
    const json = await callPublic('verify_otp', { email: email, otp: otp });
    if (json.status === 'ok') {
      sessionStorage.setItem('admin_token', json.token);
      sessionStorage.setItem('admin_email', json.email);
      enterAdmin();
    } else {
      err.textContent = json.message || '認証に失敗しました';
    }
  } catch (e) {
    err.textContent = '通信エラーが発生しました。';
  } finally {
    setButtonLoading(btn, false);
  }
}

function enterAdmin() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('admin-section').style.display = 'block';
  document.getElementById('login-email-display').textContent = sessionStorage.getItem('admin_email') || '';
  loadRecipients();
  loadHistory();
}

function logout() {
  sessionStorage.removeItem('admin_token');
  sessionStorage.removeItem('admin_email');
  document.getElementById('admin-section').style.display = 'none';
  document.getElementById('login-section').style.display = 'block';
  document.getElementById('login-step-otp').style.display = 'none';
  document.getElementById('login-step-email').style.display = 'block';
  document.getElementById('login-email').value = '';
  document.getElementById('login-otp').value = '';
}

/* ===== 配信先 ===== */

async function loadRecipients() {
  document.getElementById('recipient-count').textContent = '配信先: 読み込み中...';
  const json = await call('get_recipients', {});
  if (json === null) return;
  if (json.status !== 'ok') {
    document.getElementById('recipient-count').textContent = '配信先の取得に失敗しました: ' + (json.message || '');
    return;
  }
  currentRecipientCount = json.recipients.length;
  document.getElementById('recipient-count').textContent =
    '配信先: ' + json.recipients.length + '件（形式不正・重複などにより除外: ' + json.excluded + '件）';

  const list = document.getElementById('recipient-list');
  list.innerHTML = '';
  json.recipients.forEach(function (r) {
    const row = document.createElement('div');
    row.className = 'recipient-row';
    row.textContent = r.baisan + '　' + r.shopname + '　' + r.email;
    list.appendChild(row);
  });
}

function toggleRecipientList() {
  const wrap = document.getElementById('recipient-list-wrap');
  const btn = document.getElementById('btn-toggle-recipients');
  const show = wrap.style.display === 'none';
  wrap.style.display = show ? 'block' : 'none';
  btn.textContent = show ? '一覧を隠す' : '一覧を表示';
}

/* ===== 本文編集 ===== */

function insertPlaceholder() {
  const ta = document.getElementById('compose-body');
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const insert = '{{店名}}';
  ta.value = text.slice(0, start) + insert + text.slice(end);
  const pos = start + insert.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
}

/* ===== テスト送信 ===== */

async function sendTest() {
  const subject = document.getElementById('compose-subject').value.trim();
  const body = document.getElementById('compose-body').value.trim();
  if (!subject || !body) {
    alert('件名と本文を入力してください');
    return;
  }
  const btn = document.getElementById('btn-send-test');
  setButtonLoading(btn, true);
  try {
    const json = await call('send_test', { subject: subject, body: body });
    if (json === null) return;
    if (json.status === 'ok') {
      alert('テストメールを送信しました。自分のアドレスをご確認ください。');
    } else {
      alert('エラー: ' + (json.message || '不明なエラー'));
    }
  } catch (e) {
    alert('通信エラーが発生しました。');
  } finally {
    setButtonLoading(btn, false);
  }
}

/* ===== 一斉送信 ===== */

function generateUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreateDeliveryId(forceNew) {
  if (!forceNew) {
    const existing = sessionStorage.getItem('admin_delivery_id');
    if (existing && sessionStorage.getItem('admin_delivery_pending') === '1') return existing;
  }
  const id = generateUuid();
  sessionStorage.setItem('admin_delivery_id', id);
  return id;
}

function requestSendAllConfirm() {
  const subject = document.getElementById('compose-subject').value.trim();
  const body = document.getElementById('compose-body').value.trim();
  if (!subject || !body) {
    alert('件名と本文を入力してください');
    return;
  }
  document.getElementById('send-confirm-text').textContent =
    currentRecipientCount + '件に送信します。この操作は取り消せません。';
  document.getElementById('send-confirm').style.display = 'block';
}

function cancelSendAllConfirm() {
  document.getElementById('send-confirm').style.display = 'none';
}

async function doSendAll() {
  if (sendAllInProgress) return;
  sendAllInProgress = true;
  document.getElementById('send-confirm').style.display = 'none';
  setSendAllButtonsDisabled(true);
  document.getElementById('send-progress').style.display = 'block';
  document.getElementById('send-result').style.display = 'none';

  const subject = document.getElementById('compose-subject').value.trim();
  const body = document.getElementById('compose-body').value;
  const deliveryId = getOrCreateDeliveryId(false);

  try {
    const json = await call('send_all', { subject: subject, body: body, deliveryId: deliveryId });
    if (json === null) return;
    if (json.status !== 'ok') {
      showSendError(json.message || '不明なエラー');
      return;
    }
    sessionStorage.setItem('admin_delivery_pending', json.quotaExhausted ? '1' : '');
    renderSendResult(json);
    loadHistory();
  } catch (e) {
    showSendError('通信エラーが発生しました。');
  } finally {
    sendAllInProgress = false;
    document.getElementById('send-progress').style.display = 'none';
    setSendAllButtonsDisabled(false);
  }
}

function showSendError(message) {
  const box = document.getElementById('send-result');
  box.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = 'エラー: ' + message;
  box.appendChild(p);
  box.style.display = 'block';
}

function renderSendResult(json) {
  const remaining = json.totalRecipients - json.sentThisRun - json.alreadySent - json.failedThisRun;
  const lines = [
    '配信対象: ' + json.totalRecipients + '件（形式不正・重複除外: ' + json.skippedInvalid + '件）',
    '今回送信: ' + json.sentThisRun + '件 / 失敗: ' + json.failedThisRun + '件 / 送信済みスキップ: ' + json.alreadySent + '件',
  ];
  if (json.quotaExhausted) {
    lines.push('⚠ 本日の送信可能件数の上限に達したため中断しました。「残りを送信する」から再開してください。');
  }

  const box = document.getElementById('send-result');
  box.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = lines.join('\n');
  box.appendChild(p);

  if (json.failedDetails && json.failedDetails.length) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = '失敗した宛先（' + json.failedDetails.length + '件）';
    details.appendChild(summary);
    const ul = document.createElement('ul');
    json.failedDetails.forEach(function (f) {
      const li = document.createElement('li');
      li.textContent = f.shopname + '（買参番号: ' + f.baisan + ' / ' + f.email + '）: ' + f.error;
      ul.appendChild(li);
    });
    details.appendChild(ul);
    box.appendChild(details);
  }

  if (remaining > 0) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-primary';
    btn.textContent = '残り ' + remaining + ' 件を送信する';
    btn.onclick = doSendAll;
    box.appendChild(btn);
  } else {
    sessionStorage.removeItem('admin_delivery_id');
    sessionStorage.removeItem('admin_delivery_pending');
  }

  box.style.display = 'block';
}

/* ===== 配信履歴 ===== */

async function loadHistory() {
  const wrap = document.getElementById('history-wrap');
  wrap.textContent = '読み込み中...';
  const json = await call('get_history', {});
  if (json === null) return;
  if (json.status !== 'ok') {
    wrap.textContent = '履歴の取得に失敗しました';
    return;
  }
  if (!json.history.length) {
    wrap.textContent = 'まだ配信履歴はありません';
    return;
  }

  wrap.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'history-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['日時', '件名', '件数', '成功', '失敗', '操作者'].forEach(function (h) {
    const th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  json.history.forEach(function (h) {
    const tr = document.createElement('tr');
    [h.datetime, h.subject, h.total, h.success, h.failed, h.operator].forEach(function (v) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}

/* ===== 初期化 ===== */

document.addEventListener('DOMContentLoaded', function () {
  if (sessionStorage.getItem('admin_token')) {
    enterAdmin();
  }
});
