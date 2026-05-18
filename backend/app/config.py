from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    openai_api_key: str = ""
    canopy_api_key: str = ""
    secret_key: str = "dev-secret-key-change-in-production"
    environment: str = "development"
    backend_cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
        case_sensitive = False
        extra = "ignore"

settings = Settings()