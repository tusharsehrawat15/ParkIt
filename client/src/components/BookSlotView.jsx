import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, MapPin, Car, Zap, Loader2, Clock } from "lucide-react";
import ParkItLogo from "./ParkItLogo";

const DURATION_OPTIONS = [
  { label: "30 mins", hours: 0.5 },
  { label: "1 hr", hours: 1 },
  { label: "2 hrs", hours: 2 },
  { label: "4 hrs", hours: 4 },
];

export default function BookSlotView({
  building,
  user,
  onBack,
  onConfirm,
  onJoinWaitlist,
  loading,
  waitlistStatus,
}) {
  const offersStandard = building.standardTotal > 0;
  const offersEv = building.evTotal > 0;
  const hasStandardOpen = building.standardAvailable.length > 0;
  const hasEvOpen = building.evAvailable.length > 0;

  const [service, setService] = useState(
    hasStandardOpen ? "STANDARD" : hasEvOpen ? "EV" : offersStandard ? "STANDARD" : "EV"
  );
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[1]);

  const totalOpen = building.standardAvailable.length + building.evAvailable.length;
  const activeRate = service === "EV" ? building.evRate : building.standardRate;
  const totalAmount = activeRate ? Math.round(activeRate * selectedDuration.hours) : 0;

  const isSelectedOffered = service === "EV" ? offersEv : offersStandard;
  const isSelectedFull = service === "EV" ? !hasEvOpen : !hasStandardOpen;
  const serviceLabel = service === "EV" ? "EV Charging" : "Parking";

  const alreadyWaitlistedHere =
    waitlistStatus?.entry &&
    String(waitlistStatus.entry.ownerId) === String(building.ownerId) &&
    waitlistStatus.entry.slotType === service;

  const handleConfirm = () => {
    const slot = service === "EV" ? building.evAvailable[0] : building.standardAvailable[0];
    if (!slot) return;
    onConfirm(slot, selectedDuration.hours);
  };

  const handleWaitlist = () => {
    if (!isSelectedOffered || !isSelectedFull) return;
    onJoinWaitlist(building.ownerId, service);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.2 }}
      className="space-y-6 pb-8"
    >
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="h-10 w-10 rounded-full border border-zinc-800 bg-[#111622] hover:bg-zinc-800 flex items-center justify-center text-zinc-200 transition cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 font-bold text-base">
          <ParkItLogo className="h-7 w-7" />
          <span>{isSelectedFull ? "Join Waitlist" : "Book a Slot"}</span>
        </div>

        <div className="w-10" />
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-100">{building.buildingName}</h2>
          <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
            <MapPin className="h-3.5 w-3.5 text-rose-400" />
            {building.locality}, {building.city}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold border ${
            totalOpen > 0
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
              : "bg-amber-500/15 border-amber-500/30 text-amber-400"
          }`}
        >
          • {totalOpen > 0 ? `${totalOpen} Slots Open` : "All Full"}
        </span>
      </div>

      <div className="space-y-2.5">
        <h3 className="text-sm font-bold text-zinc-200">Select Service</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!offersStandard}
            onClick={() => setService("STANDARD")}
            className={`rounded-2xl border p-4 text-center space-y-1.5 transition ${
              !offersStandard
                ? "border-zinc-800/70 bg-[#111622]/60 opacity-45 cursor-not-allowed"
                : service === "STANDARD"
                ? hasStandardOpen
                  ? "border-emerald-500 bg-emerald-500/10 cursor-pointer"
                  : "border-amber-500 bg-amber-500/10 cursor-pointer"
                : "border-zinc-800 bg-[#111622] hover:border-zinc-700 cursor-pointer"
            }`}
          >
            <div className="flex justify-center">
              <Car className="h-6 w-6 text-rose-400" />
            </div>
            <p className="text-sm font-bold text-zinc-100">Parking</p>
            <p className="text-xs font-semibold text-emerald-400">
              {building.standardRate ? `₹${building.standardRate} /hr` : "N/A"}
            </p>
            <p
              className={`text-[11px] font-medium ${
                !offersStandard
                  ? "text-zinc-500"
                  : hasStandardOpen
                  ? "text-zinc-400"
                  : "text-amber-400"
              }`}
            >
              {!offersStandard
                ? "Not offered"
                : hasStandardOpen
                ? `${building.standardAvailable.length} open`
                : "Full • Waitlist"}
            </p>
          </button>

          <button
            type="button"
            disabled={!offersEv}
            onClick={() => setService("EV")}
            className={`rounded-2xl border p-4 text-center space-y-1.5 transition ${
              !offersEv
                ? "border-zinc-800/70 bg-[#111622]/60 opacity-45 cursor-not-allowed"
                : service === "EV"
                ? hasEvOpen
                  ? "border-emerald-500 bg-emerald-500/10 cursor-pointer"
                  : "border-amber-500 bg-amber-500/10 cursor-pointer"
                : "border-zinc-800 bg-[#111622] hover:border-zinc-700 cursor-pointer"
            }`}
          >
            <div className="flex justify-center">
              <Zap className="h-6 w-6 text-amber-400" />
            </div>
            <p className="text-sm font-bold text-zinc-100">EV Charging</p>
            <p className="text-xs font-semibold text-emerald-400">
              {building.evRate ? `₹${building.evRate} /hr` : "N/A"}
            </p>
            <p
              className={`text-[11px] font-medium ${
                !offersEv
                  ? "text-zinc-500"
                  : hasEvOpen
                  ? "text-zinc-400"
                  : "text-amber-400"
              }`}
            >
              {!offersEv
                ? "Not offered"
                : hasEvOpen
                ? `${building.evAvailable.length} open`
                : "Full • Waitlist"}
            </p>
          </button>
        </div>
      </div>

      {!isSelectedFull ? (
        <>
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-zinc-200">Stay Duration</h3>
            <div className="grid grid-cols-4 gap-2">
              {DURATION_OPTIONS.map((opt) => {
                const active = selectedDuration.label === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSelectedDuration(opt)}
                    className={`rounded-xl py-2.5 text-xs font-semibold transition cursor-pointer ${
                      active
                        ? "bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20"
                        : "border border-zinc-800 bg-[#111622] text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-5 space-y-3">
            <h3 className="text-sm font-bold text-zinc-100">Booking Summary</h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Vehicle Plate</span>
                <span className="font-bold tracking-wider text-zinc-100">
                  {user.vehicleNumber || "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Service</span>
                <span className="font-semibold text-zinc-100">{serviceLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Duration</span>
                <span className="font-semibold text-zinc-100">{selectedDuration.label}</span>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-100">Total Amount</span>
              <span className="text-lg font-bold text-emerald-400">₹{totalAmount}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={loading || !isSelectedOffered}
            onClick={handleConfirm}
            className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3.5 text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm & Book Slot"}
          </button>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-amber-500/30 bg-[#111622] p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
              <Clock className="h-4 w-4" />
              <span>{serviceLabel} Waitlist</span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              All {serviceLabel.toLowerCase()} slots at{" "}
              <strong className="text-zinc-200">{building.buildingName}</strong> are currently
              occupied. Join the {serviceLabel.toLowerCase()} queue to get notified and hold the
              next open slot for 5 minutes.
            </p>

            <div className="space-y-2.5 text-xs pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Vehicle Plate</span>
                <span className="font-bold tracking-wider text-zinc-100">
                  {user.vehicleNumber || "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Queue Type</span>
                <span className="font-semibold text-amber-400">{serviceLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Rate</span>
                <span className="font-semibold text-emerald-400">₹{activeRate || 0}/hr</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={loading || !isSelectedOffered || alreadyWaitlistedHere}
            onClick={handleWaitlist}
            className="w-full rounded-2xl border border-amber-500/40 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold py-3.5 text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : alreadyWaitlistedHere ? (
              `Already on ${serviceLabel} Waitlist`
            ) : (
              `Join ${serviceLabel} Waitlist`
            )}
          </button>
        </>
      )}
    </motion.div>
  );
}