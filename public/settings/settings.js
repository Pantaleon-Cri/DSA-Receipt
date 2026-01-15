
        let staffDb = [
            { name: 'Sarah Miller', id: 'STA-2025-01', role: 'Staff' },
            { name: 'James Wilson', id: 'OFF-2025-01', role: 'Officer' }
        ];


        function handleLogout() {
            location.reload();
        }


        // STAFF MODULE
        function renderStaff() {
            const tbody = document.getElementById('staff-table-body');
            tbody.innerHTML = '';
            staffDb.forEach((staff, index) => {
                const roleClass = staff.role === 'None' ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-600';
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50 transition-colors">
                        <td class="px-6 py-4 font-bold text-slate-800">${staff.name}</td>
                        <td class="px-6 py-4 font-mono text-xs text-blue-600">${staff.id}</td>
                        <td class="px-6 py-4">
                            <span class="px-3 py-1 ${roleClass} text-[10px] font-black uppercase rounded-full">${staff.role}</span>
                        </td>
                        <td class="px-6 py-4 text-right">
                            <button onclick="deleteStaff(${index})" class="text-slate-300 hover:text-red-500 transition-colors"><i data-lucide="user-minus" class="w-4 h-4"></i></button>
                        </td>
                    </tr>
                `;
            });
            lucide.createIcons();
        }


        function openStaffModal() {
            document.getElementById('staff-modal').classList.remove('hidden');
        }


        function closeStaffModal() {
            document.getElementById('staff-modal').classList.add('hidden');
        }


        function saveStaff() {
            const name = document.getElementById('staff-name').value;
            const id = document.getElementById('staff-id').value;
            const role = document.getElementById('staff-role').value;
            const pass = document.getElementById('staff-pass').value;


            if(!name || !id || !pass) return;


            staffDb.push({ name, id, role });
            closeStaffModal();
            renderStaff();
        }


        function deleteStaff(index) {
            staffDb.splice(index, 1);
            renderStaff();
        }


        window.onload = () => {
            renderStaff();
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
