# 💰 Budget App

Application desktop de gestion de budget personnelle.
Stack : **React + Electron + Node.js + SQLite + Woob**

---

## 🚀 Installation

### Pré-requis
- Node.js ≥ 18
- Python 3 + pip (pour la liaison bancaire)

### 1. Dépendances

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install

# Root (Electron)
cd .. && npm install

# Woob (pour la synchro bancaire)
pip install woob
```

### 2. Lancer en développement

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev

# Terminal 3 — Electron
NODE_ENV=development npx electron .
```

Ou tout en une commande depuis la racine :
```bash
npm run dev
```

---

## 📦 Compiler l'application desktop

```bash
# Build le frontend puis package Electron
npm run dist
```

Le fichier `.dmg` / `.exe` / `.AppImage` se trouve dans `dist-electron/`.

---

## 🏦 Liaison bancaire (Woob)

Woob est un outil open-source français qui se connecte directement aux sites bancaires.
**Aucun compte tiers, aucune clé API, tout reste en local.**

Banques supportées : Crédit Agricole, BNP Paribas, Société Générale, LCL, Boursorama,
La Banque Postale, BRED, HSBC, Hello Bank, Fortuneo, ING, N26, Revolut, CIC,
Crédit Mutuel, Caisse d'Épargne, Banque Populaire, PayPal...

```bash
pip install woob
```

Dans l'app → onglet **Banque** → Connecter une banque → entrer identifiants → Synchroniser.

---

## 📁 Structure

```
budget-app/
├── electron/
│   ├── main.js          # Process principal Electron
│   └── preload.js       # Bridge sécurisé
├── frontend/            # React + Vite
│   └── src/pages/
│       ├── Dashboard.jsx       # Graphique donut interactif
│       ├── Transactions.jsx    # Drag & drop
│       ├── Budget.jsx          # Catégories + allocations
│       └── BankSync.jsx        # Connexion Woob
├── backend/             # Express + SQLite
│   ├── src/
│   │   ├── routes/      # transactions, categories, budget, bank
│   │   ├── services/
│   │   │   └── woob.js  # Appel Python → Woob
│   │   └── db/index.js  # Schéma SQLite
│   └── scripts/
│       └── woob_fetch.py  # Script Python Woob
└── package.json         # Config Electron + electron-builder
```

---

## ✨ Fonctionnalités

- [x] Dashboard · graphique donut (survol → détail des opérations)
- [x] Drag & drop pour catégoriser les opérations
- [x] Import CSV multi-format (toutes banques françaises)
- [x] Saisie manuelle d'opérations
- [x] Gestion libre des catégories (nom + icône)
- [x] Budget mensuel par catégorie + barre de progression
- [x] Connexion bancaire locale via Woob
- [x] Navigation par mois
- [x] Application desktop native (Electron) — macOS / Windows / Linux
