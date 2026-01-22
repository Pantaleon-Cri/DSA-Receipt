// modal.js  ✅ UPDATED (Promise-based confirm + no duplicate wrapper conflicts)

(function () {
  function refreshIcons() {
    try { window.lucide?.createIcons?.(); } catch (e) {}
  }

  // Use existing toggleModal if student.js defines it; otherwise provide a safe fallback.
  window.toggleModal = window.toggleModal || function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("hidden");
    refreshIcons();
  };

  // -----------------------
  // CONFIRM MODAL (Promise-based)
  // -----------------------
  let __confirmResolve = null;

  window.openConfirm = function ({
    title = "Confirm",
    subtitle = "Please confirm your action.",
    message = "Are you sure you want to continue?",
    okText = "Yes, Continue",
    okClass = "bg-slate-900 hover:bg-slate-800",
    cancelText = "Cancel"
  } = {}) {
    const modal = document.getElementById("modal-confirm");
    const titleEl = document.getElementById("confirm-title");
    const subEl = document.getElementById("confirm-subtitle");
    const msgEl = document.getElementById("confirm-message");

    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    if (!modal || !titleEl || !subEl || !msgEl || !okBtn || !cancelBtn) {
      // Fallback to browser confirm if modal elements are missing
      return Promise.resolve(confirm(String(message ?? "Continue?")));
    }

    titleEl.textContent = title;
    subEl.textContent = subtitle;
    msgEl.textContent = message;

    okBtn.textContent = okText;
    okBtn.className =
      "px-4 py-2 text-white rounded-xl text-xs font-black uppercase transition " + okClass;

    cancelBtn.textContent = cancelText;

    // Clean previous handlers (important!)
    okBtn.onclick = null;
    cancelBtn.onclick = null;

    // Open modal (force show)
    modal.classList.remove("hidden");

    // Return a Promise<boolean>
    return new Promise((resolve) => {
      __confirmResolve = resolve;

      okBtn.onclick = () => {
        window.closeConfirm(true);
      };

      cancelBtn.onclick = () => {
        window.closeConfirm(false);
      };

      refreshIcons();
    });
  };

  window.closeConfirm = function (result = false) {
    const modal = document.getElementById("modal-confirm");
    if (modal) modal.classList.add("hidden");

    if (typeof __confirmResolve === "function") {
      const done = __confirmResolve;
      __confirmResolve = null;
      done(Boolean(result));
    } else {
      __confirmResolve = null;
    }
  };

  // -----------------------
  // ALERT MODAL
  // -----------------------
  window.openAlert = function ({
    type = "info", // info | success | error | warning
    title = "Notice",
    subtitle = "",
    message = ""
  } = {}) {
    const modal = document.getElementById("modal-alert");
    const wrap = document.getElementById("alert-icon-wrap");
    const icon = document.getElementById("alert-icon");
    const titleEl = document.getElementById("alert-title");
    const subEl = document.getElementById("alert-subtitle");
    const msgEl = document.getElementById("alert-message");

    if (!modal || !wrap || !icon || !titleEl || !subEl || !msgEl) {
      alert(String(message ?? ""));
      return;
    }

    wrap.className = "w-10 h-10 rounded-2xl flex items-center justify-center";

    if (type === "success") {
      wrap.classList.add("bg-green-100", "text-green-700");
      icon.setAttribute("data-lucide", "check-circle");
    } else if (type === "error") {
      wrap.classList.add("bg-red-100", "text-red-700");
      icon.setAttribute("data-lucide", "x-circle");
    } else if (type === "warning") {
      wrap.classList.add("bg-amber-100", "text-amber-700");
      icon.setAttribute("data-lucide", "alert-triangle");
    } else {
      wrap.classList.add("bg-blue-100", "text-blue-700");
      icon.setAttribute("data-lucide", "info");
    }

    titleEl.textContent = title;
    subEl.textContent = subtitle;
    msgEl.textContent = String(message ?? "");

    modal.classList.remove("hidden");
    refreshIcons();
  };

  window.closeAlert = function () {
    const el = document.getElementById("modal-alert");
    if (el) el.classList.add("hidden");
  };

  // -----------------------
  // IMPORT RESULT MODAL
  // -----------------------
  window.showImportResult = function (uploaded = 0, skipped = 0, invalid = 0) {
    const upEl = document.getElementById("import-uploaded");
    const skEl = document.getElementById("import-skipped");
    const modal = document.getElementById("modal-import-result");

    if (upEl) upEl.textContent = String(uploaded);
    if (skEl) skEl.textContent = String(skipped);

    if (modal) modal.classList.remove("hidden");
    refreshIcons();
  };

  // -----------------------
  // WRAPPERS YOU CALL FROM BUTTONS
  // IMPORTANT: these now call the functions defined in student.js:
  // - requestUpdateTerm -> window.requestUpdateTerm (already defined in student.js)
  // - requestUpdateYear -> expects window.updateYear()
  // - requestUpdateSemesterName -> expects window.updateSemesterName()
  // -----------------------

  // ✅ DO NOT override student.js requestUpdateTerm.
  // If student.js is present, keep it.
  // If not present, provide fallback wrapper.
  window.requestUpdateTerm = window.requestUpdateTerm || (async function () {
    const ok = await openConfirm({
      title: "Update Term",
      subtitle: "This will change the active academic year/semester.",
      message: "Proceed updating the term now?",
      okText: "Yes, Update",
      okClass: "bg-slate-900 hover:bg-slate-800",
      cancelText: "Cancel"
    });

    if (!ok) return;

    if (typeof window.updateSemester === "function") {
      await window.updateSemester();
      openAlert({ type: "success", title: "Updated", message: "Active term updated successfully." });
    } else {
      openAlert({ type: "error", title: "Error", message: "updateSemester() not found." });
    }
  });

  window.requestUpdateYear = async function () {
    const ok = await openConfirm({
      title: "Save Academic Year",
      subtitle: "This will update the selected year name.",
      message: "Save changes to the academic year?",
      okText: "Yes, Save",
      okClass: "bg-blue-600 hover:bg-blue-700",
      cancelText: "Cancel"
    });

    if (!ok) return;

    try {
      if (typeof window.updateYear === "function") {
        await window.updateYear();
        openAlert({ type: "success", title: "Saved", message: "Academic year updated successfully." });
      } else {
        openAlert({ type: "error", title: "Error", message: "updateYear() not found." });
      }
    } catch (e) {
      console.error(e);
      openAlert({ type: "error", title: "Error", message: e?.message || "Failed to update year." });
    }
  };

  window.requestUpdateSemesterName = async function () {
    const ok = await openConfirm({
      title: "Save Semester",
      subtitle: "This will update the selected semester name.",
      message: "Save changes to the semester?",
      okText: "Yes, Save",
      okClass: "bg-green-600 hover:bg-green-700",
      cancelText: "Cancel"
    });

    if (!ok) return;

    try {
      if (typeof window.updateSemesterName === "function") {
        await window.updateSemesterName();
        openAlert({ type: "success", title: "Saved", message: "Semester updated successfully." });
      } else {
        openAlert({ type: "error", title: "Error", message: "updateSemesterName() not found." });
      }
    } catch (e) {
      console.error(e);
      openAlert({ type: "error", title: "Error", message: e?.message || "Failed to update semester." });
    }
  };

  refreshIcons();
})();
