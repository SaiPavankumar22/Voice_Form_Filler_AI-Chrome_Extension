import os
import base64
import logging
from typing import Dict, Any
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAI
from pydantic import ValidationError
import asyncio
from models import (
    ValidationRequest, ValidationResponse, ValidationResult,
    TTSRequest, TTSResponse, TranscriptionResponse, HealthResponse,
    FieldType
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Voice Form Filler API",
    description="Backend API for voice-driven form filling using OpenAI models",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*", "http://localhost:*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Configuration
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-1")
CHATGPT_MODEL = os.getenv("CHATGPT_MODEL", "gpt-4o-mini")
TTS_MODEL = os.getenv("TTS_MODEL", "tts-1")
TTS_VOICE = os.getenv("TTS_VOICE", "alloy")

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    try:
        # Check OpenAI API availability
        models_status = {
            "whisper": False,
            "chatgpt": False,
            "tts": False
        }
        
        # Test OpenAI connection (lightweight check)
        try:
            # This is a lightweight call to check if API key is valid
            client.models.list(limit=1)
            models_status["whisper"] = True
            models_status["chatgpt"] = True
            models_status["tts"] = True
        except Exception as e:
            logger.error(f"OpenAI API check failed: {e}")
        
        return HealthResponse(
            status="healthy" if any(models_status.values()) else "degraded",
            models=models_status
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail="Health check failed")

@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe audio to text using OpenAI Whisper"""
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="Invalid file type. Expected audio file.")
        
        # Read file content
        audio_content = await file.read()
        
        # Create a temporary file-like object
        import io
        audio_file = io.BytesIO(audio_content)
        audio_file.name = file.filename or "audio.webm"
        
        # Transcribe using Whisper
        logger.info(f"Transcribing audio file: {file.filename}")
        response = client.audio.transcriptions.create(
            model=WHISPER_MODEL,
            file=audio_file,
            response_format="text"
        )
        
        # Extract text from response
        transcribed_text = response.strip() if isinstance(response, str) else response.text.strip()
        
        logger.info(f"Transcription completed: {transcribed_text[:50]}...")
        
        return TranscriptionResponse(
            text=transcribed_text,
            confidence=0.95,  # Whisper doesn't provide confidence scores
            language="en"  # Assuming English for now
        )
        
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@app.post("/validate", response_model=ValidationResponse)
async def validate_fields(request: ValidationRequest):
    """Validate and normalize form field values using OpenAI GPT"""
    try:
        logger.info(f"Validating {len(request.fields)} fields")
        
        # Prepare validation prompt
        field_descriptions = []
        for field_name, field_value in request.fields.items():
            field_type = request.field_types.get(field_name, FieldType.TEXT)
            field_descriptions.append(f"- {field_name} ({field_type.value}): \"{field_value}\"")
        
        fields_text = "\n".join(field_descriptions)
        
        validation_prompt = f"""You are a form validation assistant. Your task is to validate and normalize form field values based on their types.

Here are the field values to validate:
{fields_text}

For each field, you must:
1. Normalize common spoken words (e.g., "dot" → ".", "at" → "@", "dash" → "-")
2. Validate according to field type rules
3. Return structured JSON with validation results

Validation Rules:
- email: Must contain @ and valid domain format
- tel: Should contain sufficient digits (minimum 10 for US numbers)
- text: General text, normalize spacing and common words
- password: Accept any value, just normalize spoken characters

Return JSON in this exact format:
{{
  "field_name": {{
    "normalized": "normalized_value",
    "valid": true/false,
    "confidence": 0.95,
    "reason": "error_message_if_invalid",
    "suggestions": ["suggestion1", "suggestion2"]
  }}
}}

Important:
- Return ONLY the JSON, no additional text
- All field names must match exactly
- Use null for optional fields that aren't needed
- Confidence should be between 0 and 1
"""

        # Call OpenAI GPT for validation
        response = client.chat.completions.create(
            model=CHATGPT_MODEL,
            messages=[
                {"role": "system", "content": "You are a form validation assistant that returns only JSON responses."},
                {"role": "user", "content": validation_prompt}
            ],
            temperature=0.1,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )
        
        # Parse the response
        validation_json = response.choices[0].message.content
        logger.info(f"Raw validation response: {validation_json}")
        
        # Parse JSON response
        import json
        try:
            validation_data = json.loads(validation_json)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse validation JSON: {e}")
            logger.error(f"Raw response: {validation_json}")
            raise HTTPException(status_code=500, detail="Invalid validation response format")
        
        # Convert to ValidationResponse format
        results = {}
        all_valid = True
        invalid_count = 0
        
        for field_name, field_data in validation_data.items():
            # Handle nested structure if present
            if isinstance(field_data, dict) and 'normalized' in field_data:
                result = ValidationResult(
                    normalized=field_data.get('normalized'),
                    valid=field_data.get('valid', False),
                    confidence=field_data.get('confidence'),
                    reason=field_data.get('reason'),
                    suggestions=field_data.get('suggestions')
                )
            else:
                # Handle direct field data
                result = ValidationResult(
                    normalized=field_data if isinstance(field_data, str) else None,
                    valid=True,  # Assume valid if no validation structure
                    confidence=0.8
                )
            
            results[field_name] = result
            
            if not result.valid:
                all_valid = False
                invalid_count += 1
        
        # Ensure all requested fields are in results
        for field_name in request.fields.keys():
            if field_name not in results:
                # Add missing field with default validation
                results[field_name] = ValidationResult(
                    normalized=request.fields[field_name],
                    valid=True,
                    confidence=0.7
                )
        
        logger.info(f"Validation completed: {invalid_count} invalid fields")
        
        return ValidationResponse(
            results=results,
            all_valid=all_valid,
            invalid_count=invalid_count
        )
        
    except Exception as e:
        logger.error(f"Validation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")

@app.post("/tts", response_model=TTSResponse)
async def text_to_speech(request: TTSRequest):
    """Convert text to speech using OpenAI TTS"""
    try:
        logger.info(f"Generating TTS for text: {request.text[:50]}...")
        
        # Generate speech using OpenAI TTS
        response = client.audio.speech.create(
            model=TTS_MODEL,
            voice=request.voice,
            input=request.text,
            speed=request.speed
        )
        
        # Convert response to bytes and then base64
        audio_content = response.read()
        audio_base64 = base64.b64encode(audio_content).decode('utf-8')
        
        logger.info(f"TTS generated successfully: {len(audio_base64)} bytes")
        
        return TTSResponse(
            audio_data=audio_base64,
            format="mp3"
        )
        
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")

@app.exception_handler(ValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=True
    )