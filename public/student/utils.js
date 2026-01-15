// utils.js

export function calculateTotalFees() {
    let total = 0;
    const selectedList = document.getElementById('rec-fees-list');
    if (!selectedList) return 0;

    selectedList.innerHTML = ''; // clear previous fees

    // loop through all checked fees dynamically
    document.querySelectorAll('.fee-checkbox:checked').forEach(cb => {
        const feeName = cb.dataset.fee || 'Unknown Fee';
        const price = parseFloat(cb.dataset.price) || 0;

        total += price;

        selectedList.innerHTML += `
            <div class="flex justify-between items-center text-slate-600">
                <span>• ${feeName}</span>
                <span class="font-mono">₱${price.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
        `;
    });

    // if no fees selected, show placeholder
    if (total === 0) {
        selectedList.innerHTML = '<p class="text-slate-400 italic">No fees selected</p>';
    }

    // update modal total and receipt total
    const formattedTotal = `₱${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    const totalDisplay = document.getElementById('total-display');
    const recTotal = document.getElementById('rec-total');
    if (totalDisplay) totalDisplay.innerText = formattedTotal;
    if (recTotal) recTotal.innerText = formattedTotal;

    return total;
}


export function toggleSidebar(sidebarId = 'sidebar', iconId = 'sidebar-toggle-icon') {
    const sidebar = document.getElementById(sidebarId);
    const icon = document.getElementById(iconId);
    sidebar.classList.toggle('sidebar-expanded');
    sidebar.classList.toggle('sidebar-collapsed');
    document.querySelectorAll('.sidebar-text').forEach(el => el.classList.toggle('hidden'));
    icon.setAttribute('data-lucide', sidebar.classList.contains('sidebar-expanded') ? 'chevron-left' : 'menu');
    lucide.createIcons();
}
