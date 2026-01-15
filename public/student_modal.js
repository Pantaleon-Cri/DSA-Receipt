// --------------------
// Open / Close Modals
// --------------------
function openYearModal() {
    document.getElementById('modal-year-edit').classList.remove('hidden');
    fetchYearsForEdit();
}

function closeYearModal() {
    document.getElementById('modal-year-edit').classList.add('hidden');
}

function openSemesterModal() {
    document.getElementById('modal-semester-edit').classList.remove('hidden');
    fetchSemestersForEdit();
}

function closeSemesterModal() {
    document.getElementById('modal-semester-edit').classList.add('hidden');
}

// --------------------
// Fetch Years for Edit
// --------------------
function fetchYearsForEdit() {
    const select = document.getElementById('year-select-edit');
    select.innerHTML = '';

    fetch('http://localhost:3000/api/term/years')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.years.length > 0) {
                data.years.forEach(y => {
                    const option = document.createElement('option');
                    option.value = y.year_id;
                    option.textContent = y.year_name;
                    select.appendChild(option);
                });

                // Set input field to the currently active year (first in list)
                document.getElementById('year-name-edit').value = select.options[0].textContent;
            } else {
                select.innerHTML = '<option disabled>No years found</option>';
                document.getElementById('year-name-edit').value = '';
            }
        })
        .catch(err => console.error(err));
}

// Update input when selecting a year
document.getElementById('year-select-edit').addEventListener('change', function () {
    document.getElementById('year-name-edit').value = this.selectedOptions[0].textContent;
});

// --------------------
// Update Year
// --------------------
function updateYear() {
    const yearId = document.getElementById('year-select-edit').value;
    const newName = document.getElementById('year-name-edit').value.trim();

    if (!newName) return alert('Please enter a year name.');

    fetch('http://localhost:3000/api/year/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year_id: yearId, year_name: newName })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('Year updated successfully!');
                closeYearModal();
                // Reload the year dropdown with updated year selected
                populateYearDropdown(newName);
            } else {
                alert('Error: ' + data.message);
            }
        })
        .catch(err => console.error(err));
}

// --------------------
// Fetch Semesters for Edit
// --------------------
function fetchSemestersForEdit() {
    const select = document.getElementById('semester-select-edit');
    select.innerHTML = '';

    fetch('http://localhost:3000/api/term/semesters')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.semesters.length > 0) {
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

                // Set input field to the first semester
                document.getElementById('semester-name-edit').value = select.options[0].textContent;
            } else {
                select.innerHTML = '<option disabled>No semesters found</option>';
                document.getElementById('semester-name-edit').value = '';
            }
        })
        .catch(err => console.error(err));
}

// Update input when selecting a semester
document.getElementById('semester-select-edit').addEventListener('change', function () {
    document.getElementById('semester-name-edit').value = this.selectedOptions[0].textContent;
});

// --------------------
// Update Semester
// --------------------
function updateSemesterName() {
    const semesterId = document.getElementById('semester-select-edit').value;
    const newName = document.getElementById('semester-name-edit').value.trim();

    if (!newName) return alert('Please enter a semester name.');

    fetch('http://localhost:3000/api/semester/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semester_id: semesterId, semester_name: newName })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('Semester updated successfully!');
                closeSemesterModal();
                // Reload semester dropdown with updated semester selected
                populateSemesterDropdown(newName);
            } else {
                alert('Error: ' + data.message);
            }
        })
        .catch(err => console.error(err));
}
