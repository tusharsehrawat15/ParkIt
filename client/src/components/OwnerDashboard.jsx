import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io } from "socket.io-client";
import {
  Home,
  CircleDollarSign,
  User,
  Car,
  Zap,
  Pencil,
  Minus,
  Plus,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Building2,
  MapPin,
  LogOut,
  Trash2,
  X,
  Lock,
  KeyRound,
} from "lucide-react";
import { apiRequest, API_BASE_URL } from "../lib/api";
import BookingDetailsModal from "./BookingDetailsModal";
import BuildingLocationPicker from "./BuildingLocationPicker";

function isEvBooking(item) {
  return (
    (item.slotType || item.slotId?.slotType) === "EV" ||
    String(item.slotNumber || item.slotId?.slotNumber || "").startsWith("EV")
  );
}

export default function OwnerDashboard({ user, onUserUpdate, onLogout, onNotify }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [slots, setSlots] = useState([]);
  const [history, setHistory] = useState([]);
  const [waitlistQueue, setWaitlistQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  // Parking & EV controls
  const [parkingRate, setParkingRate] = useState(100);
  const [parkingTotal, setParkingTotal] = useState(0);
  const [editingParkingRate, setEditingParkingRate] = useState(false);

  const [evRate, setEvRate] = useState(150);
  const [evTotal, setEvTotal] = useState(0);
  const [editingEvRate, setEditingEvRate] = useState(false);

  // Edit Building / Profile
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user.name || "");
  const [editBuildingName, setEditBuildingName] = useState(user.buildingName || "");
  const [editLocality, setEditLocality] = useState(user.locality || "");
  const [editCity, setEditCity] = useState(user.city || "");
  const [actionLoading, setActionLoading] = useState(false);

  // Delete Account Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteOtp, setDeleteOtp] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchOwnerData = useCallback(async () => {
    try {
      const [slotRes, histRes, waitRes] = await Promise.all([
        apiRequest("/api/slot/my-slots"),
        apiRequest("/api/booking/building-history"),
        apiRequest("/api/waitlist/owner-queue"),
        ]);

      const fetchedSlots = slotRes.slots || [];
      const fetchedHistory = Array.isArray(histRes)
        ? histRes
        : histRes.history || histRes.bookings || [];

      // Compare against last seen statuses in localStorage to trigger notifications
      const storageKey = `parkit_owner_seen_${user._id || user.id}`;
      const savedRaw = localStorage.getItem(storageKey);
      const prevMap = savedRaw ? new Map(Object.entries(JSON.parse(savedRaw))) : null;

      if (prevMap) {
        for (const item of fetchedHistory) {
          const prevStatus = prevMap.get(item._id);
          const vehicle = item.vehicleNumber || item.driverId?.vehicleNumber || "A vehicle";
          const typeLabel = isEvBooking(item) ? "EV Charging" : "Parking";

          // New active booking
          if (!prevStatus && item.status === "ACTIVE") {
            onNotify?.("New Booking", `${vehicle} parked in ${typeLabel}.`, "booking");
          }

          // Session ended (live or while owner was logged out)
          if ((prevStatus === "ACTIVE" || !prevStatus) && item.status !== "ACTIVE") {
            const earned = item.totalAmount ?? item.hourlyRate ?? 0;
            onNotify?.(
              "Session Ended",
              `${vehicle} checked out from ${typeLabel}. ₹${earned} earned.`,
              "checkout"
            );
          }
        }
      }

      const nextObj = {};
      for (const item of fetchedHistory) {
        nextObj[item._id] = item.status;
      }
      localStorage.setItem(storageKey, JSON.stringify(nextObj));

      setSlots(fetchedSlots);
      setHistory(fetchedHistory);
      setWaitlistQueue(waitRes.queue || []);

      const stdSlots = fetchedSlots.filter((s) => s.slotType !== "EV");
      const evSlots = fetchedSlots.filter((s) => s.slotType === "EV");

      setParkingTotal(stdSlots.length);
      if (stdSlots[0]?.hourlyRate) setParkingRate(stdSlots[0].hourlyRate);

      setEvTotal(evSlots.length);
      if (evSlots[0]?.hourlyRate) setEvRate(evSlots[0].hourlyRate);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [onNotify, user._id, user.id]);

  useEffect(() => {
    fetchOwnerData();
  }, [fetchOwnerData]);

  useEffect(() => {
    const socket = io(API_BASE_URL || undefined, { withCredentials: true });
    socket.on("slotsUpdated", fetchOwnerData);
    socket.on("bookingsUpdated", fetchOwnerData);
    socket.on("waitlistUpdated", fetchOwnerData);
    return () => socket.disconnect();
  }, [fetchOwnerData]);

  const parkingAvailable = useMemo(
    () => slots.filter((s) => s.slotType !== "EV" && s.status === "AVAILABLE").length,
    [slots]
  );

  const evAvailable = useMemo(
    () => slots.filter((s) => s.slotType === "EV" && s.status === "AVAILABLE").length,
    [slots]
  );

  const activeBookings = useMemo(
    () => history.filter((b) => b.status === "ACTIVE"),
    [history]
  );

  const completedBookings = useMemo(
    () => history.filter((b) => b.status !== "ACTIVE"),
    [history]
  );

  const stats = useMemo(() => {
    const todayStr = new Date().toDateString();
    let todayRevenue = 0;
    let totalRevenue = 0;
    let completedToday = 0;

    for (const b of completedBookings) {
      const amt = Number(b.totalAmount ?? b.hourlyRate ?? 0);
      totalRevenue += amt;
      const d = new Date(b.endTime || b.updatedAt || b.createdAt);
      if (d.toDateString() === todayStr) {
        todayRevenue += amt;
        completedToday += 1;
      }
    }

    return { todayRevenue, totalRevenue, completedToday };
  }, [completedBookings]);

  const handleSaveAndSync = async () => {
    setSyncing(true);
    try {
      await Promise.all([
        apiRequest("/api/slot/sync", {
          method: "POST",
          body: JSON.stringify({
            slotType: "STANDARD",
            hourlyRate: Number(parkingRate),
            totalSlots: Number(parkingTotal),
          }),
        }),
        apiRequest("/api/slot/sync", {
          method: "POST",
          body: JSON.stringify({
            slotType: "EV",
            hourlyRate: Number(evRate),
            totalSlots: Number(evTotal),
          }),
        }),
      ]);

      setEditingParkingRate(false);
      setEditingEvRate(false);
      onNotify?.(
        "Slots Synced",
        `${user.buildingName} — ${parkingTotal} Parking, ${evTotal} EV live now`,
        "sync"
      );
      showToast("Saved & synced live to all drivers!");
      fetchOwnerData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await apiRequest("/api/user/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: editName,
          buildingName: editBuildingName,
          locality: editLocality,
          city: editCity,
        }),
      });
      onUserUpdate(res.user);
      setEditingProfile(false);
      showToast("Building details updated!");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestDeleteOtp = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await apiRequest("/api/user/delete-otp", {
        method: "POST",
        body: JSON.stringify({ password: deletePassword }),
      });
      setDeleteStep(2);
      showToast("Verification code sent to your email.");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDeleteAccount = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await apiRequest("/api/user/account", {
        method: "DELETE",
        body: JSON.stringify({ otp: deleteOtp }),
      });
      onUserUpdate(null);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const serviceLabel =
    user.buildingType === "EV_ONLY"
      ? "EV Only"
      : user.buildingType === "PARKING_ONLY"
      ? "Parking Only"
      : "Parking & EV";

  return (
    <div className="space-y-5">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`fixed top-20 right-4 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium shadow-xl backdrop-blur-md ${
              toast.type === "error"
                ? "border-red-500/40 bg-red-950/90 text-red-200"
                : "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Building Sub-Header */}
      <div className="pb-3 border-b border-zinc-800/80">
        <h2 className="text-base font-bold text-zinc-100">{user.buildingName || "My Building"}</h2>
        <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
          <MapPin className="h-3.5 w-3.5 text-rose-400" />
          {[user.locality, user.city].filter(Boolean).join(", ") || "Location not set"}
        </p>
      </div>

      {/* ==================== DASHBOARD TAB ==================== */}
      {activeTab === "dashboard" && (
        <div className="space-y-5">
          <h1 className="text-xl font-bold text-zinc-100">Owner Dashboard</h1>

          {loading ? (
            <div className="flex justify-center py-10 text-emerald-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* Parking & EV Cards */}
              <div className="grid grid-cols-2 gap-3">
                {/* Parking Card */}
                <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Car className="h-4 w-4 text-rose-400" />
                    Parking
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {editingParkingRate ? (
                      <div className="flex items-center gap-1">
                        <span className="text-emerald-400 text-xs font-bold">₹</span>
                        <input
                          type="number"
                          min="1"
                          value={parkingRate}
                          onChange={(e) => setParkingRate(e.target.value)}
                          className="w-16 rounded-lg border border-emerald-500/50 bg-zinc-950 px-2 py-1 text-xs font-bold text-emerald-400 outline-none"
                        />
                      </div>
                    ) : (
                      <div className="text-sm font-bold text-emerald-400">
                        ₹ {parkingRate} <span className="text-xs font-normal text-zinc-400">/hr</span>
                      </div>
                    )}

                    <button
                      onClick={() => setEditingParkingRate((prev) => !prev)}
                      className="h-7 w-7 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center justify-center text-emerald-400 transition cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div>
                    <p className="text-[11px] text-zinc-400">Available Slots:</p>
                    <p className="text-xl font-bold text-zinc-100 mt-0.5">{parkingAvailable}</p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => setParkingTotal((c) => Math.max(0, c - 1))}
                      className="h-9 w-9 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center text-zinc-200 transition cursor-pointer"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-bold text-zinc-100">{parkingTotal}</span>
                    <button
                      onClick={() => setParkingTotal((c) => c + 1)}
                      className="h-9 w-9 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 flex items-center justify-center text-emerald-400 transition cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* EV Charging Card */}
                <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Zap className="h-4 w-4 text-amber-400" />
                    EV Charging
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {editingEvRate ? (
                      <div className="flex items-center gap-1">
                        <span className="text-emerald-400 text-xs font-bold">₹</span>
                        <input
                          type="number"
                          min="1"
                          value={evRate}
                          onChange={(e) => setEvRate(e.target.value)}
                          className="w-16 rounded-lg border border-emerald-500/50 bg-zinc-950 px-2 py-1 text-xs font-bold text-emerald-400 outline-none"
                        />
                      </div>
                    ) : (
                      <div className="text-sm font-bold text-emerald-400">
                        ₹ {evRate} <span className="text-xs font-normal text-zinc-400">/hr</span>
                      </div>
                    )}

                    <button
                      onClick={() => setEditingEvRate((prev) => !prev)}
                      className="h-7 w-7 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center justify-center text-emerald-400 transition cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div>
                    <p className="text-[11px] text-zinc-400">Available Slots:</p>
                    <p className="text-xl font-bold text-zinc-100 mt-0.5">{evAvailable}</p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => setEvTotal((c) => Math.max(0, c - 1))}
                      className="h-9 w-9 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center text-zinc-200 transition cursor-pointer"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-bold text-zinc-100">{evTotal}</span>
                    <button
                      onClick={() => setEvTotal((c) => c + 1)}
                      className="h-9 w-9 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 flex items-center justify-center text-emerald-400 transition cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Save & Sync Button */}
              <button
                onClick={handleSaveAndSync}
                disabled={syncing}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3.5 text-sm shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing..." : "Save & Sync"}
              </button>

              {/* Live Parked Vehicles */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-zinc-100">Live Parked Vehicles</h2>
                  <span className="text-xs font-medium text-emerald-400">
                    {activeBookings.length} active
                  </span>
                </div>

                {activeBookings.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-5 text-center text-xs text-zinc-500">
                    No vehicles currently parked.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {activeBookings.map((item) => (
                      <div
                        key={item._id}
                        onClick={() => setSelectedBooking(item)}
                        className="rounded-2xl border border-emerald-500/30 bg-[#111622] hover:border-emerald-500/60 p-4 flex items-center justify-between transition cursor-pointer"
                      >
                        <div>
                          <p className="text-sm font-bold text-zinc-100">
                            {item.driverName || item.driverId?.name || "Driver"}
                          </p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {item.vehicleNumber || item.driverId?.vehicleNumber || "—"} •{" "}
                            {isEvBooking(item) ? "EV Charging" : "Parking"}
                          </p>
                        </div>
                        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                          • Active
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Waitlist Queue */}
                <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-zinc-100">Waitlist Queue</h2>
                    <span className="text-xs font-medium text-amber-400">
                    {waitlistQueue.length} waiting
                    </span>
                </div>

                {waitlistQueue.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-5 text-center text-xs text-zinc-500">
                    No drivers on the waitlist.
                    </div>
                ) : (
                    <div className="space-y-2.5">
                    {waitlistQueue.map((entry, idx) => (
                        <div
                        key={entry._id}
                        className="rounded-2xl border border-amber-500/30 bg-[#111622] p-4 flex items-center justify-between"
                        >
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-xs font-bold text-amber-400">
                            #{idx + 1}
                            </div>
                            <div>
                            <p className="text-sm font-bold text-zinc-100">
                                {entry.vehicleNumber || "Driver"}
                            </p>
                            <p className="text-xs text-zinc-400 mt-0.5">
                                {entry.slotType === "EV" ? "EV Charging" : "Parking"}
                            </p>
                            </div>
                        </div>
                        <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                            entry.status === "READY"
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                : "bg-amber-500/15 border-amber-500/30 text-amber-400"
                            }`}
                        >
                            {entry.status === "READY" ? "Slot Ready (5m)" : "Waiting"}
                        </span>
                        </div>
                    ))}
                    </div>
                )}
                </div>
            </>
          )}
        </div>
      )}

      {/* ==================== EARNINGS TAB ==================== */}
      {activeTab === "earnings" && (
        <div className="space-y-5">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Earnings & History</h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Track revenue, active sessions & completed bookings
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-4">
              <p className="text-xs text-zinc-400">Today&apos;s Revenue</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">₹{stats.todayRevenue}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-4">
              <p className="text-xs text-zinc-400">Total Revenue</p>
              <p className="text-2xl font-bold text-zinc-100 mt-1">₹{stats.totalRevenue}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-4 grid grid-cols-2 divide-x divide-zinc-800">
            <div className="pr-4">
              <p className="text-xs text-zinc-400">Active Sessions</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">{activeBookings.length}</p>
            </div>
            <div className="pl-4">
              <p className="text-xs text-zinc-400">Completed Today</p>
              <p className="text-xl font-bold text-zinc-100 mt-1">{stats.completedToday}</p>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-100">Booking History</h2>
              <span className="text-xs font-medium text-emerald-400">{history.length} total</span>
            </div>

            {history.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-6 text-center text-xs text-zinc-500">
                No booking history yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {history.map((item) => {
                  const ev = isEvBooking(item);
                  return (
                    <div
                      key={item._id}
                      onClick={() => setSelectedBooking(item)}
                      className="rounded-2xl border border-zinc-800 bg-[#111622] hover:border-emerald-500/40 p-4 flex items-center justify-between transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
                          {ev ? <Zap className="h-4 w-4 text-amber-400" /> : <Car className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">
                            {item.driverName || item.driverId?.name || "Driver"}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {item.vehicleNumber || item.driverId?.vehicleNumber || "—"} •{" "}
                            {ev ? "EV Charging" : "Parking"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-bold text-zinc-100">
                          ₹{item.totalAmount ?? item.hourlyRate ?? 0}
                        </p>
                        <span
                          className={`inline-block mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                            item.status === "ACTIVE"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-zinc-800 text-zinc-300"
                          }`}
                        >
                          {item.status === "ACTIVE" ? "Active" : "Completed"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== ACCOUNT TAB ==================== */}
      {activeTab === "account" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Owner Account</h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Manage profile, building details & settings
              </p>
            </div>
            {!editingProfile && (
              <button
                onClick={() => {
                  setEditName(user.name || "");
                  setEditBuildingName(user.buildingName || "");
                  setEditLocality(user.locality || "");
                  setEditCity(user.city || "");
                  setEditingProfile(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-[#111622] hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-emerald-400 transition cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Details
              </button>
            )}
          </div>

          {editingProfile ? (
            <form
              onSubmit={handleSaveProfile}
              className="rounded-2xl border border-emerald-500/40 bg-[#111622] p-5 space-y-4"
            >
              <div>
                <label className="text-xs text-zinc-400">Owner Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Building Name</label>
                <input
                  type="text"
                  required
                  value={editBuildingName}
                  onChange={(e) => setEditBuildingName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400">Locality</label>
                  <input
                    type="text"
                    required
                    value={editLocality}
                    onChange={(e) => setEditLocality(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">City</label>
                  <input
                    type="text"
                    required
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-2.5 text-xs transition cursor-pointer"
                >
                  {actionLoading ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProfile(false)}
                  className="rounded-xl border border-zinc-700 px-4 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-5 flex items-center gap-4">
                <div className="h-14 w-14 rounded-full border-2 border-emerald-500/60 bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <User className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-zinc-100 truncate">{user.name}</h2>
                  <p className="text-xs text-zinc-400 truncate">{user.email}</p>
                  <span className="inline-block mt-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                    BUILDING OWNER
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-100 pb-2 border-b border-zinc-800/80">
                  <Building2 className="h-4 w-4 text-emerald-400" />
                  Building Details
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Building Name</span>
                    <span className="font-semibold text-zinc-100">{user.buildingName || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Locality</span>
                    <span className="font-semibold text-zinc-100">{user.locality || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">City</span>
                    <span className="font-semibold text-zinc-100">{user.city || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Service Type</span>
                    <span className="font-semibold text-emerald-400">{serviceLabel}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          <BuildingLocationPicker
             user={user}
             onSaved={(location) => {
               onUserUpdate({ ...user, location });
               showToast("Building map pin saved! Drivers can now find you nearby.");
             }}
             onError={(msg) => showToast(msg, "error")}
           />

          <button
            onClick={onLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold py-3 text-sm transition cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>

          <button
            onClick={() => {
              setDeleteStep(1);
              setDeletePassword("");
              setDeleteOtp("");
              setDeleteModalOpen(true);
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-red-900/60 bg-zinc-950 hover:bg-red-950/40 text-red-400 font-medium py-3 text-xs transition cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Account Permanently
          </button>
        </div>
      )}

      {/* ==================== BOTTOM NAVIGATION BAR ==================== */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-800/90 bg-[#0d111a]/95 backdrop-blur-md">
        <div className="max-w-3xl mx-auto grid grid-cols-3 h-16">
          {[
            { id: "dashboard", label: "Dashboard", icon: Home },
            { id: "earnings", label: "Earnings", icon: CircleDollarSign },
            { id: "account", label: "Account", icon: User },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-1 text-xs font-medium transition cursor-pointer ${
                  active ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ==================== BOOKING DETAILS MODAL ==================== */}
      <BookingDetailsModal
        booking={selectedBooking}
        currentUser={user}
        onClose={() => setSelectedBooking(null)}
      />

      {/* ==================== DELETE ACCOUNT MODAL ==================== */}
      <AnimatePresence>
        {deleteModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-[#111622] p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-red-400">Delete Account</h3>
                <button
                  onClick={() => setDeleteModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {deleteStep === 1 ? (
                <form onSubmit={handleRequestDeleteOtp} className="space-y-4">
                  <p className="text-xs text-zinc-400">
                    Enter your password to receive a 6-digit deletion verification code on{" "}
                    <strong className="text-zinc-200">{user.email}</strong>.
                  </p>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                    <input
                      type="password"
                      required
                      placeholder="Enter your password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-red-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="w-full rounded-xl bg-red-500 hover:bg-red-400 text-white font-semibold py-2.5 text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading ? "Verifying..." : "Verify Password & Send Code"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmDeleteAccount} className="space-y-4">
                  <p className="text-xs text-zinc-400">
                    Enter the 6-digit code sent to <strong className="text-zinc-200">{user.email}</strong>. This action cannot be undone.
                  </p>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-red-400" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="Enter 6-digit code"
                      value={deleteOtp}
                      onChange={(e) => setDeleteOtp(e.target.value)}
                      className="w-full rounded-xl border border-red-500/40 bg-zinc-950 pl-10 pr-4 py-2.5 text-sm tracking-widest outline-none focus:border-red-400"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="w-full rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading ? "Deleting..." : "Permanently Delete My Account"}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}