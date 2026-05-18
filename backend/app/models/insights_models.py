from pydantic import BaseModel
from typing import List, Optional


class SuspectIngredient(BaseModel):
    name: str
    reaction_count: int
    weighted_score: float
    category: Optional[str] = None
    in_kb: bool = False


class SuspectsResponse(BaseModel):
    suspects: List[SuspectIngredient]
    has_reactions: bool = False



class InlineProduct(BaseModel):
    name: str
    ingredients: str


class HistoryMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[HistoryMessage] = []
    product_id_a: Optional[str] = None
    product_a: Optional[InlineProduct] = None   # OCR-scanned, not in DB
    product_id_b: Optional[str] = None
    product_b: Optional[InlineProduct] = None   # OCR-scanned, not in DB
    image_base64: Optional[str] = None          # front-view photo for vision identification


class ChatResponse(BaseModel):
    reply: str
