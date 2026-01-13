let feesDb = [
            { name: 'Tuition Fee', amount: 15000 },
            { name: 'Miscellaneous Fee', amount: 3500 },
            { name: 'Laboratory Fee', amount: 2000 },
            { name: 'Student Activity', amount: 500 }
        ];


        // FEES MANAGEMENT MODULE
        function renderFees() {
            const tbody = document.getElementById('fee-table-body');
            tbody.innerHTML = '';


            feesDb.forEach((fee, index) => {
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50 transition-colors">
                        <td class="px-6 py-4 font-bold text-slate-800">${fee.name}</td>
                        <td class="px-6 py-4 font-mono font-bold text-blue-600">₱${fee.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td class="px-6 py-4 text-right space-x-2">
                            <button onclick="openFeeEditor(${index})" class="p-2 text-slate-400 hover:text-blue-600 transition-colors"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                            <button onclick="deleteFee(${index})" class="p-2 text-slate-400 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </td>
                    </tr>
                `;
            });


            if(feesDb.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" class="py-20 text-center text-slate-400 italic">No fees configured. Click "Add New Fee" to begin.</td></tr>`;
            }


            lucide.createIcons();
        }


        function openFeeEditor(index = -1) {
            const modal = document.getElementById('fee-editor-modal');
            const title = document.getElementById('fee-modal-title');
           
            if(index > -1) {
                title.innerText = "Edit Institutional Fee";
                document.getElementById('edit-fee-index').value = index;
                document.getElementById('fee-name-input').value = feesDb[index].name;
                document.getElementById('fee-amount-input').value = feesDb[index].amount;
            } else {
                title.innerText = "Add New Fee";
                document.getElementById('edit-fee-index').value = -1;
                document.getElementById('fee-name-input').value = "";
                document.getElementById('fee-amount-input').value = "";
            }
            modal.classList.remove('hidden');
        }


        function closeFeeEditor() {
            document.getElementById('fee-editor-modal').classList.add('hidden');
        }


        function saveFee() {
            const index = parseInt(document.getElementById('edit-fee-index').value);
            const name = document.getElementById('fee-name-input').value;
            const amount = parseFloat(document.getElementById('fee-amount-input').value);


            if(!name || isNaN(amount)) return;


            if(index > -1) {
                feesDb[index].name = name;
                feesDb[index].amount = amount;
            } else {
                feesDb.push({ name, amount });
            }


            closeFeeEditor();
            renderFees();
        }


        function deleteFee(index) {
            feesDb.splice(index, 1);
            renderFees();
        }


        window.onload = () => {
            renderFees();
            lucide.createIcons();
        };
        // --- Sidebar State ---
let sidebarExpanded = true;

function toggleSidebar() {
    sidebarExpanded = !sidebarExpanded;

    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('sidebar-toggle-icon');

    sidebar.classList.toggle('sidebar-expanded', sidebarExpanded);
    sidebar.classList.toggle('sidebar-collapsed', !sidebarExpanded);

    document.querySelectorAll('.sidebar-text')
        .forEach(el => el.classList.toggle('hidden', !sidebarExpanded));

    icon.setAttribute(
        'data-lucide',
        sidebarExpanded ? 'chevron-left' : 'menu'
    );

    lucide.createIcons();
}
