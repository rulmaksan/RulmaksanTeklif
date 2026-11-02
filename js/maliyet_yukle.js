// Maliyet Excel'ini ("Rulmaksan Teklif Maliyetleri.xlsx", yayin/maliyet_excel.py üretir) okur. Dosya tarayıcıda
// okunur, hiçbir yere gönderilmez; sonuç localStorage 'maliyetler'e yazılır ve yerel_api.js tablolara ekler.
//   Kasalar sayfası: Kasa | Kullanım | Gramaj (gr) | Maliyet (TL)
//   Parametreler sayfası: Ad | Değer  (Kâr oranı, Aylık vade farkı, DBS iskontosu, İşgaliye, Harcırah a-b km, Ödeme koşulu)
import { kucuk } from './secici.js?v=202611021601';

function okuyucu() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, hata) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX);
    s.onerror = () => hata(new Error('Excel okuyucu yüklenemedi (internet gerekli)'));
    document.head.appendChild(s);
  });
}

const sayi = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace('%', '').replace(/\s|₺|TL/gi, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(s);
  return String(v).includes('%') ? n / 100 : n;
};

export async function maliyetExceliOku(dosya) {
  const XLSX = await okuyucu();
  const kitap = XLSX.read(await dosya.arrayBuffer(), { type: 'array' });
  const sayfa = (ad) => kitap.SheetNames.find((s) => kucuk(s).includes(ad));
  if (!sayfa('kasa') || !sayfa('parametre')) throw new Error('"Kasalar" ve "Parametreler" sayfaları olmalı');

  const kasaSatir = XLSX.utils.sheet_to_json(kitap.Sheets[sayfa('kasa')], { header: 1, defval: '' });
  const b = kasaSatir[0].map((h) => kucuk(String(h)));
  const iKod = b.findIndex((h) => h.startsWith('kasa')), iMal = b.findIndex((h) => h.includes('maliyet'));
  const iGr = b.findIndex((h) => h.includes('gram'));
  if (iKod < 0 || iMal < 0) throw new Error('Kasalar sayfasında "Kasa" ve "Maliyet" sütunları olmalı');
  const kasalar = {};
  for (const r of kasaSatir.slice(1)) {
    const kod = String(r[iKod] ?? '').trim().toUpperCase();
    const maliyet = sayi(r[iMal]);
    if (kod && maliyet > 0) kasalar[kod] = { maliyet, ...(iGr >= 0 && sayi(r[iGr]) > 0 ? { gram: sayi(r[iGr]) } : {}) };
  }
  if (!Object.keys(kasalar).length) throw new Error('Kasa maliyeti bulunamadı');

  const param = {};
  const harcirah = [];
  for (const [ad, deger] of XLSX.utils.sheet_to_json(kitap.Sheets[sayfa('parametre')], { header: 1, defval: '' }).slice(1)) {
    const a = kucuk(String(ad));
    if (!a) continue;
    if (a.includes('kar')) param.kar = sayi(deger);
    else if (a.includes('vade')) param.vade_aylik = sayi(deger);
    else if (a.includes('dbs')) param.dbs = sayi(deger);
    else if (a.includes('isgaliye')) param.isgaliye = sayi(deger);
    else if (a.includes('harcirah')) harcirah.push([Number(a.match(/\d+/)?.[0] ?? 0), sayi(deger)]);
    else if (a.includes('odeme')) param.odeme_kosulu = String(deger);
  }
  // "Harcırah 51-100 km" satırlarından barem: [üst sınır (hariç), tutar], son satırın sınırı yok
  harcirah.sort((x, y) => x[0] - y[0]);
  param.harcirah = harcirah.map(([, tutar], i) => [harcirah[i + 1]?.[0] ?? null, tutar]);
  for (const k of ['kar', 'vade_aylik', 'dbs', 'isgaliye']) {
    if (!(param[k] >= 0)) throw new Error(`Parametrelerde "${k}" okunamadı`);
  }
  if (!param.harcirah.length) throw new Error('Harcırah satırları okunamadı');
  return { kasalar, param };
}
