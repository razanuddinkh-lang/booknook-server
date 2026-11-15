# BookNook Express API (JavaScript)

This is the BookNook backend rewritten in **plain JavaScript**. It uses Express 5, MongoDB Node.js Driver, JWT authentication, CORS, Helmet, and rate limiting. It does not require TypeScript, `ts-node`, `tsx`, or a `tsconfig.json` file.

## Requirements

- Node.js 20.9 or newer (Node.js 22 LTS or Node.js 24 is recommended)
- npm
- MongoDB Atlas or a local MongoDB server
- The same `JWT_SECRET` used by the Next.js client's `/api/token` route

## Install

In PowerShell or a VS Code terminal:

```powershell
cd booknook\server
npm install
Copy-Item .env.example .env
```

Open `server/.env` and set the real values:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=booknook
JWT_SECRET=THE_EXACT_SAME_SECRET_AS_CLIENT_ENV_LOCAL
```

`JWT_SECRET` must be identical in `server/.env` and `client/.env.local`. It must be at least 32 characters long. Do not use the Better Auth secret as the JWT secret unless you deliberately configure them to be identical; the recommended setup is to use separate secrets for Better Auth and API JWTs.

## Run

Development mode (automatically restarts when JavaScript files change):

```powershell
npm run dev
```

Production mode:

```powershell
npm start
```

Syntax-check all backend JavaScript files:

```powershell
npm run check
```

A successful start prints messages similar to:

```text
Connected to MongoDB database: booknook
BookNook Express API is running at http://localhost:5000
Allowed frontend origin(s): http://localhost:3000
```

Keep this terminal running. Open a second terminal to run the Next.js frontend:

```powershell
cd ..\client
npm install
npm run dev
```

Then open http://localhost:3000.

## Folder structure

```text
server/
├── src/
│   ├── config/
│   │   └── db.js
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── book.routes.js
│   │   └── borrow.routes.js
│   ├── utils/
│   │   └── validation.js
│   └── index.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## API endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/books` | Public | List books; supports `limit`, `category`, and `q` |
| GET | `/books?mine=true` | JWT | List books added by the signed-in user |
| GET | `/books/:id` | Public | Get one book |
| POST | `/books` | JWT | Add a book |
| PATCH | `/books/:id` | JWT + owner | Update a book |
| DELETE | `/books/:id` | JWT + owner | Delete only if no copies are borrowed |
| POST | `/borrows` | JWT | Borrow a book |
| GET | `/borrows` | JWT | List the signed-in user's active borrows |
| DELETE | `/borrows/:id` | JWT + borrower | Return a book |

The `?mine=true` option is a query variation of `GET /books`, not a separate route.

## Important implementation details

- The API only accepts JWTs signed with HS256, issuer `booknook-web`, and audience `booknook-api`, matching the Next.js token route.
- User email and display name come from the verified JWT. The API never trusts owner identity submitted in the book form.
- MongoDB indexes are created automatically on startup.
- A unique index on `{ bookId, userEmail }` prevents duplicate active borrows by the same user.
- Borrowing uses a conditional atomic `$inc: { availableCopies: -1 }`, so the final available copy cannot be borrowed twice.
- Returning removes the active borrow record for the authenticated borrower and increments `availableCopies` once.
- A book cannot be edited to have fewer copies than currently borrowed, and cannot be deleted while copies are out.
- `GET /books?limit=6` returns the six newest books for the homepage.

## Common errors

### `MONGODB_URI is missing`
Create `server/.env` from `.env.example`, then fill in `MONGODB_URI`. Restart the server after editing `.env`.

### `MongoServerSelectionError`
Check the Atlas username/password, URL-encode special characters in the password, and add your current IP to MongoDB Atlas Network Access. For local MongoDB, use a connection string such as `mongodb://127.0.0.1:27017`.

### `JWT_SECRET must be set`
Set a secret of at least 32 characters in `server/.env`. It must exactly match the `JWT_SECRET` in `client/.env.local`.

### `401 Authentication required`
Log in through the Next.js website. Confirm that the Next.js token route uses the same JWT secret and signs with issuer `booknook-web` and audience `booknook-api`.

### CORS error
Set `CLIENT_URL` to the exact frontend origin. For local development, use `http://localhost:3000`. Multiple origins can be comma-separated.

### `EADDRINUSE: address already in use :::5000`
Another process is already using port 5000. Stop that process or set a different `PORT` in `server/.env`, then update `NEXT_PUBLIC_API_URL` in `client/.env.local` to match.

### PowerShell says scripts are disabled
Use `npm.cmd run dev` instead of `npm run dev`, or adjust the PowerShell execution policy for your user. This is a Windows PowerShell policy issue, not an Express error.
