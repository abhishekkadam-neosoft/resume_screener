# Resume Screener (LLM)

A web-based application for automated resume screening using LLMs (Large Language Models). Upload resumes (PDF/DOCX), paste a job description, and get ranked candidate results with explanations and manual selection support.

## Features
- Upload up to 5 resumes (PDF/DOCX)
- Paste job description (JD)
- Automated extraction and scoring of resumes using LLM
- Results table with candidate details, scores, top reasons, and manual selection
- Save manual selections with reasons
- Modern UI with drag-and-drop, file list, and status feedback

## Project Structure

```
POC_CV_Screen_UI (copy)/
├── requirements.txt         # Python dependencies
├── test_db.py              # Script to test MySQL DB connection
├── .env                    # Environment variables (API keys, DB config)
├── .gitignore              # Files/folders ignored by git
├── api/
│   ├── app.py              # FastAPI backend (main API endpoints)
│   └── db.py               # Database connection helpers
├── src/
│   └──  main.py             # Resume extraction and scoring logic
│   
├── web/
│   ├── index.html          # Main frontend HTML
│   ├── script.js           # Frontend JS (UI logic, API calls)
│   └── styles.css          # Frontend CSS (UI styling)
```

## Main Files & Functions

### `api/app.py`
- **FastAPI app** with endpoints:
  - `/api/screen`: Accepts resumes and JD, extracts text, scores candidates, returns ranked results.
  - `/api/selections/batch`: Saves manual selection decisions for candidates.
  - `/api/health`: Health check endpoint.
- **Startup**: Initializes DB connection.
- **StaticFiles**: Serves frontend from `web/`.

### `api/db.py`
- **get_conn()**: Returns a MySQL DB connection using env variables.
- **init_db()**: Initializes DB tables if needed.

### `src/main.py`
- **extract_pdf_text(data, ...)**: Extracts text from PDF, uses OCR if needed.
- **extract_docx_text(data)**: Extracts text from DOCX files.
- **score_resume(model, jd_text, resume_text)**: Uses LLM to score resume against JD, returns candidate details and scores.
- **_truncate(text, max_chars)**: Truncates text to max length for LLM input.
- **run()**: Standalone batch scoring utility (not used by web app).

### `web/index.html`
- Main UI layout: drag-and-drop, file list, JD textarea, results table, manual selection, save button.

### `web/script.js`
- **UI logic**: Handles file upload, drag-and-drop, JD input, running screening, displaying results, manual selection, saving picks.
- **API calls**: Communicates with backend endpoints for screening and saving selections.
- **Helpers**: Overlay, toast messages, file list refresh, etc.

### `web/styles.css`
- Modern, responsive styling for all UI components.

### `test_db.py`
- Simple script to test MySQL DB connection using env variables.

## Setup & Usage
1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Set up `.env` with your DB and API keys.
3. Start backend:
   ```bash
   uvicorn api.app:app --reload
   ```
4. Open `web/index.html` in your browser (served by FastAPI).

## Notes
- Requires a running MySQL database and valid LLM API key (GROQ_API_KEY).
- All sensitive files (e.g., `.env`, resumes, cache) are ignored by git via `.gitignore`.
- For troubleshooting, see `test_db.py` for DB connection testing.

---
Feel free to customize or extend the project for your workflow!
