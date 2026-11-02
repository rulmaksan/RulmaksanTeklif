// Yayın sürümü kabuğu: Fiyat teklifi, kayıtlı teklifler, teklif formu ve Veriler (cari listesi + maliyet tablosu).
// Cari listesi ve maliyetler depoda yoktur: her kullanıcı kendi Excel'lerini Veriler'den bu tarayıcıya yükler.
import './yerel_api.js?v=202611021601';
import { $view, ref, esc, toast, pickFile, yenileCariler } from './ortak.js?v=202611021601';
import { cariExceliOku } from './cari_excel.js?v=202611021601';
import { maliyetExceliOku } from './maliyet_yukle.js?v=202611021601';

const EKRANLAR = {
  teklif: () => import('./ekranlar/teklif.js?v=202611021601'),
  teklifyaz: () => import('./ekranlar/teklifyaz.js?v=202611021601'),
  veriler: async () => ({ default: verilerEkrani }),
};
const oku = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
};
const tarih = (iso) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

function verilerEkrani() {
  const c = oku('cari-kaynak');
  const m = oku('maliyet-kaynak');
  $view.innerHTML = `
    <h2>Veriler</h2>
    <p class="muted">İki dosya da <b>sadece bu tarayıcıda</b> saklanır, hiçbir sunucuya gönderilmez.
      Başka bir bilgisayarda kullanırken orada da yükleyin.</p>
    <div class="card">
      <h3>Maliyet tablosu ${m ? '✓' : '<span class="hata">· yüklü değil</span>'}</h3>
      <p>${m ? `<b>${esc(m.dosya)}</b> · ${m.kasa} kasa · ${tarih(m.tarih)}` : 'Kasa maliyetleri ve hesap oranları olmadan teklif hesaplanamaz.'}</p>
      <p class="muted">"Rulmaksan Teklif Maliyetleri.xlsx" (Kasalar ve Parametreler sayfaları). Maliyet değişince Excel'i güncelleyip yeniden yükleyin.</p>
      <div class="actions">
        <button id="maliyetYukle" class="primary">Maliyet Excel'ini yükle</button>
        ${m ? '<button id="maliyetSil" class="danger">Bu tarayıcıdan sil</button>' : ''}
      </div>
    </div>
    <div class="card">
      <h3>Cari listesi ${c ? '✓' : ''}</h3>
      <p>${c ? `<b>${esc(c.dosya)}</b> · ${c.adet} cari · ${tarih(c.tarih)}` : 'Yüklü değil. Teklifte cari seçmek için Netsis\'ten alınan cari Excel\'ini yükleyin (tek seferlik müşteri için gerekmez).'}</p>
      <p class="muted">Başlıktan kod, ünvan, adres, il, ilçe, telefon ve vergi no kendiliğinden bulunur.</p>
      <div class="actions">
        <button id="cariYukle" class="primary">Cari Excel'ini yükle</button>
        ${c ? '<button id="cariSil" class="danger">Bu tarayıcıdan sil</button>' : ''}
      </div>
    </div>`;

  document.getElementById('maliyetYukle').onclick = async () => {
    const f = await pickFile('.xlsx,.xls');
    if (!f) return;
    try {
      const v = await maliyetExceliOku(f);
      localStorage.setItem('maliyetler', JSON.stringify(v));
      localStorage.setItem('maliyet-kaynak', JSON.stringify({ dosya: f.name, kasa: Object.keys(v.kasalar).length, tarih: new Date().toISOString() }));
      toast(`${Object.keys(v.kasalar).length} kasa maliyeti yüklendi`);
      verilerEkrani();
    } catch (e) {
      toast(`Okunamadı: ${e.message}`);
    }
  };
  document.getElementById('maliyetSil')?.addEventListener('click', () => {
    if (!confirm('Maliyet tablosu bu tarayıcıdan silinsin mi?')) return;
    localStorage.removeItem('maliyetler');
    localStorage.removeItem('maliyet-kaynak');
    verilerEkrani();
  });
  document.getElementById('cariYukle').onclick = async () => {
    const f = await pickFile('.xlsx,.xls,.csv');
    if (!f) return;
    try {
      const { cariler, bulunan } = await cariExceliOku(f);
      if (!confirm(`${cariler.length} cari bulundu (sütunlar: ${bulunan.join(', ')}). Yüklensin mi?`)) return;
      localStorage.setItem('cariler', JSON.stringify(cariler));
      localStorage.setItem('cari-kaynak', JSON.stringify({ dosya: f.name, adet: cariler.length, tarih: new Date().toISOString() }));
      yenileCariler();
      toast(`${cariler.length} cari yüklendi`);
      verilerEkrani();
    } catch (e) {
      toast(`Okunamadı: ${e.message}`);
    }
  };
  document.getElementById('cariSil')?.addEventListener('click', () => {
    if (!confirm('Cari listesi bu tarayıcıdan silinsin mi?')) return;
    localStorage.removeItem('cariler');
    localStorage.removeItem('cari-kaynak');
    yenileCariler();
    verilerEkrani();
  });
}

async function route() {
  let [name, arg] = (location.hash.slice(1) || 'teklif').split('/');
  if (name === 'cariler') name = 'veriler'; // eski bağlantı
  const ad = EKRANLAR[name] ? name : 'teklif';
  document.querySelectorAll('.ust-menu a').forEach((a) => a.classList.toggle('active', a.dataset.tab === (arg === 'liste' ? 'liste' : ad)));
  document.querySelector('main').classList.toggle('genis', ad !== 'veriler');
  window.scrollTo(0, 0);
  const ekran = await EKRANLAR[ad]();
  await ekran.default(arg && decodeURIComponent(arg));
  if (ad === 'teklif' && !arg && localStorage.getItem('maliyetler') && !ref.cariler.length)
    toast('Cari listesi yüklü değil: cari seçmek için "Veriler"den Excel yükleyin');
}

window.addEventListener('hashchange', route);
route();
