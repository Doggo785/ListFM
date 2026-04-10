from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import pylast
import csv

load_dotenv()

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
LASTFM_API_SECRET = os.getenv("LASTFM_API_SECRET")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    network = pylast.LastFMNetwork(api_key=LASTFM_API_KEY, api_secret=LASTFM_API_SECRET)
    print("Connexion à l'API Last.fm réussie !")
except Exception as e:
    print(f"Erreur lors de la connexion à l'API Last.fm : {e}")

@app.get("/api/recent-tracks/{username}")
def get_user_recent(username: str):
    try:
        user = network.get_user(username)
        recent_tracks = user.get_recent_tracks(limit=5)
        formatted_tracks = [
            {
                "title": track.track.title,
                "artist": track.track.artist.name if track.track.artist else "Unknown Artist"
            }
            for track in recent_tracks
        ]
        return {"tracks": formatted_tracks}
    except pylast.WSError as e:
        return {"error": f"Erreur lors de la récupération des données : {e}"}

def deduplicate(raw_tracks: list[dict]) -> list[dict]:
    seen = set()
    unique_tracks = []
    for item in raw_tracks:
        artist = item.track.artist.name if item.track.artist else 'Unknown Artist'
        title = item.track.title if item.track.title else 'Unknown Track'
        identifier_key = f"{artist.strip().lower()}|{title.strip().lower()}"
        if identifier_key not in seen:
            seen.add(identifier_key)
            unique_tracks.append(item)
    return unique_tracks