import os
from dotenv import load_dotenv
import pylast

load_dotenv()

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
LASTFM_API_SECRET = os.getenv("LASTFM_API_SECRET")

try:
    lastfm_connection = pylast.LastFMNetwork(api_key=LASTFM_API_KEY, api_secret=LASTFM_API_SECRET)
    print("Connexion à l'API Last.fm réussie !")
except Exception as e:
    print(f"Erreur lors de la connexion à l'API Last.fm : {e}")