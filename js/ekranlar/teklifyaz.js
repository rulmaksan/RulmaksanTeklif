// Teklif formu çıktısı: Excel'deki "EP_TEKLİF FORMU" sayfasının düzeni (A4 yatay). Anlaşılan vade sütunu yeşil;
// istenirse sadece o sütun basılır. "PDF indir" doğrudan dosya verir (son 20 PDF uygulamada saklanır, seçilmişse
// teklif klasörüne yıl / ay alt klasörüyle yazılır); "Yazdır" kâğıda basar.
import { $view, esc, toast, onRoute, panelAdresi } from '../ortak.js?v=202611021608';
import { tl } from '../teklif_hesap.js?v=202611021608';
import { pdfUret, arsiveEkle, klasoreYaz, indir, sonTekliflerCiz } from '../pdf_arsiv.js?v=202611021608';

function stilYukle() {
  if (document.getElementById('teklif-css')) return;
  const link = document.createElement('link');
  link.id = 'teklif-css';
  link.rel = 'stylesheet';
  link.href = 'teklif.css?v=202611021608';
  document.head.appendChild(link);
}

export default async function viewTeklifYaz(no) {
  stilYukle();
  let t;
  try {
    const r = await fetch(`${panelAdresi()}/api/teklif/${encodeURIComponent(no)}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(r.status === 404 ? 'Teklif bulunamadı' : `Panel ${r.status}`);
    t = await r.json();
  } catch (e) {
    $view.innerHTML = `<div class="card"><p>${esc(e.message)}</p><a href="#teklif/liste">Kayıtlı teklifler</a></div>`;
    return;
  }
  if (!onRoute('teklifyaz')) return;

  const s = t.sonuc;
  const m = t.musteri;
  const vadeler = s.vadeler.filter((v) => !t.girdi.digerVadeleriGizle || v.kod === s.vade);
  const r = t.param.vade_aylik;
  const dbs = s.dbs ? 0.98 : 1;
  const fiyat = (k, v) => (v.gun == null ? k.fiyat : k.fiyat * (1 + 0.5 * r + (v.gun * r) / 30)) * dbs;
  const sec = s.vadeler.find((v) => v.kod === s.vade);
  const teslim = m.tur === 'cari' ? m.adres : m.adres || '';
  const tarih = new Date().toLocaleDateString('tr-TR');

  $view.innerHTML = `
    <div class="yazdir-arac noprint">
      <a href="#teklif/${encodeURIComponent(t.no)}">← Teklife dön</a>
      <span class="yazdir-dugmeler">
        <button type="button" class="primary" id="pdfIndir">PDF indir</button>
        <button type="button" id="yazdir">Yazdır</button>
      </span>
    </div>
    <div class="form-kaydir"><article class="teklif-form">
      <header>
        <img src="icons/logo.jpg" alt="Rulmaksan" class="logo">
        <div class="baslik">FİYAT TEKLİF FORMU</div>
        <div class="no">${esc(t.no)}</div>
      </header>
      <table class="ust-bilgi">
        <tr><th>FİRMA</th><td>${esc(m.unvan)}</td><th>TARİH</th><td>${tarih}</td></tr>
        <tr><th>İLGİLİ</th><td>${esc(m.ilgili || '')}${m.telefon ? ` · ${esc(m.telefon)}` : ''}</td><th>TEKLİF VEREN</th><td>${esc(t.girdi.teklifVeren || '')}</td></tr>
        <tr><th>ÖDEME KOŞULLARI</th><td colspan="3" class="kosul">${esc(t.param.odeme_kosulu)}</td></tr>
      </table>
      <table class="kalemler">
        <thead><tr>
          <th>SIRA NO</th><th>ÜRÜN BİLGİLERİ</th><th>TESLİM YERİ</th><th>ARAÇ KAPASİTESİ</th><th>ADET</th>
          ${vadeler.map((v) => `<th class="${v.kod === s.vade ? 'secili' : ''}">${esc(v.ad.toLocaleUpperCase('tr'))} BİRİM FİYAT</th>`).join('')}
          <th>TOPLAM EDERİ (${esc(sec.ad.toLocaleUpperCase('tr'))})</th>
        </tr></thead>
        <tbody>${s.satirlar.map((k, i) => `<tr>
          <td>${i + 1}</td><td>${esc(k.ad)}</td><td>${esc(teslim)}</td>
          <td>${esc(s.aracAd)} · ${Number(k.kapasite).toLocaleString('tr-TR')} adet</td><td>${Number(k.adet).toLocaleString('tr-TR')}</td>
          ${vadeler.map((v) => `<td class="${v.kod === s.vade ? 'secili' : ''}">${tl(fiyat(k, v))}</td>`).join('')}
          <td>${tl(fiyat(k, sec) * k.adet)}</td></tr>`).join('')}</tbody>
        <tfoot>
          <tr><td colspan="${5 + vadeler.length}">ARA TOPLAM${s.dbs ? ' (DBS %2 iskontolu)' : ''}</td><td>${tl(s.secilenTutar)}</td></tr>
          ${s.kdv ? `<tr><td colspan="${5 + vadeler.length}">KDV %20</td><td>${tl(s.kdv)}</td></tr>
          <tr class="genel"><td colspan="${5 + vadeler.length}">GENEL TOPLAM</td><td>${tl(s.secilenTutar + s.kdv)}</td></tr>`
          : `<tr class="genel"><td colspan="${5 + vadeler.length}">GENEL TOPLAM (KDV'siz)</td><td>${tl(s.secilenTutar)}</td></tr>`}
        </tfoot>
      </table>
      <p class="not">Fiyatlar Türk Lirası, birim kasa başıdır. Nakliye fiyata dahildir (${esc(String(s.km))} km, ${esc(s.aracAd)}).
        Teklif ${tarih} tarihli mazot fiyatıyla hesaplanmıştır.</p>
    </article></div>
    <section class="card son-teklifler noprint" id="sonTeklifler"></section>`;
  // Dosya adı: Teklif - Cari - İlgili - T_261102_001 (PDF indir'de ve yazdırmada "PDF olarak kaydet"te)
  const dosyaAdi = ['Teklif', m.unvan, m.ilgili, t.no]
    .filter(Boolean)
    .map((x) => String(x).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim())
    .join(' - ');
  const sonKutu = document.getElementById('sonTeklifler');
  sonTekliflerCiz(sonKutu, toast);
  document.getElementById('pdfIndir').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = 'PDF hazırlanıyor…';
    try {
      const blob = await pdfUret(document.querySelector('.teklif-form'));
      const ad = `${dosyaAdi}.pdf`;
      await arsiveEkle({ no: t.no, dosyaAdi: ad, musteri: m.unvan, ilgili: m.ilgili || '', zaman: new Date().toISOString(), blob });
      let yol = null;
      try {
        yol = await klasoreYaz(ad, blob);
      } catch {
        yol = null; // klasöre yazılamadı (izin, taşınmış klasör): normal indirmeye düş
      }
      if (yol) toast(`Kaydedildi: ${yol}`);
      else indir(ad, blob);
      sonTekliflerCiz(sonKutu, toast);
    } catch (err) {
      toast(`PDF oluşturulamadı: ${err.message}`);
    } finally {
      b.disabled = false;
      b.textContent = 'PDF indir';
    }
  };
  document.getElementById('yazdir').onclick = () => {
    const eski = document.title;
    document.title = dosyaAdi;
    window.addEventListener('afterprint', () => (document.title = eski), { once: true });
    window.print();
  };
  if (t.girdi.digerVadeleriGizle) toast('Sadece anlaşılan vade gösteriliyor');
}
