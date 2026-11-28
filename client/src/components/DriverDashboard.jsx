import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapContainer, TileLayer, Marker, CircleMarker, Popup, useMap } from "react-leaflet";
import { io } from "socket.io-client";
import {
  Home,
  Clock,
  User,
  Search,
  MapPin,
  Navigation,
  Zap,
  Car,
  LocateFixed,
  CheckCircle2,
  X,
  Loader2,
  LogOut,
  Pencil,
  Trash2,
  KeyRound,
  Lock,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import BookSlotView from "./BookSlotView";
import BookingDetailsModal from "./BookingDetailsModal";

const CLAIM_DURATIONS = [
  { label: "30m", hours: 0.5 },
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "4h", hours: 4 },
];

function formatCountdown(secs) {
  if (secs === null || secs === undefined) return "0:00";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 13, { duration: 0.8 });
  }, [center, map]);
  return null;
}

export default function DriverDashboard({ user, onUserUpdate, onLogout, onNotify }) {
  const [activeTab, setActiveTab] = useState("home");
  const [slots, setSlots] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [slotFilter, setSlotFilter] = useState("ALL");
  const [coords, setCoords] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("Find Nearby");
  const [toast, setToast] = useState(null);

  const [selectedBuildingKey, setSelectedBuildingKey] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit Profile
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user.name || "");
  const [editVehicle, setEditVehicle] = useState(user.vehicleNumber || "");

  // Delete Account Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteOtp, setDeleteOtp] = useState("");

  // Waitlist & Claim Slot UX
  const [waitlistStatus, setWaitlistStatus] = useState(null);
  const [waitlistSecondsLeft, setWaitlistSecondsLeft] = useState(null);
  const [claimDuration, setClaimDuration] = useState(1);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDashboardData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (coords) {
        params.set("lat", coords.lat);
        params.set("lng", coords.lng);
      }
      if (search.trim()) params.set("search", search.trim());
      if (slotFilter !== "ALL") params.set("slotType", slotFilter);

      const [slotRes, histRes, waitRes] = await Promise.all([
        apiRequest(`/api/slot?${params.toString()}`),
        apiRequest("/api/booking/my-history"),
        apiRequest("/api/waitlist/my-status"),
      ]);
      setSlots(slotRes.slots || []);
      setHistory(Array.isArray(histRes) ? histRes : histRes.history || histRes.bookings || []);
      setWaitlistStatus(waitRes?.entry ? waitRes : null);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [coords, search, slotFilter]);

  const detectLocation = useCallback(() => {
    if (coords) {
      setCoords(null);
      setGpsStatus("Find Nearby");
      return;
    }
    if (!navigator.geolocation) {
      setGpsStatus("GPS unavailable");
      return;
    }
    setGpsStatus("Locating...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setGpsStatus("Nearest active");
      },
      () => setGpsStatus("GPS off")
    );
  }, [coords]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const socket = io();
    socket.on("slotsUpdated", fetchDashboardData);
    socket.on("bookingsUpdated", fetchDashboardData);
    socket.on("waitlistUpdated", fetchDashboardData);
    return () => socket.disconnect();
  }, [fetchDashboardData]);

  // Live countdown timer for READY waitlist offers
  useEffect(() => {
    const entry = waitlistStatus?.entry;
    if (!entry || entry.status !== "READY" || !entry.expiresAt) {
      setWaitlistSecondsLeft(null);
      return;
    }

    const computeRemaining = () =>
      Math.max(0, Math.floor((new Date(entry.expiresAt).getTime() - Date.now()) / 1000));

    const initial = computeRemaining();
    setWaitlistSecondsLeft(initial);

    if (initial <= 0) {
      fetchDashboardData();
      return;
    }

    const timer = setInterval(() => {
      const rem = computeRemaining();
      setWaitlistSecondsLeft(rem);
      if (rem <= 0) {
        clearInterval(timer);
        fetchDashboardData();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [waitlistStatus, fetchDashboardData]);

  const activeBooking = useMemo(
    () => history.find((b) => b.status === "ACTIVE") || null,
    [history]
  );

  const completedHistory = useMemo(
    () => history.filter((b) => b.status !== "ACTIVE"),
    [history]
  );

  const buildings = useMemo(() => {
    const map = new Map();
    for (const slot of slots) {
      const key = slot.ownerId || slot.buildingName;
      if (!map.has(key)) {
        map.set(key, {
          key,
          ownerId: slot.ownerId,
          buildingName: slot.buildingName,
          locality: slot.locality,
          city: slot.city,
          location: slot.location,
          distanceKm: slot.distanceKm,
          standardAvailable: [],
          evAvailable: [],
          standardTotal: 0,
          evTotal: 0,
          standardRate: null,
          evRate: null,
        });
      }
      const b = map.get(key);
      if (slot.slotType === "EV") {
        b.evTotal += 1;
        b.evRate = slot.hourlyRate;
        if (slot.status === "AVAILABLE") b.evAvailable.push(slot);
      } else {
        b.standardTotal += 1;
        b.standardRate = slot.hourlyRate;
        if (slot.status === "AVAILABLE") b.standardAvailable.push(slot);
      }
    }
    return Array.from(map.values());
  }, [slots]);

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.key === selectedBuildingKey) || null,
    [buildings, selectedBuildingKey]
  );

  const handleBookSlot = async (slot, durationHours) => {
    setActionLoading(true);
    try {
      await apiRequest(`/api/booking/lock/${slot._id}`, { method: "POST" });
      await apiRequest(`/api/booking/confirm/${slot._id}`, {
        method: "POST",
        body: JSON.stringify({ estimatedDuration: Number(durationHours) }),
      });
      onNotify?.(
        "Booking Confirmed",
        `${slot.buildingName} — ${slot.slotType === "EV" ? "EV Charging" : "Parking"} (${durationHours} hr)`,
        "booking"
      );
      setSelectedBuildingKey(null);
      setActiveTab("activity");
      showToast("Booking confirmed! Your live session is now active.");
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClaimWaitlistSlot = async () => {
    const entry = waitlistStatus?.entry;
    const assignedSlot = entry?.assignedSlotId;
    const slotId = assignedSlot?._id || assignedSlot;
    if (!slotId) {
      showToast("Assigned slot not found. Refreshing...", "error");
      fetchDashboardData();
      return;
    }

    setActionLoading(true);
    try {
      await apiRequest(`/api/booking/confirm/${slotId}`, {
        method: "POST",
        body: JSON.stringify({ estimatedDuration: Number(claimDuration) }),
      });
      onNotify?.(
        "Booking Confirmed",
        `${entry.buildingName} — ${entry.slotType === "EV" ? "EV Charging" : "Parking"} (${claimDuration} hr)`,
        "booking"
      );
      setWaitlistStatus(null);
      setActiveTab("activity");
      showToast("Waitlist slot claimed! Your live session is now active.");
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, "error");
      fetchDashboardData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!activeBooking) return;
    setActionLoading(true);
    try {
      const slotId = activeBooking.slotId?._id || activeBooking.slotId;
      const res = await apiRequest(`/api/booking/release/${slotId}`, {
        method: "POST",
      });
      onNotify?.(
        "Checkout Complete",
        `${activeBooking.buildingName} — Final bill ₹${res.totalAmount}`,
        "checkout"
      );
      showToast(`Checked out! Final bill: ₹${res.totalAmount}`);
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinWaitlist = async (ownerId, slotType) => {
    setActionLoading(true);
    try {
      const res = await apiRequest("/api/waitlist/join", {
        method: "POST",
        body: JSON.stringify({ ownerId, slotType }),
      });
      showToast(res.message || "Joined waitlist!");
      onNotify?.("Joined Waitlist", res.message, "waitlist");
      setSelectedBuildingKey(null);
      setActiveTab("activity");
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveWaitlist = async () => {
    setActionLoading(true);
    try {
      await apiRequest("/api/waitlist/leave", { method: "DELETE" });
      showToast("Removed from waitlist.");
      setWaitlistStatus(null);
      fetchDashboardData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await apiRequest("/api/user/profile", {
        method: "PUT",
        body: JSON.stringify({ name: editName, vehicleNumber: editVehicle }),
      });
      onUserUpdate(res.user);
      setEditingProfile(false);
      showToast("Profile updated successfully!");
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

  const openDirections = (b) => {
    const c = b.location?.coordinates;
    if (c?.length === 2) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${c[1]},${c[0]}`, "_blank");
    } else {
      const q = encodeURIComponent(`${b.buildingName}, ${b.locality}, ${b.city}`);
      window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
    }
  };

  const mapCenter = coords ? [coords.lat, coords.lng] : [18.5204, 73.8567];
  const readyEntry = waitlistStatus?.entry?.status === "READY" ? waitlistStatus.entry : null;
  const readyRate = readyEntry?.assignedSlotId?.hourlyRate || 0;
  const readyEstimatedAmount = readyRate ? Math.round(readyRate * claimDuration) : 0;

  if (selectedBuilding) {
    return (
      <BookSlotView
        building={selectedBuilding}
        user={user}
        onBack={() => setSelectedBuildingKey(null)}
        onConfirm={handleBookSlot}
        onJoinWaitlist={handleJoinWaitlist}
        loading={actionLoading}
        waitlistStatus={waitlistStatus}
      />
    );
  }

  return (
    <div>
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

      {/* ==================== HOME TAB ==================== */}
      {activeTab === "home" && (
        <div className="space-y-4">
          {/* Urgent Banner if Waitlist Slot is READY */}
          {readyEntry && (
            <div className="rounded-2xl border border-emerald-500/50 bg-emerald-500/15 p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  Slot Ready! Claim in {formatCountdown(waitlistSecondsLeft)}
                </p>
                <p className="text-xs text-zinc-200 truncate mt-0.5">
                  {readyEntry.buildingName} •{" "}
                  {readyEntry.slotType === "EV" ? "EV Charging" : "Parking"}
                </p>
              </div>
              <button
                onClick={() => setActiveTab("activity")}
                className="shrink-0 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-3.5 py-2 text-xs transition cursor-pointer"
              >
                Claim Now
              </button>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search building, locality, or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-[#111622] pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {[
              { id: "ALL", label: "All" },
              { id: "STANDARD", label: "Parking", icon: Car },
              { id: "EV", label: "EV", icon: Zap },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => setSlotFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    slotFilter === f.id
                      ? "bg-emerald-500 text-zinc-950"
                      : "border border-zinc-800 bg-[#111622] text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {f.label}
                </button>
              );
            })}

            <button
              onClick={detectLocation}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-[#111622] px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-zinc-800 transition cursor-pointer"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              {gpsStatus}
            </button>
          </div>

          <div className="h-56 w-full overflow-hidden rounded-2xl border border-zinc-800 bg-[#111622]">
            <MapContainer center={mapCenter} zoom={13} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <RecenterMap center={mapCenter} />
              {coords && (
                <>
                  <CircleMarker
                    center={[coords.lat, coords.lng]}
                    radius={16}
                    pathOptions={{
                      color: "#10b981",
                      fillColor: "#10b981",
                      fillOpacity: 0.22,
                      weight: 0,
                    }}
                  />
                  <CircleMarker
                    center={[coords.lat, coords.lng]}
                    radius={7}
                    pathOptions={{
                      color: "#ffffff",
                      fillColor: "#10b981",
                      fillOpacity: 1,
                      weight: 2.5,
                    }}
                  >
                    <Popup>You are here</Popup>
                  </CircleMarker>
                </>
              )}
              {buildings.map((b) => {
                const c = b.location?.coordinates;
                if (!c || c.length !== 2) return null;
                return (
                  <Marker key={b.ownerId} position={[c[1], c[0]]}>
                    <Popup>
                      <strong>{b.buildingName}</strong>
                      <br />
                      {b.standardAvailable.length + b.evAvailable.length} Slots Open
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>

          <div className="flex items-center justify-between pt-1">
            <h2 className="text-sm font-bold text-zinc-100">Available Locations</h2>
            <span className="text-xs font-medium text-emerald-400">{buildings.length} found</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-10 text-emerald-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : buildings.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-8 text-center text-xs text-zinc-400">
              No parking buildings found matching your filter.
            </div>
          ) : (
            <div className="space-y-3">
              {buildings.map((b) => {
                const totalOpen = b.standardAvailable.length + b.evAvailable.length;
                const standardFull = b.standardTotal > 0 && b.standardAvailable.length === 0;
                const evFull = b.evTotal > 0 && b.evAvailable.length === 0;

                return (
                  <div
                    key={b.key}
                    className="rounded-2xl border border-zinc-800/90 bg-[#111622] p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-base text-zinc-100">{b.buildingName}</h3>
                        <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3.5 w-3.5 text-rose-400" />
                          {[b.locality, b.city].filter(Boolean).join(", ") || "Location not set"}
                          {typeof b.distanceKm === "number" && (
                            <span className="text-emerald-400 font-medium ml-1">
                              • {b.distanceKm} km
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                          totalOpen > 0
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                            : "bg-amber-500/15 border-amber-500/30 text-amber-400"
                        }`}
                      >
                        • {totalOpen > 0 ? `${totalOpen} Slots Open` : "Full"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-zinc-300">
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                        {b.standardTotal > 0 && (
                          <span className="inline-flex items-center gap-1">
                            Parking <strong className="text-emerald-400">₹{b.standardRate}/hr</strong>
                            {standardFull && (
                              <span className="text-[10px] font-semibold text-amber-400">(Full)</span>
                            )}
                          </span>
                        )}
                        {b.evTotal > 0 && (
                          <span className="inline-flex items-center gap-1">
                            EV <strong className="text-cyan-400">₹{b.evRate}/hr</strong>
                            {evFull && (
                              <span className="text-[10px] font-semibold text-amber-400">(Full)</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/80">
                      <button
                        onClick={() => openDirections(b)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 transition cursor-pointer"
                      >
                        <Navigation className="h-3.5 w-3.5 text-emerald-400" />
                        Directions
                      </button>

                      {totalOpen === 0 && !activeBooking ? (
                        <button
                          onClick={() => setSelectedBuildingKey(b.key)}
                          className="flex-1 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold py-2 text-xs transition cursor-pointer"
                        >
                          Join Waitlist
                        </button>
                      ) : (
                        <button
                          disabled={!!activeBooking}
                          onClick={() => setSelectedBuildingKey(b.key)}
                          className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-2 text-xs transition cursor-pointer disabled:opacity-40"
                        >
                          {activeBooking ? "Session Active" : "Book Slot"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== ACTIVITY TAB ==================== */}
      {activeTab === "activity" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold">Activity & Receipts</h1>
            <p className="text-xs text-zinc-400 mt-0.5">Live session, waitlist & past bookings</p>
          </div>

          <div className="space-y-2.5">
            <h2 className="text-sm font-bold text-zinc-200">Currently Parked</h2>
            {activeBooking ? (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                    • Live Session
                  </span>
                  <h3 className="font-bold text-base mt-0.5">{activeBooking.buildingName}</h3>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    {[activeBooking.locality, activeBooking.city].filter(Boolean).join(", ")} • ₹
                    {activeBooking.hourlyRate}/hr
                  </p>
                </div>
                <button
                  onClick={handleCheckout}
                  disabled={actionLoading}
                  className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-4 py-2 text-xs transition cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Checkout & Pay"}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-6 text-center text-xs text-zinc-500">
                No active parking session right now.
              </div>
            )}
          </div>

          {waitlistStatus?.entry && (
            <div className="space-y-2.5">
              <h2 className="text-sm font-bold text-zinc-200">Active Waitlist</h2>

              {readyEntry ? (
                <div className="rounded-2xl border border-emerald-500/50 bg-emerald-950/25 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                        • Slot Ready for You
                      </span>
                      <p className="text-base font-bold text-zinc-100 mt-0.5">
                        {readyEntry.buildingName}
                      </p>
                      <p className="text-xs text-zinc-300 mt-0.5">
                        {readyEntry.slotType === "EV" ? "EV Charging" : "Parking"}
                        {readyEntry.assignedSlotId?.slotNumber
                          ? ` • Slot ${readyEntry.assignedSlotId.slotNumber}`
                          : ""}
                        {readyRate ? ` • ₹${readyRate}/hr` : ""}
                      </p>
                    </div>

                    <div className="shrink-0 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-emerald-300">
                        Expires in
                      </p>
                      <p className="text-sm font-bold text-emerald-400 tabular-nums">
                        {formatCountdown(waitlistSecondsLeft)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-zinc-400">Select Stay Duration</p>
                    <div className="grid grid-cols-4 gap-2">
                      {CLAIM_DURATIONS.map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setClaimDuration(opt.hours)}
                          className={`rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
                            claimDuration === opt.hours
                              ? "bg-emerald-500 text-zinc-950"
                              : "border border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-600"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleClaimWaitlistSlot}
                      className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-2.5 text-xs transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      {actionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        `Claim & Book${readyEstimatedAmount ? ` (₹${readyEstimatedAmount})` : ""}`
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleLeaveWaitlist}
                      className="rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 px-3.5 py-2.5 text-xs font-semibold text-rose-300 transition cursor-pointer disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-950/15 p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-zinc-100">
                      {waitlistStatus.entry.buildingName}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {waitlistStatus.entry.slotType === "EV" ? "EV Charging" : "Parking"} •
                      Position #{waitlistStatus.position} of {waitlistStatus.totalWaiting}
                    </p>
                  </div>
                  <button
                    disabled={actionLoading}
                    onClick={handleLeaveWaitlist}
                    className="rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 px-3 py-1.5 text-xs font-semibold text-rose-300 transition cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    Leave
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-200">Booking History</h2>
              <span className="text-xs font-medium text-emerald-400">
                {completedHistory.length} completed
              </span>
            </div>

            {completedHistory.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-6 text-center text-xs text-zinc-500">
                No past bookings yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {completedHistory.map((item) => {
                  const isEv =
                    (item.slotType || item.slotId?.slotType) === "EV" ||
                    String(item.slotNumber || item.slotId?.slotNumber || "").startsWith("EV");

                  return (
                    <div
                      key={item._id}
                      onClick={() => setSelectedBooking(item)}
                      className="rounded-2xl border border-zinc-800 bg-[#111622] hover:border-emerald-500/40 p-4 flex items-center justify-between transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
                          {isEv ? <Zap className="h-4 w-4 text-amber-400" /> : <Car className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">{item.buildingName}</p>
                          <p className="text-xs text-zinc-400">
                            {isEv ? "EV Charging" : "Parking"} •{" "}
                            {item.hoursParked ? `${item.hoursParked} hr` : `${item.estimatedDuration || 1} hr`}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-bold text-zinc-100">
                          ₹{item.totalAmount ?? item.hourlyRate ?? 0}
                        </p>
                        <span className="inline-block mt-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] font-medium text-zinc-300">
                          Completed
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
              <h1 className="text-xl font-bold">Driver Account</h1>
              <p className="text-xs text-zinc-400 mt-0.5">Profile & registered vehicle</p>
            </div>
            {!editingProfile && (
              <button
                onClick={() => {
                  setEditName(user.name || "");
                  setEditVehicle(user.vehicleNumber || "");
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
                <label className="text-xs text-zinc-400">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Vehicle Number Plate</label>
                <input
                  type="text"
                  required
                  value={editVehicle}
                  onChange={(e) => setEditVehicle(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm tracking-widest outline-none focus:border-emerald-500"
                />
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
                    {user.role}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                  <Car className="h-4 w-4 text-rose-400" />
                  Registered Vehicle
                </div>
                <p className="text-xs text-zinc-400">Vehicle Number Plate</p>
                <div className="inline-block rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold tracking-widest text-zinc-100">
                  {user.vehicleNumber || "Not set"}
                </div>
              </div>
            </>
          )}

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
            { id: "home", label: "Home", icon: Home },
            { id: "activity", label: "Activity", icon: Clock },
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
                    Enter the 6-digit code sent to{" "}
                    <strong className="text-zinc-200">{user.email}</strong>. This action cannot be
                    undone.
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