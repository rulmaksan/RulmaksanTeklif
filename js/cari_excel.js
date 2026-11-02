// Cari listesini Excel'den (Netsis'ten alınan liste) okur. Dosya tarayıcıda okunur, hiçbir yere gönderilmez.
// Sütunlar başlıktan bulunur (büyük/küçük harf ve Türkçe harf farkı gözetmez):
//   kod: cari kodu · unvan: ünvan / cari isim / firma · adres · il / şehir · ilçe · tel · vergiNo: vergi no / VKN / TCKN
// Okuyucu (SheetJS) sadece bu işlem yapılınca yüklenir.
import { kucuk } from './secici.js';

const SUTUNLAR = {
  kod: [/cari.?kod/, /^kod$/, /hesap.?kod/],
  unvan: [/unvan/, /cari.?(isim|ad)/, /firma/, /^isim$/, /^ad$/, /musteri/],
  adres: [/adres/],
  il: [/^il$/, /sehir/, /^il\b/],
  ilce: [/ilce/],
  tel: [/tel/, /gsm/],
  vergiNo: [/vergi.?(no|num)/, /vkn/, /tckn/, /kimlik/],
};
const AD = { kod: 'kod', unvan: 'ünvan', adres: 'adres', il: 'il', ilce: 'ilçe', tel: 'telefon', vergiNo: 'vergi no' };

function okuyucuYukle() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, hata) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX);
    s.onerror = () => hata(new Error('Excel okuyucu yüklenemedi (internet gerekli)'));
    document.head.appendChild(s);
  });
}

export async function cariExceliOku(dosya) {
  const XLSX = await okuyucuYukle();
  const kitap = XLSX.read(await dosya.arrayBuffer(), { type: 'array' });
  const sayfa = kitap.Sheets[kitap.SheetNames[0]];
  const satirlar = XLSX.utils.sheet_to_json(sayfa, { header: 1, defval: '', raw: false });
  // Başlık satırı: ünvan sütunu bulunan ilk satır (üstte boş/başlık satırları olabilir)
  const bulSutun = (baslik) => {
    const b = baslik.map((h) => kucuk(String(h)).replace(/[^a-z0-9]+/g, ' ').trim());
    const yer = {};
    for (const [alan, desenler] of Object.entries(SUTUNLAR)) {
      for (const d of desenler) {
        const i = b.findIndex((h, n) => h && d.test(h) && !Object.values(yer).includes(n));
        if (i >= 0) {
          yer[alan] = i;
          break;
        }
      }
    }
    return yer;
  };
  let bi = -1, yer = {};
  for (let i = 0; i < Math.min(satirlar.length, 20); i++) {
    yer = bulSutun(satirlar[i]);
    if (yer.unvan != null) {
      bi = i;
      break;
    }
  }
  if (bi < 0) throw new Error('Ünvan sütunu bulunamadı (başlıkta "Ünvan" ya da "Cari İsim" olmalı)');

  const cariler = [];
  const gorulen = new Set();
  for (const s of satirlar.slice(bi + 1)) {
    const al = (alan) => (yer[alan] != null ? String(s[yer[alan]] ?? '').trim() : '');
    const unvan = al('unvan');
    if (!unvan) continue;
    let kod = al('kod') || `EXCEL-${cariler.length + 1}`;
    while (gorulen.has(kod)) kod += '*';
    gorulen.add(kod);
    cariler.push({ kod, unvan, adres: al('adres'), il: al('il'), ilce: al('ilce'), tel: al('tel'), vergiNo: al('vergiNo').replace(/\D/g, '') });
  }
  if (!cariler.length) throw new Error('Cari satırı bulunamadı');
  return { cariler, bulunan: Object.keys(yer).map((k) => AD[k]) };
}
