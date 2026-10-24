// Server lokal untuk "Jawab Otomatis".
// Tugasnya: membuka link Google Form, membaca soalnya, dan (kalau diminta) mengirim jawaban.
// Jalankan: node server.js   lalu buka http://localhost:3000
// Butuh Node.js 18 atau lebih baru. Tidak perlu install paket apa pun.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const TYPES = {
  0: 'jawaban singkat',
  1: 'paragraf',
  2: 'pilihan ganda',
  3: 'dropdown',
  4: 'kotak centang',
  5: 'skala linear',
};

function allowedUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' &&
      ['docs.google.com', 'forms.gle', 'forms.google.com'].includes(x.hostname);
  } catch (e) {
    return false;
  }
}

// Membaca data formulir yang ditanam Google di halaman responden (FB_PUBLIC_LOAD_DATA_).
function parseForm(html, finalUrl) {
  const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/);
  if (!m) throw new Error('Soal tidak ditemukan di halaman itu. Pastikan memakai link responden (tombol Kirim > ikon link), bukan link edit.');
  let data;
  try { data = JSON.parse(m[1]); } catch (e) { throw new Error('Data formulir tidak bisa dibaca.'); }

  const meta = (data && data[1]) || [];
  const items = meta[1] || [];
  const title = meta[8] || (data[3] || '') || 'Formulir';
  const idMatch = String(finalUrl).match(/\/forms\/d\/e\/([^/?#]+)/);
  const action = idMatch ? `https://docs.google.com/forms/d/e/${idMatch[1]}/formResponse` : null;

  const questions = [];
  for (const it of items) {
    if (!Array.isArray(it) || !Array.isArray(it[4]) || !it[4][0]) continue;
    const type = it[3];
    const q = it[4][0];
    const supported = Object.prototype.hasOwnProperty.call(TYPES, type) && it[4].length === 1;
    const options = (q[1] || [])
      .filter((o) => Array.isArray(o) && o[0] !== undefined && o[0] !== '')
      .map((o) => String(o[0]));
    questions.push({
      title: String(it[1] || '').trim(),
      description: String(it[2] || '').trim(),
      type: TYPES[type] || 'tipe lain',
      typeCode: type,
      entry: String(q[0]),
      required: q[2] === 1,
      options,
      supported,
    });
  }
  return { title: String(title), action, questions };
}

async function loadForm(url) {
  if (!allowedUrl(url)) throw new Error('Link harus dari Google Form (docs.google.com/forms atau forms.gle).');
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'id,en;q=0.8' }, redirect: 'follow' });
  const finalUrl = res.url || url;
  if (/accounts\.google\.com/.test(finalUrl)) throw new Error('Formulir ini meminta login Google, jadi tidak bisa dibuka dari sini.');
  if (!res.ok) throw new Error('Formulir tidak bisa dibuka (kode ' + res.status + ').');
  const html = await res.text();
  return parseForm(html, finalUrl);
}

async function submitForm(action, answers) {
  if (!/^https:\/\/docs\.google\.com\/forms\/d\/e\/[^/]+\/formResponse$/.test(String(action))) {
    throw new Error('Alamat pengiriman tidak valid.');
  }
  const body = new URLSearchParams();
  for (const [entry, value] of Object.entries(answers || {})) {
    if (!/^\d+$/.test(entry)) continue;
    for (const v of [].concat(value)) body.append('entry.' + entry, String(v));
  }
  body.append('fvv', '1');
  body.append('pageHistory', '0');
  const res = await fetch(action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body,
    redirect: 'follow',
  });
  const text = await res.text();
  const recorded = /has been recorded|telah direkam|freebirdFormviewerViewResponseConfirmationMessage/i.test(text);
  return { ok: res.ok && recorded, status: res.status };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error('Permintaan terlalu besar.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('Format permintaan salah.')); }
    });
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (req.method === 'GET' && u.pathname === '/api/form') {
      return send(res, 200, await loadForm(u.searchParams.get('url') || ''));
    }
    if (req.method === 'POST' && u.pathname === '/api/submit') {
      const { action, answers } = await readJson(req);
      return send(res, 200, await submitForm(action, answers));
    }
    send(res, 404, { error: 'Tidak ditemukan.' });
  } catch (e) {
    send(res, 400, { error: e.message || 'Terjadi kesalahan.' });
  }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log('Jawab Otomatis berjalan di http://localhost:' + PORT);
    console.log('Tekan Ctrl+C untuk berhenti.');
  });
}

module.exports = { parseForm, allowedUrl, server };
