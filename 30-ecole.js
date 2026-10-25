/* ================================================================
   ESPACE DE L'ÉCOLE : session, menu, pages, licence
   ================================================================ */
var Ecole = (function () {
  'use strict';
  var S = null;               // { code, sid, uid, membre, info, licence, parametres, config }
  var arrets = [];            // surveillances en cours
  var minuterieInactivite = null;
  var DOMAINE = { fondation: 'admin', direction: 'pedagogie', comptabilite: 'finance' };
  var ESPACE = { fondation: 'Espace Fondation', direction: 'Espace Direction', comptabilite: 'Espace Comptabilité' };
  var DROITS = {
    fondation: { comptes: 'gerer', parametres: 'gerer', annees: 'lire', licence: true, journal: ['admin', 'pedagogie', 'finance', 'plateforme'] },
    direction: { comptes: 'lire', parametres: 'lire', annees: 'gerer', licence: false, journal: ['pedagogie'] },
    comptabilite: { comptes: null, parametres: 'lire', annees: 'lire', licence: true, journal: ['finance'] }
  };
  var STATUT_ANNEE = { preparation: ['En préparation', 'ambre'], ouverte: ['Ouverte', 'vert'], cloturee: ['Clôturée', 'gris'], archivee: ['Archivée', 'gris'] };
  var ACTIONS = { creation: 'Création', modification: 'Modification', ouverture: 'Ouverture', cloture: 'Clôture', archivage: 'Archivage',
    reouverture: 'Réouverture', desactivation: 'Désactivation', reactivation: 'Réactivation', remise_acces: "Remise d'accès",
    declaration: 'Déclaration de paiement', deblocage: 'Déblocage', blocage: 'Blocage', activation: 'Activation de licence',
    prolongation: "Prolongation d'essai", paiement_valide: 'Paiement validé', paiement_rejete: 'Paiement rejeté', courante: 'Année courante' };
  var OBJETS = { ecole: "l'école", compte: 'compte', annee: 'année scolaire', niveau: 'niveau', parametres: 'paramètres', licence: 'licence', paiement: 'paiement' };
  var DOMAINES = { admin: 'Administration', pedagogie: 'Pédagogie', finance: 'Finances', plateforme: 'Plateforme' };

  function ref(c) { return 'loges_ecoles/' + S.sid + (c ? '/' + c : ''); }
  function droits() { return DROITS[S.membre.role] || DROITS.comptabilite; }
  function fmtD(v) { return fmtDate(v, (S && S.parametres && S.parametres.formatDate) || 'JJ/MM/AAAA'); }
  function fmtDH(v) { return fmtDateHeure(v, (S && S.parametres && S.parametres.formatDate) || 'JJ/MM/AAAA'); }
  function err(texte, champ) { var e = new Error(texte); e.texte = texte; e.champ = champ; return e; }
  function exigerReseau() { if (!FE.estConnecte()) { toast('Connexion Internet requise pour enregistrer.', 'ko'); return false; } return true; }

  function entree(action, objet, detail, domaine) {
    var o = {}, k = FE.cle(), e = { t: FE.TS(), uid: S.uid, auteur: S.membre.username, action: action, objet: objet };
    if (detail) e.detail = String(detail).slice(0, 500);
    o[ref('journal/' + (domaine || DOMAINE[S.membre.role]) + '/' + k)] = e;
    return o;
  }
  function etatLicence(l, maintenant) {
    maintenant = maintenant || FE.maintenant();
    if (!l) return { valide: false, statut: 'inconnu', jours: 0 };
    if (l.statut === 'bloque') return { valide: false, statut: 'bloque', jours: joursRestants(l.expiration, maintenant), motif: l.motif };
    var j = joursRestants(l.expiration, maintenant);
    if (!(l.expiration > maintenant)) return { valide: false, statut: 'expire', jours: j, essai: l.statut === 'essai' };
    return { valide: true, statut: l.statut, jours: j };
  }

  /* ======================= CONNEXION ET SESSION ======================= */
  function connexion(code, user, mdp) {
    return FE.lire('loges_codes/' + code).then(function (sid) {
      if (!sid) throw err("Aucune école n'est enregistrée avec cet identifiant.");
      return FE.lire('loges_ecoles/' + sid + '/identifiants/' + user).then(function (id) {
        var v = (id && id.v) || 1;
        return FE.connexion(emailConnexion(user, code, v), mdp).catch(function (e) {
          if (e.code === 'wrong-password') throw err("Nom d'utilisateur ou mot de passe incorrect.");
          throw e;
        });
      }).then(function () { return ouvrirSession(sid); });
    });
  }

  function ouvrirSession(sid) {
    var u = FE.user();
    if (!u) return Promise.reject(err('Session expirée.'));
    return FE.lire('loges_utilisateurs/' + u.uid).then(function (r) {
      if (!r || (sid && r.ecole !== sid)) { FE.deconnexion(); throw err("Ce compte n'est rattaché à aucune école sur LOGES."); }
      sid = r.ecole;
      return FE.lire('loges_ecoles/' + sid + '/membres/' + u.uid);
    }).then(function (m) {
      if (!m) { FE.deconnexion(); throw err('Compte introuvable dans cette école.'); }
      if (m.statut === 'desactive') { FE.deconnexion(); throw err("Ce compte a été désactivé par l'administrateur de votre école."); }
      if (m.statut === 'remplace') { FE.deconnexion(); throw err("Cet accès a été remplacé. Utilisez le mot de passe provisoire qui vous a été remis."); }
      return Promise.all([
        FE.lire('loges_ecoles/' + sid + '/info'), FE.lire('loges_ecoles/' + sid + '/licence'),
        FE.lire('loges_ecoles/' + sid + '/parametres'), FE.lire('loges_platform/config').catch(function () { return null; })
      ]).then(function (x) {
        S = { sid: sid, uid: u.uid, membre: m, info: x[0], licence: x[1], parametres: x[2] || {}, config: x[3] || {}, code: x[0].code };
        memoriserEcole(S.code, S.info.nom, m.username);
        var p = {}; var k = FE.cle();
        p[ref('membres/' + S.uid + '/derniereConnexion')] = FE.TS();
        p[ref('connexions/' + k)] = { t: FE.TS(), uid: S.uid };
        FE.majGroupee(p).catch(function () {});
        surveiller();
        aiguiller();
      });
    });
  }

  function aiguiller() {
    appliquerCouleur();
    if (S.membre.doitChangerMdp) return ecranMdpImpose();
    if (!etatLicence(S.licence).valide) return ecranLicence();
    entrer();
  }

  function surveiller() {
    arrets.forEach(function (f) { f(); }); arrets = [];
    arrets.push(FE.surveiller(ref('membres/' + S.uid), function (m) {
      if (!S) return;
      if (!m || m.statut !== 'actif') return deconnecter(m && m.statut === 'remplace' ? 'Votre accès a été remplacé par un administrateur.' : 'Votre compte a été désactivé.');
      var roleChange = m.role !== S.membre.role; S.membre = m;
      if (roleChange) { toast('Votre rôle a changé : ' + ROLES[m.role] + '.', 'ok'); aiguiller(); }
    }));
    arrets.push(FE.surveiller(ref('licence'), function (l, e) {
      if (!S || e || !l) return;
      var avant = etatLicence(S.licence).valide; S.licence = l; var apres = etatLicence(l).valide;
      if (avant && !apres) ecranLicence();
      else if (!avant && apres && !S.membre.doitChangerMdp) { toast('Licence active : accès rétabli.', 'ok'); entrer(); }
    }));
  }

  function deconnecter(raison) {
    arrets.forEach(function (f) { f(); }); arrets = [];
    clearInterval(minuterieInactivite);
    S = null;
    FE.deconnexion().catch(function () {});
    document.documentElement.style.removeProperty('--accent');
    rendreAccueil();
    if (raison) setTimeout(function () { toast(raison, 'ko'); }, 50);
  }

  function inactivite() {
    var dernier = Date.now();
    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) { window.addEventListener(ev, function () { dernier = Date.now(); }, { passive: true }); });
    clearInterval(minuterieInactivite);
    minuterieInactivite = setInterval(function () {
      if (S && Date.now() - dernier > LOGES.inactiviteMinutes * 60000) deconnecter('Session fermée après ' + LOGES.inactiviteMinutes + " minutes d'inactivité.");
    }, 30000);
  }

  function appliquerCouleur() {
    var c = (S.parametres && S.parametres.couleur) || '#1D4ED8';
    $('ecran-app').style.setProperty('--accent', c);
    $('ecran-plein').style.setProperty('--accent', c);
  }

  /* ======================= CRÉATION D'UNE ÉCOLE ======================= */
  function creer(v) {
    var email = emailConnexion(v.user, v.code, 1), essai = LOGES.essaiParDefaut;
    if (v.logo && v.logo.length > 300000) return Promise.reject(err('Logo trop lourd : choisissez une image plus simple.', 'logo'));
    return FE.lire('loges_codes/' + v.code).then(function (pris) {
      if (pris) throw err('Cet identifiant est déjà utilisé : choisissez-en un autre.', 'code');
      return FE.lire('loges_platform/config').catch(function () { return null; });
    }).then(function (cfg) {
      if (cfg && cfg.essaiJours) essai = Math.min(31, Number(cfg.essaiJours));
      return FE.inscription(email, v.mdp).catch(function (e) {
        // Compte déjà existant : création précédente interrompue par la même personne ?
        if (e.code !== 'exists') throw e;
        return FE.connexion(email, v.mdp).catch(function () {
          throw err("Ce nom d'utilisateur ne peut pas être utilisé avec cet identifiant d'école. Choisissez-en un autre.", 'user');
        }).then(function () {
          return FE.lire('loges_utilisateurs/' + FE.user().uid).then(function (r) { if (r) return { deja: r.ecole }; });
        });
      });
    }).then(function (res) {
      if (res && res.deja) return ouvrirSession(res.deja);
      var uid = FE.user().uid, sid = FE.cle(), now = FE.maintenant(), y = Number(v.annee.split('-')[0]);
      var nomFondateur = (v.prenom + ' ' + v.nomf).trim();
      var niveaux = {};
      ['1re année', '2e année', '3e année', '4e année', '5e année', '6e année'].forEach(function (n, i) {
        niveaux[FE.cle()] = { code: (i + 1) + 'AP', nom: n, ordre: i + 1, actif: true, cycle: 'primaire' };
      });
      var info = { code: v.code, nom: v.nom, fondateur: nomFondateur, tel: v.tel, region: v.region, prefecture: v.pref, commune: v.commune, quartier: v.quartier, devise: v.devise || 'GNF', creeLe: now, creePar: uid };
      if (v.email) info.email = v.email;
      var parametres = { couleur: '#1D4ED8', formatDate: 'JJ/MM/AAAA' };
      if (v.logo) parametres.logo = v.logo;
      var membre = { username: v.user, nom: nomFondateur, role: 'fondation', statut: 'actif', proprietaire: true, doitChangerMdp: false, tel: v.tel, creeLe: now, creePar: uid };
      if (v.email) membre.email = v.email;
      var annees = {}; annees[FE.cle()] = { libelle: v.annee, debut: y + '-10-01', fin: (y + 1) + '-07-31', statut: 'ouverte', courante: true, creeLe: now, creePar: uid };
      var ident = {}; ident[v.user] = { v: 1 };
      var membres = {}; membres[uid] = membre;
      var journal = { admin: {} }; journal.admin[FE.cle()] = { t: FE.TS(), uid: uid, auteur: v.user, action: 'creation', objet: 'ecole', detail: v.nom };
      var p = {};
      p['loges_codes/' + v.code] = sid;
      p['loges_utilisateurs/' + uid] = { ecole: sid };
      p['loges_ecoles/' + sid] = { info: info, licence: { statut: 'essai', debut: now, expiration: now + essai * 86400000 }, parametres: parametres,
        identifiants: ident, membres: membres, annees: annees, niveaux: niveaux, journal: journal };
      return FE.majGroupee(p).catch(function (e) {
        return FE.supprimerCompte().catch(function () {}).then(function () {
          if (e.code === 'permission') throw err("La création a été refusée : l'identifiant vient peut-être d'être pris. Choisissez-en un autre.", 'code');
          throw e;
        });
      }).then(function () {
        memoriserEcole(v.code, v.nom, v.user);
        return ouvrirSession(sid).then(function () {
          modal({ titre: 'Votre école est créée', corps:
            '<p style="line-height:1.6">Notez ces informations : elles servent à chaque connexion.</p>' +
            '<table class="tb" style="min-width:0;margin-top:12px"><tr><td>Identifiant de l\'école</td><td><b>' + esc(v.code) + '</b></td></tr><tr><td>Nom d\'utilisateur</td><td><b>' + esc(v.user) + '</b></td></tr></table>' +
            '<div class="alerte info" style="margin-top:14px">Étape suivante : créez les comptes de la Direction et de la Comptabilité dans « Comptes utilisateurs ». Essai gratuit de ' + essai + ' jours.</div>',
            boutons: [{ txt: 'Copier', cls: 's', action: function () { copier('LOGES\nIdentifiant de l\'école : ' + v.code + '\nNom d\'utilisateur : ' + v.user); } },
              { txt: 'Commencer', cls: 'p' }] });
        });
      });
    });
  }

  /* ======================= COQUILLE (menu) ======================= */
  var PAGES = [
    { id: 'tableau-de-bord', titre: 'Tableau de bord', ic: '▦', voir: function () { return true; } },
    { id: 'annees', titre: 'Années scolaires et niveaux', ic: '📅', voir: function () { return !!droits().annees; } },
    { id: 'comptes', titre: 'Comptes utilisateurs', ic: '👥', voir: function () { return !!droits().comptes; } },
    { id: 'parametres', titre: "Paramètres de l'école", ic: '⚙', voir: function () { return !!droits().parametres; } },
    { id: 'licence', titre: 'Licence', ic: '🔑', voir: function () { return droits().licence; } },
    { id: 'journal', titre: 'Journal des opérations', ic: '🕘', voir: function () { return true; } }
  ];

  function logoEcole(taille) {
    var l = S.parametres && S.parametres.logo;
    if (l) return '<img src="' + esc(l) + '" alt="">';
    return '<span style="font-size:' + Math.round(taille * 0.36) + 'px">' + esc(initialesEcole(S.info.nom)) + '</span>';
  }

  function rendreMenu(courante, anneeTxt) {
    var nom = (S.parametres && S.parametres.nomCourt) || S.info.nom;
    $('lat').innerHTML =
      '<div class="ec"><div class="lg">' + logoEcole(44) + '</div><div style="min-width:0"><b>' + esc(nom) + '</b><small>' + esc(anneeTxt) + '</small></div></div>' +
      '<div class="espace">' + ESPACE[S.membre.role] + '</div>' +
      '<nav>' + PAGES.filter(function (p) { return p.voir(); }).map(function (p) {
        return '<a href="#/' + p.id + '" class="' + (p.id === courante ? 'on' : '') + '"><span class="ic" aria-hidden="true">' + p.ic + '</span>' + p.titre + '</a>';
      }).join('') + '</nav>' +
      '<div class="bas"><a href="#/mon-compte" class="' + (courante === 'mon-compte' ? 'on' : '') + '"><span aria-hidden="true">👤</span><span style="text-align:left;line-height:1.2"><b style="display:block;color:#fff">' + esc(S.membre.nom) + '</b><small style="color:#7c8aa3">' + ROLES[S.membre.role] + (S.membre.proprietaire ? ' — compte principal' : '') + '</small></span></a>' +
      '<button type="button" id="btn-deconnexion"><span aria-hidden="true">⎋</span>Se déconnecter</button></div>';
    $('barre-mob-txt').innerHTML = '<b>' + esc(nom) + '</b><small>' + esc(anneeTxt) + '</small>';
    $('btn-deconnexion').onclick = function () { deconnecter(); };
  }

  var anneeCouranteTxt = '';
  function entrer() {
    montrer('ecran-app');
    inactivite();
    if (!location.hash || location.hash.indexOf('#/') !== 0) history.replaceState(null, '', '#/tableau-de-bord');
    FE.lire(ref('annees')).then(function (a) {
      var c = a && Object.keys(a).map(function (k) { return a[k]; }).filter(function (x) { return x.courante; })[0];
      anneeCouranteTxt = c ? 'Année ' + c.libelle : 'Aucune année courante';
      router();
    }, function () { anneeCouranteTxt = ''; router(); });
    Pwa.proposerApresConnexion();
  }

  function router() {
    if (!S || !$('ecran-app').classList.contains('on')) return;
    var id = (location.hash.replace(/^#\//, '') || 'tableau-de-bord').split('?')[0];
    var page = PAGES.filter(function (p) { return p.id === id; })[0];
    if (id !== 'mon-compte' && (!page || !page.voir())) { id = 'tableau-de-bord'; }
    rendreMenu(id, anneeCouranteTxt);
    $('lat').classList.remove('ouvert'); $('voile').classList.remove('on');
    var zone = $('page');
    zone.innerHTML = '<p style="color:#8a94a6">Chargement…</p>';
    var f = { 'tableau-de-bord': pageTableau, annees: pageAnnees, comptes: pageComptes, parametres: pageParametres, licence: pageLicence, journal: pageJournal, 'mon-compte': pageMonCompte }[id];
    document.title = (page ? page.titre : 'Mon compte') + ' — ' + ((S.parametres && S.parametres.nomCourt) || S.info.nom);
    Promise.resolve().then(function () { return f(zone); }).catch(function (e) {
      zone.innerHTML = '<div class="alerte ko">' + esc(Fb.message(e)) + '</div><button class="bt s" onclick="location.reload()">Recharger</button>';
    });
  }

  /* ======================= TABLEAU DE BORD ======================= */
  function lireJournaux(domaines, n) {
    return Promise.all(domaines.map(function (d) {
      return FE.lire(ref('journal/' + d), { dernier: n || 300 }).then(function (j) {
        return j ? Object.keys(j).map(function (k) { var e = j[k]; e.id = k; e.domaine = d; return e; }) : [];
      }, function () { return []; });
    })).then(function (l) { return [].concat.apply([], l).sort(function (a, b) { return (b.t || 0) - (a.t || 0); }); });
  }
  function ligneJournal(e) {
    return '<li><span class="dt">' + fmtDH(e.t) + '</span><span><b>' + esc(ACTIONS[e.action] || e.action) + '</b> (' + esc(OBJETS[e.objet] || e.objet) + ')' +
      (e.detail ? ' — ' + esc(e.detail) : '') + ' <span style="color:#8a94a6">par ' + esc(e.auteur || '?') + '</span></span></li>';
  }

  function pageTableau(z) {
    var d = droits(), l = etatLicence(S.licence);
    return Promise.all([
      FE.lire(ref('annees')), FE.lire(ref('niveaux')),
      d.comptes ? FE.lire(ref('membres')) : Promise.resolve(null),
      lireJournaux(d.journal, 8)
    ]).then(function (x) {
      var annees = x[0] || {}, niveaux = x[1] || {}, membres = x[2], ops = x[3].slice(0, 8);
      var cour = Object.keys(annees).map(function (k) { return annees[k]; }).filter(function (a) { return a.courante; })[0];
      var nivActifs = Object.keys(niveaux).map(function (k) { return niveaux[k]; }).filter(function (n) { return n.actif; }).sort(function (a, b) { return a.ordre - b.ordre; });
      var actifs = membres ? Object.keys(membres).filter(function (k) { return membres[k].statut === 'actif'; }).length : null;
      var parRole = { fondation: 0, direction: 0, comptabilite: 0 };
      if (membres) Object.keys(membres).forEach(function (k) { if (membres[k].statut === 'actif' && parRole[membres[k].role] !== undefined) parRole[membres[k].role]++; });
      var licTxt = l.statut === 'essai' ? 'Essai gratuit' : l.statut === 'actif' ? 'Licence active' : '—';
      var rac = [];
      if (d.comptes === 'gerer') rac.push(['#/comptes?nouveau=1', '👥', 'Créer un compte pour le personnel']);
      if (d.annees) rac.push(['#/annees', '📅', d.annees === 'gerer' ? 'Gérer les années et les niveaux' : 'Voir les années scolaires']);
      if (d.parametres) rac.push(['#/parametres', '⚙', d.parametres === 'gerer' ? "Modifier les informations de l'école" : "Informations de l'école"]);
      if (d.licence) rac.push(['#/licence', '🔑', 'Licence et paiements']);
      rac.push(['#/journal', '🕘', 'Consulter le journal des opérations']);
      var prochain = { fondation: 'Phase 3 : consultation des enseignants, classes, emplois du temps, évaluations, résultats et bulletins. Phase 5 : statistiques et rapports.',
        direction: 'Phase 3 : classes, enseignants, matières, taux horaires, emplois du temps, évaluations, notes, résultats et bulletins.',
        comptabilite: 'Phase 4 : inscriptions, frais scolaires, paiements, reçus numérotés, soldes, impayés et rapports.' }[S.membre.role];
      z.innerHTML =
        '<div class="tete-page"><div><h1>Bonjour, ' + esc(S.membre.nom) + '</h1><p class="sous-titre">' + esc(S.info.nom) + ' — ' + ESPACE[S.membre.role] + '</p></div></div>' +
        (S.membre.proprietaire && actifs === 1 ? '<div class="alerte info"><b>Première étape :</b> créez les comptes de la Direction et de la Comptabilité pour que chacun travaille dans son espace. <a href="#/comptes?nouveau=1" style="font-weight:700">Créer un compte</a></div>' : '') +
        (l.valide && l.jours <= 7 ? '<div class="alerte att">' + (l.statut === 'essai' ? 'Votre essai gratuit' : 'Votre licence') + ' se termine dans <b>' + l.jours + ' jour' + (l.jours > 1 ? 's' : '') + '</b>.' + (d.licence ? ' <a href="#/licence" style="font-weight:700">Renouveler</a>' : ' Prévenez la Fondation.') + '</div>' : '') +
        (!cour ? '<div class="alerte att">Aucune année scolaire courante. ' + (d.annees === 'gerer' ? '<a href="#/annees" style="font-weight:700">Définir l\'année courante</a>' : 'La Direction doit la définir.') + '</div>' : '') +
        '<div class="grille">' +
          '<div class="tuile bleu"><div class="l">Année scolaire</div><div class="v">' + (cour ? esc(cour.libelle) : '—') + '</div><div class="d">' + (cour ? 'du ' + fmtD(cour.debut) + ' au ' + fmtD(cour.fin) : 'non définie') + '</div></div>' +
          (actifs !== null ? '<div class="tuile vert"><div class="l">Comptes actifs</div><div class="v">' + actifs + '</div><div class="d">Fondation ' + parRole.fondation + ' · Direction ' + parRole.direction + ' · Comptabilité ' + parRole.comptabilite + '</div></div>' : '') +
          '<div class="tuile jaune"><div class="l">Niveaux configurés</div><div class="v">' + nivActifs.length + '</div><div class="d">' + esc(nivActifs.map(function (n) { return n.nom; }).join(', ')) + '</div></div>' +
          '<div class="tuile ' + (l.jours <= 7 ? 'rouge' : 'bleu') + '"><div class="l">' + licTxt + '</div><div class="v">' + Math.max(0, l.jours) + ' jour' + (l.jours > 1 ? 's' : '') + '</div><div class="d">jusqu\'au ' + fmtD(S.licence.expiration) + '</div></div>' +
        '</div>' +
        '<div class="g2"><div class="carte"><h2>Accès rapides</h2><div class="raccourcis">' + rac.map(function (r) { return '<a href="' + r[0] + '"><span aria-hidden="true">' + r[1] + '</span>' + r[2] + '</a>'; }).join('') + '</div></div>' +
        '<div class="carte"><h2>Dernières opérations</h2>' + (ops.length ? '<ul class="liste-op">' + ops.map(ligneJournal).join('') + '</ul>' : '<p style="color:#8a94a6">Aucune opération pour le moment.</p>') + '</div></div>' +
        '<div class="carte"><h2>Prochainement dans votre espace</h2><p style="color:#475569;line-height:1.6">' + prochain + '</p></div>';
    });
  }

  /* ======================= ANNÉES ET NIVEAUX ======================= */
  function pageAnnees(z) {
    var gerer = droits().annees === 'gerer';
    return Promise.all([FE.lire(ref('annees')), FE.lire(ref('niveaux'))]).then(function (x) {
      var annees = x[0] || {}, niveaux = x[1] || {};
      var la = Object.keys(annees).map(function (k) { var a = annees[k]; a.id = k; return a; }).sort(function (a, b) { return b.debut < a.debut ? -1 : 1; });
      var ln = Object.keys(niveaux).map(function (k) { var n = niveaux[k]; n.id = k; return n; }).sort(function (a, b) { return a.ordre - b.ordre; });
      function boutons(a) {
        if (!gerer) return '';
        var b = [];
        if (!a.courante && (a.statut === 'ouverte' || a.statut === 'preparation')) b.push('<button class="bt s pt" data-courante="' + a.id + '">Définir comme courante</button>');
        if (a.statut === 'preparation') b.push('<button class="bt s pt" data-statut="' + a.id + '" data-vers="ouverte">Ouvrir</button>');
        if (a.statut === 'ouverte') b.push('<button class="bt d pt" data-statut="' + a.id + '" data-vers="cloturee">Clôturer</button>');
        if (a.statut === 'cloturee') b.push('<button class="bt s pt" data-statut="' + a.id + '" data-vers="ouverte">Rouvrir</button><button class="bt s pt" data-statut="' + a.id + '" data-vers="archivee">Archiver</button>');
        return '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' + b.join('') + '</div>';
      }
      z.innerHTML = '<div class="tete-page"><div><h1>Années scolaires et niveaux</h1><p class="sous-titre">Clôturer une année ne supprime jamais ses données.' + (gerer ? '' : ' Consultation seule : la Direction gère les années.') + '</p></div>' +
        (gerer ? '<button class="bt p" id="btn-annee">+ Nouvelle année</button>' : '') + '</div>' +
        '<div class="carte"><h2>Années scolaires</h2>' + (la.length ? '<div class="tab-w"><table class="tb"><thead><tr><th>Année</th><th>Période</th><th>Statut</th><th></th></tr></thead><tbody>' +
          la.map(function (a) { var s = STATUT_ANNEE[a.statut] || [a.statut, 'gris'];
            return '<tr><td><b>' + esc(a.libelle) + '</b>' + (a.courante ? ' <span class="pastille bleu">Année courante</span>' : '') + '</td><td>du ' + fmtD(a.debut) + ' au ' + fmtD(a.fin) + '</td><td><span class="pastille ' + s[1] + '">' + s[0] + '</span></td><td>' + boutons(a) + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '<div class="vide">Aucune année.</div>') + '</div>' +
        '<div class="carte"><h2>Niveaux du primaire</h2><p class="sous-titre" style="margin:-4px 0 10px">Appellations propres à votre école. Préscolaire, collège et lycée pourront être ajoutés.</p><div class="tab-w"><table class="tb"><thead><tr><th>Niveau</th><th>Code</th><th>État</th><th></th></tr></thead><tbody>' +
          ln.map(function (n) { return '<tr><td><b>' + esc(n.nom) + '</b></td><td>' + esc(n.code) + '</td><td>' + (n.actif ? '<span class="pastille vert">Actif</span>' : '<span class="pastille gris">Désactivé</span>') + '</td><td>' +
            (gerer ? '<div style="display:flex;gap:6px;justify-content:flex-end"><button class="bt g pt" data-renommer="' + n.id + '">Renommer</button><button class="bt g pt" data-actif="' + n.id + '">' + (n.actif ? 'Désactiver' : 'Réactiver') + '</button></div>' : '') + '</td></tr>'; }).join('') +
          '</tbody></table></div></div>';
      if (!gerer) return;
      $('btn-annee').onclick = function () {
        var max = la.reduce(function (m, a) { return Math.max(m, Number(a.libelle.split('-')[0])); }, new Date().getFullYear() - 1);
        modal({ titre: 'Nouvelle année scolaire', corps:
          '<div class="ch"><label class="lb" for="na-l">Libellé</label><input class="in-c" id="na-l" value="' + (max + 1) + '-' + (max + 2) + '"></div>' +
          '<div class="g2"><div class="ch"><label class="lb" for="na-d">Début</label><input class="in-c" type="date" id="na-d" value="' + (max + 1) + '-10-01"></div><div class="ch"><label class="lb" for="na-f">Fin</label><input class="in-c" type="date" id="na-f" value="' + (max + 2) + '-07-31"></div></div>' +
          '<label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" id="na-c" style="width:20px;height:20px;margin-top:2px"><span>L\'ouvrir et en faire l\'année courante maintenant<br><small style="color:#475569">Sinon elle est créée « en préparation » pour préparer la rentrée.</small></span></label><div class="ch"><div class="er" id="na-e"></div></div>',
          boutons: [{ txt: 'Annuler' }, { txt: "Créer l'année", cls: 'p', action: function (fermer, bt) {
            var l = $('na-l').value.trim(), d = $('na-d').value, f = $('na-f').value, c = $('na-c').checked, e = $('na-e');
            var y = l.split('-').map(Number);
            if (!/^\d{4}-\d{4}$/.test(l) || y[1] !== y[0] + 1) { e.textContent = 'Libellé attendu : 2027-2028.'; e.classList.add('on'); return; }
            if (!d || !f || f <= d) { e.textContent = 'La date de fin doit suivre la date de début.'; e.classList.add('on'); return; }
            if (la.some(function (a) { return a.libelle === l; })) { e.textContent = 'Cette année existe déjà.'; e.classList.add('on'); return; }
            if (la.some(function (a) { return !(f < a.debut || d > a.fin); })) { e.textContent = 'Les dates chevauchent une autre année.'; e.classList.add('on'); return; }
            if (!exigerReseau()) return;
            var p = {}, k = FE.cle();
            if (c) la.forEach(function (a) { if (a.courante) p[ref('annees/' + a.id + '/courante')] = false; });
            p[ref('annees/' + k)] = { libelle: l, debut: d, fin: f, statut: c ? 'ouverte' : 'preparation', courante: c, creeLe: FE.maintenant(), creePar: S.uid };
            Object.assign(p, entree('creation', 'annee', l));
            occupe(bt, true);
            FE.majGroupee(p).then(function () { fermer(); toast('Année ' + l + ' créée.', 'ok'); router(); }, function (e2) { occupe(bt, false); e.textContent = Fb.message(e2); e.classList.add('on'); });
          } }] });
      };
      z.onclick = function (ev) {
        var t = ev.target.closest('button'); if (!t) return;
        if (t.dataset.courante) {
          var a = annees[t.dataset.courante];
          confirmer("Changer l'année courante", "L'année <b>" + esc(a.libelle) + '</b> sera affichée par défaut dans tous les espaces de l\'école.', 'Définir comme courante').then(function (ok) {
            if (!ok || !exigerReseau()) return;
            var p = {}; la.forEach(function (x) { p[ref('annees/' + x.id + '/courante')] = x.id === t.dataset.courante; });
            Object.assign(p, entree('courante', 'annee', a.libelle));
            FE.majGroupee(p).then(function () { toast(a.libelle + " est l'année courante.", 'ok'); entrer(); }, function (e) { toast(Fb.message(e), 'ko'); });
          });
        } else if (t.dataset.statut) {
          var an = annees[t.dataset.statut], vers = t.dataset.vers;
          var txt = { ouverte: an.statut === 'cloturee' ? ["Rouvrir l'année", 'Permet de corriger des données de cette année. L\'opération est inscrite au journal.', 'Rouvrir', 'reouverture'] : ["Ouvrir l'année", "L'année devient utilisable.", 'Ouvrir', 'ouverture'],
            cloturee: ["Clôturer l'année", 'Les données de l\'année ne pourront plus être modifiées (sauf réouverture tracée). Rien n\'est supprimé.', 'Clôturer', 'cloture'],
            archivee: ["Archiver l'année", 'L\'année reste consultable mais ne pourra plus être rouverte.', 'Archiver', 'archivage'] }[vers];
          confirmer(txt[0] + ' ' + an.libelle, txt[1], txt[2], vers === 'cloturee').then(function (ok) {
            if (!ok || !exigerReseau()) return;
            var p = {}; p[ref('annees/' + t.dataset.statut + '/statut')] = vers;
            if (vers === 'cloturee' || vers === 'archivee') p[ref('annees/' + t.dataset.statut + '/courante')] = false;
            Object.assign(p, entree(txt[3], 'annee', an.libelle));
            FE.majGroupee(p).then(function () { toast('Année ' + an.libelle + ' : ' + STATUT_ANNEE[vers][0].toLowerCase() + '.', 'ok'); entrer(); }, function (e) { toast(Fb.message(e), 'ko'); });
          });
        } else if (t.dataset.renommer) {
          var n = niveaux[t.dataset.renommer];
          modal({ titre: 'Renommer le niveau', corps: '<div class="ch"><label class="lb" for="rn">Nouveau nom</label><input class="in-c" id="rn" maxlength="60" value="' + esc(n.nom) + '"><div class="ai">Code interne : ' + esc(n.code) + '</div></div>',
            boutons: [{ txt: 'Annuler' }, { txt: 'Enregistrer', cls: 'p', action: function (fermer, bt) {
              var v = $('rn').value.trim(); if (!v || !exigerReseau()) return;
              var p = {}; p[ref('niveaux/' + t.dataset.renommer + '/nom')] = v; Object.assign(p, entree('modification', 'niveau', n.nom + ' → ' + v));
              occupe(bt, true);
              FE.majGroupee(p).then(function () { fermer(); toast('Niveau renommé.', 'ok'); router(); }, function (e) { occupe(bt, false); toast(Fb.message(e), 'ko'); });
            } }] });
        } else if (t.dataset.actif) {
          var nv = niveaux[t.dataset.actif]; if (!exigerReseau()) return;
          var p = {}; p[ref('niveaux/' + t.dataset.actif + '/actif')] = !nv.actif; Object.assign(p, entree(nv.actif ? 'desactivation' : 'reactivation', 'niveau', nv.nom));
          FE.majGroupee(p).then(router, function (e) { toast(Fb.message(e), 'ko'); });
        }
      };
    });
  }

  /* ======================= COMPTES UTILISATEURS ======================= */
  function fenetreAcces(titre, username, mdp) {
    var texte = 'LOGES — vos accès\nIdentifiant de l\'école : ' + S.code + '\nNom d\'utilisateur : ' + username + '\nMot de passe provisoire : ' + mdp + '\nVous choisirez votre propre mot de passe à la première connexion.';
    modal({ titre: titre, corps: '<p style="line-height:1.6">Transmettez ces informations à la personne concernée. Le mot de passe provisoire n\'est affiché qu\'une seule fois.</p>' +
      '<table class="tb" style="min-width:0;margin-top:12px;font-size:16px"><tr><td>École</td><td><b>' + esc(S.code) + '</b></td></tr><tr><td>Utilisateur</td><td><b>' + esc(username) + '</b></td></tr><tr><td>Mot de passe</td><td><b style="letter-spacing:.05em">' + esc(mdp) + '</b></td></tr></table>' +
      '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="bt s pt" id="fa-copier">Copier le message</button><a class="bt s pt" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texte) + '">Envoyer par WhatsApp</a></div>',
      boutons: [{ txt: "J'ai transmis ces accès", cls: 'p' }],
      auOuverture: function () { $('fa-copier').onclick = function () { copier(texte); }; } });
  }

  function formulaireMembre(m) {
    var roles = Object.keys(ROLES).map(function (r) { return '<option value="' + r + '"' + ((m ? m.role : 'direction') === r ? ' selected' : '') + '>' + ROLES[r] + '</option>'; }).join('');
    return '<div class="ch"><label class="lb" for="fm-nom">Nom complet</label><input class="in-c" id="fm-nom" maxlength="120" value="' + esc(m ? m.nom : '') + '"><div class="er" id="fm-e-nom"></div></div>' +
      (m ? '' : '<div class="ch"><label class="lb" for="fm-user">Nom d\'utilisateur</label><input class="in-c" id="fm-user" autocapitalize="none" spellcheck="false"><div class="ai">Lettres minuscules, chiffres, tiret ou souligné. Servira à la connexion.</div><div class="er" id="fm-e-user"></div></div>') +
      '<div class="ch"><label class="lb" for="fm-role">Rôle</label><select class="in-c" id="fm-role"' + (m && m.proprietaire ? ' disabled' : '') + '>' + roles + '</select>' + (m && m.proprietaire ? '<div class="ai">Le compte principal garde le rôle Fondation.</div>' : '') + '</div>' +
      '<div class="g2"><div class="ch"><label class="lb" for="fm-tel">Téléphone (facultatif)</label><input class="in-c" id="fm-tel" type="tel" value="' + esc(m && m.tel || '') + '"><div class="er" id="fm-e-tel"></div></div>' +
      '<div class="ch"><label class="lb" for="fm-email">E-mail (facultatif)</label><input class="in-c" id="fm-email" type="email" value="' + esc(m && m.email || '') + '"><div class="er" id="fm-e-email"></div></div></div>' +
      (m ? '' : '<div class="ch"><label class="lb" for="fm-mdp">Mot de passe provisoire</label><div style="display:flex;gap:8px"><input class="in-c" id="fm-mdp" value="' + genMdp() + '"><button type="button" class="bt s" id="fm-gen">Générer</button></div><div class="ai">La personne devra le changer à sa première connexion.</div><div class="er" id="fm-e-mdp"></div></div>') +
      '<div class="er" id="fm-e"></div>';
  }
  function erreurFm(k, t) { var e = $('fm-e-' + k) || $('fm-e'); e.textContent = t || ''; e.classList.toggle('on', !!t); }

  function creerMembre(fermer, bt) {
    var nom = $('fm-nom').value.trim(), user = $('fm-user').value.trim().toLowerCase(), role = $('fm-role').value,
      tel = $('fm-tel').value.trim(), email = $('fm-email').value.trim(), mdp = $('fm-mdp').value;
    var ok = true;
    ['nom', 'user', 'tel', 'email', 'mdp'].forEach(function (k) { erreurFm(k, ''); }); erreurFm('', '');
    if (nom.length < 2) { erreurFm('nom', 'Indiquez le nom complet.'); ok = false; }
    if (!RE_USER.test(user)) { erreurFm('user', '3 à 32 caractères : lettres minuscules, chiffres, tiret ou souligné.'); ok = false; }
    if (tel && !RE_TEL.test(tel)) { erreurFm('tel', 'Numéro invalide.'); ok = false; }
    if (email && !RE_EMAIL.test(email)) { erreurFm('email', 'Adresse invalide.'); ok = false; }
    var pb = mdpProbleme(mdp); if (pb) { erreurFm('mdp', pb); ok = false; }
    if (!ok || !exigerReseau()) return;
    occupe(bt, true, 'Création…');
    var compte = null;
    FE.lire(ref('identifiants/' + user)).then(function (id) {
      if (id) throw err("Ce nom d'utilisateur existe déjà dans votre école.", 'user');
      return Fb.creerCompteSepare(emailConnexion(user, S.code, 1), mdp).catch(function (e) {
        if (e.code === 'exists') throw err("Ce nom d'utilisateur ne peut pas être utilisé : choisissez-en un autre.", 'user');
        throw e;
      });
    }).then(function (c) {
      compte = c;
      var m = { username: user, nom: nom, role: role, statut: 'actif', proprietaire: false, doitChangerMdp: true, creeLe: FE.maintenant(), creePar: S.uid };
      if (tel) m.tel = tel; if (email) m.email = email;
      var p = {};
      p['loges_utilisateurs/' + c.uid] = { ecole: S.sid };
      p[ref('identifiants/' + user)] = { v: 1 };
      p[ref('membres/' + c.uid)] = m;
      Object.assign(p, entree('creation', 'compte', user + ' (' + ROLES[role] + ')'));
      return FE.majGroupee(p).catch(function (e) { return c.annuler().then(function () { throw e; }); });
    }).then(function () {
      return compte.terminer();
    }).then(function () {
      fermer(); fenetreAcces('Compte créé', user, mdp); router();
    }).catch(function (e) {
      occupe(bt, false);
      erreurFm(e.champ || '', e.texte || Fb.message(e));
    });
  }

  function remiseAcces(uidCible, m) {
    confirmer("Remettre l'accès de " + esc(m.nom), 'Un nouveau mot de passe provisoire sera créé pour <b>' + esc(m.username) + '</b>. L\'ancien ne fonctionnera plus et la personne en choisira un nouveau à la connexion.', "Remettre l'accès").then(function (ok) {
      if (!ok || !exigerReseau()) return;
      var mdp = genMdp(), compte = null;
      FE.lire(ref('identifiants/' + m.username)).then(function (id) {
        var v = ((id && id.v) || 1) + 1;
        return Fb.creerCompteSepare(emailConnexion(m.username, S.code, v), mdp).then(function (c) {
          compte = c;
          var nm = { username: m.username, nom: m.nom, role: m.role, statut: 'actif', proprietaire: false, doitChangerMdp: true, creeLe: FE.maintenant(), creePar: S.uid };
          ['tel', 'email', 'accesFinances'].forEach(function (k) { if (m[k] !== undefined && m[k] !== '') nm[k] = m[k]; });
          var p = {};
          p['loges_utilisateurs/' + c.uid] = { ecole: S.sid };
          p[ref('identifiants/' + m.username)] = { v: v };
          p[ref('membres/' + c.uid)] = nm;
          p[ref('membres/' + uidCible + '/statut')] = 'remplace';
          p[ref('membres/' + uidCible + '/remplacePar')] = c.uid;
          Object.assign(p, entree('remise_acces', 'compte', m.username));
          return FE.majGroupee(p).catch(function (e) { return c.annuler().then(function () { throw e; }); });
        });
      }).then(function () { return compte.terminer(); }).then(function () {
        fenetreAcces('Accès remis', m.username, mdp); router();
      }).catch(function (e) { toast(e.texte || Fb.message(e), 'ko'); });
    });
  }

  function pageComptes(z) {
    var gerer = droits().comptes === 'gerer';
    return FE.lire(ref('membres')).then(function (mm) {
      mm = mm || {};
      var liste = Object.keys(mm).filter(function (k) { return mm[k].statut !== 'remplace'; }).map(function (k) { var m = mm[k]; m.uid = k; return m; })
        .sort(function (a, b) { return (b.proprietaire ? 1 : 0) - (a.proprietaire ? 1 : 0) || (a.creeLe || 0) - (b.creeLe || 0); });
      z.innerHTML = '<div class="tete-page"><div><h1>Comptes utilisateurs</h1><p class="sous-titre">Chaque personne a son propre compte. Ses droits dépendent de son rôle : Fondation, Direction ou Comptabilité.' + (gerer ? '' : ' Consultation seule.') + '</p></div>' +
        (gerer ? '<button class="bt p" id="btn-compte">+ Créer un compte</button>' : '') + '</div>' +
        '<div class="tab-w"><table class="tb"><thead><tr><th>Nom</th><th>Rôle</th><th>État</th><th>Dernière connexion</th>' + (gerer ? '<th></th>' : '') + '</tr></thead><tbody>' +
        liste.map(function (m) {
          var moi = m.uid === S.uid, modifiable = gerer && (!m.proprietaire || moi);
          var act = [];
          if (modifiable) act.push('<button class="bt g pt" data-modifier="' + m.uid + '">Modifier</button>');
          if (gerer && !moi && !m.proprietaire) {
            act.push('<button class="bt g pt" data-remise="' + m.uid + '">Remettre l\'accès</button>');
            act.push('<button class="bt g pt" data-etat="' + m.uid + '">' + (m.statut === 'actif' ? 'Désactiver' : 'Réactiver') + '</button>');
          }
          if (gerer && m.role === 'fondation' && !moi) act.push('<button class="bt g pt" data-finances="' + m.uid + '">' + (m.accesFinances ? 'Retirer finances' : 'Accès finances') + '</button>');
          return '<tr><td><b>' + esc(m.nom) + '</b>' + (moi ? ' <span style="color:#8a94a6">(vous)</span>' : '') + '<div style="color:#8a94a6;font-size:13px">' + esc(m.username) + (m.tel ? ' — ' + esc(m.tel) : '') + '</div>' +
            (m.proprietaire ? '<span class="pastille bleu" style="margin-top:4px">Compte principal</span>' : '') + '</td>' +
            '<td>' + ROLES[m.role] + (m.role === 'fondation' && m.accesFinances ? '<div style="color:#8a94a6;font-size:12.5px">+ rapports financiers (lecture)</div>' : '') + '</td>' +
            '<td>' + (m.statut === 'actif' ? '<span class="pastille vert">Actif</span>' : '<span class="pastille rouge">Désactivé</span>') + (m.doitChangerMdp && m.statut === 'actif' ? '<div style="color:#8a94a6;font-size:12.5px">Doit changer son mot de passe</div>' : '') + '</td>' +
            '<td style="color:#475569">' + relatif(m.derniereConnexion) + '</td>' +
            (gerer ? '<td><div style="display:flex;gap:4px;flex-wrap:nowrap;justify-content:flex-end;margin-top:-6px">' + (act.join('') || '<span style="color:#8a94a6;font-size:13px">Modifiable par son titulaire</span>') + '</div></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
      if (!gerer) return;
      function ouvrirCreation() {
        modal({ titre: 'Créer un compte', corps: formulaireMembre(null), boutons: [{ txt: 'Annuler' }, { txt: 'Créer le compte', cls: 'p', action: creerMembre }],
          auOuverture: function () { $('fm-gen').onclick = function () { $('fm-mdp').value = genMdp(); }; $('fm-user').addEventListener('input', function () { this.value = this.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''); }); } });
      }
      $('btn-compte').onclick = ouvrirCreation;
      if (/nouveau=1/.test(location.hash)) { history.replaceState(null, '', '#/comptes'); ouvrirCreation(); }
      z.onclick = function (ev) {
        var t = ev.target.closest('button'); if (!t) return;
        var uid = t.dataset.modifier || t.dataset.remise || t.dataset.etat || t.dataset.finances; if (!uid) return;
        var m = mm[uid];
        if (t.dataset.modifier) {
          modal({ titre: 'Modifier — ' + m.nom, corps: formulaireMembre(m), boutons: [{ txt: 'Annuler' }, { txt: 'Enregistrer', cls: 'p', action: function (fermer, bt) {
            var nom = $('fm-nom').value.trim(), tel = $('fm-tel').value.trim(), email = $('fm-email').value.trim(), role = $('fm-role').value;
            ['nom', 'tel', 'email'].forEach(function (k) { erreurFm(k, ''); });
            if (nom.length < 2) return erreurFm('nom', 'Indiquez le nom complet.');
            if (tel && !RE_TEL.test(tel)) return erreurFm('tel', 'Numéro invalide.');
            if (email && !RE_EMAIL.test(email)) return erreurFm('email', 'Adresse invalide.');
            if (!exigerReseau()) return;
            var p = {}; p[ref('membres/' + uid + '/nom')] = nom; p[ref('membres/' + uid + '/tel')] = tel || null; p[ref('membres/' + uid + '/email')] = email || null;
            if (!m.proprietaire && uid !== S.uid) p[ref('membres/' + uid + '/role')] = role;
            Object.assign(p, entree('modification', 'compte', m.username + (role !== m.role && !m.proprietaire && uid !== S.uid ? ' : ' + ROLES[m.role] + ' → ' + ROLES[role] : '')));
            occupe(bt, true);
            FE.majGroupee(p).then(function () { fermer(); toast('Compte modifié.', 'ok'); if (uid === S.uid) { S.membre.nom = nom; } router(); }, function (e) { occupe(bt, false); erreurFm('', Fb.message(e)); });
          } }] });
        } else if (t.dataset.remise) {
          remiseAcces(uid, m);
        } else if (t.dataset.etat) {
          var vers = m.statut === 'actif' ? 'desactive' : 'actif';
          confirmer(vers === 'desactive' ? 'Désactiver le compte' : 'Réactiver le compte',
            vers === 'desactive' ? '<b>' + esc(m.nom) + '</b> perdra immédiatement l\'accès, sur tous ses appareils. Ses opérations restent au journal. Vous pourrez le réactiver.' : '<b>' + esc(m.nom) + '</b> pourra de nouveau se connecter.',
            vers === 'desactive' ? 'Désactiver' : 'Réactiver', vers === 'desactive').then(function (ok) {
            if (!ok || !exigerReseau()) return;
            var p = {}; p[ref('membres/' + uid + '/statut')] = vers; Object.assign(p, entree(vers === 'desactive' ? 'desactivation' : 'reactivation', 'compte', m.username));
            FE.majGroupee(p).then(function () { toast(vers === 'desactive' ? 'Compte désactivé.' : 'Compte réactivé.', 'ok'); router(); }, function (e) { toast(Fb.message(e), 'ko'); });
          });
        } else if (t.dataset.finances) {
          if (!exigerReseau()) return;
          var p = {}; p[ref('membres/' + uid + '/accesFinances')] = !m.accesFinances; Object.assign(p, entree('modification', 'compte', m.username + (m.accesFinances ? ' : accès financier retiré' : ' : accès financier en lecture accordé')));
          FE.majGroupee(p).then(function () { toast(m.accesFinances ? 'Accès financier retiré.' : 'Accès aux rapports financiers accordé (lecture seule).', 'ok'); router(); }, function (e) { toast(Fb.message(e), 'ko'); });
        }
      };
    });
  }

  /* ======================= PARAMÈTRES DE L'ÉCOLE ======================= */
  function pageParametres(z) {
    var gerer = droits().parametres === 'gerer', i = S.info, p = S.parametres || {};
    function champ(id, lb, val, opt) { opt = opt || {};
      return '<div class="ch"><label class="lb" for="' + id + '">' + lb + (opt.fac ? ' <span style="font-weight:400;color:#8a94a6">(facultatif)</span>' : '') + '</label>' +
        (opt.area ? '<textarea class="in-c" id="' + id + '" maxlength="' + (opt.max || 300) + '"' + (gerer ? '' : ' disabled') + '>' + esc(val || '') + '</textarea>' :
          '<input class="in-c" id="' + id + '"' + (opt.type ? ' type="' + opt.type + '"' : '') + (opt.liste ? ' list="' + opt.liste + '"' : '') + ' maxlength="' + (opt.max || 150) + '" value="' + esc(val || '') + '"' + (gerer ? '' : ' disabled') + '>') +
        (opt.aide ? '<div class="ai">' + opt.aide + '</div>' : '') + '</div>'; }
    z.innerHTML = '<div class="tete-page"><div><h1>Paramètres de l\'école</h1><p class="sous-titre">Identifiant de connexion : <b>' + esc(S.code) + '</b> (non modifiable).' + (gerer ? '' : ' Consultation seule : seule la Fondation modifie ces informations.') + '</p></div></div>' +
      '<div class="carte"><h2>Informations officielles</h2><div class="g2">' +
        champ('pi-nom', 'Nom officiel', i.nom) + champ('pi-fond', 'Fondateur ou responsable légal', i.fondateur, { max: 120 }) +
        champ('pi-tel', 'Téléphone', i.tel, { type: 'tel', max: 20 }) + champ('pi-email', 'E-mail', i.email, { fac: true, max: 120 }) +
        champ('pi-region', 'Région', i.region, { liste: 'liste-regions', max: 60 }) + champ('pi-pref', 'Préfecture', i.prefecture, { liste: 'liste-prefectures', max: 60 }) +
        champ('pi-commune', 'Commune', i.commune, { max: 60 }) + champ('pi-quartier', 'Quartier', i.quartier, { max: 80 }) +
      '</div><div class="er" id="pi-e"></div>' + (gerer ? '<button class="bt p" id="pi-ok">Enregistrer les informations</button>' : '') + '</div>' +
      '<div class="carte"><h2>Identité et documents</h2>' +
        '<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap"><div style="width:84px;height:84px;border-radius:14px;border:1px solid #e3e8f2;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff" id="pp-logo-ap">' +
          (p.logo ? '<img src="' + esc(p.logo) + '" alt="Logo" style="max-width:100%;max-height:100%">' : '<span style="color:#8a94a6;font-size:12px">Aucun logo</span>') + '</div>' +
          (gerer ? '<label class="bt s pt" style="cursor:pointer">Changer le logo<input type="file" id="pp-logo" accept="image/png,image/jpeg,image/webp" class="sr"></label><button class="bt g pt" id="pp-logo-x"' + (p.logo ? '' : ' style="display:none"') + '>Retirer</button>' : '') + '</div>' +
        '<div class="g2">' + champ('pp-court', 'Nom court', p.nomCourt, { fac: true, max: 60, aide: 'Affiché dans le menu.' }) + champ('pp-slogan', 'Devise ou slogan', p.slogan, { fac: true }) +
          champ('pp-adr', 'Adresse complète', p.adresse, { fac: true, max: 250 }) + champ('pp-tel2', 'Deuxième téléphone', p.tel2, { fac: true, type: 'tel', max: 20 }) +
          champ('pp-dir', 'Nom du directeur', p.directeur, { fac: true, max: 120, aide: 'Imprimé sur les bulletins.' }) +
          '<div class="ch"><label class="lb" for="pp-fmt">Format des dates</label><select class="in-c" id="pp-fmt"' + (gerer ? '' : ' disabled') + '>' +
            ['JJ/MM/AAAA', 'JJ-MM-AAAA', 'AAAA-MM-JJ'].map(function (f) { return '<option value="' + f + '"' + ((p.formatDate || 'JJ/MM/AAAA') === f ? ' selected' : '') + '>' + fmtDate(Date.now(), f) + '</option>'; }).join('') + '</select></div>' +
          '<div class="ch"><label class="lb" for="pp-coul">Couleur principale</label><div style="display:flex;gap:10px;align-items:center"><input type="color" id="pp-coul" value="' + esc(p.couleur || '#1D4ED8') + '" style="width:64px;height:44px;border:1px solid #cfd7e6;border-radius:8px;background:#fff"' + (gerer ? '' : ' disabled') + '><span style="color:#475569">Couleur de l\'interface et des documents.</span></div></div>' +
        '</div>' + champ('pp-pied', 'Pied de page des documents', p.piedDePage, { fac: true, area: true, aide: 'Exemple : agrément, numéro d\'autorisation.' }) +
        '<div class="er" id="pp-e"></div>' + (gerer ? '<button class="bt p" id="pp-ok">Enregistrer l\'identité</button>' : '') + '</div>';
    if (!gerer) return;
    var nouveauLogo;
    $('pp-logo').onchange = function () {
      var f = this.files[0]; if (!f) return;
      redimImage(f, 320, 0.88).then(function (d) {
        if (d.length > 300000) throw new Error('Logo trop détaillé.');
        nouveauLogo = d; $('pp-logo-ap').innerHTML = '<img src="' + d + '" alt="Logo" style="max-width:100%;max-height:100%">'; $('pp-logo-x').style.display = '';
      }).catch(function (e) { toast(e.message, 'ko'); });
    };
    $('pp-logo-x').onclick = function () { nouveauLogo = null; $('pp-logo-ap').innerHTML = '<span style="color:#8a94a6;font-size:12px">Aucun logo</span>'; this.style.display = 'none'; };
    $('pp-coul').oninput = function () { $('ecran-app').style.setProperty('--accent', this.value); };
    $('pi-ok').onclick = function () {
      var v = { nom: $('pi-nom').value.trim(), fondateur: $('pi-fond').value.trim(), tel: $('pi-tel').value.trim(), email: $('pi-email').value.trim(),
        region: $('pi-region').value.trim(), prefecture: $('pi-pref').value.trim(), commune: $('pi-commune').value.trim(), quartier: $('pi-quartier').value.trim() };
      var e = $('pi-e'); e.classList.remove('on');
      var pb = v.nom.length < 3 ? 'Nom officiel : 3 caractères minimum.' : v.fondateur.length < 2 ? 'Nom du fondateur requis.' : !RE_TEL.test(v.tel) ? 'Téléphone invalide.' :
        (v.email && !RE_EMAIL.test(v.email)) ? 'E-mail invalide.' : (v.region.length < 2 || v.prefecture.length < 2 || v.commune.length < 2 || v.quartier.length < 2) ? 'Complétez la localisation.' : null;
      if (pb) { e.textContent = pb; e.classList.add('on'); return; }
      if (!exigerReseau()) return;
      var p2 = {}; Object.keys(v).forEach(function (k) { p2[ref('info/' + k)] = v[k] || null; });
      Object.assign(p2, entree('modification', 'ecole', 'informations officielles'));
      var bt = this; occupe(bt, true);
      FE.majGroupee(p2).then(function () { Object.assign(S.info, v); toast('Informations enregistrées.', 'ok'); occupe(bt, false); router(); }, function (er) { occupe(bt, false); e.textContent = Fb.message(er); e.classList.add('on'); });
    };
    $('pp-ok').onclick = function () {
      var v = { nomCourt: $('pp-court').value.trim(), slogan: $('pp-slogan').value.trim(), adresse: $('pp-adr').value.trim(), tel2: $('pp-tel2').value.trim(),
        directeur: $('pp-dir').value.trim(), formatDate: $('pp-fmt').value, couleur: $('pp-coul').value.toUpperCase(), piedDePage: $('pp-pied').value.trim() };
      if (nouveauLogo !== undefined) v.logo = nouveauLogo;
      if (!exigerReseau()) return;
      var p2 = {}; Object.keys(v).forEach(function (k) { p2[ref('parametres/' + k)] = v[k] || null; });
      Object.assign(p2, entree('modification', 'parametres', 'identité et documents'));
      var bt = this; occupe(bt, true);
      FE.majGroupee(p2).then(function () {
        Object.keys(v).forEach(function (k) { if (v[k]) S.parametres[k] = v[k]; else delete S.parametres[k]; });
        nouveauLogo = undefined; appliquerCouleur(); toast('Identité enregistrée.', 'ok'); occupe(bt, false); router();
      }, function (er) { occupe(bt, false); var e = $('pp-e'); e.textContent = Fb.message(er); e.classList.add('on'); });
    };
  }

  /* ======================= LICENCE ======================= */
  function blocLicence(z, apresEnvoi) {
    var l = etatLicence(S.licence), d = droits();
    return Promise.all([FE.lire('loges_platform/tarifs').catch(function () { return null; }), FE.lire('loges_platform/config').catch(function () { return null; }),
      d.licence ? FE.lire(ref('paiementsLicence')).catch(function () { return null; }) : Promise.resolve(null)]).then(function (x) {
      var tarifs = x[0] || {}, cfg = x[1] || {}, hist = x[2] || {};
      var cartes = Object.keys(tarifs).map(function (k) { var t = tarifs[k]; t.id = k; return t; }).filter(function (t) { return t.actif; }).sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0) || a.mois - b.mois; });
      var publie = cfg.publierTarifs && cartes.length;
      var devise = cfg.devise || S.info.devise || 'GNF';
      var waConc = (cfg.whatsapp || LOGES.contacts.whatsapp[0]);
      var bandeau = l.statut === 'bloque' ? ['ko', 'Accès suspendu par le concepteur' + (l.motif ? ' : ' + esc(l.motif) : '') + '.'] :
        l.statut === 'expire' ? ['ko', (l.essai ? 'Votre essai gratuit est terminé' : 'Votre licence a expiré') + ' depuis le ' + fmtD(S.licence.expiration) + '.'] :
        l.statut === 'essai' ? [l.jours <= 7 ? 'att' : 'info', 'Essai gratuit : <b>' + l.jours + ' jour' + (l.jours > 1 ? 's' : '') + '</b> restant' + (l.jours > 1 ? 's' : '') + ' (jusqu\'au ' + fmtD(S.licence.expiration) + ').'] :
        [l.jours <= 7 ? 'att' : 'ok', 'Licence active' + (S.licence.carteLibelle ? ' (' + esc(S.licence.carteLibelle) + ')' : '') + ' jusqu\'au ' + fmtD(S.licence.expiration) + ' : <b>' + l.jours + ' jour' + (l.jours > 1 ? 's' : '') + '</b>.'];
      var lh = Object.keys(hist).map(function (k) { var h = hist[k]; h.id = k; return h; }).sort(function (a, b) { return b.t - a.t; });
      var attente = lh.some(function (h) { return h.statut === 'en_attente'; });
      z.innerHTML += '<div class="alerte ' + bandeau[0] + '">' + bandeau[1] + '</div>' +
        (d.licence ? (publie ?
          '<div class="carte"><h2>Cartes de licence</h2><div class="tarifs">' + cartes.map(function (t) {
            return '<div class="tarif"><b>' + esc(t.libelle) + '</b><div class="px">' + fmtMontant(t.prix, devise) + '</div><small>' + t.mois + ' mois — soit ' + fmtMontant(t.prix / t.mois, devise) + ' par mois</small></div>'; }).join('') + '</div>' +
            (cfg.instructions ? '<p style="white-space:pre-line;color:#475569;line-height:1.6;margin-top:8px">' + esc(cfg.instructions) + '</p>' : '') + '</div>' +
          '<div class="carte"><h2>Déclarer un paiement</h2>' + (attente ? '<div class="alerte info">Une déclaration est déjà en attente de validation par le concepteur.</div>' : '') +
            '<div class="g2"><div class="ch"><label class="lb" for="dl-carte">Carte choisie</label><select class="in-c" id="dl-carte">' + cartes.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.libelle) + ' — ' + fmtMontant(t.prix, devise) + '</option>'; }).join('') + '</select></div>' +
            '<div class="ch"><label class="lb" for="dl-moyen">Moyen de paiement</label><select class="in-c" id="dl-moyen">' + Object.keys(MOYENS).map(function (m) { return '<option value="' + m + '">' + MOYENS[m] + '</option>'; }).join('') + '</select></div></div>' +
            '<div class="g2"><div class="ch"><label class="lb" for="dl-ref">Référence de la transaction</label><input class="in-c" id="dl-ref" maxlength="80" placeholder="Numéro de transaction ou de reçu"></div>' +
            '<div class="ch"><span class="lb">Justificatif (photo du reçu)</span><label class="bt s" style="cursor:pointer;width:100%">Choisir une image<input type="file" id="dl-just" accept="image/png,image/jpeg,image/webp" class="sr"></label><div class="ai" id="dl-just-txt">Facultatif mais recommandé.</div></div></div>' +
            '<div class="er" id="dl-e"></div><button class="bt p" id="dl-ok">Envoyer la déclaration</button>' +
            ' <a class="bt s" target="_blank" rel="noopener" href="' + lienWa(waConc, 'Bonjour, je souhaite régler la licence LOGES de l\'école ' + S.info.nom + ' (' + S.code + ').') + '">Écrire au concepteur sur WhatsApp</a></div>'
          : '<div class="carte"><h2>Renouveler la licence</h2><p style="color:#475569;line-height:1.6">Contactez le concepteur pour connaître les tarifs et le mode de paiement.</p><a class="bt p" style="margin-top:10px" target="_blank" rel="noopener" href="' + lienWa(waConc, 'Bonjour, je souhaite régler la licence LOGES de l\'école ' + S.info.nom + ' (' + S.code + ').') + '">Écrire au concepteur sur WhatsApp</a></div>') +
          '<div class="carte"><h2>Historique des déclarations</h2>' + (lh.length ? '<div class="tab-w"><table class="tb"><thead><tr><th>Date</th><th>Carte</th><th>Montant</th><th>Moyen</th><th>État</th></tr></thead><tbody>' +
            lh.map(function (h) { var st = { en_attente: ['En attente', 'ambre'], valide: ['Validé', 'vert'], rejete: ['Rejeté', 'rouge'] }[h.statut] || [h.statut, 'gris'];
              return '<tr><td>' + fmtDH(h.t) + '</td><td>' + esc(h.carteLibelle || h.carte) + '</td><td>' + fmtMontant(h.montant, devise) + '</td><td>' + esc(MOYENS[h.moyen] || h.moyen) + (h.reference ? '<div style="color:#8a94a6;font-size:12.5px">' + esc(h.reference) + '</div>' : '') + '</td><td><span class="pastille ' + st[1] + '">' + st[0] + '</span>' +
                (h.facture ? '<div style="font-size:12.5px;color:#475569">Facture ' + esc(h.facture) + '</div>' : '') + (h.motif ? '<div style="font-size:12.5px;color:#7f1d1d">' + esc(h.motif) + '</div>' : '') + '</td></tr>'; }).join('') +
            '</tbody></table></div>' : '<p style="color:#8a94a6">Aucune déclaration pour le moment.</p>') + '</div>'
        : '<div class="carte"><p style="line-height:1.6">La licence est gérée par la Fondation et la Comptabilité de votre école. Prévenez-les pour rétablir l\'accès.</p></div>');
      if (!d.licence || !publie) return;
      var justificatif = null;
      $('dl-just').onchange = function () {
        var f = this.files[0]; if (!f) return;
        redimImage(f, 1100, 0.8).then(function (u) { justificatif = u; $('dl-just-txt').textContent = 'Justificatif prêt (' + Math.round(u.length / 1024) + ' Ko).'; }, function (e) { toast(e.message, 'ko'); });
      };
      $('dl-ok').onclick = function () {
        var t = tarifs[$('dl-carte').value], moyen = $('dl-moyen').value, refx = $('dl-ref').value.trim(), e = $('dl-e');
        e.classList.remove('on');
        if (!refx && !justificatif) { e.textContent = 'Indiquez la référence de la transaction ou joignez la photo du reçu.'; e.classList.add('on'); return; }
        if (!exigerReseau()) return;
        var id = FE.cle(), now = FE.maintenant();
        var decl = { carte: t.id, carteLibelle: t.libelle, mois: t.mois, montant: t.prix, moyen: moyen, t: now, uid: S.uid, statut: 'en_attente' };
        if (refx) decl.reference = refx;
        var plat = Object.assign({}, decl, { ecole: S.sid, code: S.code, nomEcole: S.info.nom, auteur: S.membre.nom + ' (' + ROLES[S.membre.role] + ')', tel: S.info.tel });
        if (justificatif) plat.justificatif = justificatif;
        var p = {}; p[ref('paiementsLicence/' + id)] = decl; p['loges_platform/paiements/' + id] = plat;
        if (etatLicence(S.licence).valide) Object.assign(p, entree('declaration', 'paiement', t.libelle + ' — ' + fmtMontant(t.prix, devise)));
        var bt = this; occupe(bt, true, 'Envoi…');
        FE.majGroupee(p).then(function () {
          toast('Déclaration envoyée au concepteur.', 'ok');
          modal({ titre: 'Déclaration envoyée', corps: '<p style="line-height:1.6">Le concepteur va vérifier votre paiement. Dès sa validation, la licence s\'active automatiquement sur tous les appareils de l\'école.</p>',
            boutons: [{ txt: 'Prévenir sur WhatsApp', cls: 's', action: function (f) { window.open(lienWa(waConc, 'Bonjour, je viens de déclarer le paiement de la licence LOGES (' + t.libelle + ', ' + fmtMontant(t.prix, devise) + ') pour l\'école ' + S.info.nom + ' (' + S.code + '). Réf. : ' + (refx || 'photo jointe')), '_blank'); f(); } }, { txt: 'Fermer', cls: 'p' }] });
          if (apresEnvoi) apresEnvoi();
        }, function (er) { occupe(bt, false); e.textContent = Fb.message(er); e.classList.add('on'); });
      };
    });
  }
  function pageLicence(z) {
    z.innerHTML = '<div class="tete-page"><div><h1>Licence</h1><p class="sous-titre">État de la licence de l\'école, cartes proposées et déclaration de paiement.</p></div></div>';
    return blocLicence(z, function () { router(); });
  }

  // Écran plein quand la licence est expirée ou suspendue
  function ecranLicence() {
    montrer('ecran-plein');
    var z = $('plein');
    z.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin:10px 0 18px"><div style="width:52px;height:52px;border-radius:12px;background:#fff;border:1px solid #e3e8f2;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#1d4ed8;font-weight:800">' + logoEcole(52) + '</div><div><h1 style="font-size:20px">' + esc(S.info.nom) + '</h1><p class="sous-titre" style="margin:0">' + ESPACE[S.membre.role] + ' — ' + esc(S.membre.nom) + '</p></div></div>';
    blocLicence(z, function () { ecranLicence(); }).then(function () {
      z.insertAdjacentHTML('beforeend', '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><button class="bt s" id="lic-verif">Vérifier à nouveau</button><button class="bt g" id="lic-deco">Se déconnecter</button></div>');
      $('lic-verif').onclick = function () { FE.lire(ref('licence')).then(function (l) { S.licence = l; aiguiller(); if (!etatLicence(l).valide) toast('La licence n\'est pas encore active.', 'ko'); }); };
      $('lic-deco').onclick = function () { deconnecter(); };
    }, function (e) { z.innerHTML += '<div class="alerte ko">' + esc(Fb.message(e)) + '</div>'; });
  }

  /* ======================= JOURNAL ======================= */
  function pageJournal(z) {
    var dom = droits().journal;
    return lireJournaux(dom, 300).then(function (ops) {
      z.innerHTML = '<div class="tete-page"><div><h1>Journal des opérations</h1><p class="sous-titre">Historique en ajout seul : aucune entrée ne peut être modifiée ni supprimée, y compris par la Fondation.</p></div>' +
        (dom.length > 1 ? '<select class="in-c" id="jr-f" style="max-width:240px"><option value="">Tous les domaines</option>' + dom.map(function (d) { return '<option value="' + d + '">' + DOMAINES[d] + '</option>'; }).join('') + '</select>' : '') + '</div><div id="jr-l"></div>';
      function rendre(f) {
        var l = ops.filter(function (o) { return !f || o.domaine === f; });
        $('jr-l').innerHTML = l.length ? '<div class="tab-w"><table class="tb"><thead><tr><th>Date</th><th>Opération</th><th>Détail</th><th>Auteur</th></tr></thead><tbody>' +
          l.map(function (o) { return '<tr><td style="white-space:nowrap;color:#475569">' + fmtDH(o.t) + '</td><td><b>' + esc(ACTIONS[o.action] || o.action) + '</b><div style="font-size:12.5px;color:#8a94a6">' + esc(OBJETS[o.objet] || o.objet) + ' — <span class="pastille ' + (o.domaine === 'plateforme' ? 'ambre' : 'gris') + '">' + DOMAINES[o.domaine] + '</span></div></td><td>' + esc(o.detail || '—') + '</td><td>' + esc(o.auteur || '?') + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '<div class="vide">Aucune opération.</div>';
      }
      rendre('');
      if ($('jr-f')) $('jr-f').onchange = function () { rendre(this.value); };
    });
  }

  /* ======================= MON COMPTE ET MOT DE PASSE ======================= */
  function formulaireMdp(force) {
    return '<div class="ch"><label class="lb" for="mp-a">' + (force ? 'Mot de passe provisoire reçu' : 'Mot de passe actuel') + '</label><input class="in-c" type="password" id="mp-a" autocomplete="current-password"></div>' +
      '<div class="g2"><div class="ch"><label class="lb" for="mp-n">Nouveau mot de passe</label><input class="in-c" type="password" id="mp-n" autocomplete="new-password"><div class="ai">8 caractères minimum, lettres et chiffres.</div></div>' +
      '<div class="ch"><label class="lb" for="mp-c">Confirmer</label><input class="in-c" type="password" id="mp-c" autocomplete="new-password"></div></div><div class="er" id="mp-e"></div>' +
      '<button class="bt p" id="mp-ok">Enregistrer le nouveau mot de passe</button>';
  }
  function brancherMdp(apres) {
    $('mp-ok').onclick = function () {
      var a = $('mp-a').value, n = $('mp-n').value, c = $('mp-c').value, e = $('mp-e');
      e.classList.remove('on');
      var pb = !a ? 'Saisissez votre mot de passe actuel.' : mdpProbleme(n) || (n === a ? 'Choisissez un mot de passe différent.' : null) || (c !== n ? 'Les deux mots de passe ne sont pas identiques.' : null);
      if (pb) { e.textContent = pb; e.classList.add('on'); return; }
      if (!exigerReseau()) return;
      var bt = this; occupe(bt, true);
      FE.changerMdp(a, n).then(function () {
        if (!S.membre.doitChangerMdp) return;
        return FE.ecrire(ref('membres/' + S.uid + '/doitChangerMdp'), false).then(function () { S.membre.doitChangerMdp = false; });
      }).then(function () { occupe(bt, false); toast('Mot de passe modifié.', 'ok'); apres(); }, function (er) {
        occupe(bt, false); e.textContent = er.code === 'wrong-password' ? 'Mot de passe actuel incorrect.' : Fb.message(er); e.classList.add('on');
      });
    };
  }
  function ecranMdpImpose() {
    montrer('ecran-plein');
    $('plein').innerHTML = '<div style="max-width:560px;margin:20px auto"><h1>Choisissez votre mot de passe</h1><p class="sous-titre" style="margin-bottom:18px">Bonjour ' + esc(S.membre.nom) + '. Votre mot de passe a été attribué par un administrateur : remplacez-le par un mot de passe connu de vous seul.</p><div class="carte">' + formulaireMdp(true) + '</div><button class="bt g" id="mp-deco">Se déconnecter</button></div>';
    $('mp-deco').onclick = function () { deconnecter(); };
    brancherMdp(aiguiller);
  }
  function pageMonCompte(z) {
    var m = S.membre;
    z.innerHTML = '<div class="tete-page"><div><h1>Mon compte</h1></div></div><div class="carte"><h2>Identité</h2><table class="tb" style="min-width:0"><tr><td>Nom</td><td><b>' + esc(m.nom) + '</b></td></tr><tr><td>Nom d\'utilisateur</td><td><b>' + esc(m.username) + '</b></td></tr><tr><td>Identifiant de l\'école</td><td><b>' + esc(S.code) + '</b></td></tr><tr><td>Rôle</td><td><b>' + ROLES[m.role] + (m.proprietaire ? ' (compte principal)' : '') + '</b></td></tr></table></div>' +
      '<div class="carte"><h2>Changer mon mot de passe</h2>' + formulaireMdp(false) + '</div>' +
      '<div class="carte"><h2>Sécurité</h2><p style="color:#475569;line-height:1.6">Votre session se ferme automatiquement après ' + LOGES.inactiviteMinutes + ' minutes d\'inactivité.' + (m.proprietaire ? ' En cas d\'oubli de votre mot de passe, le concepteur peut vous remettre un accès après vérification de votre identité par téléphone.' : ' En cas d\'oubli, l\'administrateur de votre école peut vous remettre un accès.') + '</p><button class="bt s" style="margin-top:10px" id="mc-deco">Se déconnecter de cet appareil</button></div>';
    brancherMdp(function () { $('mp-a').value = $('mp-n').value = $('mp-c').value = ''; });
    $('mc-deco').onclick = function () { deconnecter(); };
  }

  /* ======================= DÉMARRAGE ======================= */
  function init() {
    window.addEventListener('hashchange', router);
    $('btn-menu').onclick = function () { $('lat').classList.add('ouvert'); $('voile').classList.add('on'); };
    $('voile').onclick = function () { $('lat').classList.remove('ouvert'); $('voile').classList.remove('on'); };
  }
  // Reprise d'une session ouverte sur cet appareil
  function reprendre() {
    return FE.pret().then(function () {
      if (!FE.user()) return false;
      return ouvrirSession(null).then(function () { return true; }, function (e) { if (e.texte) toast(e.texte, 'ko'); return false; });
    }).catch(function () { return false; });
  }

  return { init: init, connexion: connexion, creer: creer, reprendre: reprendre, deconnecter: deconnecter, etatLicence: etatLicence };
})();
