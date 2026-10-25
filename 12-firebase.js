/* ================================================================
   COUCHE D'ACCÈS FIREBASE
   Toute l'application passe par ces fonctions. En production : vrai
   Firebase (Authentication + Realtime Database). Pendant les tests
   automatiques uniquement : serveur de simulation qui applique les
   mêmes règles de sécurité (window.LOGES_SIMULATION).
   Trois instances indépendantes :
     - 'ecole'      : la session de l'école (persistante sur l'appareil)
     - 'concepteur' : la session du concepteur (fermée avec l'onglet)
     - temporaires  : création d'un compte du personnel sans quitter sa session
   ================================================================ */
var Fb = (function () {
  'use strict';
  var SIM = window.LOGES_SIMULATION || null;
  var sdkPret = null, urlBase = null;

  function erreur(code, message) { var e = new Error(message || code); e.code = code; return e; }
  function traduire(e) {
    if (e && e.code && /^[a-z-]+$/.test(e.code)) return e; // déjà traduite
    var c = (e && (e.code || '')) + ' ' + (e && e.message || '');
    if (/PERMISSION_DENIED|permission_denied|permission-denied/i.test(c)) return erreur('permission');
    if (/email-already-in-use/.test(c)) return erreur('exists');
    if (/invalid-credential|wrong-password|user-not-found|invalid-login|invalid-email/.test(c)) return erreur('wrong-password');
    if (/weak-password/.test(c)) return erreur('weak');
    if (/too-many-requests/.test(c)) return erreur('too-many');
    if (/network-request-failed|network|Failed to fetch/i.test(c)) return erreur('network');
    if (/requires-recent-login/.test(c)) return erreur('recent-login');
    if (/operation-not-allowed/.test(c)) return erreur('auth-disabled');
    if (/user-disabled/.test(c)) return erreur('disabled');
    return erreur('inconnu', e && e.message);
  }
  var MESSAGES = {
    permission: "Opération refusée par la base (droits insuffisants, compte désactivé ou licence inactive).",
    exists: 'Ce compte existe déjà.',
    'wrong-password': "Identifiant de l'école, nom d'utilisateur ou mot de passe incorrect.",
    weak: 'Mot de passe trop faible.',
    'too-many': 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
    network: 'Connexion Internet indisponible. Vérifiez le réseau puis réessayez.',
    'recent-login': 'Par sécurité, reconnectez-vous puis recommencez.',
    'auth-disabled': "La connexion par e-mail et mot de passe n'est pas activée dans la console Firebase (Authentication → Sign-in method).",
    disabled: 'Ce compte a été désactivé.',
    sdk: 'Impossible de charger Firebase. Vérifiez la connexion Internet.'
  };
  function message(e) { return MESSAGES[e && e.code] || (e && e.message) || 'Erreur inattendue.'; }

  /* ---------------- Chargement du SDK et adresse de la base ---------------- */
  function script(src) {
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = ok; s.onerror = function () { ko(erreur('sdk')); };
      document.head.appendChild(s);
    });
  }
  function chargerSdk() {
    if (SIM) return Promise.resolve();
    if (sdkPret) return sdkPret;
    var base = 'https://www.gstatic.com/firebasejs/' + LOGES.sdk + '/';
    sdkPret = script(base + 'firebase-app-compat.js')
      .then(function () { return Promise.all([script(base + 'firebase-auth-compat.js'), script(base + 'firebase-database-compat.js')]); })
      .catch(function (e) { sdkPret = null; throw e; });
    return sdkPret;
  }
  function sonder(url) {
    return fetch(url + '/loges_platform/config.json', { cache: 'no-store' }).then(function (r) {
      return r.text().then(function (t) {
        if (r.status === 200 || r.status === 401) return url;
        var m = t.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.firebasedatabase\.app/);
        return m ? m[0] : null;
      });
    }).catch(function () { return null; });
  }
  function adresseBase() {
    if (LOGES.firebase.databaseURL) return Promise.resolve(LOGES.firebase.databaseURL);
    if (urlBase) return Promise.resolve(urlBase);
    var memo = lsGet('loges_db_url', null);
    if (memo) { urlBase = memo; return Promise.resolve(memo); }
    var p = LOGES.firebase.projectId;
    var cands = ['https://' + p + '-default-rtdb.firebaseio.com',
      'https://' + p + '-default-rtdb.europe-west1.firebasedatabase.app',
      'https://' + p + '-default-rtdb.asia-southeast1.firebasedatabase.app'];
    return cands.reduce(function (ch, u) { return ch.then(function (t) { return t || sonder(u); }); }, Promise.resolve(null))
      .then(function (u) { if (u) { urlBase = u; lsSet('loges_db_url', u); } return u || cands[0]; });
  }

  /* ---------------- Identifiants de push (ordre chronologique) ---------------- */
  var PUSH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz', dernierT = 0, derniersAl = [];
  function cleLocale(t) {
    var i, now = t || Date.now(), dup = now === dernierT; dernierT = now;
    var tc = new Array(8);
    for (i = 7; i >= 0; i--) { tc[i] = PUSH.charAt(now % 64); now = Math.floor(now / 64); }
    var id = tc.join('');
    if (!dup) { for (i = 0; i < 12; i++) derniersAl[i] = Math.floor(Math.random() * 64); }
    else { for (i = 11; i >= 0 && derniersAl[i] === 63; i--) derniersAl[i] = 0; derniersAl[i]++; }
    for (i = 0; i < 12; i++) id += PUSH.charAt(derniersAl[i]);
    return id;
  }

  /* ================= Instance Firebase réelle ================= */
  function instanceFirebase(nom, persistance) {
    var app, auth, db, decalage = 0, connecte = true, abonnesCx = [], pret, temp = nom.indexOf('temp-') === 0;
    var ouverture = chargerSdk().then(adresseBase).then(function (url) {
      var cfg = Object.assign({}, LOGES.firebase, { databaseURL: url });
      var existante = firebase.apps.filter(function (a) { return a.name === (nom === 'ecole' ? '[DEFAULT]' : 'loges-' + nom); })[0];
      app = existante || (nom === 'ecole' ? firebase.initializeApp(cfg) : firebase.initializeApp(cfg, 'loges-' + nom));
      auth = app.auth(); db = app.database();
      var P = firebase.auth.Auth.Persistence;
      return auth.setPersistence(persistance === 'session' ? P.SESSION : persistance === 'none' ? P.NONE : P.LOCAL).catch(function () {});
    }).then(function () {
      if (!temp) {
        db.ref('.info/serverTimeOffset').on('value', function (s) { decalage = s.val() || 0; });
        db.ref('.info/connected').on('value', function (s) {
          connecte = s.val() === true; abonnesCx.forEach(function (f) { try { f(connecte); } catch (e) { /* ignore */ } });
        });
      }
      return new Promise(function (ok) { var fin = auth.onAuthStateChanged(function () { fin(); ok(); }); });
    });
    pret = ouverture.catch(function (e) { throw traduire(e); });
    function u() { var x = auth && auth.currentUser; return x ? { uid: x.uid, email: x.email, emailVerified: x.emailVerified } : null; }
    function apres(f) { return pret.then(f).catch(function (e) { throw traduire(e); }); }
    return {
      mode: 'firebase',
      pret: function () { return pret; },
      user: u,
      surUtilisateur: function (cb) { return pret.then(function () { return auth.onAuthStateChanged(function () { cb(u()); }); }); },
      connexion: function (email, mdp) { return apres(function () { return auth.signInWithEmailAndPassword(email, mdp); }).then(u); },
      inscription: function (email, mdp) { return apres(function () { return auth.createUserWithEmailAndPassword(email, mdp); }).then(u); },
      deconnexion: function () { return apres(function () { return auth.signOut(); }); },
      supprimerCompte: function () { return apres(function () { return auth.currentUser && auth.currentUser.delete(); }); },
      changerMdp: function (actuel, nouveau) {
        return apres(function () {
          var x = auth.currentUser;
          return x.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(x.email, actuel)).then(function () { return x.updatePassword(nouveau); });
        });
      },
      envoyerVerification: function () { return apres(function () { return auth.currentUser.sendEmailVerification(); }); },
      recharger: function () { return apres(function () { var x = auth.currentUser; return x.reload().then(function () { return x.getIdToken(true); }); }).then(u); },
      lire: function (chemin, opts) {
        return apres(function () {
          var r = db.ref(chemin);
          if (opts && opts.dernier) r = r.orderByKey().limitToLast(opts.dernier);
          return r.once('value').then(function (s) { return s.val(); });
        });
      },
      ecrire: function (chemin, val) { return apres(function () { return db.ref(chemin).set(val); }); },
      majGroupee: function (patch) { return apres(function () { return db.ref().update(patch); }); },
      surveiller: function (chemin, cb) {
        var arret = false, r, f;
        pret.then(function () {
          if (arret) return;
          r = db.ref(chemin);
          f = r.on('value', function (s) { cb(s.val(), null); }, function (e) { cb(null, traduire(e)); });
        });
        return function () { arret = true; if (r && f) r.off('value', f); };
      },
      cle: function () { return db ? db.ref().push().key : cleLocale(Date.now() + decalage); },
      maintenant: function () { return Date.now() + decalage; },
      TS: function () { return firebase.database.ServerValue.TIMESTAMP; },
      estConnecte: function () { return connecte && navigator.onLine; },
      surConnexion: function (f) { abonnesCx.push(f); },
      detruire: function () { return pret.then(function () { return auth.signOut().catch(function () {}).then(function () { return app.delete(); }); }).catch(function () {}); }
    };
  }

  /* ================= Instance de simulation (tests automatiques uniquement) ================= */
  function instanceSimulation(nom, persistance) {
    var magasin = persistance === 'session' ? sessionStorage : persistance === 'none' ? null : localStorage;
    var cleMag = 'loges_sim_' + nom, jeton = null, utilisateur = null, abonnes = [], decalage = 0;
    function appel(route, corps) {
      return fetch(SIM + '/' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps || {}) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw erreur(j.code || 'inconnu'); return j; }); },
          function () { throw erreur('network'); });
    }
    function horloge() { return fetch(SIM + '/time', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (j) { decalage = j.now - Date.now(); }).catch(function () {}); }
    function poser(j) {
      jeton = j ? j.token : null; utilisateur = j ? j.user : null;
      if (magasin) { try { if (jeton) magasin.setItem(cleMag, jeton); else magasin.removeItem(cleMag); } catch (e) { /* ignore */ } }
      abonnes.forEach(function (f) { f(utilisateur); });
      return utilisateur;
    }
    var pret = horloge().then(function () {
      var t = null; try { t = magasin && magasin.getItem(cleMag); } catch (e) { /* ignore */ }
      if (!t) return;
      return appel('auth/me', { token: t }).then(function (j) { jeton = t; utilisateur = j.user; }, function () { poser(null); });
    });
    setInterval(horloge, 5000);
    return {
      mode: 'simulation',
      pret: function () { return pret; },
      user: function () { return utilisateur; },
      surUtilisateur: function (cb) { abonnes.push(cb); return Promise.resolve(function () {}); },
      connexion: function (email, mdp) { return appel('auth/signIn', { email: email, password: mdp }).then(poser); },
      inscription: function (email, mdp) { return appel('auth/signUp', { email: email, password: mdp }).then(poser); },
      deconnexion: function () { var t = jeton; poser(null); return appel('auth/signOut', { token: t }).catch(function () {}); },
      supprimerCompte: function () { var t = jeton; return appel('auth/delete', { token: t }).then(function () { poser(null); }); },
      changerMdp: function (actuel, nouveau) { return appel('auth/password', { token: jeton, current: actuel, next: nouveau }); },
      envoyerVerification: function () { return appel('auth/sendVerification', { token: jeton }); },
      recharger: function () { return appel('auth/me', { token: jeton }).then(function (j) { utilisateur = j.user; return utilisateur; }); },
      lire: function (chemin, opts) { return appel('db/get', { token: jeton, path: chemin, last: opts && opts.dernier }).then(function (j) { return j.value; }); },
      ecrire: function (chemin, val) { return appel('db/set', { token: jeton, path: chemin, value: val }); },
      majGroupee: function (patch) { return appel('db/update', { token: jeton, patch: patch }); },
      surveiller: function (chemin, cb) {
        var dernier = '__', arret = false;
        function tour() {
          if (arret) return;
          appel('db/get', { token: jeton, path: chemin }).then(function (j) {
            var s = JSON.stringify(j.value); if (s !== dernier) { dernier = s; cb(j.value, null); }
          }, function (e) { if (dernier !== 'ERR') { dernier = 'ERR'; cb(null, e); } }).then(function () { setTimeout(tour, 1500); });
        }
        pret.then(tour);
        return function () { arret = true; };
      },
      cle: function () { return cleLocale(Date.now() + decalage); },
      maintenant: function () { return Date.now() + decalage; },
      TS: function () { return { '.sv': 'timestamp' }; },
      estConnecte: function () { return navigator.onLine; },
      surConnexion: function () {},
      detruire: function () { return Promise.resolve(); }
    };
  }

  var instances = {};
  function instance(nom, persistance) {
    if (!instances[nom] || nom.indexOf('temp-') === 0) {
      instances[nom] = SIM ? instanceSimulation(nom, persistance) : instanceFirebase(nom, persistance);
    }
    return instances[nom];
  }

  // Crée un compte Auth SANS quitter la session en cours (instance temporaire).
  // Renvoie { uid, annuler() } ; annuler() supprime le compte si la suite échoue.
  function creerCompteSepare(email, mdp) {
    var t = instance('temp-' + Date.now() + Math.random().toString(36).slice(2, 6), 'none');
    return t.pret().then(function () { return t.inscription(email, mdp); }).then(function (usr) {
      return {
        uid: usr.uid,
        annuler: function () { return t.supprimerCompte().catch(function () {}).then(function () { return t.detruire(); }); },
        terminer: function () { return t.deconnexion().catch(function () {}).then(function () { return t.detruire(); }); }
      };
    }, function (e) { t.detruire(); throw e; });
  }

  return { instance: instance, creerCompteSepare: creerCompteSepare, message: message, erreur: erreur, simulation: !!SIM, adresseBase: adresseBase };
})();
