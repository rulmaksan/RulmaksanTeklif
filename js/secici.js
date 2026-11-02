// Aranabilir seçici: kutuya kod ya da adın bir parçası yazılınca altında liste açılır.
//   Ok tuşları: listede gez   Enter / Tab: vurgulananı seç   Esc: kapat   Dokunma: seç
// Seçince kutuya kod yazılır; onSec(kayit) çağrılır. Liste en fazla `sinir` satır gösterir.
// Küçük harfe çevirip Türkçe harfleri sadeleştirir: "granul" yazan "GRANÜL"ü, "sise" yazan "ŞİŞE"yi bulur
const SADE = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export const kucuk = (s) => String(s ?? '').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => SADE[c]);
let sayac = 0;

export function secici(input, { kaynak, ad, sinir = 30, onSec = () => {} }) {
  const kutu = document.createElement('div');
  kutu.className = 'secici';
  input.replaceWith(kutu);
  kutu.appendChild(input);
  const liste = document.createElement('ul');
  liste.className = 'secici-liste';
  liste.id = `secici-${++sayac}`;
  liste.setAttribute('role', 'listbox');
  liste.hidden = true;
  kutu.appendChild(liste);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', liste.id);
  input.setAttribute('aria-expanded', 'false');

  let sonuclar = [];
  let secili = -1;

  const vurgula = (i) => {
    secili = i;
    [...liste.children].forEach((li, n) => li.setAttribute('aria-selected', n === i));
    const li = liste.children[i];
    if (li) {
      li.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', li.id);
    } else input.removeAttribute('aria-activedescendant');
  };

  const kapat = () => {
    liste.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    secili = -1;
  };

  const ac = () => {
    const q = kucuk(input.value.trim());
    const hepsi = kaynak();
    sonuclar = (q ? hepsi.filter((r) => kucuk(r.kod).includes(q) || kucuk(r[ad]).includes(q)) : hepsi).slice(0, sinir);
    if (!sonuclar.length) return kapat();
    liste.innerHTML = '';
    sonuclar.forEach((r, n) => {
      const li = document.createElement('li');
      li.id = `${liste.id}-${n}`;
      li.setAttribute('role', 'option');
      const b = document.createElement('b');
      b.textContent = r.kod;
      const span = document.createElement('span');
      span.textContent = r[ad] ?? '';
      li.append(b, span);
      // pointerdown: kutu odağını kaybetmeden seç (blur'dan önce çalışır)
      li.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sec(n);
      });
      liste.appendChild(li);
    });
    liste.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    vurgula(q ? 0 : -1);
  };

  const sec = (n) => {
    const r = sonuclar[n];
    if (!r) return;
    input.value = r.kod;
    kapat();
    onSec(r);
  };

  input.addEventListener('input', ac);
  input.addEventListener('focus', () => input.select?.());
  input.addEventListener('blur', () => setTimeout(kapat, 0));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (liste.hidden) return ac();
      const yon = e.key === 'ArrowDown' ? 1 : -1;
      vurgula(Math.max(0, Math.min(sonuclar.length - 1, secili + yon)));
    } else if (e.key === 'Escape' && !liste.hidden) {
      e.preventDefault();
      kapat();
    } else if ((e.key === 'Enter' || e.key === 'Tab') && !liste.hidden && secili >= 0) {
      // Enter'ı engellemiyoruz: form onu "sonraki alana geç" olarak da işliyor
      sec(secili);
    }
  });
}
