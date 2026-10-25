# LOGES — Logiciel de gestion scolaire

Application en **un seul fichier** (`index.html`) sur **Firebase** (Authentication + Realtime Database), installable comme une application (PWA). Même principe qu'AGV : page d'accueil avec l'identifiant de l'école, accès concepteur caché, hébergement sur GitHub Pages.

- **Accueil** : l'école tape son identifiant, puis se connecte. « Nouvelle école » crée l'établissement (essai gratuit).
- **Espace école** : Fondation, Direction, Comptabilité, chacun avec ses droits.
- **Espace concepteur** : taper `@CONCEPTEUR` dans le champ identifiant (accueil ou connexion).

---

## 1. Mise en ligne (une seule fois)

### a) Firebase — Authentication
1. Console Firebase → projet **loges-b8212** → **Authentication** → **Commencer**.
2. Onglet **Mode de connexion** → **Adresse e-mail/Mot de passe** → **Activer** → Enregistrer.
3. Onglet **Paramètres** → **Domaines autorisés** → ajouter le domaine du site (ex. `votrecompte.github.io`).

### b) Firebase — Règles de la base
Les règles actuelles (`now < 1795392000000`) laissent la base **ouverte à tous** jusqu'au **23/11/2026**, puis la ferment complètement.

1. **Realtime Database** → onglet **Règles**.
2. Remplacer tout le contenu par celui de `database.rules.json`.
3. **Publier**.

> Ces règles s'appliquent à toute la base. Elles ne modifient aucune donnée, mais seuls les nœuds `loges_*` restent accessibles. Si cette base contient autre chose que LOGES, ne pas publier avant d'avoir ajouté ces nœuds aux règles.

### c) Adresse de la base (facultatif, recommandé)
L'application trouve seule l'adresse de la base (États-Unis, Europe ou Asie). Pour gagner une seconde à chaque ouverture :
1. Copier l'adresse affichée en haut de la page **Realtime Database** (ex. `https://loges-b8212-default-rtdb.firebaseio.com`).
2. La coller dans `src/10-config.js` → `databaseURL: '...'`, puis lancer `node outils/assembler.mjs`.
   Sans les outils : ouvrir `index.html`, chercher `databaseURL: ''` et y coller l'adresse.

### d) Hébergement — GitHub Pages
Déposer à la racine du dépôt **uniquement** :
```
index.html
sw.js
manifest.json
icons/        (tout le dossier)
```
Puis **Settings → Pages → Branch : main / (root)**.
Les mises à jour suivantes : remplacer `index.html`. Elles sont prises en compte dès la réouverture (la page est toujours demandée au réseau d'abord).

### e) Premier compte concepteur
1. Ouvrir le site, taper `@CONCEPTEUR` dans le champ identifiant.
2. **Créer le compte concepteur** : e-mail `souleymane0403@gmail.com`, mot de passe de 10 caractères minimum (lettres et chiffres).
3. Ouvrir le lien reçu par e-mail, revenir et cliquer **J'ai vérifié mon e-mail**.

Seule cette adresse, vérifiée, peut créer le premier compte concepteur, et une seule fois. Pour utiliser une autre adresse, la changer à **deux** endroits (`src/10-config.js` → `emailsConcepteur`, `outils/generer-regles.mjs` → `EMAIL_CONCEPTEUR`), puis régénérer les règles, réassembler et republier les règles.

### f) Réglages du concepteur
Onglet **Licences & paiements** :
- **Cartes de licence** : libellé, durée en mois, prix → **Enregistrer les cartes**.
- **Réglages** : durée de l'essai, WhatsApp, devise, instructions de paiement, case **Publier les tarifs** → **Enregistrer les réglages**.

Onglet **Sécurité** : doit afficher **✓ Règles actives**. S'il affiche « La base est ouverte », l'étape b) n'est pas faite.

---

## 2. Fonctionnement

### Rôles
| | Fondation | Direction | Comptabilité |
|---|---|---|---|
| Tableau de bord | ✓ | ✓ | ✓ |
| Journal des opérations | tout | pédagogie | finances |
| Comptes du personnel | crée, modifie, désactive | consulte | — |
| Informations et logo de l'école | modifie | consulte | consulte |
| Années scolaires et niveaux | consulte | crée, clôture, renomme | consulte |
| Licence (déclarer un paiement) | ✓ | — | ✓ |

### Licence
- Chaque nouvelle école reçoit un essai (14 jours par défaut, réglable).
- L'école déclare son paiement (moyen, référence, photo du reçu). Le concepteur clique **Valider et activer** : la licence s'active et une facture `FL-AAAA-NNNN` est produite (imprimable, envoyable par WhatsApp).
- Licence expirée ou école bloquée : l'accès aux données est coupé **par les règles de la base**, pas seulement à l'écran. L'école voit le motif et peut toujours déclarer un paiement.
- Le blocage et le déblocage s'appliquent en direct, sans reconnexion.

### Accès oubliés
- **Personnel** : la Fondation clique **Remettre l'accès** → nouveau mot de passe provisoire, l'ancien cesse de fonctionner.
- **Compte principal (Fondation)** : le concepteur, depuis **Détails** de l'école, après vérification par téléphone.

### Sécurité
- Aucun mot de passe dans le code (contrairement à AGV).
- Une école ne peut jamais lire les données d'une autre : contrôle fait par les règles de la base.
- Une école ne peut pas modifier sa licence ; seul le concepteur le peut.
- Le journal des opérations ne peut être ni modifié ni effacé.
- Session fermée après 30 minutes d'inactivité.

### Structure de la base
```
loges_codes/{identifiant}          → id de l'école (lecture publique, pour la connexion)
loges_utilisateurs/{uid}/ecole     → rattachement de chaque compte à une seule école
loges_ecoles/{id}/
    info, licence, parametres, identifiants, membres,
    annees, niveaux, journal, connexions, paiementsLicence
loges_platform/
    admins, config, tarifs, paiements, factures, compteurs
```

---

## 3. Pour modifier le code

Le code source est découpé dans `src/` ; `index.html` est **produit** à partir de ces fichiers.

| Commande | Rôle |
|---|---|
| `node outils/assembler.mjs` | assemble `index.html` (avec le logo) et vérifie la syntaxe JavaScript |
| `node outils/generer-regles.mjs` | régénère `database.rules.json` |
| `npm install && npm test` | 14 tests des règles + 10 parcours complets dans Chromium |

Les tests tournent sans Internet, sur un simulateur qui applique exactement `database.rules.json` (Playwright requis pour les parcours).

---

## 4. Contact
Souleymane Diallo — WhatsApp 623 030 403 / 624 139 549 — souleymane0403@gmail.com
