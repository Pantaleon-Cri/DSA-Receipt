
  function refreshIcons() {
    try { lucide.createIcons(); } catch (e) {}
  }

  // If you don't already have a toggleModal() in student.js
  window.toggleModal = window.toggleModal || function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("hidden");
    refreshIcons();
  };

  // -----------------------
  // CONFIRM MODAL
  // -----------------------
  let __confirmAction = null;

  window.openConfirm = function ({
    title = "Confirm",
    subtitle = "Please confirm your action.",
    message = "Are you sure you want to continue?",
    okText = "Yes, Continue",
    okClass = "bg-slate-900 hover:bg-slate-800",
    onConfirm = null
  } = {}) {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-subtitle").textContent = subtitle;
    document.getElementById("confirm-message").textContent = message;

    const okBtn = document.getElementById("confirm-ok");
    okBtn.textContent = okText;
    okBtn.className = "px-4 py-2 text-white rounded-xl text-xs font-black uppercase transition " + okClass;

    __confirmAction = typeof onConfirm === "function" ? onConfirm : null;

    toggleModal("modal-confirm");

    okBtn.onclick = async () => {
      closeConfirm();
      if (__confirmAction) await __confirmAction();
      __confirmAction = null;
    };

    refreshIcons();
  };

  window.closeConfirm = function () {
    const el = document.getElementById("modal-confirm");
    if (el) el.classList.add("hidden");
    __confirmAction = null;
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
    const wrap = document.getElementById("alert-icon-wrap");
    const icon = document.getElementById("alert-icon");

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

    document.getElementById("alert-title").textContent = title;
    document.getElementById("alert-subtitle").textContent = subtitle;
    document.getElementById("alert-message").textContent = message;

    toggleModal("modal-alert");
    refreshIcons();
  };

  window.closeAlert = function () {
    const el = document.getElementById("modal-alert");
    if (el) el.classList.add("hidden");
  };

  // -----------------------
  // IMPORT RESULT MODAL
  // -----------------------
  window.showImportResult = function(uploaded = 0, skipped = 0) {
    document.getElementById("import-uploaded").textContent = String(uploaded);
    document.getElementById("import-skipped").textContent = String(skipped);
    toggleModal("modal-import-result");
    refreshIcons();
  };

  // -----------------------
  // WRAPPERS YOU CALL FROM BUTTONS
  // -----------------------
  window.requestUpdateTerm = function () {
    openConfirm({
      title: "Update Term",
      subtitle: "This will change the active academic year/semester.",
      message: "Proceed updating the term now?",
      okText: "Yes, Update",
      okClass: "bg-slate-900 hover:bg-slate-800",
      onConfirm: async () => {
        if (typeof window.updateSemester === "function") {
          await window.updateSemester();
          openAlert({ type: "success", title: "Updated", message: "Active term updated successfully." });
        } else {
          openAlert({ type: "error", title: "Error", message: "updateSemester() not found." });
        }
      }
    });
  };

  window.requestUpdateYear = function () {
    openConfirm({
      title: "Save Academic Year",
      subtitle: "This will update the selected year name.",
      message: "Save changes to the academic year?",
      okText: "Yes, Save",
      okClass: "bg-blue-600 hover:bg-blue-700",
      onConfirm: async () => {
        if (typeof window.updateYear === "function") {
          await window.updateYear();
          openAlert({ type: "success", title: "Saved", message: "Academic year updated successfully." });
        } else {
          openAlert({ type: "error", title: "Error", message: "updateYear() not found." });
        }
      }
    });
  };

  window.requestUpdateSemesterName = function () {
    openConfirm({
      title: "Save Semester",
      subtitle: "This will update the selected semester name.",
      message: "Save changes to the semester?",
      okText: "Yes, Save",
      okClass: "bg-green-600 hover:bg-green-700",
      onConfirm: async () => {
        if (typeof window.updateSemesterName === "function") {
          await window.updateSemesterName();
          openAlert({ type: "success", title: "Saved", message: "Semester updated successfully." });
        } else {
          openAlert({ type: "error", title: "Error", message: "updateSemesterName() not found." });
        }
      }
    });
  };

  refreshIcons();

