from pydantic import BaseModel
from typing import List


class Notification(BaseModel):
    id: str
    type: str  # "expired" | "expiring" | "unopened" | "missing_dates"
    product_name: str
    message: str
    shelf_item_id: str
    created_at: str | None = None


class NotificationsResponse(BaseModel):
    notifications: List[Notification]
    unread_count: int
