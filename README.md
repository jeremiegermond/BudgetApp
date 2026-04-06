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

1. Copie le fichier `backend/.env.example` en `backend/.env`
2. Remplis ton Application ID :
   ```
   EB_APP_ID=ton-application-id-ici
   ```
3. Copie `ma-cle-privee.pem` dans `backend/config/` en le renommant avec ton Application ID :
   ```
   backend/config/ton-application-id-ici.pem
   ```
4. Redémarre l'application

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
