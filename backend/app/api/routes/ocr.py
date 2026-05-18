
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
import tempfile
import os
import logging
from ...models.ocr_models import OCRResponse
from ...services.ocr_service import OCRService, get_ocr_service

router = APIRouter(prefix="/ocr", tags=["ocr"])

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}


@router.post("/extract", response_model=OCRResponse)
async def extract_ingredients(
    file: UploadFile = File(...),
    ocr_service: OCRService = Depends(get_ocr_service)
) -> OCRResponse:
    """Extract ingredients from uploaded image"""

    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES | {'application/octet-stream'}:
        raise HTTPException(status_code=400, detail="File must be a JPEG, PNG, WebP, or HEIC image")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB")

    suffix = os.path.splitext(file.filename or "upload")[1].lower() or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_file.write(content)
        tmp_file_path = tmp_file.name

    try:
        result = ocr_service.extract_ingredients(tmp_file_path)
        return OCRResponse(**result)

    except Exception:
        logger.exception("OCR extraction failed for file: %s", file.filename)
        raise HTTPException(status_code=500, detail="OCR extraction failed. Please try a clearer image.")

    finally:
        if os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)

@router.get("/health")
async def ocr_health(ocr_service: OCRService = Depends(get_ocr_service)):
    """Check OCR service health"""
    return {
        "status": "healthy", 
        "provider": ocr_service.provider_name
    }