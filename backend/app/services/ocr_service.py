from abc import ABC, abstractmethod
from typing import List, Dict
import re
import logging

logger = logging.getLogger(__name__)

class OCRProvider(ABC):
    """Abstract base class for OCR providers"""

    @abstractmethod
    def extract_text(self, image_path: str) -> str:
        pass

    @abstractmethod
    def extract_with_confidence(self, image_path: str) -> List[Dict]:
        pass

class GoogleVisionProvider(OCRProvider):
    """Google Cloud Vision OCR using Application Default Credentials (ADC).

    Local dev setup (one-time):
        gcloud auth application-default login
    """

    def __init__(self, api_key: str = ""):
        try:
            from google.cloud import vision
        except ImportError:
            raise ImportError("google-cloud-vision not installed. Run: pip install google-cloud-vision")

        # ADC: picks up ~/.config/gcloud/application_default_credentials.json
        # set via: gcloud auth application-default login
        self.client = vision.ImageAnnotatorClient()
        self._vision = vision
        logger.info("Google Cloud Vision initialized via ADC")

    def extract_text(self, image_path: str) -> str:
        with open(image_path, "rb") as f:
            content = f.read()
        image = self._vision.Image(content=content)
        response = self.client.text_detection(image=image)
        if response.error.message:
            raise RuntimeError(f"Google Vision error: {response.error.message}")
        annotations = response.text_annotations
        if not annotations:
            return ""
        # First annotation is the full document text, already in reading order
        return annotations[0].description.replace("\n", " ")

    def extract_with_confidence(self, image_path: str) -> List[Dict]:
        with open(image_path, "rb") as f:
            content = f.read()
        image = self._vision.Image(content=content)
        response = self.client.text_detection(image=image)
        if response.error.message:
            raise RuntimeError(f"Google Vision error: {response.error.message}")
        # Skip index 0 (full-page annotation), return individual word blocks
        return [
            {
                "text": a.description,
                "confidence": 1.0,  # Vision API doesn't return per-word confidence
                "bbox": [[v.x, v.y] for v in a.bounding_poly.vertices],
            }
            for a in response.text_annotations[1:]
        ]

class OCRService:
    def __init__(self):
        self.provider_name = "google_vision"
        self.provider = GoogleVisionProvider()

    def extract_ingredients(self, image_path: str) -> Dict:
        """Extract and clean ingredient text for skincare products"""
        try:
            raw_text = self.provider.extract_text(image_path)
            cleaned_text = self._clean_ingredient_text(raw_text)
            ingredient_list = self._parse_ingredients(cleaned_text)
            return {
                "raw_text": raw_text,
                "cleaned_text": cleaned_text,
                "ingredients": ingredient_list,
                "confidence_data": [],
                "provider": self.provider_name,
            }
        except Exception as e:
            logger.error(f"OCR extraction failed: {str(e)}")
            raise

    def _clean_ingredient_text(self, text: str) -> str:
        """Clean OCR text for ingredient parsing."""
        # Collapse whitespace
        text = re.sub(r'\s+', ' ', text).strip()

        # ── 1. Rejoin hyphenated line-breaks (e.g. "chrysan- themum" → "chrysanthemum") ──
        text = re.sub(r'-\s+', '', text)

        # ── 2. Find the ingredients heading and discard everything before it ──
        # Handles: "Ingredients:", "INGREDIENTS/INGRÉDIENTS:", bilingual slash variants,
        # "2021500 - INGREDIENTS:", trilingual "ΣΥΣΤΑΤΙΚΑ - INGREDIENTS - INGRÉDIENTS:", etc.
        heading_pattern = r'ingr[^\s,:/]{2,12}\s*(?:[/\-]\s*ingr[^\s,:/]{2,12}\s*)?(?:[\-:/]\s*)+'
        match = re.search(heading_pattern, text, re.IGNORECASE)
        if match:
            text = text[match.end():]
            # A trilingual label (e.g. "INGREDIENTS - INGRÉDIENTS:") can leave the
            # second-language header word at the start after the first strip.
            match2 = re.match(heading_pattern, text, re.IGNORECASE)
            if match2:
                text = text[match2.end():]

        # ── 3. Strip leftover leading punctuation ──
        text = re.sub(r'^[\s\-/:|,]+', '', text).strip()

        # ── 4. Remove inline barcode digit sequences ──
        # Barcodes appear as runs of digits/spaces mid-text when label columns overlap
        text = re.sub(r'\b\d[\d\s]{4,}\d\b', ' ', text)

        # ── 5. Strip trailing non-ingredient content ──
        # Company address, lot codes, phone numbers, URLs, watermarks
        # Triggered by keywords that never appear in INCI lists
        tail_triggers = [
            r'\b(?:ltd|llc|inc|corp|gmbh|s\.?a\.?s?)\b',  # legal entity suffixes
            r'\bmade\s+in\b',                               # "made in usa"
            r'\bwww\.',                                     # URLs
            r'\brue\s+de\b',                                # street addresses (FR)
            r'\bnewton\b',                                   # city names common on labels
            # Marketing/disclaimer prose that follows the ingredient list.
            # Sentences beginning with these verbs/articles are never INCI names.
            # Match after any punctuation/space — not just a comma — because the
            # last ingredient may end with a period (e.g. "caprylyl glycol. This formula...")
            r'(?<![a-z\d])(?:this\s+(?:formula|product|cream|serum|lotion|gel|toner|oil)\b'
            r'|for\s+best\s+results\b'
            r'|apply\b'
            r'|developed\s+(?:with|by)\b'
            r'|dermatologically\b'
            r'|ophthalmologically\b'
            r'|clinically\b'
            r'|(?:may\s+contain|contains\s+traces)\b'
            r'|suitable\s+for\b'
            r'|formula\s+(?:is|contains|free)\b)',
        ]
        for trigger in tail_triggers:
            m = re.search(trigger, text, re.IGNORECASE)
            if m:
                # Walk back to the last comma before the trigger to preserve
                # any ingredient that happens to precede it on the same token
                before = text[:m.start()].rstrip(' ,')
                text = before
                break

        # ── 6. Strip remaining known noise patterns ──
        text = re.sub(r'\[?code\s+f\.?i\.?l\.?[^\]]*\]?', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b', '', text)  # phone numbers
        text = re.sub(r',?\s*\w*gredients?\s*:?\s*$', '', text, flags=re.IGNORECASE)  # seam remnant

        # ── 7. Collapse whitespace ──
        text = re.sub(r'\s+', ' ', text).strip().rstrip(',').strip()

        return text.lower()

    def _parse_ingredients(self, text: str) -> List[str]:
        """Parse cleaned ingredient text into individual ingredients."""
        if not text:
            return []

        # Protect digit,digit patterns (e.g. "1,2-hexanediol", "2,2-dimethylhydrocinnamal")
        # before splitting — these commas are part of the INCI name, not list separators.
        text = re.sub(r'(\d),(\d)', r'\1¬\2', text)  # temporarily replace with ¬

        # Split on comma or semicolon — NOT slash (aqua/water/eau is one INCI entry)
        parts = re.split(r'[,;]\s*', text)

        cleaned = []
        for part in parts:
            part = part.strip().lower()
            # Remove parenthetical annotations e.g. (nano), (and)
            part = re.sub(r'\([^)]*\)', '', part).strip()
            # Skip empty, very short, or purely numeric/punctuation tokens
            if not part or len(part) < 3:
                continue
            if re.fullmatch(r'[\d\s\-/®©]+', part):
                continue
            cleaned.append(part.replace('¬', ','))  # restore digit,digit commas

        return cleaned


_ocr_service_instance: OCRService = None

def get_ocr_service() -> OCRService:
    global _ocr_service_instance
    if _ocr_service_instance is None:
        _ocr_service_instance = OCRService()
        logger.info("OCR service initialized with Google Cloud Vision")
    return _ocr_service_instance
