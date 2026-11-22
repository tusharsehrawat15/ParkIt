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

const parkingSlotsBig = document.getElementById("parkingSlotsBig");
const parkingSlotsCount = document.getElementById("parkingSlotsCount");
const evSlotsBig = document.getElementById("evSlotsBig");
const evSlotsCount = document.getElementById("evSlotsCount");

function renderSlotCounts() {
  parkingSlotsBig.textContent = parkingSlots;
  parkingSlotsCount.textContent = parkingSlots;
  evSlotsBig.textContent = evSlots;
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