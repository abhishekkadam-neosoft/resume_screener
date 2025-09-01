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
const preferredSkills = document.getElementById('preferredSkills');
const dzEmpty = document.querySelector('.dz-empty');

// --- Config ---
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// --- Local store of files ---
let fileStore = [];
const fileKey = (f) => `${f.name.toLowerCase()}_${f.size}_${f.lastModified || 0}`;

// --- Helpers ---
function showOverlay(show) { overlay.classList.toggle('hidden', !show); }
function toastMsg(msg, ms = 2500) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), ms);
}

function syncInputFromStore() {
  const dt = new DataTransfer();
  fileStore.forEach(f => dt.items.add(f));
  filesInput.files = dt.files;
}

function refreshList() {
  fileList.innerHTML = '';

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

  // 👇 toggle placeholder
  if (dzEmpty) {
    dzEmpty.style.display = fileStore.length > 0 ? 'none' : 'flex';
  }
}

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
    addFiles(e.target.files);
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
  const skills = preferredSkills.value.trim();

  const formData = new FormData();
  fileStore.forEach(f => formData.append('files', f));
  formData.append('jd_text', jd);
  formData.append('preferred_skills', skills);

  try {
    showOverlay(true);
    statusEl.textContent = 'Uploading and processing…';
    const res = await fetch('/api/screen', { 
      method: 'POST', 
      body: formData, 
      credentials: 'same-origin' 
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed: ${res.status}`);
    }

    const rows = await res.json();
    statusEl.textContent = `Received ${rows.length} results.`;

    rows.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      const td = (t) => { const c = document.createElement('td'); c.textContent = t; return c; };
      tr.appendChild(td(r.file || ''));
      tr.appendChild(td(r.candidate_name || ''));
      tr.appendChild(td(r.final_score ?? ''));
      tr.appendChild(td(String(r.hard_filter_pass ?? '')));
      tr.appendChild(td(r.explanation || ''));
      tr.appendChild(td((r.top_reasons || []).join(' | ')));

      const selectTd = document.createElement('td');
      selectTd.innerHTML = `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" class="manual_selection" data-index="${idx}">
          <span>Selected</span>
        </label>
        <input type="text" class="manual_reason" placeholder="Reason (if selected)" disabled
               style="margin-top:6px;width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;">
      `;
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
