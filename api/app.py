import os
import io
import json
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from fastapi import Body
from fastapi.responses import JSONResponse
import mysql.connector

from api.db import get_connection  # import from db.py

# Reuse extraction and scoring from src
from src.main import (
	extract_pdf_text,
	extract_docx_text,
	score_resume,
	_truncate,
)

# Backend constants
MODEL_NAME = "llama-3.3-70b-versatile" #when using groq api
# MODEL_NAME = "deepseek-r1:8b" #when using ollama Deepseek-R1
MAX_EXTRACT = 10
MAX_SCORE = 10
OCR_LANG = "eng"
LOW_CHAR_THRESHOLD = 200

app = FastAPI(title="Resume Screener API")


@app.get("/api/health")
def health() -> Dict[str, str]:
	return {"status": "ok"}


@app.post("/api/screen")
async def screen(files: List[UploadFile] = File(...), jd_text: str = Form(...),preferred_skills: str = Form("")) -> JSONResponse:
    if not os.environ.get("GROQ_API_KEY"):
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set on server")
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if not jd_text.strip():
        raise HTTPException(status_code=400, detail="JD text is required")

    texts: List[Dict[str, Any]] = []
    for f in files[: MAX_EXTRACT]:
        name = f.filename or "resume"
        data = await f.read()
        try:
            if name.lower().endswith(".pdf"):
                text = extract_pdf_text(data, ocr_on_demand=True, lang=OCR_LANG, low_char_threshold=int(LOW_CHAR_THRESHOLD))
            elif name.lower().endswith(".docx"):
                text = extract_docx_text(data)
            else:
                continue
            texts.append({"file": name, "text": text})
        except Exception:
            continue

    if not texts:
        raise HTTPException(status_code=400, detail="No valid resumes extracted")

    rows: List[Dict[str, Any]] = []
    jd_t = _truncate(jd_text)

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    for item in texts[: MAX_SCORE]:
        fname = item["file"]
        res_text = _truncate(item["text"])
        # Inject preferred skills into JD context 👇
        jd_with_skills = jd_t
        if preferred_skills.strip():
            jd_with_skills += f"\n\n[Preferred Skills / Tech Stacks]: {preferred_skills}"
    
        rec = score_resume(MODEL_NAME, jd_with_skills, res_text)

        rec["file"] = fname
        rec["resume_text"] = res_text

        # Insert into DB
        insert_query = """
            INSERT INTO screening_results
            (jd_text, preferred_skills, file_name, candidate_name, resume_text,
            final_score, hard_filter_pass, explanation, top_reasons, risks)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """
        cursor.execute(insert_query, (
            jd_text,
            preferred_skills,
            rec.get("file"),
            rec.get("candidate_name"),
            res_text,
            rec.get("final_score"),
            rec.get("hard_filter_pass"),
            rec.get("explanation"),
            "|".join(rec.get("top_reasons", [])),
            "|".join(rec.get("risks", []))
        ))
        rec["id"] = cursor.lastrowid  # return row id to frontend
        rows.append(rec)

    conn.commit()
    cursor.close()
    conn.close()

    rows.sort(key=lambda r: r.get("final_score", 0), reverse=True)
    return JSONResponse(content=rows)




@app.post("/api/save_selection")
async def save_selection(payload: List[Dict[str, Any]] = Body(...)):
    try:
        conn = get_connection()
        cursor = conn.cursor()

        for row in payload:
            update_query = """
                UPDATE screening_results
                SET manually_selected = %s, manual_reason = %s
                WHERE id = %s
            """
            cursor.execute(update_query, (
                row.get("manually_selected", False),
                row.get("manual_reason"),
                row.get("id")   # must come from /api/screen response
            ))

        conn.commit()
        cursor.close()
        conn.close()
        return JSONResponse({"status": "ok"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
	
# Serve frontend
app.mount("/", StaticFiles(directory="web", html=True), name="web")