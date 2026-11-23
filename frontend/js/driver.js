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
      const stdAvailable = b.standardSlots.filter((s) => s.status === "AVAILABLE");
      const evAvailable = b.evSlots.filter((s) => s.status === "AVAILABLE");

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
    await loadBuildings();
    setInterval(loadBuildings, 15000);
  } catch (err) {
    console.error("Failed to initialize driver app:", err);
  }
}

initDriverApp();