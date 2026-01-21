// --------------------
// Open / Close Modals
// --------------------
function openYearModal() {
  const modal = document.getElementById('modal-year-edit');
  if (!modal) return;
  modal.classList.remove('hidden');
  fetchYearsForEdit();
}

function closeYearModal() {
  const modal = document.getElementById('modal-year-edit');
  if (!modal) return;
  modal.classList.add('hidden');
}

function openSemesterModal() {
  const modal = document.getElementById('modal-semester-edit');
  if (!modal) return;
  modal.classList.remove('hidden');
  fetchSemestersForEdit();
}

function closeSemesterModal() {
  const modal = document.getElementById('modal-semester-edit');
  if (!modal) return;
  modal.classList.add('hidden');
}

// --------------------
// Fetch Years for Edit
// --------------------
function fetchYearsForEdit() {
  const select = document.getElementById('year-select-edit');
  const input = document.getElementById('year-name-edit');
  if (!select || !input) return;

  select.innerHTML = '';

  fetch('http://localhost:3000/api/term/years')
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.years) && data.years.length > 0) {
        data.years.forEach(y => {
          const option = document.createElement('option');
          option.value = y.year_id;
          option.textContent = y.year_name;
          select.appendChild(option);
        });

        // default to first option name
        input.value = select.options[0].textContent;
      } else {
        select.innerHTML = '<option disabled>No years found</option>';
        input.value = '';
      }
    })
    .catch(err => console.error(err));
}

// Update input when selecting a year (safe bind)
(function bindYearEditListener() {
  const select = document.getElementById('year-select-edit');
  if (!select) return;
  if (select.dataset.bound === '1') return;

  select.addEventListener('change', function () {
    const input = document.getElementById('year-name-edit');
    if (!input) return;
    input.value = this.selectedOptions?.[0]?.textContent || '';
  });

  select.dataset.bound = '1';
})();

// --------------------
// Update Year NAME (RENAME)
// --------------------
// ⚠️ Requires backend route: PUT /api/term/years/:id
function updateYear() {
  const yearId = document.getElementById('year-select-edit')?.value;
  const newName = document.getElementById('year-name-edit')?.value.trim();

  if (!yearId) return alert('Please select a year.');
  if (!newName) return alert('Please enter a year name.');

  fetch(`http://localhost:3000/api/term/years/${encodeURIComponent(yearId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year_name: newName })
  })
    .then(async res => {
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch {
        throw new Error(`Server did not return JSON (HTTP ${res.status}). Response starts with: ${text.slice(0, 30)}`);
      }
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update year.');
      return data;
    })
    .then(() => {
      alert('Year updated successfully!');
      closeYearModal();

      // refresh UI dropdowns (if these functions exist in your student.js)
      if (typeof populateYearDropdown === 'function') {
        populateYearDropdown(Number(yearId));
      }
    })
    .catch(err => {
      console.error(err);
      alert(err.message || 'Failed to update year.');
    });
}

// --------------------
// Fetch Semesters for Edit
// --------------------
function fetchSemestersForEdit() {
  const select = document.getElementById('semester-select-edit');
  const input = document.getElementById('semester-name-edit');
  if (!select || !input) return;

  select.innerHTML = '';

  fetch('http://localhost:3000/api/term/semesters')
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.semesters) && data.semesters.length > 0) {
        // Remove duplicate semester names
        const seen = new Set();
        const unique = data.semesters.filter(s => {
          if (seen.has(s.semester_name)) return false;
          seen.add(s.semester_name);
          return true;
        });

        unique.forEach(s => {
          const option = document.createElement('option');
          option.value = s.semester_id;
          option.textContent = s.semester_name;
          select.appendChild(option);
        });

        input.value = select.options[0].textContent;
      } else {
        select.innerHTML = '<option disabled>No semesters found</option>';
        input.value = '';
      }
    })
    .catch(err => console.error(err));
}

// Update input when selecting a semester (safe bind)
(function bindSemesterEditListener() {
  const select = document.getElementById('semester-select-edit');
  if (!select) return;
  if (select.dataset.bound === '1') return;

  select.addEventListener('change', function () {
    const input = document.getElementById('semester-name-edit');
    if (!input) return;
    input.value = this.selectedOptions?.[0]?.textContent || '';
  });

  select.dataset.bound = '1';
})();

// --------------------
// Update Semester NAME (RENAME)
// --------------------
// ⚠️ Requires backend route: PUT /api/term/semesters/:id
function updateSemesterName() {
  const semesterId = document.getElementById('semester-select-edit')?.value;
  const newName = document.getElementById('semester-name-edit')?.value.trim();

  if (!semesterId) return alert('Please select a semester.');
  if (!newName) return alert('Please enter a semester name.');

  fetch(`http://localhost:3000/api/term/semesters/${encodeURIComponent(semesterId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ semester_name: newName })
  })
    .then(async res => {
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch {
        throw new Error(`Server did not return JSON (HTTP ${res.status}). Response starts with: ${text.slice(0, 30)}`);
      }
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update semester.');
      return data;
    })
    .then(() => {
      alert('Semester updated successfully!');
      closeSemesterModal();

      if (typeof populateSemesterDropdown === 'function') {
        populateSemesterDropdown(newName);
      }
    })
    .catch(err => {
      console.error(err);
      alert(err.message || 'Failed to update semester.');
    });
}

// Expose for HTML onclick usage
window.openYearModal = openYearModal;
window.closeYearModal = closeYearModal;
window.updateYear = updateYear;

window.openSemesterModal = openSemesterModal;
window.closeSemesterModal = closeSemesterModal;
window.updateSemesterName = updateSemesterName;
