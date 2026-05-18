from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class ProfileResponse(BaseModel):
    id: str
    display_name: Optional[str] = None
    skin_type: Optional[str] = None
    skin_goals: List[str] = []
    avoid_list: List[str] = []
    avatar_url: Optional[str] = None
    created_at: Optional[datetime] = None


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    skin_type: Optional[str] = None
    skin_goals: Optional[List[str]] = None
    avoid_list: Optional[List[str]] = None
    avatar_url: Optional[str] = None
