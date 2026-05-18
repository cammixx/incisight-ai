from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...db import supabase
from ...dependencies.auth import get_current_user
from ...models.profile_models import ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/email-by-username")
async def email_by_username(username: str = Query(..., min_length=1)):
    """Look up a user's email by their display_name (public endpoint for login)."""
    result = supabase.table("profiles").select("id").eq("display_name", username).single().execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Username not found")
    user_id = result.data["id"]
    user = supabase.auth.admin.get_user_by_id(user_id)
    if not user or not user.user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"email": user.user.email}


@router.get("", response_model=ProfileResponse)
async def get_profile(user_id: str = Depends(get_current_user)):
    result = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return result.data


@router.patch("", response_model=ProfileResponse)
async def update_profile(
    body: ProfileUpdate,
    user_id: str = Depends(get_current_user),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    result = (
        supabase.table("profiles")
        .update(updates)
        .eq("id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return result.data[0]


@router.delete("")
async def delete_account(user_id: str = Depends(get_current_user)):
    """Delete the user's account and all associated data."""
    # Remove custom products owned by this user before deleting the auth user.
    # The products.user_id FK has no ON DELETE CASCADE, so it must be cleared first.
    supabase.table("products").delete().eq("user_id", user_id).eq("is_custom", True).execute()
    supabase.auth.admin.delete_user(user_id)
    return {"detail": "Account deleted"}
