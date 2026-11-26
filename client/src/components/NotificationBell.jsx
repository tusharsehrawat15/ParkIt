import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCircle2, Sparkles, LogOut as CheckoutIcon, Trash2 } from "lucide-react";

export default function NotificationBell({ notifications, onMarkAllRead, onClear }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) onMarkAllRead();
  };

  const getIcon = (type) => {
    if (type === "waitlist") return <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />;
    if (type === "checkout") return <CheckoutIcon className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />;
    return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggleOpen}
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-xl border border-zinc-800 bg-[#111622] text-zinc-300 hover:bg-zinc-800 hover:text-emerald-400 transition cursor-pointer"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-zinc-950">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-16 sm:top-12 z-50 sm:w-80 rounded-2xl border border-zinc-800 bg-[#111622]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <span className="text-sm font-semibold text-zinc-100">Notifications</span>
              {notifications.length > 0 && (
                <button
                  onClick={onClear}
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 transition cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-zinc-800/70">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">
                  No notifications yet. You'll be alerted here for waitlist openings, bookings, and checkouts.
                </div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 p-3.5 hover:bg-zinc-800/40 transition">
                    {getIcon(n.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-100">{n.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-zinc-500 mt-1">{n.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}