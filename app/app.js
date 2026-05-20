import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
} from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  session: null,
  profile: null,
  profiles: [],
  leads: [],
  messages: [],
  notes: [],
  selectedLeadId: null,
  refreshInFlight: false,
};

let refreshTimer = null;

const els = {
  loginForm: document.getElementById("loginForm"),
  emailInput: document.getElementById("emailInput"),
  sessionBox: document.getElementById("sessionBox"),
  profileBadge: document.getElementById("profileBadge"),
  logoutButton: document.getElementById("logoutButton"),
  refreshButton: document.getElementById("refreshButton"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  leadList: document.getElementById("leadList"),
  leadCountLabel: document.getElementById("leadCountLabel"),
  metricTotal: document.getElementById("metricTotal"),
  metricOpen: document.getElementById("metricOpen"),
  metricBooked: document.getElementById("metricBooked"),
  leadTitle: document.getElementById("leadTitle"),
  leadMeta: document.getElementById("leadMeta"),
  leadStatusBadge: document.getElementById("leadStatusBadge"),
  messageList: document.getElementById("messageList"),
  messageForm: document.getElementById("messageForm"),
  messageInput: document.getElementById("messageInput"),
  leadForm: document.getElementById("leadForm"),
  fullNameInput: document.getElementById("fullNameInput"),
  phoneInput: document.getElementById("phoneInput"),
  leadEmailInput: document.getElementById("leadEmailInput"),
  channelInput: document.getElementById("channelInput"),
  leadStatusInput: document.getElementById("leadStatusInput"),
  priorityInput: document.getElementById("priorityInput"),
  eventDateInput: document.getElementById("eventDateInput"),
  eventTypeInput: document.getElementById("eventTypeInput"),
  serviceTypeInput: document.getElementById("serviceTypeInput"),
  guestCountInput: document.getElementById("guestCountInput"),
  appointmentAtInput: document.getElementById("appointmentAtInput"),
  assignedToInput: document.getElementById("assignedToInput"),
  appointmentNotesInput: document.getElementById("appointmentNotesInput"),
  noteForm: document.getElementById("noteForm"),
  noteInput: document.getElementById("noteInput"),
  noteList: document.getElementById("noteList"),
  toast: document.getElementById("toast"),
};

const statusMeta = {
  new: { label: "Nuovo", className: "status-new" },
  contacted: { label: "Contattato", className: "status-contacted" },
  booked: { label: "Appuntamento fissato", className: "status-booked" },
  recall: { label: "Da ricontattare", className: "status-recall" },
  closed_lost: { label: "Chiuso negativo", className: "status-closed_lost" },
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    els.toast.style.display = "none";
  }, 2800);
}

function formatDate(value) {
  if (!value) return "Non definita";
  const date = new Date(value);
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined,
  }).format(date);
}

function getSelectedLead() {
  return state.leads.find((lead) => lead.id === state.selectedLeadId) || null;
}

function buildStatusBadge(status) {
  const meta = statusMeta[status] || { label: status, className: "" };
  return `<span class="status-pill ${meta.className}">${meta.label}</span>`;
}

function renderMetrics() {
  const openStatuses = ["new", "contacted", "recall"];
  els.metricTotal.textContent = String(state.leads.length);
  els.metricOpen.textContent = String(
    state.leads.filter((lead) => openStatuses.includes(lead.status)).length
  );
  els.metricBooked.textContent = String(
    state.leads.filter((lead) => lead.status === "booked").length
  );
}

function renderOperators() {
  const options = [
    `<option value="">Non assegnato</option>`,
    ...state.profiles.map(
      (profile) =>
        `<option value="${profile.id}">${profile.full_name || profile.email || "Operatore"}</option>`
    ),
  ];
  els.assignedToInput.innerHTML = options.join("");
}

function filteredLeads() {
  const query = els.searchInput.value.trim().toLowerCase();
  const statusFilter = els.statusFilter.value;
  return state.leads.filter((lead) => {
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    const haystack = [
      lead.full_name,
      lead.phone,
      lead.email,
      lead.source_channel,
      lead.event_type,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return matchesStatus && haystack.includes(query);
  });
}

function renderLeadList() {
  const visibleLeads = filteredLeads();
  els.leadCountLabel.textContent = `${visibleLeads.length} risultati`;
  if (!visibleLeads.length) {
    els.leadList.innerHTML = `<div class="muted small">Nessun lead trovato con i filtri attuali.</div>`;
    return;
  }

  els.leadList.innerHTML = visibleLeads
    .map(
      (lead) => `
        <article class="lead-card ${lead.id === state.selectedLeadId ? "active" : ""}" data-id="${lead.id}">
          <div class="lead-card-head">
            <div>
              <div class="lead-name">${lead.full_name}</div>
              <div class="muted small">${lead.source_channel} · ${lead.phone}</div>
            </div>
            ${buildStatusBadge(lead.status)}
          </div>
          <p class="muted small" style="margin-top:10px;">
            ${lead.event_type || "Tipologia non ancora indicata"} · Ultimo contatto ${formatDate(lead.last_message_at)}
          </p>
        </article>
      `
    )
    .join("");

  els.leadList.querySelectorAll(".lead-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedLeadId = card.dataset.id;
      renderAll();
    });
  });
}

function renderConversation() {
  const lead = getSelectedLead();
  if (!lead) {
    els.leadTitle.textContent = "Seleziona un lead";
    els.leadMeta.textContent = "Nessun lead selezionato";
    els.leadStatusBadge.className = "status-pill";
    els.leadStatusBadge.textContent = "In attesa";
    els.messageList.innerHTML = `<div class="muted small">Accedi e seleziona un lead per vedere la cronologia.</div>`;
    return;
  }

  const assigned = state.profiles.find((profile) => profile.id === lead.assigned_to);
  els.leadTitle.textContent = lead.full_name;
  els.leadMeta.textContent = [
    lead.source_channel,
    assigned?.full_name || "Non assegnato",
    lead.email || "Email non disponibile",
  ].join(" · ");

  const meta = statusMeta[lead.status] || { label: lead.status, className: "" };
  els.leadStatusBadge.className = `status-pill ${meta.className}`;
  els.leadStatusBadge.textContent = meta.label;

  const leadMessages = state.messages.filter((message) => message.lead_id === lead.id);
  if (!leadMessages.length) {
    els.messageList.innerHTML = `<div class="muted small">Ancora nessun messaggio registrato.</div>`;
    return;
  }

  els.messageList.innerHTML = leadMessages
    .map(
      (message) => `
        <div class="bubble ${message.direction}">
          ${message.body}
          <div class="muted small" style="margin-top:8px;">${formatDate(message.created_at)}</div>
        </div>
      `
    )
    .join("");
  els.messageList.scrollTop = els.messageList.scrollHeight;
}

function renderLeadDetail() {
  const lead = getSelectedLead();
  const disabled = !lead;

  [
    els.fullNameInput,
    els.phoneInput,
    els.leadEmailInput,
    els.channelInput,
    els.leadStatusInput,
    els.priorityInput,
    els.eventDateInput,
    els.eventTypeInput,
    els.serviceTypeInput,
    els.guestCountInput,
    els.appointmentAtInput,
    els.assignedToInput,
    els.appointmentNotesInput,
    els.messageInput,
    els.noteInput,
  ].forEach((input) => {
    input.disabled = disabled;
  });

  if (!lead) {
    els.leadForm.reset();
    els.noteList.innerHTML = `<div class="muted small">Nessuna nota da mostrare.</div>`;
    return;
  }

  els.fullNameInput.value = lead.full_name || "";
  els.phoneInput.value = lead.phone || "";
  els.leadEmailInput.value = lead.email || "";
  els.channelInput.value = lead.source_channel || "";
  els.leadStatusInput.value = lead.status || "new";
  els.priorityInput.value = lead.priority || "medium";
  els.eventDateInput.value = lead.event_date || "";
  els.eventTypeInput.value = lead.event_type || "";
  els.serviceTypeInput.value = lead.service_type || "";
  els.guestCountInput.value = lead.guest_count || "";
  els.appointmentAtInput.value = lead.appointment_at
    ? new Date(lead.appointment_at).toISOString().slice(0, 16)
    : "";
  els.assignedToInput.value = lead.assigned_to || "";
  els.appointmentNotesInput.value = lead.appointment_notes || "";

  const leadNotes = state.notes.filter((note) => note.lead_id === lead.id);
  els.noteList.innerHTML = leadNotes.length
    ? leadNotes
        .map(
          (note) => `
            <article class="note-card">
              <div>${note.note}</div>
              <div class="muted small" style="margin-top:8px;">${formatDate(note.created_at)}</div>
            </article>
          `
        )
        .join("")
    : `<div class="muted small">Ancora nessuna nota interna.</div>`;
}

function renderSession() {
  const active = Boolean(state.session);
  els.loginForm.classList.toggle("hidden", active);
  els.sessionBox.classList.toggle("hidden", !active);
  if (active) {
    const displayName =
      state.profile?.full_name || state.session.user?.email || "Operatore";
    els.profileBadge.textContent = `Sessione attiva: ${displayName}`;
  }
}

function renderAll() {
  renderSession();
  renderMetrics();
  renderOperators();
  renderLeadList();
  renderConversation();
  renderLeadDetail();
}

async function loadProfile() {
  if (!state.session?.user?.id) {
    state.profile = null;
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", state.session.user.id)
    .maybeSingle();

  if (error) throw error;
  state.profile = data;
}

async function loadProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) throw error;
  state.profiles = data || [];
}

async function loadLeads() {
  const { data, error } = await supabase
    .from("lead_dashboard")
    .select("*")
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  state.leads = data || [];
  if (!state.selectedLeadId && state.leads.length) {
    state.selectedLeadId = state.leads[0].id;
  }
  if (
    state.selectedLeadId &&
    !state.leads.some((lead) => lead.id === state.selectedLeadId)
  ) {
    state.selectedLeadId = state.leads[0]?.id || null;
  }
}

async function loadMessages() {
  if (!state.leads.length) {
    state.messages = [];
    return;
  }
  const ids = state.leads.map((lead) => lead.id);
  const { data, error } = await supabase
    .from("lead_messages")
    .select("*")
    .in("lead_id", ids)
    .order("created_at", { ascending: true });

  if (error) throw error;
  state.messages = data || [];
}

async function loadNotes() {
  if (!state.leads.length) {
    state.notes = [];
    return;
  }
  const ids = state.leads.map((lead) => lead.id);
  const { data, error } = await supabase
    .from("lead_notes")
    .select("*")
    .in("lead_id", ids)
    .order("created_at", { ascending: false });

  if (error) throw error;
  state.notes = data || [];
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (!state.session) return;
  refreshTimer = setInterval(() => {
    refreshData({ silent: true });
  }, 15000);
}

async function refreshData({ silent = false } = {}) {
  if (!state.session) {
    renderAll();
    return;
  }
  if (state.refreshInFlight) return;
  state.refreshInFlight = true;
  try {
    await loadProfile();
    await loadProfiles();
    await loadLeads();
    await Promise.all([loadMessages(), loadNotes()]);
    renderAll();
  } catch (error) {
    console.error(error);
    if (!silent) {
      showToast("Errore nel caricamento dati");
    }
  } finally {
    state.refreshInFlight = false;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = els.emailInput.value.trim();
  if (!email) return;
  const redirectTo = window.location.href;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    showToast(error.message);
    return;
  }
  showToast("Link di accesso inviato via email");
  els.emailInput.value = "";
}

async function handleLogout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast(error.message);
    return;
  }
  state.session = null;
  state.profile = null;
  state.leads = [];
  state.messages = [];
  state.notes = [];
  state.selectedLeadId = null;
  stopAutoRefresh();
  renderAll();
}

async function handleLeadSave(event) {
  event.preventDefault();
  const lead = getSelectedLead();
  if (!lead) return;

  const payload = {
    full_name: els.fullNameInput.value.trim(),
    phone: els.phoneInput.value.trim(),
    email: els.leadEmailInput.value.trim() || null,
    source_channel: els.channelInput.value.trim(),
    status: els.leadStatusInput.value,
    priority: els.priorityInput.value,
    event_date: els.eventDateInput.value || null,
    event_type: els.eventTypeInput.value.trim() || null,
    service_type: els.serviceTypeInput.value || null,
    guest_count: els.guestCountInput.value ? Number(els.guestCountInput.value) : null,
    appointment_at: els.appointmentAtInput.value
      ? new Date(els.appointmentAtInput.value).toISOString()
      : null,
    assigned_to: els.assignedToInput.value || null,
    appointment_notes: els.appointmentNotesInput.value.trim() || null,
  };

  const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
  if (error) {
    showToast(error.message);
    return;
  }
  showToast("Scheda lead aggiornata");
  await refreshData();
}

async function handleMessageSave(event) {
  event.preventDefault();
  const lead = getSelectedLead();
  const body = els.messageInput.value.trim();
  if (!lead || !body) return;

  const insertMessage = await supabase.from("lead_messages").insert({
    lead_id: lead.id,
    direction: "outgoing",
    body,
    created_by: state.session.user.id,
  });
  if (insertMessage.error) {
    showToast(insertMessage.error.message);
    return;
  }

  const updateLead = await supabase
    .from("leads")
    .update({
      last_message_at: new Date().toISOString(),
      status: lead.status === "new" ? "contacted" : lead.status,
    })
    .eq("id", lead.id);

  if (updateLead.error) {
    showToast(updateLead.error.message);
    return;
  }

  els.messageInput.value = "";
  showToast("Messaggio registrato");
  await refreshData();
}

async function handleNoteSave(event) {
  event.preventDefault();
  const lead = getSelectedLead();
  const note = els.noteInput.value.trim();
  if (!lead || !note) return;

  const { error } = await supabase.from("lead_notes").insert({
    lead_id: lead.id,
    note,
    created_by: state.session.user.id,
  });
  if (error) {
    showToast(error.message);
    return;
  }
  els.noteInput.value = "";
  showToast("Nota salvata");
  await refreshData();
}

async function initSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  state.session = session;
  renderAll();
  if (session) {
    await refreshData();
    startAutoRefresh();
  }
}

els.loginForm.addEventListener("submit", handleLogin);
els.logoutButton.addEventListener("click", handleLogout);
els.refreshButton.addEventListener("click", refreshData);
els.searchInput.addEventListener("input", renderLeadList);
els.statusFilter.addEventListener("change", renderLeadList);
els.leadForm.addEventListener("submit", handleLeadSave);
els.messageForm.addEventListener("submit", handleMessageSave);
els.noteForm.addEventListener("submit", handleNoteSave);

supabase.auth.onAuthStateChange(async (_event, session) => {
  state.session = session;
  if (session) {
    await refreshData();
    startAutoRefresh();
  } else {
    state.profile = null;
    state.leads = [];
    state.messages = [];
    state.notes = [];
    state.selectedLeadId = null;
    stopAutoRefresh();
    renderAll();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.session) {
    refreshData({ silent: true });
  }
});

initSession();
