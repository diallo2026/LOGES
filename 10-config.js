/* ================================================================
   CONFIGURATION DE LA PLATEFORME LOGES
   ================================================================ */
var LOGES = {
  version: '1.0.0 — 25/10/2026',
  firebase: {
    apiKey: 'AIzaSyAilF7eamC09Bxj_Hi7J_UcJnvCtvsi6rE',
    authDomain: 'loges-b8212.firebaseapp.com',
    projectId: 'loges-b8212',
    storageBucket: 'loges-b8212.firebasestorage.app',
    messagingSenderId: '164331045162',
    appId: '1:164331045162:web:d60d62ba2b965fe45e1e53',
    // Adresse de la base (console Firebase → Realtime Database, en haut de l'onglet Données).
    // Laissée vide : l'application la détecte toute seule (États-Unis, Europe ou Asie).
    databaseURL: ''
  },
  sdk: '10.12.2',
  // Les identifiants de connexion deviennent « utilisateur@ecole.loges.invalid » :
  // domaine réservé, aucun e-mail n'y est jamais envoyé.
  domaineConnexion: 'loges.invalid',
  // Seule cette adresse (vérifiée) peut créer le premier compte concepteur.
  // Doit être identique à EMAIL_CONCEPTEUR dans outils/generer-regles.mjs.
  emailsConcepteur: ['souleymane0403@gmail.com'],
  contacts: {
    whatsapp: ['224623030403', '224624139549'],
    email: 'souleymane0403@gmail.com'
  },
  essaiParDefaut: 14,
  inactiviteMinutes: 30,
  logo: '__LOGO__',
  embleme: '__EMBLEME__'
};
