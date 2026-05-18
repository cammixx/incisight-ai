from datetime import date, timedelta

from .db import supabase

EXPIRING_DAYS = 30

PRODUCT_FIELDS = "pao_months, product_name, image_url, product_ingredients, is_custom"


def expiry_status(open_date_str: str, pao_months: int) -> str:
    open_date = date.fromisoformat(open_date_str)
    expiry = open_date + timedelta(days=pao_months * 30)
    today = date.today()
    if today > expiry:
        return "Expired"
    if today >= expiry - timedelta(days=EXPIRING_DAYS):
        return "Expiring"
    return "OK"


def fetch_product(product_id: str) -> dict:
    result = supabase.table("products").select(PRODUCT_FIELDS).eq("id", product_id).single().execute()
    return result.data
