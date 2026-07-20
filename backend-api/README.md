# backend-api

API REST Node.js/Express qui sert de backend à l'application Flutter de gestion de stock (produits, mouvements de stock, utilisateurs). Remplace l'ancienne logique 100% locale (SQLite embarqué dans l'app) par une API centralisée, stateless côté processus, avec une base **PostgreSQL partagée** entre les instances déployées sur K3s (on-prem) et AKS (Azure), dans le cadre d'une démo d'architecture "hybrid cloud bursting".

## Stack

- Node.js + Express
- PostgreSQL via `pg` (base partagée K3s/AKS — plus de SQLite local, plus de volume à synchroniser)
- Authentification JWT (`jsonwebtoken`) + hash de mot de passe `bcrypt`
- Configuration via variables d'environnement (`dotenv`)
- Logs de requêtes via `morgan`
- CORS activé

## Installation

```bash
cd backend-api
npm install
```

## Configuration

Copier le fichier d'exemple et adapter les valeurs :

```bash
cp .env.example .env
```

Variables disponibles :

| Variable         | Description                                          | Exemple                                          |
|------------------|-------------------------------------------------------|---------------------------------------------------|
| `PORT`           | Port d'écoute HTTP                                     | `3000`                                             |
| `JWT_SECRET`     | Secret de signature des JWT                            | `change_this_secret_in_production`                 |
| `JWT_EXPIRES_IN` | Durée de validité des JWT                               | `1d`                                               |
| `DB_HOST`        | Hôte du serveur PostgreSQL                              | `pg-bursting-demo.postgres.database.azure.com`     |
| `DB_PORT`        | Port PostgreSQL                                         | `5432`                                             |
| `DB_USER`        | Utilisateur PostgreSQL                                  | `pgadmin`                                          |
| `DB_PASSWORD`    | Mot de passe PostgreSQL                                 | —                                                  |
| `DB_NAME`        | Nom de la base                                          | `stockdb`                                          |

La connexion se fait en TLS (`ssl: { rejectUnauthorized: false }`, cf. `src/config/db.js`), compatible Azure Database for PostgreSQL Flexible Server.

## Lancement

```bash
# développement (auto-reload avec nodemon)
npm run dev

# production
npm start
```

Au démarrage, le serveur crée automatiquement les tables PostgreSQL si elles n'existent pas encore (`init()` dans `src/config/db.js`), puis se met à écouter.

## Healthcheck

```
GET /health
```

Réponse :

```json
{ "status": "ok" }
```

Utilisé comme liveness/readiness probe Kubernetes (voir `k8s/deployment.yaml` / `k8s/deployment-aks.yaml`).

## Rôles & permissions

Quatre rôles, alignés avec `lib/models/user_role.dart` côté Flutter (`src/config/db.js` → `ROLES`, `src/config/permissions.js`) :

- `Admin` — accès complet
- `Point chaud` — Boulangerie / Pâtisserie / Viennoiserie
- `Boucherie` — Boucherie / Charcuterie
- `Épicerie` — Épicerie / Boissons / Alcool

`src/config/permissions.js` définit, par rôle, les catégories de produits et les taux de TVA autorisés (utilisé par `GET /api/products/visible-to-me`).

## Authentification

- Au premier démarrage (aucun utilisateur en base), `POST /api/auth/bootstrap` crée un compte `admin` avec un mot de passe temporaire généré aléatoirement et le renvoie une seule fois dans la réponse (appelé automatiquement par le frontend Flutter au lancement).
- `POST /api/auth/login` renvoie un JWT + les infos utilisateur.
- Toutes les routes protégées attendent l'en-tête :

```
Authorization: Bearer <token>
```

- Les routes `/api/users/*` et `DELETE /api/admin/reset-all` sont en plus réservées au rôle `Admin` (middleware `adminOnly`).

## Routes

### Auth — `/api/auth`

| Méthode | Route              | Accès       | Description |
|---------|---------------------|-------------|--------------|
| POST    | `/bootstrap`         | public      | Crée le compte `admin` par défaut si aucun utilisateur n'existe |
| POST    | `/login`              | public      | Authentifie, renvoie `{ token, user }` |
| GET     | `/me`                 | authentifié | Infos de l'utilisateur courant |
| POST    | `/change-password`    | authentifié | Change le mot de passe (vérifie l'ancien) |
| POST    | `/set-password`       | authentifié | Change le mot de passe sans vérifier l'ancien (flow mot de passe temporaire) |
| GET     | `/roles`              | public      | Liste des rôles valides |

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "..."}'
```

Réponse :

```json
{
  "token": "eyJhbGciOi...",
  "user": { "id": 1, "username": "admin", "role": "Admin", "isTempPassword": 0 }
}
```

### Users — `/api/users` (réservé au rôle `Admin`)

| Méthode | Route          | Description |
|---------|-----------------|--------------|
| GET     | `/`              | Liste tous les comptes |
| POST    | `/`              | Crée un compte (`username`, `password`, `role`) |
| PATCH   | `/:id/role`      | Change le rôle d'un utilisateur |
| DELETE  | `/:id`           | Supprime un utilisateur |

### Products — `/api/products` (authentifié)

| Méthode | Route                    | Description |
|---------|---------------------------|--------------|
| GET     | `/`                        | Tous les produits, sans filtre de rôle |
| GET     | `/visible-to-me`           | Produits filtrés selon les catégories autorisées pour le rôle courant |
| GET     | `/recent?limit=`           | Derniers produits créés |
| GET     | `/reference/:reference`    | Recherche par référence (scan code-barres) |
| GET     | `/:id`                     | Détail d'un produit |
| POST    | `/`                        | Crée un produit (`name`, `reference` requis) |
| PUT     | `/:id`                     | Met à jour un produit |
| DELETE  | `/:id`                     | Supprime un produit |

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Baguette", "reference": "3760020507370", "category": "Boulangerie", "carton_count": 10, "items_per_carton": 20}'
```

### Movements — `/api/movements` (authentifié)

| Méthode | Route                          | Description |
|---------|----------------------------------|--------------|
| GET     | `/product/:product_id?limit=`     | Historique des mouvements d'un produit |
| GET     | `/recent?types=&limit=`           | Derniers mouvements (avec le produit associé), filtrables par type |
| GET     | `/sales-by-month?start=&end=`     | Ventes agrégées par mois sur une plage (timestamps ms) |
| GET     | `/kpis?start=&end=`               | KPIs agrégés (ventes, pertes, sorties, revenu) sur une plage |
| POST    | `/`                                | Crée un mouvement (`sale`, `loss`, `stock_in`, `stock_out`) |
| DELETE  | `/:id`                            | Supprime un mouvement |

`POST /api/movements` applique les règles métier côté serveur (dans une transaction avec verrou `SELECT ... FOR UPDATE` sur le produit, nécessaire depuis que plusieurs instances — K3s + AKS — peuvent écrire en même temps sur la base partagée) :
- une `stock_out` ne peut pas dépasser `carton_count * items_per_carton` ;
- `sale`/`loss` sont bornées par `stock_out` (ventes + pertes ≤ stock sorti) ;
- le mouvement met à jour automatiquement `stock_out`, `quantity_sold`, `losses`, `revenue` et `margin` du produit.

```bash
curl -X POST http://localhost:3000/api/movements \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"product_id": 1, "type": "sale", "quantity": 2, "unit_price": 1.2}'
```

### Admin — `/api/admin` (réservé au rôle `Admin`)

| Méthode | Route          | Description |
|---------|-----------------|--------------|
| DELETE  | `/reset-all`     | Vide entièrement la base (produits, mouvements, utilisateurs) |

## Codes d'erreur

| Code | Signification                                  |
|------|--------------------------------------------------|
| 400  | Requête invalide (champs manquants/incorrects, règle métier violée) |
| 401  | Non authentifié / identifiants ou token invalides |
| 403  | Authentifié mais rôle insuffisant (`adminOnly`)   |
| 404  | Ressource introuvable                            |
| 500  | Erreur interne du serveur                        |

## Structure du projet

```
backend-api/
├── src/
│   ├── server.js              # point d'entrée, montage des routes
│   ├── config/
│   │   ├── db.js              # pool PostgreSQL + init schéma + ROLES
│   │   └── permissions.js     # catégories/TVA autorisées par rôle
│   ├── middleware/
│   │   └── auth.js            # vérification JWT + middleware adminOnly
│   ├── models/
│   │   ├── User.js
│   │   ├── Product.js
│   │   └── Movement.js
│   └── routes/
│       ├── auth.js
│       ├── users.js
│       ├── products.js
│       ├── movements.js
│       └── admin.js
├── .env.example
├── Dockerfile
├── package.json
└── README.md
```

## Déploiement (Docker / Kubernetes)

Contexte : démo d'architecture **hybrid cloud bursting** — le backend tourne en permanence sur un cluster **K3s on-prem**, et peut être "burst" (dupliqué) sur un cluster **AKS** (Azure) en cloud.

- `Dockerfile` : build multi-stage Node 20 alpine, `npm install --omit=dev`, démarre `node src/server.js` sur le port `3000`.
- Le processus est stateless : toute la configuration passe par variables d'environnement (`k8s/configmap.yaml` + `k8s/secret.yaml`). La base PostgreSQL est **externe et partagée** entre les deux clusters (Azure Database for PostgreSQL) — il n'y a donc plus de `PersistentVolumeClaim` à gérer côté backend.

Manifests dans `k8s/` :

| Fichier                  | Usage |
|----------------------------|--------|
| `configmap.yaml`            | Variables non sensibles (`PORT`, `JWT_EXPIRES_IN`, `DB_HOST`, `DB_PORT`, `DB_NAME`) |
| `secret.yaml`               | `JWT_SECRET`, `DB_USER`, `DB_PASSWORD` — **ne pas commit de vraies valeurs**, régénérer via `kubectl create secret generic backend-secret --from-literal=... --dry-run=client -o yaml` avant tout déploiement réellement exposé |
| `deployment.yaml`           | Déploiement K3s, image locale (`backend-api:local`, importée via `docker save \| k3s ctr images import -`) |
| `deployment-aks.yaml`       | Déploiement AKS, image tirée d'Azure Container Registry (`acrburstingdemo2026.azurecr.io/backend-api:v2`) |
| `service.yaml`              | Service K3s en `NodePort` (`:30080`) |
| `service-aks.yaml`          | Service AKS en `LoadBalancer` (IP publique assignée par Azure) |
| `hpa.yaml`                  | `HorizontalPodAutoscaler` (1 à 3 réplicas, cible 50% CPU) — applicable sur les deux clusters, la base partagée encaisse la charge |

```bash
# Build + import local (K3s)
docker build -t backend-api:local .
docker save backend-api:local | sudo k3s ctr images import -

# Build + push (AKS, via Azure Container Registry)
docker tag backend-api:local acrburstingdemo2026.azurecr.io/backend-api:v2
docker push acrburstingdemo2026.azurecr.io/backend-api:v2

kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/deployment.yaml        # ou deployment-aks.yaml selon le cluster
kubectl apply -f k8s/service.yaml           # ou service-aks.yaml selon le cluster
```
