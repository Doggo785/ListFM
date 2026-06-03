from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings
from routers.users import router as users_router
from routers.automations import router as automations_router

settings = get_settings()

app = FastAPI(title="ListFM", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(automations_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
