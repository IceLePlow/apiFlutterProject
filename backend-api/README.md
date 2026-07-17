# backend-api

API REST Node.js/Express + SQLite qui remplace la logique locale SQLite de l'application Flutter de gestion de stock/produits. Architecture stateless, prête à containeriser (Docker) et déployer sur Kubernetes.

## Stack

- Node.js + Express
- SQLite via `better-sqlite3`
- Authentification JWT (`jsonwebtoken` + `bcrypt`)
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

| Variable         | Description                                    | Exemple                  |
|------------------|-------------------------------------------------|---------------------------|
| `PORT`           | Port d'écoute HTTP                              | `3000`                    |
| `JWT_SECRET`     | Secret de signature des JWT                     | `change_this_secret`      |
| `JWT_EXPIRES_IN` | Durée de validité des JWT                       | `1d`                      |
| `DB_PATH`        | Chemin du fichier SQLite (créé si absent)       | `./data/stock.db`         |

## Lancement

```bash
# développement (auto-reload avec nodemon)
npm run dev

# production
npm start
```

Le serveur crée automatiquement le fichier SQLite et les tables au démarrage si elles n'existent pas.

## Healthcheck

```
GET /health
```

Réponse :

```json
{ "status": "ok" }
```

Utilisable comme liveness/readiness probe Kubernetes.

## Authentification

Toutes les routes `/api/products/*` et `/api/movements/*` sont protégées et nécessitent un header :

```
Authorization: Bearer <token>
```

Le token est obtenu via `/api/auth/login`.

## Routes

### Auth (publiques)

**POST /api/auth/register**

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "secret123", "role": "admin"}'
```

**POST /api/auth/login**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "secret123"}'
```

Réponse :

```json
{
  "token": "eyJhbGciOi...",
  "user": { "id": 1, "username": "alice", "role": "admin" }
}
```

### Products (protégées)

**GET /api/products**

```bash
curl http://localhost:3000/api/products \
  -H "Authorization: Bearer <token>"
```

**GET /api/products/:id**

```bash
curl http://localhost:3000/api/products/1 \
  -H "Authorization: Bearer <token>"
```

**POST /api/products**

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Lait demi-écrémé 1L", "barcode": "3760020507370", "quantity": 10}'
```

**PUT /api/products/:id**

```bash
curl -X PUT http://localhost:3000/api/products/1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 25}'
```

**DELETE /api/products/:id**

```bash
curl -X DELETE http://localhost:3000/api/products/1 \
  -H "Authorization: Bearer <token>"
```

### Movements (protégées)

**GET /api/movements**

```bash
curl http://localhost:3000/api/movements \
  -H "Authorization: Bearer <token>"
```

**POST /api/movements**

Crée un mouvement (`entry` ou `exit`) et met à jour automatiquement la quantité du produit concerné.

```bash
curl -X POST http://localhost:3000/api/movements \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"product_id": 1, "type": "entry", "quantity": 5}'
```

**GET /api/movements/product/:product_id**

```bash
curl http://localhost:3000/api/movements/product/1 \
  -H "Authorization: Bearer <token>"
```

## Codes d'erreur

| Code | Signification                                  |
|------|--------------------------------------------------|
| 400  | Requête invalide (champs manquants/incorrects)   |
| 401  | Non authentifié / token invalide ou expiré       |
| 404  | Ressource introuvable                            |
| 500  | Erreur interne du serveur                        |

## Structure du projet

```
backend-api/
├── src/
│   ├── server.js              # point d'entrée
│   ├── config/
│   │   └── db.js              # connexion + init SQLite
│   ├── middleware/
│   │   └── auth.js            # vérification JWT
│   ├── models/
│   │   ├── User.js
│   │   ├── Product.js
│   │   └── Movement.js
│   └── routes/
│       ├── auth.js
│       ├── products.js
│       └── movements.js
├── .env.example
├── package.json
└── README.md
```

## Déploiement (Docker / Kubernetes)

L'API est stateless côté processus (toute la configuration passe par variables d'environnement) ; seul le fichier SQLite (`DB_PATH`) doit être persisté via un volume monté (par exemple un `PersistentVolumeClaim` en Kubernetes) si l'on souhaite conserver les données entre redéploiements.
