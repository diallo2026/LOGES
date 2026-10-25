// =====================================================================
// LOGES — génération des règles de sécurité Firebase Realtime Database
// Produit database.rules.json à partir d'expressions réutilisables.
// Usage : node outils/generer-regles.mjs
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Adresse e-mail autorisée à créer le PREMIER compte concepteur
// (doit être vérifiée par le lien reçu). À adapter si besoin.
const EMAIL_CONCEPTEUR = 'souleymane0403@gmail.com';

const RE_CODE = '/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/';
const RE_USER = '/^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/';
const MAX_ESSAI_MS = 31 * 24 * 3600 * 1000;

// ---- Expressions réutilisables (s = expression donnant l'identifiant de l'école) ----
const ecole = (s) => `root.child('loges_ecoles').child(${s})`;
const moi = (s) => `${ecole(s)}.child('membres').child(auth.uid)`;
const MEMBRE = (s) => `(auth != null && root.child('loges_utilisateurs').child(auth.uid).child('ecole').val() === ${s} && ${moi(s)}.child('statut').val() === 'actif')`;
const ROLE = (s, ...roles) => `(${roles.map((r) => `${moi(s)}.child('role').val() === '${r}'`).join(' || ')})`;
const LICENCE = (s) => `(${ecole(s)}.child('licence').child('statut').val() !== 'bloque' && ${ecole(s)}.child('licence').child('expiration').val() > now)`;
const ADMIN = `(auth != null && root.child('loges_platform').child('admins').child(auth.uid).exists())`;
const and = (...x) => x.join(' && ');
const or = (...x) => `(${x.join(' || ')})`;
const S = '$sid';

const str = (min, max) => `newData.isString() && newData.val().length >= ${min} && newData.val().length <= ${max}`;
const optStr = (max) => `newData.isString() && newData.val().length <= ${max}`;
const num = (min, max) => `newData.isNumber() && newData.val() >= ${min} && newData.val() <= ${max}`;
const oneOf = (...v) => `(${v.map((x) => `newData.val() === '${x}'`).join(' || ')})`;
const immuable = `(!data.exists() || newData.val() === data.val())`;
const horodatage = `(newData.isNumber() && newData.val() === now)`;
const image = (max) => `newData.isString() && newData.val().length <= ${max} && newData.val().beginsWith('data:image/')`;
const autre = { $other: { '.validate': false } };

// Création d'une école par son fondateur (une seule écriture groupée)
const CREATION = and(
  'auth != null', '!data.exists()',
  `newData.child('info').child('creePar').val() === auth.uid`,
  `newData.child('membres').child(auth.uid).child('proprietaire').val() === true`,
  `newData.child('membres').child(auth.uid).child('role').val() === 'fondation'`,
  `newData.child('membres').child(auth.uid).child('statut').val() === 'actif'`,
  `!root.child('loges_utilisateurs').child(auth.uid).exists()`,
  `!root.child('loges_platform').child('admins').child(auth.uid).exists()`,
  `newData.parent().parent().child('loges_utilisateurs').child(auth.uid).child('ecole').val() === $sid`,
  `newData.parent().parent().child('loges_codes').child(newData.child('info').child('code').val()).val() === $sid`,
  `newData.child('licence').child('statut').val() === 'essai'`,
  `newData.child('licence').child('expiration').val() <= now + ${MAX_ESSAI_MS + 120000}`,
);
const ENCREATION = `!root.child('loges_ecoles').child($sid).exists()`;

const journal = (lecteurs, ecrivain) => ({
  '.read': and(MEMBRE(S), LICENCE(S), ROLE(S, ...lecteurs)),
  $id: {
    '.write': ecrivain === 'admin_plateforme'
      ? and('!data.exists()', ADMIN)
      : and('!data.exists()', MEMBRE(S), LICENCE(S), ROLE(S, ecrivain)),
    '.validate': and(`newData.hasChildren(['t', 'uid', 'action', 'objet'])`, '!data.exists()'),
    t: { '.validate': horodatage },
    uid: { '.validate': `newData.val() === auth.uid` },
    auteur: { '.validate': optStr(120) },
    action: { '.validate': str(2, 40) },
    objet: { '.validate': str(2, 60) },
    detail: { '.validate': optStr(500) },
    ...autre,
  },
});

const rules = {
  rules: {
    '.read': false,
    '.write': false,

    // Index identifiant d'école → école (lecture d'une clé à la fois, jamais de liste)
    loges_codes: {
      '.read': ADMIN,
      $code: {
        '.read': true,
        '.write': and(
          'auth != null', '!data.exists()', `$code.matches(${RE_CODE})`,
          `!root.child('loges_ecoles').child(newData.val()).exists()`,
          `newData.parent().parent().child('loges_ecoles').child(newData.val()).child('info').child('code').val() === $code`,
          `newData.parent().parent().child('loges_ecoles').child(newData.val()).child('info').child('creePar').val() === auth.uid`,
        ),
        '.validate': `newData.isString()`,
      },
    },

    // Rattachement d'un compte à son école (jamais modifiable ensuite)
    loges_utilisateurs: {
      $uid: {
        '.read': or('auth != null && auth.uid === $uid', ADMIN),
        '.write': and(
          '!data.exists()', `!root.child('loges_platform').child('admins').child($uid).exists()`,
          or(
            // le fondateur qui crée son école
            and(`auth.uid === $uid`,
              `newData.parent().parent().child('loges_ecoles').child(newData.child('ecole').val()).child('info').child('creePar').val() === auth.uid`,
              `!root.child('loges_ecoles').child(newData.child('ecole').val()).exists()`),
            // un administrateur de l'école qui crée un compte du personnel
            and(MEMBRE(`newData.child('ecole').val()`), ROLE(`newData.child('ecole').val()`, 'fondation'), LICENCE(`newData.child('ecole').val()`)),
            // la plateforme qui remet un accès au compte principal
            ADMIN,
          ),
        ),
        '.validate': `newData.hasChildren(['ecole'])`,
        ecole: { '.validate': `newData.isString()` },
        ...autre,
      },
    },

    loges_ecoles: {
      $sid: {
        '.write': CREATION,

        info: {
          '.read': or(MEMBRE(S), ADMIN),
          '.write': and(MEMBRE(S), ROLE(S, 'fondation'), LICENCE(S)),
          '.validate': `newData.hasChildren(['code', 'nom', 'fondateur', 'tel', 'region', 'prefecture', 'commune', 'quartier', 'devise', 'creeLe', 'creePar'])`,
          code: { '.validate': and(`newData.isString()`, `newData.val().matches(${RE_CODE})`, immuable) },
          nom: { '.validate': str(3, 150) },
          fondateur: { '.validate': str(2, 120) },
          tel: { '.validate': and(str(8, 20), `newData.val().matches(/^[+]?[0-9 ]+$/)`) },
          email: { '.validate': optStr(120) },
          region: { '.validate': str(2, 60) },
          prefecture: { '.validate': str(2, 60) },
          commune: { '.validate': str(2, 60) },
          quartier: { '.validate': str(2, 80) },
          devise: { '.validate': `newData.isString() && newData.val().matches(/^[A-Z]{3}$/)` },
          creeLe: { '.validate': and(`newData.isNumber()`, immuable) },
          creePar: { '.validate': and(`newData.isString()`, immuable) },
          ...autre,
        },

        // Licence : écrite par la plateforme uniquement (sauf l'essai initial à la création)
        licence: {
          '.read': or(MEMBRE(S), ADMIN),
          '.write': ADMIN,
          '.validate': `newData.hasChildren(['statut', 'expiration'])`,
          statut: { '.validate': oneOf('essai', 'actif', 'bloque') },
          debut: { '.validate': `newData.isNumber()` },
          expiration: { '.validate': `newData.isNumber()` },
          carte: { '.validate': optStr(40) },
          carteLibelle: { '.validate': optStr(80) },
          dernierPaiement: { '.validate': `newData.isNumber()` },
          avantBlocage: { '.validate': oneOf('essai', 'actif') },
          motif: { '.validate': optStr(300) },
          majLe: { '.validate': `newData.isNumber()` },
          ...autre,
        },

        parametres: {
          '.read': MEMBRE(S),
          '.write': and(MEMBRE(S), ROLE(S, 'fondation'), LICENCE(S)),
          nomCourt: { '.validate': optStr(60) },
          slogan: { '.validate': optStr(150) },
          adresse: { '.validate': optStr(250) },
          tel2: { '.validate': optStr(20) },
          directeur: { '.validate': optStr(120) },
          logo: { '.validate': image(300000) },
          couleur: { '.validate': `newData.isString() && newData.val().matches(/^#[0-9A-Fa-f]{6}$/)` },
          piedDePage: { '.validate': optStr(300) },
          formatDate: { '.validate': oneOf('JJ/MM/AAAA', 'JJ-MM-AAAA', 'AAAA-MM-JJ') },
          ...autre,
        },

        // Version du compte de connexion de chaque nom d'utilisateur (lecture publique clé par clé)
        identifiants: {
          '.read': and(MEMBRE(S), LICENCE(S)),
          $username: {
            '.read': true,
            '.write': or(and(MEMBRE(S), ROLE(S, 'fondation'), LICENCE(S)), ADMIN),
            '.validate': and(`$username.matches(${RE_USER})`, `newData.hasChildren(['v'])`),
            v: { '.validate': num(1, 999) },
            ...autre,
          },
        },

        membres: {
          '.read': or(and(MEMBRE(S), LICENCE(S), ROLE(S, 'fondation', 'direction')), ADMIN),
          $uid: {
            '.read': `auth != null && auth.uid === $uid`,
            '.write': or(
              and(MEMBRE(S), ROLE(S, 'fondation'), LICENCE(S), `(data.child('proprietaire').val() !== true || $uid === auth.uid)`),
              and(ADMIN, `(data.child('proprietaire').val() === true || newData.child('proprietaire').val() === true)`),
            ),
            '.validate': and(
              `newData.hasChildren(['username', 'nom', 'role', 'statut', 'proprietaire'])`,
              // le compte principal reste Fondation
              `(newData.child('proprietaire').val() !== true || newData.child('role').val() === 'fondation')`,
              // personne ne change son propre rôle ni ne se désactive
              `(!data.exists() || $uid !== auth.uid || newData.child('role').val() === data.child('role').val())`,
              `(!data.exists() || $uid !== auth.uid || newData.child('statut').val() === data.child('statut').val())`,
            ),
            username: { '.validate': and(`newData.isString()`, `newData.val().matches(${RE_USER})`, immuable) },
            nom: { '.validate': str(2, 120) },
            role: { '.validate': oneOf('fondation', 'direction', 'comptabilite') },
            statut: { '.validate': oneOf('actif', 'desactive', 'remplace') },
            proprietaire: {
              '.validate': and(`newData.isBoolean()`, or(
                `newData.val() === false && data.val() !== true`,
                `newData.val() === true && data.val() === true`,
                and(`newData.val() === true`, ENCREATION, `$uid === auth.uid`),
                and(`newData.val() === true`, '!data.exists()', ADMIN),
              )),
            },
            doitChangerMdp: {
              '.write': and(`auth != null && auth.uid === $uid`, `newData.val() === false`, MEMBRE(S)),
              '.validate': `newData.isBoolean()`,
            },
            derniereConnexion: {
              '.write': and(`auth != null && auth.uid === $uid`, MEMBRE(S)),
              '.validate': horodatage,
            },
            tel: { '.validate': optStr(20) },
            email: { '.validate': optStr(120) },
            accesFinances: { '.validate': `newData.isBoolean()` },
            creeLe: { '.validate': `newData.isNumber()` },
            creePar: { '.validate': `newData.isString()` },
            remplacePar: { '.validate': `newData.isString()` },
            ...autre,
          },
        },

        annees: {
          '.read': and(MEMBRE(S), LICENCE(S)),
          $id: {
            '.write': and(MEMBRE(S), ROLE(S, 'direction'), LICENCE(S)),
            '.validate': `newData.hasChildren(['libelle', 'debut', 'fin', 'statut', 'courante'])`,
            libelle: { '.validate': `newData.isString() && newData.val().matches(/^[0-9]{4}-[0-9]{4}$/)` },
            debut: { '.validate': `newData.isString() && newData.val().matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)` },
            fin: { '.validate': `newData.isString() && newData.val().matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) && newData.val() > newData.parent().child('debut').val()` },
            statut: { '.validate': oneOf('preparation', 'ouverte', 'cloturee', 'archivee') },
            courante: { '.validate': `newData.isBoolean() && (newData.val() === false || newData.parent().child('statut').val() === 'preparation' || newData.parent().child('statut').val() === 'ouverte')` },
            creeLe: { '.validate': `newData.isNumber()` },
            creePar: { '.validate': `newData.isString()` },
            ...autre,
          },
        },

        niveaux: {
          '.read': and(MEMBRE(S), LICENCE(S)),
          $id: {
            '.write': and(MEMBRE(S), ROLE(S, 'direction'), LICENCE(S)),
            '.validate': `newData.hasChildren(['code', 'nom', 'ordre', 'actif', 'cycle'])`,
            code: { '.validate': and(`newData.isString() && newData.val().matches(/^[A-Z0-9_-]{1,12}$/)`, immuable) },
            nom: { '.validate': str(1, 60) },
            ordre: { '.validate': num(0, 99) },
            actif: { '.validate': `newData.isBoolean()` },
            cycle: { '.validate': oneOf('prescolaire', 'primaire', 'college', 'lycee') },
            ...autre,
          },
        },

        // Journal en ajout seul, cloisonné par domaine selon le rôle
        journal: {
          admin: journal(['fondation'], 'fondation'),
          pedagogie: journal(['fondation', 'direction'], 'direction'),
          finance: journal(['fondation', 'comptabilite'], 'comptabilite'),
          plateforme: journal(['fondation'], 'admin_plateforme'),
        },

        connexions: {
          '.read': and(MEMBRE(S), LICENCE(S), ROLE(S, 'fondation')),
          $id: {
            '.write': and('!data.exists()', MEMBRE(S)),
            '.validate': and(`newData.hasChildren(['t', 'uid'])`, '!data.exists()'),
            t: { '.validate': horodatage },
            uid: { '.validate': `newData.val() === auth.uid` },
            ...autre,
          },
        },

        // Déclarations de paiement de licence (copie côté école, sans image)
        paiementsLicence: {
          '.read': or(and(MEMBRE(S), ROLE(S, 'fondation', 'comptabilite')), ADMIN),
          $id: {
            '.write': or(
              and('!data.exists()', MEMBRE(S), ROLE(S, 'fondation', 'comptabilite'),
                `newData.child('statut').val() === 'en_attente'`, `newData.child('uid').val() === auth.uid`),
              and('data.exists()', ADMIN),
            ),
            '.validate': `newData.hasChildren(['carte', 'montant', 'moyen', 't', 'uid', 'statut'])`,
            carte: { '.validate': str(1, 40) },
            carteLibelle: { '.validate': optStr(80) },
            mois: { '.validate': num(1, 36) },
            montant: { '.validate': num(0, 1000000000) },
            moyen: { '.validate': oneOf('orange_money', 'mobile_money', 'especes', 'virement', 'autre') },
            reference: { '.validate': optStr(80) },
            t: { '.validate': `newData.isNumber()` },
            uid: { '.validate': `newData.isString()` },
            statut: { '.validate': oneOf('en_attente', 'valide', 'rejete') },
            motif: { '.validate': optStr(300) },
            traiteLe: { '.validate': `newData.isNumber()` },
            facture: { '.validate': optStr(40) },
            ...autre,
          },
        },
        $other: { '.validate': false },
      },
    },

    loges_platform: {
      admins: {
        '.read': ADMIN,
        $uid: {
          '.write': or(
            ADMIN,
            and('auth != null', `auth.uid === $uid`, `!root.child('loges_platform').child('admins').exists()`,
              `auth.token.email === '${EMAIL_CONCEPTEUR}'`, `auth.token.email_verified === true`,
              `!root.child('loges_utilisateurs').child($uid).exists()`),
          ),
          '.validate': `newData.hasChildren(['nom', 'email', 'creeLe'])`,
        },
      },
      config: {
        '.read': true,
        '.write': ADMIN,
        essaiJours: { '.validate': num(1, 31) },
        publierTarifs: { '.validate': `newData.isBoolean()` },
        instructions: { '.validate': optStr(600) },
        whatsapp: { '.validate': optStr(20) },
        devise: { '.validate': `newData.isString() && newData.val().matches(/^[A-Z]{3}$/)` },
        majLe: { '.validate': `newData.isNumber()` },
        ...autre,
      },
      tarifs: {
        '.read': true,
        $id: {
          '.write': ADMIN,
          '.validate': `newData.hasChildren(['libelle', 'mois', 'prix', 'actif'])`,
          libelle: { '.validate': str(2, 80) },
          mois: { '.validate': num(1, 36) },
          prix: { '.validate': num(0, 1000000000) },
          actif: { '.validate': `newData.isBoolean()` },
          ordre: { '.validate': num(0, 99) },
          ...autre,
        },
      },
      // Déclarations reçues par le concepteur (avec justificatif)
      paiements: {
        '.read': ADMIN,
        $id: {
          '.write': or(
            and('!data.exists()', 'auth != null', `newData.child('uid').val() === auth.uid`, `newData.child('statut').val() === 'en_attente'`,
              MEMBRE(`newData.child('ecole').val()`), ROLE(`newData.child('ecole').val()`, 'fondation', 'comptabilite')),
            and('data.exists()', ADMIN),
          ),
          '.validate': `newData.hasChildren(['ecole', 'carte', 'montant', 'moyen', 't', 'uid', 'statut'])`,
          justificatif: { '.validate': image(400000) },
          statut: { '.validate': oneOf('en_attente', 'valide', 'rejete') },
          montant: { '.validate': num(0, 1000000000) },
        },
      },
      factures: { '.read': ADMIN, '.write': ADMIN },
      compteurs: { '.read': ADMIN, '.write': ADMIN },
      $other: { '.validate': false },
    },
  },
};

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database.rules.json');
fs.writeFileSync(out, JSON.stringify(rules, null, 2) + '\n');
console.log('Règles écrites :', out, `(${fs.statSync(out).size} octets)`);
