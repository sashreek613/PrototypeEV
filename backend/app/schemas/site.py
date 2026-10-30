from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class Recommendation(str, Enum):
    BUILD = "BUILD"
    BUILD_IF_MANAGED = "BUILD_IF_MANAGED"
    DONT_BUILD = "DONT_BUILD"


class Provenance(str, Enum):
    """How much to trust a sub-score. See app/engines/site_scoring.py's
    module docstring for what each label means -- REAL/DERIVED/ESTIMATED are
    the honesty tiers the project's scoring is built on; DEMO flags a value
    that's placeholder data, not any of the above (used only while a real
    source, e.g. OpenChargeMap, hasn't been fetched yet)."""

    REAL = "REAL"
    DERIVED = "DERIVED"
    ESTIMATED = "ESTIMATED"
    DEMO = "DEMO"


class ScoredFactorRead(BaseModel):
    """One weighted contribution to site_score, with its provenance and a
    human-readable, place-naming explanation of where the number came from."""

    key: str
    label: str
    score: float = Field(ge=0, le=100)
    weight: float = Field(ge=0, le=1)
    contribution: float
    provenance: Provenance
    detail: str


class SiteBase(BaseModel):
    name: str
    latitude: float
    longitude: float
    demand_score: float = Field(ge=0, le=100)
    grid_capacity_score: float = Field(ge=0, le=100)
    accessibility_score: float = Field(ge=0, le=100, description="Land availability score (parking capacity / footprint / category baseline)")
    charger_gap_score: float = Field(ge=0, le=100, description="Coverage gap score (distance/density of existing chargers, own-site excluded)")


class SiteRead(SiteBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_score: float
    recommendation: Recommendation
    factors: list[ScoredFactorRead] | None = None
    explanation: str | None = None


class RecommendedSiteRead(SiteRead):
    rank: int


class NearestCandidateRead(BaseModel):
    """A seeded Site row near a classified point, with a link target for
    "connects this to the Top 10 list instead of leaving it an island."""

    id: str
    name: str
    site_score: float
    recommendation: Recommendation
    distance_km: float


class ClassifiedSiteRead(BaseModel):
    """Response for GET /api/sites/classify -- an arbitrary lat/lon or a
    name-resolved point, scored by the exact same app.engines.site_scoring
    call the ranked list uses. Deliberately NOT a Site row (no `id`): this
    point may not correspond to any seeded candidate."""

    name: str
    latitude: float
    longitude: float
    demand_score: float = Field(ge=0, le=100)
    grid_capacity_score: float = Field(ge=0, le=100)
    accessibility_score: float = Field(ge=0, le=100)
    charger_gap_score: float = Field(ge=0, le=100)
    site_score: float
    recommendation: Recommendation
    factors: list[ScoredFactorRead]
    explanation: str
    in_bbox: bool
    nearest_candidate: NearestCandidateRead | None = None


class LocationSuggestion(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    kind: str
