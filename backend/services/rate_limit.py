import time
from collections import defaultdict
from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)

    def _clean(self, key: str, now: float) -> None:
        cutoff = now - self.window_seconds
        self._requests[key] = [t for t in self._requests[key] if t > cutoff]

    def reset(self) -> None:
        self._requests.clear()

    def check(self, key: str) -> None:
        now = time.monotonic()
        self._clean(key, now)
        if len(self._requests[key]) >= self.max_requests:
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
        self._requests[key].append(now)


login_limiter = RateLimiter(max_requests=10, window_seconds=60)
register_limiter = RateLimiter(max_requests=3, window_seconds=21600)
refresh_limiter = RateLimiter(max_requests=20, window_seconds=60)

# OAuth flow guardrails: the exchange + profile fetch + link steps each hit
# external providers (Last.fm / Google / Discord) with the app's credentials.
link_lastfm_limiter = RateLimiter(max_requests=10, window_seconds=60)
oauth_login_limiter = RateLimiter(max_requests=10, window_seconds=60)
complete_email_limiter = RateLimiter(max_requests=10, window_seconds=60)


def rate_limit(request: Request, limiter: RateLimiter) -> None:
    ip = request.client.host if request.client else "unknown"
    limiter.check(ip)
