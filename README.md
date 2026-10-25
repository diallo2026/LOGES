# LOGES — Logiciel de gestion scolaire (version 1.5)

> **Version 1.5 — CA (Coordination générale) à la place de la Fondation.** Le compte principal de l'école devient le **CA — Coordination générale** : il peut faire **toutes les tâches** (élèves et inscriptions, paiements, frais, rappels, salaires, classes, personnel, matières, emploi du temps, années et niveaux, comptes, paramètres, licence). Chaque opération est inscrite au journal **à son nom, avec son rôle** ; les règles de la base refusent toute entrée au nom d'un autre (nom, identifiant, rôle et nom sur les reçus et bons sont contrôlés). Quand le CA fait une tâche de la Direction ou de la Comptabilité, elle apparaît aussi dans leur journal, à son nom. Le journal se filtre par auteur.
> Les comptes existants ne changent pas : le rôle reste enregistré « fondation » dans la base et s'affiche « CA — Coordination générale » ; les anciens noms d'utilisateur (ex. `fondateur`) fonctionnent comme avant. Nouvelle école : nom d'utilisateur proposé `coordination`.
> Adresse du relais concepteur : elle se colle maintenant **dans l'écran « Créer le compte concepteur »** (vérifiée puis retenue sur l'appareil) ; plus besoin de modifier `index.html`. Le relais déjà déployé reste valable.
> Inscription d'un élève : le champ en erreur est mis en avant et le message affiché ; les téléphones écrits avec points ou tirets sont acceptés.
> **À faire une fois :** publier le nouveau `database.rules.json` (étape 1 b), puis remplacer `index.html` et `sw.js` sur GitHub Pages. Sans les nouvelles règles, les tâches du CA hors administration sont refusées (message rouge sur le tableau de bord).
>
> **Version 1.4 — création du compte concepteur validée par un code reçu par e-mail.** À la création, un code à 6 chiffres est envoyé **uniquement** à `souleymane0403@gmail.com` ; tant que ce code n'est pas saisi, le compte n'est pas validé et n'a aucun droit. Le lien de vérification n'est plus utilisé.
> À faire une fois : **déployer le relais** (étape 1 e, ci-dessous), puis publier le nouveau `database.rules.json` (étape 1 b) et remplacer `index.html` et `sw.js` sur GitHub Pages. Si votre compte concepteur est déjà validé, il continue de fonctionner tel quel : le relais ne sert qu'à la création. Aucune donnée existante n'est modifiée.
>
> **Mise à jour 1.3 — à faire une fois :** publier le nouveau `database.rules.json` (étape 1 b) **et** remplacer `index.html` et `sw.js` sur GitHub Pages.
> Sans les nouvelles règles, la Fondation ne peut pas créer de classe ni de personnel, et les salaires, photos et bulletins de paie sont refusés ; l'application affiche alors un message rouge, et l'onglet Sécurité du concepteur indique « Règles d'une version précédente ».
> Nouveautés : la Fondation crée et modifie les classes et le personnel ; fonctions maître, maîtresse, vigile, gardien… ; salaire saisi sur la fiche du personnel et repris automatiquement chez la Comptabilité ; écran **Salaires** (avances, paiements, bons de salaire, suivi par personne, bulletin de paie mensuel A4, état de paiement) ; photo du personnel et de l'élève ; suppression d'une fiche du personnel ; à l'inscription, date de naissance et tuteur obligatoires, père et mère facultatifs.
> Les données déjà enregistrées ne sont ni modifiées ni déplacées : la version 1.3 ajoute seulement de nouveaux nœuds (`paie`, `photos`) et de nouveaux champs facultatifs.
>
> **Version 1.2 :** le mot de passe d'un compte du personnel est écrit par la Fondation à la création ; c'est le mot de passe définitif (plus de mot de passe provisoire ni de changement imposé). La Fondation modifie ensuite tout le compte : nom, rôle, téléphone, e-mail et mot de passe. Les règles de la base sont les mêmes qu'en 1.1.
>
> **Mise à jour 1.1 — à faire une fois :** publier le nouveau `database.rules.json` (étape 1 b) **et** remplacer `index.html` et `sw.js` sur GitHub Pages.
> Sans les nouvelles règles, les inscriptions, paiements, classes, personnel et emplois du temps sont refusés par la base ; l'application l'affiche alors en rouge sur le tableau de bord, et l'onglet Sécurité du concepteur indique « Règles d'une version précédente ».
> Les données déjà enregistrées (écoles, comptes, années, niveaux, licences) ne sont ni modifiées ni déplacées : la version 1.1 ajoute seulement de nouveaux nœuds.

Application en **un seul fichier** (`index.html`) sur **Firebase** (Authentication + Realtime Database), installable comme une application (PWA). Même principe qu'AGV : page d'accueil avec l'identifiant de l'école, accès concepteur caché, hébergement sur GitHub Pages.

- **Accueil** : l'école tape son identifiant, puis se connecte. « Nouvelle école » crée l'établissement (essai gratuit).
- **Espace école** : CA — Coordination générale (toutes les tâches), Direction, Comptabilité.
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

### e) Premier compte concepteur — validation par code e-mail

Le code est tiré au hasard et envoyé par un petit **relais Google Apps Script** (gratuit, sur votre compte Google), jamais par le navigateur : seule la personne qui lit la boîte `souleymane0403@gmail.com` peut le connaître. Les règles de la base interdisent à tout navigateur de s'inscrire lui-même concepteur ; seul ce relais le fait, après la saisie du bon code.

**1. Déployer le relais (une seule fois)** — avec le **compte Google propriétaire du projet Firebase** `loges-b8212` :
1. Ouvrir <https://script.google.com> → **Nouveau projet**. Le nommer « Relais LOGES ».
2. Effacer le contenu de `Code.gs` et y coller tout le fichier `outils/relais-concepteur.gs`.
3. **Paramètres du projet** (roue dentée) → cocher **Afficher le fichier manifeste « appsscript.json »**. Revenir à l'éditeur, ouvrir `appsscript.json` et y coller tout le fichier `outils/relais-appsscript.json`. Enregistrer.
4. Choisir la fonction **verifierInstallation** → **Exécuter** → accepter les autorisations (écran « Application non validée » : **Paramètres avancés** → **Accéder à Relais LOGES**). Le journal doit afficher « accès OK ».
5. **Déployer** → **Nouveau déploiement** → type **Application Web** → *Exécuter en tant que* : **Moi** ; *Qui a accès* : **Tout le monde** → **Déployer**. Copier l'**URL de l'application Web** (`https://script.google.com/macros/s/…/exec`).
6. Sur le site : taper `@CONCEPTEUR` → **Créer le compte concepteur** → coller cette adresse dans **Adresse du relais** → **Vérifier et enregistrer l'adresse**. Elle est vérifiée auprès du relais puis retenue sur cet appareil. (Facultatif : l'écrire une fois pour toutes dans `src/10-config.js` → `relaisConcepteur`, ou dans `index.html` à l'endroit `relaisConcepteur: ''`.)

Vérification : ouvrir l'URL du relais dans un navigateur affiche `{"ok":true,"service":"Relais LOGES …"}`.

**2. Créer le compte**
1. Ouvrir le site, taper `@CONCEPTEUR` dans le champ identifiant → **Créer le compte concepteur**.
2. L'adresse `souleymane0403@gmail.com` est imposée ; choisir le mot de passe (10 caractères minimum, lettres et chiffres) → **Créer le compte et recevoir le code**.
3. Saisir le code à 6 chiffres reçu par e-mail (pensez aux courriers indésirables) → **Valider le code**. L'espace concepteur s'ouvre.

Règles du code : valable 15 minutes, 5 essais au plus (ensuite il faut en demander un autre), un nouvel envoi au plus toutes les minutes et 5 par heure ; seul le dernier code reçu est valable. Le code n'est conservé que sous forme d'empreinte (jamais en clair). Tant qu'il n'est pas saisi, le compte reste **non validé** : se reconnecter ramène à l'écran du code. Une fois un compte concepteur validé, plus aucun autre ne peut l'être de cette façon.

En cas de souci :
- « Le relais ne répond pas » : dans Apps Script → Déployer → Gérer les déploiements, vérifier : *Application Web*, exécuter en tant que *Moi*, accès *Tout le monde* (pas « Tout le monde avec un compte Google »), et copier l'adresse qui se termine par `/exec` (celle en `/dev` ne fonctionne pas).
- « Ce n'est pas le relais LOGES » : le fichier `relais-concepteur.gs` n'a pas été collé en entier, ou le déploiement n'a pas été mis à jour (Modifier → Nouvelle version).
- « Erreur du relais : Base de données : accès refusé » : le script n'appartient pas au compte Google propriétaire du projet. Soit le recréer avec ce compte, soit, dans le script → **Paramètres du projet** → **Propriétés du script**, ajouter `SECRET_BASE` = secret de la base (console Firebase → Paramètres du projet → Comptes de service → Codes secrets de la base de données).
- « Un compte existe déjà avec cette adresse, avec un autre mot de passe » : saisir ce mot de passe, ou supprimer ce compte dans la console Firebase (**Authentication → Utilisateurs**), puis recommencer.
- Après une modification du script : **Déployer → Gérer les déploiements → Modifier → Nouvelle version** (l'URL ne change pas).

L'adresse qui reçoit le code est écrite dans le relais (`RELAIS.emailConcepteur`) et jamais lue dans la demande ; pour la changer, la modifier dans `outils/relais-concepteur.gs` (puis redéployer) **et** dans `src/10-config.js` → `emailsConcepteur`.

### f) Réglages du concepteur
Onglet **Licences & paiements** :
- **Cartes de licence** : libellé, durée en mois, prix → **Enregistrer les cartes**.
- **Réglages** : durée de l'essai, WhatsApp, devise, instructions de paiement, case **Publier les tarifs** → **Enregistrer les réglages**.

Onglet **Sécurité** : doit afficher **✓ Règles actives (version 1.5)**. « La base est ouverte » ou « Règles d'une version précédente » : l'étape b) reste à faire.

---

## 2. Fonctionnement

### Rôles
| | CA — Coordination générale | Direction | Comptabilité |
|---|---|---|---|
| Tableau de bord | ✓ | ✓ | ✓ |
| Journal des opérations (chaque entrée au nom et au rôle de son auteur) | tout, filtrable par auteur | pédagogie | finances |
| Comptes du personnel | crée (avec le mot de passe), modifie tout, désactive | consulte | — |
| Informations et logo de l'école | modifie | consulte | consulte |
| Années scolaires et niveaux | crée, clôture, renomme | crée, clôture, renomme | consulte |
| Licence (déclarer un paiement) | ✓ | — | ✓ |
| Classes de l'année, listes des inscrits | crée, modifie, titulaire, imprime | crée, modifie, titulaire, imprime | consulte, imprime |
| Élèves | inscrit, réinscrit, modifie, change de classe, sorties | consulte, change de classe (même niveau) | inscrit, réinscrit, modifie, sorties |
| Frais scolaires, versements, reçus, rappels | gère | — | gère |
| Personnel de l'école (fiche, photo, salaire) | crée, modifie, supprime, imprime | crée, modifie, supprime, imprime | — |
| Salaires : bulletins, avances, paiements, bons | gère, imprime | — | gère, imprime |
| Matières, emploi du temps | gère, imprime | gère, imprime | — |

Le CA peut tout faire ; la Direction et la Comptabilité gardent leurs domaines. Un reçu ou un bon porte le nom de celui qui a réellement encaissé ou payé (« Encaissé par », « Payé par »).

### Mise en route d'une année (ordre conseillé)
1. **Direction** — *Années scolaires et niveaux* : l'année courante existe ; ajouter la maternelle (PS, MS, GS) si besoin.
2. **CA ou Direction** — *Classes et listes* : « Créer une classe par niveau », puis ajouter les classes parallèles (ex. 1re année B), titulaire et capacité.
3. **CA ou Direction** — *Personnel* : ajouter la direction, les maîtres et maîtresses, l'administration, les vigiles, gardiens et autre personnel de service, avec photo et **salaire** (mensuel ou à l'heure, moyen de paiement, CNSS).
4. **Direction** — *Matières* puis *Emploi du temps* : horaires types, puis une case = une matière + un enseignant. Un enseignant ou une salle ne peut pas être à deux endroits au même moment.
5. **Comptabilité** — *Frais scolaires* : inscription, réinscription, scolarité et échéancier (unique, 3 tranches, mensuel ou libre) pour chaque niveau.
6. **Comptabilité ou CA** — *Élèves* : inscrire (nouvel élève) ou réinscrire (ancien élève) avec photo, date de naissance et tuteur (obligatoires), père et mère (facultatifs), premier versement facultatif.
7. **Comptabilité** — *Salaires du personnel* : chaque mois, bulletins, avances et paiements.

### Élèves et finances
- **Matricule** `ELV-AAAA-NNNN` et **reçu** `REC-AAAA-NNNNNN` : numéros attribués par un compteur de la base, jamais deux fois le même.
- Les montants dus sont **figés à l'inscription** : changer la grille ne modifie pas les élèves déjà inscrits, sauf si l'on coche « Appliquer aussi aux élèves déjà inscrits ».
- **Remise** par élève (montant et motif), répartie sur les échéances.
- Un **versement n'est jamais supprimé** : il peut être modifié ou annulé avec un motif ; tout est inscrit au journal. Un reçu réimprimé porte la mention **DUPLICATA**.
- **Rappels** : à une date choisie, liste des élèves dont les échéances passées ne sont pas réglées ; message WhatsApp prêt à envoyer au parent, avis de rappel imprimable ; chaque rappel est tracé.

### Salaires du personnel (Comptabilité)
- Le salaire saisi sur la fiche du personnel apparaît automatiquement, mois par mois. La Comptabilité peut l'ajuster (« modifier ») : seule la rémunération change, le reste de la fiche n'est pas touché.
- **Bulletin du mois** : salaire de base ou heures × taux, heures supplémentaires, primes et indemnités, CNSS (5 % proposé), RTS, autres retenues.
- **Payer** : avance (acompte) ou paiement du salaire ; chaque versement reçoit un **bon de salaire** `BS-AAAA-NNNNNN` (numéro unique) imprimé en 2 exemplaires. Un bon n'est jamais supprimé : il peut être annulé avec un motif ; une réimpression porte la mention DUPLICATA.
- **Suivi** : net du mois, versé, reste et état (payé, partiel, non payé) pour chaque personne ; clic sur le nom → historique de tous ses mois et bons.
- Au premier versement d'un mois, les éléments du bulletin sont figés : changer le salaire plus tard ne réécrit pas les mois déjà payés.
- Une fiche supprimée garde ses versements dans l'historique (le nom y est recopié).

### Impressions (PDF A4)
Tous les documents utilisent le même modèle : en-tête de l'école (logo, nom, coordonnées), titre, en-têtes de tableau répétés sur chaque page, lignes jamais coupées, numéros de page.
Dans la fenêtre d'impression, choisir **Enregistrer au format PDF**.

| Document | Format |
|---|---|
| Liste des élèves inscrits (par classe ou toutes les classes) | A4 portrait |
| Situation financière d'une classe, retards de paiement, journal des encaissements | A4 paysage |
| Reçu de paiement (2 exemplaires : déposant et souche) | A4 portrait |
| Avis de rappel, fiche de l'élève, grille des frais | A4 portrait |
| Emploi du temps (classe, toutes les classes, enseignant), liste du personnel | A4 paysage |
| Bulletin de paie mensuel (un par personne, ou tous ceux du mois), bon de salaire (2 exemplaires) | A4 portrait |
| État de paiement des salaires du mois (avec colonne d'émargement) | A4 paysage |

### Licence
- Chaque nouvelle école reçoit un essai (14 jours par défaut, réglable).
- L'école déclare son paiement (moyen, référence, photo du reçu). Le concepteur clique **Valider et activer** : la licence s'active et une facture `FL-AAAA-NNNN` est produite (imprimable, envoyable par WhatsApp).
- Licence expirée ou école bloquée : l'accès aux données est coupé **par les règles de la base**, pas seulement à l'écran. L'école voit le motif et peut toujours déclarer un paiement.
- Le blocage et le déblocage s'appliquent en direct, sans reconnexion.

### Accès oubliés
- **Personnel** : le CA ouvre **Modifier** sur le compte et écrit un nouveau mot de passe ; l'ancien cesse aussitôt de fonctionner, sur tous les appareils. Le nom d'utilisateur, le rôle, l'historique et le journal ne changent pas. (Techniquement, un nouveau compte de connexion reprend la fiche et l'ancien est marqué « remplacé » : Firebase ne permet pas de changer le mot de passe d'une autre personne sans serveur d'administration.)
- Chacun peut aussi changer son propre mot de passe dans **Mon compte**.
- **Compte principal (CA — Coordination générale)** : le concepteur, depuis **Détails** de l'école, après vérification par téléphone.

### Sécurité
- Aucun mot de passe dans le code (contrairement à AGV).
- Compte concepteur : validé uniquement par le code envoyé à l'adresse du concepteur ; aucun navigateur ne peut s'inscrire lui-même concepteur.
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
    annees, niveaux, journal, connexions, paiementsLicence      (version 1.0, inchangés)
    classes, matieres, personnel, edt/{année}                    (Direction)
    eleves, inscriptions/{année}, compteurs                      (Comptabilité)
    finances/{frais, dus, paiements, rappels, compteurs}        (Comptabilité)
    paie/{bulletins/{mois}, versements, compteurs}               (Comptabilité — version 1.3)
    photos/{eleves, personnel}                                   (photos à part, listes rapides — version 1.3)
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
| `npm install && npm test` | 28 tests des règles + 4 tests du relais (le vrai script, services Google simulés) + 25 parcours complets dans Chromium (avec contrôle des PDF A4) |

Les tests tournent sans Internet, sur un simulateur qui applique exactement `database.rules.json` (Playwright requis pour les parcours).

---

## 4. Contact
Souleymane Diallo — WhatsApp 623 030 403 / 624 139 549 — souleymane0403@gmail.com
