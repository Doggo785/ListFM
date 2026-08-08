from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from config import get_settings
from database import engine
from routers.users import router as users_router
from routers.automations import router as automations_router
from routers.auth import router as auth_router
from routers.auth_oauth import router as auth_oauth_router
from routers.generated_playlists import router as generated_playlists_router
from services.automation_runner import run_due_automations

settings = get_settings()


def create_scheduler() -> AsyncIOScheduler | None:
    """Create the automation sweep scheduler, or None when disabled.

    ENABLE_SCHEDULER defaults to false so `--reload` dev stays single-job.
    """
    if not settings.enable_scheduler:
        return None
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_due_automations,
        trigger="interval",
        seconds=60,
        id="automation_sweep",
        max_instances=1,
        coalesce=True,
    )
    return scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = create_scheduler()
    if scheduler is not None:
        scheduler.start()
    yield
    if scheduler is not None:
        scheduler.shutdown(wait=False)
    await engine.dispose()


app = FastAPI(title="ListFM", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(OSError)
async def db_connection_error_handler(request: Request, exc: OSError):
    """Return clean JSON instead of HTML 500 when PostgreSQL is unreachable."""
    return JSONResponse(
        status_code=503,
        content={"detail": "Service temporarily unavailable. Database connection failed."},
    )


app.include_router(auth_router)
app.include_router(auth_oauth_router)
app.include_router(users_router)
app.include_router(automations_router)
app.include_router(generated_playlists_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
