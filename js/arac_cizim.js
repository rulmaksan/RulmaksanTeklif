// Araç doluluğunun çizimi: aracın siluet resmi + kasa bölümünün beyaz çerçevesi içinde kutu kutu doluluk
// (dolu siyah, boş beyaz; dolu bölmenin ince beyaz kenarı siyah kasada kaybolmasın diye). Kabin solda; kasa kabin tarafından, her sütun alttan üste dolar.
// Römorklu araçta römork siluetle aynı üslupta yanına çizilir; bütün römorklar aynı uzunlukta (Iveco römorku kadar).
// olcek: resmi diğer araçlara göre küçültür (tekerlekler yerde kalır, alttan ölçeklenir).
// Resimler icons/araclar/ altında; "kutu" = resimde kasa çerçevesinin iç kenarları (piksel, ölçülerek bulundu).

const BOS = '#ffffff', SIYAH = '#0b0b0b';
// Kasa tiplerinin rengi, kalem sırasıyla: 1. siyah, 2. gri, sonrakiler koyu gri / açık gri
export const KASA_RENK = ['#1a1a1a', '#8c8c8c', '#4d4d4d', '#c2c2c2'];
const renk = (i) => KASA_RENK[i % KASA_RENK.length];
const ROMORK_UZUNLUK = 828; // Iveco römorku: Daily kasasının iki katı (12 sütun x 69 px)
const kenar = (dolu) => (dolu ? ' stroke="#ffffff" stroke-width="2"' : '');

const RESIMLI = {
  // Ford Cargo 2520 (eski) -> kısa kargo
  kisa_kargo: { src: 'icons/araclar/ford_cargo.png', w: 898, h: 491, kutu: [328, 55, 843, 324], sutun: 8, satir: 4 },
  // Iveco Daily (yeni)
  iveco: { src: 'icons/araclar/iveco_daily.png', w: 899, h: 498, kutu: [434, 58, 848, 329], sutun: 6, satir: 4 },
  iveco_romork: { src: 'icons/araclar/iveco_daily.png', w: 899, h: 498, kutu: [434, 58, 848, 329], sutun: 6, satir: 4,
    romork: { sutun: 12 } },
  // Renault (kabin üstü taşan kasa)
  reno_kafa: { src: 'icons/araclar/reno.png', w: 878, h: 489, kutu: [429, 34, 843, 326], sutun: 6, satir: 4, olcek: 0.85 },
  reno_romork: { src: 'icons/araclar/reno.png', w: 878, h: 489, kutu: [429, 34, 843, 326], sutun: 6, satir: 4, olcek: 0.85,
    romork: { sutun: 12 } },
  // TIR: çekici + dorse
  tir: { src: 'icons/araclar/tir.png', w: 885, h: 493, kutu: [235, 141, 828, 296], sutun: 15, satir: 4 },
};

// Kasa çerçevesinin içine sutun x satir kutu. sinirlar: her kalemin bittiği bölme sırası (birikimli)
function izgara(x0, y0, x1, y1, sutun, satir, ilk, sinirlar) {
  const bosluk = 6, ic = 6;
  const kw = (x1 - x0 - 2 * ic - bosluk * (sutun - 1)) / sutun;
  const kh = (y1 - y0 - 2 * ic - bosluk * (satir - 1)) / satir;
  let svg = '', n = ilk;
  for (let c = 0; c < sutun; c++) {
    for (let r = satir - 1; r >= 0; r--) {
      const k = sinirlar.findIndex((s) => n < s);
      n++;
      svg += `<rect x="${(x0 + ic + c * (kw + bosluk)).toFixed(1)}" y="${(y0 + ic + r * (kh + bosluk)).toFixed(1)}"
        width="${kw.toFixed(1)}" height="${kh.toFixed(1)}" rx="3" fill="${k < 0 ? BOS : renk(k)}"${kenar(k >= 0)}/>`;
    }
  }
  return svg;
}

// Römork: siluetle aynı üslup (siyah gövde, beyaz iç çerçeve, beyaz jantlı tekerlekler)
function romorkCiz(x0, kutu, g) {
  const [, ky0, , ky1] = kutu;
  const govdeY0 = ky0 - 16, govdeY1 = ky1 + 16, zeminY = govdeY1 + 22;
  const teker = (cx) => `<circle cx="${cx}" cy="${zeminY + 34}" r="62" fill="#fff"/>
    <circle cx="${cx}" cy="${zeminY + 34}" r="55" fill="${SIYAH}"/><circle cx="${cx}" cy="${zeminY + 34}" r="33" fill="#fff"/>
    <circle cx="${cx}" cy="${zeminY + 34}" r="12" fill="${SIYAH}"/>`;
  const svg = `
    <rect x="${x0 - 46}" y="${zeminY - 6}" width="56" height="12" fill="${SIYAH}"/>
    <rect x="${x0}" y="${govdeY0}" width="${g + 32}" height="${govdeY1 - govdeY0}" rx="10" fill="${SIYAH}"/>
    <rect x="${x0 + 14}" y="${ky0 - 2}" width="${g + 4}" height="${ky1 - ky0 + 4}" fill="none" stroke="#fff" stroke-width="3"/>
    <rect x="${x0 + 10}" y="${govdeY1 - 2}" width="${g + 12}" height="${zeminY - govdeY1 + 10}" fill="${SIYAH}"/>
    ${teker(x0 + 110)}${teker(x0 + g - 90)}`;
  return { svg, x0: x0 + 16, x1: x0 + 16 + g, genislik: g + 32 };
}

function resimliCiz(a, doluluk, izgaraVar = true) {
  const toplam = a.sutun * a.satir + (a.romork ? a.romork.sutun * a.satir : 0);
  // Her kalem bir öncekinin bittiği yerden devam eder; kalemin bölme sayısı birikimli yuvarlanır
  let birikim = 0;
  const sinirlar = [].concat(doluluk).map((x) => Math.min(toplam, Math.round(Math.min((birikim += x), 1) * toplam)));
  const dolu = sinirlar.length ? sinirlar[sinirlar.length - 1] : 0;
  const o = a.olcek || 1, dy = a.h * (1 - o); // alttan ölçek: tekerlekler aynı zeminde
  const [x0, y0, x1, y1] = [a.kutu[0] * o, a.kutu[1] * o + dy, a.kutu[2] * o, a.kutu[3] * o + dy];
  let govde = `<image href="${a.src}" x="0" y="${dy}" width="${a.w * o}" height="${a.h * o}"/>`;
  if (izgaraVar) govde += izgara(x0, y0, x1, y1, a.sutun, a.satir, 0, sinirlar);
  let genislik = a.w * o;
  if (a.romork) {
    const r = romorkCiz(genislik + 60, [x0, y0, x1, y1], ROMORK_UZUNLUK);
    govde += r.svg + (izgaraVar ? izgara(r.x0, y0, r.x1, y1, a.romork.sutun, a.satir, a.sutun * a.satir, sinirlar) : '');
    genislik += 60 + r.genislik + 10;
  }
  return `<svg viewBox="0 0 ${genislik} ${a.h + 30}" class="arac-cizim" role="img"
      aria-label="Araç kasası: ${toplam} bölmenin ${dolu} tanesi dolu">${govde}</svg>`;
}

// doluluk: 0..n (1 = tam) ya da kalem kalem dolulukların listesi (her kalem kendi renginde). Bir seferi çizer.
export function aracCizim(aracKod, doluluk) {
  if (RESIMLI[aracKod]) return resimliCiz(RESIMLI[aracKod], doluluk);
  return '';
}

// Araç seçim kartı için küçük siluet: kasası boş (bütün bölmeler beyaz)
export function aracSimge(aracKod) {
  return RESIMLI[aracKod] ? resimliCiz(RESIMLI[aracKod], 0).replace('class="arac-cizim"', 'class="arac-simge"') : '';
}
