from datetime import date

from fastapi import APIRouter, Depends

from ...db import supabase
from ...dependencies.auth import get_current_user
from ...models.insights_models import (
    ChatRequest,
    ChatResponse,
    SuspectIngredient,
    SuspectsResponse,
)
from ...services.openai_service import get_openai_service

router = APIRouter(prefix="/insights", tags=["insights"])


def _parse_ingredients(ingredients_text: str) -> list[str]:
    """Split comma/semicolon-separated ingredient string into a cleaned list."""
    import re
    # Protect digit,digit commas (e.g. "1,2-hexanediol") before splitting
    text = re.sub(r'(\d),(\d)', r'\1¬\2', ingredients_text)
    parts = re.split(r"[,;]", text)
    result = []
    for p in parts:
        p = p.strip().lower()
        if not p or len(p) < 2:
            continue
        if re.fullmatch(r'[\d\s\-/®©]+', p):
            continue
        result.append(p.replace('¬', ','))
    return result


# Ubiquitous safe-base ingredients that appear in nearly every formula —
# excluding them prevents them from dominating the suspect ranking.
_COMMON_SAFE = frozenset({
    "water", "aqua", "glycerin", "sodium chloride", "citric acid",
    "phenoxyethanol", "ethylhexylglycerin", "1,2-hexanediol",
})

# Maps INCI name → category label shown on the UI.
# EU 26 regulated fragrance allergens → "Fragrance"
# Common essential oils → "Essential Oil"
# Includes truncated/variant names as stored in product_ingredients.
_SENSITIZER_CATEGORIES: dict[str, str] = {
    # EU 26 fragrance allergens
    "amyl cinnamal": "Fragrance", "amylcinnamyl alcohol": "Fragrance",
    "anise alcohol": "Fragrance", "benzyl alcohol": "Fragrance",
    "benzyl benzoate": "Fragrance", "benzyl cinnamate": "Fragrance",
    "benzyl salicylate": "Fragrance", "cinnamal": "Fragrance",
    "cinnamyl alcohol": "Fragrance", "citral": "Fragrance",
    "citronellol": "Fragrance", "coumarin": "Fragrance",
    "eugenol": "Fragrance", "farnesol": "Fragrance",
    "geraniol": "Fragrance", "hexyl cinnamal": "Fragrance",
    "hydroxycitronellal": "Fragrance",
    "hydroxyisohexyl 3-cyclohexene carboxaldehyde": "Fragrance",
    "isoeugenol": "Fragrance", "alpha-isomethyl ionone": "Fragrance",
    "limonene": "Fragrance", "linalool": "Fragrance",
    "methyl 2-octynoate": "Fragrance",
    "butylphenyl methylpropional": "Fragrance",
    "evernia prunastri extract": "Fragrance", "evernia prunastri": "Fragrance",
    "evernia furfuracea extract": "Fragrance", "evernia furfuracea": "Fragrance",
    # Essential oils
    "lavandula angustifolia oil": "Essential Oil",
    "lavandula angustifolia flower oil": "Essential Oil",
    "citrus aurantium bergamia fruit oil": "Essential Oil",
    "citrus aurantium bergamia": "Essential Oil",
    "citrus aurantium dulcis peel oil": "Essential Oil",
    "citrus aurantium dulcis": "Essential Oil",
    "citrus limon peel oil": "Essential Oil", "citrus limon": "Essential Oil",
    "citrus sinensis peel oil": "Essential Oil", "citrus sinensis": "Essential Oil",
    "citrus grandis": "Essential Oil", "citrus aurantifolia oil": "Essential Oil",
    "citrus paradisi peel oil": "Essential Oil", "citrus paradisi": "Essential Oil",
    "citrus nobilis peel oil": "Essential Oil", "citrus nobilis": "Essential Oil",
    "citrus reticulata peel oil": "Essential Oil", "citrus reticulata": "Essential Oil",
    "melaleuca alternifolia leaf oil": "Essential Oil",
    "eucalyptus globulus leaf oil": "Essential Oil",
    "mentha piperita oil": "Essential Oil", "mentha viridis leaf oil": "Essential Oil",
    "rosmarinus officinalis leaf oil": "Essential Oil",
    "rosmarinus officinalis extract": "Essential Oil",
    "rosmarinus officinalis": "Essential Oil",
    "pelargonium graveolens flower oil": "Essential Oil",
    "pelargonium graveolens extract": "Essential Oil",
    "cananga odorata flower oil": "Essential Oil",
    "jasminum officinale flower extract": "Essential Oil",
    "rosa damascena flower oil": "Essential Oil", "rosa damascena": "Essential Oil",
    "pogostemon cablin oil": "Essential Oil",
    "pogostemon cablin flower extract": "Essential Oil",
    "santalum album wood oil": "Essential Oil",
    "cedrus atlantica bark oil": "Essential Oil",
    "juniperus virginiana oil": "Essential Oil",
    "juniperus virginiana wood oil": "Essential Oil",
    "juniperus mexicana oil": "Essential Oil",
    "juniperus communis fruit extract": "Essential Oil",
    "juniperus communis": "Essential Oil",
    "boswellia carterii oil": "Essential Oil",
    "commiphora myrrha oil": "Essential Oil",
    "vetiveria zizanoides root oil": "Essential Oil",
    "cymbopogon citratus leaf oil": "Essential Oil",
    "cymbopogon nardus oil": "Essential Oil",
    "cupressus sempervirens oil": "Essential Oil",
    "salvia officinalis oil": "Essential Oil", "salvia sclarea oil": "Essential Oil",
    "origanum vulgare leaf oil": "Essential Oil",
    "thymus vulgaris flower/leaf oil": "Essential Oil",
    "syzygium aromaticum flower oil": "Essential Oil",
    "cinnamomum cassia bark oil": "Essential Oil",
    "cinnamomum zeylanicum bark oil": "Essential Oil",
    "piper nigrum fruit oil": "Essential Oil",
    "zingiber officinale root oil": "Essential Oil",
    "zingiber cassumunar root oil": "Essential Oil",
    "foeniculum vulgare fruit oil": "Essential Oil",
    "helichrysum italicum flower oil": "Essential Oil",
    "chamomilla recutita flower oil": "Essential Oil",
    "anthemis nobilis flower oil": "Essential Oil",
    "litsea cubeba fruit oil": "Essential Oil",
    "pinus sylvestris leaf oil": "Essential Oil",
    "abies sibirica needle oil": "Essential Oil",
    "artemisia vulgaris oil": "Essential Oil",
}

_SENSITIZER_TERMS = {"sensitiz", "irritat", "allergen", "allergic", "comedogenic", "photosensit", "contact dermatit"}

_SEVERITY_WEIGHT = {"Irritated": 1.0, "Breakout": 2.0}
_MAX_DECAY_DAYS = 180  # reactions ≥ 6 months old get 0.5× weight


def _recency_factor(log_date_str: str | None) -> float:
    """1.0 for today, decays linearly to 0.5 at MAX_DECAY_DAYS."""
    if not log_date_str:
        return 0.75
    try:
        delta = (date.today() - date.fromisoformat(log_date_str)).days
        return max(0.5, 1.0 - (delta / _MAX_DECAY_DAYS) * 0.5)
    except Exception:
        return 0.75


def _get_category(name: str, kb_map: dict[str, dict]) -> str | None:
    cat = _SENSITIZER_CATEGORIES.get(name)
    if cat:
        return cat
    desc = (kb_map.get(name) or {}).get("description") or ""
    if any(term in desc.lower() for term in _SENSITIZER_TERMS):
        return "Known irritant"
    return None


def _apply_suspect_filter(
    top_names: list[tuple[str, float, int]],
    kb_map: dict[str, dict],
) -> list[str]:
    """Apply the same filtering used by get_suspects: score≥3, count≥2, top-10 cap."""
    result: list[str] = []
    for rank, (name, score, count) in enumerate(top_names):
        if score < 4 or count < 2:
            continue
        category = _get_category(name, kb_map)
        if rank >= 10 and not category:
            continue
        result.append(name)
        if len(result) == 10:
            break
    return result


def _weighted_suspects(
    logs: list[dict],
    shelf_map: dict[str, str],
    prod_map: dict[str, str],
    rating_map: dict[str, int] | None = None,
    top_n: int = 20,
) -> list[tuple[str, float, int]]:
    """Return (name, weighted_score, reaction_count) ranked by score.

    Score per ingredient: sum of severity × recency × safety_factor across logs.
    safety_factor = rating/5.0 (rating 5 = neutral 1×). Unrated defaults to 1.0.
    Only ingredients appearing in ≥ 2 reaction logs are included.
    """
    weighted: dict[str, float] = {}
    reaction_counts: dict[str, int] = {}
    for item in logs:
        severity = _SEVERITY_WEIGHT.get(item.get("reaction_status", ""), 1.0)
        recency = _recency_factor(item.get("log_date"))
        pid = shelf_map.get(item.get("shelf_item_id", ""))
        for ingredient in _parse_ingredients(prod_map.get(pid or "", "")):
            if ingredient not in _COMMON_SAFE:
                rating = (rating_map or {}).get(ingredient)
                safety_factor = (rating / 5.0) if rating is not None else 1.0
                weighted[ingredient] = weighted.get(ingredient, 0.0) + severity * recency * safety_factor
                reaction_counts[ingredient] = reaction_counts.get(ingredient, 0) + 1
    return [
        (name, round(score, 2), reaction_counts[name])
        for name, score in sorted(weighted.items(), key=lambda x: x[1], reverse=True)
        if reaction_counts.get(name, 0) >= 2
    ][:top_n]


@router.get("/suspects", response_model=SuspectsResponse)
async def get_suspects(user_id: str = Depends(get_current_user)):
    # Get all skin logs with bad reactions, joining through user_shelf to get product_id
    logs_result = (
        supabase.table("skin_logs")
        .select("reaction_status, shelf_item_id, log_date")
        .eq("user_id", user_id)
        .in_("reaction_status", ["Irritated", "Breakout"])
        .execute()
    )
    if not logs_result.data:
        return SuspectsResponse(suspects=[], has_reactions=False)

    shelf_item_ids = list({item["shelf_item_id"] for item in logs_result.data if item.get("shelf_item_id")})
    if not shelf_item_ids:
        return SuspectsResponse(suspects=[], has_reactions=True)

    # Resolve shelf_item_id → product_id
    shelf_result = (
        supabase.table("user_shelf")
        .select("id, product_id")
        .in_("id", shelf_item_ids)
        .execute()
    )
    shelf_map = {s["id"]: s["product_id"] for s in (shelf_result.data or [])}

    product_ids = list({pid for pid in shelf_map.values() if pid})
    if not product_ids:
        return SuspectsResponse(suspects=[], has_reactions=True)

    # Fetch ingredient lists for those products
    products_result = (
        supabase.table("products")
        .select("id, product_ingredients")
        .in_("id", product_ids)
        .execute()
    )
    products_map = {p["id"]: p["product_ingredients"] for p in (products_result.data or [])}

    # Fetch safety ratings for all reaction-product ingredients before Stage 1
    all_ingredient_names: set[str] = set()
    for ingredients_text in products_map.values():
        for name in _parse_ingredients(ingredients_text):
            if name not in _COMMON_SAFE:
                all_ingredient_names.add(name)

    kb_map: dict[str, dict] = {}
    if all_ingredient_names:
        kb_result = (
            supabase.table("ingredients")
            .select("inci_name, safety_rating, description")
            .in_("inci_name", list(all_ingredient_names))
            .execute()
        )
        kb_map = {r["inci_name"].lower(): r for r in (kb_result.data or [])}

    rating_map = {
        name: data["safety_rating"]
        for name, data in kb_map.items()
        if data.get("safety_rating") is not None
    }

    # Weighted ingredient scoring (severity × recency × safety_factor, excluding safe-base ingredients)
    top_names = _weighted_suspects(logs_result.data, shelf_map, products_map, rating_map=rating_map, top_n=50)

    suspects = []
    for rank, (name, score, count) in enumerate(top_names):
        category = _get_category(name, kb_map)
        in_kb = name in kb_map

        # Drop low-signal ingredients: require score >= 3 AND count >= 2
        if score < 4 or count < 2:
            continue
        # Keep if in top 10 by weighted score, or has a known category anywhere in top 50
        if rank >= 10 and not category:
            continue

        suspects.append(SuspectIngredient(
            name=name,
            reaction_count=count,
            weighted_score=score,
            category=category,
            in_kb=in_kb,
        ))
        if len(suspects) == 10:
            break

    return SuspectsResponse(suspects=suspects, has_reactions=True)



# ── Chat ──────────────────────────────────────────────────────────────────────

def _build_chat_context(
    profile: dict,
    prod_a: dict | None,
    prod_b: dict | None,
    ingredient_kb: dict[str, dict],
    suspects: list[str] | None = None,
    shelf_names: list[str] | None = None,
    suspect_categories: dict[str, str] | None = None,
) -> str:
    parts: list[str] = []

    skin_type = profile.get("skin_type") or "not specified"
    goals = ", ".join(profile.get("skin_goals") or []) or "none"
    avoid = ", ".join(profile.get("avoid_list") or []) or "none"
    shelf_line = ", ".join(shelf_names) if shelf_names else "none"
    parts.append(
        f"USER PROFILE:\nSkin type: {skin_type}\nGoals: {goals}\n"
        f"Avoid list: {avoid}\nProducts on shelf: {shelf_line}"
    )

    if suspects:
        parts.append(f"USER'S SUSPECT INGREDIENTS (from skin reactions): {', '.join(suspects)}")
        # Include details for every suspect so the bot can explain each one.
        # Falls back to hardcoded category (Fragrance / Essential Oil) when not in KB.
        suspect_detail_lines: list[str] = []
        for name in suspects:
            data = ingredient_kb.get(name)
            if data:
                rating = data.get("safety_rating")
                desc = (data.get("description") or "").strip()
                line = f"- {name}"
                if rating is not None:
                    line += f": safety {rating}/10"
                if desc:
                    line += f" — {desc}"
                suspect_detail_lines.append(line)
            else:
                cat = (suspect_categories or {}).get(name)
                line = f"- {name}"
                if cat:
                    line += f": [{cat}]"
                suspect_detail_lines.append(line)
        if suspect_detail_lines:
            parts.append("SUSPECT INGREDIENT DETAILS:\n" + "\n".join(suspect_detail_lines))

    if prod_a:
        parts.append(f"PRODUCT: {prod_a['product_name']}\nIngredients: {prod_a['product_ingredients']}")
    if prod_b:
        parts.append(f"PRODUCT: {prod_b['product_name']}\nIngredients: {prod_b['product_ingredients']}")

    if prod_a and prod_b:
        set_a = set(_parse_ingredients(prod_a["product_ingredients"]))
        set_b = set(_parse_ingredients(prod_b["product_ingredients"]))
        shared = set_a & set_b
        if shared:
            parts.append(f"SHARED INGREDIENTS: {', '.join(sorted(shared))}")

    # Proactive conflict alerts: flag pinned products that contain suspect ingredients
    if suspects and (prod_a or prod_b):
        suspect_set = set(suspects)
        conflicts: list[str] = []
        for prod in [prod_a, prod_b]:
            if not prod:
                continue
            hits = suspect_set & set(_parse_ingredients(prod["product_ingredients"]))
            if hits:
                conflicts.append(
                    f"{prod['product_name']} contains your suspect ingredients: {', '.join(sorted(hits))}"
                )
        if conflicts:
            parts.append("⚠️ CONFLICT ALERTS:\n" + "\n".join(conflicts))

    # Notable ingredients: only surface ones worth the LLM's attention.
    # Skip safe filler ingredients (rating ≤ 2, no description) to keep context tight.
    avoid_set = set(i.lower() for i in (profile.get("avoid_list") or []))
    suspect_set = set(suspects or [])
    if ingredient_kb:
        kb_lines: list[str] = []
        for name, data in sorted(ingredient_kb.items()):
            rating = data.get("safety_rating")
            desc = (data.get("description") or "").strip()
            # Always include: in avoid list, in suspect list, or safety rating ≥ 3, or has a description
            if (
                name in avoid_set
                or name in suspect_set
                or (rating is not None and rating >= 3)
                or desc
            ):
                line = f"- {name}"
                if rating is not None:
                    line += f": safety {rating}/10"
                if name in avoid_set:
                    line += " [ON USER AVOID LIST]"
                if desc:
                    line += f" — {desc}"
                kb_lines.append(line)
        if kb_lines:
            parts.append("NOTABLE INGREDIENTS FROM DATABASE:\n" + "\n".join(kb_lines))

    return "\n\n".join(parts)


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user_id: str = Depends(get_current_user),
):
    # 1. Retrieve user profile
    profile_result = (
        supabase.table("profiles")
        .select("skin_type, skin_goals, avoid_list")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    profile = profile_result.data[0] if profile_result.data else {}

    # 2. Resolve each product slot: DB id takes priority over inline
    def resolve(pid: str | None, inline) -> dict | None:
        if pid:
            r = (
                supabase.table("products")
                .select("product_name, product_ingredients")
                .eq("id", pid)
                .limit(1)
                .execute()
            )
            return r.data[0] if r.data else None
        if inline:
            return {"product_name": inline.name, "product_ingredients": inline.ingredients}
        return None

    prod_a = resolve(body.product_id_a, body.product_a)
    prod_b = resolve(body.product_id_b, body.product_b)

    # 3. Retrieve ingredient knowledge base for all ingredients in pinned products
    all_ingredients: set[str] = set()
    if prod_a:
        all_ingredients |= set(_parse_ingredients(prod_a["product_ingredients"]))
    if prod_b:
        all_ingredients |= set(_parse_ingredients(prod_b["product_ingredients"]))

    ingredient_kb: dict[str, dict] = {}
    if all_ingredients:
        kb_result = (
            supabase.table("ingredients")
            .select("inci_name, safety_rating, description")
            .in_("inci_name", list(all_ingredients))
            .execute()
        )
        ingredient_kb = {r["inci_name"].lower(): r for r in (kb_result.data or [])}

    # 4. Fetch user's suspect ingredients from skin reactions (weighted by severity + recency)
    suspect_names: list[str] = []
    logs_result = (
        supabase.table("skin_logs")
        .select("reaction_status, shelf_item_id, log_date")
        .eq("user_id", user_id)
        .in_("reaction_status", ["Irritated", "Breakout"])
        .execute()
    )
    if logs_result.data:
        shelf_ids = list({item["shelf_item_id"] for item in logs_result.data if item.get("shelf_item_id")})
        if shelf_ids:
            shelf_r = supabase.table("user_shelf").select("id, product_id").in_("id", shelf_ids).execute()
            shelf_map = {s["id"]: s["product_id"] for s in (shelf_r.data or [])}
            pids = list({pid for pid in shelf_map.values() if pid})
            if pids:
                prod_r = supabase.table("products").select("id, product_ingredients").in_("id", pids).execute()
                prod_map = {p["id"]: p["product_ingredients"] for p in (prod_r.data or [])}
                # Fetch KB entries for all reaction-product ingredients (ratings needed for Stage 1)
                reaction_ingredients: set[str] = set()
                for ingredients_text in prod_map.values():
                    for name in _parse_ingredients(ingredients_text):
                        if name not in _COMMON_SAFE:
                            reaction_ingredients.add(name)
                missing_kb = [n for n in reaction_ingredients if n not in ingredient_kb]
                if missing_kb:
                    suspect_kb_r = (
                        supabase.table("ingredients")
                        .select("inci_name, safety_rating, description")
                        .in_("inci_name", missing_kb)
                        .execute()
                    )
                    for r in (suspect_kb_r.data or []):
                        ingredient_kb[r["inci_name"].lower()] = r
                chat_rating_map = {
                    name: ingredient_kb[name]["safety_rating"]
                    for name in reaction_ingredients
                    if ingredient_kb.get(name, {}).get("safety_rating") is not None
                }
                raw_suspects = _weighted_suspects(logs_result.data, shelf_map, prod_map, rating_map=chat_rating_map, top_n=50)
                suspect_names = _apply_suspect_filter(raw_suspects, ingredient_kb)

    # 5. Fetch user's shelf product names for full shelf awareness
    shelf_names: list[str] = []
    shelf_result = (
        supabase.table("user_shelf")
        .select("product:products(product_name)")
        .eq("user_id", user_id)
        .execute()
    )
    for item in (shelf_result.data or []):
        name = (item.get("product") or {}).get("product_name")
        if name:
            shelf_names.append(name)

    # 6. Augment context and generate
    suspect_cats = {n: _SENSITIZER_CATEGORIES[n] for n in suspect_names if n in _SENSITIZER_CATEGORIES}
    context = _build_chat_context(profile, prod_a, prod_b, ingredient_kb, suspects=suspect_names, shelf_names=shelf_names, suspect_categories=suspect_cats)
    openai_svc = get_openai_service()
    reply = await openai_svc.generate_recommendation(
        context=context,
        user_query=body.message,
        history=[m.model_dump() for m in body.history],
        image_base64=body.image_base64,
    )

    return ChatResponse(reply=reply)
