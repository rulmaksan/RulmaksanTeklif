// Yayın sürümü (GitHub Pages): panel yok. Ekranların panele attığı istekler (yerel:/api/...) burada, tarayıcının
// içinde karşılanır; ekran kodu ana uygulamayla birebir aynı kalır.
//   kasa/araç tabloları, yer listesi, mazot fiyatı -> yayın anında dosyaya yazılmış hali (veri/*.json)
//   adres arama -> OpenStreetMap Nominatim · yol mesafesi -> OSRM (doğrudan tarayıcıdan)
//   teklifler, carinin elle seçilen konumu -> bu tarayıcının localStorage'ı (başka yere gitmez)

const json = (v, durum = 200) =>
  new Response(JSON.stringify(v), { status: durum, headers: { 'Content-Type': 'application/json' } });
const oku = (k, v) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? v;
  } catch {
    return v;
  }
};
const yaz = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const statik = {};
const dosya = async (ad) => (statik[ad] ??= await (await gercekFetch(`veri/${ad}.json`)).json());

const gercekFetch = window.fetch.bind(window);

async function nominatim(q) {
  const u = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: `${q}, Türkiye`, format: 'jsonv2', limit: 1, countrycodes: 'tr', 'accept-language': 'tr',
  })}`;
  const s = await (await gercekFetch(u)).json();
  return s[0] ? { enlem: Number(s[0].lat), boylam: Number(s[0].lon), ad: s[0].display_name } : null;
}

async function cevapla(yol, istek) {
  const u = new URL(yol, 'http://x');
  const p = u.pathname;
  const q = (k) => u.searchParams.get(k);
  const govde = istek?.body ? JSON.parse(istek.body) : null;

  if (p === '/api/teklif/veriler') return json(await dosya('teklif_veriler'));
  if (p === '/api/teklif/yerler') return json(await dosya('yerler'));
  if (p === '/api/mazot') return json(await dosya('mazot'));

  if (p === '/api/teklif/konum') {
    const konumlar = oku('cari-konum', {});
    if (govde) {
      konumlar[govde.cari] = { enlem: govde.enlem, boylam: govde.boylam, kaynak: 'elle' };
      yaz('cari-konum', konumlar);
      return json({ tamam: true });
    }
    // Kayıtlı konum yoksa 404: ekran carinin adresiyle arar
    return konumlar[q('cari')] ? json(konumlar[q('cari')]) : json({ hata: 'Kayıtlı konum yok' }, 404);
  }
  if (p === '/api/teklif/ara') {
    const b = await nominatim(q('q') || '');
    return b ? json(b) : json({ hata: 'Bulunamadı' }, 404);
  }
  if (p === '/api/teklif/mesafe') {
    const f = (await dosya('teklif_veriler')).fabrika;
    const s = await (await gercekFetch(
      `https://router.project-osrm.org/route/v1/driving/${f[1]},${f[0]};${q('boylam')},${q('enlem')}?overview=false`)).json();
    if (s.code !== 'Ok' || !s.routes?.length) return json({ hata: 'Yol bulunamadı' }, 503);
    return json({ km: Math.round(s.routes[0].distance / 100) / 10, dk: Math.round(s.routes[0].duration / 60) });
  }

  if (p === '/api/teklif') {
    const teklifler = oku('teklifler', {});
    if (govde) {
      const musteri = govde.musteri?.unvan?.trim();
      if (!musteri) return json({ hata: 'Müşteri adı gerekli' }, 400);
      if (!govde.sonuc?.satirlar?.length) return json({ hata: 'En az bir kalem gerekli' }, 400);
      let no = govde.no;
      if (!no) {
        const d = new Date();
        const gun = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        const sira = Object.keys(teklifler).filter((n) => n.startsWith(`T_${gun}_`)).length + 1;
        no = `T_${gun}_${String(sira).padStart(3, '0')}`;
        govde.no = no;
      }
      teklifler[no] = { ...govde, tarih: new Date().toISOString().slice(0, 10), olusturma: new Date().toISOString() };
      yaz('teklifler', teklifler);
      return json({ no });
    }
    return json(Object.values(teklifler)
      .sort((a, b) => b.olusturma.localeCompare(a.olusturma))
      .map((t) => ({ no: t.no, tarih: t.tarih, musteri: t.musteri.unvan, toplam: t.sonuc?.toplamPesin ?? null })));
  }
  const tek = p.match(/^\/api\/teklif\/([^/]+)$/);
  if (tek) {
    const t = oku('teklifler', {})[decodeURIComponent(tek[1])];
    return t ? json(t) : json({ hata: 'Teklif bulunamadı' }, 404);
  }
  return json({ hata: `Yayın sürümünde yok: ${p}` }, 404);
}

window.fetch = (girdi, istek) => {
  const url = typeof girdi === 'string' ? girdi : girdi.url;
  if (url.startsWith('yerel:')) return cevapla(url.slice('yerel:'.length), istek);
  return gercekFetch(girdi, istek);
};
