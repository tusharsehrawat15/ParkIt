import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Car,
  Building2,
  Lock,
  Mail,
  User,
  ArrowRight,
  Loader2,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import LocationPickerMap from "./LocationPickerMap";
import ParkItLogo from "./ParkItLogo";
import InstallAppButton from "./InstallAppButton";

export default function AuthPage({ onAuthSuccess }) {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [role, setRole] = useState("DRIVER");
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1: enter email, 2: enter otp + new password
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    newPassword: "",
    otp: "",
    vehicleNumber: "",
    buildingName: "",
    locality: "",
    city: "",
    buildingType: "BOTH",
    lat: null,
    lng: null,
  });

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setInfo("");
    setOtpSent(false);
    setResetStep(1);
    updateField("otp", "");
  };

  const handleSendSignupOtp = async () => {
    if (!form.email.trim()) {
      setError("Enter your email address first to receive a verification code.");
      return;
    }
    setError("");
    setInfo("");
    setSendingOtp(true);
    try {
      const data = await apiRequest("/api/user/send-signup-otp", {
        method: "POST",
        body: JSON.stringify({ email: form.email }),
      });
      setOtpSent(true);
      setInfo(data.message || "Verification code sent! Check your email (or backend terminal in dev).");
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingOtp(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (resetStep === 1) {
        const data = await apiRequest("/api/user/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: form.email }),
        });
        setResetStep(2);
        setInfo(data.message || "Verification code sent! Check your email (or backend terminal in dev).");
      } else {
        await apiRequest("/api/user/reset-password", {
          method: "POST",
          body: JSON.stringify({
            email: form.email,
            otp: form.otp,
            newPassword: form.newPassword,
          }),
        });
        const { user } = await apiRequest("/api/user/me");
        onAuthSuccess(user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === "forgot") return handleForgotSubmit(e);

    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (mode === "login") {
        await apiRequest("/api/user/login", {
          method: "POST",
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
      } else {
        if (!form.otp.trim()) {
          throw new Error("Please click 'Send Code' and enter the 6-digit verification code.");
        }
        const payload = {
          name: form.name,
          email: form.email,
          password: form.password,
          role,
          otp: form.otp,
        };
        if (role === "DRIVER") {
          payload.vehicleNumber = form.vehicleNumber;
        } else {
          payload.buildingName = form.buildingName;
          payload.locality = form.locality;
          payload.city = form.city;
          payload.buildingType = form.buildingType;
          if (form.lat && form.lng) {
            payload.lat = form.lat;
            payload.lng = form.lng;
          }
        }
        await apiRequest("/api/user/signup", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        await apiRequest("/api/user/login", {
          method: "POST",
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
      }

      const { user } = await apiRequest("/api/user/me");
      onAuthSuccess(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-xl p-6 shadow-2xl relative z-10"
      >
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-3">
            <ParkItLogo className="h-14 w-14" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ParkIt</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time smart parking & EV charging
          </p>
          <div className="mt-3 flex justify-center">
            <InstallAppButton />
          </div>
        </div>

        {/* Mode Switcher (hidden in Forgot Password mode) */}
        {mode !== "forgot" ? (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-950 p-1 mb-6 border border-zinc-800">
            {["login", "signup"].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => switchMode(tab)}
                className={`rounded-lg py-2 text-sm font-medium transition cursor-pointer ${
                  mode === tab
                    ? "bg-emerald-500 text-zinc-950 shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-5">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-emerald-400 transition cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </button>
            <h2 className="text-lg font-semibold mt-2">Reset your password</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {resetStep === 1
                ? "Enter your registered email to receive a 6-digit verification code."
                : "Enter the code sent to your email and choose a new password."}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            {mode === "signup" && (
              <motion.div
                key="signup-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden"
              >
                {/* Role Selector */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("DRIVER")}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition cursor-pointer ${
                      role === "DRIVER"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                        : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <Car className="h-4 w-4" />
                    Driver
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("OWNER")}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition cursor-pointer ${
                      role === "OWNER"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                        : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <Building2 className="h-4 w-4" />
                    Building Owner
                  </button>
                </div>

                {/* Full Name */}
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  <input
                    type="text"
                    required
                    placeholder="Full Name"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email (+ Send Code button during Signup) */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <input
                type="email"
                required
                disabled={mode === "forgot" && resetStep === 2}
                placeholder="Email address"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-500 disabled:opacity-60"
              />
            </div>

            {mode === "signup" && (
              <button
                type="button"
                onClick={handleSendSignupOtp}
                disabled={sendingOtp}
                className="shrink-0 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50 cursor-pointer"
              >
                {sendingOtp ? "Sending..." : otpSent ? "Resend" : "Send Code"}
              </button>
            )}
          </div>

          {/* Signup Verification Code Input */}
          {mode === "signup" && otpSent && (
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 h-4 w-4 text-emerald-400" />
              <input
                type="text"
                required
                maxLength={6}
                placeholder="Enter 6-digit email verification code"
                value={form.otp}
                onChange={(e) => updateField("otp", e.target.value)}
                className="w-full rounded-xl border border-emerald-500/50 bg-zinc-950 pl-10 pr-4 py-2.5 text-sm tracking-widest outline-none focus:border-emerald-400"
              />
            </div>
          )}

          {/* Password (Login & Signup) */}
          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              {mode === "login" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Forgot Password Step 2: OTP + New Password */}
          {mode === "forgot" && resetStep === 2 && (
            <div className="space-y-3">
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-emerald-400" />
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="Enter 6-digit verification code"
                  value={form.otp}
                  onChange={(e) => updateField("otp", e.target.value)}
                  className="w-full rounded-xl border border-emerald-500/50 bg-zinc-950 pl-10 pr-4 py-2.5 text-sm tracking-widest outline-none focus:border-emerald-400"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Create new password (min 6 chars)"
                  value={form.newPassword}
                  onChange={(e) => updateField("newPassword", e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Role-Specific Signup Fields */}
          {mode === "signup" && role === "DRIVER" && (
            <input
              type="text"
              required
              placeholder="Vehicle Number (e.g. MH12AB1234)"
              value={form.vehicleNumber}
              onChange={(e) => updateField("vehicleNumber", e.target.value.toUpperCase())}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
          )}

          {mode === "signup" && role === "OWNER" && (
            <div className="space-y-3 pt-1">
              <input
                type="text"
                required
                placeholder="Building Name (e.g. Tech Park Plaza)"
                value={form.buildingName}
                onChange={(e) => updateField("buildingName", e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Locality"
                  value={form.locality}
                  onChange={(e) => updateField("locality", e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  required
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <select
                value={form.buildingType}
                onChange={(e) => updateField("buildingType", e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              >
                <option value="BOTH">Standard Parking + EV Charging</option>
                <option value="PARKING">Standard Parking Only</option>
                <option value="EV">EV Charging Only</option>
              </select>

              <LocationPickerMap
                lat={form.lat}
                lng={form.lng}
                onSelect={(lat, lng) => setForm((prev) => ({ ...prev, lat, lng }))}
                height="180px"
              />
            </div>
          )}

          {info && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{info}</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-2.5 text-sm transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {mode === "login"
                  ? "Sign In"
                  : mode === "signup"
                  ? "Verify & Create Account"
                  : resetStep === 1
                  ? "Send Verification Code"
                  : "Set New Password & Sign In"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}