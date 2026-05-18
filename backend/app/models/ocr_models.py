from pydantic import BaseModel
from typing import List, Dict

class OCRResponse(BaseModel):
    raw_text: str
    cleaned_text: str
    ingredients: List[str]
    confidence_data: List[Dict]
    provider: str