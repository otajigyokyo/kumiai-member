const GAS_URL = 'https://script.google.com/macros/s/AKfycbwu7GrebY_mb4DwVGfdT6E-9ugh6uQRybu7MjuPLpaVRs2tY0dro6adpaTAhZqhycIF3w/exec';
const USE_MOCK = false;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const EMAIL_TYPOS = {
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'yahho.co.jp': 'yahoo.co.jp',
  'yaho.co.jp': 'yahoo.co.jp',
  'yahoo.co.j': 'yahoo.co.jp',
  'outlok.com': 'outlook.com',
  'hotmial.com': 'hotmail.com',
  'icoud.com': 'icloud.com',
  'iclud.com': 'icloud.com',
  'ezweb.ne.j': 'ezweb.ne.jp',
  'docomo.ne.j': 'docomo.ne.jp',
  'softbnak.ne.jp': 'softbank.ne.jp',
};

function mockSubmit() {
  return new Promise(resolve => {
    setTimeout(() => resolve({ status: 'ok', action: 'created' }), 500);
  });
}

function hasFullWidth(s) {
  return /[０-９Ａ-Ｚａ-ｚ＠．]/.test(s);
}

function isValidEmailStrict(email) {
  if (!email || email.length > 254) return false;
  if (!EMAIL_REGEX.test(email)) return false;
  if (email.includes('..')) return false;
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  return true;
}

function suggestEmailDomain(email) {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  return EMAIL_TYPOS[domain] ? email.slice(0, at + 1) + EMAIL_TYPOS[domain] : null;
}

let pendingEmailSuggestion = null;

function showEmailSuggestion(suggested) {
  pendingEmailSuggestion = suggested;
  const wrap = document.getElementById('email-suggest');
  wrap.querySelector('.suggest-text').textContent = 'もしかして ' + suggested + ' ではありませんか?';
  wrap.style.display = 'flex';
}

function hideEmailSuggestion() {
  document.getElementById('email-suggest').style.display = 'none';
  pendingEmailSuggestion = null;
}

function applyEmailSuggestion() {
  if (!pendingEmailSuggestion) return;
  const el = document.getElementById('email');
  el.value = pendingEmailSuggestion;
  hideEmailSuggestion();
  document.getElementById('err-email').textContent = '';
  el.classList.remove('invalid');
}

function dismissEmailSuggestion() {
  hideEmailSuggestion();
}

function validateEmailField(isSubmit) {
  const el = document.getElementById('email');
  const err = document.getElementById('err-email');
  const val = el.value.trim();
  err.textContent = '';
  el.classList.remove('invalid');
  if (!isSubmit) hideEmailSuggestion();
  if (!val) {
    if (isSubmit) {
      err.textContent = 'メールアドレスを入力してください';
      el.classList.add('invalid');
      return false;
    }
    return true;
  }
  if (hasFullWidth(val)) {
    err.textContent = '半角英数字で入力してください';
    el.classList.add('invalid');
    return false;
  }
  if (!isValidEmailStrict(val)) {
    err.textContent = '正しい形式で入力してください';
    el.classList.add('invalid');
    return false;
  }
  if (!isSubmit) {
    const sug = suggestEmailDomain(val);
    if (sug) showEmailSuggestion(sug);
  }
  return true;
}

function validate() {
  let ok = true;
  const fields = [
    { id: 'baisan', errId: 'err-baisan', msg: '買参番号を入力してください', regex: /^[0-9]+$/, regexMsg: '半角数字で入力してください' },
    { id: 'shopname', errId: 'err-shopname', msg: '店名を入力してください' },
    { id: 'name', errId: 'err-name', msg: '代表者氏名を入力してください' },
    { id: 'tel', errId: 'err-tel', msg: '電話番号を入力してください' },
  ];
  fields.forEach(f => {
    const el = document.getElementById(f.id);
    const err = document.getElementById(f.errId);
    const val = el.value.trim();
    el.classList.remove('invalid'); err.textContent = '';
    if (!val) { err.textContent = f.msg; el.classList.add('invalid'); ok = false; }
    else if (f.regex && !f.regex.test(val)) { err.textContent = f.regexMsg; el.classList.add('invalid'); ok = false; }
  });
  if (!validateEmailField(true)) ok = false;
  return ok;
}

async function submitForm() {
  if (!validate()) return;
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loading').style.display = 'inline';
  const data = {
    baisan: document.getElementById('baisan').value.trim(),
    shopname: document.getElementById('shopname').value.trim(),
    name: document.getElementById('name').value.trim(),
    tel: document.getElementById('tel').value.trim(),
    email: document.getElementById('email').value.trim(),
  };
  try {
    let json;
    if (USE_MOCK) {
      json = await mockSubmit();
    } else {
      const res = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(data) });
      json = await res.json();
    }
    if (json.status === 'ok') {
      document.getElementById('form-section').style.display = 'none';
      document.getElementById('success-section').style.display = 'block';
    } else { alert('エラー: ' + (json.message || '不明')); }
  } catch (e) { alert('通信エラーが発生しました。'); console.error(e); }
  finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').style.display = 'inline';
    btn.querySelector('.btn-loading').style.display = 'none';
  }
}

function resetForm() {
  ['baisan','shopname','name','tel','email'].forEach(id => { document.getElementById(id).value = ''; document.getElementById(id).classList.remove('invalid'); });
  document.querySelectorAll('.error').forEach(el => el.textContent = '');
  hideEmailSuggestion();
  document.getElementById('form-section').style.display = 'block';
  document.getElementById('success-section').style.display = 'none';
}

document.getElementById('email').addEventListener('blur', function() { validateEmailField(false); });
document.getElementById('email').addEventListener('input', function() {
  document.getElementById('err-email').textContent = '';
  document.getElementById('email').classList.remove('invalid');
  hideEmailSuggestion();
});
