// Yayın sürümünün ortak yardımcıları: ana uygulamadaki ortak.js'in teklif ekranlarının kullandığı kısmı.
// Panel adresi "yerel:" -> istekleri js/yerel_api.js tarayıcının içinde karşılar.
export const $view = document.getElementById('view');
const okuCariler = () => {
  try {
    return JSON.parse(localStorage.getItem('cariler')) || [];
  } catch {
    return [];
  }
};
export const ref = { stoklar: [], cariler: okuCariler(), depolar: [] };
export const yenileCariler = () => (ref.cariler = okuCariler());

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}

export const onRoute = (n) => (location.hash.slice(1) || 'teklif').split('/')[0] === n;
export const panelAdresi = () => 'yerel:';

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}
