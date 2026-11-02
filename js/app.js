// Yayın sürümü kabuğu: Fiyat teklifi, kayıtlı teklifler, teklif formu ve cari listesi yükleme.
import './yerel_api.js';
import { $view, ref, esc, toast, pickFile, yenileCariler } from './ortak.js';
import { cariExceliOku } from './cari_excel.js';

const EKRANLAR = {
  teklif: () => import('./ekranlar/teklif.js'),
  teklifyaz: () => import('./ekranlar/teklifyaz.js'),
  cariler: async () => ({ default: carilerEkrani }),
};

function carilerEkrani() {
  const k = JSON.parse(localStorage.getItem('cari-kaynak') || 'null');
  $view.innerHTML = `
    <h2>Cari listesi</h2>
    <div class="card">
      <p>${k ? `Yüklü: <b>${esc(k.dosya)}</b> · ${k.adet} cari · ${new Date(k.tarih).toLocaleString('tr-TR')}` : 'Henüz cari listesi yüklenmedi.'}</p>
      <p class="muted">Netsis'ten aldığın cari Excel'ini seç. Liste <b>sadece bu tarayıcıda</b> saklanır, hiçbir sunucuya gönderilmez.
        Başlıktan kod, ünvan, adres, il, ilçe, telefon ve vergi no kendiliğinden bulunur.</p>
      <div class="actions">
        <button id="yukle" class="primary">Excel'den yükle</button>
        ${k ? '<button id="sil" class="danger">Listeyi bu tarayıcıdan sil</button>' : ''}
      </div>
    </div>`;
  document.getElementById('yukle').onclick = async () => {
    const f = await pickFile('.xlsx,.xls,.csv');
    if (!f) return;
    try {
      const { cariler, bulunan } = await cariExceliOku(f);
      if (!confirm(`${cariler.length} cari bulundu (sütunlar: ${bulunan.join(', ')}). Yüklensin mi?`)) return;
      localStorage.setItem('cariler', JSON.stringify(cariler));
      localStorage.setItem('cari-kaynak', JSON.stringify({ dosya: f.name, adet: cariler.length, tarih: new Date().toISOString() }));
      yenileCariler();
      toast(`${cariler.length} cari yüklendi`);
      carilerEkrani();
    } catch (e) {
      toast(`Okunamadı: ${e.message}`);
    }
  };
  document.getElementById('sil')?.addEventListener('click', () => {
    if (!confirm('Cari listesi bu tarayıcıdan silinsin mi?')) return;
    localStorage.removeItem('cariler');
    localStorage.removeItem('cari-kaynak');
    yenileCariler();
    carilerEkrani();
  });
}

async function route() {
  const [name, arg] = (location.hash.slice(1) || 'teklif').split('/');
  const ad = EKRANLAR[name] ? name : 'teklif';
  document.querySelectorAll('.ust-menu a').forEach((a) => a.classList.toggle('active', a.dataset.tab === (arg === 'liste' ? 'liste' : ad)));
  document.querySelector('main').classList.toggle('genis', ad !== 'cariler');
  window.scrollTo(0, 0);
  const ekran = await EKRANLAR[ad]();
  await ekran.default(arg && decodeURIComponent(arg));
  if (ad === 'teklif' && !ref.cariler.length && !arg)
    toast('Cari listesi yüklü değil: üstten "Cari listesi"ne girip Excel yükleyin');
}

window.addEventListener('hashchange', route);
route();
