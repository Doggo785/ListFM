<div align="center">

![ListFM Banner](.github/assets/ListFM_readme_banner.webp)

Powered by Last.fm -- built with React & FastAPI.

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)

</div>

---

## ✨ Features

<div align="center">

| | Feature |
|---|---|
| 🎧 | **Last.fm Integration** — Import your listening history, top tracks, loved tracks, and genre tags |
| 📊 | **Smart Dashboard** — Visualize your stats: tracks played, unique artists, albums, and top artist |
| 🔄 | **Automated Playlists** — Create playlists from top tracks, recent plays, loved tracks, or top artists |
| 🔐 | **Authentication** — JWT-based auth with httpOnly cookies, refresh token rotation, and protected routes |
| 🎨 | **Beautiful UI** — Animated gradients, tilted cards, smooth page transitions, and WebGL effects |
| ⏱️ | **Flexible Periods** — Filter by 7 days, 1 month, 3 months, 6 months, 12 months, or overall |

</div>

---

## 🛠️ Tech Stack

<div align="center">

### Backend

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?style=for-the-badge&logo=fastapi)
![Pydantic](https://img.shields.io/badge/Pydantic-v2-E92063?style=for-the-badge&logo=pydantic)

### Frontend

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss)
![Radix UI](https://img.shields.io/badge/Radix_UI-1.4-161618?style=for-the-badge)

</div>

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- Python 3.11+
- A [Last.fm API account](https://www.last.fm/api/account/create) (free)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/ListFM.git
cd ListFM

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your Last.fm API credentials

# 3. Set up backend
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# 4. Set up frontend
cd frontend
npm install
```

### Development

Open **two terminals** from the project root:

```bash
# Terminal 1 — Backend
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000
```

```bash
# Terminal 2 — Frontend
cd frontend
npm run dev
```

<div align="center">

**Backend** → `http://localhost:8000` | **Frontend** → `http://localhost:5173`

</div>

---

## 📡 API Reference

### Public

| Method | Endpoint | Description |
|:---:|---|---|
| `GET` | `/api/health` | Health check |

### Protected (requires auth + linked Last.fm account)

| Method | Endpoint | Description |
|:---:|---|---|
| `GET` | `/api/info` | User info (avatar, profile) |
| `GET` | `/api/recent-tracks` | Recently played tracks |
| `GET` | `/api/top-tags` | Top genre tags |
| `GET` | `/api/top-tracks` | Top tracks by period |
| `GET` | `/api/loved-tracks` | Loved / favorited tracks |
| `GET` | `/api/source-tracks` | Flexible source endpoint |
| `POST` | `/api/automations/preview` | Preview automation results |

### Authentication

| Method | Endpoint | Description |
|:---:|---|---|
| `POST` | `/api/auth/register` | Create a new account |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | Get current user info |
| `GET` | `/api/auth/google/login` | Login with Google OAuth |
| `GET` | `/api/auth/google/callback` | Google OAuth callback |
| `GET` | `/api/auth/discord/login` | Login with Discord OAuth |
| `GET` | `/api/auth/discord/callback` | Discord OAuth callback |
| `POST` | `/api/auth/link-lastfm` | Link Last.fm account after OAuth |
| `POST` | `/api/auth/oauth/complete-email` | Set email for Discord users without one |

### Protected (requires auth)

| Method | Endpoint | Description |
|:---:|---|---|
| `GET` | `/api/automations` | List automations |
| `POST` | `/api/automations` | Create automation |
| `PATCH` | `/api/automations/{id}` | Update automation |
| `DELETE` | `/api/automations/{id}` | Delete automation |
| `GET` | `/api/generated-playlists` | List generated playlists |
| `POST` | `/api/generated-playlists` | Save generated playlist |
| `DELETE` | `/api/generated-playlists/{id}` | Delete generated playlist |

> The user is resolved from the authenticated JWT, so there is no `{username}` path prefix. Endpoints that consume Last.fm data require a linked Last.fm account (see `POST /api/auth/link-lastfm`).

---

## 📁 Project Structure

```
ListFM/
├── backend/
│   ├── main.py              # FastAPI app entry
│   ├── config.py            # Settings and API keys
│   ├── schemas.py           # Pydantic models
│   ├── routers/
│   │   ├── auth.py          # Authentication endpoints
│   │   ├── users.py         # User endpoints
│   │   ├── automations.py   # Automation endpoints
│   │   └── generated_playlists.py
│   ├── services/
│   │   ├── auth.py          # JWT and password hashing
│   │   ├── lastfm.py        # Last.fm API wrapper
│   │   └── rate_limit.py    # Rate limiting
│   └── tests/               # Backend test suite
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Routes and layout
│   │   ├── views/           # Search, Dashboard, Auth pages
│   │   ├── components/      # UI components
│   │   ├── contexts/        # React contexts (Auth)
│   │   └── lib/             # Utilities
│   └── package.json
│
├── .env.example             # Environment variable template
└── README.md
```

---

## 🔐 Environment Variables

| Variable | Description | Required |
|---|---|:---:|
| `LASTFM_API_KEY` | Last.fm API key | ✅ |
| `LASTFM_API_SECRET` | Last.fm API secret | ✅ |
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `JWT_SECRET` | Secret key for JWT signing (min 32 chars) | ✅ |
| `COOKIE_SECURE` | Set to `true` for HTTPS deployments | |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID (for "Sign in with Google") | |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret | |
| `DISCORD_OAUTH_CLIENT_ID` | Discord OAuth client ID (for "Sign in with Discord") | |
| `DISCORD_OAUTH_CLIENT_SECRET` | Discord OAuth client secret | |
| `OAUTH_REDIRECT_BASE` | Base URL the OAuth callback redirects back to (e.g. `http://localhost:8000`) | |
| `FRONTEND_URL` | Frontend origin used for post-login redirects (e.g. `http://localhost:5173`) | |

Get your Last.fm keys at **[last.fm/api/account/create](https://www.last.fm/api/account/create)**. Google and Discord OAuth are optional — the login buttons only appear when the matching client ID/secret are configured.

---

## 📄 License

This project is licensed under the **MIT License**.

---

<div align="center">

**Built with ❤️ by [Doggo](https://github.com/doggo) - React, FastAPI & Last.fm**

</div>
