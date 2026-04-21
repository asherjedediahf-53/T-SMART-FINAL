// ─── API CONFIGURATION ────────────────────────────────────────────────────────
const API_BASE = window.location.origin + '/api';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MONTH_NUM = {
  January:'01',February:'02',March:'03',April:'04',
  May:'05',June:'06',July:'07',August:'08',
  September:'09',October:'10',November:'11',December:'12'
};
const MONTH_NAME = ['','January','February','March','April','May','June',
  'July','August','September','October','November','December'];

const CURRENT_YEAR = new Date().getFullYear();
const MIN_BIRTH_YEAR = 1940;   // no realistic employee born before this
const MAX_BIRTH_YEAR = CURRENT_YEAR - 15; // youngest plausible employee

// ─── STATE ────────────────────────────────────────────────────────────────────
let data    = [];
let total   = 0;
let page    = 1;
let perPage = 100;

let activeSortName = 'az';
let activeSortDate = '';
let activeFilters  = {
  division: '', functional_division: '',
  train_from: '', train_to: '', keyword: ''
};

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  try {
    const res  = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const text = await res.text();

    if (text.trimStart().startsWith('<')) {
      console.error('[Arkibo] API returned HTML. Check XAMPP Apache is running and folder is at C:\\xampp\\htdocs\\arkibo-api\\');
      showToast('API not reachable — see F12 Console', 'error');
      throw new Error('HTML_RESPONSE');
    }

    let json;
    try { json = JSON.parse(text); }
    catch (e) { throw new Error('Invalid JSON: ' + text.slice(0, 80)); }

    if (!res.ok) throw new Error(json.error || 'API error');
    return json;

  } catch (err) {
    if (err.message !== 'HTML_RESPONSE') {
      console.error('API Error:', err.message);
      showToast('Error: ' + err.message, 'error');
    }
    throw err;
  }
}

// ─── QUERY BUILDER ────────────────────────────────────────────────────────────
function buildQuery(searchOverride) {
  const search = searchOverride !== undefined
    ? searchOverride
    : (document.getElementById('searchInput')?.value.trim() || '');

  const params = new URLSearchParams({
    limit:  perPage,
    offset: (page - 1) * perPage
  });

  if (search)                           params.set('search',               search);
  if (activeSortName)                   params.set('sort_name',            activeSortName);
  if (activeSortDate)                   params.set('sort_date',            activeSortDate);
  if (activeFilters.division)           params.set('division',             activeFilters.division);
  if (activeFilters.functional_division) params.set('functional_division', activeFilters.functional_division);
  if (activeFilters.train_from)         params.set('train_from',           activeFilters.train_from);
  if (activeFilters.train_to)           params.set('train_to',             activeFilters.train_to);
  if (activeFilters.keyword && !search) params.set('search',               activeFilters.keyword);

  return '/teachers.php?' + params.toString();
}

// ─── LOAD DATA ────────────────────────────────────────────────────────────────
async function loadData(searchOverride) {
  showLoading(true);
  try {
    const result = await apiFetch(buildQuery(searchOverride));
    data  = result.data.map(normalizeTeacher);
    total = result.total;
    renderTable();
    updateFilterBadge();
  } finally {
    showLoading(false);
  }
}

// Maps every DB field the API now returns (including training + LD subqueries)
function normalizeTeacher(r) {
  return {
    id_number:    r.id_number,
    lastName:     r.last_name,
    firstName:    r.first_name,
    middleName:   r.middle_name || '',
    suffix:       r.suffix || '',
    bdYear:       String(r.birth_year),
    bdMonth:      parseInt(r.birth_month) || 1,   // stored as int in DB
    bdDay:        parseInt(r.birth_day)   || 1,
    sex:          r.sex,
    civilStatus:  r.civil_status,
    education:    r.education,
    division:     r.division,
    functionalDiv:r.functional_division,
    designation:  r.designation,
    years:        String(r.years_of_service),
    // Training data (from subquery — most recent record)
    trainingId:   r.training_id    || '',   // FK — needed for PUT update
    training:     r.training_title || '',
    trainYear:    r.training_year  || '',
    trainMonth:   parseInt(r.training_month) || '',
    trainDay:     parseInt(r.training_day)   || '',
    hours:        r.training_hours  || '',
    sponsor:      r.training_sponsor || '',
    // LD need (most recent)
    ldNeedId:     r.ld_need_id     || '',   // FK — needed for PUT update
    ldNeeds:      r.ld_need_text   || '',
  };
}

// ─── TABLE RENDERING ──────────────────────────────────────────────────────────
function renderTable() {
  if (!data.length) {
    document.getElementById('tableBody').innerHTML =
      '<tr><td colspan="18" style="text-align:center;padding:32px;color:#94a3b8;">No records found.</td></tr>';
    document.getElementById('entryInfo').textContent = '0 records';
    document.getElementById('pageControls').innerHTML = '';
    return;
  }

  document.getElementById('tableBody').innerHTML = data.map((r, idx) => {
    const bdDisplay  = r.bdDay
      ? `${String(r.bdDay).padStart(2,'0')}/${String(r.bdMonth).padStart(2,'0')}/${r.bdYear}`
      : '—';
    const trDisplay  = r.trainDay
      ? `${String(r.trainDay).padStart(2,'0')}/${String(r.trainMonth).padStart(2,'0')}/${r.trainYear}`
      : '—';
    return `<tr>
      <td>${esc(r.lastName)}</td>
      <td>${esc(r.firstName)}</td>
      <td>${esc(r.middleName) || '—'}</td>
      <td>${esc(r.suffix) || '—'}</td>
      <td>${bdDisplay}</td>
      <td>${esc(r.sex)}</td>
      <td>${esc(r.civilStatus)}</td>
      <td>${esc(r.education)}</td>
      <td>${esc(r.division)}</td>
      <td>${esc(r.functionalDiv)}</td>
      <td>${esc(r.designation)}</td>
      <td>${esc(r.years)}</td>
      <td>${esc(r.ldNeeds) || '—'}</td>
      <td>${esc(r.training) || '—'}</td>
      <td>${trDisplay}</td>
      <td>${r.hours || '—'}</td>
      <td>${esc(r.sponsor) || '—'}</td>
      <td>
        <div class="dropdown-wrap">
          <button class="dots-btn" onclick="toggleDropdown(event,${idx})">
            <span></span><span></span><span></span>
          </button>
          <div class="dropdown-menu hidden" id="drop-${idx}">
            <button class="dropdown-item" onclick="handleEdit(${idx})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>Edit
            </button>
            <button class="dropdown-item delete" onclick="handleDelete(${idx})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>Delete
            </button>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');

  const start = (page - 1) * perPage;
  document.getElementById('entryInfo').textContent =
    `${start + 1}–${Math.min(start + perPage, total)} of ${total} records`;
  renderPagination();
}

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── PAGINATION ───────────────────────────────────────────────────────────────
function renderPagination() {
  const tp = Math.ceil(total / perPage) || 1;
  let html = `<button class="page-btn" onclick="goPage(${page-1})" ${page===1?'disabled':''}>‹</button>`;

  let pages = [];
  if (tp <= 7) {
    for (let i = 1; i <= tp; i++) pages.push(i);
  } else {
    pages = [1];
    if (page > 3) pages.push('…');
    for (let i = Math.max(2,page-1); i <= Math.min(tp-1,page+1); i++) pages.push(i);
    if (page < tp-2) pages.push('…');
    pages.push(tp);
  }
  pages.forEach(p => {
    if (p === '…') html += `<span class="page-ellipsis">…</span>`;
    else html += `<button class="page-btn ${p===page?'active':''}" onclick="goPage(${p})">${p}</button>`;
  });
  html += `<button class="page-btn" onclick="goPage(${page+1})" ${page===tp?'disabled':''}>›</button>`;
  document.getElementById('pageControls').innerHTML = html;
}

function goPage(p) {
  const tp = Math.ceil(total / perPage) || 1;
  if (p < 1 || p > tp) return;
  page = p;
  loadData();
}

function changeEntries(value) {
  perPage = +value;
  page = 1;
  loadData();
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
let searchTimeout;
function handleSearch(value) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => { page = 1; loadData(value.trim()); }, 350);
}

// ─── VALIDATION HELPERS ───────────────────────────────────────────────────────
// Returns error string or null if valid.

function validateBirthYear(v) {
  const y = parseInt(v);
  if (!v || isNaN(y))                      return 'Birth year is required.';
  if (!Number.isInteger(+v) || String(v).includes('.')) return 'Birth year must be a whole number.';
  if (y < MIN_BIRTH_YEAR)                  return `Birth year must be ${MIN_BIRTH_YEAR} or later.`;
  if (y > MAX_BIRTH_YEAR)                  return `Birth year must be ${MAX_BIRTH_YEAR} or earlier.`;
  return null;
}

function validateDay(v, label) {
  const d = parseInt(v);
  if (!v || isNaN(d))                      return `${label} is required.`;
  if (!Number.isInteger(+v) || String(v).includes('.')) return `${label} must be a whole number.`;
  if (d < 1 || d > 31)                     return `${label} must be between 1 and 31.`;
  return null;
}

function validatePositiveInt(v, label) {
  if (v === '' || v === null || v === undefined) return null; // optional fields
  const n = parseInt(v);
  if (isNaN(n))                            return `${label} must be a number.`;
  if (!Number.isInteger(+v) || String(v).includes('.')) return `${label} must be a whole number.`;
  if (n < 0)                               return `${label} must be 0 or greater.`;
  return null;
}

function validateTrainYear(v) {
  if (!v) return null; // training is optional
  const y = parseInt(v);
  if (isNaN(y))                            return 'Training year must be a number.';
  if (!Number.isInteger(+v) || String(v).includes('.')) return 'Training year must be a whole number.';
  if (y < 1950 || y > CURRENT_YEAR)        return `Training year must be between 1950 and ${CURRENT_YEAR}.`;
  return null;
}

function showFieldError(inputEl, msg) {
  inputEl.style.borderColor = '#dc2626';
  let err = inputEl.parentNode.querySelector('.field-err');
  if (!err) {
    err = document.createElement('span');
    err.className = 'field-err';
    err.style.cssText = 'color:#dc2626;font-size:11px;display:block;margin-top:2px;';
    inputEl.parentNode.appendChild(err);
  }
  err.textContent = msg;
}

function clearFieldErrors(prefix) {
  document.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
    el.style.borderColor = '';
  });
  document.querySelectorAll('.field-err').forEach(el => el.remove());
}

// ─── DROPDOWN ─────────────────────────────────────────────────────────────────
function toggleDropdown(e, idx) {
  e.stopPropagation();
  const menu = document.getElementById('drop-' + idx);
  const isHidden = menu.classList.contains('hidden');
  closeAllDropdowns();
  if (isHidden) {
    menu.classList.remove('hidden');
    const rect = e.currentTarget.getBoundingClientRect();
    if (window.innerHeight - rect.bottom < 100) {
      menu.style.top='auto'; menu.style.bottom='100%';
      menu.style.marginBottom='4px'; menu.style.marginTop='0';
    } else {
      menu.style.bottom='auto'; menu.style.top='100%';
      menu.style.marginTop='4px'; menu.style.marginBottom='0';
    }
  }
}
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
}

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────
function handleEdit(idx) {
  closeAllDropdowns();
  const r = data[idx];
  if (!r) return;

  clearFieldErrors('edit');

  document.getElementById('editIdx').value            = idx;
  document.getElementById('editIdNumber').value       = r.id_number;
  document.getElementById('editLastName').value       = r.lastName;
  document.getElementById('editFirstName').value      = r.firstName;
  document.getElementById('editMiddleName').value     = r.middleName;
  document.getElementById('editSuffix').value         = r.suffix;
  document.getElementById('editBdYear').value         = r.bdYear;
  document.getElementById('editBdMonth').value        = r.bdMonth;   // integer 1–12
  document.getElementById('editBdDay').value          = r.bdDay;
  document.getElementById('editSex').value            = r.sex;
  document.getElementById('editCivilStatus').value    = r.civilStatus;
  document.getElementById('editEducation').value      = r.education;
  document.getElementById('editDivision').value       = r.division;
  document.getElementById('editFunctionalDiv').value  = r.functionalDiv;
  document.getElementById('editDesignation').value    = r.designation;
  document.getElementById('editYears').value          = r.years;
  document.getElementById('editLdNeeds').value        = r.ldNeeds;
  document.getElementById('editTraining').value       = r.training;
  document.getElementById('editTrainYear').value      = r.trainYear;
  document.getElementById('editTrainMonth').value     = r.trainMonth;
  document.getElementById('editTrainDay').value       = r.trainDay;
  document.getElementById('editHours').value          = r.hours;
  document.getElementById('editSponsor').value        = r.sponsor;

  document.getElementById('editModalOverlay').classList.remove('hidden');
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editModalOverlay').classList.add('hidden');
  document.getElementById('editModal').classList.add('hidden');
  clearFieldErrors('edit');
}

async function saveEdit() {
  clearFieldErrors('edit');

  const idx      = parseInt(document.getElementById('editIdx').value);
  const idNumber = document.getElementById('editIdNumber').value;

  // ── Validate ────────────────────────────────────────────────────────────────
  let hasError = false;

  const bdYearEl  = document.getElementById('editBdYear');
  const bdDayEl   = document.getElementById('editBdDay');
  const yearsEl   = document.getElementById('editYears');
  const trYearEl  = document.getElementById('editTrainYear');
  const trDayEl   = document.getElementById('editTrainDay');
  const hoursEl   = document.getElementById('editHours');

  const e1 = validateBirthYear(bdYearEl.value);
  if (e1) { showFieldError(bdYearEl, e1); hasError = true; }

  const e2 = validateDay(bdDayEl.value, 'Birth day');
  if (e2) { showFieldError(bdDayEl, e2); hasError = true; }

  const e3 = validatePositiveInt(yearsEl.value, 'Years of service');
  if (e3) { showFieldError(yearsEl, e3); hasError = true; }

  const e4 = validateTrainYear(trYearEl.value);
  if (e4) { showFieldError(trYearEl, e4); hasError = true; }

  if (trDayEl.value) {
    const e5 = validateDay(trDayEl.value, 'Training day');
    if (e5) { showFieldError(trDayEl, e5); hasError = true; }
  }

  const e6 = validatePositiveInt(hoursEl.value, 'No. of hours');
  if (e6) { showFieldError(hoursEl, e6); hasError = true; }

  if (hasError) return;

  // ── Save ─────────────────────────────────────────────────────────────────────
  const bdMonth = parseInt(document.getElementById('editBdMonth').value) || 1;

  try {
    await apiFetch('/teachers.php', { method: 'PUT', body: JSON.stringify({
      id_number:           idNumber,
      last_name:           document.getElementById('editLastName').value.trim(),
      first_name:          document.getElementById('editFirstName').value.trim(),
      middle_name:         document.getElementById('editMiddleName').value.trim(),
      suffix:              document.getElementById('editSuffix').value.trim(),
      birth_year:          parseInt(bdYearEl.value),
      birth_month:         bdMonth,
      birth_day:           parseInt(bdDayEl.value),
      sex:                 document.getElementById('editSex').value,
      civil_status:        document.getElementById('editCivilStatus').value,
      education:           document.getElementById('editEducation').value,
      division:            document.getElementById('editDivision').value,
      functional_division: document.getElementById('editFunctionalDiv').value,
      designation:         document.getElementById('editDesignation').value.trim(),
      years_of_service:    parseInt(yearsEl.value) || 0,
    })});

    const trainTitle = document.getElementById('editTraining').value.trim();
    const trMonth    = parseInt(document.getElementById('editTrainMonth').value) || 1;
    if (trainTitle) {
      const trainingPayload = {
        id_number:         idNumber,
        title_of_training: trainTitle,
        training_year:     parseInt(trYearEl.value) || CURRENT_YEAR,
        training_month:    trMonth,
        training_day:      parseInt(trDayEl.value) || 1,
        no_of_hours:       parseInt(hoursEl.value) || 0,
        sponsor:           document.getElementById('editSponsor').value.trim()
      };

      const existingTrainId = data[idx]?.trainingId;
      if (existingTrainId) {
        // Update the existing training record — never insert a duplicate
        await apiFetch(`/trainings.php?id=${encodeURIComponent(existingTrainId)}`, {
          method: 'PUT',
          body: JSON.stringify(trainingPayload)
        });
      } else {
        // No training yet — insert the first one
        const tRes = await apiFetch('/trainings.php', {
          method: 'POST',
          body: JSON.stringify(trainingPayload)
        });
        if (data[idx] && tRes?.training_id) data[idx].trainingId = tRes.training_id;
      }
    }

    const ldText = document.getElementById('editLdNeeds').value.trim();
    if (ldText) {
      const ldPayload = { id_number: idNumber, ld_need_text: ldText };

      const existingLdId = data[idx]?.ldNeedId;
      if (existingLdId) {
        // Update the existing LD need record — never insert a duplicate
        await apiFetch(`/ld_needs.php?id=${encodeURIComponent(existingLdId)}`, {
          method: 'PUT',
          body: JSON.stringify(ldPayload)
        });
      } else {
        // No LD need yet — insert the first one
        const lRes = await apiFetch('/ld_needs.php', {
          method: 'POST',
          body: JSON.stringify(ldPayload)
        });
        if (data[idx] && lRes?.ld_need_id) data[idx].ldNeedId = lRes.ld_need_id;
      }
    }

    // ── Update in-memory data immediately — no page reload needed ─────────────
    if (data[idx]) {
      const r = data[idx];
      r.lastName     = document.getElementById('editLastName').value.trim();
      r.firstName    = document.getElementById('editFirstName').value.trim();
      r.middleName   = document.getElementById('editMiddleName').value.trim();
      r.suffix       = document.getElementById('editSuffix').value.trim();
      r.bdYear       = bdYearEl.value;
      r.bdMonth      = bdMonth;
      r.bdDay        = parseInt(bdDayEl.value);
      r.sex          = document.getElementById('editSex').value;
      r.civilStatus  = document.getElementById('editCivilStatus').value;
      r.education    = document.getElementById('editEducation').value;
      r.division     = document.getElementById('editDivision').value;
      r.functionalDiv= document.getElementById('editFunctionalDiv').value;
      r.designation  = document.getElementById('editDesignation').value.trim();
      r.years        = yearsEl.value;
      if (trainTitle) {
        r.training  = trainTitle;
        r.trainYear = parseInt(trYearEl.value) || CURRENT_YEAR;
        r.trainMonth= trMonth;
        r.trainDay  = parseInt(trDayEl.value) || 1;
        r.hours     = parseInt(hoursEl.value) || 0;
        r.sponsor   = document.getElementById('editSponsor').value.trim();
      }
      if (ldText) {
        r.ldNeeds = ldText;
      }
    }

    showToast('Record updated successfully!');
    closeEditModal();
    renderTable(); // re-render in place — no API call, no flicker
  } catch (e) { /* handled by apiFetch */ }
}

// ─── ADD MODAL ────────────────────────────────────────────────────────────────
function openAddModal() {
  clearFieldErrors('add');
  const textIds = ['addLastName','addFirstName','addMiddleName','addSuffix',
    'addBdYear','addBdDay','addDesignation','addYears','addLdNeeds',
    'addTraining','addTrainYear','addTrainDay','addHours','addSponsor'];
  textIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['addBdMonth','addSex','addCivilStatus','addEducation','addDivision','addFunctionalDiv','addTrainMonth']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('addModalOverlay').classList.remove('hidden');
  document.getElementById('addModal').classList.remove('hidden');
}

function closeAddModal() {
  document.getElementById('addModalOverlay').classList.add('hidden');
  document.getElementById('addModal').classList.add('hidden');
  clearFieldErrors('add');
}

async function saveAdd() {
  clearFieldErrors('add');

  const lastName  = document.getElementById('addLastName').value.trim();
  const firstName = document.getElementById('addFirstName').value.trim();

  let hasError = false;

  if (!lastName)  { showFieldError(document.getElementById('addLastName'),  'Last name is required.');  hasError = true; }
  if (!firstName) { showFieldError(document.getElementById('addFirstName'), 'First name is required.'); hasError = true; }

  const bdYearEl = document.getElementById('addBdYear');
  const bdDayEl  = document.getElementById('addBdDay');
  const yearsEl  = document.getElementById('addYears');
  const trYearEl = document.getElementById('addTrainYear');
  const trDayEl  = document.getElementById('addTrainDay');
  const hoursEl  = document.getElementById('addHours');

  const e1 = validateBirthYear(bdYearEl.value);
  if (e1) { showFieldError(bdYearEl, e1); hasError = true; }

  const e2 = validateDay(bdDayEl.value, 'Birth day');
  if (e2) { showFieldError(bdDayEl, e2); hasError = true; }

  const e3 = validatePositiveInt(yearsEl.value, 'Years of service');
  if (e3) { showFieldError(yearsEl, e3); hasError = true; }

  const e4 = validateTrainYear(trYearEl.value);
  if (e4) { showFieldError(trYearEl, e4); hasError = true; }

  if (trDayEl.value) {
    const e5 = validateDay(trDayEl.value, 'Training day');
    if (e5) { showFieldError(trDayEl, e5); hasError = true; }
  }

  const e6 = validatePositiveInt(hoursEl.value, 'No. of hours');
  if (e6) { showFieldError(hoursEl, e6); hasError = true; }

  if (hasError) return;

  const bdMonth = parseInt(document.getElementById('addBdMonth').value) || 1;
  const trMonth = parseInt(document.getElementById('addTrainMonth').value) || 1;

  try {
    const teacherRes = await apiFetch('/teachers.php', { method: 'POST', body: JSON.stringify({
      last_name:           lastName,
      first_name:          firstName,
      middle_name:         document.getElementById('addMiddleName').value.trim(),
      suffix:              document.getElementById('addSuffix').value.trim(),
      birth_year:          parseInt(bdYearEl.value),
      birth_month:         bdMonth,
      birth_day:           parseInt(bdDayEl.value),
      sex:                 document.getElementById('addSex').value,
      civil_status:        document.getElementById('addCivilStatus').value,
      education:           document.getElementById('addEducation').value,
      division:            document.getElementById('addDivision').value,
      functional_division: document.getElementById('addFunctionalDiv').value,
      designation:         document.getElementById('addDesignation').value.trim(),
      years_of_service:    parseInt(yearsEl.value) || 0,
    })});

    const newId = teacherRes.id_number;

    const trainTitle = document.getElementById('addTraining').value.trim();
    if (trainTitle) {
      await apiFetch('/trainings.php', { method: 'POST', body: JSON.stringify({
        id_number:         newId,
        title_of_training: trainTitle,
        training_year:     parseInt(trYearEl.value) || CURRENT_YEAR,
        training_month:    trMonth,
        training_day:      parseInt(trDayEl.value) || 1,
        no_of_hours:       parseInt(hoursEl.value) || 0,
        sponsor:           document.getElementById('addSponsor').value.trim()
      })});
    }

    const ldText = document.getElementById('addLdNeeds').value.trim();
    if (ldText) {
      await apiFetch('/ld_needs.php', { method: 'POST', body: JSON.stringify({
        id_number: newId, ld_need_text: ldText
      })});
    }

    showToast('Record added successfully!');
    closeAddModal();
    page = 1;
    loadData();
  } catch (e) { /* handled */ }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
async function handleDelete(idx) {
  closeAllDropdowns();
  const r = data[idx];
  if (!r) return;
  if (!confirm(`Delete record for ${r.firstName} ${r.lastName}?\nThis will also remove their training and L&D records. This cannot be undone.`)) return;

  try {
    await apiFetch(`/teachers.php?id=${encodeURIComponent(r.id_number)}`, { method: 'DELETE' });
    showToast(`${r.firstName} ${r.lastName} deleted.`);
    if (data.length === 1 && page > 1) page--;
    loadData();
  } catch (e) { /* handled */ }
}

// ─── SORT PANEL ───────────────────────────────────────────────────────────────
function toggleSort(e) {
  e.stopPropagation();
  const panel = document.getElementById('sortPanel');
  const overlay = document.getElementById('sortOverlay');
  const rect = document.getElementById('sortBtn').getBoundingClientRect();
  panel.style.top   = (rect.bottom + 8) + 'px';
  panel.style.right = (window.innerWidth - rect.right) + 'px';
  panel.classList.toggle('hidden');
  overlay.classList.toggle('hidden');
  document.getElementById('filterPanel').classList.add('hidden');
  document.getElementById('filterOverlay').classList.add('hidden');
}

function applySort() {
  const nameRadio = document.querySelector('input[name="sortName"]:checked');
  const dateRadio = document.querySelector('input[name="sortDate"]:checked');
  activeSortName  = nameRadio ? nameRadio.value : 'az';
  activeSortDate  = dateRadio ? dateRadio.value : '';
  page = 1;
  closePanels();
  loadData();
  updateSortBadge();
}

function resetSort() {
  activeSortName = 'az';
  activeSortDate = '';
  const az = document.querySelector('input[name="sortName"][value="az"]');
  if (az) az.checked = true;
  document.querySelectorAll('input[name="sortDate"]').forEach(r => r.checked = false);
  page = 1;
  loadData();
  updateSortBadge();
}

function updateSortBadge() {
  document.getElementById('sortBtn')?.classList.toggle('btn-active',
    activeSortName !== 'az' || activeSortDate !== '');
}

// ─── FILTER PANEL ─────────────────────────────────────────────────────────────
function toggleFilter(e) {
  e.stopPropagation();
  const panel = document.getElementById('filterPanel');
  const overlay = document.getElementById('filterOverlay');
  const rect = document.getElementById('filterBtn').getBoundingClientRect();
  panel.style.top   = (rect.bottom + 8) + 'px';
  panel.style.right = (window.innerWidth - rect.right) + 'px';
  panel.classList.toggle('hidden');
  overlay.classList.toggle('hidden');
  document.getElementById('sortPanel').classList.add('hidden');
  document.getElementById('sortOverlay').classList.add('hidden');
}

function applyFilter() {
  activeFilters.division            = document.getElementById('filterDivision')?.value  || '';
  activeFilters.functional_division = document.getElementById('filterFuncDiv')?.value   || '';
  activeFilters.train_from          = document.getElementById('filterDateFrom')?.value  || '';
  activeFilters.train_to            = document.getElementById('filterDateTo')?.value    || '';
  activeFilters.keyword             = document.getElementById('filterKeyword')?.value.trim() || '';
  page = 1;
  closePanels();
  loadData();
}

function resetAllFilters() {
  activeFilters = { division:'', functional_division:'', train_from:'', train_to:'', keyword:'' };
  ['filterDivision','filterFuncDiv','filterDateFrom','filterDateTo','filterKeyword']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  page = 1;
  closePanels();
  loadData();
}

function resetFilterSection(section) {
  const map = {
    date:    [['train_from','filterDateFrom'],['train_to','filterDateTo']],
    division:[['division','filterDivision']],
    funcdiv: [['functional_division','filterFuncDiv']],
    keyword: [['keyword','filterKeyword']],
  };
  (map[section] || []).forEach(([key, elId]) => {
    activeFilters[key] = '';
    const el = document.getElementById(elId);
    if (el) el.value = '';
  });
}

function updateFilterBadge() {
  document.getElementById('filterBtn')?.classList.toggle('btn-active',
    Object.values(activeFilters).some(v => v !== ''));
}

function closePanels() {
  ['sortPanel','sortOverlay','filterPanel','filterOverlay']
    .forEach(id => document.getElementById(id)?.classList.add('hidden'));
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
  document.getElementById('mainContent')?.classList.toggle('sidebar-collapsed');
}

// ─── LOADING + TOAST ──────────────────────────────────────────────────────────
function showLoading(show) {
  let el = document.getElementById('loadingIndicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loadingIndicator';
    el.style.cssText = 'position:fixed;top:16px;right:16px;background:#0f9688;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;z-index:9999;display:none;box-shadow:0 4px 12px rgba(0,0,0,.2);';
    el.textContent = 'Loading…';
    document.body.appendChild(el);
  }
  el.style.display = show ? 'block' : 'none';
}

function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:${type==='error'?'#dc2626':'#059669'};color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15);`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('click', () => closeAllDropdowns());

document.addEventListener('DOMContentLoaded', () => {
  loadData();

  document.getElementById('searchInput')
    ?.addEventListener('input', e => handleSearch(e.target.value));

  document.getElementById('sortApplyBtn')  ?.addEventListener('click', applySort);
  document.getElementById('sortResetBtn')  ?.addEventListener('click', resetSort);
  document.getElementById('filterApplyBtn')?.addEventListener('click', applyFilter);
  document.getElementById('filterResetBtn')?.addEventListener('click', resetAllFilters);

  document.querySelectorAll('[data-reset-section]').forEach(el =>
    el.addEventListener('click', () => resetFilterSection(el.dataset.resetSection)));

  // Enforce integer-only input on all number fields in modals
  document.querySelectorAll('.int-only').forEach(el => {
    el.addEventListener('input', () => {
      el.value = el.value.replace(/[^0-9]/g, '');
    });
    el.addEventListener('keydown', e => {
      if (['.','e','E','+','-'].includes(e.key)) e.preventDefault();
    });
  });
});
