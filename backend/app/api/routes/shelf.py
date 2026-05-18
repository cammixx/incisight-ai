from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status

from ...db import supabase
from ...dependencies.auth import get_current_user
from ...models.shelf_models import (
    ShelfItemCreate,
    ShelfItemResponse,
    ShelfItemUpdate,
)
from ...utils import expiry_status as _expiry_status_str, fetch_product

router = APIRouter(prefix="/shelf", tags=["shelf"])


def _enrich(item: dict) -> dict:
    if item.get("open_date"):
        pao_months = (item.get("product") or {}).get("pao_months", 12)
        item["expiry_status"] = _expiry_status_str(item["open_date"], pao_months)
        item["days_since_added"] = None
    else:
        item["expiry_status"] = "OK"
        if item.get("created_at"):
            added = date.fromisoformat(item["created_at"][:10])
            item["days_since_added"] = max(0, (date.today() - added).days)
        else:
            item["days_since_added"] = None
    return item


@router.post("", response_model=ShelfItemResponse, status_code=status.HTTP_201_CREATED)
async def add_to_shelf(
    body: ShelfItemCreate,
    user_id: str = Depends(get_current_user),
):
    row = {
        "user_id": user_id,
        "product_id": body.product_id,
    }
    if body.open_date:
        row["open_date"] = body.open_date.isoformat()
    result = (
        supabase.table("user_shelf")
        .insert(row)
        .execute()
    )
    item = result.data[0]
    item["product"] = fetch_product(body.product_id)
    return _enrich(item)


@router.get("", response_model=list[ShelfItemResponse])
async def get_shelf(user_id: str = Depends(get_current_user)):
    result = (
        supabase.table("user_shelf")
        .select("*, product:products(product_name, pao_months, image_url, product_ingredients, is_custom)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [_enrich(item) for item in (result.data or [])]


@router.patch("/{item_id}", response_model=ShelfItemResponse)
async def update_shelf_item(
    item_id: str,
    body: ShelfItemUpdate,
    user_id: str = Depends(get_current_user),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    if "open_date" in updates and updates["open_date"]:
        updates["open_date"] = updates["open_date"].isoformat()

    result = (
        supabase.table("user_shelf")
        .update(updates)
        .eq("id", item_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shelf item not found")
    item = result.data[0]
    item["product"] = fetch_product(item["product_id"])
    return _enrich(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shelf_item(
    item_id: str,
    user_id: str = Depends(get_current_user),
):
    result = (
        supabase.table("user_shelf")
        .delete()
        .eq("id", item_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shelf item not found")
