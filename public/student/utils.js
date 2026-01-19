// utils.js

// ----------------- TOTAL LOCKING -----------------
// Locks only the SELECTION total (checkbox total displayed in #total-display)
let lockedTotal = null;

// Optional: lock receipt total separately if you want to prevent changes
let lockedReceiptTotal = null;

// ----------------- HELPERS -----------------
function formatPeso(total) {
  return `₱${Number(total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

// Updates only the selection total display (NOT the receipt)
function updateSelectionTotalDisplay(total) {
  const totalDisplay = document.getElementById('total-display');
  if (totalDisplay) totalDisplay.innerText = formatPeso(total);
}

// Updates only the receipt total display
function updateReceiptTotalDisplay(total) {
  const recTotal = document.getElementById('rec-total');
  if (recTotal) recTotal.innerText = formatPeso(total);
}

// ----------------- PUBLIC API -----------------

// Lock selection total to a fixed amount (useful after PAY if you still show selection total)
export function lockTotal(amountNumber) {
  const n = Number(amountNumber);
  lockedTotal = Number.isFinite(n) ? n : 0;
  updateSelectionTotalDisplay(lockedTotal);
}

// Unlock selection total and recompute from checkboxes
export function unlockTotal() {
  lockedTotal = null;
  calculateTotalFees(); // recompute selection total only
}

// Set receipt total explicitly (use this from your receipt renderers if needed)
export function setReceiptTotal(amountNumber) {
  const n = Number(amountNumber);
  const value = Number.isFinite(n) ? n : 0;

  // If receipt is locked, keep locked value
  if (lockedReceiptTotal !== null) {
    updateReceiptTotalDisplay(lockedReceiptTotal);
    return lockedReceiptTotal;
  }

  updateReceiptTotalDisplay(value);
  return value;
}

// Optional: lock receipt total so nothing else overwrites it
export function lockReceiptTotal(amountNumber) {
  const n = Number(amountNumber);
  lockedReceiptTotal = Number.isFinite(n) ? n : 0;
  updateReceiptTotalDisplay(lockedReceiptTotal);
}

// Optional: unlock receipt total (allows future setReceiptTotal calls to change it)
export function unlockReceiptTotal() {
  lockedReceiptTotal = null;
}

// ✅ Computes ONLY the current selection total (unpaid checked fees)
// ✅ Updates ONLY #total-display (does NOT touch #rec-total)
export function calculateTotalFees() {
  // if locked, do not recalc selection total
  if (lockedTotal !== null) {
    updateSelectionTotalDisplay(lockedTotal);
    return lockedTotal;
  }

  let total = 0;

  const checked = document.querySelectorAll('#fees-container .fee-checkbox:checked');
  checked.forEach(cb => {
    if (cb.disabled) return; // already paid
    const price = parseFloat(cb.dataset.price || cb.getAttribute('data-price') || '0') || 0;
    total += price;
  });

  updateSelectionTotalDisplay(total);
  return total;
}

// ----------------- SIDEBAR -----------------
export function toggleSidebar(sidebarId = 'sidebar', iconId = 'sidebar-toggle-icon') {
  const sidebar = document.getElementById(sidebarId);
  const icon = document.getElementById(iconId);

  if (!sidebar || !icon) return;

  sidebar.classList.toggle('sidebar-expanded');
  sidebar.classList.toggle('sidebar-collapsed');

  document.querySelectorAll('.sidebar-text').forEach(el => el.classList.toggle('hidden'));

  icon.setAttribute(
    'data-lucide',
    sidebar.classList.contains('sidebar-expanded') ? 'chevron-left' : 'menu'
  );

  if (window.lucide) window.lucide.createIcons();
}
