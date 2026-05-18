import httpx
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

logger = logging.getLogger(__name__)

from ...config import settings
from ...db import supabase
from ...dependencies.auth import get_current_user
from ...models.product_models import MatchRequest, ProductCreate, ProductResponse
from ...services.openai_service import get_openai_service

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/search", response_model=list[ProductResponse])
async def search_products(
    q: str = Query(..., min_length=1),
    user_id: str = Depends(get_current_user),
):
    result = (
        supabase.table("products")
        .select("*")
        .ilike("product_name", f"%{q}%")
        .or_(f"is_custom.eq.false,user_id.eq.{user_id}")
        .limit(20)
        .execute()
    )
    return result.data or []


@router.post("/match", response_model=ProductResponse | None)
async def match_product_by_ingredients(
    body: MatchRequest,
    user_id: str = Depends(get_current_user),
):
    """Find the closest product match by ingredient text using embedding similarity.

    ≥ 0.65  → suggest match, user confirms via banner
    < 0.65  → no match
    """
    if not body.ingredients.strip():
        return None
    try:
        openai_svc = get_openai_service()
        embeddings = await openai_svc.create_embeddings([body.ingredients])
        embedding = embeddings[0]

        result = supabase.rpc(
            "match_products",
            {"query_embedding": embedding, "match_count": 1, "match_threshold": 0.65, "caller_id": user_id},
        ).execute()
        if result.data:
            match = result.data[0]
            logger.info(f"Match suggestion: {match.get('product_name')} (similarity: {match.get('similarity', 0):.4f})")
            return match

        logger.info("No match found (similarity < 0.65)")
        return None
    except Exception:
        logger.exception("Product matching failed")
        return None


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
):
    update: dict = {}
    if "pao_months" in body:
        update["pao_months"] = body["pao_months"]
    if "product_ingredients" in body:
        # Only allow ingredient edits on user-created products
        check = supabase.table("products").select("is_custom").eq("id", product_id).single().execute()
        if not check.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        if not check.data.get("is_custom"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit ingredients of a library product")
        update["product_ingredients"] = body["product_ingredients"]
    if not update:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")
    result = (
        supabase.table("products")
        .update(update)
        .eq("id", product_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return result.data[0]


@router.get("/{product_id}/shop")
async def shop_product(product_id: str, user_id: str = Depends(get_current_user)):
    """Return the top Amazon listing URL for a product via Canopy API."""
    result = supabase.table("products").select("product_name").eq("id", product_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    product_name = result.data["product_name"]

    query = """
    query($searchTerm: String!) {
      amazonProductSearchResults(input: { searchTerm: $searchTerm }) {
        productResults {
          results { url }
        }
      }
    }
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://graphql.canopyapi.co/",
            headers={"API-KEY": settings.canopy_api_key, "Content-Type": "application/json"},
            json={"query": query, "variables": {"searchTerm": product_name}},
            timeout=10,
        )
    data = resp.json()
    results = (data.get("data") or {}).get("amazonProductSearchResults", {}).get("productResults", {}).get("results", [])
    if not results:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No Amazon listing found")
    return {"url": results[0]["url"]}


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str):
    result = (
        supabase.table("products")
        .select("*")
        .eq("id", product_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return result.data


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    user_id: str = Depends(get_current_user),
):
    row: dict = {
        "product_name": body.product_name,
        "product_ingredients": body.product_ingredients,
        "pao_months": body.pao_months,
        "is_custom": True,
        "user_id": user_id,
    }
    result = (
        supabase.table("products")
        .insert(row)
        .execute()
    )
    return result.data[0]
