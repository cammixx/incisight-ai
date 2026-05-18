from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class ProductResponse(BaseModel):
    id: str
    product_name: str
    product_ingredients: str
    pao_months: int
    is_custom: bool = False
    image_url: Optional[str] = None
    created_at: Optional[datetime] = None
    low_confidence: bool = False  # True when matched via relaxed threshold


class ProductCreate(BaseModel):
    product_name: str
    product_ingredients: str
    pao_months: int = Field(default=12, ge=1, le=120)


class MatchRequest(BaseModel):
    ingredients: str
