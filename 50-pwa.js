/* ================================================================
   APPLICATION INSTALLABLE, RÉSEAU, DÉMARRAGE
   ================================================================ */
var Pwa = (function () {
  'use strict';
  var differe = null, deja = false;
  function autonome() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }

  function installer() {
    if (!differe) return;
    differe.prompt();
    differe.userChoice.then(function () { differe = null; $('bandeau-install').classList.remove('on'); $('btn-installer-acc').style.display = 'none'; });
  }
  function proposerApresConnexion() {
    if (deja || autonome() || (lsGet('loges_install_plus_tard', 0) > Date.now())) return;
    deja = true;
    setTimeout(function () {
      if (differe) { $('bandeau-install-txt').textContent = 'Ouverture plus rapide, en plein écran, comme une application.'; $('btn-installer').style.display = ''; $('bandeau-install').classList.add('on'); }
      else if (ios()) { $('bandeau-install-txt').textContent = "Sur iPhone ou iPad : touchez Partager (carré avec une flèche) puis « Sur l'écran d'accueil »."; $('btn-installer').style.display = 'none'; $('bandeau-install').classList.add('on'); }
    }, 2500);
  }
  function serviceWorker() {
    if (!('serviceWorker' in navigator) || Fb.simulation || location.protocol === 'file:') return;
    var recharge = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (recharge) return; recharge = true; location.reload(); });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      setInterval(function () { reg.update().catch(function () {}); }, 3600000);
      function proposer(w) {
        if (!w || !navigator.serviceWorker.controller) return;
        var t = document.createElement('div'); t.className = 'toast';
        t.innerHTML = 'Nouvelle version de LOGES disponible. <button style="margin-left:8px;background:#fff;color:#0f172a;border:none;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer">Mettre à jour</button>';
        t.querySelector('button').onclick = function () { w.postMessage('SKIP_WAITING'); };
        $('toasts').appendChild(t);
      }
      if (reg.waiting) proposer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        w && w.addEventListener('statechange', function () { if (w.state === 'installed') proposer(w); });
      });
    }).catch(function () { /* hébergement sans HTTPS ou fichier absent */ });
  }
  function reseau() {
    var minuterie = null;
    function maj() {
      clearTimeout(minuterie);
      var hors = !FE.estConnecte();
      minuterie = setTimeout(function () { $('bandeau-reseau').classList.toggle('on', hors); }, hors ? 2500 : 0);
    }
    window.addEventListener('online', maj); window.addEventListener('offline', maj);
    FE.surConnexion(maj);
  }
  function init() {
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); differe = e; $('btn-installer-acc').style.display = ''; });
    window.addEventListener('appinstalled', function () { differe = null; $('bandeau-install').classList.remove('on'); $('btn-installer-acc').style.display = 'none'; });
    $('btn-installer').onclick = installer;
    $('btn-installer-acc').onclick = installer;
    $('btn-installer-non').onclick = function () { $('bandeau-install').classList.remove('on'); lsSet('loges_install_plus_tard', Date.now() + 7 * 86400000); };
    serviceWorker();
    reseau();
  }
  return { init: init, proposerApresConnexion: proposerApresConnexion };
})();

document.addEventListener('DOMContentLoaded', function () {
  initAuth();
  Ecole.init();
  Pwa.init();
  var params = new URLSearchParams(location.search);
  var codeDirect = (params.get('ecole') || '').toLowerCase();
  // Une session existe peut-être sur cet appareil : écran d'attente au lieu de l'accueil
  var indice = ecolesMemo().length > 0;
  if (indice) {
    montrer('ecran-plein');
    $('plein').innerHTML = '<div style="text-align:center;padding:80px 0;color:#475569"><img src="' + LOGES.embleme + '" alt="" style="width:72px;height:72px;border-radius:16px;background:#fff"><p style="margin-top:14px">Ouverture de LOGES…</p></div>';
  } else rendreAccueil();
  Ecole.reprendre().then(function (ok) {
    if (ok) return;
    if (RE_CODE.test(codeDirect)) ouvrirConnexion(codeDirect);
    else rendreAccueil();
  });
});
