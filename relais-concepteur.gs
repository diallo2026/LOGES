/* =====================================================================
   LOGES — RELAIS DE VALIDATION DU COMPTE CONCEPTEUR (Google Apps Script)

   Rôle : envoyer un code à 6 chiffres à l'adresse du concepteur, et
   uniquement à elle, puis valider le compte concepteur quand ce code est
   saisi. Tant que le code n'est pas saisi, le compte n'a aucun droit :
   seul ce relais peut inscrire un compte dans loges_platform/admins
   (les règles de la base l'interdisent à tout navigateur).

   Le code est tiré au hasard ici, côté Google, jamais dans le navigateur :
   seule la personne qui lit la boîte de réception peut le connaître.
   Il est conservé haché, valable 15 minutes, 5 essais au plus.

   Installation : voir README.md, étape 1 e).
   ===================================================================== */
var RELAIS = {
  version: '1.4',
  // Seule adresse qui reçoit le code. Jamais lue dans la demande.
  emailConcepteur: 'souleymane0403@gmail.com',
  nomConcepteur: 'Souleymane Diallo',
  projet: 'loges-b8212',
  cleApi: 'AIzaSyAilF7eamC09Bxj_Hi7J_UcJnvCtvsi6rE',
  // Adresse de la base. Vide : détectée automatiquement (États-Unis, Europe ou Asie).
  baseDonnees: '',
  dureeCodeMinutes: 15,
  essaisMax: 5,
  delaiRenvoiSecondes: 60,
  envoisParHeure: 5,
  envoisParJour: 20
};

/* Ouvrir l'adresse du relais dans un navigateur : vérifie qu'il est en ligne. */
function doGet() {
  return json({ ok: true, service: 'Relais LOGES — validation du compte concepteur', version: RELAIS.version });
}

function doPost(e) {
  var verrou = LockService.getScriptLock();
  try { verrou.waitLock(20000); } catch (x) { return json({ ok: false, erreur: 'occupe' }); }
  try {
    var q;
    try { q = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json({ ok: false, erreur: 'requete' }); }
    if (q.action === 'envoyer') return json(envoyer(q));
    if (q.action === 'valider') return json(valider(q));
    return json({ ok: false, erreur: 'requete' });
  } catch (x) {
    return json({ ok: false, erreur: 'interne', detail: String((x && x.message) || x).slice(0, 300) });
  } finally {
    verrou.releaseLock();
  }
}

/* ---------------- Envoi du code ---------------- */
function envoyer(q) {
  var c = compte(q.idToken);
  if (!c) return { ok: false, erreur: 'session' };
  if (c.email !== RELAIS.emailConcepteur) return { ok: false, erreur: 'adresse' };
  if (concepteurExiste()) return { ok: false, erreur: 'deja' };

  var t = maintenant(), a = lireAttente(c.uid) || {};
  a.envois = (a.envois || []).filter(function (x) { return t - x < 3600000; });
  var dernier = a.envois.length ? a.envois[a.envois.length - 1] : 0;
  var attente = RELAIS.delaiRenvoiSecondes * 1000 - (t - dernier);
  if (attente > 0) return { ok: false, erreur: 'patienter', secondes: Math.ceil(attente / 1000) };
  if (a.envois.length >= RELAIS.envoisParHeure || !quotaDuJour(t)) return { ok: false, erreur: 'quota' };

  var code = nouveauCode(), sel = Utilities.getUuid();
  a.empreinte = empreinte(c.uid, code, sel);
  a.sel = sel;
  a.expire = t + RELAIS.dureeCodeMinutes * 60000;
  a.essais = 0;
  a.envois.push(t);
  ecrireAttente(c.uid, a);

  MailApp.sendEmail({
    to: RELAIS.emailConcepteur,
    subject: 'LOGES — code de validation du compte concepteur : ' + code,
    name: 'LOGES',
    body: 'Code de validation du compte concepteur LOGES : ' + code + '\n\n' +
      'Saisissez ce code dans l\'espace concepteur pour valider la création du compte. Il est valable ' + RELAIS.dureeCodeMinutes + ' minutes.\n' +
      'Tant que ce code n\'est pas saisi, le compte n\'est pas validé et n\'a aucun droit.\n\n' +
      'Si vous n\'avez pas demandé la création du compte concepteur, ignorez ce message : sans ce code, personne ne peut le valider.',
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a;max-width:520px">' +
      '<p>Code de validation du <b>compte concepteur LOGES</b> :</p>' +
      '<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:18px 0;color:#1d4ed8">' + code + '</p>' +
      '<p>Saisissez ce code dans l\'espace concepteur pour valider la création du compte. Il est valable <b>' + RELAIS.dureeCodeMinutes + ' minutes</b>.<br>' +
      'Tant que ce code n\'est pas saisi, le compte n\'est pas validé et n\'a aucun droit.</p>' +
      '<p style="color:#64748b;font-size:13px">Si vous n\'avez pas demandé la création du compte concepteur, ignorez ce message : sans ce code, personne ne peut le valider.</p></div>'
  });
  return { ok: true, minutes: RELAIS.dureeCodeMinutes };
}

/* ---------------- Saisie du code ---------------- */
function valider(q) {
  var c = compte(q.idToken);
  if (!c) return { ok: false, erreur: 'session' };
  if (c.email !== RELAIS.emailConcepteur) return { ok: false, erreur: 'adresse' };
  var a = lireAttente(c.uid);
  if (!a || !a.empreinte) return { ok: false, erreur: 'aucun_code' };
  if (maintenant() > a.expire) return { ok: false, erreur: 'code_expire' };
  if (a.essais >= RELAIS.essaisMax) return { ok: false, erreur: 'trop_essais' };

  var code = String(q.code == null ? '' : q.code).replace(/\s+/g, '');
  if (!/^[0-9]{6}$/.test(code) || empreinte(c.uid, code, a.sel) !== a.empreinte) {
    a.essais = (a.essais || 0) + 1;
    var reste = RELAIS.essaisMax - a.essais;
    if (reste <= 0) a.empreinte = null; // code détruit : il faut en demander un nouveau
    ecrireAttente(c.uid, a);
    return reste > 0 ? { ok: false, erreur: 'code_faux', reste: reste } : { ok: false, erreur: 'trop_essais' };
  }

  if (concepteurExiste()) { effacerAttente(c.uid); return { ok: false, erreur: 'deja' }; }
  base('put', 'loges_platform/admins/' + c.uid, { nom: RELAIS.nomConcepteur, email: c.email, creeLe: { '.sv': 'timestamp' }, validation: 'code e-mail' });
  effacerAttente(c.uid);
  return { ok: true };
}

/* ---------------- Compte Firebase qui fait la demande ---------------- */
// Le jeton de connexion est vérifié par Google (Identity Toolkit), jamais déchiffré ici.
function compte(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 5000) return null;
  var r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(RELAIS.cleApi), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
  });
  if (r.getResponseCode() === 400) return null; // jeton invalide ou expiré
  if (r.getResponseCode() !== 200) {
    throw new Error('vérification du compte impossible (' + r.getResponseCode() + ') : la clé API Firebase (RELAIS.cleApi) refuse les appels du relais ; retirez ses restrictions de sites web dans Google Cloud → Identifiants.');
  }
  var u = (JSON.parse(r.getContentText()).users || [])[0];
  return u && u.localId ? { uid: u.localId, email: String(u.email || '').toLowerCase() } : null;
}

/* ---------------- Base de données ---------------- */
// Accès du compte Google propriétaire du projet Firebase (jeton du script),
// ou, à défaut, du secret de la base enregistré dans la propriété SECRET_BASE.
function base(methode, chemin, valeur, options) {
  var o = { method: methode, muteHttpExceptions: true };
  if (valeur !== undefined) { o.contentType = 'application/json'; o.payload = JSON.stringify(valeur); }
  var r = UrlFetchApp.fetch(adresseBase() + '/' + chemin + '.json?' + (options ? options + '&' : '') + jetonBase(), o);
  if (r.getResponseCode() !== 200) {
    throw new Error('Base de données : accès refusé (' + r.getResponseCode() + '). Créez le script avec le compte Google propriétaire du projet Firebase, ou renseignez la propriété SECRET_BASE.');
  }
  return JSON.parse(r.getContentText());
}
function jetonBase() {
  var s = proprietes().getProperty('SECRET_BASE');
  return s ? 'auth=' + encodeURIComponent(s) : 'access_token=' + encodeURIComponent(ScriptApp.getOAuthToken());
}
function adresseBase() {
  if (RELAIS.baseDonnees) return RELAIS.baseDonnees;
  var memo = proprietes().getProperty('BASE_URL');
  if (memo) return memo;
  var p = RELAIS.projet, candidats = ['https://' + p + '-default-rtdb.firebaseio.com',
    'https://' + p + '-default-rtdb.europe-west1.firebasedatabase.app',
    'https://' + p + '-default-rtdb.asia-southeast1.firebasedatabase.app'];
  for (var i = 0; i < candidats.length; i++) {
    var r = UrlFetchApp.fetch(candidats[i] + '/loges_platform/regles/v1_1.json', { muteHttpExceptions: true });
    var u = null;
    if (r.getResponseCode() === 200 || r.getResponseCode() === 401) u = candidats[i];
    else { var m = r.getContentText().match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.firebasedatabase\.app/); if (m) u = m[0]; }
    if (u) { proprietes().setProperty('BASE_URL', u); return u; }
  }
  throw new Error('Base de données introuvable : indiquez son adresse dans RELAIS.baseDonnees.');
}
function concepteurExiste() { return base('get', 'loges_platform/admins') !== null; }

/* ---------------- Code et demandes en attente ---------------- */
function nouveauCode() {
  // 48 bits tirés d'un UUID aléatoire (générateur sûr de Google), ramenés à 6 chiffres
  var h = Utilities.getUuid().replace(/-/g, '');
  return String(1000000 + parseInt(h.slice(0, 12), 16) % 1000000).slice(1);
}
function empreinte(uid, code, sel) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, uid + '|' + code + '|' + sel, Utilities.Charset.UTF_8));
}
function quotaDuJour(t) {
  var p = proprietes(), jour = new Date(t).toISOString().slice(0, 10), q = JSON.parse(p.getProperty('ENVOIS_JOUR') || '{}');
  if (q.jour !== jour) q = { jour: jour, n: 0 };
  if (q.n >= RELAIS.envoisParJour) return false;
  q.n++; p.setProperty('ENVOIS_JOUR', JSON.stringify(q));
  return true;
}
function proprietes() { return PropertiesService.getScriptProperties(); }
function lireAttente(uid) { var v = proprietes().getProperty('ATTENTE_' + uid); return v ? JSON.parse(v) : null; }
function ecrireAttente(uid, a) { proprietes().setProperty('ATTENTE_' + uid, JSON.stringify(a)); }
function effacerAttente(uid) { proprietes().deleteProperty('ATTENTE_' + uid); }
function maintenant() { return Date.now(); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* À lancer une fois depuis l'éditeur (bouton Exécuter) : demande les autorisations
   et vérifie l'accès à la base avant la mise en ligne. */
function verifierInstallation() {
  var existe = concepteurExiste();
  Logger.log('Base : ' + adresseBase() + ' — accès OK. Compte concepteur déjà validé : ' + (existe ? 'oui' : 'non') + '.');
  Logger.log('Le code sera envoyé uniquement à : ' + RELAIS.emailConcepteur);
}
