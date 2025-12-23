from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from enum import Enum

class FieldType(str, Enum):
    TEXT = "text"
    EMAIL = "email"
    PHONE = "tel"
    PASSWORD = "password"
    TEXTAREA = "textarea"

class ValidationRequest(BaseModel):
    fields: Dict[str, Any] = Field(..., description="Field names and their values")
    field_types: Dict[str, FieldType] = Field(..., description="Field names and their types")
    
class ValidationResult(BaseModel):
    normalized: Optional[str] = Field(None, description="Normalized value")
    valid: bool = Field(..., description="Whether the value is valid")
    confidence: Optional[float] = Field(None, description="Confidence score (0-1)")
    reason: Optional[str] = Field(None, description="Error reason if invalid")
    suggestions: Optional[List[str]] = Field(None, description="Suggested corrections")

class ValidationResponse(BaseModel):
    results: Dict[str, ValidationResult] = Field(..., description="Validation results by field name")
    all_valid: bool = Field(..., description="Whether all fields are valid")
    invalid_count: int = Field(..., description="Number of invalid fields")

class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize")
    voice: Optional[str] = Field("alloy", description="Voice to use")
    speed: Optional[float] = Field(1.0, description="Speech speed (0.25-4.0)")

class TTSResponse(BaseModel):
    audio_data: str = Field(..., description="Base64 encoded audio data")
    format: str = Field("mp3", description="Audio format")

class TranscriptionResponse(BaseModel):
    text: str = Field(..., description="Transcribed text")
    confidence: Optional[float] = Field(None, description="Transcription confidence")
    language: Optional[str] = Field(None, description="Detected language")

class HealthResponse(BaseModel):
    status: str = Field("healthy", description="Service health status")
    version: str = Field("1.0.0", description="API version")
    models: Dict[str, bool] = Field(..., description="Model availability status")