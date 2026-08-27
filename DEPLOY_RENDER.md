# Deploying StockSense to Render

Render doesn't run `docker-compose.yml` directly — each service (backend,
ai-service, database) is created as its own resource on Render's dashboard.
`docker-compose.yml` in this repo is only for **local testing**.

## ⚠️ Important: MySQL

Render does **not** offer a managed MySQL database — only PostgreSQL.
You have two options:

- **Option A (fastest): use a free external MySQL host** — e.g. Aiven
  (free tier), Railway, or Clever Cloud. Create a MySQL instance there,
  and use its connection string as `SPRING_DATASOURCE_URL` below.
- **Option B: migrate to PostgreSQL** and use Render's own managed
  Postgres. This needs a driver swap in `pom.xml` (mysql-connector-j →
  postgresql) — more work, not covered here unless you want it.

This guide assumes **Option A**.

## Step 1 — Push this project to GitHub

Render deploys from a GitHub (or GitLab) repo, not from a zip upload.

```bash
cd stocksense-project
git init
git add .
git commit -m "Add Docker setup for Render"
git branch -M main
git remote add origin https://github.com/<your-username>/stocksense.git
git push -u origin main
```

## Step 2 — Create the AI microservice on Render

1. Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repo
3. **Root Directory:** `stocksense-ai-service`
4. **Runtime:** Docker (Render auto-detects the `Dockerfile`)
5. **Instance type:** at least 1 GB RAM (FinBERT needs it — the free 512MB
   tier will likely OOM)
6. Deploy. Once live, copy its internal URL, e.g.
   `https://stocksense-ai-service.onrender.com`

## Step 3 — Create the MySQL database (Aiven example)

1. Sign up at aiven.io, create a free MySQL service
2. Copy the connection details: host, port, database, username, password

## Step 4 — Create the backend on Render

1. Render Dashboard → **New** → **Web Service**
2. Same repo, **Root Directory:** `stocksense-backend`
3. **Runtime:** Docker
4. Add these **Environment Variables**:

   | Key | Value |
   |---|---|
   | `SPRING_DATASOURCE_URL` | `jdbc:mysql://<aiven-host>:<port>/<db>?useSSL=true&serverTimezone=UTC` |
   | `SPRING_DATASOURCE_USERNAME` | your Aiven username |
   | `SPRING_DATASOURCE_PASSWORD` | your Aiven password |
   | `JWT_SECRET` | a long random string (`openssl rand -base64 48`) |
   | `AI_SERVICE_BASE_URL` | the URL from Step 2 |

   Don't set `PORT` — Render sets it automatically and
   `application.properties` already reads `${PORT}`.

5. Deploy.

## Step 5 — Test

```bash
curl https://<your-backend>.onrender.com/api/stocks/sentiment/RELIANCE
```

## Notes

- Free-tier Render services **sleep after inactivity** — first request
  after sleep will be slow (cold start), especially the AI service loading
  FinBERT.
- The AI Dockerfile bakes the FinBERT model into the image at build time,
  so at least the model doesn't need to download from Hugging Face on
  every cold start — only the process needs to spin up.
- Never commit real secrets (`JWT_SECRET`, DB password) to GitHub — only
  set them as Render environment variables.
