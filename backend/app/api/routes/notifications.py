from datetime import date

from fastapi import APIRouter, Depends

from ...db import supabase
from ...dependencies.auth import get_current_user
from ...models.notifications_models import Notification, NotificationsResponse
from ...utils import expiry_status as _expiry_status

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationsResponse)
async def get_notifications(user_id: str = Depends(get_current_user)):
    result = (
        supabase.table("user_shelf")
        .select("id, open_date, created_at, product:products(product_name, pao_months)")
        .eq("user_id", user_id)
        .execute()
    )

    notifications: list[Notification] = []

    for item in result.data or []:
        item_id = item["id"]
        product_name = (item.get("product") or {}).get("product_name", "Unknown product")
        pao_months = (item.get("product") or {}).get("pao_months", 12)
        open_date = item.get("open_date")
        created_at = item.get("created_at")

        if open_date:
            status = _expiry_status(open_date, pao_months)
            if status == "Expired":
                notifications.append(Notification(
                    id=f"{item_id}_expired",
                    type="expired",
                    product_name=product_name,
                    message="This product has expired. Consider replacing it.",
                    shelf_item_id=item_id,
                    created_at=created_at,
                ))
            elif status == "Expiring":
                notifications.append(Notification(
                    id=f"{item_id}_expiring",
                    type="expiring",
                    product_name=product_name,
                    message="Expiring soon — use it up or plan a replacement.",
                    shelf_item_id=item_id,
                    created_at=created_at,
                ))
        else:
            days_since_added = 0
            if created_at:
                added = date.fromisoformat(created_at[:10])
                days_since_added = (date.today() - added).days

            weeks = days_since_added // 7
            if weeks >= 1:
                week_label = f"{weeks} week{'s' if weeks > 1 else ''}"
                notifications.append(Notification(
                    id=f"{item_id}_unopened_w{weeks}",
                    type="missing_dates",
                    product_name=product_name,
                    message=f"Added {week_label} ago but never opened. Log your open date when you start using it.",
                    shelf_item_id=item_id,
                    created_at=created_at,
                ))
            else:
                notifications.append(Notification(
                    id=f"{item_id}_no_open_date",
                    type="missing_dates",
                    product_name=product_name,
                    message="Just added! Remember to log your open date when you start using it.",
                    shelf_item_id=item_id,
                    created_at=created_at,
                ))

    # Sort: expired first, then expiring, then missing_dates
    order = {"expired": 0, "expiring": 1, "missing_dates": 2}
    notifications.sort(key=lambda n: order.get(n.type, 9))

    return NotificationsResponse(
        notifications=notifications,
        unread_count=len(notifications),
    )
