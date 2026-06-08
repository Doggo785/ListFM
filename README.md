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

| Method | Endpoint | Description |
|:---:|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/{username}/info` | User info (avatar, profile) |
| `GET` | `/api/{username}/recent-tracks` | Recently played tracks |
| `GET` | `/api/{username}/top-tags` | Top genre tags |
| `GET` | `/api/{username}/top-tracks` | Top tracks by period |
| `GET` | `/api/{username}/loved-tracks` | Loved / favorited tracks |
| `GET` | `/api/{username}/source-tracks` | Flexible source endpoint |
| `POST` | `/api/automations/preview` | Preview automation results |

---

## 📁 Project Structure

```
ListFM/
├── backend/
│   ├── main.py              # FastAPI app entry
│   ├── config.py            # Settings and API keys
│   ├── schemas.py           # Pydantic models
│   ├── routers/
│   │   ├── users.py         # User endpoints
│   │   └── automations.py   # Automation endpoints
│   └── services/
│       └── lastfm.py        # Last.fm API wrapper
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Routes and layout
│   │   ├── views/           # Search, Dashboard, Playlist pages
│   │   ├── components/      # UI components
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

Get your keys at **[last.fm/api/account/create](https://www.last.fm/api/account/create)**

---

## 📄 License

This project is licensed under the **MIT License**.

---

<div align="center">

**Built with ❤️ by [Doggo](https://github.com/doggo) - React, FastAPI & Last.fm**

</div>
