from pydantic import BaseModel


class Track(BaseModel):
    title: str
    artist: str


class RecentTracksResponse(BaseModel):
    tracks: list[Track]


class ErrorResponse(BaseModel):
    error: str
