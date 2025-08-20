// --- DOM ---
const dropzone = document.getElementById('dropzone');
const pickBtn = document.getElementById('pickBtn');
const filesInput = document.getElementById('files');
const fileList = document.getElementById('fileList');
const jdInput = document.getElementById('jd');
const runBtn = document.getElementById('runBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const table = document.getElementById('results');
const tbody = table.querySelector('tbody');
const overlay = document.getElementById('overlay');
const toast = document.getElementById('toast');

// --- Config ---
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// --- Local store of files (single source of truth) ---
let fileStore = []; // Array<File>

// Helpful: stable key for duplicates
const fileKey = (f) => `${f.name.toLowerCase()}_${f.size}_${f.lastModified || 0}`;

// --- Helpers ---
function showOverlay(show) { overlay.classList.toggle('hidden', !show); }
function toastMsg(msg, ms = 2500) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), ms);
}

// Push fileStore -> input.files
function syncInputFromStore() {
  const dt = new DataTransfer();
  fileStore.forEach(f => dt.items.add(f));
  filesInput.files = dt.files;
}

// UI list
function refreshList() {
  fileList.innerHTML = '';

  // Toggle empty-state UI inside dropzone (if present)
  const empty = document.querySelector('.dz-empty');
  if (empty) empty.style.display = fileStore.length ? 'none' : 'flex';

  fileStore.forEach((file, i) => {
    const li = document.createElement('li');
    li.textContent = file.name;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✖';
    removeBtn.className = 'remove-btn';
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', () => removeFileAtIndex(i));

    li.appendChild(removeBtn);
    fileList.appendChild(li);
  });
}

// Add new files into store (no duplicates, size limit)
function addFiles(newFiles) {
  const keys = new Set(fileStore.map(fileKey));
  Array.from(newFiles).forEach(f => {
    const k = fileKey(f);
    if (keys.has(k)) {
      toastMsg(`Skipped duplicate: ${f.name}`);
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      toastMsg(`Skipped ${f.name} (too large)`);
      return;
    }
    fileStore.push(f);
    keys.add(k);
  });

  syncInputFromStore();
  refreshList();
}

// Remove one file
function removeFileAtIndex(index) {
  fileStore.splice(index, 1);
  syncInputFromStore();
  refreshList();
}

// --- Drag & Drop ---
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const items = Array.from(e.dataTransfer.files).filter(f => /\.(pdf|docx)$/i.test(f.name));
  if (!items.length) { toastMsg('Only PDF/DOCX allowed'); return; }
  addFiles(items);
});

// --- Browse ---
pickBtn.addEventListener('click', () => filesInput.click());
filesInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length) {
    // IMPORTANT: add to our store (do not read from filesInput here)
    addFiles(e.target.files);
    // Allow picking same file again later
    e.target.value = '';
  }
});

// --- Clear ---
clearBtn.addEventListener('click', () => {
  fileStore = [];
  syncInputFromStore();
  refreshList();
  jdInput.value = '';
  statusEl.textContent = '';
  tbody.innerHTML = '';
  table.classList.add('hidden');
});

// --- Run Screening ---
runBtn.addEventListener('click', async () => {
  statusEl.textContent = '';
  tbody.innerHTML = '';
  table.classList.add('hidden');

  if (!fileStore.length) { toastMsg('Please add at least one resume'); return; }
  const jd = jdInput.value.trim();
  if (!jd) { toastMsg('Please paste the Job Description'); return; }

  const formData = new FormData();
  fileStore.forEach(f => formData.append('files', f));
  formData.append('jd_text', jd);

  try {
    showOverlay(true);
    statusEl.textContent = 'Uploading and processing…';
    const res = await fetch('/api/screen', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed: ${res.status}`);
    }
    const rows = await res.json();
    statusEl.textContent = `Received ${rows.length} results.`;

    rows.forEach((r, idx) => {
      const tr = document.createElement('tr');
      const td = (t) => { const c = document.createElement('td'); c.textContent = t; return c; };

      tr.appendChild(td(r.file || ''));
      tr.appendChild(td(r.candidate_name || ''));
      tr.appendChild(td(r.final_score ?? ''));
      tr.appendChild(td(String(r.hard_filter_pass ?? '')));
      tr.appendChild(td(r.explanation || ''));
      tr.appendChild(td((r.top_reasons || []).join(' | ')));

      // --- New: Manual Selection UI ---
      const selectTd = document.createElement('td');
selectTd.innerHTML = `
  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
    <input type="checkbox" class="manual_selection" data-index="${idx}">
    <span>Selected</span>
  </label>
  <input type="text" class="manual_reason" placeholder="Reason (if selected)" disabled
         style="margin-top:6px;width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;">
`;

// enable/disable reason box
const checkbox = selectTd.querySelector(".manual_selection");
const reason = selectTd.querySelector(".manual_reason");
checkbox.addEventListener("change", () => {
  reason.disabled = !checkbox.checked;
});

tr.appendChild(selectTd);


      tbody.appendChild(tr);
    });
    table.classList.remove('hidden');
  } catch (err) {
    statusEl.textContent = '';
    toastMsg(`Error: ${err.message}`);
  } finally {
    showOverlay(false);
  }
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const rowsData = [];
  const trs = tbody.querySelectorAll('tr');

  trs.forEach((tr) => {
    const checkbox = tr.querySelector('.manual_selection');
    const reason = tr.querySelector('.manual_reason');
    const cols = tr.querySelectorAll('td');

    rowsData.push({
      file: cols[0].textContent,
      candidate_name: cols[1].textContent,
      final_score: parseFloat(cols[2].textContent) || 0,
      hard_filter_pass: cols[3].textContent === "true",
      explanation: cols[4].textContent,
      top_reasons: cols[5].textContent.split(" | "),
      manually_selected: checkbox.checked,
      manual_reason: checkbox.checked ? reason.value : null
    });
  });

  try {
    const res = await fetch('/api/save_selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rowsData)
    });
    if (!res.ok) throw new Error("Failed to save");
    toastMsg("Selections saved!");
  } catch (err) {
    toastMsg("Error saving selections: " + err.message);
  }
});



async function saveSelections() {
  const selections = [];

  document.querySelectorAll("#results tbody tr").forEach(row => {
    const selection = {
      file: row.querySelector("td:nth-child(1)")?.innerText,
      candidate_name: row.querySelector("td:nth-child(2)")?.innerText,
      final_score: parseFloat(row.querySelector("td:nth-child(3)")?.innerText) || null,
      hard_filter_pass: row.querySelector("td:nth-child(4)")?.innerText === "Yes",
      explanation: row.querySelector("td:nth-child(5)")?.innerText,
      top_reasons: row.querySelector("td:nth-child(6)")?.innerText.split("|"),
      manually_selected: row.querySelector(".manual-select")?.checked || false,
      manual_reason: row.querySelector(".manual-reason")?.value || null
    };
    selections.push(selection);
  });

  const res = await fetch("/api/save_selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selections),   // 👈 send array, not object
  });

  const data = await res.json();
  console.log("Save response:", data);
}

async function loadSelections() {
  const res = await fetch("/api/get_selections");
  const data = await res.json();

  if (!data.selections) return;

  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = "";

  data.selections.forEach(sel => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sel.file}</td>
      <td>${sel.candidate_name}</td>
      <td>${sel.final_score ?? ""}</td>
      <td>${sel.hard_filter_pass ? "Yes" : "No"}</td>
      <td>${sel.explanation ?? ""}</td>
      <td>${sel.top_reasons.join(" | ")}</td>
      <td><input type="checkbox" class="manual-select" ${sel.manually_selected ? "checked" : ""}></td>
      <td><input type="text" class="manual-reason" value="${sel.manual_reason ?? ""}"></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelector("#results").classList.remove("hidden");
}
