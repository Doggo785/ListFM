from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings
from database import engine
from routers.users import router as users_router
from routers.automations import router as automations_router
from routers.auth import router as auth_router
from routers.auth_oauth import router as auth_oauth_router
from routers.generated_playlists import router as generated_playlists_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="ListFM", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(auth_oauth_router)
app.include_router(users_router)
app.include_router(automations_router)
app.include_router(generated_playlists_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
