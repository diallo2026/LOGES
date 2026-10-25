/* ================================================================
   ACCUEIL (à l'image d'AGV), CONNEXION, CRÉATION D'ÉCOLE
   ================================================================ */
var FE = Fb.instance('ecole', 'local');
var MOT_CONCEPTEUR = '@CONCEPTEUR';

function montrer(id) {
  ['ecran-accueil', 'ecran-auth', 'ecran-app', 'ecran-plein'].forEach(function (e) { $(e).classList.toggle('on', e === id); });
  document.querySelector('meta[name="theme-color"]').setAttribute('content', id === 'ecran-app' || id === 'ecran-plein' ? '#0a1628' : '#060d24');
  document.body.style.background = id === 'ecran-app' || id === 'ecran-plein' ? '#f4f6fb' : '#060d24';
  window.scrollTo(0, 0);
}

/* ---- Écoles mémorisées sur l'appareil (l'appareil retient l'école et l'utilisateur) ---- */
function ecolesMemo() { return lsGet('loges_ecoles_memo', []); }
function memoriserEcole(code, nom, user) {
  var l = ecolesMemo().filter(function (e) { return e.code !== code; });
  l.unshift({ code: code, nom: nom, user: user });
  lsSet('loges_ecoles_memo', l.slice(0, 5));
}

/* ---- Détection du mot-clé concepteur (frappe, Entrée, bouton) ---- */
function estMotConcepteur(v) { return String(v || '').trim().toUpperCase() === MOT_CONCEPTEUR; }
function brancherMotConcepteur(champ) {
  champ.addEventListener('input', function () {
    if (estMotConcepteur(champ.value)) { champ.value = ''; Concepteur.ouvrir(); }
  });
}

/* ---------------- Accueil ---------------- */
function rendreAccueil() {
  $('acc-version').textContent = 'Version ' + LOGES.version;
  var wa = LOGES.contacts.whatsapp.map(function (n) {
    var aff = n.replace(/^224/, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    return '<a class="btn-wa" href="https://wa.me/' + n + '" target="_blank" rel="noopener">WhatsApp ' + aff + '</a>';
  }).join('');
  $('acc-contacts').innerHTML = wa + '<a class="btn-mail" href="mailto:' + esc(LOGES.contacts.email) + '">' + esc(LOGES.contacts.email) + '</a>';
  var memo = ecolesMemo();
  $('acc-memo').innerHTML = memo.length ? '<div style="font-size:12px;color:#64748b;text-align:center">Écoles déjà utilisées sur cet appareil</div>' +
    memo.map(function (e) { return '<button data-memo="' + esc(e.code) + '"><b style="font-weight:600">' + esc(e.nom) + '</b><span>' + esc(e.code) + '</span></button>'; }).join('') : '';
  montrer('ecran-accueil');
}

function accederDepuisAccueil() {
  var champ = $('acc-code'), msg = $('acc-code-msg');
  var code = champ.value.trim().toLowerCase();
  msg.classList.remove('on');
  if (estMotConcepteur(champ.value)) { champ.value = ''; return Concepteur.ouvrir(); }
  if (!RE_CODE.test(code)) { msg.textContent = "Identifiant invalide : lettres minuscules, chiffres et tirets."; msg.classList.add('on'); return; }
  var bt = $('acc-acceder'); occupe(bt, true, '…');
  FE.lire('loges_codes/' + code).then(function (sid) {
    occupe(bt, false);
    if (!sid) { msg.textContent = "Aucune école n'est enregistrée avec cet identifiant."; msg.classList.add('on'); return; }
    ouvrirConnexion(code);
  }, function (e) { occupe(bt, false); msg.textContent = Fb.message(e); msg.classList.add('on'); });
}

/* ---------------- Connexion / création ---------------- */
function msgAuth(texte, type) {
  var m = $('auth-msg'); m.className = 'msg' + (texte ? ' on ' + (type || 'ko') : ''); m.textContent = texte || '';
}
function ongletAuth(quel) {
  $('t-connexion').classList.toggle('on', quel === 'connexion');
  $('t-creation').classList.toggle('on', quel === 'creation');
  $('p-connexion').style.display = quel === 'connexion' ? '' : 'none';
  $('p-creation').style.display = quel === 'creation' ? '' : 'none';
  msgAuth('');
}
function ouvrirConnexion(code) {
  var memo = ecolesMemo();
  $('c-ecoles-memo').innerHTML = memo.map(function (e) { return '<option value="' + esc(e.code) + '">' + esc(e.nom) + '</option>'; }).join('');
  $('c-oublier').style.display = memo.length ? '' : 'none';
  var cible = code || (memo[0] && memo[0].code) || '';
  var m = memo.filter(function (e) { return e.code === cible; })[0];
  $('c-ecole').value = cible;
  $('c-user').value = m ? m.user : '';
  $('c-mdp').value = '';
  ongletAuth('connexion');
  montrer('ecran-auth');
  focusSiLibre(cible && m ? 'c-mdp' : cible ? 'c-user' : 'c-ecole');
}
function ouvrirCreation() {
  ongletAuth('creation');
  montrer('ecran-auth');
  FE.lire('loges_platform/config').then(function (c) {
    var j = (c && c.essaiJours) || LOGES.essaiParDefaut;
    $('r-essai').textContent = 'Essai gratuit de ' + j + ' jours dès la création. Ensuite, la licence se règle depuis votre espace.';
  }, function () {});
  focusSiLibre('r-nom');
}

function erreurChamp(nom, texte) {
  var e = document.querySelector('#p-creation [data-err="' + nom + '"]');
  if (e) { e.textContent = texte || ''; e.classList.toggle('on', !!texte); }
}

var creationLogo = '', codeTouche = false, verifCode = null, codeLibre = null;
function verifierDispo() {
  var code = $('r-code').value.trim(), d = $('r-dispo');
  codeLibre = null;
  clearTimeout(verifCode);
  if (!RE_CODE.test(code)) { d.className = 'dispo att'; d.textContent = 'Servira à chaque connexion : lettres minuscules, chiffres et tirets.'; return; }
  d.className = 'dispo att'; d.textContent = 'Vérification…';
  verifCode = setTimeout(function () {
    FE.lire('loges_codes/' + code).then(function (sid) {
      if ($('r-code').value.trim() !== code) return;
      codeLibre = !sid;
      d.className = 'dispo ' + (sid ? 'ko' : 'ok');
      d.textContent = sid ? '✗ Identifiant déjà utilisé : choisissez-en un autre.' : '✓ Disponible';
    }, function () { d.className = 'dispo att'; d.textContent = 'Vérification impossible pour le moment.'; });
  }, 450);
}

function lireFormulaireCreation() {
  var v = {
    nom: $('r-nom').value.trim(), code: $('r-code').value.trim().toLowerCase(),
    prenom: $('r-prenom').value.trim(), nomf: $('r-nomf').value.trim(),
    tel: $('r-tel').value.trim(), email: $('r-email').value.trim(),
    region: $('r-region').value.trim(), pref: $('r-pref').value.trim(), commune: $('r-commune').value.trim(), quartier: $('r-quartier').value.trim(),
    annee: $('r-annee').value, devise: $('r-devise').value,
    user: $('r-user').value.trim().toLowerCase(), mdp: $('r-mdp').value, mdp2: $('r-mdp2').value,
    atteste: $('r-atteste').checked, logo: creationLogo
  };
  var err = {};
  if (v.nom.length < 3) err.nom = 'Indiquez le nom officiel (3 caractères minimum).';
  if (!RE_CODE.test(v.code)) err.code = '3 à 30 caractères : lettres minuscules, chiffres et tirets (pas au début ni à la fin).';
  else if (codeLibre === false) err.code = 'Identifiant déjà utilisé.';
  if (v.prenom.length < 1) err.prenom = 'Prénom requis.';
  if (v.nomf.length < 1) err.nomf = 'Nom requis.';
  if ((v.prenom + ' ' + v.nomf).length > 120) err.nomf = 'Nom trop long.';
  if (!RE_TEL.test(v.tel)) err.tel = 'Numéro invalide. Exemple : +224 620 00 00 00';
  if (v.email && !RE_EMAIL.test(v.email)) err.email = 'Adresse e-mail invalide.';
  if (v.region.length < 2) err.region = 'Région requise.';
  if (v.pref.length < 2) err.pref = 'Préfecture requise.';
  if (v.commune.length < 2) err.commune = 'Commune requise.';
  if (v.quartier.length < 2) err.quartier = 'Quartier requis.';
  if (!RE_USER.test(v.user)) err.user = '3 à 32 caractères : lettres minuscules, chiffres, tiret ou souligné (sans point).';
  var p = mdpProbleme(v.mdp); if (p) err.mdp = p;
  if (v.mdp2 !== v.mdp) err.mdp2 = 'Les deux mots de passe ne sont pas identiques.';
  if (!v.atteste) err.atteste = 'Cochez cette case pour continuer.';
  ['nom', 'code', 'prenom', 'nomf', 'tel', 'email', 'region', 'pref', 'commune', 'quartier', 'user', 'mdp', 'mdp2', 'atteste', 'logo'].forEach(function (k) { erreurChamp(k, err[k]); });
  return { v: v, ok: !Object.keys(err).length, premier: Object.keys(err)[0] };
}

function initAuth() {
  // Une erreur disparaît dès que le champ concerné est corrigé
  ['input', 'change'].forEach(function (evt) {
    $('p-creation').addEventListener(evt, function (e) {
      var id = e.target && e.target.id;
      if (!id || id.indexOf('r-') !== 0) return;
      erreurChamp(id.slice(2), '');
      if (!document.querySelector('#p-creation .err.on')) msgAuth('');
    });
  });
  // Contacts et listes
  $('c-lien-wa').href = 'https://wa.me/' + LOGES.contacts.whatsapp[0];
  $('liste-regions').innerHTML = Object.keys(REGIONS).map(function (r) { return '<option value="' + r + '">'; }).join('');
  var majPref = function () {
    var l = REGIONS[$('r-region').value] || [].concat.apply([], Object.keys(REGIONS).map(function (k) { return REGIONS[k]; }));
    $('liste-prefectures').innerHTML = l.map(function (p) { return '<option value="' + p + '">'; }).join('');
  };
  $('r-region').addEventListener('input', majPref); majPref();
  $('r-annee').innerHTML = anneesProposees().map(function (a) { return '<option' + (a === anneeCourante() ? ' selected' : '') + '>' + a + '</option>'; }).join('');

  // Onglets et navigation
  $('t-connexion').onclick = function () { ongletAuth('connexion'); };
  $('t-creation').onclick = function () { ouvrirCreation(); };
  $('auth-retour').onclick = rendreAccueil;
  document.querySelectorAll('[data-action="creer"]').forEach(function (b) { b.onclick = ouvrirCreation; });
  $('acc-acceder').onclick = accederDepuisAccueil;
  $('acc-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') accederDepuisAccueil(); });
  $('acc-memo').addEventListener('click', function (e) { var b = e.target.closest('[data-memo]'); if (b) ouvrirConnexion(b.dataset.memo); });
  brancherMotConcepteur($('acc-code'));
  brancherMotConcepteur($('c-ecole'));
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-oeil]'); if (!b) return;
    var i = $(b.dataset.oeil); var vis = i.type === 'password'; i.type = vis ? 'text' : 'password'; b.textContent = vis ? 'Masquer' : 'Afficher';
  });
  $('c-oublier').onclick = function () { lsDel('loges_ecoles_memo'); $('c-ecole').value = ''; $('c-user').value = ''; this.style.display = 'none'; toast('Écoles oubliées sur cet appareil.', 'ok'); };
  $('c-ecole').addEventListener('change', function () {
    var m = ecolesMemo().filter(function (x) { return x.code === $('c-ecole').value.trim(); })[0];
    if (m && !$('c-user').value) $('c-user').value = m.user;
  });

  // Connexion
  $('p-connexion').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('c-ecole').value.trim().toLowerCase(), user = $('c-user').value.trim().toLowerCase(), mdp = $('c-mdp').value;
    if (estMotConcepteur($('c-ecole').value)) { $('c-ecole').value = ''; return Concepteur.ouvrir(); }
    if (!code || !user || !mdp) return msgAuth('Remplissez les trois champs.');
    if (!RE_CODE.test(code)) return msgAuth("Identifiant d'école invalide.");
    var bt = $('c-btn'); occupe(bt, true, 'Connexion…'); msgAuth('');
    Ecole.connexion(code, user, mdp).catch(function (err) { msgAuth(err.texte || Fb.message(err)); }).then(function () { occupe(bt, false); });
  });

  // Création d'école
  $('r-nom').addEventListener('input', function () { if (!codeTouche) { $('r-code').value = slug($('r-nom').value); verifierDispo(); } });
  $('r-code').addEventListener('input', function () {
    codeTouche = true;
    var c = $('r-code'); var pos = c.selectionStart;
    c.value = c.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
    try { c.setSelectionRange(pos, pos); } catch (e2) { /* ignore */ }
    verifierDispo();
  });
  $('r-logo').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    redimImage(f, 320, 0.88).then(function (d) {
      creationLogo = d; $('r-logo-ap').innerHTML = '<img src="' + d + '" alt="Aperçu du logo">'; $('r-logo-retirer').style.display = ''; erreurChamp('logo', '');
    }, function (err) { erreurChamp('logo', err.message); });
  });
  $('r-logo-retirer').onclick = function () { creationLogo = ''; $('r-logo-ap').textContent = 'Aucun'; this.style.display = 'none'; $('r-logo').value = ''; };
  $('p-creation').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = lireFormulaireCreation();
    if (!f.ok) {
      msgAuth('Certaines informations sont à corriger.');
      var cible = { nom: 'r-nom', code: 'r-code', prenom: 'r-prenom', nomf: 'r-nomf', tel: 'r-tel', email: 'r-email', region: 'r-region', pref: 'r-pref', commune: 'r-commune', quartier: 'r-quartier', user: 'r-user', mdp: 'r-mdp', mdp2: 'r-mdp2', atteste: 'r-atteste' }[f.premier];
      if (cible) $(cible).focus();
      return;
    }
    var bt = $('r-btn'); occupe(bt, true, 'Création de l\'école…'); msgAuth('');
    Ecole.creer(f.v).catch(function (err) {
      msgAuth(err.texte || Fb.message(err));
      if (err.champ) erreurChamp(err.champ, err.texte);
    }).then(function () { occupe(bt, false); });
  });
}
