 let studentDb = [];
        let activeStudent = null;
        const COLLEGES = ['CED', 'CAS', 'CBA', 'CEAC', 'CHS'];
        const NAMES = ['Aldrin Santos', 'Beatriz Cruz', 'Charlie Mendoza', 'Diana Ross', 'Ethan Hunt', 'Fiona Gallagher', 'George Miller', 'Hannah Abbott', 'Ivan Drago', 'Julia Roberts', 'Kevin Hart', 'Lana Del Rey', 'Mike Tyson', 'Nina Simone', 'Oscar Isaac', 'Peter Parker', 'Quinn Fabray', 'Rachel Green', 'Steve Rogers', 'Tony Stark'];
        
        function initData() {
            for(let i=1; i<=60; i++) {
                studentDb.push({
                    id: `2025-${String(i).padStart(4, '0')}`,
                    name: NAMES[i % NAMES.length] + (i > 20 ? ` ${i}` : ''),
                    college: COLLEGES[i % COLLEGES.length],
                    status: Math.random() > 0.5 ? 'Paid' : 'Unpaid'
                });
            }
        }
        
        
        function filterStudents() {
            const search = document.getElementById('search-id').value.toLowerCase();
            const status = document.getElementById('filter-status').value;
            const college = document.getElementById('filter-college').value;
            const filtered = studentDb.filter(s => {
                const matchesSearch = s.id.toLowerCase().includes(search) || s.name.toLowerCase().includes(search);
                const matchesStatus = status === 'All' || s.status === status;
                const matchesCollege = college === 'All' || s.college === college;
                return matchesSearch && matchesStatus && matchesCollege;
            });
            renderStudents(filtered);
        }
        
        function renderStudents(data) {
            const tbody = document.getElementById('student-table-body');
            tbody.innerHTML = '';
            
            data.forEach(s => {
                const statusColor = s.status === 'Paid' ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50';
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50/50 transition-colors">
                        <td class="px-6 py-4 font-mono text-xs font-bold text-blue-600">${s.id}</td>
                        <td class="px-6 py-4 font-bold text-slate-800">${s.name}</td>
                        <td class="px-6 py-4 text-xs font-bold text-slate-500 uppercase">${s.college}</td>
                        <td class="px-6 py-4">
                            <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${statusColor}">${s.status}</span>
                        </td>
                        <td class="px-6 py-4 text-right">
                            <button onclick="openPayment('${s.id}')" class="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase rounded-lg hover:bg-blue-600 transition-all">Process</button>
                        </td>
                    </tr>
                `;
            });
            if(data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="py-20 text-center text-slate-400 italic">No records found matching your filters</td></tr>`;
            }
        }
        
        function openPayment(id) {
            activeStudent = studentDb.find(s => s.id === id);
            document.getElementById('pay-student-name').innerText = `${activeStudent.name} (${activeStudent.id})`;
            document.getElementById('rec-student').innerText = activeStudent.name;
            
            const issuerName = document.getElementById('current-user-name').innerText;
            document.getElementById('rec-issuer-name').innerText = issuerName;
            
            // Reset checkboxes and total
            document.querySelectorAll('.fee-checkbox').forEach(cb => cb.checked = false);
            calculateTotal();
            
            document.getElementById('payment-modal').classList.remove('hidden');
        }
        
        function closePayment() {
            document.getElementById('payment-modal').classList.add('hidden');
            activeStudent = null;
        }
        
        function calculateTotal() {
            let total = 0;
            const selectedList = document.getElementById('rec-fees-list');
            selectedList.innerHTML = '';
            
            document.querySelectorAll('.fee-checkbox:checked').forEach(cb => {
                const fee = cb.getAttribute('data-fee');
                const price = parseFloat(cb.getAttribute('data-price'));
                total += price;
                selectedList.innerHTML += `
                    <div class="flex justify-between items-center text-slate-600">
                        <span>• ${fee}</span>
                        <span class="font-mono">₱${price.toLocaleString()}</span>
                    </div>
                `;
            });
            
            if(total === 0) selectedList.innerHTML = '<p class="text-slate-400 italic">No fees selected</p>';
            
            const formattedTotal = `₱${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            document.getElementById('total-display').innerText = formattedTotal;
            document.getElementById('rec-total').innerText = formattedTotal;
        }
        
        function issueAndPrint() {
            const totalText = document.getElementById('total-display').innerText;
            const total = parseFloat(totalText.replace(/[₱,]/g, ''));
            
            if(total === 0) {
                console.error("Cannot issue receipt: Total amount is zero. Please select fees.");
                // In a real application, display a user-friendly modal error here
                return;
            }
            
            // 1. Update active student status (in-memory simulation)
            if (activeStudent) {
                activeStudent.status = 'Paid';
            }

            // 2. Generate transaction details and update preview
            document.getElementById('rec-tid').innerText = 'TXN-' + Math.random().toString(36).substr(2, 9).toUpperCase();
            document.getElementById('rec-date').innerText = new Date().toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            // 3. Get the content of the receipt DATA ONLY section
            const receiptDataContent = document.getElementById('receipt-data-content').innerHTML;
            
            // Logo URL for the placeholder
            const logoUrl = "https://placehold.co/80x80/2563eb/ffffff?text=U+Logo";

            // 4. Build the single print HTML structure (Student Copy)
            const singleReceiptHtml = `
                <div class="receipt-copy">
                    <!-- Header with centered logo and title -->
                  <div class="text-center mb-6">
    <!-- Logos side by side -->
    <div style="display: flex; justify-content: center; gap: 8px; margin-bottom: 8px;">
        <img src="/assets/right-logo.jpg" alt="Left Logo" style="height: 50px; width: 50px; object-fit: contain;">
        <img src="/assets/left-logo.png" alt="Right Logo" style="height: 50px; width: 50px; object-fit: contain;">
    </div>

    <!-- Centered Title and Subtitle -->
    <h4 class="text-lg font-black tracking-tighter text-blue-800" style="color: #1e293b !important; margin: 0;">
        ACKNOWLEDGEMENT RECEIPT
    </h4>
    <p class="text-[10px] font-bold text-slate-400 uppercase" style="margin: 0;">
         Notre Dame of Marbel University<br>
        Supreme Student Government<br>
        City of Koronadal South Cotabato

    </p>
</div>

                    
                    <!-- Receipt content (cloned from the modal preview data) -->
                    ${receiptDataContent}
                </div>
            `;
            
            // 5. Wrap the single copy in a layout container for a single page print
            const printContainer = document.getElementById('print-container');
            printContainer.innerHTML = `
                <div class="print-page-layout">
                    ${singleReceiptHtml}
                </div>
            `;
            
            // 6. Apply print class to body and refresh UI
            document.body.classList.add('printing');
            filterStudents(); // Update table row status

            // 7. Trigger print and clean up
            setTimeout(() => {
                window.print();
                
                // Clean up after print dialog is initiated
                setTimeout(() => {
                    document.body.classList.remove('printing');
                    printContainer.innerHTML = '';
                    closePayment();
                }, 500); 

            }, 100);
        }
        
        window.onload = () => {
            initData();
            filterStudents();
            lucide.createIcons();
        };
        function toggleModal(id) {
    const modal = document.getElementById(id);
    modal.classList.toggle('hidden'); // Adds/removes the 'hidden' class
}
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

