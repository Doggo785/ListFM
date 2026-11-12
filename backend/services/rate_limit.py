import hashlib
import time
from collections import defaultdict

from config import get_settings
from fastapi import HTTPException, Request

# Shared across register / complete-email / provider-bind so the response body
# never reveals whether an email already exists (anti-enumeration).
DUPLICATE_EMAIL_MESSAGE = "An account with this email already exists"


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._checks_since_sweep = 0

    def _clean(self, key: str, now: float) -> None:
        cutoff = now - self.window_seconds
        pruned = [t for t in self._requests[key] if t > cutoff]
        if pruned:
            self._requests[key] = pruned
        else:
            # Drop the key entirely once all its timestamps expire so a key
            # used once does not linger forever (unbounded memory growth).
            self._requests.pop(key, None)

    def _sweep(self, now: float) -> None:
        """Evict every key whose most recent hit is outside the window."""
        cutoff = now - self.window_seconds
        for key in [k for k, ts in self._requests.items() if not ts or ts[-1] <= cutoff]:
            self._requests.pop(key, None)

    def reset(self) -> None:
        self._requests.clear()

    def check(self, key: str) -> None:
        self.refuse_if_full(key)
        self.record(key)

    def refuse_if_full(self, key: str) -> None:
        """Raise 429 once the key used up its window, without counting this call."""
        self._clean(key, time.monotonic())
        if len(self._requests[key]) >= self.max_requests:
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    def record(self, key: str) -> None:
        now = time.monotonic()
        self._requests[key].append(now)
        # Amortized full sweep: keeps the map bounded without an O(n) scan on
        # every request.
        self._checks_since_sweep += 1
        if self._checks_since_sweep >= 512:
            self._checks_since_sweep = 0
            self._sweep(now)


login_limiter = RateLimiter(max_requests=10, window_seconds=60)
# Wrong passwords per account, whatever the IP: guessing one password from many IPs stops here.
failed_login_limiter = RateLimiter(max_requests=20, window_seconds=3600)
register_limiter = RateLimiter(max_requests=3, window_seconds=21600)
# Per-email register guardrail: stops an attacker who rotates IPs but reuses
# the same victim email. Keyed by sha256(email.lower()).
register_email_limiter = RateLimiter(max_requests=3, window_seconds=21600)
refresh_limiter = RateLimiter(max_requests=20, window_seconds=60)

# OAuth flow guardrails: the exchange + profile fetch + link steps each hit
# external providers (Last.fm / Google / Discord) with the app's credentials.
link_lastfm_limiter = RateLimiter(max_requests=10, window_seconds=60)
oauth_login_limiter = RateLimiter(max_requests=10, window_seconds=60)
# Wrong passwords per account, whatever the IP: guessing one password from many IPs stops here.
failed_login_limiter = RateLimiter(max_requests=20, window_seconds=3600)
complete_email_limiter = RateLimiter(max_requests=10, window_seconds=60)
# Run now and retry, per automation: each run writes a playlist and reads the whole window.
manual_run_limiter = RateLimiter(max_requests=1, window_seconds=60)
# The landing page's public route: two Last.fm calls per name, on the same budget
# as the signed-in users' syncs. The total keeps it under a quarter of that budget.
listener_limiter = RateLimiter(max_requests=5, window_seconds=60)
listener_total_limiter = RateLimiter(max_requests=30, window_seconds=60)


def _client_ip(request: Request) -> str:
    """The visitor's IP: the header the trusted proxy sets, else the socket peer.

    X-Forwarded-For is never read: a visitor can write it, so a new fake IP per
    try would get past every limit. In production Cloudflare sets
    `CF-Connecting-IP` and overwrites any value the visitor sent
    (`TRUSTED_IP_HEADER`); without it every visitor shares the proxy's address.
    """
    header = get_settings().trusted_ip_header
    if header and (value := request.headers.get(header)):
        return value.strip()
    return request.client.host if request.client else "unknown"


def rate_limit(request: Request, limiter: RateLimiter) -> None:
    limiter.check(_client_ip(request))


def rate_limit_by_key(limiter: RateLimiter, key: str) -> None:
    limiter.check(key)


def rate_limit_email_key(email: str) -> str:
    return hashlib.sha256(email.lower().encode()).hexdigest()
