// Fungsi Netlify (opsional). Membuka link Google Form di sisi server lalu mengembalikan HTML-nya,
// sehingga halaman tidak perlu memakai proxy publik. Tanpa fungsi ini, situs tetap jalan lewat proxy publik.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function allowed(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && ['docs.google.com', 'forms.gle', 'forms.google.com'].includes(x.hostname);
  } catch (e) {
    return false;
  }
}

exports.handler = async (event) => {
  const url = (event.queryStringParameters && event.queryStringParameters.url) || '';
  if (!allowed(url)) {
    return { statusCode: 400, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'Link harus dari Google Form.' };
  }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'id,en;q=0.8' }, redirect: 'follow' });
    const finalUrl = res.url || url;
    if (/accounts\.google\.com/.test(finalUrl)) {
      return { statusCode: 403, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'Formulir meminta login Google.' };
    }
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-final-url': finalUrl, 'cache-control': 'no-store' },
      body
    };
  } catch (e) {
    return { statusCode: 502, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'Formulir tidak bisa dibuka.' };
  }
};
