import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { io } from "socket.io-client";
import { apiRequest } from "./lib/api";
import AuthPage from "./components/AuthPage";
import ParkItLogo from "./components/ParkItLogo";
import DriverDashboard from "./components/DriverDashboard";
import NotificationBell from "./components/NotificationBell";
import OwnerDashboard from "./components/OwnerDashboard";

function formatNotification(n) {
  const created = n.createdAt ? new Date(n.createdAt) : new Date();
  const isToday = created.toDateString() === new Date().toDateString();
  const time = isToday
    ? created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : created.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return {
    id: String(n._id || n.id),
    title: n.title,
    message: n.message,
    type: String(n.type || "info").toLowerCase(),
    time,
    read: Boolean(n.isRead ?? n.read),
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [notifications, setNotifications] = useState([]);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiRequest("/api/notification");
      setNotifications((data.notifications || []).map(formatNotification));
    } catch {
      // Keep existing state if fetch fails
    }
  }, []);

  useEffect(() => {
    apiRequest("/api/user/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => {
    const userId = user?._id || user?.id;
    if (!userId) {
      setNotifications([]);
      return;
    }

    fetchNotifications();

    const socket = io();
    const registerUser = () => socket.emit("register", userId);

    socket.on("connect", registerUser);
    if (socket.connected) registerUser();

    socket.on("notification:new", (notif) => {
      if (!notif) return;
      const formatted = formatNotification(notif);
      setNotifications((prev) => {
        if (prev.some((item) => item.id === formatted.id)) return prev;
        return [formatted, ...prev].slice(0, 20);
      });
    });

    return () => {
      socket.off("connect", registerUser);
      socket.disconnect();
    };
  }, [user, fetchNotifications]);

  // Backend already persists & pushes booking, checkout, and waitlist notifications
  const handleNotifyFallback = useCallback(() => {}, []);

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await apiRequest("/api/notification/read-all", { method: "PATCH" });
    } catch {
      // Ignore network hiccup; next fetch reconciles state
    }
  };

  const handleClearNotifications = async () => {
    setNotifications([]);
    try {
      await apiRequest("/api/notification", { method: "DELETE" });
    } catch {
      fetchNotifications();
    }
  };

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
            onMarkAllRead={handleMarkAllRead}
            onClear={handleClearNotifications}
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        {user.role === "DRIVER" ? (
          <DriverDashboard
            user={user}
            onUserUpdate={setUser}
            onLogout={handleLogout}
            onNotify={handleNotifyFallback}
          />
        ) : (
          <OwnerDashboard
            user={user}
            onUserUpdate={setUser}
            onLogout={handleLogout}
            onNotify={handleNotifyFallback}
          />
        )}
      </main>
    </div>
  );
}