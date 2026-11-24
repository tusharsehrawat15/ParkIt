// ==========================================
// 1. Navigation Tabs
// ==========================================
const tabs = {
  home: {
    btn: document.getElementById("navHome"),
    section: document.getElementById("sectionHome"),
  },
  activity: {
    btn: document.getElementById("navActivity"),
    section: document.getElementById("sectionActivity"),
  },
  account: {
    btn: document.getElementById("navAccount"),
    section: document.getElementById("sectionAccount"),
  },
};

function switchTab(activeKey) {
  Object.entries(tabs).forEach(([key, { btn, section }]) => {
    if (key === activeKey) {
      section.classList.remove("hidden");
      btn.classList.remove("text-gray-500", "hover:text-gray-300");
      btn.classList.add("text-emerald-400");
    } else {
      section.classList.add("hidden");
      btn.classList.remove("text-emerald-400");
      btn.classList.add("text-gray-500", "hover:text-gray-300");
    }
  });
}

tabs.home.btn.addEventListener("click", () => switchTab("home"));
tabs.activity.btn.addEventListener("click", () => switchTab("activity"));
tabs.account.btn.addEventListener("click", () => switchTab("account"));

// ==========================================
// 2. State, Socket & Elements
// ==========================================
let currentDriver = null;
let allBuildings = [];
let waitlistCounts = {};
let maxWaitlist = 5;
let activeFilter = "ALL"; // ALL | STANDARD | EV

const socket = io();

const searchInput = document.getElementById("searchInput");
const buildingsList = document.getElementById("buildingsList");
const buildingsCount = document.getElementById("buildingsCount");
const filterPills = document.querySelectorAll(".filter-pill");

const activePillClass = "filter-pill px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-gray-950 transition-all";
const inactivePillClass = "filter-pill px-4 py-2 rounded-xl text-xs font-semibold bg-gray-900/80 border border-gray-800 text-gray-300 hover:border-gray-600 transition-all";

// ==========================================
// 3. Toast & Notifications Dropdown
// ==========================================
const notifBtn = document.getElementById("notifBtn");
const notifDot = document.getElementById("notifDot");
const notifDropdown = document.getElementById("notifDropdown");
const notifList = document.getElementById("notifList");
const liveToast = document.getElementById("liveToast");
const toastTitle = document.getElementById("toastTitle");
const toastMsg = document.getElementById("toastMsg");
let toastTimer = null;

function showToast(title, message) {
  toastTitle.textContent = title;
  toastMsg.textContent = message;
  liveToast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => liveToast.classList.add("hidden"), 4500);
}

function formatTimeAgo(dateStr) {
  const diffSecs = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (diffSecs < 60) return "Just now";
  const mins = Math.floor(diffSecs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function loadNotifications() {
  try {
    const res = await fetch("/api/notification");
    if (!res.ok) return;

    const { unreadCount, notifications } = await res.json();
    if (unreadCount > 0) notifDot.classList.remove("hidden");
    else notifDot.classList.add("hidden");

    if (!notifications || notifications.length === 0) {
      notifList.innerHTML = `<p class="p-4 text-center text-xs text-gray-500">No notifications yet.</p>`;
      return;
    }

    notifList.innerHTML = notifications
      .map((n) => `
        <div class="px-4 py-3 ${n.isRead ? "opacity-75" : "bg-emerald-500/5"}">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-bold text-white">${n.title}</p>
            <span class="text-[10px] text-gray-500 shrink-0">${formatTimeAgo(n.createdAt)}</span>
          </div>
          <p class="text-[11px] text-gray-300 mt-0.5 leading-relaxed">${n.message}</p>
        </div>
      `)
      .join("");
  } catch (err) {
    console.error("Failed to load notifications:", err);
  }
}

notifBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  const willOpen = notifDropdown.classList.contains("hidden");
  notifDropdown.classList.toggle("hidden");

  if (willOpen) {
    await loadNotifications();
    if (!notifDot.classList.contains("hidden")) {
      notifDot.classList.add("hidden");
      fetch("/api/notification/read-all", { method: "PATCH" }).catch(() => {});
    }
  }
});

document.addEventListener("click", (e) => {
  if (!notifDropdown.classList.contains("hidden") && !notifDropdown.contains(e.target) && e.target !== notifBtn) {
    notifDropdown.classList.add("hidden");
  }
});

// ==========================================
// 4. Load & Render Buildings + Waitlist Counts
// ==========================================
function formatWaitTime(nextEndMs) {
  if (!nextEndMs) return "Full • Join Waitlist";
  const diffMs = Math.max(0, nextEndMs - Date.now());
  const totalMins = Math.max(1, Math.ceil(diffMs / 60000));
  const hrs = String(Math.floor(totalMins / 60)).padStart(2, "0");
  const mins = String(totalMins % 60).padStart(2, "0");
  return `Est. ${hrs}:${mins} hr`;
}

async function loadBuildings() {
  try {
    const query = searchInput.value.trim();
    const url = query ? `/api/slot?search=${encodeURIComponent(query)}` : "/api/slot";

    const [slotRes, countRes] = await Promise.all([
      fetch(url),
      fetch("/api/waitlist/building-counts"),
    ]);

    if (!slotRes.ok) return;
    const { slots } = await slotRes.json();

    if (countRes.ok) {
      const countData = await countRes.json();
      waitlistCounts = countData.counts || {};
      maxWaitlist = countData.maxWaitlist || 5;
    }

    const map = new Map();
    slots.forEach((slot) => {
      const key = slot.ownerId;
      if (!map.has(key)) {
        map.set(key, {
          ownerId: slot.ownerId,
          buildingName: slot.buildingName,
          locality: slot.locality,
          city: slot.city,
          buildingType: slot.buildingType,
          standardSlots: [],
          evSlots: [],
        });
      }
      const b = map.get(key);
      if (slot.slotType === "EV") b.evSlots.push(slot);
      else b.standardSlots.push(slot);
    });

    allBuildings = Array.from(map.values());
    renderBuildings();

    // Keep modal fresh if currently open
    if (selectedBuilding && !bookingModal.classList.contains("hidden")) {
      const updated = allBuildings.find((item) => item.ownerId === selectedBuilding.ownerId);
      if (updated) {
        selectedBuilding = updated;
        refreshModalUI();
      }
    }
  } catch (err) {
    console.error("Failed to load buildings:", err);
  }
}

function renderBuildings() {
  const filtered = allBuildings.filter((b) => {
    if (activeFilter === "STANDARD") return b.standardSlots.length > 0;
    if (activeFilter === "EV") return b.evSlots.length > 0;
    return true;
  });

  buildingsCount.textContent = `${filtered.length} found`;

  if (filtered.length === 0) {
    buildingsList.innerHTML = `<div class="glass-card rounded-2xl p-6 text-center text-xs text-gray-500">No matching locations found.</div>`;
    return;
  }

  buildingsList.innerHTML = filtered
    .map((b) => {
      const relevantSlots =
        activeFilter === "STANDARD"
          ? b.standardSlots
          : activeFilter === "EV"
          ? b.evSlots
          : [...b.standardSlots, ...b.evSlots];

      const openCount = relevantSlots.filter((s) => s.status === "AVAILABLE").length;

      const prices = [];
      if (b.standardSlots.length > 0) {
        prices.push(`Parking <span class="text-emerald-400 font-semibold">₹${b.standardSlots[0].hourlyRate}</span>/hr`);
      }
      if (b.evSlots.length > 0) {
        prices.push(`EV <span class="text-emerald-400 font-semibold">₹${b.evSlots[0].hourlyRate}</span>/hr`);
      }

      let statusBadge = "";
      if (openCount > 0) {
        statusBadge = `
          <span class="text-[11px] font-semibold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shrink-0">
            ● ${openCount} ${openCount === 1 ? "Slot" : "Slots"} Open
          </span>`;
      } else {
        const bookedEndTimes = relevantSlots
          .filter((s) => s.status === "BOOKED" && s.scheduledEndTime)
          .map((s) => s.scheduledEndTime);
        const soonest = bookedEndTimes.length > 0 ? Math.min(...bookedEndTimes) : null;
        statusBadge = `
          <span class="text-[11px] font-semibold px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40 shrink-0">
            ${formatWaitTime(soonest)}
          </span>`;
      }

      return `
        <div data-owner-id="${b.ownerId}"
          class="building-card glass-card rounded-2xl p-4 space-y-3 cursor-pointer hover:border-emerald-500/50 transition-all">
          <div>
            <h3 class="text-base font-bold text-white">${b.buildingName}</h3>
            <p class="text-xs text-gray-400 mt-0.5">📍 ${b.locality}, ${b.city}</p>
          </div>
          <div class="flex items-center justify-between gap-2 pt-1">
            <p class="text-xs text-gray-300">${prices.join(" • ")}</p>
            ${statusBadge}
          </div>
        </div>`;
    })
    .join("");
}

filterPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    activeFilter = pill.dataset.filter;
    filterPills.forEach((p) => (p.className = p === pill ? activePillClass : inactivePillClass));
    renderBuildings();
  });
});

let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadBuildings, 250);
});

// ==========================================
// 5. Booking & Waitlist Modal
// ==========================================
let selectedBuilding = null;
let selectedServiceType = "STANDARD";
let selectedDuration = 1;

const bookingModal = document.getElementById("bookingModal");
const closeBookingModal = document.getElementById("closeBookingModal");
const selectServiceParking = document.getElementById("selectServiceParking");
const selectServiceEv = document.getElementById("selectServiceEv");
const durationPills = document.querySelectorAll(".duration-pill");
const directBookingSection = document.getElementById("directBookingSection");
const waitlistBookingSection = document.getElementById("waitlistBookingSection");
const bookingErrorMsg = document.getElementById("bookingErrorMsg");
const confirmBookingBtn = document.getElementById("confirmBookingBtn");
const joinWaitlistBtn = document.getElementById("joinWaitlistBtn");

const activeServiceClass = "glass-card rounded-2xl p-4 text-center space-y-1.5 border border-emerald-500 bg-emerald-500/10 transition-all";
const inactiveServiceClass = "glass-card rounded-2xl p-4 text-center space-y-1.5 border border-gray-800 hover:border-gray-600 transition-all";
const disabledServiceClass = "glass-card rounded-2xl p-4 text-center space-y-1.5 border border-gray-800 opacity-35 cursor-not-allowed";

const activeDurClass = "duration-pill py-2.5 rounded-xl text-xs font-semibold bg-emerald-500 text-gray-950 transition-all";
const inactiveDurClass = "duration-pill py-2.5 rounded-xl text-xs font-semibold bg-gray-900/80 border border-gray-800 text-gray-300 hover:border-gray-600 transition-all";

function refreshModalUI() {
  if (!selectedBuilding) return;

  const b = selectedBuilding;
  const stdHasService = b.standardSlots.length > 0;
  const evHasService = b.evSlots.length > 0;

  const stdOpen = b.standardSlots.filter((s) => s.status === "AVAILABLE").length;
  const evOpen = b.evSlots.filter((s) => s.status === "AVAILABLE").length;
  const totalOpen = stdOpen + evOpen;

  // Header badge
  document.getElementById("modalBuildingName").textContent = b.buildingName;
  document.getElementById("modalBuildingLoc").textContent = `📍 ${b.locality}, ${b.city}`;
  const badgeEl = document.getElementById("modalSlotsBadge");
  if (totalOpen > 0) {
    badgeEl.textContent = `● ${totalOpen} ${totalOpen === 1 ? "Slot" : "Slots"} Open`;
    badgeEl.className = "text-[11px] font-semibold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shrink-0";
  } else {
    badgeEl.textContent = "Full • Waitlist";
    badgeEl.className = "text-[11px] font-semibold px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40 shrink-0";
  }

  // Service buttons (enabled as long as the building offers that service)
  document.getElementById("modalParkingRate").textContent = stdHasService ? `₹${b.standardSlots[0].hourlyRate} /hr` : "N/A";
  document.getElementById("modalParkingAvail").textContent = stdHasService ? (stdOpen > 0 ? `${stdOpen} open` : "Full (Waitlist)") : "Unavailable";

  document.getElementById("modalEvRate").textContent = evHasService ? `₹${b.evSlots[0].hourlyRate} /hr` : "N/A";
  document.getElementById("modalEvAvail").textContent = evHasService ? (evOpen > 0 ? `${evOpen} open` : "Full (Waitlist)") : "Unavailable";

  selectServiceParking.disabled = !stdHasService;
  selectServiceEv.disabled = !evHasService;

  selectServiceParking.className = !stdHasService
    ? disabledServiceClass
    : selectedServiceType === "STANDARD"
    ? activeServiceClass
    : inactiveServiceClass;

  selectServiceEv.className = !evHasService
    ? disabledServiceClass
    : selectedServiceType === "EV"
    ? activeServiceClass
    : inactiveServiceClass;

  // Toggle between Direct Booking vs Waitlist Mode based on selected service
  const isEv = selectedServiceType === "EV";
  const selectedSlots = isEv ? b.evSlots : b.standardSlots;
  const selectedOpen = selectedSlots.filter((s) => s.status === "AVAILABLE").length;

  if (selectedOpen > 0) {
    document.getElementById("modalTitle").textContent = "Book a Slot";
    directBookingSection.classList.remove("hidden");
    waitlistBookingSection.classList.add("hidden");

    const rate = selectedSlots[0]?.hourlyRate || 0;
    document.getElementById("summaryPlate").textContent = currentDriver?.vehicleNumber || "--";
    document.getElementById("summaryService").textContent = isEv ? "EV Charging" : "Parking";
    document.getElementById("summaryDuration").textContent =
      selectedDuration < 1 ? `${Math.round(selectedDuration * 60)} mins` : selectedDuration === 1 ? "1 hr" : `${selectedDuration} hrs`;
    document.getElementById("summaryTotal").textContent = `₹${Math.round(rate * selectedDuration)}`;
  } else {
    document.getElementById("modalTitle").textContent = "Join Waitlist";
    directBookingSection.classList.add("hidden");
    waitlistBookingSection.classList.remove("hidden");

    const queueKey = `${b.ownerId}_${selectedServiceType}`;
    const waitingNow = waitlistCounts[queueKey] || 0;
    const isQueueFull = waitingNow >= maxWaitlist;

    document.getElementById("modalWaitlistQueueBadge").textContent = `${waitingNow} / ${maxWaitlist} waiting`;

    const bookedEndTimes = selectedSlots
      .filter((s) => s.status === "BOOKED" && s.scheduledEndTime)
      .map((s) => s.scheduledEndTime);
    const soonest = bookedEndTimes.length > 0 ? Math.min(...bookedEndTimes) : null;
    document.getElementById("modalWaitlistEstimate").textContent = soonest
      ? `Estimated next opening: ${formatWaitTime(soonest)}`
      : "A slot will be held for you as soon as one opens.";

    joinWaitlistBtn.disabled = isQueueFull;
    joinWaitlistBtn.textContent = isQueueFull
      ? `Waitlist Full (${maxWaitlist}/${maxWaitlist})`
      : `Join ${isEv ? "EV" : "Parking"} Waitlist (${waitingNow}/${maxWaitlist})`;
  }
}

function openBookingModal(ownerId) {
  const b = allBuildings.find((item) => item.ownerId === ownerId);
  if (!b) return;

  selectedBuilding = b;
  const stdOpen = b.standardSlots.filter((s) => s.status === "AVAILABLE").length;
  const evOpen = b.evSlots.filter((s) => s.status === "AVAILABLE").length;

  // Smart default: pick a service with open slots, otherwise whichever service exists
  if (stdOpen > 0) selectedServiceType = "STANDARD";
  else if (evOpen > 0) selectedServiceType = "EV";
  else if (b.standardSlots.length > 0) selectedServiceType = "STANDARD";
  else selectedServiceType = "EV";

  selectedDuration = 1;
  bookingErrorMsg.classList.add("hidden");

  durationPills.forEach((p) => {
    p.className = Number(p.dataset.hours) === 1 ? activeDurClass : inactiveDurClass;
  });

  refreshModalUI();
  bookingModal.classList.remove("hidden");
}

buildingsList.addEventListener("click", (e) => {
  const card = e.target.closest(".building-card");
  if (card) openBookingModal(card.dataset.ownerId);
});

closeBookingModal.addEventListener("click", () => bookingModal.classList.add("hidden"));

selectServiceParking.addEventListener("click", () => {
  if (!selectServiceParking.disabled) {
    selectedServiceType = "STANDARD";
    bookingErrorMsg.classList.add("hidden");
    refreshModalUI();
  }
});

selectServiceEv.addEventListener("click", () => {
  if (!selectServiceEv.disabled) {
    selectedServiceType = "EV";
    bookingErrorMsg.classList.add("hidden");
    refreshModalUI();
  }
});

durationPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    selectedDuration = Number(pill.dataset.hours);
    durationPills.forEach((p) => (p.className = p === pill ? activeDurClass : inactiveDurClass));
    refreshModalUI();
  });
});

// Direct Booking (with 409 collision auto-retry across available bays)
confirmBookingBtn.addEventListener("click", async () => {
  if (!selectedBuilding) return;

  const targetList = selectedServiceType === "EV" ? selectedBuilding.evSlots : selectedBuilding.standardSlots;
  const availableSlots = targetList.filter((s) => s.status === "AVAILABLE");

  if (availableSlots.length === 0) {
    bookingErrorMsg.textContent = "No available slots left. Try joining the waitlist.";
    bookingErrorMsg.classList.remove("hidden");
    await loadBuildings();
    return;
  }

  confirmBookingBtn.disabled = true;
  confirmBookingBtn.textContent = "Booking slot...";
  bookingErrorMsg.classList.add("hidden");

  try {
    let lockedSlot = null;
    let lastError = "Could not lock slot.";

    for (const slot of availableSlots) {
      const lockRes = await fetch(`/api/booking/lock/${slot._id}`, { method: "POST" });
      const lockData = await lockRes.json();

      if (lockRes.ok) {
        lockedSlot = slot;
        break;
      }

      lastError = lockData.error || lastError;
      if (lastError.includes("already have an active session")) break;
    }

    if (!lockedSlot) {
      bookingErrorMsg.textContent = lastError;
      bookingErrorMsg.classList.remove("hidden");
      await loadBuildings();
      return;
    }

    const confirmRes = await fetch(`/api/booking/confirm/${lockedSlot._id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedDuration: selectedDuration }),
    });
    const confirmData = await confirmRes.json();

    if (!confirmRes.ok) {
      bookingErrorMsg.textContent = confirmData.error || "Could not confirm booking.";
      bookingErrorMsg.classList.remove("hidden");
      return;
    }

    bookingModal.classList.add("hidden");
    await Promise.all([loadBuildings(), loadDriverActivity(), loadDriverWaitlist()]);
    switchTab("activity");
  } catch (err) {
    bookingErrorMsg.textContent = "Network error while booking.";
    bookingErrorMsg.classList.remove("hidden");
  } finally {
    confirmBookingBtn.disabled = false;
    confirmBookingBtn.textContent = "Confirm & Book Slot";
  }
});

// Join Waitlist handler
joinWaitlistBtn.addEventListener("click", async () => {
  if (!selectedBuilding) return;

  joinWaitlistBtn.disabled = true;
  joinWaitlistBtn.textContent = "Joining waitlist...";
  bookingErrorMsg.classList.add("hidden");

  try {
    const res = await fetch("/api/waitlist/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId: selectedBuilding.ownerId,
        slotType: selectedServiceType,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      bookingErrorMsg.textContent = data.error || "Could not join waitlist.";
      bookingErrorMsg.classList.remove("hidden");
      await loadBuildings();
      return;
    }

    bookingModal.classList.add("hidden");
    showToast("Waitlist Joined", data.message);
    await Promise.all([loadBuildings(), loadDriverWaitlist()]);
    switchTab("activity");
  } catch (err) {
    bookingErrorMsg.textContent = "Network error while joining waitlist.";
    bookingErrorMsg.classList.remove("hidden");
  } finally {
    joinWaitlistBtn.disabled = false;
    refreshModalUI();
  }
});

// ==========================================
// 6. Activity Tab: Waitlist Card (WAITING / READY)
// ==========================================
let waitlistCountdownInterval = null;
const waitlistSessionWrapper = document.getElementById("waitlistSessionWrapper");
const waitlistSessionContainer = document.getElementById("waitlistSessionContainer");

function startWaitlistOfferTimer(expiresAt) {
  if (waitlistCountdownInterval) clearInterval(waitlistCountdownInterval);

  const tick = () => {
    const el = document.getElementById("waitlistOfferTimer");
    if (!el) return;

    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) {
      el.textContent = "Expired";
      clearInterval(waitlistCountdownInterval);
      loadDriverWaitlist();
      return;
    }
    const secs = Math.floor(diffMs / 1000);
    const m = String(Math.floor(secs / 60)).padStart(2, "0");
    const s = String(secs % 60).padStart(2, "0");
    el.textContent = `${m}:${s}`;
  };

  tick();
  waitlistCountdownInterval = setInterval(tick, 1000);
}

async function handleLeaveWaitlist(btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Leaving...";
  }
  try {
    const res = await fetch("/api/waitlist/leave", { method: "DELETE" });
    if (res.ok) {
      showActivityMessage("Removed from waitlist.", false);
      await Promise.all([loadDriverWaitlist(), loadBuildings()]);
    }
  } catch (err) {
    showActivityMessage("Failed to leave waitlist.", true);
  }
}

async function loadDriverWaitlist() {
  try {
    const res = await fetch("/api/waitlist/my-status");
    if (!res.ok) return;

    const { entry, position, maxWaitlist: maxCap } = await res.json();

    if (!entry) {
      if (waitlistCountdownInterval) clearInterval(waitlistCountdownInterval);
      waitlistSessionWrapper.classList.add("hidden");
      waitlistSessionContainer.innerHTML = "";
      return;
    }

    waitlistSessionWrapper.classList.remove("hidden");
    const isEv = entry.slotType === "EV";
    const serviceLabel = isEv ? "⚡ EV Charging" : "🚗 Parking";

    if (entry.status === "WAITING") {
      if (waitlistCountdownInterval) clearInterval(waitlistCountdownInterval);
      waitlistSessionContainer.innerHTML = `
        <div class="glass-card rounded-2xl p-5 border border-amber-500/40 space-y-3.5">
          <div class="flex items-start justify-between gap-2 pb-3 border-b border-gray-800/80">
            <div class="min-w-0">
              <h3 class="text-base font-bold text-white truncate">${entry.buildingName}</h3>
              <p class="text-xs text-gray-400 mt-0.5 truncate">📍 ${entry.locality}, ${entry.city}</p>
            </div>
            <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40 shrink-0">
              POSITION #${position} / ${maxCap || 5}
            </span>
          </div>

          <p class="text-xs text-gray-300">Service: <span class="font-semibold text-white">${serviceLabel}</span></p>
          <p class="text-[11px] text-gray-400">You'll get an instant notification the moment a slot opens up.</p>

          <button type="button" id="leaveWaitlistBtn"
            class="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 font-semibold text-xs hover:bg-red-500/20 transition-all">
            Leave Waitlist
          </button>
        </div>`;

      document.getElementById("leaveWaitlistBtn").addEventListener("click", (e) => {
        handleLeaveWaitlist(e.currentTarget);
      });
    } else if (entry.status === "READY") {
      const slotId = entry.assignedSlotId?._id || entry.assignedSlotId;
      const slotNumber = entry.assignedSlotId?.slotNumber || "";
      const rate = entry.assignedSlotId?.hourlyRate || 0;

      waitlistSessionContainer.innerHTML = `
        <div class="glass-card rounded-2xl p-5 border border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.2)] space-y-4">
          <div class="flex items-start justify-between gap-2 pb-3 border-b border-gray-800/80">
            <div class="min-w-0">
              <h3 class="text-base font-bold text-white truncate">${entry.buildingName}</h3>
              <p class="text-xs text-gray-400 mt-0.5 truncate">${serviceLabel} • ₹${rate}/hr</p>
            </div>
            <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500 shrink-0">
              SLOT READY
            </span>
          </div>

          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-300">Confirm within:</span>
            <span id="waitlistOfferTimer" class="text-lg font-extrabold text-emerald-400">05:00</span>
          </div>

          <div class="space-y-2">
            <p class="text-xs text-gray-400">Select Stay Duration:</p>
            <div class="grid grid-cols-4 gap-2">
              <button type="button" data-whours="0.5" class="ready-dur-pill py-2 rounded-xl text-xs font-semibold bg-gray-900 border border-gray-800 text-gray-300">30m</button>
              <button type="button" data-whours="1" class="ready-dur-pill py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-gray-950">1 hr</button>
              <button type="button" data-whours="2" class="ready-dur-pill py-2 rounded-xl text-xs font-semibold bg-gray-900 border border-gray-800 text-gray-300">2 hrs</button>
              <button type="button" data-whours="4" class="ready-dur-pill py-2 rounded-xl text-xs font-semibold bg-gray-900 border border-gray-800 text-gray-300">4 hrs</button>
            </div>
          </div>

          <div class="flex gap-2.5">
            <button type="button" id="confirmReadySlotBtn"
              class="flex-1 py-3 rounded-xl glow-btn text-gray-950 font-bold text-xs">
              Confirm &amp; Park
            </button>
            <button type="button" id="declineReadySlotBtn"
              class="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 font-semibold text-xs hover:bg-red-500/20">
              Decline
            </button>
          </div>
        </div>`;

      startWaitlistOfferTimer(entry.expiresAt);

      let chosenHours = 1;
      const readyPills = waitlistSessionContainer.querySelectorAll(".ready-dur-pill");
      readyPills.forEach((p) => {
        p.addEventListener("click", () => {
          chosenHours = Number(p.dataset.whours);
          readyPills.forEach((btn) => {
            btn.className =
              btn === p
                ? "ready-dur-pill py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-gray-950"
                : "ready-dur-pill py-2 rounded-xl text-xs font-semibold bg-gray-900 border border-gray-800 text-gray-300";
          });
        });
      });

      document.getElementById("confirmReadySlotBtn").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = "Confirming...";
        try {
          const confirmRes = await fetch(`/api/booking/confirm/${slotId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estimatedDuration: chosenHours }),
          });
          const data = await confirmRes.json();
          if (!confirmRes.ok) {
            showActivityMessage(data.error || "Could not confirm slot.", true);
            await loadDriverWaitlist();
            return;
          }
          showActivityMessage("Waitlist slot confirmed! You are now parked.", false);
          await Promise.all([loadDriverWaitlist(), loadDriverActivity(), loadBuildings()]);
        } catch (err) {
          showActivityMessage("Network error while confirming.", true);
          btn.disabled = false;
          btn.textContent = "Confirm & Park";
        }
      });

      document.getElementById("declineReadySlotBtn").addEventListener("click", (e) => {
        handleLeaveWaitlist(e.currentTarget);
      });
    }
  } catch (err) {
    console.error("Failed to load driver waitlist:", err);
  }
}

// ==========================================
// 7. Activity Tab (Live Timer, Checkout & History)
// ==========================================
let countdownInterval = null;
const activeSessionContainer = document.getElementById("activeSessionContainer");
const driverHistoryList = document.getElementById("driverHistoryList");
const driverHistoryCount = document.getElementById("driverHistoryCount");
const activityStatusMsg = document.getElementById("activityStatusMsg");

function showActivityMessage(text, isError = false) {
  activityStatusMsg.textContent = text;
  activityStatusMsg.classList.remove("hidden");
  activityStatusMsg.className = isError
    ? "text-xs text-center rounded-xl px-4 py-2.5 text-red-400 bg-red-500/10 border border-red-500/30"
    : "text-xs text-center rounded-xl px-4 py-2.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30";
}

function formatDurationLabel(hours) {
  if (!hours) return "1 hr";
  if (hours < 1) return `${Math.round(hours * 60)} mins`;
  return hours === 1 ? "1 hr" : `${hours} hrs`;
}

function startLiveCountdown(endMs) {
  if (countdownInterval) clearInterval(countdownInterval);

  const updateTick = () => {
    const timerEl = document.getElementById("liveCountdownTimer");
    if (!timerEl) return;

    const diffMs = endMs - Date.now();
    if (diffMs <= 0) {
      timerEl.textContent = "Overtime";
      timerEl.classList.replace("text-emerald-400", "text-amber-400");
      clearInterval(countdownInterval);
      return;
    }

    const totalSecs = Math.floor(diffMs / 1000);
    const hrs = String(Math.floor(totalSecs / 3600)).padStart(2, "0");
    const mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, "0");
    const secs = String(totalSecs % 60).padStart(2, "0");
    timerEl.textContent = `${hrs}:${mins}:${secs}`;
  };

  updateTick();
  countdownInterval = setInterval(updateTick, 1000);
}

async function handleCheckout(slotId, btn) {
  btn.disabled = true;
  btn.textContent = "Checking out...";
  activityStatusMsg.classList.add("hidden");

  try {
    const res = await fetch(`/api/booking/release/${slotId}`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      showActivityMessage(data.error || "Checkout failed.", true);
      btn.disabled = false;
      btn.textContent = "End Session / Checkout";
      return;
    }

    showActivityMessage(`Checked out! Final bill: ₹${data.totalAmount}`, false);
    await Promise.all([loadDriverActivity(), loadBuildings()]);
  } catch (err) {
    showActivityMessage("Network error during checkout.", true);
    btn.disabled = false;
    btn.textContent = "End Session / Checkout";
  }
}

async function loadDriverActivity() {
  try {
    const res = await fetch("/api/booking/my-history");
    if (!res.ok) return;

    const { history } = await res.json();
    const activeBooking = history.find((b) => b.status === "ACTIVE");
    const completedBookings = history.filter((b) => b.status === "COMPLETED");

    if (!activeBooking) {
      if (countdownInterval) clearInterval(countdownInterval);
      activeSessionContainer.innerHTML = `
        <div class="glass-card rounded-2xl p-5 text-center text-xs text-gray-500">
          No active parking session right now.
        </div>`;
    } else {
      const isEv = activeBooking.slotNumber && activeBooking.slotNumber.startsWith("EV");
      const serviceLabel = isEv ? "⚡ EV Charging" : "🚗 Parking";
      const estAmount = Math.round((activeBooking.hourlyRate || 0) * (activeBooking.estimatedDuration || 1));
      const startMs = new Date(activeBooking.startTime || activeBooking.createdAt).getTime();
      const endMs = startMs + (activeBooking.estimatedDuration || 1) * 60 * 60 * 1000;

      activeSessionContainer.innerHTML = `
        <div class="glass-card rounded-2xl p-5 border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.12)] space-y-4">
          <div class="flex items-start justify-between gap-2 pb-3 border-b border-gray-800/80">
            <div class="min-w-0">
              <h3 class="text-base font-bold text-white truncate">${activeBooking.buildingName}</h3>
              <p class="text-xs text-gray-400 mt-0.5 truncate">📍 ${activeBooking.locality}, ${activeBooking.city}</p>
            </div>
            <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shrink-0">
              ● ACTIVE
            </span>
          </div>

          <div class="space-y-1.5 text-xs">
            <p class="text-gray-400">Vehicle: <span class="text-white font-bold">${activeBooking.vehicleNumber}</span></p>
            <p class="text-gray-400">Service: <span class="text-white font-semibold">${serviceLabel}</span></p>
          </div>

          <div class="flex items-baseline gap-2">
            <span id="liveCountdownTimer" class="text-3xl font-extrabold tracking-tight text-emerald-400">--:--:--</span>
            <span class="text-sm font-semibold text-emerald-400/80">left</span>
          </div>

          <p class="text-xs text-gray-400">Est. Total: <span class="text-white font-bold">₹${estAmount}</span></p>

          <button type="button" id="checkoutBtn"
            class="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 font-semibold text-xs hover:bg-red-500/20 active:scale-[0.99] transition-all">
            End Session / Checkout
          </button>
        </div>`;

      startLiveCountdown(endMs);

      document.getElementById("checkoutBtn").addEventListener("click", (e) => {
        handleCheckout(activeBooking.slotId, e.currentTarget);
      });
    }

    driverHistoryCount.textContent = `${completedBookings.length} completed`;

    if (completedBookings.length === 0) {
      driverHistoryList.innerHTML = `<div class="glass-card rounded-2xl p-4 text-center text-xs text-gray-500">No completed bookings yet.</div>`;
    } else {
      driverHistoryList.innerHTML = completedBookings
        .map((b) => {
          const isEv = b.slotNumber && b.slotNumber.startsWith("EV");
          return `
            <div class="glass-card rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-lg">${isEv ? "⚡" : "🚗"}</span>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-white truncate">${b.buildingName}</p>
                  <p class="text-xs text-gray-400 mt-0.5">${isEv ? "EV Charging" : "Parking"} • ${formatDurationLabel(b.estimatedDuration)}</p>
                </div>
              </div>
              <div class="text-right shrink-0 space-y-1">
                <p class="text-sm font-bold text-white">₹${b.totalAmount || 0}</p>
                <span class="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">Completed</span>
              </div>
            </div>`;
        })
        .join("");
    }
  } catch (err) {
    console.error("Failed to load driver activity:", err);
  }
}

// ==========================================
// 8. Account Tab & Logout
// ==========================================
function populateDriverAccount(user) {
  document.getElementById("driverAccName").textContent = user.name || "--";
  document.getElementById("driverAccEmail").textContent = user.email || "--";
  document.getElementById("driverAccPlate").textContent = user.vehicleNumber || "--";
}

document.getElementById("driverLogoutBtn").addEventListener("click", async () => {
  try {
    await fetch("/api/user/logout", { method: "POST" });
  } finally {
    window.location.href = "/index.html";
  }
});

// ==========================================
// 9. Init & Socket.io Real-Time Listeners
// ==========================================
async function initDriverApp() {
  try {
    const res = await fetch("/api/user/me");
    if (!res.ok) {
      window.location.href = "/index.html";
      return;
    }

    const { user } = await res.json();
    if (user.role !== "DRIVER") {
      window.location.href = "/owner.html";
      return;
    }

    currentDriver = user;
    populateDriverAccount(user);

    // Register with Socket.io for personal real-time notifications
    socket.emit("register", user._id || user.id);

    await Promise.all([loadBuildings(), loadDriverActivity(), loadDriverWaitlist(), loadNotifications()]);
  } catch (err) {
    console.error("Failed to initialize driver app:", err);
  }
}

socket.on("slotsUpdated", loadBuildings);
socket.on("bookingsUpdated", () => {
  loadBuildings();
  loadDriverActivity();
});
socket.on("waitlistUpdated", () => {
  loadBuildings();
  loadDriverWaitlist();
});
socket.on("notification:new", (notif) => {
  showToast(notif.title, notif.message);
  loadNotifications();
  if (notif.type === "WAITLIST") {
    loadDriverWaitlist();
  }
});

initDriverApp();