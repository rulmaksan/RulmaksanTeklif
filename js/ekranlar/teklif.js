// Fiyat teklifi: müşteri (kayıtlı cari ya da tek seferlik) -> haritada teslim yeri -> gidiş km -> araç, kasalar
// -> doluluk, nakliye payı, dip fiyat, kâr, vadeli fiyatlar -> kaydet ve teklif formunu yazdır.
// Hesap js/teklif_hesap.js'te; tablolar, konum, mesafe, mazot ve kayıt panelde (netsis-kesif/teklif.py, mazot.py).
import { $view, ref, esc, toast, onRoute, panelAdresi } from '../ortak.js';
import { secici } from '../secici.js';
import { hesapla, VADELER, tl } from '../teklif_hesap.js';
import { aracCizim, aracSimge } from '../arac_cizim.js';
import { sonTekliflerCiz } from '../pdf_arsiv.js';

const ayar = () => JSON.parse(localStorage.getItem('netsis-cfg') || '{}');
const ayarYaz = (d) => localStorage.setItem('netsis-cfg', JSON.stringify({ ...ayar(), ...d }));
const api = async (yol, govde) => {
  const r = await fetch(`${panelAdresi()}${yol}`, {
    method: govde ? 'POST' : 'GET',
    headers: govde ? { 'Content-Type': 'application/json' } : undefined,
    body: govde ? JSON.stringify(govde) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hata || `Panel ${r.status}`);
  return j;
};

function haritaYukle() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((ok, hata) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => ok(window.L);
    s.onerror = () => hata(new Error('Harita yüklenemedi'));
    document.head.appendChild(s);
  });
}

function stilYukle() {
  if (document.getElementById('teklif-css')) return;
  const link = document.createElement('link');
  link.id = 'teklif-css';
  link.rel = 'stylesheet';
  link.href = 'teklif.css';
  document.head.appendChild(link);
}

export default async function viewTeklif(arg) {
  stilYukle();
  if (arg === 'liste') return liste();
  $view.innerHTML = '<p class="muted">Yükleniyor…</p>';
  let veri, kayitli;
  try {
    veri = await api('/api/teklif/veriler');
    kayitli = arg ? await api(`/api/teklif/${encodeURIComponent(arg)}`) : null;
  } catch (e) {
    $view.innerHTML = `<div class="card"><p>Panele ulaşılamadı: ${esc(e.message)}</p>
      <p class="muted">Teklif için panel açık olmalı (kasa tabloları, mesafe ve mazot fiyatı oradan gelir).</p></div>`;
    return;
  }
  if (!onRoute('teklif')) return;

  // Ekranın durumu (kaydedilen teklifin "girdi" kısmı)
  const d = kayitli?.girdi || {
    musteri: { tur: 'cari', cariKod: '', unvan: '', ilgili: '', telefon: '', adres: '', tip: 'tuzel' },
    konum: null, km: '', dk: null,
    arac: ayar().teklifArac || 'reno_romork',
    mazot: '', mazotIl: ayar().mazotIl || 'ANTALYA',
    kalemler: [{ kasa: '30X50X14', adet: '', fiyat: '' }],
    vade: '30', ozelGun: '', digerVadeleriGizle: false, dbs: false,
    teklifVeren: ayar().teklifVeren || '',
  };
  let sonuc;

  $view.innerHTML = `
    <div class="teklif-ust">
      <h2>Fiyat teklifi${kayitli ? ` <span class="muted">${esc(kayitli.no)}</span>` : ''}</h2>
      <a href="#teklif/liste" class="small">Kayıtlı teklifler</a>
    </div>
    <div class="teklif-izgara">
      <section class="card">
        <h3>1 · Müşteri ve teslim yeri</h3>
        <div class="chips" id="musteriTur">
          <button type="button" data-tur="cari">Kayıtlı cari</button>
          <button type="button" data-tur="tek">Tek seferlik müşteri</button>
        </div>
        <div id="cariAlan"><label>Cari<input id="cari" placeholder="Cari adı ya da kodu…" value="${esc(d.musteri.cariKod)}"></label></div>
        <div id="tekAlan">
          <label>Müşteri adı<input id="tekUnvan" value="${esc(d.musteri.tur === 'tek' ? d.musteri.unvan : '')}"></label>
          <label>Telefon<input id="tekTel" inputmode="tel" value="${esc(d.musteri.telefon)}"></label>
          <label>Teslim adresi<input id="tekAdres" value="${esc(d.musteri.adres)}" placeholder="Açık adres (teklif formuna yazılır)"></label>
        </div>
        <p class="muted" id="cariBilgi"></p>
        <div class="row">
          <label>İlgili kişi<input id="ilgili" value="${esc(d.musteri.ilgili)}"></label>
          <label>Şirket tipi<select id="tip"><option value="tuzel">Tüzel (KDV %20)</option><option value="sahis">Şahıs (KDV'siz)</option></select></label>
        </div>
        <div class="alan-baslik">Teslim yeri</div>
        <div class="yer-sec">
          <label>İl<select id="yerIl"><option value="">İl seçin</option></select></label>
          <label>İlçe<select id="yerIlce" disabled><option value="">—</option></select></label>
          <label>Köy / mahalle<select id="yerAd" disabled><option value="">—</option></select></label>
        </div>
        <div class="yer-ara">
          <input id="aramaAdres" placeholder="Listede yoksa yaz: köy, ilçe, il…">
          <button type="button" id="adresBul">Haritada bul</button>
        </div>
        <div id="harita" class="teklif-harita"></div>
        <p class="muted small" id="haritaNot">Listeden seçin, arayın ya da haritada teslim yerine dokunun. Pin sürüklenebilir.</p>
        <button type="button" id="konumKaydet" class="small" hidden>Bu konumu cari için kaydet</button>
        <div class="row">
          <label>Gidiş yol (km)<input id="km" type="number" inputmode="decimal" step="any" value="${esc(d.km)}"></label>
          <label>Süre<input id="dk" disabled value="${d.dk != null ? `${d.dk} dk` : ''}"></label>
        </div>
      </section>

      <section class="card">
        <h3>2 · Araç ve kasalar</h3>
        <div class="alan-baslik">Araç</div>
        <div class="arac-sec" id="aracSec">${veri.araclar.map((a) => `
          <button type="button" data-arac="${a.kod}">${aracSimge(a.kod)}<b>${esc(a.ad)}</b><small>${String(a.yakit100).replace('.', ',')} lt / 100 km</small></button>`).join('')}
        </div>
        <label class="mazot-alan">Mazot (TL/lt)<input id="mazot" type="number" inputmode="decimal" step="any" value="${esc(d.mazot)}"></label>
        <p class="muted small" id="mazotNot"></p>
        <div class="alan-baslik">Kasalar</div>
        <div id="kalemler"></div>
        <button type="button" id="kalemEkle" class="kalem-ekle">+ Kasa ekle</button>
        <div id="aracCizim" class="arac-cizim-kutu"></div>
        <div class="doluluk"><div class="doluluk-cubuk"><span id="dolulukCubuk"></span></div><span id="dolulukYazi"></span></div>
        <div id="bosYer" class="bilgi-kutu" hidden></div>
      </section>

      <section class="card genis">
        <h3>3 · Fiyat ve kâr (kasa başı)</h3>
        <div id="hatalar"></div>
        <div class="tablo-kaydir"><table class="teklif-tablo" id="fiyatTablo"></table></div>
        <p class="muted small" id="seferNot"></p>
      </section>

      <section class="card genis">
        <h3>4 · Vadeli fiyatlar (aylık %${veri.param.vade_aylik * 100})</h3>
        <div class="tablo-kaydir"><table class="teklif-tablo" id="vadeTablo"></table></div>
        <div class="row">
          <label>Özel vade (gün)<input id="ozelGun" type="number" inputmode="numeric" value="${esc(d.ozelGun)}"></label>
          <label class="onay"><input type="checkbox" id="dbs"> DBS ile ödeme (−%${veri.param.dbs * 100})</label>
          <label class="onay"><input type="checkbox" id="gizle"> Teklifte sadece anlaşılan vade görünsün</label>
        </div>
        <p class="muted small">Anlaşılan vadeyi tablodaki başlığa ya da fiyata dokunarak seçin; teklif formunda yeşil görünür.</p>
        <div class="row">
          <label>Teklif veren<input id="teklifVeren" value="${esc(d.teklifVeren)}"></label>
          <div id="toplamlar" class="toplamlar"></div>
        </div>
        <button type="button" id="kaydet" class="primary">Kaydet ve teklif formunu aç</button>
      </section>
    </div>`;

  const el = (id) => document.getElementById(id);
  el('tip').value = d.musteri.tip;
  const aracGoster = () =>
    el('aracSec').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.arac === d.arac));
  aracGoster();
  el('dbs').checked = d.dbs;
  el('gizle').checked = d.digerVadeleriGizle;

  // ---------- müşteri
  const turGoster = () => {
    document.querySelectorAll('#musteriTur button').forEach((b) => b.classList.toggle('on', b.dataset.tur === d.musteri.tur));
    el('cariAlan').hidden = d.musteri.tur !== 'cari';
    el('tekAlan').hidden = d.musteri.tur !== 'tek';
    el('konumKaydet').hidden = true;
  };
  el('musteriTur').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    d.musteri.tur = b.dataset.tur;
    turGoster();
  };
  turGoster();
  const cariYaz = (c) => {
    el('cariBilgi').textContent = c ? [c.unvan, c.adres, [c.ilce, c.il].filter(Boolean).join(' / ')].filter(Boolean).join(' · ') : '';
  };
  cariYaz(ref.cariler.find((c) => c.kod === d.musteri.cariKod));
  secici(el('cari'), {
    kaynak: () => ref.cariler,
    ad: 'unvan',
    onSec: async (c) => {
      d.musteri.cariKod = c.kod;
      d.musteri.unvan = c.unvan || c.kod;
      d.musteri.adres = [c.adres, c.ilce, c.il].filter(Boolean).join(', ');
      cariYaz(c);
      // Vergi no 11 haneyse TCKN: şahıs (KDV'siz)
      if (c.vergiNo) {
        d.musteri.tip = c.vergiNo.length === 11 ? 'sahis' : 'tuzel';
        el('tip').value = d.musteri.tip;
      }
      el('haritaNot').textContent = 'Adres haritada aranıyor…';
      try {
        const k = await api(`/api/teklif/konum?cari=${encodeURIComponent(c.kod)}`);
        await konumAyarla(k.enlem, k.boylam);
        el('haritaNot').textContent = k.kaynak === 'elle'
          ? 'Bu cari için daha önce elle seçilmiş konum. Pini sürükleyerek değiştirebilirsiniz.'
          : 'Konum carinin adresinden bulundu. Yanlışsa pini sürükleyin.';
      } catch {
        // Panelin Netsis kopyasında olmayan cari (ör. Excel'den yüklendi): adresinden, olmazsa ilçe/il'den ara
        const denemeler = [[c.adres, c.ilce, c.il], [c.ilce, c.il]].map((p) => p.filter(Boolean).join(', ')).filter(Boolean);
        for (const q of denemeler) {
          try {
            const k = await api(`/api/teklif/ara?q=${encodeURIComponent(q)}`);
            await konumAyarla(k.enlem, k.boylam, { kaydedilebilir: true });
            el('haritaNot').textContent = `Konum adresten bulundu (${k.ad}). Yanlışsa pini sürükleyin ya da listeden seçin.`;
            return;
          } catch {
            // sıradaki denemeye geç
          }
        }
        el('haritaNot').textContent = 'Carinin adresi haritada bulunamadı. Teslim yerini listeden seçin ya da haritaya dokunun.';
      }
    },
  });
  el('adresBul').onclick = async () => {
    const q = el('aramaAdres').value.trim();
    if (!q) return toast('Yer adı yazın: köy, ilçe, il');
    try {
      const k = await api(`/api/teklif/ara?q=${encodeURIComponent(q)}`);
      await konumAyarla(k.enlem, k.boylam, { kaydedilebilir: true });
      el('haritaNot').textContent = `Bulunan: ${k.ad}. Yanlışsa pini sürükleyin.`;
    } catch (e) {
      toast(`${e.message}: listeden seçin ya da haritada teslim yerine dokunun`);
    }
  };
  el('aramaAdres').addEventListener('keydown', (e) => e.key === 'Enter' && el('adresBul').click());

  // ---------- il / ilçe / köy listesi (koordinatı doğrulanmış yerler; aynı adlı köyler ilçeyle ayrılır)
  let yerler = [];
  const tr = (a, b) => a.localeCompare(b, 'tr');
  const secenek = (liste, bos) =>
    `<option value="">${bos}</option>${liste.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}`;
  api('/api/teklif/yerler')
    .then((l) => {
      yerler = l;
      el('yerIl').innerHTML = secenek([...new Set(l.map((y) => y.il))].sort(tr), 'İl seçin');
    })
    .catch(() => (el('yerIl').innerHTML = '<option value="">Liste alınamadı</option>'));
  el('yerIl').onchange = () => {
    const il = el('yerIl').value;
    el('yerIlce').innerHTML = secenek([...new Set(yerler.filter((y) => y.il === il).map((y) => y.ilce))].sort(tr), 'İlçe seçin');
    el('yerIlce').disabled = !il;
    el('yerAd').innerHTML = '<option value="">—</option>';
    el('yerAd').disabled = true;
  };
  el('yerIlce').onchange = () => {
    const il = el('yerIl').value, ilce = el('yerIlce').value;
    const ilcedekiler = yerler.filter((y) => y.il === il && y.ilce === ilce);
    el('yerAd').innerHTML = `<option value="">İlçe merkezi</option>${ilcedekiler.filter((y) => y.tur !== 'ilce_merkezi')
      .sort((a, b) => tr(a.yer, b.yer)).map((y) => `<option value="${esc(y.yer)}">${esc(y.yer)}</option>`).join('')}`;
    el('yerAd').disabled = !ilce;
    if (ilce) yerSec();
  };
  el('yerAd').onchange = yerSec;
  function yerSec() {
    const il = el('yerIl').value, ilce = el('yerIlce').value, ad = el('yerAd').value;
    const y = yerler.find((x) => x.il === il && x.ilce === ilce && (ad ? x.yer === ad : x.tur === 'ilce_merkezi'))
      || yerler.find((x) => x.il === il && x.ilce === ilce);
    if (!y) return;
    if (d.musteri.tur === 'tek' && !el('tekAdres').value.trim()) el('tekAdres').value = [ad, ilce, il].filter(Boolean).join(', ');
    konumAyarla(y.enlem, y.boylam, { kaydedilebilir: true });
    el('haritaNot').textContent = `${[ad || `${ilce} merkezi`, ilce, il].join(' / ')} seçildi. Gerekirse pini sürükleyin.`;
  }

  // ---------- harita
  let harita, pin;
  try {
    const L = await haritaYukle();
    if (!onRoute('teklif')) return;
    harita = L.map('harita').setView(d.konum || veri.fabrika, d.konum ? 10 : 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '© OpenStreetMap',
    }).addTo(harita);
    L.circleMarker(veri.fabrika, { radius: 7, color: '#3A9A48', fillOpacity: 1 }).addTo(harita).bindTooltip('Fabrika');
    pin = L.marker(d.konum || veri.fabrika, { draggable: true, opacity: d.konum ? 1 : 0 }).addTo(harita);
    const elle = { kaydedilebilir: true, ortala: false };
    pin.on('dragend', () => konumAyarla(pin.getLatLng().lat, pin.getLatLng().lng, elle));
    harita.on('click', (e) => konumAyarla(e.latlng.lat, e.latlng.lng, elle));
  } catch {
    el('harita').hidden = true;
    el('haritaNot').textContent = 'Harita yüklenemedi (internet yok). Gidiş km\'sini elle yazın.';
  }

  // kaydedilebilir: satışçı konumu kendisi seçti (liste, arama, pin) -> cari için kaydetme düğmesi çıkar
  async function konumAyarla(enlem, boylam, { kaydedilebilir = false, ortala = true } = {}) {
    d.konum = [enlem, boylam];
    if (pin) {
      pin.setLatLng(d.konum).setOpacity(1);
      if (ortala) harita.setView(d.konum, 11);
    }
    el('konumKaydet').hidden = !(kaydedilebilir && d.musteri.tur === 'cari' && d.musteri.cariKod);
    try {
      const m = await api(`/api/teklif/mesafe?enlem=${enlem}&boylam=${boylam}`);
      d.km = m.km;
      d.dk = m.dk;
      el('km').value = m.km;
      el('dk').value = `${m.dk} dk`;
      yenile();
    } catch (e) {
      toast(`Yol mesafesi hesaplanamadı: ${e.message}`);
    }
  }
  el('konumKaydet').onclick = async () => {
    try {
      await api('/api/teklif/konum', { cari: d.musteri.cariKod, enlem: d.konum[0], boylam: d.konum[1] });
      el('konumKaydet').hidden = true;
      toast('Konum bu cari için kaydedildi');
    } catch (e) {
      toast(e.message);
    }
  };

  // ---------- mazot
  const mazotGetir = async () => {
    try {
      const m = await api(`/api/mazot?il=${encodeURIComponent(d.mazotIl)}`);
      if (!d.mazot) {
        d.mazot = m.fiyat;
        el('mazot').value = m.fiyat;
      }
      el('mazotNot').textContent = `Petrol Ofisi ${m.il} ${m.tarih.split('-').reverse().join('.')}: ${m.po_fiyat.toFixed(2)} + ${m.ek.toFixed(2)} = ${m.fiyat.toFixed(2)} TL`
        + (m.eski ? ' (bugünkü fiyat alınamadı, son bilinen)' : '');
      yenile();
    } catch (e) {
      el('mazotNot').textContent = `Mazot fiyatı alınamadı: ${e.message}. Elle yazın.`;
    }
  };

  // ---------- kalemler
  const kasaSecenek = veri.kasalar.map((k) => `<option value="${k.kod}">${esc(k.ad)}</option>`).join('');
  const kalemCiz = () => {
    el('kalemler').innerHTML = d.kalemler.map((k, i) => `
      <div class="kalem" data-i="${i}">
        <div class="kalem-ust">
          <span class="kalem-no">${i + 1}</span>
          <select data-a="kasa" aria-label="Kasa">${kasaSecenek}</select>
          <button type="button" class="kalem-sil" data-sil aria-label="Kasayı sil">✕</button>
        </div>
        <div class="kalem-alt">
          <label>Adet<input data-a="adet" type="number" inputmode="numeric" min="0" value="${esc(k.adet)}"></label>
          <label>Peşin fiyat (₺)<input data-a="fiyat" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(k.fiyat)}" placeholder="boşsa dip fiyat"></label>
        </div>
        <div class="kalem-bilgi muted small" data-bilgi></div>
      </div>`).join('');
    el('kalemler').querySelectorAll('.kalem').forEach((satir) => {
      satir.querySelector('[data-a="kasa"]').value = d.kalemler[satir.dataset.i].kasa;
    });
  };
  el('kalemler').addEventListener('input', (e) => {
    const satir = e.target.closest('.kalem');
    if (!satir) return;
    d.kalemler[satir.dataset.i][e.target.dataset.a] = e.target.value;
    yenile();
  });
  el('kalemler').addEventListener('click', (e) => {
    const satir = e.target.closest('.kalem');
    if (!e.target.matches('[data-sil]') || !satir) return;
    d.kalemler.splice(Number(satir.dataset.i), 1);
    if (!d.kalemler.length) d.kalemler.push({ kasa: veri.kasalar[0].kod, adet: '', fiyat: '' });
    kalemCiz();
    yenile();
  });
  el('kalemEkle').onclick = () => {
    d.kalemler.push({ kasa: veri.kasalar[0].kod, adet: '', fiyat: '' });
    kalemCiz();
  };
  kalemCiz();

  for (const [id, alan] of [['km', 'km'], ['mazot', 'mazot'], ['ozelGun', 'ozelGun'], ['ilgili', null], ['teklifVeren', 'teklifVeren']]) {
    el(id).addEventListener('input', () => {
      if (alan) d[alan] = el(id).value;
      yenile();
    });
  }
  el('aracSec').onclick = (e) => {
    const b = e.target.closest('button[data-arac]');
    if (!b) return;
    d.arac = b.dataset.arac;
    ayarYaz({ teklifArac: d.arac });
    aracGoster();
    yenile();
  };
  el('tip').onchange = () => {
    d.musteri.tip = el('tip').value;
    yenile();
  };
  el('dbs').onchange = () => {
    d.dbs = el('dbs').checked;
    yenile();
  };
  el('gizle').onchange = () => (d.digerVadeleriGizle = el('gizle').checked);

  // ---------- sonuç
  function yenile() {
    sonuc = hesapla({ veri, km: d.km, mazot: d.mazot, arac: d.arac, kalemler: d.kalemler });
    const yuzde = Math.round(sonuc.doluluk * 100);
    el('aracCizim').innerHTML = aracCizim(d.arac, sonuc.doluluk);
    el('dolulukCubuk').style.width = `${Math.min(100, yuzde)}%`;
    el('dolulukCubuk').classList.toggle('asim', sonuc.doluluk > 1);
    el('dolulukYazi').textContent = sonuc.satirlar.length
      ? `Araç %${yuzde} dolu · ${sonuc.ton.toFixed(2)} ton${sonuc.seferSayisi > 1 ? ` · ${sonuc.seferSayisi} sefer` : ''}`
      : 'Kasa ve adet girin';
    const b = sonuc.bosYer;
    el('bosYer').hidden = !b;
    if (b) {
      el('bosYer').innerHTML = `
        <div class="bos-baslik">Araçta boş yer var</div>
        <div class="bos-satir"><span>Daha sığar</span><b>${b.adet.toLocaleString('tr-TR')} adet ${esc(b.kasa)}</b></div>
        <div class="bos-satir"><span>Müşteri bunu da alırsa ek kâr</span><b>+${tl(b.ekKar)}</b></div>
        <div class="bos-satir"><span>Şu anki toplam kâr</span><span>${tl(sonuc.toplamKar)}</span></div>
        <div class="bos-satir"><span>Araç dolu giderse toplam kâr</span><b>${tl(b.toplamKar)}</b></div>`;
    }
    el('hatalar').innerHTML = sonuc.hata.map((h) => `<p class="hata">${esc(h)}</p>`).join('');
    // Her kasanın altında: bu araçta kapasitesi, araçta kapladığı yer, dip fiyatı
    el('kalemler').querySelectorAll('.kalem').forEach((satir) => {
      const k = sonuc.satirlar.find((x) => x.sira === Number(satir.dataset.i));
      satir.querySelector('[data-bilgi]').textContent = k
        ? `Bu araca ${k.kapasite.toLocaleString('tr-TR')} adet sığar · araçta %${Math.round(k.doluluk * 100)} yer · dip fiyat ${tl(k.dip)}`
        : '';
    });

    const s = sonuc.satirlar;
    el('fiyatTablo').innerHTML = s.length ? `
      <thead><tr><th>Kasa</th><th>Adet</th><th>Maliyet</th><th>Nakliye payı</th><th>Dip fiyat</th><th>Peşin fiyat</th>
        <th>Kâr / kasa</th><th>Toplam kâr</th><th>Araç dolu giderse kâr / kasa</th><th>Dolu giderse aynı kârla fiyat</th></tr></thead>
      <tbody>${s.map((k) => `<tr class="${k.dipAlti ? 'dip-alti' : ''}">
        <td>${esc(k.kasa)}</td><td>${k.adet.toLocaleString('tr-TR')}</td><td>${tl(k.maliyet)}</td><td>${tl(k.nakliye)}</td>
        <td>${tl(k.dip)}</td><td><b>${tl(k.fiyat)}</b></td><td>${tl(k.kar)}</td><td>${tl(k.toplamKar, 0)}</td>
        <td class="iyi">${tl(k.doluKar)}</td><td class="iyi">${tl(k.ayniKarlaFiyat)}</td></tr>`).join('')}</tbody>` : '';
    el('seferNot').textContent = s.length
      ? `Sefer maliyeti ${tl(sonuc.sefer, 0)} (yakıt ${tl(sonuc.yakit, 0)} + harcırah ${tl(sonuc.harcirah, 0)} + işgaliye ${tl(sonuc.isgaliye, 0)})`
        + ` · toplam kâr ${tl(sonuc.toplamKar, 0)}`
      : '';

    const vadeler = [...VADELER, ...(Number(d.ozelGun) > 0 ? [{ kod: 'ozel', ad: `${d.ozelGun} gün vadeli`, gun: Number(d.ozelGun) }] : [])];
    const r = veri.param.vade_aylik;
    const dbs = d.dbs ? 1 - veri.param.dbs : 1;
    const fiyat = (k, v) => (v.gun == null ? k.fiyat : k.fiyat * (1 + 0.5 * r + (v.gun * r) / 30)) * dbs;
    if (!vadeler.some((v) => v.kod === d.vade)) d.vade = '30';
    el('vadeTablo').innerHTML = s.length ? `
      <thead><tr><th>Kasa</th>${vadeler.map((v) => `<th data-vade="${v.kod}" class="${v.kod === d.vade ? 'secili' : ''}">${esc(v.ad)}</th>`).join('')}</tr></thead>
      <tbody>${s.map((k) => `<tr><td>${esc(k.kasa)}</td>${vadeler.map((v) => `<td data-vade="${v.kod}" class="${v.kod === d.vade ? 'secili' : ''}">${tl(fiyat(k, v))}</td>`).join('')}</tr>`).join('')}</tbody>` : '';
    const sec = vadeler.find((v) => v.kod === d.vade);
    const ara = s.reduce((t, k) => t + fiyat(k, sec) * k.adet, 0);
    const kdv = d.musteri.tip === 'tuzel' ? ara * veri.param.kdv : 0;
    el('toplamlar').innerHTML = s.length
      ? `${esc(sec.ad)}: <b>${tl(ara)}</b>${kdv ? ` + KDV ${tl(kdv)} = <b>${tl(ara + kdv)}</b>` : ' (KDV\'siz)'}` : '';
    sonuc.vadeler = vadeler;
    sonuc.secilenTutar = ara;
    sonuc.kdv = kdv;
  }
  el('vadeTablo').addEventListener('click', (e) => {
    // Başlığa da, o sütundaki fiyata da basınca vade seçilir
    const hucre = e.target.closest('[data-vade]');
    if (!hucre) return;
    d.vade = hucre.dataset.vade;
    yenile();
  });

  // ---------- kaydet
  el('kaydet').onclick = async () => {
    d.musteri.ilgili = el('ilgili').value.trim();
    if (d.musteri.tur === 'tek') {
      d.musteri.cariKod = '';
      d.musteri.unvan = el('tekUnvan').value.trim();
      d.musteri.telefon = el('tekTel').value.trim();
      d.musteri.adres = el('tekAdres').value.trim();
    }
    d.teklifVeren = el('teklifVeren').value.trim();
    if (!d.musteri.unvan) return toast('Müşteri seçin ya da adını yazın');
    if (!sonuc?.satirlar.length) return toast('Kasa ve adet girin');
    if (!(Number(d.km) >= 0) || d.km === '') return toast('Gidiş km\'si gerekli: haritadan seçin ya da yazın');
    if (sonuc.satirlar.some((k) => k.dipAlti)) return toast('Dip fiyatın altında kalem var: teklif çıkmaz');
    ayarYaz({ teklifVeren: d.teklifVeren, mazotIl: d.mazotIl });
    try {
      const { no } = await api('/api/teklif', {
        no: kayitli?.no,
        musteri: d.musteri,
        girdi: d,
        sonuc: {
          satirlar: sonuc.satirlar.map(({ kasaB, ...k }) => ({ ...k, ad: kasaB.ad })),
          vadeler: sonuc.vadeler, vade: d.vade, doluluk: sonuc.doluluk, ton: sonuc.ton,
          aracAd: veri.araclar.find((a) => a.kod === d.arac)?.ad, km: d.km,
          toplamPesin: sonuc.toplamPesin, secilenTutar: sonuc.secilenTutar, kdv: sonuc.kdv, dbs: d.dbs,
        },
        param: { odeme_kosulu: veri.param.odeme_kosulu, vade_aylik: veri.param.vade_aylik },
      });
      toast(`Teklif ${no} kaydedildi`);
      location.hash = `#teklifyaz/${encodeURIComponent(no)}`;
    } catch (e) {
      toast(`Kaydedilemedi: ${e.message}`);
    }
  };

  yenile();
  mazotGetir();
}

async function liste() {
  $view.innerHTML = '<p class="muted">Yükleniyor…</p>';
  let l;
  try {
    l = await api('/api/teklif');
  } catch (e) {
    $view.innerHTML = `<div class="card"><p>Panele ulaşılamadı: ${esc(e.message)}</p></div>`;
    return;
  }
  if (!onRoute('teklif')) return;
  $view.innerHTML = `
    <div class="teklif-ust"><h2>Kayıtlı teklifler</h2><a href="#teklif" class="small">+ Yeni teklif</a></div>
    <section class="card son-teklifler" id="sonTeklifler"></section>
    <h3>Bütün teklifler</h3>
    ${l.length ? l.map((t) => `
      <div class="card teklif-satir">
        <b>${esc(t.musteri)}</b><span class="muted">${esc(t.no)} · ${t.tarih.split('-').reverse().join('.')}${t.olusturan ? ` · ${esc(t.olusturan)}` : ''}</span>
        <span>${t.toplam != null ? `Peşin ${tl(t.toplam)}` : ''}</span>
        <span class="small"><a href="#teklif/${encodeURIComponent(t.no)}">Düzenle</a> · <a href="#teklifyaz/${encodeURIComponent(t.no)}">Formu aç</a></span>
      </div>`).join('') : '<p class="muted">Henüz teklif yok.</p>'}`;
  sonTekliflerCiz(document.getElementById('sonTeklifler'), toast);
}
