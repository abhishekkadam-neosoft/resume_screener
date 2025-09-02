###############################################################
# ✅ IMPORTS
###############################################################
import os
import io
import json
import yaml
import logging
import asyncio
import secrets
from pathlib import Path
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, Body, Request, Depends, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from passlib.context import CryptContext

# ✅ Custom modules
from api.db import get_connection, get_user_by_email  # Database helpers
from src.main import (
    extract_pdf_text,
    extract_docx_text,
    score_resume,
    _truncate,
)

###############################################################
# ✅ LOGGING SETUP
###############################################################
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("resume_screener_api")

###############################################################
# ✅ CONFIGURATION (Load from config.yaml)
###############################################################
CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"
with open(CONFIG_PATH, "r") as f:
    config = yaml.safe_load(f)

# Extract values from config
LLM_BACKEND = config.get("llm_backend", "groq")
MODEL_NAME = config["models"].get(LLM_BACKEND, "llama-3.3-70b-versatile")
OCR_LANG = config.get("ocr_lang", "eng")
LOW_CHAR_THRESHOLD = int(config.get("low_char_threshold", 200))
MAX_EXTRACT = int(config.get("batch_size", 10))
MAX_SCORE = int(config.get("limit", 10))

logger.info(f"Loaded config: {config}")
logger.info(f"Using backend: {LLM_BACKEND}, model: {MODEL_NAME}")

###############################################################
# ✅ FASTAPI APP & SESSION MIDDLEWARE
###############################################################
app = FastAPI(title="Resume Screener API")

SESSION_SECRET = os.environ.get("SESSION_SECRET")

# Add session support for login system
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    session_cookie="session_id",
    https_only=False,
    max_age=60 * 60 * 8,
    path="/"
)

###############################################################
# ✅ PASSWORD HASHING UTILITIES
###############################################################
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    """Hash a plain password using bcrypt."""
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    """Verify if plain password matches the hashed one."""
    return pwd_context.verify(plain, hashed)

###############################################################
# ✅ AUTH HELPERS (Dependencies)
###############################################################
async def auth_required(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user_id": user_id, "email": request.session.get("email")}


async def csrf_protect(request: Request):
    """
    CSRF Protection:
    Requires X-CSRF-Token header for unsafe methods (POST, PUT, DELETE).
    Token is stored in session during login.
    """
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        sent = request.headers.get("X-CSRF-Token")
        expected = request.session.get("csrf_token")
        if not expected or not sent or sent != expected:
            raise HTTPException(status_code=403, detail="CSRF token missing/invalid")

###############################################################
# ✅ AUTH ROUTES
###############################################################
@app.get("/")
async def home(request: Request):
    # If logged in, go to main app
    if request.session.get("user_id"):
        return RedirectResponse("/screen")
    # Else show login page
    return FileResponse("web/login.html")

@app.post("/login")
async def login(request: Request, email: str = Form(...), password: str = Form(...)):
    """
    Authenticate user:
    - Check email & password
    - Rotate session (to prevent fixation attacks)
    - Store user_id, email, and CSRF token in session
    - Redirect to homepage with success indicator
    """
    user = get_user_by_email(email)
    if not user or not verify_password(password, user["password_hash"]):
        return HTMLResponse("<h3>Invalid credentials</h3><a href='/login.html'>Back</a>", status_code=401)

    # Clear old session and set new values
    request.session.clear()
    request.session["user_id"] = int(user["id"])
    request.session["email"] = user["email"]
    request.session["csrf_token"] = secrets.token_urlsafe(32)
    
    # Add a success query parameter to help frontend detect successful login
    return RedirectResponse(url="/screen?login=success", status_code=303)

@app.get("/logout")
async def logout(request: Request):
    """Clear session and redirect to login page."""
    request.session.clear()
    return RedirectResponse(url="/login.html", status_code=303)

@app.get("/api/me")
async def me(user=Depends(auth_required)):
    """API endpoint to return current logged-in user's info."""
    return {"user_id": user["user_id"], "email": user["email"]}

###############################################################
# ✅ ROOT ROUTE (HOME PAGE)
###############################################################
@app.get("/screen")
async def root(request: Request):
    """
    Serve main application page only if user is authenticated.
    Otherwise, redirect to login page.
    """
    if not request.session.get("user_id"):
        return RedirectResponse("/login.html", status_code=303)
    return FileResponse("web/index.html")

###############################################################
# ✅ HEALTH CHECK
###############################################################
@app.get("/api/health")
def health() -> Dict[str, str]:
    """Simple health check endpoint."""
    return {"status": "ok"}

###############################################################
# ✅ MAIN API ROUTE: SCREENING
###############################################################
@app.post("/api/screen")
async def screen(
    request: Request,
    files: List[UploadFile] = File(...), 
    jd_text: str = Form(...),
    preferred_skills: str = Form(""),
    user=Depends(auth_required),
):
    logger.info(f"Received /api/screen request with {len(files)} files and JD length {len(jd_text)}")

    # Validate environment and inputs
    if not os.environ.get("GROQ_API_KEY"):
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set on server")
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if not jd_text.strip():
        raise HTTPException(status_code=400, detail="JD text is required")

    jd_t = _truncate(jd_text)

    ###############################################################
    # ✅ 1. Extract text concurrently
    ###############################################################
    async def extract_text(file: UploadFile):
        name = file.filename or "resume"
        data = await file.read()
        try:
            if name.lower().endswith(".pdf"):
                text = await asyncio.to_thread(
                    extract_pdf_text, data, True, OCR_LANG, LOW_CHAR_THRESHOLD
                )
            elif name.lower().endswith(".docx"):
                text = await asyncio.to_thread(extract_docx_text, data)
            else:
                return None
            return {"file": name, "text": text}
        except Exception as e:
            logger.error(f"Error extracting {name}: {e}")
            return None

    extract_tasks = [extract_text(f) for f in files[:MAX_EXTRACT]]
    texts = [t for t in await asyncio.gather(*extract_tasks) if t]

    if not texts:
        raise HTTPException(status_code=400, detail="No valid resumes extracted")

    ###############################################################
    # ✅ 2. Score resumes concurrently
    ###############################################################
    async def score_resume_async(fname: str, res_text: str):
        jd_with_skills = jd_t
        if preferred_skills.strip():
            jd_with_skills += f"\n\n[Preferred Skills / Tech Stacks]: {preferred_skills}"
        rec = await asyncio.to_thread(score_resume, jd_with_skills, res_text)
        rec["file"] = fname
        rec["resume_text"] = res_text

        if rec.get("final_score", 0) == 0 or not rec.get("candidate_name"):
            rec["warning"] = "Model did not return valid output for this resume."
        return rec

    score_tasks = [
        score_resume_async(item["file"], _truncate(item["text"]))
        for item in texts[:MAX_SCORE]
    ]
    rows = await asyncio.gather(*score_tasks)

    ###############################################################
    # ✅ 3. Insert into DB
    ###############################################################
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    for rec in rows:
        insert_query = """
            INSERT INTO screening_results
            (jd_text, preferred_skills, file_name, candidate_name, resume_text,
             final_score, hard_filter_pass, explanation, top_reasons, risks)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """
        cursor.execute(insert_query, (
            jd_text, preferred_skills, rec["file"], rec.get("candidate_name"),
            rec["resume_text"], rec.get("final_score"), rec.get("hard_filter_pass"),
            rec.get("explanation"), "|".join(rec.get("top_reasons", [])),
            "|".join(rec.get("risks", []))
        ))
        rec["id"] = cursor.lastrowid

    conn.commit()
    cursor.close()
    conn.close()

    rows.sort(key=lambda r: r.get("final_score", 0), reverse=True)
    return JSONResponse(content=rows)

###############################################################
# ✅ SAVE MANUAL SELECTIONS
###############################################################
@app.post("/api/save_selection")
async def save_selection(
    request: Request,
    payload: List[Dict[str, Any]] = Body(...),
    user=Depends(auth_required),
    # _=Depends(csrf_protect),
):
    """
    Save manual selections for candidates into DB.
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()

        for row in payload:
            manually_selected = bool(row.get("manually_selected", False))
            manual_reason = str(row.get("manual_reason", ""))
            row_id = row.get("id")
            if row_id is None:
                continue

            update_query = """
                UPDATE screening_results
                SET manually_selected = %s, manual_reason = %s
                WHERE id = %s
            """
            cursor.execute(update_query, (manually_selected, manual_reason, row_id))

        conn.commit()
        cursor.close()
        conn.close()
        return JSONResponse({"status": "ok"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

###############################################################
# ✅ SERVE STATIC FILES (Frontend)
###############################################################
app.mount("/", StaticFiles(directory="web", html=True), name="web")
