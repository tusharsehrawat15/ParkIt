import { motion, AnimatePresence } from "framer-motion";
import { X, Car, Zap, Clock, Building2, User, MapPin, Receipt } from "lucide-react";

function formatDateTime(dateValue) {
  if (!dateValue) return "—";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(booking) {
  const start = booking.startTime || booking.createdAt;
  const end = booking.endTime || booking.updatedAt;

  if (start && end && booking.status !== "ACTIVE") {
    const diffMs = new Date(end) - new Date(start);
    if (diffMs > 0) {
      const totalMins = Math.max(1, Math.round(diffMs / 60000));
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} mins`;
      if (hrs > 0) return `${hrs} ${hrs === 1 ? "hr" : "hrs"}`;
      return `${mins} mins`;
    }
  }

  const hrs = booking.hoursParked || booking.estimatedDuration;
  if (!hrs) return "—";
  if (hrs < 1) return `${Math.round(hrs * 60)} mins`;
  return `${hrs} ${hrs === 1 ? "hr" : "hrs"}`;
}

export default function BookingDetailsModal({ booking, currentUser, onClose }) {
  if (!booking) return null;

  const isEv =
  (booking.slotType || booking.slotId?.slotType) === "EV" ||
  String(booking.slotNumber || booking.slotId?.slotNumber || "").startsWith("EV");
  

  // Driver details (supports populated driverId or flat fields)
  const driverName =
    booking.driverName ||
    booking.driverId?.name ||
    (currentUser?.role === "DRIVER" ? currentUser.name : "—");
  const vehicleNumber =
    booking.vehicleNumber ||
    booking.driverId?.vehicleNumber ||
    (currentUser?.role === "DRIVER" ? currentUser.vehicleNumber : "—");

  // Building & Owner details (supports populated ownerId or flat fields)
  const ownerName =
    booking.ownerName ||
    booking.ownerId?.name ||
    (currentUser?.role === "OWNER" ? currentUser.name : "—");
  const buildingName =
    booking.buildingName ||
    booking.ownerId?.buildingName ||
    booking.slotId?.buildingName ||
    "—";
  const locality =
    booking.locality ||
    booking.ownerId?.locality ||
    booking.slotId?.locality ||
    "";
  const city =
    booking.city ||
    booking.ownerId?.city ||
    booking.slotId?.city ||
    "";

  const startTime = booking.startTime || booking.createdAt;
  const endTime = booking.status === "ACTIVE" ? null : booking.endTime || booking.updatedAt;
  const totalAmount = booking.totalAmount ?? booking.hourlyRate ?? 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#111622] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/90">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Receipt className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Booking Receipt</h3>
                <p className="text-[11px] text-zinc-400">
                    {isEv ? "EV Charging" : "Parking"}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Amount & Status Banner */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-zinc-400 uppercase tracking-wider">Total Paid</p>
                <p className="text-2xl font-bold text-emerald-400 mt-0.5">₹{totalAmount}</p>
              </div>
              <div className="text-right space-y-1">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    booking.status === "ACTIVE"
                      ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                      : "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {booking.status === "ACTIVE" ? "• Active" : "Completed"}
                </span>
                <p className="text-[11px] text-zinc-400 flex items-center justify-end gap-1">
                  {isEv ? <Zap className="h-3 w-3 text-amber-400" /> : <Car className="h-3 w-3 text-rose-400" />}
                  {isEv ? "EV Slot" : "Standard Slot"}
                </p>
              </div>
            </div>

            {/* Driver & Timing Details */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200 pb-1 border-b border-zinc-800/80">
                <User className="h-3.5 w-3.5 text-emerald-400" />
                Driver & Session Details
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Driver Name</span>
                  <span className="font-semibold text-zinc-100 text-right">{driverName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Vehicle Number</span>
                  <span className="font-bold tracking-wider text-zinc-100 text-right">
                    {vehicleNumber}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Start Time</span>
                  <span className="text-zinc-200 text-right">{formatDateTime(startTime)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">End Time</span>
                  <span className="text-zinc-200 text-right">
                    {endTime ? formatDateTime(endTime) : "In progress"}
                  </span>
                </div>
                <div className="flex justify-between gap-2 pt-1 border-t border-zinc-800/60">
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-emerald-400" />
                    Total Time Parked
                  </span>
                  <span className="font-semibold text-emerald-400 text-right">
                    {formatDuration(booking)}
                  </span>
                </div>
              </div>
            </div>

            {/* Building Details */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200 pb-1 border-b border-zinc-800/80">
                <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                Building Details
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Building Name</span>
                  <span className="font-semibold text-zinc-100 text-right">{buildingName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Owner Name</span>
                  <span className="font-medium text-zinc-200 text-right">{ownerName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-rose-400" />
                    Locality
                  </span>
                  <span className="text-zinc-200 text-right">{locality || "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">City</span>
                  <span className="text-zinc-200 text-right">{city || "—"}</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}