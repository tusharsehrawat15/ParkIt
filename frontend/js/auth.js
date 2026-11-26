// 1. Track current UI state
let currentMode = "login";
let selectedRole = "DRIVER";

// 2. Grab elements from index.html
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const roleSection = document.getElementById("roleSection");
const roleDriver = document.getElementById("roleDriver");
const roleOwner = document.getElementById("roleOwner");
const nameField = document.getElementById("nameField");
const nameInput = document.getElementById("name");
const submitBtn = document.getElementById("submitBtn");
const driverFields = document.getElementById("driverFields");
const ownerFields = document.getElementById("ownerFields");
const vehicleInput = document.getElementById("vehicleNumber");
const buildingInput = document.getElementById("buildingName");
const localityInput = document.getElementById("locality");
const cityInput = document.getElementById("city");
const authForm = document.getElementById("authForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const buildingTypeInput = document.getElementById("buildingType");
const errorMsg = document.getElementById("errorMsg");

// Reusable class strings so we don't repeat long Tailwind classes
const activeTabClass = "flex-1 py-2.5 text-sm font-semibold rounded-lg bg-emerald-500 text-gray-950 transition-all";
const inactiveTabClass = "flex-1 py-2.5 text-sm font-semibold rounded-lg text-gray-400 hover:text-white transition-all";

const activeRoleClass = "py-2.5 px-4 rounded-xl border border-emerald-500 bg-emerald-500/10 text-emerald-400 text-sm font-semibold transition-all";
const inactiveRoleClass = "py-2.5 px-4 rounded-xl border border-gray-800 bg-gray-900/50 text-gray-400 text-sm font-semibold hover:text-white transition-all";

// Auto-redirect if user already has a valid session cookie
(async function checkExistingSession() {
  try {
    const res = await fetch("/api/user/me");
    if (!res.ok) return;
    const { user } = await res.json();
    if (user?.role === "OWNER") {
      window.location.replace("/owner.html");
    } else if (user?.role === "DRIVER") {
      window.location.replace("/driver.html");
    }
  } catch (_) {
    // Stay on login page if offline or unauthorized
  }
})();


function updateRoleFields() {
  // On Login, hide both role sections and remove required flags
  if (currentMode === "login") {
    driverFields.classList.add("hidden");
    ownerFields.classList.add("hidden");
    vehicleInput.required = false;
    buildingInput.required = false;
    localityInput.required = false;
    cityInput.required = false;
    return;
  }

  // On Sign Up, show fields matching the selected role
  if (selectedRole === "DRIVER") {
    driverFields.classList.remove("hidden");
    ownerFields.classList.add("hidden");
    vehicleInput.required = true;
    buildingInput.required = false;
    localityInput.required = false;
    cityInput.required = false;
  } else {
    driverFields.classList.add("hidden");
    ownerFields.classList.remove("hidden");
    vehicleInput.required = false;
    buildingInput.required = true;
    localityInput.required = true;
    cityInput.required = true;
  }
}

// 3. Switch between Login and Sign Up
tabLogin.addEventListener("click", () => {
  currentMode = "login";
  roleSection.classList.add("hidden"); // Hide role picker on Login
  tabLogin.className = activeTabClass;
  tabSignup.className = inactiveTabClass;
  nameField.classList.add("hidden");
  nameInput.required = false;
  submitBtn.textContent = "Login to ParkIt";
  updateRoleFields();
});

tabSignup.addEventListener("click", () => {
  currentMode = "signup";
  roleSection.classList.remove("hidden"); // Show role picker on Sign Up
  tabSignup.className = activeTabClass;
  tabLogin.className = inactiveTabClass;
  nameField.classList.remove("hidden");
  nameInput.required = true;
  submitBtn.textContent = "Create Account";
  updateRoleFields();
  
});

// 4. Switch between Driver and Building Owner
roleDriver.addEventListener("click", () => {
  selectedRole = "DRIVER";
  roleDriver.className = activeRoleClass;
  roleOwner.className = inactiveRoleClass;
  updateRoleFields();
});

roleOwner.addEventListener("click", () => {
  selectedRole = "OWNER";
  roleOwner.className = activeRoleClass;
  roleDriver.className = inactiveRoleClass;
  updateRoleFields();
});

// Helper to show red error or green success banner
function showMessage(text, isError = true) {
  errorMsg.textContent = text;
  errorMsg.classList.remove("hidden");

  if (isError) {
    errorMsg.className = "text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-center";
  } else {
    errorMsg.className = "text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5 text-center";
  }
}

// Handle Login & Sign Up submission
authForm.addEventListener("submit", async (e) => {
  e.preventDefault(); // Stop the browser from refreshing the page
  errorMsg.classList.add("hidden");

  const isLogin = currentMode === "login";
  const endpoint = isLogin ? "/api/user/login" : "/api/user/signup";

  // Build the exact JSON body your controller expects
  const payload = isLogin
    ? {
        email: emailInput.value.trim(),
        password: passwordInput.value,
      }
    : {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value,
        role: selectedRole,
        vehicleNumber: selectedRole === "DRIVER" ? vehicleInput.value.trim().toUpperCase() : null,
        buildingName: selectedRole === "OWNER" ? buildingInput.value.trim() : null,
        locality: selectedRole === "OWNER" ? localityInput.value.trim() : null,
        city: selectedRole === "OWNER" ? cityInput.value.trim() : null,
        buildingType: selectedRole === "OWNER" ? buildingTypeInput.value : null,
      };

  // Disable button while waiting for backend
  submitBtn.disabled = true;
  submitBtn.textContent = isLogin ? "Logging in..." : "Creating account...";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.error || "Something went wrong", true);
      return;
    }

    if (!isLogin) {
      // Signup worked → switch to Login tab so user gets their cookie
      tabLogin.click();
      passwordInput.value = "";
      showMessage("Account created! Please log in.", false);
      return;
    }

    // Login worked → redirect based on role returned from MongoDB
    if (data.user.role === "OWNER") {
      window.location.replace("/owner.html");
    } else {
      window.location.replace("/driver.html");
    }
  } catch (err) {
    showMessage("Cannot connect to server. Is your backend running?", true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = currentMode === "login" ? "Login to ParkIt" : "Create Account";
  }
});