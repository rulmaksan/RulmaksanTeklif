// Satış teklifi hesabı (Excel "Satış Hesaplama" + teknik şartname). Ekran ve çıktı aynı fonksiyonu kullanır.
//
// Sefer maliyeti = yakıt (gidiş km x 2 x 100 km tüketimi / 100 x mazot) + şoför harcırahı (km baremi) + işgaliye.
// Nakliye payı: aynı araçta birden fazla kasa tipi gidebilir. Sefer maliyeti kalemlere araçta kapladıkları yer
// oranında dağıtılır; kasa başı pay = sefer / (araç kapasitesi x toplam doluluk). Araç tam dolarsa
// kasa başı pay = sefer / kapasite (en düşük). Excel her satırı ayrı sefer sayıyordu; bu, karışık yükte nakliyeyi
// iki kez yazmasın diye. Doluluk %100'ü aşarsa sefer sayısı yukarı yuvarlanır.
// Dip fiyat = (üretim maliyeti + nakliye payı) x (1 + kâr). Verilen peşin fiyat dip fiyatın altındaysa teklif çıkmaz.
// Vade: aylık oran r ile, haftalık nakit 1; aylık nakit 1 + 0,5r; N gün vade 1 + 0,5r + N x r / 30
//   (30 gün = 1,075 · 60 gün = 1,125 · 90 gün = 1,175 · 120 gün = 1,225; Excel'in "özel vade" formülü).

export const VADELER = [
  { kod: 'haftalik', ad: 'Haftalık nakit', gun: null },
  { kod: 'aylik', ad: 'Aylık nakit', gun: 0 },
  { kod: '30', ad: '30 gün vadeli', gun: 30 },
  { kod: '45', ad: '45 gün vadeli', gun: 45 },
  { kod: '60', ad: '60 gün vadeli', gun: 60 },
  { kod: '90', ad: '90 gün vadeli', gun: 90 },
  { kod: '120', ad: '120 gün vadeli', gun: 120 },
];

export const vadeCarpani = (gun, r) => (gun == null ? 1 : 1 + 0.5 * r + (gun * r) / 30);
const yukari2 = (x) => Math.ceil(x * 100 - 1e-9) / 100; // Excel ROUNDUP(x, 2)

export function harcirah(km, barem) {
  for (const [sinir, tutar] of barem) if (sinir == null || km < sinir) return tutar;
  return 0;
}

// girdi: { veri (panelden tablolar), km, mazot, arac (kod), kalemler: [{kasa, adet, fiyat}], ekKalem (sira) }
export function hesapla({ veri, km, mazot, arac, kalemler }) {
  const p = veri.param;
  const a = veri.araclar.find((x) => x.kod === arac);
  const satirlar = kalemler
    .map((k, sira) => ({ ...k, sira, kasaB: veri.kasalar.find((x) => x.kod === k.kasa), adet: Number(k.adet) || 0 }))
    .filter((k) => k.kasaB && k.adet > 0);
  const bos = { satirlar: [], doluluk: 0, sefer: 0, seferSayisi: 0, ton: 0, hata: [] };
  if (!a || !satirlar.length) return bos;

  const kmSay = Number(km) || 0;
  const yakit = kmSay * 2 * (a.yakit100 / 100) * (Number(mazot) || 0);
  const har = harcirah(kmSay, p.harcirah);
  const isg = kmSay > 0 ? p.isgaliye : 0;
  const sefer = yakit + har + isg;

  for (const k of satirlar) {
    k.kapasite = k.kasaB.kapasite[arac] || 0;
    k.doluluk = k.kapasite ? k.adet / k.kapasite : 0;
  }
  const doluluk = satirlar.reduce((t, k) => t + k.doluluk, 0);
  const seferSayisi = Math.max(1, Math.ceil(doluluk - 1e-9));
  const nakliyeToplam = sefer * seferSayisi;
  // Araç tam dolu giderse (aynı kasa karışımı, toplam doluluk = sefer sayısı) kasa başı pay
  const doluPay = (k) => (k.kapasite ? sefer / k.kapasite : 0);

  const hata = [];
  for (const k of satirlar) {
    k.maliyet = k.kasaB.maliyet;
    k.nakliye = k.kapasite && doluluk ? nakliyeToplam / (k.kapasite * doluluk) : 0;
    k.dip = yukari2((k.maliyet + k.nakliye) * (1 + p.kar));
    k.fiyat = Number(k.fiyat) > 0 ? Number(k.fiyat) : k.dip;
    k.dipAlti = k.fiyat < k.dip;
    if (k.dipAlti) hata.push(`${k.kasa}: verilen fiyat ${tl(k.fiyat)} dip fiyatın (${tl(k.dip)}) altında`);
    k.kar = k.fiyat - k.maliyet - k.nakliye;
    k.toplamKar = k.kar * k.adet;
    k.tutar = k.fiyat * k.adet;
    k.ton = (k.adet * k.kasaB.gram) / 1e6;
    // Araç dolu giderse: nakliye payı düşer -> kâr artar; aynı kârla fiyat bu kadar inebilir
    k.doluNakliye = doluPay(k);
    k.doluKar = k.fiyat - k.maliyet - k.doluNakliye;
    k.ayniKarlaFiyat = Math.max(k.dip > 0 ? yukari2((k.maliyet + k.doluNakliye) * (1 + p.kar)) : 0, k.fiyat - (k.nakliye - k.doluNakliye));
    k.vadeler = Object.fromEntries(VADELER.map((v) => [v.kod, yukari2(k.fiyat * vadeCarpani(v.gun, p.vade_aylik))]));
  }
  if (!satirlar.every((k) => k.kapasite)) hata.push('Seçilen araç için kapasitesi olmayan kasa var');
  if (doluluk > 1 + 1e-9) hata.push(`Araç kapasitesi %${Math.round((doluluk - 1) * 100)} aşılıyor: ${seferSayisi} sefer gerekir`);

  const toplamKar = satirlar.reduce((t, k) => t + k.toplamKar, 0);
  const toplamPesin = satirlar.reduce((t, k) => t + k.tutar, 0);

  // Boş yer: araçtaki boşluk, ekKalem'in (varsayılan ilk kalem) kasasıyla doldurulursa
  let bosYer = null;
  const kalan = seferSayisi - doluluk;
  if (kalan > 1e-6) {
    const ek = satirlar[0];
    const ekAdet = Math.floor(kalan * ek.kapasite);
    if (ekAdet > 0) {
      const yeniDoluluk = doluluk + ekAdet / ek.kapasite;
      const pay = (kk) => nakliyeToplam / (kk.kapasite * yeniDoluluk);
      const yeniKar = satirlar.reduce((t, kk) => t + (kk.fiyat - kk.maliyet - pay(kk)) * kk.adet, 0)
        + (ek.fiyat - ek.maliyet - pay(ek)) * ekAdet;
      bosYer = { kasa: ek.kasa, adet: ekAdet, ekKar: yeniKar - toplamKar, toplamKar: yeniKar, doluluk: yeniDoluluk };
    }
  }

  return {
    satirlar, doluluk, seferSayisi, sefer, yakit, harcirah: har, isgaliye: isg, nakliyeToplam,
    ton: satirlar.reduce((t, k) => t + k.ton, 0), toplamKar, toplamPesin, bosYer, hata,
    gecerli: !hata.length || hata.every((h) => h.startsWith('Araç kapasitesi')),
  };
}

export const tl = (x, ondalik = 2) =>
  `${Number(x || 0).toLocaleString('tr-TR', { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik })} ₺`;
