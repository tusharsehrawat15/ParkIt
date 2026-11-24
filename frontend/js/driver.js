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
// 2. State & Elements
// ==========================================
let currentDriver = null;
let allBuildings = [];
let activeFilter = "ALL"; // ALL | STANDARD | EV

const searchInput = document.getElementById("searchInput");
const buildingsList = document.getElementById("buildingsList");
const buildingsCount = document.getElementById("buildingsCount");
const filterPills = document.querySelectorAll(".filter-pill");

const activePillClass = "filter-pill px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-gray-950 transition-all";
const inactivePillClass = "filter-pill px-4 py-2 rounded-xl text-xs font-semibold bg-gray-900/80 border border-gray-800 text-gray-300 hover:border-gray-600 transition-all";

// ==========================================
// 3. Helper: Format Estimated Wait Time
// ==========================================
function formatWaitTime(nextEndMs) {
  if (!nextEndMs) return "Full";
  const diffMs = Math.max(0, nextEndMs - Date.now());
  const totalMins = Math.max(1, Math.ceil(diffMs / 60000));
  const hrs = String(Math.floor(totalMins / 60)).padStart(2, "0");
  const mins = String(totalMins % 60).padStart(2, "0");
  return `Estimated Time: ${hrs}:${mins} hr`;
}

// ==========================================
// 4. Load & Group Slots by Building
// ==========================================
async function loadBuildings() {
  try {
    const query = searchInput.value.trim();
    const url = query ? `/api/slot?search=${encodeURIComponent(query)}` : "/api/slot";
    const res = await fetch(url);
    if (!res.ok) return;

    const { slots } = await res.json();

    // Group individual slots into building cards
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
  } catch (err) {
    console.error("Failed to load buildings:", err);
  }
}

function renderBuildings() {
  // Apply filter pill
  const filtered = allBuildings.filter((b) => {
    if (activeFilter === "STANDARD") return b.standardSlots.length > 0;
    if (activeFilter === "EV") return b.evSlots.length > 0;
    return true;
  });

  buildingsCount.textContent = `${filtered.length} found`;

  if (filtered.length === 0) {
    buildingsList.innerHTML = `
      <div class="glass-card rounded-2xl p-6 text-center text-xs text-gray-500">
        No matching locations found.
      </div>`;
    return;
  }

  buildingsList.innerHTML = filtered
    .map((b) => {
      // Total available based on current filter
      const relevantSlots =
        activeFilter === "STANDARD"
          ? b.standardSlots
          : activeFilter === "EV"
          ? b.evSlots
          : [...b.standardSlots, ...b.evSlots];

      const openCount = relevantSlots.filter((s) => s.status === "AVAILABLE").length;

      // Price tags
      const prices = [];
      if (b.standardSlots.length > 0) {
        prices.push(`Parking <span class="text-emerald-400 font-semibold">₹${b.standardSlots[0].hourlyRate}</span>/hr`);
      }
      if (b.evSlots.length > 0) {
        prices.push(`EV <span class="text-emerald-400 font-semibold">₹${b.evSlots[0].hourlyRate}</span>/hr`);
      }

      // Status pill: show open count OR Estimated Wait Time when 0
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

// Filter pill click listeners
filterPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    activeFilter = pill.dataset.filter;
    filterPills.forEach((p) => (p.className = p === pill ? activePillClass : inactivePillClass));
    renderBuildings();
  });
});

// Live search with small debounce
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadBuildings, 250);
});

document.getElementById("refreshFeedBtn").addEventListener("click", loadBuildings);

// ==========================================
// 5. Auth Guard & Init
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
    await loadBuildings();
    await loadDriverActivity();
    setInterval(loadBuildings, 15000);
  } catch (err) {
    console.error("Failed to initialize driver app:", err);
  }
}

// ==========================================
// 6. Booking Modal (Service, Duration & Confirm)
// ==========================================
let selectedBuilding = null;
let selectedServiceType = "STANDARD"; // STANDARD | EV
let selectedDuration = 1; // in hours

const bookingModal = document.getElementById("bookingModal");
const closeBookingModal = document.getElementById("closeBookingModal");
const selectServiceParking = document.getElementById("selectServiceParking");
const selectServiceEv = document.getElementById("selectServiceEv");
const durationPills = document.querySelectorAll(".duration-pill");
const bookingErrorMsg = document.getElementById("bookingErrorMsg");
const confirmBookingBtn = document.getElementById("confirmBookingBtn");

const activeServiceClass = "glass-card rounded-2xl p-4 text-center space-y-1.5 border border-emerald-500 bg-emerald-500/10 transition-all";
const inactiveServiceClass = "glass-card rounded-2xl p-4 text-center space-y-1.5 border border-gray-800 hover:border-gray-600 transition-all";
const disabledServiceClass = "glass-card rounded-2xl p-4 text-center space-y-1.5 border border-gray-800 opacity-40 cursor-not-allowed";

const activeDurClass = "duration-pill py-2.5 rounded-xl text-xs font-semibold bg-emerald-500 text-gray-950 transition-all";
const inactiveDurClass = "duration-pill py-2.5 rounded-xl text-xs font-semibold bg-gray-900/80 border border-gray-800 text-gray-300 hover:border-gray-600 transition-all";

function updateBookingSummary() {
  if (!selectedBuilding) return;

  const isEv = selectedServiceType === "EV";
  const slots = isEv ? selectedBuilding.evSlots : selectedBuilding.standardSlots;
  const rate = slots.length > 0 ? slots[0].hourlyRate : 0;
  const total = Math.round(rate * selectedDuration);

  document.getElementById("summaryPlate").textContent = currentDriver?.vehicleNumber || "--";
  document.getElementById("summaryService").textContent = isEv ? "EV Charging" : "Parking";
  document.getElementById("summaryDuration").textContent =
    selectedDuration < 1 ? `${Math.round(selectedDuration * 60)} mins` : selectedDuration === 1 ? "1 hr" : `${selectedDuration} hrs`;
  document.getElementById("summaryTotal").textContent = `₹${total}`;
}

function updateServiceCardsUI() {
  if (!selectedBuilding) return;

  const stdOpen = selectedBuilding.standardSlots.filter((s) => s.status === "AVAILABLE").length;
  const evOpen = selectedBuilding.evSlots.filter((s) => s.status === "AVAILABLE").length;

  selectServiceParking.disabled = stdOpen === 0;
  selectServiceEv.disabled = evOpen === 0;

  selectServiceParking.className =
    stdOpen === 0 ? disabledServiceClass : selectedServiceType === "STANDARD" ? activeServiceClass : inactiveServiceClass;

  selectServiceEv.className =
    evOpen === 0 ? disabledServiceClass : selectedServiceType === "EV" ? activeServiceClass : inactiveServiceClass;

  updateBookingSummary();
}

function openBookingModal(ownerId) {
  const b = allBuildings.find((item) => item.ownerId === ownerId);
  if (!b) return;

  const stdOpen = b.standardSlots.filter((s) => s.status === "AVAILABLE").length;
  const evOpen = b.evSlots.filter((s) => s.status === "AVAILABLE").length;
  const totalOpen = stdOpen + evOpen;

  if (totalOpen === 0) return; // Building is full

  selectedBuilding = b;
  selectedServiceType = stdOpen > 0 ? "STANDARD" : "EV";
  selectedDuration = 1;
  bookingErrorMsg.classList.add("hidden");

  // Populate building header
  document.getElementById("modalBuildingName").textContent = b.buildingName;
  document.getElementById("modalBuildingLoc").textContent = `📍 ${b.locality}, ${b.city}`;
  document.getElementById("modalSlotsBadge").textContent = `● ${totalOpen} ${totalOpen === 1 ? "Slot" : "Slots"} Open`;

  // Populate service cards
  document.getElementById("modalParkingRate").textContent =
    b.standardSlots.length > 0 ? `₹${b.standardSlots[0].hourlyRate} /hr` : "N/A";
  document.getElementById("modalParkingAvail").textContent = `${stdOpen} open`;

  document.getElementById("modalEvRate").textContent =
    b.evSlots.length > 0 ? `₹${b.evSlots[0].hourlyRate} /hr` : "N/A";
  document.getElementById("modalEvAvail").textContent = `${evOpen} open`;

  // Reset duration pills to 1 hr
  durationPills.forEach((p) => {
    p.className = Number(p.dataset.hours) === 1 ? activeDurClass : inactiveDurClass;
  });

  updateServiceCardsUI();
  bookingModal.classList.remove("hidden");
}

// Open modal when any building card is clicked
buildingsList.addEventListener("click", (e) => {
  const card = e.target.closest(".building-card");
  if (card) {
    openBookingModal(card.dataset.ownerId);
  }
});

closeBookingModal.addEventListener("click", () => {
  bookingModal.classList.add("hidden");
});

selectServiceParking.addEventListener("click", () => {
  if (!selectServiceParking.disabled) {
    selectedServiceType = "STANDARD";
    updateServiceCardsUI();
  }
});

selectServiceEv.addEventListener("click", () => {
  if (!selectServiceEv.disabled) {
    selectedServiceType = "EV";
    updateServiceCardsUI();
  }
});

durationPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    selectedDuration = Number(pill.dataset.hours);
    durationPills.forEach((p) => (p.className = p === pill ? activeDurClass : inactiveDurClass));
    updateBookingSummary();
  });
});

// Confirm & Book Slot (Step 1: Lock in Redis → Step 2: Confirm in MongoDB)
confirmBookingBtn.addEventListener("click", async () => {
  if (!selectedBuilding) return;

  const targetList = selectedServiceType === "EV" ? selectedBuilding.evSlots : selectedBuilding.standardSlots;
  const freeSlot = targetList.find((s) => s.status === "AVAILABLE");

  if (!freeSlot) {
    bookingErrorMsg.textContent = "No available slots left for this service.";
    bookingErrorMsg.classList.remove("hidden");
    return;
  }

  confirmBookingBtn.disabled = true;
  confirmBookingBtn.textContent = "Booking slot...";
  bookingErrorMsg.classList.add("hidden");

  try {
    // 1. Lock the slot
    const lockRes = await fetch(`/api/booking/lock/${freeSlot._id}`, { method: "POST" });
    const lockData = await lockRes.json();
    if (!lockRes.ok) {
      bookingErrorMsg.textContent = lockData.error || "Could not lock slot.";
      bookingErrorMsg.classList.remove("hidden");
      return;
    }

    // 2. Confirm the booking
    const confirmRes = await fetch(`/api/booking/confirm/${freeSlot._id}`, {
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

    // Success → close modal, refresh feed & activity, switch to Activity tab
    bookingModal.classList.add("hidden");
    await loadBuildings();
    await loadDriverActivity();
    switchTab("activity");
  } catch (err) {
    bookingErrorMsg.textContent = "Network error while booking.";
    bookingErrorMsg.classList.remove("hidden");
  } finally {
    confirmBookingBtn.disabled = false;
    confirmBookingBtn.textContent = "Confirm & Book Slot";
  }
});

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
    await loadDriverActivity();
    await loadBuildings();
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

    // 1. Render Currently Parked card
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
            <p class="text-gray-400">Service: <span class="text-white font-semibold">${serviceLabel}</span> <span class="text-gray-500">(${activeBooking.slotNumber})</span></p>
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

    // 2. Render Past Booking History
    driverHistoryCount.textContent = `${completedBookings.length} completed`;

    if (completedBookings.length === 0) {
      driverHistoryList.innerHTML = `
        <div class="glass-card rounded-2xl p-4 text-center text-xs text-gray-500">
          No completed bookings yet.
        </div>`;
    } else {
      driverHistoryList.innerHTML = completedBookings
        .map((b) => {
          const isEv = b.slotNumber && b.slotNumber.startsWith("EV");
          const icon = isEv ? "⚡" : "🚗";
          const label = isEv ? "EV Charging" : "Parking";

          return `
            <div class="glass-card rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-lg">${icon}</span>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-white truncate">${b.buildingName}</p>
                  <p class="text-xs text-gray-400 mt-0.5">${label} • ${formatDurationLabel(b.estimatedDuration)}</p>
                </div>
              </div>
              <div class="text-right shrink-0 space-y-1">
                <p class="text-sm font-bold text-white">₹${b.totalAmount || 0}</p>
                <span class="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                  Completed
                </span>
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

initDriverApp();