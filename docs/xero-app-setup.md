# Registering a Xero App (Client ID & Secret)

A quick guide to creating the Xero OAuth app this project needs. Takes ~5 minutes. The exact settings
here match the auth decisions in [`ARCHITECTURE.md`](../ARCHITECTURE.md) §4.

## Before you start

- You need a **Xero account** that belongs to an **organisation with Xero Projects enabled** (Projects
  requires an eligible Xero plan or a free trial). You also need to be set up as a **Projects user** in
  that org — otherwise the app can log in but can't post time (there'll be no `userId` to match).

## Steps

### 1. Open the Xero developer portal
Go to **https://developer.xero.com** → sign in → top-right menu → **My Apps** (or go straight to
`https://developer.xero.com/app/manage`).

### 2. Create a new app
Click **New app** and fill in:

| Field | Value |
|---|---|
| **App name** | Anything, e.g. `Fast Time Entry` |
| **Integration type** | **Web app** ← important: this is the confidential (client-secret) flow, not PKCE |
| **Company or application URL** | Any valid URL, e.g. `http://localhost:3000` |
| **Redirect URI** | `http://localhost:3000/api/xero/callback` |

> ⚠️ **Redirect URI must match exactly.** Xero allows `http://localhost` for development, but **not**
> `http://127.0.0.1`. No wildcards. It must be character-for-character the same as above (scheme, host,
> port `3000`, and path). If you run the app on a different port later, add that redirect URI too.

Tick the terms checkbox and click **Create app**.

### 3. Copy your Client ID
On the app's page, open **Configuration**. Copy the **Client ID**.

### 4. Generate a Client Secret
Still under **Configuration**, click **Generate a secret**. **Copy it immediately** — Xero shows the
secret **only once**. If you lose it, just generate a new one (and update `.env.local`).

### 5. Scopes
This app requests these scopes at login (the code sends them; you don't usually configure them on the
app page for a standard web app):

```
openid profile email projects offline_access
```

- `projects` → read **and** write Projects data (time entries).
- `offline_access` → returns the refresh token that keeps you signed in.
- `email` → needed to resolve *which* Projects user you are.

> 🗓️ **Granular-scopes note:** apps created after **2 March 2026** use Xero's new *granular scopes*. If
> your app page lists granular Projects scopes to select, choose the Projects read + write ones and
> confirm the exact token names on Xero's live **Scopes** / **Granular Scopes FAQ** pages. The five
> above are the classic names; the granular equivalents may differ slightly.

### 6. Put the credentials in `.env.local`
In the project root, create `.env.local` (it's git-ignored — never commit it) using `.env.example` as
a template:

```bash
XERO_CLIENT_ID=your-client-id-here
XERO_CLIENT_SECRET=your-client-secret-here
XERO_REDIRECT_URI=http://localhost:3000/api/xero/callback
SESSION_COOKIE_SECRET=any-long-random-string   # e.g. output of: openssl rand -hex 32
```

## When you first run the app

1. Start it: `npm run dev`, open `http://localhost:3000`.
2. Click **Connect Xero** → you'll be sent to Xero to authorise.
3. **Choose the organisation** that has Projects enabled and where you're a Projects user.
4. You'll land back on the app, logged in.

## Troubleshooting

- **"Invalid redirect_uri"** → the redirect URI in the portal doesn't exactly match
  `http://localhost:3000/api/xero/callback` (check for a trailing slash, `https`, or `127.0.0.1`).
- **Logged in but "not a Projects user" error** → your login isn't a Projects user in the chosen org.
  In Xero: set yourself up under **Projects → staff/users**, or pick a different org.
- **Secret not working** → you may have copied it with whitespace, or it was regenerated. Generate a
  fresh secret and update `.env.local`.

---

You only need the **Client ID** and **Client Secret** to unblock slice #02 (auth). The rest of the
build is being written and tested against a mocked Xero, so you can register the app whenever suits —
it's only required to run against the *real* Xero.
