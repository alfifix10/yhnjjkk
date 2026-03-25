import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    RAPIDAPI_KEY: str = os.getenv("RAPIDAPI_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    UPDATE_INTERVAL_MINUTES: int = int(os.getenv("UPDATE_INTERVAL_MINUTES", "60"))


settings = Settings()
