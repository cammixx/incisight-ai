# backend/app/services/openai_service.py
from openai import OpenAI
from typing import List, Dict
import logging
from ..config import Settings

logger = logging.getLogger(__name__)

class OpenAIService:
    def __init__(self):
        settings = Settings()
        api_key = settings.openai_api_key
    
        if not api_key:
            logger.error("OpenAI API key not found. Please set OPENAI_API_KEY in .env file")
            raise ValueError("OpenAI API key not found in environment variables")

        logger.info(f"OpenAI API key loaded successfully (starts with: {api_key[:10]}...)")

        self.client = OpenAI(api_key=api_key)
        self.embedding_model = "text-embedding-3-small"
        self.chat_model = "gpt-4o-mini"
        
    async def create_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for ingredient/product text"""
        try:
            response = self.client.embeddings.create(
                model=self.embedding_model,
                input=texts
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            logger.error(f"Embedding creation failed: {str(e)}")
            raise

    async def generate_recommendation(
        self,
        context: str,
        user_query: str,
        history: list[dict] | None = None,
        image_base64: str | None = None,
    ) -> str:
        """Generate personalized skincare recommendation with optional conversation history."""
        try:
            system_prompt = (
                "You are a knowledgeable, concise skincare advisor embedded in a chat UI. "
                "You have deep expertise in cosmetic chemistry and INCI ingredients.\n\n"
                "RESPONSE RULES:\n"
                "- PRODUCT CONTEXT IS AUTHORITATIVE: When products appear in the [CONTEXT] block, "
                "those are the ONLY products to analyse or compare. Always refer to them by their actual product name — never call them 'Product A' or 'Product B'. "
                "Never substitute, carry over, or infer products from earlier conversation turns — the context block always wins.\n"
                "- Greetings or casual messages: 1 short sentence, no unsolicited advice\n"
                "- Skincare questions: 3–5 sentences unless a structured list is clearly better\n"
                "- Comparisons: lead with a direct recommendation, then 2–4 bullet points covering key differences, notable ingredients, and safety concerns\n"
                "- For ordered steps or routines (e.g. morning routine, layering order), use numbered steps: 1. 2. 3.\n"
                "- For non-ordered lists (comparisons, ingredient callouts, tips), use bullet points with -\n"
                "- NEVER use any markdown formatting: no **bold**, no _italic_, no ##headers, no backticks — plain text only, even in lists\n"
                "- Flag any ingredient with safety rating ≥ 7 with ⚠️\n"
                "- Skip filler phrases like 'Great question!' or 'Based on the context provided'\n"
                "- Never repeat back what the user just said\n\n"
                "INGREDIENT KNOWLEDGE:\n"
                "- The context block lists notable ingredients with safety ratings from our database. "
                "For any ingredient NOT listed, draw on your own cosmetic chemistry knowledge "
                "to assess its safety, function, and skin compatibility.\n"
                "- When the user asks what their suspect ingredients are, what they do, or why they appeared — "
                "cover each one concisely: its primary skincare function (e.g. fragrance, emollient, preservative, "
                "exfoliant, essential oil) and why it may trigger reactions or irritation. "
                "Use the SUSPECT INGREDIENT DETAILS block as a starting point, then fill in gaps with your own "
                "cosmetic chemistry knowledge. Keep each ingredient to 1–2 sentences. "
                "Always end the reply with a short personalised advice paragraph (2–3 sentences) that tells the user "
                "what they can do next — e.g. which ingredient to prioritise avoiding, how to patch test, or how to "
                "find safer alternatives — tailored to their skin type and goals.\n"
                "- When a product contains an ingredient from the user's avoid list or suspect list, "
                "always mention it even if the user did not ask.\n"
                "- Comedogenic, sensitizing, or high-irritant ingredients should be called out "
                "by name with a brief plain-English explanation of why they matter for the user's skin type.\n\n"
                "AVOID LIST ACTION — THIS IS MANDATORY:\n"
                "Whenever your reply recommends specific ingredients the user should avoid, you MUST append "
                "the following tag on its own line at the very end of your reply:\n"
                "[SUGGEST_AVOID: ingredient1, ingredient2]\n"
                "Rules for this tag:\n"
                "- Always use lowercase INCI names\n"
                "- Only include ingredients you are actively recommending they avoid — not every ingredient you mention\n"
                "- Exclude ingredients already on their avoid list\n"
                "- Do NOT ask for permission in your text — the UI handles the confirmation automatically\n"
                "- If the user's question is specifically about what to avoid (e.g. 'what should I avoid', "
                "'what ingredients are bad for my skin'), you MUST include this tag — no exceptions\n\n"
                "WHEN NO PRODUCTS ARE PINNED:\n"
                "- The user's shelf is listed in the context under 'Products on shelf'. "
                "Use it to answer questions about their routine, product combinations, or shelf-wide concerns — "
                "draw on your own knowledge of those products' typical formulas.\n"
                "- When recommending a product type or category, never suggest products already on the user's shelf. "
                "If you mention a shelf product, frame it as something they already own, not a new recommendation.\n"
                "- If suspects or avoid-list ingredients are present, check whether any shelf products are known "
                "to contain them and flag it.\n"
                "- For questions like 'build me a routine' or 'what order should I use these', "
                "reference the actual shelf products by name and give a practical, ordered answer. "
                "Clearly distinguish between products that ARE on the shelf and any gaps you are suggesting they add — "
                "never imply a product is on their shelf if it is not listed.\n\n"
                "WHEN A PRODUCT HAS NO DATABASE MATCH (inline/scanned product):\n"
                "- If a proper ingredient list is provided, analyse it fully using your own cosmetic chemistry "
                "knowledge — identify key actives, flag known irritants, sensitizers, or comedogenic ingredients "
                "for the user's skin type, and cross-check against their avoid list and suspect ingredients.\n"
                "- If the ingredient text looks like OCR output from a front label (brand name, product line, "
                "size, no INCI names), try to identify the product from that text using your training knowledge. "
                "If you can identify it, answer based on what you know about that product's typical formula.\n"
                "- If you cannot identify the product from the available text, ask the user: "
                "'I wasn't able to identify this product from the image. Could you tell me the product name, "
                "or take a photo of the ingredients list on the back of the packaging?'\n"
                "- Never say 'I don't have data on this product' without first attempting to identify it."
            )
            messages: list[dict] = [{"role": "system", "content": system_prompt}]
            # RAG context injected as a second system block so it doesn't get pushed out by long histories
            if context:
                messages.append({"role": "system", "content": f"[CONTEXT]\n{context}"})
            # Replay conversation history (capped upstream at 8 messages)
            for msg in (history or []):
                messages.append({"role": msg["role"], "content": msg["content"]})
            # Current user turn — include image as vision input if provided
            if image_base64:
                messages.append({"role": "user", "content": [
                    {"type": "text", "text": user_query},
                    {"type": "image_url", "image_url": {"url": image_base64, "detail": "low"}},
                ]})
            else:
                messages.append({"role": "user", "content": user_query})

            response = self.client.chat.completions.create(
                model=self.chat_model,
                messages=messages,
                max_tokens=500,
                temperature=0.4,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Recommendation generation failed: {str(e)}")
            raise

# Global service instance
openai_service: OpenAIService = None

def get_openai_service() -> OpenAIService:
    """Get OpenAI service instance (Dependency Injection)"""
    global openai_service
    if openai_service is None:
        openai_service = OpenAIService()
        logger.info("OpenAI service initialized")
    return openai_service