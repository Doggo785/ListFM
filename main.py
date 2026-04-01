import os
from dotenv import load_dotenv
import pylast
import csv

load_dotenv()

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
LASTFM_API_SECRET = os.getenv("LASTFM_API_SECRET")

try:
    network = pylast.LastFMNetwork(api_key=LASTFM_API_KEY, api_secret=LASTFM_API_SECRET)
    print("Connexion à l'API Last.fm réussie !")
except Exception as e:
    print(f"Erreur lors de la connexion à l'API Last.fm : {e}")

def get_test_data():
    try:
        user = network.get_user("AssaWolf")
        recent_tracks = user.get_recent_tracks(limit=300)
        with open('test_data.csv', mode='w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            writer.writerow(['Artist', 'Track', 'Album'])
            for track in recent_tracks:
                artist = track.track.artist.name
                track_name = track.track.title
                album = track.album
                writer.writerow([artist, track_name, album])
    except Exception as e:
        print(f"Erreur lors de la récupération des données : {e}")
        return []

def deduplicate(raw_tracks: list[dict]) -> list[dict]:
    seen = set()
    unique_tracks = []
    for track in raw_tracks:
        artist = track.get('artist', {}).get('#text', 'Unknown Artist')
        title = track.get('name', 'Unknown Track')
        identifier_key = f"{artist.strip().lower()}-{title.strip().lower()}"
        if identifier_key not in seen:
            seen.add(identifier_key)
            unique_tracks.append(track)
    return unique_tracks

if __name__ == "__main__":
    get_test_data()