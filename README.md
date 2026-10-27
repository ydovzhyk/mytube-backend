# MyTube — Backend

REST API for [MyTube](https://mytube-two-phi.vercel.app) — a YouTube-like video platform. Handles auth, channels, videos, playlists, comments, and media storage.

**Production API:** [https://mytube-server-c4a65cdf5921.herokuapp.com](https://mytube-server-c4a65cdf5921.herokuapp.com)  
**Frontend:** [https://mytube-two-phi.vercel.app](https://mytube-two-phi.vercel.app)

---

## Features

- JWT auth (access + refresh cookies) and Google OAuth
- Channels, videos, playlists, comments, subscriptions
- Video upload with ffmpeg/ffprobe (duration + transcode helpers)
- Firebase Admin Storage for media files
- OpenAI-assisted playlist cover generation
- Visitor tracking for anonymous interactions
- CORS for local Next.js and production Vercel

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js, Express 5 |
| Database | MongoDB (Mongoose) |
| Auth | JWT, Passport Google OAuth2, bcrypt, express-session |
| Storage | Firebase Admin SDK |
| AI | OpenAI |
| Media | ffmpeg / ffprobe |
| Deploy | Heroku Container Registry (Docker) + GitHub Actions |

---

## Project Structure

| Path | Role |
|------|------|
| `server.js` | Mongo connect + HTTP listen |
| `app.js` | Express app, CORS, routes, Google session |
| `routes/api/` | REST routers |
| `controllers/` | Route handlers |
| `middlewares/` | Auth, Google strategy, validation |
| `models/` | Mongoose schemas |
| `config/firebaseConfig.js` | Firebase Admin + Storage bucket |
| `helpers/` | Transcode, duration, OpenAI cover, etc. |
| `.github/workflows/main.yml` | Heroku container deploy |

---

## Prerequisites

- Node.js 20+
- MongoDB Atlas (or local MongoDB)
- ffmpeg installed locally (for video processing)
- Firebase project with Storage + service account
- Google Cloud OAuth Web client
- OpenAI API key (playlist covers)

---

## Environment Variables

Create a `.env` in the project root (never commit it):

| Variable | Description |
|----------|-------------|
| `DB_HOST` | MongoDB connection string |
| `PORT` | Server port (local default `4000`) |
| `SECRET_KEY` | JWT access token secret |
| `REFRESH_SECRET_KEY` | JWT refresh token secret |
| `SESSION_SECRET` | express-session secret (Google OAuth) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `BASE_URL` | Local API URL (`http://localhost:4000`) |
| `BASE_URL_HEROKU` | Production API URL (Heroku, no trailing slash) |
| `FRONTEND_URL` | Local frontend origin (`http://localhost:3000`) |
| `FRONTEND_URL_PROD` | Production frontend (`https://mytube-two-phi.vercel.app`) |
| `OPENAI_API_KEY` | OpenAI API key |
| `PRIVATE_KEY_ID` | Firebase service account key id |
| `PRIVATE_KEY` | Firebase private key (single line with `\n`) |
| `FFMPEG_PATH` | Optional local path to ffmpeg (Windows) |
| `FFPROBE_PATH` | Optional local path to ffprobe |

`HEROKU_API_KEY` belongs in **GitHub Secrets** / Heroku CLI login only — not required in runtime `.env` on the dyno.

### Local vs production URLs

| Mode | Frontend CORS / redirects | Google callback base |
|------|---------------------------|----------------------|
| Development (`npm run start:dev`) | `FRONTEND_URL` | `BASE_URL` |
| Production (`npm start`) | `FRONTEND_URL_PROD` (+ localhost still allowed) | `BASE_URL_HEROKU` |

---

## Getting Started

```bash
git clone <repo-url>
cd mytube-backend
npm install
# create .env (see table above)
npm run start:dev
```

API: `http://localhost:4000`

Health check:

```http
GET /api/health
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Development with nodemon (`NODE_ENV=development`) |
| `npm start` | Production mode (`NODE_ENV=production`) |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with auto-fix |

---

## REST API

| Prefix | Description |
|--------|-------------|
| `/api/auth` | Register, login, logout, refresh, current user, profile |
| `/api/google` | Google OAuth start + callback |
| `/api/videos` | Upload, list, search, watch, reactions, views |
| `/api/channels` | Create/update channels, subscribe, handle check |
| `/api/playlists` | Channel playlists |
| `/api/my-playlists` | User playlists |
| `/api/comments` | Comments + reactions |
| `/api/visitor` | Anonymous visitor id |
| `/api/health` | Health check |

Auth uses **httpOnly cookies** (`accessToken`, `refreshToken`) with `credentials: true` on the client.

---

## Google OAuth setup

In Google Cloud Console → **APIs & Services / Google Auth Platform** → OAuth Web client:

**Authorized JavaScript origins**

```text
http://localhost:3000
https://mytube-two-phi.vercel.app
```

**Authorized redirect URIs**

```text
http://localhost:4000/api/google/callback
https://mytube-server-c4a65cdf5921.herokuapp.com/api/google/callback
```

For **Testing** audience, add your Google account under **Test users**.

---

## Deployment (Heroku)

App name: **`mytube-server`**

Push to `main` runs `.github/workflows/main.yml`:

1. Build env from GitHub Secrets
2. `heroku config:set` (runtime Config Vars)
3. `heroku container:push web` / `container:release web`
4. Scale `web=1`

Docker image includes **ffmpeg** (`Dockerfile`).

### Required GitHub Secrets

`HEROKU_API_KEY`, `DB_HOST`, `PORT`, `SECRET_KEY`, `REFRESH_SECRET_KEY`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BASE_URL`, `BASE_URL_HEROKU`, `FRONTEND_URL`, `FRONTEND_URL_PROD`, `OPENAI_API_KEY`, `PRIVATE_KEY_ID`, `PRIVATE_KEY`

> Empty GitHub Secrets overwrite Heroku Config Vars on deploy. Keep every secret filled.

Useful checks:

```bash
heroku logs --tail -a mytube-server
heroku config -a mytube-server
curl https://mytube-server-c4a65cdf5921.herokuapp.com/api/health
```

---

## Related Repository

Frontend: **[mytube](https://github.com/ydovzhyk/mytube)**

---

## License

Private / educational project.
