from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import Settings
from .api.routes import ocr, profile, products, shelf, insights, notifications
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)

settings = Settings()

app = FastAPI(title="InciSight AI", version="1.0.0")

# CORS middleware
_cors_methods = ["GET", "POST", "PATCH", "DELETE"] if settings.environment == "production" else ["*"]
_cors_headers = ["Authorization", "Content-Type"] if settings.environment == "production" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=_cors_methods,
    allow_headers=_cors_headers,
)

# Include routers
app.include_router(ocr.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(shelf.router, prefix="/api")
app.include_router(insights.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "InciSight AI API", "ocr_provider": settings.ocr_provider}

@app.get("/health")
async def health():
    return {"status": "healthy"}