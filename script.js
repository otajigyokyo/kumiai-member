const GAS_URL = 'https://script.google.com/macros/s/AKfycbwu7GrebY_mb4DwVGfdT6E-9ugh6uQRybu7MjuPLpaVRs2tY0dro6adpaTAhZqhycIF3w/exec';
const USE_MOCK = false;

function mockSubmit() {
  return new Promise(resolve => {
    setTimeout(() => resolve({ status: 'ok', action: 'created' }), 500);
  });
}

function validate() {
  let ok = true;
  const fields = [
    { id: 'baisan', errId: 'err-baisan', msg: '買参番号を入力してください', regex: /^[0-9]+$/, regexMsg: '半角数字で入力してください' },
    { id: 'shopname', errId: 'err-shopname', msg: '店名を入力してください' },
    { id: 'name', errId: 'err-name', msg: '代表者氏名を入力してください' },
    { id: 'tel', errId: 'err-tel', msg: '電話番号を入力してください' },
    { id: 'email', errId: 'err-email', msg: 'メールアドレスを入力してください', regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, regexMsg: '正しい形式で入力してください' },
  ];
  fields.forEach(f => {
    const el = document.getElementById(f.id);
    const err = document.getElementById(f.errId);
    const val = el.value.trim();
    el.classList.remove('invalid'); err.textContent = '';
    if (!val) { err.textContent = f.msg; el.classList.add('invalid'); ok = false; }
    else if (f.regex && !f.regex.test(val)) { err.textContent = f.regexMsg; el.classList.add('invalid'); ok = false; }
  });
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
  document.getElementById('form-section').style.display = 'block';
  document.getElementById('success-section').style.display = 'none';
}
