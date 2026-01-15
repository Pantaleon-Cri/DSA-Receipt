let feesDb = []; // will always be an array

// -----------------------------
// RENDER FEES TABLE
// -----------------------------
function renderFees() {
    const tbody = document.getElementById('fee-table-body');
    tbody.innerHTML = '';

    if (!Array.isArray(feesDb) || feesDb.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="4" class="py-20 text-center text-slate-400 italic">
                No fees configured. Click "Add New Fee" to begin.
            </td>
        </tr>`;
        return;
    }

    feesDb.forEach((fee, index) => {
        // Convert DB value to friendly text
        let roleText = '-';
        if (fee.role == "1") roleText = "For Officer";
        else if (fee.role == "0") roleText = "For Non-Officer";

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50/50 transition-colors">
                <td class="px-6 py-4 font-bold text-slate-800">${fee.fee_name}</td>
                <td class="px-6 py-4 font-mono font-bold text-blue-600">
                    ₱${Number(fee.fee_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td class="px-6 py-4 font-bold text-slate-800">${roleText}</td>
                <td class="px-6 py-4 text-right space-x-2">
                    <button onclick="openFeeEditor(${index})" class="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteFee(${fee.fee_id})" class="p-2 text-slate-400 hover:text-red-500 transition-colors">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    lucide.createIcons();
}


// -----------------------------
// OPEN MODAL FOR ADD/EDIT
// -----------------------------
function openFeeEditor(index = -1) {
    const modal = document.getElementById('fee-editor-modal');
    const title = document.getElementById('fee-modal-title');

    if (index > -1) {
        title.innerText = "Edit Institutional Fee";
        document.getElementById('edit-fee-index').value = index;
        document.getElementById('fee-name-input').value = feesDb[index].fee_name;
        document.getElementById('fee-amount-input').value = feesDb[index].fee_amount;
        document.getElementById('fee-role-select').value = feesDb[index].role || "Officer";
    } else {
        title.innerText = "Add New Fee";
        document.getElementById('edit-fee-index').value = -1;
        document.getElementById('fee-name-input').value = "";
        document.getElementById('fee-amount-input').value = "";
        document.getElementById('fee-role-select').value = "Officer";
    }

    modal.classList.remove('hidden');
}

// -----------------------------
// CLOSE MODAL
// -----------------------------
function closeFeeEditor() {
    document.getElementById('fee-editor-modal').classList.add('hidden');
}

// -----------------------------
// SAVE (ADD OR UPDATE) FEE
// -----------------------------
async function saveFee() {
    const name = document.getElementById('fee-name-input').value.trim();
    const amount = parseFloat(document.getElementById('fee-amount-input').value);
    const role = document.getElementById('fee-role-select').value; // "1" or "0" stored in DB
    const index = parseInt(document.getElementById('edit-fee-index').value);

    if (!name || isNaN(amount)) {
        return alert("Please enter valid fee name and amount");
    }

    try {
        let res, data;

        if (index === -1) {
            // ADD
            res = await fetch("http://localhost:3000/api/fees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fee_name: name, fee_amount: amount, role })
            });
            data = await res.json();
        } else {
            // UPDATE
            const fee_id = feesDb[index].fee_id;
            res = await fetch("http://localhost:3000/api/fees", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fee_id, fee_name: name, fee_amount: amount, role })
            });
            data = await res.json();
        }

        if (!data.success) throw new Error(data.message || "Failed to save fee");

        closeFeeEditor();
        await loadFees(); // reload table
    } catch (err) {
        console.error("Save fee error:", err);
        alert("Could not save fee. Check console for details.");
    }
}


// -----------------------------
// DELETE FEE
// -----------------------------
function deleteFee(fee_id) {
    if (!confirm("Are you sure you want to delete this fee?")) return;

    fetch(`http://localhost:3000/api/fees/${fee_id}`, { method: "DELETE" })
        .then(res => res.json())
        .then(data => {
            if (!data || !data.success) throw new Error(data.message || "Failed to delete fee");
            loadFees();
        })
        .catch(err => {
            console.error("Delete fee error:", err);
            alert("Could not delete fee. Check console for details.");
        });
}

// -----------------------------
// LOAD FEES FROM DATABASE
// -----------------------------
function loadFees() {
    fetch("http://localhost:3000/api/fees")
        .then(res => res.json())
        .then(data => {
            if (data.success && Array.isArray(data.fees)) {
                feesDb = data.fees;
            } else {
                feesDb = [];
                console.warn("No fees returned from server");
            }
            renderFees();
        })
        .catch(err => {
            console.error("Load fees error:", err);
            feesDb = [];
            renderFees();
            alert("Cannot load fees from database. Check backend.");
        });
}


// -----------------------------
// SIDEBAR TOGGLE
// -----------------------------
let sidebarExpanded = true;
function toggleSidebar() {
    sidebarExpanded = !sidebarExpanded;

    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('sidebar-toggle-icon');

    sidebar.classList.toggle('sidebar-expanded', sidebarExpanded);
    sidebar.classList.toggle('sidebar-collapsed', !sidebarExpanded);

    document.querySelectorAll('.sidebar-text')
        .forEach(el => el.classList.toggle('hidden', !sidebarExpanded));

    icon.setAttribute('data-lucide', sidebarExpanded ? 'chevron-left' : 'menu');
    lucide.createIcons();
}

// -----------------------------
// INIT
// -----------------------------
window.addEventListener("DOMContentLoaded", loadFees);
