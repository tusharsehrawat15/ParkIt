import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { io } from "socket.io-client";
import { apiRequest } from "./lib/api";
import AuthPage from "./components/AuthPage";
import ParkItLogo from "./components/ParkItLogo";
import DriverDashboard from "./components/DriverDashboard";
import NotificationBell from "./components/NotificationBell";

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((title, message, type = "booking") => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setNotifications((prev) => [
      { id: `${Date.now()}-${Math.random()}`, title, message, type, time, read: false },
      ...prev.slice(0, 19),
    ]);
  }, []);

  useEffect(() => {
    apiRequest("/api/user/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const socket = io();
    socket.on("waitlistNotified", (payload) => {
      if (!payload?.driverId || payload.driverId === user._id || payload.driverId === user.id) {
        addNotification(
          "Nearby Slot Available!",
          payload?.message || "A parking slot just opened up nearby for your waitlist.",
          "waitlist"
        );
      }
    });
    return () => socket.disconnect();
  }, [user, addNotification]);

  const handleLogout = async () => {
    await apiRequest("/api/user/logout", { method: "POST" });
    setNotifications([]);
    setUser(null);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center text-emerald-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthSuccess={setUser} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] text-zinc-100 pb-20">
      <header className="border-b border-zinc-800/80 bg-[#0d111a]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-lg">
            <ParkItLogo className="h-8 w-8" />
            <span>
              Park<span className="text-emerald-400">It</span>
            </span>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
              {user.role}
            </span>
          </div>

          <NotificationBell
            notifications={notifications}
            onMarkAllRead={() =>
              setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
            }
            onClear={() => setNotifications([])}
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        {user.role === "DRIVER" ? (
          <DriverDashboard
            user={user}
            onUserUpdate={setUser}
            onLogout={handleLogout}
            onNotify={addNotification}
          />
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
            <h2 className="text-xl font-semibold text-emerald-400">Welcome, {user.name}!</h2>
            <p className="text-sm text-zinc-400 mt-2">Owner Dashboard is up next!</p>
          </div>
        )}
      </main>
    </div>
  );
}