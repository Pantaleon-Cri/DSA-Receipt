   // --- State ---
        let selectedCollege = 'ALL';
        let currentStatusFilter = 'All';
        let selectedYear = 2025;
        let chartInstance = null;
        let sidebarExpanded = true;


        const COLLEGES = ['CED', 'CAS', 'CBA', 'CEAC', 'CHS'];
        const NAMES = ['Aldrin Santos', 'Beatriz Cruz', 'Charlie Mendoza', 'Diana Ross', 'Ethan Hunt', 'Fiona Gallagher', 'George Miller', 'Hannah Abbott', 'Ivan Drago', 'Julia Roberts', 'Kevin Hart', 'Lana Del Rey', 'Mike Tyson', 'Nina Simone', 'Oscar Isaac', 'Peter Parker', 'Quinn Fabray', 'Rachel Green', 'Steve Rogers', 'Tony Stark'];


        const database = Array.from({length: 120}, (_, i) => ({
            id: `2025-${String(i+1).padStart(4, '0')}`,
            name: NAMES[i % NAMES.length] + (i > NAMES.length ? ` ${i}` : ''),
            college: COLLEGES[i % COLLEGES.length],
            status: Math.random() > 0.4 ? 'Paid' : 'Unpaid'
        }));


        // --- Calendar Picker Logic ---
        function initYearGrid() {
            const grid = document.getElementById('year-grid');
            grid.innerHTML = '';
            for (let y = 2020; y <= 2030; y++) {
                const item = document.createElement('div');
                item.className = `year-grid-item ${y === selectedYear ? 'selected' : ''}`;
                item.innerText = y;
                item.onclick = (e) => { e.stopPropagation(); selectYear(y); };
                grid.appendChild(item);
            }
        }


        function toggleYearDropdown() { document.getElementById('year-dropdown').classList.toggle('show'); }
        function selectYear(year) {
            selectedYear = year;
            document.getElementById('current-ay-display').innerText = `A.Y. ${year} - ${year + 1}`;
            document.getElementById('year-dropdown').classList.remove('show');
            initYearGrid();
            updateDashboard();
        }


        // --- Sidebar ---
        function toggleSidebar() {
            sidebarExpanded = !sidebarExpanded;
            const sb = document.getElementById('sidebar');
            const icon = document.getElementById('sidebar-toggle-icon');
            sb.classList.toggle('sidebar-expanded', sidebarExpanded);
            sb.classList.toggle('sidebar-collapsed', !sidebarExpanded);
            icon.setAttribute('data-lucide', sidebarExpanded ? 'chevron-left' : 'menu');
            document.querySelectorAll('.sidebar-text').forEach(t => t.classList.toggle('hidden', !sidebarExpanded));
            lucide.createIcons();
        }


        // --- Core Logic ---
        function selectCollege(code) {
            selectedCollege = code;
            currentStatusFilter = 'All';
            document.querySelectorAll('.college-card').forEach(c => c.classList.remove('active'));
            document.getElementById(`college-${code}`).classList.add('active');
            updateDashboard();
        }


        function filterListByStatus(status) {
            currentStatusFilter = status;
            updateDashboard();
        }


        function updateDashboard() {
            document.getElementById('preview-college-label').innerText = selectedCollege;
            document.getElementById('preview-status-label').innerText = currentStatusFilter;


            const filteredByCollege = database.filter(s => selectedCollege === 'ALL' || s.college === selectedCollege);
            const paidCount = filteredByCollege.filter(s => s.status === 'Paid').length;
            const unpaidCount = filteredByCollege.length - paidCount;


            document.getElementById('stat-paid').innerText = paidCount;
            document.getElementById('stat-unpaid').innerText = unpaidCount;


            renderChart(paidCount, unpaidCount);
           
            const listData = filteredByCollege.filter(s => currentStatusFilter === 'All' || s.status === currentStatusFilter);
            renderTable(listData);
        }


        function renderTable(data) {
            const tbody = document.getElementById('student-preview-body');
            tbody.innerHTML = '';
            data.slice(0, 5).forEach(s => {
                tbody.innerHTML += `
                    <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td class="py-5 font-bold text-slate-700">${s.name}</td>
                        <td class="py-5 text-slate-500 font-mono text-xs">${s.college}</td>
                        <td class="py-5 text-right">
                            <span class="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${s.status === 'Paid' ? 'bg-blue-100 text-blue-600' : 'bg-red-50 text-red-500'}">
                                ${s.status}
                            </span>
                        </td>
                    </tr>
                `;
            });
            document.getElementById('show-all-btn').classList.toggle('hidden', data.length <= 5);
        }


        function renderChart(paid, unpaid) {
            const ctx = document.getElementById('paymentChart').getContext('2d');
            if (chartInstance) chartInstance.destroy();
            const total = paid + unpaid;
            const pct = total > 0 ? Math.round((paid/total)*100) : 0;


            chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [paid, unpaid],
                        backgroundColor: ['#2563eb', '#f1f5f9'],
                        borderWidth: 0,
                        cutout: '82%'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { tooltip: { enabled: true } },
                    onClick: (_, el) => { if(el.length) filterListByStatus(el[0].index === 0 ? 'Paid' : 'Unpaid'); }
                },
                plugins: [{
                    id: 'text',
                    afterDraw: (c) => {
                        const {ctx, width, height} = c;
                        ctx.save();
                        ctx.font = 'bold 24px Inter';
                        ctx.fillStyle = '#1e293b';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${pct}%`, width/2, height/2);
                        ctx.restore();
                    }
                }]
            });
        }


        function openFullListModal() {
            const data = database.filter(s => (selectedCollege === 'ALL' || s.college === selectedCollege) && (currentStatusFilter === 'All' || s.status === currentStatusFilter));
            document.getElementById('modal-subtitle').innerText = `${selectedCollege} Unit | ${currentStatusFilter} Status`;
            const tbody = document.getElementById('modal-table-body');
            tbody.innerHTML = data.map(s => `
                <tr class="bg-slate-50/50 hover:bg-white border border-transparent hover:border-slate-200 transition-all rounded-lg">
                    <td class="p-5 font-mono text-xs text-blue-600 font-bold">${s.id}</td>
                    <td class="p-5 font-bold text-slate-800">${s.name}</td>
                    <td class="p-5 text-slate-500 font-semibold uppercase text-xs">${s.college}</td>
                    <td class="p-5 text-right">
                        <span class="px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider ${s.status === 'Paid' ? 'bg-blue-100 text-blue-600' : 'bg-red-50 text-red-500'}">${s.status}</span>
                    </td>
                </tr>
            `).join('');
            document.getElementById('full-list-modal').classList.remove('hidden');
        }


        function closeFullListModal() { document.getElementById('full-list-modal').classList.add('hidden'); }


        window.onclick = (e) => { if(!e.target.closest('.relative')) document.getElementById('year-dropdown').classList.remove('show'); };
       
        window.onload = () => {
            initYearGrid();
            updateDashboard();
            lucide.createIcons();
        };

        