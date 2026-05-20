import {
  LEAD_INTAKE_ENDPOINT,
  SUPABASE_PUBLISHABLE_KEY,
} from "./supabase-config.js";

const form = document.getElementById("intakeForm");
const toast = document.getElementById("toast");

function showToast(message) {
  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 2800);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    full_name: document.getElementById("publicName").value.trim(),
    phone: document.getElementById("publicPhone").value.trim(),
    email: document.getElementById("publicEmail").value.trim() || null,
    source_channel: document.getElementById("publicChannel").value,
    event_date: document.getElementById("publicEventDate").value || null,
    event_type: document.getElementById("publicEventType").value.trim() || null,
    message: document.getElementById("publicMessage").value.trim(),
  };

  const response = await fetch(LEAD_INTAKE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    showToast(result.error || "Errore durante il salvataggio del lead");
    return;
  }

  form.reset();
  showToast("Richiesta inviata correttamente");
});

