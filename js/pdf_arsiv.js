// Teklif PDF'leri: formdan PDF üretir, son 20 PDF'i tarayıcıda saklar (Word'deki "son kullanılanlar" gibi) ve
// seçilmişse bilgisayardaki teklif klasörüne yıl-ay alt klasörüyle yazar (masaüstüne dağılmasın diye).
//   Klasör seçimi tarayıcının dosya erişimiyle yapılır (Chrome / Edge masaüstü); desteklemeyen tarayıcıda PDF
//   normal indirilir. Seçilen klasörün izni tarayıcıda saklanır, her açılışta bir kez onay isteyebilir.
// PDF'ler kendi veritabanında (teklif-arsiv) durur; uygulamanın diğer verilerine dokunmaz.

const SON_SAYI = 20;
const AYLAR = ['01 Ocak', '02 Şubat', '03 Mart', '04 Nisan', '05 Mayıs', '06 Haziran', '07 Temmuz', '08 Ağustos',
  '09 Eylül', '10 Ekim', '11 Kasım', '12 Aralık'];

function vt() {
  return new Promise((ok, hata) => {
    const r = indexedDB.open('teklif-arsiv', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('pdfler', { keyPath: 'no' });
      r.result.createObjectStore('ayar');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => hata(r.error);
  });
}
async function islem(depo, kip, fn) {
  const d = await vt();
  return new Promise((ok, hata) => {
    const t = d.transaction(depo, kip);
    const sonuc = fn(t.objectStore(depo));
    // Okumada isteğin sonucu (kayıt yoksa undefined) döner, istek nesnesinin kendisi değil
    t.oncomplete = () => ok(sonuc instanceof IDBRequest ? sonuc.result : sonuc);
    t.onerror = () => hata(t.error);
  });
}

export const klasorDestekli = () => 'showDirectoryPicker' in window;

// ---------- PDF üretimi (html2pdf: formun görüntüsü A4 yatay)
function pdfKutuphanesi() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  return new Promise((ok, hata) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload = () => ok(window.html2pdf);
    s.onerror = () => hata(new Error('PDF kütüphanesi yüklenemedi (internet gerekli)'));
    document.head.appendChild(s);
  });
}

export async function pdfUret(eleman) {
  const html2pdf = await pdfKutuphanesi();
  return html2pdf()
    .set({
      margin: 6,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['avoid-all'] },
    })
    .from(eleman)
    .outputPdf('blob');
}

// ---------- son PDF'ler
export async function arsiveEkle(kayit) {
  await islem('pdfler', 'readwrite', (s) => s.put(kayit));
  const hepsi = await sonPdfler();
  for (const eski of hepsi.slice(SON_SAYI)) await islem('pdfler', 'readwrite', (s) => s.delete(eski.no));
}

export async function sonPdfler() {
  const hepsi = await islem('pdfler', 'readonly', (s) => s.getAll());
  return hepsi.sort((a, b) => b.zaman.localeCompare(a.zaman));
}

export const pdfGetir = (no) => islem('pdfler', 'readonly', (s) => s.get(no));

// ---------- teklif klasörü
export const klasorGetir = () => islem('ayar', 'readonly', (s) => s.get('klasor'));

export async function klasorSec() {
  const k = await window.showDirectoryPicker({ id: 'rulmaksan-teklif', mode: 'readwrite', startIn: 'documents' });
  await islem('ayar', 'readwrite', (s) => s.put(k, 'klasor'));
  return k;
}

async function izinVar(k) {
  const o = { mode: 'readwrite' };
  if ((await k.queryPermission(o)) === 'granted') return true;
  return (await k.requestPermission(o)) === 'granted';
}

// Seçili klasöre <yıl>/<ay>/dosya.pdf yazar. Döner: yazılan yol ya da null (klasör yok / izin verilmedi)
export async function klasoreYaz(dosyaAdi, blob, tarih = new Date()) {
  const kok = await klasorGetir();
  if (!kok || !(await izinVar(kok))) return null;
  const yil = await kok.getDirectoryHandle(String(tarih.getFullYear()), { create: true });
  const ay = await yil.getDirectoryHandle(AYLAR[tarih.getMonth()], { create: true });
  const dosya = await ay.getFileHandle(dosyaAdi, { create: true });
  const yazici = await dosya.createWritable();
  await yazici.write(blob);
  await yazici.close();
  return `${kok.name}\\${yil.name}\\${ay.name}\\${dosyaAdi}`;
}

export function indir(dosyaAdi, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = dosyaAdi;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function ac(blob) {
  const u = URL.createObjectURL(blob);
  window.open(u, '_blank');
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

// ---------- "Son teklifler" listesi (teklif formu ve kayıtlı teklifler ekranında)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function sonTekliflerCiz(kutu, toast) {
  const [liste, klasor] = await Promise.all([sonPdfler(), klasorGetir()]);
  kutu.innerHTML = `
    <div class="son-baslik">
      <h3>Son teklifler <span class="muted small">(son ${SON_SAYI} PDF)</span></h3>
      ${klasorDestekli() ? `<button type="button" class="small" data-klasor>${klasor ? `Klasör: ${esc(klasor.name)} · değiştir` : 'Teklif klasörü seç'}</button>` : ''}
    </div>
    ${klasorDestekli() && !klasor ? '<p class="muted small">Klasör seçersen PDF\'ler oraya yıl / ay klasörleriyle kaydedilir, masaüstüne inmez.</p>' : ''}
    ${liste.length ? `<ul class="son-liste">${liste.map((p) => `
      <li><div><b>${esc(p.musteri)}</b><span class="muted small">${esc(p.ilgili || '')}${p.ilgili ? ' · ' : ''}${esc(p.no)} ·
        ${new Date(p.zaman).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
        <span class="son-dugmeler"><button type="button" class="small" data-ac="${esc(p.no)}">Aç</button>
        <button type="button" class="small" data-indir="${esc(p.no)}">İndir</button></span></li>`).join('')}</ul>`
      : '<p class="muted">Henüz PDF yok. Teklif formunda "PDF indir"e basınca burada görünür.</p>'}`;
  kutu.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.klasor != null) {
        const k = await klasorSec();
        toast(`Teklif klasörü: ${k.name}`);
        return sonTekliflerCiz(kutu, toast);
      }
      const p = await pdfGetir(b.dataset.ac || b.dataset.indir);
      if (!p) return toast('PDF bulunamadı');
      if (b.dataset.ac) ac(p.blob);
      else indir(p.dosyaAdi, p.blob);
    } catch (err) {
      if (err.name !== 'AbortError') toast(err.message);
    }
  };
}
