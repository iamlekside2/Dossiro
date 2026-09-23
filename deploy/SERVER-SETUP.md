# Dossiro on the development server

The Windows box at `158.69.198.49`, the same one RealCousins develops on. Everything
below is done **once, by hand**. After that, a push to `main` deploys.

The shape mirrors what already works on that machine rather than introducing a
second way of doing things: IIS serves the static files and reverse-proxies the
API, PM2 keeps the Node process alive, PostgreSQL runs natively.

Production is going to AWS later. Nothing here blocks that — the API is
configured entirely through environment variables and the release is a plain
directory, so the move is a Dockerfile and a different pipeline, not a rewrite.
The one thing that will have to change first is storage; see the last section.

---

## 1. Directories

```
D:\sites\dossiro\
  app\          the Node application and its node_modules (swapped whole)
    api\        the API itself; .env lives here
  web\          the workbench, static (mirrored on every deploy)
  site\         the marketing site, static (mirrored on every deploy)
  storage\      uploaded documents  <-- NEVER touched by a deploy
  logs\
  incoming\     upload and unpack area
```

```cmd
mkdir D:\sites\dossiro\storage D:\sites\dossiro\logs D:\sites\dossiro\incoming
```

`storage` sits outside the deployed directories on purpose. The deploy renames
`api` and mirrors `web`, and a documents folder inside either of those would be
destroyed by a routine deploy.

## 2. Database

PostgreSQL 16 is already installed for RealCousins. Dossiro gets its own
database and its own role — sharing the `postgres` superuser across two
applications means either can read the other's records.

```sql
CREATE ROLE dossiro WITH LOGIN PASSWORD 'choose-a-real-one';
CREATE DATABASE dossiro OWNER dossiro;
```

**While you are in there:** port 5432 on this machine answers from the public
internet. Postgres should not. Restrict it in Windows Firewall to localhost and
whatever else genuinely needs it.

## 3. The API environment

Write `D:\sites\dossiro\api\.env` by hand. The deploy copies this file into each
new release and never writes it, so a pipeline cannot leak or overwrite a
secret, and secrets stay out of the repository.

```ini
NODE_ENV=production
PORT=4010
DATABASE_URL=postgresql://dossiro:the-password@127.0.0.1:5432/dossiro

# Both must be at least 16 characters. Generate, do not invent:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=
TICKET_SECRET=

API_BASE_URL=http://158.69.198.49
WEB_BASE_URL=http://158.69.198.49
CORS_ORIGINS=http://158.69.198.49

STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=D:\sites\dossiro\storage
MAX_UPLOAD_BYTES=104857600

DEPLOYMENT_MODE=self_hosted
```

Update the three URLs when the site gets a hostname. `MAX_UPLOAD_BYTES` and the
IIS `maxAllowedContentLength` in `web/public/web.config` are the same number in
two places — change them together, or uploads fail at a size the application
says it permits.

## 4. Node and PM2

Node 20 and PM2 are already on the box for RealCousins.

`argon2` is a native module. It ships prebuilt binaries for Windows x64, so a
normal install just works — but if `npm ci` ever fails trying to compile it, the
box needs the Visual Studio build tools, and that is what the error will be.

PM2 must be resurrecting on boot, or a server restart leaves Dossiro down:

```cmd
pm2 startup
pm2 save
```

## 5. IIS

Two sites. RealCousins already holds ports 80 and 443, so give Dossiro its own
bindings and move to host headers when there is DNS.

| Site              | Physical path            | Binding |
| ----------------- | ------------------------ | ------- |
| `dossiro-web`     | `D:\sites\dossiro\web`   | 8080    |
| `dossiro-site`    | `D:\sites\dossiro\site`  | 8081    |

Both need **Application Request Routing** and the **URL Rewrite** module, which
are installed already for RealCousins. ARR's proxy has to be enabled at server
level once (IIS Manager → server node → Application Request Routing Cache →
Server Proxy Settings → Enable proxy).

The `web.config` for each site ships with its build — it is in `public/`, which
both bundlers copy into the output — so the rewrite rules arrive with the
deploy rather than being configured in IIS Manager and forgotten.

Set the app pool for both to **No Managed Code**; neither serves .NET.

## 6. SSH access for the pipeline

The pipeline signs in over SSH as an existing Windows user. On your machine:

```bash
ssh-keygen -t ed25519 -C "dossiro-deploy" -f dossiro-deploy
```

Append the **public** key to `C:\Users\<user>\.ssh\authorized_keys` on the
server, then add these in GitHub → Settings → Secrets and variables → Actions:

| Secret          | Value                                    |
| --------------- | ---------------------------------------- |
| `DEV_SSH_HOST`  | `158.69.198.49`                          |
| `DEV_SSH_USER`  | the Windows user                         |
| `DEV_SSH_KEY`   | the **private** key, whole file          |
| `DEV_SSH_PORT`  | only if SSH is not on 22                 |

Never paste a private key into a chat, a commit, or a file in this repository.

## 7. First deploy

```bash
git push origin main
```

Or run **Deploy to development** manually from the Actions tab. The run ends by
asking the API for its health endpoint and fails if it does not answer, so a
green run means the process is actually up.

Then seed the first organisation. The seed is a development fixture — it creates
the Acme corpus with known passwords — so use it to prove the deployment and
replace it before anyone real signs in:

```cmd
cd /d D:\sites\dossiro\api && npm run db:seed
```

---

## What a deploy does, and what it will not touch

Uploads the build, installs production dependencies, runs pending migrations,
renames the live `app` to `previous-app` and moves the new one in, mirrors the
two static directories, reloads PM2.

It never touches `storage`, never writes `.env`, and never drops anything. The
previous API release stays on disk as `previous-app`, so a rollback is a rename
and a `pm2 reload`.

**Migrations run before the swap.** A migration that fails stops the deploy with
the old code still serving, which is the right way round for anything additive.
It is the wrong way round for a migration that removes something the old code
still reads — those need to be split across two deploys, one that adds and one
that removes, as usual.

## Before this becomes production

Three things are deliberately deferred and all three matter more on AWS than
here.

**Storage is local disk.** `STORAGE_DRIVER=s3` throws today — the driver is not
implemented. That is fine on one Windows box with a real disk, and it is the
thing that stops the API being moved to ECS, where a task has no durable
filesystem. Implementing it is roughly half a day: `putStream` and `getStream`
in `api/src/modules/storage/storage.service.ts`.

**There is no TLS here.** Sign-in posts a password. Put a certificate on it
before it holds anything real, even in development.

**Nothing is backed up.** Postgres holds the records and `storage` holds the
documents, and losing either loses the other's meaning. A scheduled `pg_dump`
plus a copy of `storage` is the minimum.
