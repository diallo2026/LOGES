/* ================================================================
   ESPACE CONCEPTEUR — même organisation que l'espace concepteur d'AGV :
   une seule fenêtre, quatre onglets (Écoles / Licences & paiements /
   Factures & WhatsApp / Sécurité). Ouverture : saisir @CONCEPTEUR dans
   le champ d'identifiant de l'école (accueil ou connexion).
   Différence avec AGV : le mot de passe n'est plus dans le code ; la
   connexion passe par Firebase Authentication et les règles de la base
   n'accordent ces droits qu'aux comptes inscrits dans loges_platform/admins.
   Le concepteur gère les licences ; il ne lit aucune donnée pédagogique ou
   financière des écoles.
   ================================================================ */
var Concepteur = (function () {
  'use strict';
  var FC = null, ADMIN = null, racine = null, onglet = 'ecoles', filtre = 'toutes', recherche = '', filtrePaie = 'en_attente';
  var D = { ecoles: lsGet('loges_conc_ecoles', []), paiements: {}, tarifs: {}, config: {}, factures: {} };
  var SIGNATURE = 'Concepteur LOGES';

  function maintenant() { return FC ? FC.maintenant() : Date.now(); }
  function etat(l) {
    if (!l) return { cle: 'expire', txt: 'Sans licence', jours: 0 };
    var j = joursRestants(l.expiration, maintenant());
    if (l.statut === 'bloque') return { cle: 'bloque', txt: 'Bloquée', jours: j };
    if (!(l.expiration > maintenant())) return { cle: 'expire', txt: 'Expirée', jours: j };
    return { cle: l.statut === 'essai' ? 'essai' : 'actif', txt: l.statut === 'essai' ? 'Essai' : 'Active', jours: j };
  }
  function devise() { return (D.config && D.config.devise) || 'GNF'; }

  /* ---------------- Fenêtre ---------------- */
  function fenetre(html, large) {
    fermerFenetre();
    racine = document.createElement('div');
    racine.className = 'cdb-ov';
    racine.innerHTML = '<div class="cdb-panel' + (large ? ' large' : '') + '" role="dialog" aria-modal="true" aria-label="Espace concepteur">' + html + '</div>';
    document.body.appendChild(racine);
    document.addEventListener('keydown', echap);
    return racine;
  }
  function echap(e) { if (e.key === 'Escape' && racine && !document.querySelector('.voile-modal')) fermerFenetre(); }
  function fermerFenetre() { if (racine) { racine.remove(); racine = null; } document.removeEventListener('keydown', echap); }
  function tete(sousTitre) {
    return '<div class="cdb-titre"><div class="gauche"><img src="' + LOGES.embleme + '" alt=""><div><div class="cdb-h">Espace concepteur — LOGES</div><div class="cdb-sub">' + esc(sousTitre || '') + '</div></div></div>' +
      '<div class="cdb-act">' + (ADMIN ? '<button class="cdb-btn" data-c="actualiser">Actualiser</button><button class="cdb-btn danger" data-c="deconnexion">Se déconnecter</button>' : '') + '<button class="cdb-btn" data-c="fermer">Fermer</button></div></div>';
  }
  function msg(id, texte, type) { var m = racine && racine.querySelector('#' + id); if (m) { m.className = 'msg' + (texte ? ' on ' + (type || 'ko') : ''); m.textContent = texte || ''; } }

  /* ---------------- Connexion ---------------- */
  function ouvrir() {
    FC = FC || Fb.instance('concepteur', 'session');
    fenetre(tete('Connexion…') + '<p class="cdb-note">Chargement…</p>');
    brancherTete();
    FC.pret().then(function () {
      var u = FC.user();
      if (!u) return ecranConnexion();
      return verifierAdmin(u).then(function (ok) { if (ok) panneau(); else ecranConnexion('Ce compte n\'est pas un compte concepteur.'); });
    }).catch(function (e) { ecranConnexion(Fb.message(e)); });
  }
  function brancherTete() {
    racine.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b) return;
      var c = b.dataset.c;
      if (c === 'fermer') fermerFenetre();
      else if (c === 'deconnexion') { FC.deconnexion(); ADMIN = null; fermerFenetre(); toast('Session concepteur fermée.', 'ok'); }
      else if (c === 'actualiser') { chargerTout(true); }
    });
  }

  function ecranConnexion(erreur) {
    var email = LOGES.emailsConcepteur[0] || '';
    fenetre(tete('Accès réservé') +
      '<div id="cc-msg" class="msg"></div>' +
      '<form id="cc-form" novalidate><div class="champ"><label class="fl" for="cc-email">Adresse e-mail</label><input id="cc-email" class="fi" type="email" autocomplete="username" value="' + esc(email) + '"></div>' +
      '<div class="champ"><label class="fl" for="cc-mdp">Mot de passe</label><div class="oeil"><input id="cc-mdp" class="fi" type="password" autocomplete="current-password" style="padding-right:76px"><button type="button" data-oeil="cc-mdp">Afficher</button></div></div>' +
      '<button class="fb fb-blue" id="cc-ok" type="submit">Se connecter</button></form>' +
      '<p class="cdb-note" style="margin-top:14px">Première utilisation ? <button class="lien-sobre" id="cc-premier" style="margin:0">Créer le compte concepteur</button><br>La session se ferme quand vous fermez cet onglet.</p>');
    brancherTete();
    if (erreur) msg('cc-msg', erreur);
    setTimeout(function () { racine.querySelector('#cc-mdp').focus(); }, 30);
    racine.querySelector('#cc-premier').onclick = ecranPremier;
    racine.querySelector('#cc-form').onsubmit = function (e) {
      e.preventDefault();
      var em = racine.querySelector('#cc-email').value.trim(), pw = racine.querySelector('#cc-mdp').value, bt = racine.querySelector('#cc-ok');
      if (!em || !pw) return msg('cc-msg', 'Saisissez l\'adresse et le mot de passe.');
      occupe(bt, true, 'Connexion…'); msg('cc-msg', '');
      FC.connexion(em, pw).then(function (u) { return verifierAdmin(u); }).then(function (ok) {
        occupe(bt, false);
        if (ok) return panneau();
        var u = FC.user();
        if (u && LOGES.emailsConcepteur.indexOf(u.email) >= 0 && !u.emailVerified) return ecranVerification(u.email);
        FC.deconnexion(); msg('cc-msg', 'Ce compte n\'est pas un compte concepteur.');
      }, function (er) { occupe(bt, false); msg('cc-msg', er.code === 'wrong-password' ? 'Adresse ou mot de passe incorrect.' : Fb.message(er)); });
    };
  }

  function ecranPremier() {
    fenetre(tete('Première configuration') +
      '<p class="cdb-note" style="margin-bottom:12px">Le premier compte concepteur ne peut être créé qu\'avec l\'adresse prévue dans la configuration (' + esc(LOGES.emailsConcepteur.join(', ')) + '), puis vérifiée par le lien reçu par e-mail. Une fois ce compte enregistré, plus personne ne peut en créer un autre de cette façon.</p>' +
      '<div id="cc-msg" class="msg"></div><form id="cp-form" novalidate>' +
      '<div class="champ"><label class="fl" for="cp-email">Adresse e-mail</label><input id="cp-email" class="fi" type="email" value="' + esc(LOGES.emailsConcepteur[0] || '') + '"></div>' +
      '<div class="fg2"><div class="champ"><label class="fl" for="cp-mdp">Mot de passe</label><input id="cp-mdp" class="fi" type="password" autocomplete="new-password"></div>' +
      '<div class="champ"><label class="fl" for="cp-mdp2">Confirmer</label><input id="cp-mdp2" class="fi" type="password" autocomplete="new-password"></div></div>' +
      '<p class="cdb-note" style="margin-bottom:10px">10 caractères minimum, avec lettres et chiffres.</p>' +
      '<button class="fb fb-blue" id="cp-ok" type="submit">Créer le compte et envoyer le lien de vérification</button></form>' +
      '<p style="margin-top:12px"><button class="lien-sobre" id="cp-retour" style="margin:0">← J\'ai déjà un compte</button></p>');
    brancherTete();
    racine.querySelector('#cp-retour').onclick = function () { ecranConnexion(); };
    racine.querySelector('#cp-form').onsubmit = function (e) {
      e.preventDefault();
      var em = racine.querySelector('#cp-email').value.trim().toLowerCase(), pw = racine.querySelector('#cp-mdp').value, pw2 = racine.querySelector('#cp-mdp2').value;
      if (LOGES.emailsConcepteur.indexOf(em) < 0) return msg('cc-msg', 'Cette adresse n\'est pas l\'adresse concepteur prévue.');
      if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return msg('cc-msg', 'Mot de passe trop faible : 10 caractères, lettres et chiffres.');
      if (pw !== pw2) return msg('cc-msg', 'Les deux mots de passe ne sont pas identiques.');
      var bt = racine.querySelector('#cp-ok'); occupe(bt, true, 'Création…');
      FC.inscription(em, pw).then(function () { return FC.envoyerVerification(); }).then(function () { ecranVerification(em); }, function (er) {
        occupe(bt, false);
        msg('cc-msg', er.code === 'exists' ? 'Un compte existe déjà avec cette adresse : connectez-vous.' : Fb.message(er));
      });
    };
  }

  function ecranVerification(email) {
    fenetre(tete('Vérification de l\'adresse') +
      '<div id="cc-msg" class="msg info on">Un lien de vérification a été envoyé à ' + esc(email) + '. Ouvrez-le (pensez aux courriers indésirables), puis revenez ici.</div>' +
      '<button class="fb fb-blue" id="cv-ok">J\'ai vérifié mon adresse</button>' +
      '<p style="margin-top:12px;display:flex;gap:14px;flex-wrap:wrap"><button class="lien-sobre" id="cv-renvoi" style="margin:0">Renvoyer le lien</button><button class="lien-sobre" id="cv-retour" style="margin:0">Se déconnecter</button></p>');
    brancherTete();
    racine.querySelector('#cv-renvoi').onclick = function () { FC.envoyerVerification().then(function () { msg('cc-msg', 'Lien renvoyé.', 'ok'); }, function (e) { msg('cc-msg', Fb.message(e)); }); };
    racine.querySelector('#cv-retour').onclick = function () { FC.deconnexion(); ecranConnexion(); };
    racine.querySelector('#cv-ok').onclick = function () {
      var bt = this; occupe(bt, true, 'Vérification…');
      FC.recharger().then(function (u) {
        if (!u.emailVerified) { occupe(bt, false); return msg('cc-msg', 'L\'adresse n\'est pas encore vérifiée. Ouvrez le lien reçu puis réessayez.'); }
        return verifierAdmin(u).then(function (ok) { occupe(bt, false); if (ok) panneau(); else msg('cc-msg', 'Un compte concepteur existe déjà : celui-ci ne peut pas être enregistré.'); });
      }, function (e) { occupe(bt, false); msg('cc-msg', Fb.message(e)); });
    };
  }

  // Le compte est-il concepteur ? Sinon, premier enregistrement si les règles l'autorisent.
  function verifierAdmin(u) {
    return FC.lire('loges_platform/admins/' + u.uid).then(function (a) {
      if (a) { ADMIN = a; ADMIN.uid = u.uid; return true; }
      return false;
    }, function () {
      if (LOGES.emailsConcepteur.indexOf(String(u.email).toLowerCase()) < 0 || !u.emailVerified) return false;
      var fiche = { nom: 'Souleymane Diallo', email: u.email, creeLe: maintenant() };
      return FC.ecrire('loges_platform/admins/' + u.uid, fiche).then(function () {
        ADMIN = fiche; ADMIN.uid = u.uid;
        return FC.lire('loges_platform/config').then(function (c) {
          if (c) return;
          return FC.ecrire('loges_platform/config', { essaiJours: LOGES.essaiParDefaut, publierTarifs: false, devise: 'GNF', whatsapp: LOGES.contacts.whatsapp[0], majLe: maintenant() });
        }).catch(function () {}).then(function () { toast('Compte concepteur enregistré.', 'ok'); return true; });
      }, function () { return false; });
    });
  }

  /* ---------------- Données ---------------- */
  function chargerEcoles(cible) {
    return FC.lire('loges_codes').then(function (codes) {
      codes = codes || {};
      var liste = Object.keys(codes).map(function (c) { return { code: c, sid: codes[c] }; }), sortie = [], i = 0;
      function lot() {
        var tranche = liste.slice(i, i + 6); i += 6;
        if (!tranche.length) return Promise.resolve();
        return Promise.all(tranche.map(function (e) {
          return Promise.all([FC.lire('loges_ecoles/' + e.sid + '/info'), FC.lire('loges_ecoles/' + e.sid + '/licence'), FC.lire('loges_ecoles/' + e.sid + '/membres').catch(function () { return null; })])
            .then(function (x) {
              var mm = x[2] || {}, cles = Object.keys(mm);
              var actifs = cles.filter(function (k) { return mm[k].statut === 'actif'; });
              var proprio = cles.filter(function (k) { return mm[k].proprietaire && mm[k].statut === 'actif'; })[0];
              sortie.push({ sid: e.sid, code: e.code, info: x[0] || {}, licence: x[1], actifs: actifs.length,
                derniere: cles.reduce(function (m, k) { return Math.max(m, mm[k].derniereConnexion || 0); }, 0),
                proprio: proprio ? { uid: proprio, username: mm[proprio].username, nom: mm[proprio].nom, tel: mm[proprio].tel } : null,
                membres: cles.filter(function (k) { return mm[k].statut !== 'remplace'; }).map(function (k) { return { nom: mm[k].nom, username: mm[k].username, role: mm[k].role, statut: mm[k].statut }; }) });
            }, function () { sortie.push({ sid: e.sid, code: e.code, info: { nom: '(illisible)' }, licence: null, actifs: 0, derniere: 0, membres: [] }); });
        })).then(lot);
      }
      return lot().then(function () {
        sortie.sort(function (a, b) { return (b.info.creeLe || 0) - (a.info.creeLe || 0); });
        (cible || D).ecoles = sortie;
        lsSet('loges_conc_ecoles', sortie.map(function (e) { return { sid: e.sid, code: e.code, info: { nom: e.info.nom, fondateur: e.info.fondateur, tel: e.info.tel, region: e.info.region, prefecture: e.info.prefecture, creeLe: e.info.creeLe }, licence: e.licence, actifs: e.actifs, derniere: e.derniere, membres: [] }; }));
      });
    });
  }
  // Tout est lu d'abord, puis appliqué d'un coup : jamais une déclaration affichée sans son école
  function chargerTout(avecEcoles) {
    var n = {};
    var etapes = [
      FC.lire('loges_platform/paiements', { dernier: 400 }).then(function (v) { n.paiements = v || {}; }),
      FC.lire('loges_platform/tarifs').then(function (v) { n.tarifs = v || {}; }),
      FC.lire('loges_platform/config').then(function (v) { n.config = v || {}; }),
      FC.lire('loges_platform/factures', { dernier: 400 }).then(function (v) { n.factures = v || {}; })
    ];
    if (avecEcoles !== false) etapes.push(chargerEcoles(n));
    var appliquer = function () { Object.assign(D, n); rendre(); };
    return Promise.all(etapes.map(function (e) { return e.catch(function (er) { return { erreur: er }; }); })).then(function (r) {
      var ko = r.filter(function (x) { return x && x.erreur; })[0];
      if (ko) toast(Fb.message(ko.erreur), 'ko');
      appliquer();
    });
  }
  // École d'une déclaration, lue à la demande si la liste n'est pas encore à jour
  function trouverEcole(sid) {
    var e = ecole(sid); if (e) return Promise.resolve(e);
    return Promise.all([FC.lire('loges_ecoles/' + sid + '/info'), FC.lire('loges_ecoles/' + sid + '/licence')]).then(function (x) {
      if (!x[0]) return null;
      if (!ecole(sid)) D.ecoles.push({ sid: sid, code: x[0].code, info: x[0], licence: x[1], actifs: 0, derniere: 0, membres: [] });
      return ecole(sid);
    }, function () { return null; });
  }

  function entreeJournal(sid, action, objet, detail) {
    var o = {}; var e = { t: FC.TS(), uid: ADMIN.uid, auteur: SIGNATURE, action: action, objet: objet };
    if (detail) e.detail = String(detail).slice(0, 500);
    o['loges_ecoles/' + sid + '/journal/plateforme/' + FC.cle()] = e; return o;
  }
  function licenceAvec(l, changements) {
    var n = Object.assign({}, l || {}, changements, { majLe: maintenant() });
    Object.keys(n).forEach(function (k) { if (n[k] === undefined || n[k] === null) delete n[k]; });
    return n;
  }
  function ecrireLicence(e, nouvelle, action, detail) {
    var p = {}; p['loges_ecoles/' + e.sid + '/licence'] = nouvelle;
    Object.assign(p, entreeJournal(e.sid, action, 'licence', detail));
    return FC.majGroupee(p).then(function () { e.licence = nouvelle; rendre(); toast('Licence de ' + e.info.nom + ' mise à jour.', 'ok'); }, function (er) { toast(Fb.message(er), 'ko'); });
  }

  /* ---------------- Panneau ---------------- */
  function panneau() {
    fenetre(tete((ADMIN.nom || '') + ' — ' + (ADMIN.email || '')) +
      '<div class="cdb-onglets" role="tablist">' +
        [['ecoles', 'Écoles'], ['licences', 'Licences & paiements'], ['factures', 'Factures & WhatsApp'], ['securite', 'Sécurité']].map(function (o) {
          return '<button class="cdb-onglet' + (onglet === o[0] ? ' on' : '') + '" data-onglet="' + o[0] + '" role="tab">' + o[1] + (o[0] === 'licences' ? ' <span id="cdb-nb-attente"></span>' : '') + '</button>'; }).join('') +
      '</div><div id="cdb-corps"></div>', true);
    brancherTete();
    racine.addEventListener('click', clic);
    racine.addEventListener('input', function (e) { if (e.target.id === 'cdb-recherche') { recherche = e.target.value.toLowerCase(); rendreEcoles(true); } });
    // Toute saisie non enregistrée est marquée : un rafraîchissement de l'onglet ne doit pas l'effacer
    ['input', 'change'].forEach(function (evt) { racine.addEventListener(evt, function (e) { if (e.target.id && e.target.closest('#cdb-corps')) e.target.dataset.modifie = '1'; }); });
    rendre();
    chargerTout(true);
  }
  var ongletRendu = null;
  function rendre() {
    if (!racine || !ADMIN) return;
    var c = racine.querySelector('#cdb-corps'); if (!c) return;
    racine.querySelectorAll('.cdb-onglet').forEach(function (b) { b.classList.toggle('on', b.dataset.onglet === onglet); });
    var nb = Object.keys(D.paiements).filter(function (k) { return D.paiements[k].statut === 'en_attente'; }).length;
    var badge = racine.querySelector('#cdb-nb-attente'); if (badge) badge.innerHTML = nb ? '<span class="cdb-badge attente">' + nb + '</span>' : '';
    var garde = {};
    if (onglet === ongletRendu) c.querySelectorAll('[data-modifie]').forEach(function (el) { garde[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    ({ ecoles: rendreEcoles, licences: rendreLicences, factures: rendreFactures, securite: rendreSecurite })[onglet]();
    ongletRendu = onglet;
    Object.keys(garde).forEach(function (id) {
      var el = document.getElementById(id); if (!el || !c.contains(el)) return;
      if (el.type === 'checkbox') el.checked = garde[id]; else el.value = garde[id];
      el.dataset.modifie = '1';
    });
  }

  /* ---- Onglet Écoles ---- */
  function rendreEcoles(seulementTable) {
    var c = racine.querySelector('#cdb-corps');
    var compte = { toutes: D.ecoles.length, actif: 0, essai: 0, expire: 0, bloque: 0 };
    D.ecoles.forEach(function (e) { compte[etat(e.licence).cle]++; });
    var liste = D.ecoles.filter(function (e) {
      if (filtre !== 'toutes' && etat(e.licence).cle !== filtre) return false;
      if (!recherche) return true;
      return [e.code, e.info.nom, e.info.fondateur, e.info.tel, e.info.region, e.info.prefecture].join(' ').toLowerCase().indexOf(recherche) >= 0;
    });
    var table = liste.length ? '<div class="cdb-wrap"><table class="cdb-table"><thead><tr><th>École</th><th>Fondateur</th><th>Localisation</th><th>Licence</th><th>Comptes</th><th>Dernière activité</th><th>Actions</th></tr></thead><tbody>' +
      liste.map(function (e) {
        var s = etat(e.licence), l = e.licence || {};
        var initiales = esc(initialesEcole(e.info.nom));
        return '<tr><td><div style="display:flex;gap:8px;align-items:center"><div class="cdb-logo">' + initiales + '</div><div><div class="cdb-nom">' + esc(e.info.nom) + '</div><div class="cdb-code">' + esc(e.code) + '</div></div></div></td>' +
          '<td>' + esc(e.info.fondateur || '—') + '<div class="cdb-petit">' + esc(e.info.tel || '') + '</div></td>' +
          '<td>' + esc(e.info.prefecture || '') + '<div class="cdb-petit">' + esc(e.info.region || '') + '</div></td>' +
          '<td><span class="cdb-badge ' + s.cle + '">' + s.txt + '</span><div class="cdb-petit">' + (l.expiration ? 'jusqu\'au ' + fmtDate(l.expiration) + ' (' + s.jours + ' j)' : '') + '</div>' + (l.carteLibelle ? '<div class="cdb-petit">' + esc(l.carteLibelle) + '</div>' : '') + (s.cle === 'bloque' && l.motif ? '<div class="cdb-petit" style="color:#f87171">' + esc(l.motif) + '</div>' : '') + '</td>' +
          '<td>' + e.actifs + '</td><td>' + relatif(e.derniere) + '<div class="cdb-petit">créée le ' + fmtDate(e.info.creeLe) + '</div></td>' +
          '<td><div class="cdb-act">' +
            (s.cle === 'bloque' ? '<button class="cdb-btn ok" data-e="debloquer" data-sid="' + e.sid + '">Débloquer</button>' : '<button class="cdb-btn danger" data-e="bloquer" data-sid="' + e.sid + '">Bloquer</button>') +
            '<button class="cdb-btn" data-e="activer" data-sid="' + e.sid + '">Activer</button>' +
            '<button class="cdb-btn" data-e="essai" data-sid="' + e.sid + '">+ Essai</button>' +
            '<button class="cdb-btn" data-e="details" data-sid="' + e.sid + '">Détails</button>' +
            (e.info.tel ? '<a class="cdb-btn wa" target="_blank" rel="noopener" href="' + lienWa(e.info.tel, 'Bonjour, ici le concepteur de LOGES au sujet de l\'école ' + e.info.nom + '.') + '">WhatsApp</a>' : '') +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="cdb-vide">' + (D.ecoles.length ? 'Aucune école ne correspond.' : 'Aucune école enregistrée pour le moment.') + '</div>';
    if (seulementTable === true && racine.querySelector('#cdb-table')) { racine.querySelector('#cdb-table').innerHTML = table; return; }
    c.innerHTML = '<div class="cdb-stats">' + [['toutes', 'Toutes'], ['actif', 'Actives'], ['essai', 'Essai'], ['expire', 'Expirées'], ['bloque', 'Bloquées']].map(function (f) {
      return '<div class="cdb-stat' + (filtre === f[0] ? ' on' : '') + '" data-filtre="' + f[0] + '" role="button" tabindex="0"><div class="lbl">' + f[1] + '</div><div class="val">' + compte[f[0]] + '</div></div>'; }).join('') + '</div>' +
      '<div class="cdb-barre"><input id="cdb-recherche" placeholder="Rechercher : nom, identifiant, fondateur, téléphone, région…" value="' + esc(recherche) + '"></div><div id="cdb-table">' + table + '</div>';
  }

  /* ---- Onglet Licences & paiements ---- */
  function rendreLicences() {
    var c = racine.querySelector('#cdb-corps');
    var paie = Object.keys(D.paiements).map(function (k) { var p = D.paiements[k]; p.id = k; return p; })
      .filter(function (p) { return filtrePaie === 'toutes' || p.statut === filtrePaie; }).sort(function (a, b) { return b.t - a.t; });
    var tarifs = Object.keys(D.tarifs).map(function (k) { var t = D.tarifs[k]; t.id = k; return t; }).sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0) || a.mois - b.mois; });
    var cfg = D.config || {};
    c.innerHTML =
      '<div class="cdb-sec">Déclarations de paiement</div><div class="cdb-barre"><select id="cdb-f-paie">' +
        [['en_attente', 'En attente'], ['valide', 'Validées'], ['rejete', 'Rejetées'], ['toutes', 'Toutes']].map(function (o) { return '<option value="' + o[0] + '"' + (filtrePaie === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      (paie.length ? '<div class="cdb-grille">' + paie.map(function (p) {
        var st = { en_attente: ['attente', 'En attente'], valide: ['actif', 'Validée'], rejete: ['bloque', 'Rejetée'] }[p.statut] || ['essai', p.statut];
        return '<div class="cdb-carte"><div style="display:flex;justify-content:space-between;gap:8px"><div><div class="cdb-nom">' + esc(p.nomEcole || p.code) + '</div><div class="cdb-code">' + esc(p.code || '') + '</div></div><span class="cdb-badge ' + st[0] + '">' + st[1] + '</span></div>' +
          '<div style="display:flex;gap:10px;margin-top:8px;align-items:flex-start">' + (p.justificatif ? '<img class="cdb-just" src="' + esc(p.justificatif) + '" alt="Justificatif" data-apercu="' + p.id + '">' : '<div class="cdb-just" style="display:flex;align-items:center;justify-content:center;font-size:9px;color:#475569;cursor:default">sans photo</div>') +
          '<div style="font-size:12px;line-height:1.7"><b style="color:#e2e8f0">' + esc(p.carteLibelle || p.carte) + '</b> — ' + fmtMontant(p.montant, devise()) + '<br>' + esc(MOYENS[p.moyen] || p.moyen) + (p.reference ? ' — réf. <span class="cdb-code">' + esc(p.reference) + '</span>' : '') +
          '<br><span class="cdb-petit">' + fmtDateHeure(p.t) + ' par ' + esc(p.auteur || '?') + '</span>' + (p.facture ? '<br><span class="cdb-petit">Facture ' + esc(p.facture) + '</span>' : '') + (p.motif ? '<br><span class="cdb-petit" style="color:#f87171">' + esc(p.motif) + '</span>' : '') + '</div></div>' +
          '<div class="cdb-act" style="margin-top:10px">' + (p.statut === 'en_attente' ? '<button class="cdb-btn ok" data-p="valider" data-id="' + p.id + '">Valider et activer</button><button class="cdb-btn danger" data-p="rejeter" data-id="' + p.id + '">Rejeter</button>' : '') +
          (p.tel ? '<a class="cdb-btn wa" target="_blank" rel="noopener" href="' + lienWa(p.tel, 'Bonjour, concepteur LOGES : votre déclaration de paiement (' + (p.carteLibelle || '') + ', ' + fmtMontant(p.montant, devise()) + ') a bien été reçue.') + '">WhatsApp</a>' : '') + '</div></div>';
      }).join('') + '</div>' : '<div class="cdb-vide">Aucune déclaration ' + (filtrePaie === 'en_attente' ? 'en attente' : '') + '.</div>') +

      '<div class="cdb-sec">Cartes de licence</div><p class="cdb-note">Les cartes actives apparaissent dans l\'onglet Licence des écoles quand « Publier les tarifs » est coché.</p>' +
      '<div class="cdb-wrap" style="max-height:none"><table class="cdb-table" style="min-width:640px"><thead><tr><th>Libellé</th><th>Durée (mois)</th><th>Prix (' + esc(devise()) + ')</th><th>Ordre</th><th>Active</th><th></th></tr></thead><tbody id="cdb-tarifs">' +
        (tarifs.length ? tarifs.map(ligneTarif).join('') : '') + '</tbody></table></div>' +
      '<div class="cdb-act" style="margin-top:8px"><button class="cdb-btn" data-t="ajouter">+ Ajouter une carte</button><button class="cdb-btn ok" data-t="enregistrer">Enregistrer les cartes</button></div>' +

      '<div class="cdb-sec">Réglages</div><div class="cdb-carte"><div class="fg2">' +
        '<div class="champ"><label class="fl" for="cf-essai">Essai gratuit des nouvelles écoles (jours, 1 à 31)</label><input class="fi" type="number" min="1" max="31" id="cf-essai" value="' + esc(cfg.essaiJours || LOGES.essaiParDefaut) + '"></div>' +
        '<div class="champ"><label class="fl" for="cf-wa">WhatsApp de paiement / assistance</label><input class="fi" id="cf-wa" value="' + esc(cfg.whatsapp || LOGES.contacts.whatsapp[0]) + '"></div>' +
        '<div class="champ"><label class="fl" for="cf-devise">Devise des licences</label><input class="fi" id="cf-devise" maxlength="3" value="' + esc(cfg.devise || 'GNF') + '"></div>' +
        '<div class="champ" style="display:flex;align-items:flex-end"><label class="case"><input type="checkbox" id="cf-publier"' + (cfg.publierTarifs ? ' checked' : '') + '><span>Publier les tarifs dans l\'onglet Licence des écoles</span></label></div></div>' +
        '<div class="champ"><label class="fl" for="cf-instr">Instructions de paiement</label><textarea class="fi" id="cf-instr" rows="3" maxlength="600" placeholder="Exemple : Orange Money au 623 03 04 03 au nom de Souleymane Diallo, puis déclarez le paiement avec la photo du reçu.">' + esc(cfg.instructions || '') + '</textarea></div>' +
        '<button class="cdb-btn ok" data-t="config">Enregistrer les réglages</button></div>';
  }
  function ligneTarif(t) {
    return '<tr data-tarif="' + esc(t.id) + '"><td><input data-k="libelle" value="' + esc(t.libelle || '') + '" maxlength="80"></td><td><input data-k="mois" type="number" min="1" max="36" value="' + esc(t.mois || 1) + '"></td>' +
      '<td><input data-k="prix" type="number" min="0" step="1000" value="' + esc(t.prix || 0) + '"></td><td><input data-k="ordre" type="number" min="0" max="99" value="' + esc(t.ordre || 0) + '"></td>' +
      '<td><input data-k="actif" type="checkbox"' + (t.actif !== false ? ' checked' : '') + ' style="width:18px;height:18px"></td><td><button class="cdb-btn danger" data-t="supprimer">Supprimer</button></td></tr>';
  }

  /* ---- Onglet Factures & WhatsApp ---- */
  function rendreFactures() {
    var c = racine.querySelector('#cdb-corps');
    var f = Object.keys(D.factures).map(function (k) { var x = D.factures[k]; x.id = k; return x; }).sort(function (a, b) { return b.t - a.t; });
    var relances = D.ecoles.filter(function (e) { var s = etat(e.licence); return s.cle === 'expire' || s.cle === 'bloque' || s.jours <= 7; });
    c.innerHTML = '<div class="cdb-sec">Factures de licence</div>' + (f.length ? '<div class="cdb-wrap"><table class="cdb-table" style="min-width:760px"><thead><tr><th>Numéro</th><th>École</th><th>Carte</th><th>Période</th><th>Montant</th><th>Date</th><th></th></tr></thead><tbody>' +
      f.map(function (x) {
        return '<tr><td class="cdb-code">' + esc(x.numero) + '</td><td><div class="cdb-nom">' + esc(x.nomEcole) + '</div><div class="cdb-petit">' + esc(x.code) + '</div></td><td>' + esc(x.carteLibelle || '') + '</td>' +
          '<td>' + fmtDate(x.periodeDebut) + ' → ' + fmtDate(x.periodeFin) + '</td><td>' + fmtMontant(x.montant, x.devise || devise()) + '</td><td>' + fmtDate(x.t) + '</td>' +
          '<td><div class="cdb-act"><button class="cdb-btn" data-f="imprimer" data-id="' + x.id + '">Imprimer</button>' + (x.tel ? '<a class="cdb-btn wa" target="_blank" rel="noopener" href="' + lienWa(x.tel, texteFacture(x)) + '">WhatsApp</a>' : '') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="cdb-vide">Aucune facture. Elles sont créées automatiquement à la validation d\'un paiement.</div>') +
      '<div class="cdb-sec">Relances (licence expirée, bloquée ou à moins de 7 jours)</div>' +
      (relances.length ? '<div class="cdb-grille">' + relances.map(function (e) {
        var s = etat(e.licence);
        var t = s.cle === 'bloque' ? 'Bonjour, l\'accès LOGES de l\'école ' + e.info.nom + ' est suspendu. Contactez-moi pour le rétablir.' :
          s.cle === 'expire' ? 'Bonjour, la licence LOGES de l\'école ' + e.info.nom + ' a expiré le ' + fmtDate(e.licence && e.licence.expiration) + '. Vous pouvez la renouveler depuis l\'onglet Licence (Fondation ou Comptabilité).' :
          'Bonjour, la licence LOGES de l\'école ' + e.info.nom + ' se termine dans ' + s.jours + ' jour(s), le ' + fmtDate(e.licence.expiration) + '. Pensez à la renouveler depuis l\'onglet Licence.';
        return '<div class="cdb-carte"><div class="cdb-nom">' + esc(e.info.nom) + '</div><div class="cdb-petit">' + esc(e.code) + ' — ' + esc(e.info.tel || 'pas de téléphone') + '</div><div style="margin:6px 0"><span class="cdb-badge ' + s.cle + '">' + s.txt + '</span> <span class="cdb-petit">' + s.jours + ' j</span></div>' +
          (e.info.tel ? '<a class="cdb-btn wa" target="_blank" rel="noopener" href="' + lienWa(e.info.tel, t) + '">Relancer sur WhatsApp</a>' : '') + '</div>';
      }).join('') + '</div>' : '<div class="cdb-vide">Aucune relance nécessaire.</div>');
  }
  function texteFacture(x) {
    return 'Facture ' + x.numero + ' — LOGES\nÉcole : ' + x.nomEcole + ' (' + x.code + ')\nLicence : ' + (x.carteLibelle || '') + ' du ' + fmtDate(x.periodeDebut) + ' au ' + fmtDate(x.periodeFin) +
      '\nMontant : ' + fmtMontant(x.montant, x.devise || devise()) + ' — PAYÉE\nMerci pour votre confiance.\nSouleymane Diallo, concepteur de LOGES';
  }
  function imprimerFacture(x) {
    var z = $('impression');
    z.innerHTML = '<div style="font-family:\'DM Sans\',Arial,sans-serif;color:#0f172a;padding:4mm">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1d4ed8;padding-bottom:10px">' +
        '<div style="display:flex;gap:12px;align-items:center"><img src="' + LOGES.logo + '" style="width:90px;height:90px;object-fit:contain"><div><div style="font-size:20px;font-weight:800;color:#1d4ed8">LOGES</div><div style="font-size:12px">Logiciel de gestion scolaire</div><div style="font-size:12px;margin-top:4px">Souleymane Diallo — Concepteur</div><div style="font-size:12px">WhatsApp : ' + LOGES.contacts.whatsapp.map(function (n) { return '+' + n; }).join(' / ') + '</div><div style="font-size:12px">' + esc(LOGES.contacts.email) + '</div></div></div>' +
        '<div style="text-align:right"><div style="font-size:22px;font-weight:800">FACTURE</div><div style="font-size:14px;font-weight:700">' + esc(x.numero) + '</div><div style="font-size:12px">Date : ' + fmtDate(x.t) + '</div><div style="margin-top:8px;display:inline-block;border:2px solid #15803d;color:#15803d;font-weight:800;padding:3px 10px;border-radius:6px;transform:rotate(-4deg)">PAYÉE</div></div></div>' +
      '<div style="margin:16px 0;font-size:13px"><div style="font-weight:800;margin-bottom:4px">Facturé à</div>' + esc(x.nomEcole) + '<br>Identifiant : ' + esc(x.code) + (x.tel ? '<br>Téléphone : ' + esc(x.tel) : '') + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#eef3ff"><th style="text-align:left;padding:8px;border:1px solid #cfd8ea">Désignation</th><th style="text-align:left;padding:8px;border:1px solid #cfd8ea">Période</th><th style="text-align:right;padding:8px;border:1px solid #cfd8ea">Montant</th></tr></thead>' +
      '<tbody><tr><td style="padding:8px;border:1px solid #cfd8ea">Licence LOGES — ' + esc(x.carteLibelle || '') + ' (' + esc(x.mois || '') + ' mois)</td><td style="padding:8px;border:1px solid #cfd8ea">du ' + fmtDate(x.periodeDebut) + ' au ' + fmtDate(x.periodeFin) + '</td><td style="padding:8px;border:1px solid #cfd8ea;text-align:right;white-space:nowrap">' + fmtMontant(x.montant, x.devise || devise()) + '</td></tr></tbody>' +
      '<tfoot><tr><td colspan="2" style="padding:8px;border:1px solid #cfd8ea;text-align:right;font-weight:800">Total payé</td><td style="padding:8px;border:1px solid #cfd8ea;text-align:right;font-weight:800;white-space:nowrap">' + fmtMontant(x.montant, x.devise || devise()) + '</td></tr></tfoot></table>' +
      '<p style="font-size:12px;margin-top:12px">Moyen de paiement : ' + esc(MOYENS[x.moyen] || x.moyen || '—') + (x.reference ? ' — référence ' + esc(x.reference) : '') + '</p>' +
      '<p style="font-size:11px;color:#475569;margin-top:30px">Merci pour votre confiance. Facture générée par l\'espace concepteur de LOGES.</p></div>';
    setTimeout(function () { window.print(); }, 60);
  }

  /* ---- Onglet Sécurité ---- */
  function rendreSecurite() {
    var c = racine.querySelector('#cdb-corps');
    c.innerHTML = '<div class="cdb-grille"><div class="cdb-carte"><div class="cdb-sec" style="margin-top:0">Compte concepteur</div><p class="cdb-note">' + esc(ADMIN.nom) + '<br>' + esc(ADMIN.email) + '<br>Session fermée à la fermeture de l\'onglet.</p></div>' +
      '<div class="cdb-carte"><div class="cdb-sec" style="margin-top:0">Règles de sécurité de la base</div><div id="cdb-regles" class="cdb-note">Vérification…</div></div></div>' +
      '<div class="cdb-carte"><div class="cdb-sec" style="margin-top:0">Changer le mot de passe</div><div id="cs-msg" class="msg"></div><div class="fg2">' +
        '<div class="champ"><label class="fl" for="cs-a">Mot de passe actuel</label><input class="fi" type="password" id="cs-a" autocomplete="current-password"></div><div></div>' +
        '<div class="champ"><label class="fl" for="cs-n">Nouveau (10 caractères min.)</label><input class="fi" type="password" id="cs-n" autocomplete="new-password"></div>' +
        '<div class="champ"><label class="fl" for="cs-c">Confirmer</label><input class="fi" type="password" id="cs-c" autocomplete="new-password"></div></div>' +
        '<button class="cdb-btn ok" data-s="mdp">Changer le mot de passe</button></div>' +
      '<p class="cdb-note">Le mot de passe n\'est enregistré nulle part dans l\'application : il est vérifié par Firebase Authentication. Les droits concepteur sont accordés par les règles de la base au seul compte inscrit dans loges_platform/admins.</p>';
    // Vérifie que les règles ne sont plus en « mode test » (base ouverte)
    FC.lire('loges_ecoles').then(function () {
      var z = racine && racine.querySelector('#cdb-regles');
      if (z) z.innerHTML = '<span style="color:#f87171;font-weight:800">⚠ La base est ouverte</span> : n\'importe qui peut lire toutes les écoles. Publiez le fichier database.rules.json dans la console Firebase (Realtime Database → Règles).';
    }, function (e) {
      var z = racine && racine.querySelector('#cdb-regles');
      if (z) z.innerHTML = e.code === 'permission' ? '<span style="color:#4ade80;font-weight:800">✓ Règles actives</span> : chaque école est cloisonnée, y compris vis-à-vis du concepteur.' : esc(Fb.message(e));
    });
  }

  /* ---------------- Actions ---------------- */
  function ecole(sid) { return D.ecoles.filter(function (e) { return e.sid === sid; })[0]; }
  function choisirCarte(titre, texte, rappel) {
    var cartes = Object.keys(D.tarifs).map(function (k) { var t = D.tarifs[k]; t.id = k; return t; }).filter(function (t) { return t.actif !== false; }).sort(function (a, b) { return a.mois - b.mois; });
    modal({ titre: titre, corps: '<p style="line-height:1.6;margin-bottom:12px">' + texte + '</p>' +
      '<div class="ch"><label class="lb" for="ac-carte">Carte</label><select class="in-c" id="ac-carte">' + cartes.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.libelle) + ' — ' + t.mois + ' mois — ' + fmtMontant(t.prix, devise()) + '</option>'; }).join('') + '<option value="">Autre durée…</option></select></div>' +
      '<div class="g2"><div class="ch"><label class="lb" for="ac-mois">Durée (mois)</label><input class="in-c" type="number" min="1" max="36" id="ac-mois" value="' + (cartes[0] ? cartes[0].mois : 1) + '"></div>' +
      '<div class="ch"><label class="lb" for="ac-montant">Montant encaissé (0 = gratuit)</label><input class="in-c" type="number" min="0" step="1000" id="ac-montant" value="' + (cartes[0] ? cartes[0].prix : 0) + '"></div></div>' +
      '<p style="font-size:13px;color:#475569">Un montant supérieur à 0 produit une facture.</p>',
      boutons: [{ txt: 'Annuler' }, { txt: 'Activer', cls: 'p', action: function (fermer) {
        var id = $('ac-carte').value, t = id ? D.tarifs[id] : null, mois = Number($('ac-mois').value), montant = Number($('ac-montant').value) || 0;
        if (!(mois >= 1 && mois <= 36)) return toast('Durée invalide.', 'ko');
        fermer(); rappel({ id: id || 'manuel', libelle: t ? t.libelle : mois + ' mois', mois: mois, montant: montant });
      } }],
      auOuverture: function () {
        $('ac-carte').onchange = function () { var t = D.tarifs[this.value]; if (t) { $('ac-mois').value = t.mois; $('ac-montant').value = t.prix; } };
      } });
  }
  function numeroFacture() {
    var annee = new Date(maintenant()).getFullYear();
    return FC.lire('loges_platform/compteurs/factures/' + annee).then(function (n) {
      n = (Number(n) || 0) + 1;
      return { annee: annee, n: n, numero: 'FL-' + annee + '-' + String(n).padStart(4, '0') };
    });
  }
  // Active (ou prolonge) la licence ; avec un montant, crée la facture. Option : valider une déclaration.
  function activer(e, carte, paiement) {
    var l = e.licence || {}, now = maintenant();
    var base = Math.max(now, l.expiration || 0), fin = ajouterMois(base, carte.mois);
    var dejaActive = l.statut === 'actif' && l.expiration > now;
    var nouvelle = licenceAvec(l, { statut: 'actif', debut: dejaActive ? l.debut : now, expiration: fin, carte: carte.id, carteLibelle: carte.libelle, motif: null, avantBlocage: null, dernierPaiement: carte.montant > 0 ? now : l.dernierPaiement });
    var p = {}; p['loges_ecoles/' + e.sid + '/licence'] = nouvelle;
    var suite = carte.montant > 0 ? numeroFacture() : Promise.resolve(null);
    return suite.then(function (nf) {
      if (nf) {
        var fid = FC.cle();
        p['loges_platform/factures/' + fid] = { numero: nf.numero, ecole: e.sid, code: e.code, nomEcole: e.info.nom, tel: e.info.tel || '', montant: carte.montant, devise: devise(),
          carteLibelle: carte.libelle, mois: carte.mois, periodeDebut: base, periodeFin: fin, t: now, paiement: paiement ? paiement.id : '', moyen: paiement ? paiement.moyen : 'especes', reference: paiement && paiement.reference || '' };
        p['loges_platform/compteurs/factures/' + nf.annee] = nf.n;
      }
      if (paiement) {
        p['loges_platform/paiements/' + paiement.id + '/statut'] = 'valide';
        p['loges_platform/paiements/' + paiement.id + '/traiteLe'] = now;
        p['loges_platform/paiements/' + paiement.id + '/traitePar'] = ADMIN.uid;
        p['loges_ecoles/' + e.sid + '/paiementsLicence/' + paiement.id + '/statut'] = 'valide';
        p['loges_ecoles/' + e.sid + '/paiementsLicence/' + paiement.id + '/traiteLe'] = now;
        if (nf) { p['loges_platform/paiements/' + paiement.id + '/facture'] = nf.numero; p['loges_ecoles/' + e.sid + '/paiementsLicence/' + paiement.id + '/facture'] = nf.numero; }
      }
      Object.assign(p, entreeJournal(e.sid, paiement ? 'paiement_valide' : 'activation', 'licence', carte.libelle + ' jusqu\'au ' + fmtDate(fin) + (nf ? ' — facture ' + nf.numero : '')));
      return FC.majGroupee(p).then(function () {
        e.licence = nouvelle;
        toast('Licence de ' + e.info.nom + ' active jusqu\'au ' + fmtDate(fin) + (nf ? ' — facture ' + nf.numero : '') + '.', 'ok');
        return chargerTout(false);
      });
    });
  }

  function clic(ev) {
    var t = ev.target;
    var og = t.closest('[data-onglet]'); if (og) { onglet = og.dataset.onglet; rendre(); return; }
    var fl = t.closest('[data-filtre]'); if (fl) { filtre = fl.dataset.filtre; rendreEcoles(); return; }
    var ap = t.closest('[data-apercu]');
    if (ap) { var v = document.createElement('div'); v.className = 'cdb-apercu'; v.innerHTML = '<img src="' + esc(D.paiements[ap.dataset.apercu].justificatif) + '" alt="Justificatif">'; v.onclick = function () { v.remove(); }; document.body.appendChild(v); return; }
    var b = t.closest('button'); if (!b) return;

    if (b.dataset.e) {
      var e = ecole(b.dataset.sid); if (!e) return;
      var l = e.licence || {};
      if (b.dataset.e === 'bloquer') {
        modal({ titre: 'Bloquer ' + e.info.nom, corps: '<p style="line-height:1.6;margin-bottom:10px">Tous les comptes de l\'école perdent immédiatement l\'accès aux données. Ils voient le motif et peuvent déclarer un paiement. Aucune donnée n\'est supprimée.</p><div class="ch"><label class="lb" for="bl-m">Motif affiché à l\'école</label><input class="in-c" id="bl-m" maxlength="300" value="Licence non réglée"></div>',
          boutons: [{ txt: 'Annuler' }, { txt: 'Bloquer', cls: 'd', action: function (fermer) {
            var m = $('bl-m').value.trim(); fermer();
            ecrireLicence(e, licenceAvec(l, { statut: 'bloque', avantBlocage: l.statut === 'actif' ? 'actif' : 'essai', motif: m || 'Accès suspendu', expiration: l.expiration || maintenant() }), 'blocage', m);
          } }] });
      } else if (b.dataset.e === 'debloquer') {
        ecrireLicence(e, licenceAvec(l, { statut: l.avantBlocage || (l.carte ? 'actif' : 'essai'), avantBlocage: null, motif: null }), 'deblocage', '');
      } else if (b.dataset.e === 'essai') {
        modal({ titre: 'Prolonger l\'essai — ' + e.info.nom, corps: '<div class="ch"><label class="lb" for="es-j">Nombre de jours à ajouter</label><input class="in-c" type="number" min="1" max="90" id="es-j" value="7"></div><p style="font-size:13px;color:#475569">L\'essai repart de la date la plus tardive entre aujourd\'hui et son échéance actuelle.</p>',
          boutons: [{ txt: 'Annuler' }, { txt: 'Prolonger', cls: 'p', action: function (fermer) {
            var j = Number($('es-j').value); if (!(j >= 1 && j <= 90)) return toast('Entre 1 et 90 jours.', 'ko'); fermer();
            var fin = Math.max(maintenant(), l.expiration || 0) + j * 86400000;
            ecrireLicence(e, licenceAvec(l, { statut: l.statut === 'actif' ? 'actif' : 'essai', expiration: fin, debut: l.debut || maintenant() }), 'prolongation', '+' + j + ' jours, jusqu\'au ' + fmtDate(fin));
          } }] });
      } else if (b.dataset.e === 'activer') {
        choisirCarte('Activer la licence — ' + e.info.nom, 'La licence part de la date la plus tardive entre aujourd\'hui et l\'échéance actuelle.', function (carte) {
          activer(e, carte, null).catch(function (er) { toast(Fb.message(er), 'ko'); });
        });
      } else if (b.dataset.e === 'details') {
        details(e);
      }
      return;
    }
    if (b.dataset.p) {
      var p = D.paiements[b.dataset.id]; if (!p) return; p.id = b.dataset.id;
      var typeP = b.dataset.p;
      trouverEcole(p.ecole).then(function (ec) {
      if (!ec) return toast("École introuvable : elle n'existe plus dans la base.", 'ko');
      if (typeP === 'valider') {
        confirmer('Valider le paiement', 'Licence <b>' + esc(p.carteLibelle) + '</b> pour <b>' + esc(ec.info.nom) + '</b> (' + fmtMontant(p.montant, devise()) + '). La licence s\'active immédiatement et une facture est produite.', 'Valider et activer').then(function (ok) {
          if (!ok) return;
          FC.lire('loges_ecoles/' + ec.sid + '/licence').then(function (lic) { ec.licence = lic; return activer(ec, { id: p.carte, libelle: p.carteLibelle || p.carte, mois: Number(p.mois) || 1, montant: Number(p.montant) || 0 }, p); })
            .catch(function (er) { toast(Fb.message(er), 'ko'); });
        });
      } else if (typeP === 'rejeter') {
        modal({ titre: 'Rejeter la déclaration', corps: '<div class="ch"><label class="lb" for="rj-m">Motif communiqué à l\'école</label><input class="in-c" id="rj-m" maxlength="300" value="Paiement non retrouvé"></div>',
          boutons: [{ txt: 'Annuler' }, { txt: 'Rejeter', cls: 'd', action: function (fermer) {
            var m = $('rj-m').value.trim() || 'Paiement non retrouvé', now = maintenant(); fermer();
            var q = {};
            q['loges_platform/paiements/' + p.id + '/statut'] = 'rejete'; q['loges_platform/paiements/' + p.id + '/motif'] = m; q['loges_platform/paiements/' + p.id + '/traiteLe'] = now;
            q['loges_ecoles/' + ec.sid + '/paiementsLicence/' + p.id + '/statut'] = 'rejete'; q['loges_ecoles/' + ec.sid + '/paiementsLicence/' + p.id + '/motif'] = m; q['loges_ecoles/' + ec.sid + '/paiementsLicence/' + p.id + '/traiteLe'] = now;
            Object.assign(q, entreeJournal(ec.sid, 'paiement_rejete', 'paiement', m));
            FC.majGroupee(q).then(function () { toast('Déclaration rejetée.', 'ok'); chargerTout(false); }, function (er) { toast(Fb.message(er), 'ko'); });
          } }] });
      }
      });
      return;
    }
    if (b.dataset.t) {
      var corps = racine.querySelector('#cdb-tarifs');
      if (b.dataset.t === 'ajouter') { corps.insertAdjacentHTML('beforeend', ligneTarif({ id: FC.cle(), libelle: '', mois: 1, prix: 0, ordre: corps.children.length + 1, actif: true })); return; }
      if (b.dataset.t === 'supprimer') { b.closest('tr').dataset.supprime = '1'; b.closest('tr').style.opacity = '.35'; return; }
      if (b.dataset.t === 'enregistrer') {
        var q2 = {}, erreur = null;
        corps.querySelectorAll('tr').forEach(function (tr) {
          var id = tr.dataset.tarif;
          if (tr.dataset.supprime) { q2['loges_platform/tarifs/' + id] = null; return; }
          var lib = tr.querySelector('[data-k="libelle"]').value.trim(), mois = Number(tr.querySelector('[data-k="mois"]').value), prix = Number(tr.querySelector('[data-k="prix"]').value), ordre = Number(tr.querySelector('[data-k="ordre"]').value) || 0;
          if (lib.length < 2 || !(mois >= 1 && mois <= 36) || !(prix >= 0)) { erreur = 'Carte incomplète : libellé (2 caractères min.), durée 1 à 36 mois, prix positif.'; return; }
          q2['loges_platform/tarifs/' + id] = { libelle: lib, mois: mois, prix: Math.round(prix), ordre: ordre, actif: tr.querySelector('[data-k="actif"]').checked };
        });
        if (erreur) return toast(erreur, 'ko');
        FC.majGroupee(q2).then(function () { toast('Cartes enregistrées.', 'ok'); chargerTout(false); }, function (er) { toast(Fb.message(er), 'ko'); });
        return;
      }
      if (b.dataset.t === 'config') {
        var cfg = { essaiJours: Math.min(31, Math.max(1, Number($('cf-essai').value) || LOGES.essaiParDefaut)), whatsapp: $('cf-wa').value.replace(/[^0-9]/g, '').slice(0, 20),
          devise: ($('cf-devise').value.trim().toUpperCase() || 'GNF').slice(0, 3), publierTarifs: $('cf-publier').checked, instructions: $('cf-instr').value.trim().slice(0, 600), majLe: maintenant() };
        if (!/^[A-Z]{3}$/.test(cfg.devise)) return toast('Devise : 3 lettres (ex. GNF).', 'ko');
        FC.ecrire('loges_platform/config', cfg).then(function () { D.config = cfg; racine.querySelectorAll('#cdb-corps [id^="cf-"]').forEach(function (el) { delete el.dataset.modifie; }); toast('Réglages enregistrés.', 'ok'); }, function (er) { toast(Fb.message(er), 'ko'); });
        return;
      }
    }
    if (b.dataset.f === 'imprimer') { imprimerFacture(D.factures[b.dataset.id]); return; }
    if (b.dataset.s === 'mdp') {
      var a = $('cs-a').value, n = $('cs-n').value, c2 = $('cs-c').value;
      if (n.length < 10 || !/[A-Za-z]/.test(n) || !/[0-9]/.test(n)) return msg('cs-msg', 'Nouveau mot de passe trop faible : 10 caractères, lettres et chiffres.');
      if (n !== c2) return msg('cs-msg', 'Les deux mots de passe ne sont pas identiques.');
      FC.changerMdp(a, n).then(function () { msg('cs-msg', 'Mot de passe modifié.', 'ok'); $('cs-a').value = $('cs-n').value = $('cs-c').value = ''; },
        function (er) { msg('cs-msg', er.code === 'wrong-password' ? 'Mot de passe actuel incorrect.' : Fb.message(er)); });
    }
  }

  // Détails d'une école : comptes et remise d'accès du compte principal
  function details(e) {
    FC.lire('loges_ecoles/' + e.sid + '/membres').then(function (mm) {
      mm = mm || {};
      var liste = Object.keys(mm).filter(function (k) { return mm[k].statut !== 'remplace'; }).map(function (k) { var m = mm[k]; m.uid = k; return m; });
      var proprio = liste.filter(function (m) { return m.proprietaire; })[0];
      modal({ titre: e.info.nom, large: true, corps:
        '<table class="tb" style="min-width:0;margin-bottom:12px"><tr><td>Identifiant</td><td><b>' + esc(e.code) + '</b></td></tr><tr><td>Fondateur</td><td>' + esc(e.info.fondateur || '') + ' — ' + esc(e.info.tel || '') + '</td></tr><tr><td>Localisation</td><td>' + esc([e.info.quartier, e.info.commune, e.info.prefecture, e.info.region].filter(Boolean).join(', ')) + '</td></tr></table>' +
        '<h4 style="margin:10px 0 6px">Comptes (' + liste.length + ')</h4><div class="tab-w"><table class="tb" style="min-width:0"><thead><tr><th>Nom</th><th>Utilisateur</th><th>Rôle</th><th>État</th></tr></thead><tbody>' +
        liste.map(function (m) { return '<tr><td>' + esc(m.nom) + (m.proprietaire ? ' <span class="pastille bleu">principal</span>' : '') + '</td><td>' + esc(m.username) + '</td><td>' + ROLES[m.role] + '</td><td>' + (m.statut === 'actif' ? '<span class="pastille vert">Actif</span>' : '<span class="pastille rouge">Désactivé</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<p style="font-size:13px;color:#475569;margin-top:12px;line-height:1.6">Le concepteur ne voit que les comptes et la licence : aucune donnée pédagogique ni financière de l\'école.</p>',
        boutons: proprio ? [{ txt: 'Fermer' }, { txt: 'Remettre l\'accès du compte principal', cls: 'p', action: function (fermer) { fermer(); remiseProprietaire(e, proprio); } }] : [{ txt: 'Fermer', cls: 'p' }] });
    }, function (er) { toast(Fb.message(er), 'ko'); });
  }

  function remiseProprietaire(e, m) {
    confirmer('Remettre l\'accès du compte principal', 'À faire <b>uniquement après avoir vérifié par téléphone</b> l\'identité de ' + esc(m.nom) + ' (' + esc(e.info.tel || '') + '). Un mot de passe provisoire sera créé pour <b>' + esc(m.username) + '</b> ; l\'opération sera visible dans le journal de l\'école.', 'Remettre l\'accès').then(function (ok) {
      if (!ok) return;
      var mdp = genMdp(), compte = null;
      FC.lire('loges_ecoles/' + e.sid + '/identifiants/' + m.username).then(function (id) {
        var v = ((id && id.v) || 1) + 1;
        return Fb.creerCompteSepare(emailConnexion(m.username, e.code, v), mdp).then(function (c) {
          compte = c;
          var nm = { username: m.username, nom: m.nom, role: 'fondation', statut: 'actif', proprietaire: true, doitChangerMdp: true, creeLe: maintenant(), creePar: ADMIN.uid };
          ['tel', 'email'].forEach(function (k) { if (m[k]) nm[k] = m[k]; });
          var p = {};
          p['loges_utilisateurs/' + c.uid] = { ecole: e.sid };
          p['loges_ecoles/' + e.sid + '/identifiants/' + m.username] = { v: v };
          p['loges_ecoles/' + e.sid + '/membres/' + c.uid] = nm;
          p['loges_ecoles/' + e.sid + '/membres/' + m.uid + '/statut'] = 'remplace';
          p['loges_ecoles/' + e.sid + '/membres/' + m.uid + '/remplacePar'] = c.uid;
          Object.assign(p, entreeJournal(e.sid, 'remise_acces', 'compte', 'compte principal ' + m.username));
          return FC.majGroupee(p).catch(function (er) { return c.annuler().then(function () { throw er; }); });
        });
      }).then(function () { return compte.terminer(); }).then(function () {
        modal({ titre: 'Mot de passe provisoire', corps: '<p style="line-height:1.6">Communiquez ces informations par téléphone. Le titulaire choisira un nouveau mot de passe à la connexion. Affiché une seule fois.</p>' +
          '<table class="tb" style="min-width:0;margin-top:10px;font-size:16px"><tr><td>École</td><td><b>' + esc(e.code) + '</b></td></tr><tr><td>Utilisateur</td><td><b>' + esc(m.username) + '</b></td></tr><tr><td>Mot de passe</td><td><b>' + esc(mdp) + '</b></td></tr></table>',
          boutons: [{ txt: 'Copier', cls: 's', action: function () { copier(mdp); } }, { txt: 'Terminé', cls: 'p' }] });
      }).catch(function (er) { toast(Fb.message(er), 'ko'); });
    });
  }

  return { ouvrir: ouvrir };
})();
