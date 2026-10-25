/* ================================================================
   OUTILS COMMUNS
   ================================================================ */
function $(id) { return document.getElementById(id); }
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function lsGet(k, def) { try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

var RE_CODE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
var RE_USER = /^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/;
var RE_TEL = /^\+?[0-9 ]{8,20}$/;
var RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function mdpProbleme(pw) {
  if (!pw || pw.length < 8) return 'Au moins 8 caractères.';
  if (pw.length > 72) return '72 caractères au maximum.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Mélangez des lettres et des chiffres.';
  return null;
}
function genMdp() {
  var lettres = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', chiffres = '23456789', tout = lettres + chiffres;
  var b = new Uint8Array(10); crypto.getRandomValues(b);
  var c = Array.prototype.map.call(b, function (x) { return tout[x % tout.length]; });
  c[0] = lettres[b[0] % lettres.length]; c[9] = chiffres[b[9] % chiffres.length];
  return c.join('');
}
function slug(t, max) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max || 30).replace(/-+$/, '');
}
// Adresse de connexion interne. La version change à chaque remise d'accès.
function emailConnexion(username, code, v) {
  return String(username).toLowerCase() + (v && v > 1 ? '+v' + v : '') + '@' + String(code).toLowerCase() + '.' + LOGES.domaineConnexion;
}
function anneesProposees() {
  var d = new Date(), y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return [y - 1, y, y + 1].map(function (a) { return a + '-' + (a + 1); });
}
function anneeCourante() { return anneesProposees()[1]; }

/* ---- Dates et montants ---- */
function ddmmyyyy(d, fmt) {
  if (!(d instanceof Date) || isNaN(d)) return '—';
  var j = String(d.getDate()).padStart(2, '0'), m = String(d.getMonth() + 1).padStart(2, '0'), a = d.getFullYear();
  if (fmt === 'AAAA-MM-JJ') return a + '-' + m + '-' + j;
  if (fmt === 'JJ-MM-AAAA') return j + '-' + m + '-' + a;
  return j + '/' + m + '/' + a;
}
function fmtDate(v, fmt) {
  if (v == null || v === '') return '—';
  var d = typeof v === 'number' ? new Date(v) : new Date(String(v).length === 10 ? v + 'T00:00:00' : v);
  return ddmmyyyy(d, fmt);
}
function fmtDateHeure(ms, fmt) {
  if (!ms) return '—';
  var d = new Date(ms);
  return ddmmyyyy(d, fmt) + ' à ' + String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');
}
function fmtMontant(n, devise) {
  if (n == null || isNaN(n)) return '—';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + (devise || 'GNF');
}
function joursRestants(exp, maintenant) {
  return Math.ceil(((exp || 0) - (maintenant || Date.now())) / 86400000);
}
function relatif(ms) {
  if (!ms) return 'jamais';
  var s = (Date.now() - ms) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
  if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
  var j = Math.floor(s / 86400); return j === 1 ? 'hier' : 'il y a ' + j + ' jours';
}
function ajouterMois(ms, mois) {
  var d = new Date(ms); var jour = d.getDate();
  d.setMonth(d.getMonth() + mois);
  if (d.getDate() < jour) d.setDate(0);
  return d.getTime();
}

/* ---- Images : réduites avant envoi (évite les logos de plusieurs Mo) ---- */
function redimImage(fichier, max, qualite) {
  return new Promise(function (ok, ko) {
    if (!fichier || !/^image\/(png|jpeg|webp)$/.test(fichier.type)) return ko(new Error('Format accepté : PNG, JPEG ou WebP.'));
    if (fichier.size > 12 * 1024 * 1024) return ko(new Error('Image trop lourde (12 Mo maximum).'));
    var url = URL.createObjectURL(fichier), img = new Image();
    img.onload = function () {
      var r = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
      var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      var out = c.toDataURL('image/jpeg', qualite || 0.85);
      if (out.length > 380000) out = c.toDataURL('image/jpeg', 0.6);
      if (out.length > 380000) return ko(new Error('Image trop détaillée : choisissez une image plus simple.'));
      ok(out);
    };
    img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Image illisible.')); };
    img.src = url;
  });
}

/* ---- Notifications et fenêtres ---- */
function toast(msg, type) {
  var t = document.createElement('div');
  t.className = 'toast ' + (type || ''); t.textContent = msg; t.setAttribute('role', type === 'ko' ? 'alert' : 'status');
  $('toasts').appendChild(t);
  setTimeout(function () { t.remove(); }, type === 'ko' ? 6500 : 3800);
}

// Fenêtre : { titre, corps (html), boutons: [{ txt, cls, action(fermer) }], large, auOuverture(racine) }
function modal(o) {
  var racine = document.createElement('div');
  racine.className = 'voile-modal claire';
  racine.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(o.titre) + '"' + (o.large ? ' style="max-width:760px"' : '') + '>' +
    '<div class="mt"><h3>' + esc(o.titre) + '</h3><button type="button" aria-label="Fermer la fenêtre">×</button></div>' +
    '<div class="mc">' + (o.corps || '') + '</div>' +
    (o.boutons && o.boutons.length ? '<div class="mp"></div>' : '') + '</div>';
  var precedent = document.activeElement;
  function fermer() { racine.remove(); document.removeEventListener('keydown', clavier); if (precedent && precedent.focus) precedent.focus(); }
  function clavier(e) { if (e.key === 'Escape') fermer(); }
  racine.querySelector('.mt button').onclick = fermer;
  racine.addEventListener('mousedown', function (e) { if (e.target === racine) fermer(); });
  document.addEventListener('keydown', clavier);
  if (o.boutons) {
    var pied = racine.querySelector('.mp');
    o.boutons.forEach(function (b) {
      var bt = document.createElement('button');
      bt.type = 'button'; bt.className = 'bt ' + (b.cls || 's'); bt.textContent = b.txt;
      bt.onclick = function () { if (b.action) b.action(fermer, bt); else fermer(); };
      pied.appendChild(bt);
    });
  }
  $('modal-racine').appendChild(racine);
  var premier = racine.querySelector('.mc input, .mc select, .mc textarea') || racine.querySelector('.mp .bt.p') || racine.querySelector('.mt button');
  if (premier) premier.focus();
  if (o.auOuverture) o.auOuverture(racine, fermer);
  return fermer;
}
function confirmer(titre, texte, txtOk, danger) {
  return new Promise(function (ok) {
    modal({ titre: titre, corps: '<p style="line-height:1.6">' + texte + '</p>', boutons: [
      { txt: 'Annuler', cls: 's', action: function (f) { f(); ok(false); } },
      { txt: txtOk || 'Confirmer', cls: danger ? 'd' : 'p', action: function (f) { f(); ok(true); } }
    ] });
  });
}
// Bouton occupé pendant une opération
function occupe(bt, actif, texte) {
  if (!bt) return;
  if (actif) { bt.dataset.txt = bt.textContent; bt.disabled = true; bt.textContent = texte || 'Patientez…'; }
  else { bt.disabled = false; if (bt.dataset.txt) bt.textContent = bt.dataset.txt; }
}
// Place le curseur dans un champ, sauf si la personne a déjà commencé à saisir ailleurs
function focusSiLibre(id) {
  setTimeout(function () {
    var a = document.activeElement;
    if (a && a !== document.body && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    var el = $(id); if (el && el.offsetParent !== null) el.focus();
  }, 50);
}
// Initiales d'une école : « École primaire Les Bâtisseurs » → « PB »
function initialesEcole(nom) {
  var mots = String(nom || '').replace(/^(école|ecole|groupe scolaire|complexe scolaire|g\.?s\.?)\s+/i, '').split(/[\s'’-]+/)
    .filter(function (m) { return m && !/^(de|du|des|la|le|les|l|d|et|en)$/i.test(m); });
  return (mots.length ? mots.slice(0, 2).map(function (m) { return m.charAt(0); }).join('') : 'É').toUpperCase();
}
function lienWa(tel, texte) {
  var t = String(tel || '').replace(/[^0-9]/g, '');
  if (t.length === 9) t = '224' + t;
  return 'https://wa.me/' + t + (texte ? '?text=' + encodeURIComponent(texte) : '');
}
function copier(texte) {
  try { navigator.clipboard.writeText(texte); toast('Copié.', 'ok'); } catch (e) { toast('Copie impossible sur cet appareil.', 'ko'); }
}

/* ---- Découpage administratif (suggestions modifiables, saisie libre) ---- */
var REGIONS = {
  'Boké': ['Boffa', 'Boké', 'Fria', 'Gaoual', 'Koundara'],
  'Conakry': ['Conakry'],
  'Faranah': ['Dabola', 'Dinguiraye', 'Faranah', 'Kissidougou'],
  'Kankan': ['Kankan', 'Kérouané', 'Kouroussa', 'Mandiana', 'Siguiri'],
  'Kindia': ['Coyah', 'Dubréka', 'Forécariah', 'Kindia', 'Télimélé'],
  'Labé': ['Koubia', 'Labé', 'Lélouma', 'Mali', 'Tougué'],
  'Mamou': ['Dalaba', 'Mamou', 'Pita'],
  'Nzérékoré': ['Beyla', 'Guéckédou', 'Lola', 'Macenta', 'Nzérékoré', 'Yomou']
};
var MOYENS = { orange_money: 'Orange Money', mobile_money: 'Mobile Money (MTN)', especes: 'Espèces', virement: 'Virement bancaire', autre: 'Autre' };
var ROLES = { fondation: 'Fondation', direction: 'Direction', comptabilite: 'Comptabilité' };
