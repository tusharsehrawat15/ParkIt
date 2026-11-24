// Navigation & Section Elements
const tabs = {
  dashboard: {
    btn: document.getElementById("navDashboard"),
    section: document.getElementById("sectionDashboard"),
  },
  earnings: {
    btn: document.getElementById("navEarnings"),
    section: document.getElementById("sectionEarnings"),
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

// Attach click listeners to bottom nav buttons
tabs.dashboard.btn.addEventListener("click", () => switchTab("dashboard"));
tabs.earnings.btn.addEventListener("click", () => switchTab("earnings"));
tabs.account.btn.addEventListener("click", () => switchTab("account"));

// ==========================================
// Dashboard Controls: Steppers & Rate Edit
// ==========================================
let parkingSlots = 0;
let evSlots = 0;
let parkingBooked = 0;
let evBooked = 0;

const parkingSlotsBig = document.getElementById("parkingSlotsBig");
const parkingSlotsCount = document.getElementById("parkingSlotsCount");
const evSlotsBig = document.getElementById("evSlotsBig");
const evSlotsCount = document.getElementById("evSlotsCount");

function renderSlotCounts() {
  const openParking = Math.max(0, parkingSlots - parkingBooked);
  const openEv = Math.max(0, evSlots - evBooked);

  // Big number = live Available slots; Stepper number = Total slots configured
  parkingSlotsBig.textContent = openParking;
  parkingSlotsCount.textContent = parkingSlots;

  evSlotsBig.textContent = openEv;
  evSlotsCount.textContent = evSlots;
}

// Parking - / + steppers
document.getElementById("decParkingBtn").addEventListener("click", () => {
  if (parkingSlots > 0) {
    parkingSlots--;
    renderSlotCounts();
  }
});
document.getElementById("incParkingBtn").addEventListener("click", () => {
  parkingSlots++;
  renderSlotCounts();
});

// EV - / + steppers
document.getElementById("decEvBtn").addEventListener("click", () => {
  if (evSlots > 0) {
    evSlots--;
    renderSlotCounts();
  }
});
document.getElementById("incEvBtn").addEventListener("click", () => {
  evSlots++;
  renderSlotCounts();
});

// Reusable helper for the pencil edit buttons
function setupRateEditor(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);

  const lockInput = () => {
    input.readOnly = true;
    input.classList.remove("bg-gray-900", "border-emerald-500");
    input.classList.add("bg-transparent", "border-transparent");
    if (!input.value || Number(input.value) < 0) input.value = 0;
  };

  btn.addEventListener("click", () => {
    if (input.readOnly) {
      input.readOnly = false;
      input.classList.remove("bg-transparent", "border-transparent");
      input.classList.add("bg-gray-900", "border-emerald-500");
      input.focus();
      input.select();
    } else {
      lockInput();
    }
  });

  // Lock cleanly when user presses Enter or clicks away
  input.addEventListener("blur", lockInput);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lockInput();
    }
  });
}

setupRateEditor("parkingRateInput", "editParkingRateBtn");
setupRateEditor("evRateInput", "editEvRateBtn");

// ==========================================
// Auth Guard, Header Info & Live Slot Sync
// ==========================================
let currentOwner = null;

const headerBuildingName = document.getElementById("headerBuildingName");
const headerLocation = document.getElementById("headerLocation");
const headerServiceBadge = document.getElementById("headerServiceBadge");
const serviceCardsGrid = document.getElementById("serviceCardsGrid");
const cardParking = document.getElementById("cardParking");
const cardEv = document.getElementById("cardEv");
const parkingRateInput = document.getElementById("parkingRateInput");
const evRateInput = document.getElementById("evRateInput");
const syncLiveBtn = document.getElementById("syncLiveBtn");
const syncStatusMsg = document.getElementById("syncStatusMsg");

function showSyncStatus(text, isError = false) {
  syncStatusMsg.textContent = text;
  syncStatusMsg.classList.remove("hidden");
  syncStatusMsg.className = isError
    ? "text-xs text-center rounded-xl px-4 py-2.5 text-red-400 bg-red-500/10 border border-red-500/30"
    : "text-xs text-center rounded-xl px-4 py-2.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30";
}

async function initOwnerDashboard() {
  try {
    // 1. Verify session & load owner profile
    const res = await fetch("/api/user/me");
    if (!res.ok) {
      window.location.href = "/index.html";
      return;
    }

    const { user } = await res.json();
    if (user.role !== "OWNER") {
      window.location.href = "/driver.html";
      return;
    }

    currentOwner = user;
    populateAccountTab(user);

    // 2. Populate header
    headerBuildingName.textContent = user.buildingName || "My Building";
    headerLocation.innerHTML = `<span>📍</span> <span>${user.locality || ""}, ${user.city || ""}</span>`;
    headerServiceBadge.textContent = user.buildingType === "BOTH" ? "PARKING & EV" : user.buildingType;

    // 3. Show only the cards matching owner's buildingType
    if (user.buildingType === "PARKING") {
      cardEv.classList.add("hidden");
      serviceCardsGrid.classList.replace("grid-cols-2", "grid-cols-1");
    } else if (user.buildingType === "EV") {
      cardParking.classList.add("hidden");
      serviceCardsGrid.classList.replace("grid-cols-2", "grid-cols-1");
    }

    // 4. Load existing slots & bookings from MongoDB
    await loadOwnerSlots();
    await loadOwnerBookings();

    // 5. Quietly refresh live slots & bookings every 15 seconds
    setInterval(() => {
      loadOwnerSlots();
      loadOwnerBookings();
    }, 15000);
  } catch (err) {
    showSyncStatus("Unable to connect to server.", true);
  }
}

async function loadOwnerSlots() {
  const res = await fetch("/api/slot/my-slots");
  if (!res.ok) return;

  const { slots } = await res.json();
  const standardList = slots.filter((s) => s.slotType === "STANDARD");
  const evList = slots.filter((s) => s.slotType === "EV");

  parkingSlots = standardList.length;
  parkingBooked = standardList.filter((s) => s.status !== "AVAILABLE").length;

  evSlots = evList.length;
  evBooked = evList.filter((s) => s.status !== "AVAILABLE").length;

  if (standardList.length > 0) {
    parkingRateInput.value = standardList[0].hourlyRate;
  }
  if (evList.length > 0) {
    evRateInput.value = evList[0].hourlyRate;
  }

  renderSlotCounts();
}

// Save & Sync Live handler
syncLiveBtn.addEventListener("click", async () => {
  if (!currentOwner) return;

  syncLiveBtn.disabled = true;
  syncStatusMsg.classList.add("hidden");

  const requests = [];
  const type = currentOwner.buildingType;

  if (type === "PARKING" || type === "BOTH") {
    requests.push(
      fetch("/api/slot/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotType: "STANDARD",
          hourlyRate: Number(parkingRateInput.value) || 100,
          totalSlots: parkingSlots,
        }),
      })
    );
  }

  if (type === "EV" || type === "BOTH") {
    requests.push(
      fetch("/api/slot/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotType: "EV",
          hourlyRate: Number(evRateInput.value) || 150,
          totalSlots: evSlots,
        }),
      })
    );
  }

  try {
    const responses = await Promise.all(requests);
    const failed = responses.find((r) => !r.ok);

    if (failed) {
      const errData = await failed.json();
      showSyncStatus(errData.error || "Failed to sync slots.", true);
      return;
    }

    await loadOwnerSlots();
    showSyncStatus("Synced live! Drivers can now see your updated rates and slots.", false);
  } catch (err) {
    showSyncStatus("Network error while syncing.", true);
  } finally {
    syncLiveBtn.disabled = false;
  }
});

// ==========================================
// Live Parked Vehicles, Earnings & History
// ==========================================
let lastActiveCount = 0;

function formatTimeRemaining(startTime, durationHours) {
  const endMs = new Date(startTime).getTime() + durationHours * 60 * 60 * 1000;
  const diffMs = endMs - Date.now();

  if (diffMs <= 0) return "Overtime";

  const totalMins = Math.ceil(diffMs / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (hrs > 0) return `${hrs}h ${mins}m left`;
  return `${mins}m left`;
}

function formatDurationLabel(hours) {
  if (hours < 1) return `${Math.round(hours * 60)} mins`;
  return hours === 1 ? "1 hr" : `${hours} hrs`;
}

function isSameDay(dateValue) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

async function loadOwnerBookings() {
  try {
    const res = await fetch("/api/booking/building-history");
    if (!res.ok) return;

    const { history } = await res.json();
    const activeBookings = history.filter((b) => b.status === "ACTIVE");
    const completedBookings = history.filter((b) => b.status === "COMPLETED");

    // Show notification dot if a new driver just parked
    const notifDot = document.getElementById("notifDot");
    if (activeBookings.length > lastActiveCount && lastActiveCount !== 0) {
      notifDot.classList.remove("hidden");
    }
    lastActiveCount = activeBookings.length;

    // 1. Render Live Parked Vehicles (Dashboard Tab)
    document.getElementById("activeVehiclesCount").textContent = `${activeBookings.length} active`;
    const liveList = document.getElementById("liveVehiclesList");

    if (activeBookings.length === 0) {
      liveList.innerHTML = `
        <div class="glass-card rounded-2xl p-4 text-center text-xs text-gray-500">
          No vehicles currently parked.
        </div>`;
    } else {
      liveList.innerHTML = activeBookings
        .map((b) => {
          const isEv = b.slotNumber && b.slotNumber.startsWith("EV");
          const icon = isEv ? "⚡" : "🚗";
          const label = isEv ? "EV Charging" : "Parking";
          const timeLeft = formatTimeRemaining(b.startTime || b.createdAt, b.estimatedDuration);

          return `
            <div class="glass-card rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-lg">${icon}</span>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-white truncate">${b.vehicleNumber || "Unknown Plate"}</p>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[10px] px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700">${label}</span>
                    <span class="text-[11px] text-gray-500">${b.slotNumber}</span>
                  </div>
                </div>
              </div>
              <span class="text-xs font-semibold ${timeLeft === "Overtime" ? "text-amber-400" : "text-gray-300"} shrink-0">
                ${timeLeft}
              </span>
            </div>`;
        })
        .join("");
    }

    // 2. Calculate & Render Revenue Stats (Earnings Tab)
    const totalRevenue = completedBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    const completedToday = completedBookings.filter((b) => isSameDay(b.endTime || b.createdAt));
    const todayRevenue = completedToday.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    document.getElementById("todayRevenue").textContent = `₹${todayRevenue.toLocaleString("en-IN")}`;
    document.getElementById("totalRevenue").textContent = `₹${totalRevenue.toLocaleString("en-IN")}`;
    document.getElementById("activeSessionsStat").textContent = activeBookings.length;
    document.getElementById("completedTodayStat").textContent = completedToday.length;
    document.getElementById("totalBookingsCount").textContent = `${history.length} total`;

    // 3. Render Booking History Feed (Earnings Tab)
    const historyList = document.getElementById("bookingHistoryList");

    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="glass-card rounded-2xl p-4 text-center text-xs text-gray-500">
          No booking history yet.
        </div>`;
    } else {
      historyList.innerHTML = history
        .map((b) => {
          const isEv = b.slotNumber && b.slotNumber.startsWith("EV");
          const icon = isEv ? "⚡" : "🚗";
          const label = isEv ? "EV Charging" : "Parking";
          const isActive = b.status === "ACTIVE";
          const amount = isActive
            ? Math.round((b.hourlyRate || 0) * (b.estimatedDuration || 1))
            : b.totalAmount || 0;

          const statusBadge = isActive
            ? `<span class="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">Active</span>`
            : `<span class="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">Completed</span>`;

          return `
            <div class="glass-card rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-lg">${icon}</span>
                <div class="min-w-0">
                  <p class="text-sm font-bold text-white truncate">${b.vehicleNumber || "Unknown Plate"}</p>
                  <p class="text-xs text-gray-400 mt-0.5">${label} • ${formatDurationLabel(b.estimatedDuration)}</p>
                </div>
              </div>
              <div class="text-right shrink-0 space-y-1">
                <p class="text-sm font-bold text-white">₹${amount}</p>
                ${statusBadge}
              </div>
            </div>`;
        })
        .join("");
    }
  } catch (err) {
    console.error("Failed to load owner bookings:", err);
  }
}

// Clear notification dot when bell is clicked
document.getElementById("notifBtn").addEventListener("click", () => {
  document.getElementById("notifDot").classList.add("hidden");
  loadOwnerSlots();
  loadOwnerBookings();
});

// ==========================================
// Account Tab & Logout
// ==========================================
function populateAccountTab(user) {
  document.getElementById("accName").textContent = user.name || "--";
  document.getElementById("accEmail").textContent = user.email || "--";
  document.getElementById("accBuildingName").textContent = user.buildingName || "--";
  document.getElementById("accLocality").textContent = user.locality || "--";
  document.getElementById("accCity").textContent = user.city || "--";

  const serviceMap = {
    PARKING: "Parking Only",
    EV: "EV Charging Only",
    BOTH: "Parking & EV",
  };
  document.getElementById("accServiceType").textContent = serviceMap[user.buildingType] || user.buildingType;
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await fetch("/api/user/logout", { method: "POST" });
  } finally {
    window.location.href = "/index.html";
  }
});

// Run on page load
initOwnerDashboard();