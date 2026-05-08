# Budget App

Application desktop de gestion de budget personnelle.
**React · Electron · Node.js · SQLite · Enable Banking (PSD2)**

---

## Installer l'application

Télécharge le dernier `.exe` depuis la page [Releases](https://github.com/jeremiegermond/BudgetApp/releases) et installe-le.

L'application se met à jour automatiquement.

---

## Utilisation sans synchro bancaire

Aucune configuration requise. Dès l'installation tu peux :

- Saisir des opérations manuellement
- Importer un relevé CSV (export depuis ton espace bancaire)
- Créer des catégories et glisser-déposer pour catégoriser
- Définir un budget mensuel par catégorie
- Configurer des paiements récurrents (loyer, abonnements...)

---

## Activer la synchronisation bancaire automatique

La synchro bancaire passe par **Enable Banking**, une API PSD2 agréée qui se connecte à ta banque via son site officiel — tes identifiants ne transitent jamais par l'app.

### Étape 1 — Créer un compte Enable Banking

1. Va sur [enablebanking.com](https://enablebanking.com) et crée un compte gratuit
2. Dans le dashboard, crée une nouvelle **application**
3. Note ton **Application ID** (format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### Étape 2 — Générer une clé RSA

Dans un terminal :

```bash
openssl genrsa -out ma-cle-privee.pem 2048
openssl rsa -in ma-cle-privee.pem -pubout -out ma-cle-publique.pem
```

### Étape 3 — Enregistrer la clé publique

Dans le dashboard Enable Banking → ton application → **Public keys** → colle le contenu de `ma-cle-publique.pem`.

### Étape 4 — Configurer l'app

Dans l'app → **Banque** → **Configurer** → colle ton Application ID + le contenu de `ma-cle-privee.pem` (ou charge le fichier directement). C'est tout, pas besoin d'éditer de fichier `.env`.

La config est stockée localement dans le dossier de données de l'app (jamais envoyée à l'extérieur).

### Étape 5 — Connecter ta banque

Dans l'app → **Banque** → **Connecter une banque** → choisis ta banque → authentifie-toi sur le site officiel → c'est fait.

L'accès est valable **90 jours**, après quoi tu devras reconnecter.

---

## Banques supportées

Toutes les banques françaises compatibles PSD2 : Société Générale, BNP Paribas, Crédit Agricole, LCL, Boursorama, Crédit Mutuel, Caisse d'Épargne, Banque Populaire, La Banque Postale, Hello Bank, Fortuneo, ING, N26, Revolut...

---

## Fonctionnalités

- Dashboard avec revenus / dépenses / solde projeté
- Paiements récurrents avec détection automatique et catégorisation
- Drag & drop pour catégoriser les opérations
- Import CSV (export depuis l'espace bancaire)
- Budget mensuel par catégorie avec barre de progression
- Synchronisation bancaire automatique au démarrage
- Mise à jour automatique de l'application

---

## Développement / build d'une release

```bash
npm install
npm run install:all
npm run dev               # mode développement
npm run build:electron    # build release (dist-electron/)
```

Pas de prérequis particulier sur la version de Node — la base SQLite est en WebAssembly, donc aucune compilation native n'est nécessaire.

## Publier une nouvelle release

Tout est automatisé via GitHub Actions ([release.yml](.github/workflows/release.yml)).

```bash
git add .
git commit -m "ce que tu changes"
git push

# Bump de la version + tag + push automatiques :
npm run release:patch    # 1.1.3 → 1.1.4 (corrections)
npm run release:minor    # 1.1.3 → 1.2.0 (nouvelles fonctionnalités)
npm run release:major    # 1.1.3 → 2.0.0 (breaking changes)
```

Le push du tag déclenche automatiquement le workflow GitHub Actions qui :
1. Build le frontend avec Vite
2. Package l'app Electron pour Windows
3. Crée une release GitHub avec le `.exe` et le `latest.yml` (utilisé par l'auto-updater)

Les utilisateurs déjà installés verront la **pop-up de mise à jour** apparaître au prochain démarrage de l'app, qui télécharge et installe la nouvelle version automatiquement.

**Prérequis côté GitHub** : dans les paramètres du repo → **Settings** → **Actions** → **General** → **Workflow permissions**, vérifier que **"Read and write permissions"** est coché (sinon le workflow ne pourra pas créer la release).
