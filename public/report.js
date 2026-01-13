 let currentReportData = [];
        let currentInterval = 'day';
        let currentSelection = '';
        const STUDENT_POPULATION = 1000;


        const activeFees = [
            { name: "Acad Week Fee", price: 300 },
            { name: "SSG Fee", price: 350 }
        ];


        function toggleDatePicker() {
            const range = document.getElementById('report-range').value;
            currentInterval = range;
            document.getElementById('date-picker-day').classList.toggle('hidden', range !== 'day');
            document.getElementById('date-picker-week').classList.toggle('hidden', range !== 'week');
            document.getElementById('date-picker-month').classList.toggle('hidden', range !== 'month');
        }


        function getMockTransactions(selection, range) {
            const seed = selection.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const multiplier = range === 'month' ? 80 : (range === 'week' ? 30 : 10);
            const count = multiplier + (seed % 15);
            const names = ["Aria Stark", "Jon Snow", "Tyrion Lannister", "Sansa Stark", "Daenerys Targaryen", "Samwell Tarly", "Jorah Mormont", "Brienne of Tarth", "Theon Greyjoy"];
           
            let data = [];
            for (let i = 0; i < count; i++) {
                const name = names[(seed + i) % names.length];
                const studentId = `ID-${202400 + (seed + i)}`;
                const feeSet = activeFees.slice(0, ((seed + i) % 2) + 1);
                const totalAmount = feeSet.reduce((sum, f) => sum + f.price, 0);
                const feeNames = feeSet.map(f => f.name).join(", ");


                data.push({
                    id: `TXN-${5000 + (seed + i)}`,
                    studentId: studentId,
                    student: name,
                    fee: feeNames,
                    amount: totalAmount,
                    status: 'Paid'
                });
            }
            return data;
        }


        function generateReport() {
            const range = document.getElementById('report-range').value;
            const selection = document.getElementById(`date-picker-${range}`).value;
            if(!selection) return;


            currentSelection = selection;
            currentReportData = getMockTransactions(selection, range);
            document.getElementById('log-date-display').innerText = `Period: ${selection.toUpperCase()}`;
            document.getElementById('download-btn').classList.remove('hidden');


            const tbody = document.getElementById('transaction-table-body');
            tbody.innerHTML = '';


            currentReportData.forEach(txn => {
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50">
                        <td class="px-6 py-4 font-mono text-[10px] text-blue-600 font-bold">${txn.id}</td>
                        <td class="px-6 py-4 font-mono text-[10px] text-slate-500 font-bold">${txn.studentId}</td>
                        <td class="px-6 py-4 font-bold text-slate-800">${txn.student}</td>
                        <td class="px-6 py-4 text-[11px] font-medium text-slate-500">${txn.fee}</td>
                        <td class="px-6 py-4 font-bold text-slate-900 text-right">${txn.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td class="px-6 py-4 text-center">
                            <span class="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded">${txn.status}</span>
                        </td>
                    </tr>
                `;
            });


            const statsGrid = document.getElementById('dynamic-stats-grid');
            statsGrid.innerHTML = '';


            const totalExpected = activeFees.reduce((sum, f) => sum + (f.price * STUDENT_POPULATION), 0);
            const actualValue = currentReportData.reduce((sum, txn) => sum + txn.amount, 0);


            statsGrid.innerHTML += `
                <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div class="flex items-center justify-between mb-4">
                        <div class="bg-blue-100 p-2 rounded-lg text-blue-600"><i data-lucide="wallet" class="w-4 h-4"></i></div>
                    </div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Actual Total Collection</p>
                    <h3 class="text-3xl font-black text-slate-900">Php ${actualValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
                </div>
            `;


            statsGrid.innerHTML += `
                <div onclick="openBreakdown()" class="bg-white p-6 rounded-2xl border-2 border-slate-200 border-dashed shadow-sm cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all group">
                    <div class="flex items-center justify-between mb-4">
                        <div class="bg-emerald-100 p-2 rounded-lg text-emerald-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <i data-lucide="calculator" class="w-4 h-4"></i>
                        </div>
                        <span class="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded group-hover:bg-blue-600 group-hover:text-white transition-all">VIEW BREAKDOWN</span>
                    </div>
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Expected Total Collection</p>
                    <h3 class="text-3xl font-black text-slate-900">Php ${totalExpected.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
                </div>
            `;


            lucide.createIcons();
        }


        function openBreakdown() {
            const modal = document.getElementById('breakdown-modal');
            const content = document.getElementById('modal-content');
            const subtitle = document.getElementById('modal-subtitle');
           
            subtitle.innerText = `Calculation: Student Population (1,000) x Price`;
            content.innerHTML = '';


            activeFees.forEach(fee => {
                const total = fee.price * STUDENT_POPULATION;
                content.innerHTML += `
                    <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div>
                            <p class="text-[10px] font-black text-slate-400 uppercase">Expected ${fee.name}</p>
                            <p class="text-xs font-bold text-slate-600">Php ${fee.price} x 1,000 students</p>
                        </div>
                        <p class="font-black text-slate-900 text-base">Php ${total.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                    </div>
                `;
            });


            modal.classList.remove('hidden');
            lucide.createIcons();
        }


        function closeModal() {
            document.getElementById('breakdown-modal').classList.add('hidden');
        }


        function downloadExcel() {
            if (currentReportData.length === 0) return;
            const range = document.getElementById('report-range').value;
            const selection = document.getElementById(`date-picker-${range}`).value;
           
            const acadWeekActual = currentReportData.filter(t => t.fee.includes("Acad Week")).reduce((sum, t) => sum + 300, 0);
            const ssgActual = currentReportData.filter(t => t.fee.includes("SSG Fee")).reduce((sum, t) => sum + 350, 0);
            const totalActual = acadWeekActual + ssgActual;


            let csv = `TRANSACTION LOG,,,,,STATUS,,BREAKDOWN\n`;
            csv += `Reference ID,Student ID,Student Name,Allocated Fees,Total Amount,Status,,Metric,Value\n`;
           
            const maxRows = Math.max(currentReportData.length, 8);
           
            for (let i = 0; i < maxRows; i++) {
                let row = "";
                if (i < currentReportData.length) {
                    const t = currentReportData[i];
                    row += `${t.id},${t.studentId},${t.student},"${t.fee}",${t.amount},${t.status}`;
                } else {
                    row += `,,,,,`;
                }
                row += `,,`;


                if (i === 0) row += `Report Period,${selection}`;
                if (i === 1) row += `Population,1000 Students`;
                if (i === 2) row += `,,`;
                if (i === 3) row += `Collection Breakdown,`;
                if (i === 4) row += `Acad Week Fee (Total),Php ${acadWeekActual.toFixed(2)}`;
                if (i === 5) row += `SSG Fee (Total),Php ${ssgActual.toFixed(2)}`;
                if (i === 6) row += `,,`;
                if (i === 7) row += `TOTAL COLLECTION,Php ${totalActual.toFixed(2)}`;


                csv += row + `\n`;
            }


            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `DocuMint_Financial_Report_${selection}.csv`;
            link.click();
        }


        function handleLogout() { location.reload(); }
        window.onload = () => { lucide.createIcons(); };
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