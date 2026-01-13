const state = {
  loginError: '',
  isLoading: false
};

function renderLogin() {
  return `
  <div class="min-h-screen flex items-center justify-center bg-slate-50 p-4">
    <div class="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-10 border border-white relative overflow-hidden">

      <div class="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>

      <div class="flex flex-col items-center mb-10">
        <div class="bg-blue-600 p-4 rounded-2xl shadow-xl shadow-blue-200 mb-6">
          <!-- Receipt icon (example) -->
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-li
            necap="round" stroke-linejoin="round" d="M9 17v-2h6v2m-6-4v-2h6v2M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 class="text-3xl font-black text-slate-800 tracking-tight">DocuMint</h1>
        <p class="text-slate-400 font-medium mt-1 uppercase text-xs tracking-[0.2em]">
          Secure Ledger Access
        </p>
      </div>

      <form id="login-form" class="space-y-6">
        <!-- User ID -->
        <div>
          <label class="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">User Identification</label>
          <div class="relative mt-2">
            <!-- Custom user SVG -->
            <img src="/assets/user-svgrepo-com.svg" class="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5" alt="User Icon"/>
            <input
              id="login-id"
              type="text"
              placeholder="Enter ID"
              required
              class="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600 focus:bg-white transition-all font-medium"
            />
          </div>
        </div>

        <!-- Password -->
        <div>
          <label class="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
          <div class="relative mt-2">
            <!-- Custom lock SVG -->
            <img src="/assets/lock-password-svgrepo-com.svg" class="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5" alt="Lock Icon"/>
            <input
              id="login-pass"
              type="password"
              placeholder="••••••••"
              required
              class="w-full pl-12 pr-12 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-600 focus:bg-white transition-all font-medium"
            />
          </div>
        </div>

        ${
          state.loginError
            ? `<div class="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl flex items-center gap-2 animate-bounce">
                 <img src="alert-circle-svgrepo-com.svg" class="w-4 h-4" alt="Error Icon"/>
                 ${state.loginError}
               </div>`
            : ''
        }

        <button type="submit" class="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition-all active:scale-[0.97] shadow-xl shadow-blue-200 flex justify-center items-center gap-2">
          ${state.isLoading ? 'VERIFYING...' : 'LOGIN'}
        </button>
      </form>

      

    </div>
  </div>
  `;
}

// Handle login
function handleLogin(e) {
  e.preventDefault();
  const userId = document.getElementById('login-id').value;
  const password = document.getElementById('login-pass').value;

  state.isLoading = true;
  updateUI();

  // Send login info to backend
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password })
  })
  .then(res => res.json())
  .then(data => {
    state.isLoading = false;

    if (data.success) {
      state.loginError = '';
      updateUI();

      // ✅ Store the full user info in localStorage
      localStorage.setItem('loggedUser', JSON.stringify({
        user_id: data.user.user_id,
        user_firstName: data.user.user_firstName,
        user_lastName: data.user.user_lastName
      }));

      // Redirect to dashboard
      window.location.href = "dashboard.html";
    } else {
      state.loginError = data.message || "Invalid ID or Password";
      updateUI();
    }
  })
  .catch(err => {
    state.isLoading = false;
    state.loginError = "Server error, try again later";
    updateUI();
    console.error(err);
  });
}



// Update UI
function updateUI() {
  document.getElementById('app').innerHTML = renderLogin();
  document.getElementById('login-form').addEventListener('submit', handleLogin);
}

// Initial render
document.addEventListener('DOMContentLoaded', updateUI);
