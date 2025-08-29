# Resume Screener (LLM)

A full-stack application for automated resume screening using Large Language Models (LLMs). Upload resumes (PDF/DOCX), paste a job description, and get ranked candidate results with explanations and manual selection support.

## Features
- Upload up to 5 resumes (PDF/DOCX)
- Paste job description (JD) and preferred skills
- Automated extraction and scoring of resumes using LLMs (Groq, Ollama, vLLM local)
- Results table with candidate details, scores, top reasons, and manual selection
- Save manual selections with reasons
- Modern UI with drag-and-drop, file list, and status feedback

## Project Structure
```
POC_CV_Screener_Development/
├── requirements.txt         # Python dependencies
├── test_db.py              # Script to test MySQL DB connection
├── .env                    # Environment variables (API keys, DB config)
├── api/
│   ├── app.py              # FastAPI backend (main API endpoints)
│   └── db.py               # Database connection helpers
├── src/
│   └── main.py             # Resume extraction and scoring logic
├── models/
│   └── Qwen3-0.6B/         # Downloaded local LLM model (eg. Qwen3)
├── web/
│   ├── index.html          # Main frontend HTML
│   ├── script.js           # Frontend JS (UI logic, API calls)
│   └── styles.css          # Frontend CSS (UI styling)
├── CVs/                    # Example resumes (PDF/DOCX)
├── download_hf_model.py    # Script to download HuggingFace models
├── README.md               # Project documentation
```

## Setup Instructions

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
2. **Configure environment variables:**
   - Copy `.env.example` to `.env` and set your DB credentials and API keys (GROQ_API_KEY, etc).
3. **Download LLM model (optional for local inference):**
   ```bash
   python download_hf_model.py
   ```
   - This downloads Qwen3-0.6B to `models/Qwen3-0.6B/`.
4. **Start FastAPI backend:**
   ```bash
   uvicorn api.app:app --reload
   ```
5. **Open the web UI:**
   - Open `web/index.html` in your browser, or serve the `web/` folder using any static server.

## Main Components

### Backend (`api/app.py`)
- FastAPI app with endpoints:
  - `/api/screen`: Accepts resumes and JD, extracts text, scores candidates, returns ranked results.
  - `/api/selections/batch`: Saves manual selection decisions for candidates.
  - `/api/health`: Health check endpoint.
- Uses extraction and scoring logic from `src/main.py`.
- Serves frontend from `web/`.

### Resume Extraction & Scoring (`src/main.py`)
- `extract_pdf_text(data, ...)`: Extracts text from PDF, uses OCR if needed.
- `extract_docx_text(data)`: Extracts text from DOCX files.
- `score_resume(...)`: Uses LLM (Groq, Ollama, or vLLM local) to score resume against JD, returns candidate details and scores.
- vLLM local inference supported (see code comments for switching).

### Database (`api/db.py`, `test_db.py`)
- MySQL connection helpers and test script.

### Frontend (`web/`)
- Modern drag-and-drop UI for uploading resumes and entering JD.
- Results table with candidate scores and manual selection.

## Local LLM Inference (vLLM)
- Download supported models to `models/`.
- Use vLLM server for local inference:
  ```bash
  vllm serve models/model-name --enable-reasoning
  ```
- Update scoring logic in `src/main.py` to use vLLM functions.

## Example Usage
1. Upload resumes and paste JD in the web UI.
2. Click "Run Screening" to get ranked results.
3. Optionally, select candidates manually and save your decisions.

## License
- Qwen3-0.6B model: Apache 2.0 (see `models/Qwen3-0.6B/LICENSE`)
- Project code: MIT (unless otherwise specified)

---
For more details, see code comments and each module's README (if present).
