from pydantic import BaseModel
from datetime import datetime


class TrendItem(BaseModel):
    id: str | None = None
    rank: int
    title: str
    description: str
    hashtag: str
    category: str
    category_label: str
    views: str
    likes: str
    shares: str
    comments: str = "0"
    growth: str
    growth_up: bool = True
    video_count: int = 0
    region: str = "عالمي"
    fetched_at: datetime | None = None


class ArticleItem(BaseModel):
    id: str | None = None
    title: str
    excerpt: str
    content: str
    category: str
    read_time: str
    trend_hashtag: str
    emoji: str = "📝"
    created_at: datetime | None = None


class AnalysisRequest(BaseModel):
    topic: str


class AnalysisResult(BaseModel):
    topic: str
    views: str
    growth: str
    region: str
    insights: list[dict]
    article: str
    chart_data: list[int]
