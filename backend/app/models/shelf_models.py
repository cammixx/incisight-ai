from pydantic import BaseModel
from typing import Literal, Optional
from datetime import date, datetime

ExpiryStatus = Literal["Expired", "Expiring", "OK"]


class ShelfItemCreate(BaseModel):
    product_id: str
    open_date: Optional[date] = None


class ShelfItemUpdate(BaseModel):
    open_date: Optional[date] = None


class ShelfItemResponse(BaseModel):
    id: str
    product_id: str
    open_date: Optional[date] = None
    created_at: Optional[datetime] = None
    expiry_status: ExpiryStatus
    days_since_added: Optional[int] = None
    product: Optional[dict] = None
