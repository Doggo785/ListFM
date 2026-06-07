from pydantic import BaseModel


class Track(BaseModel):
    title: str
    artist: str


class UserInfo(BaseModel):
    username: str
    image: str | None = None


class RecentTracksResponse(BaseModel):
    tracks: list[Track]


class ErrorResponse(BaseModel):
    error: str
