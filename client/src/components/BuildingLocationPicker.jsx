import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import { MapPin, LocateFixed, Check, Loader2 } from "lucide-react";
import { apiRequest } from "../lib/api";

function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 15, { duration: 0.7 });
  }, [center, map]);
  return null;
}

function MapClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      });
    },
  });
  return null;
}

export default function BuildingLocationPicker({ user, onSaved, onError }) {
  const existingCoords = user.location?.coordinates;
  const hasExistingPin = Array.isArray(existingCoords) && existingCoords.length === 2;

  const [pin, setPin] = useState(
    hasExistingPin ? { lat: existingCoords[1], lng: existingCoords[0] } : null
  );
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const mapCenter = pin ? [pin.lat, pin.lng] : [18.5204, 73.8567];

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      onError?.("GPS is not supported in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        onError?.("Could not fetch GPS location. Please allow location access or tap the map.");
      }
    );
  };

  const handleSavePin = async () => {
    if (!pin) {
      onError?.("Tap on the map or use GPS to place a pin first.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest("/api/user/location", {
        method: "PUT",
        body: JSON.stringify({ lat: pin.lat, lng: pin.lng }),
      });
      onSaved?.(res.location);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#111622] p-5 space-y-3.5">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
          <MapPin className="h-4 w-4 text-rose-400" />
          Building Map Pin
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
            hasExistingPin
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
          }`}
        >
          {hasExistingPin ? "Pinned" : "Not Pinned"}
        </span>
      </div>

      <p className="text-xs text-zinc-400">
        Tap anywhere on the map or use your current GPS to pin your building so nearby drivers can
        find it within 10 km.
      </p>

      <div className="h-52 w-full overflow-hidden rounded-xl border border-zinc-800">
        <MapContainer center={mapCenter} zoom={hasExistingPin ? 15 : 12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecenterMap center={pin ? [pin.lat, pin.lng] : null} />
          <MapClickHandler onPick={setPin} />
          {pin && <Marker position={[pin.lat, pin.lng]} />}
        </MapContainer>
      </div>

      {pin && (
        <p className="text-[11px] text-zinc-400">
          Selected pin:{" "}
          <span className="text-emerald-400 font-medium">
            {pin.lat}, {pin.lng}
          </span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleUseCurrentGps}
          disabled={locating}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3.5 py-2.5 text-xs font-medium text-emerald-400 transition cursor-pointer disabled:opacity-50"
        >
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
          Use My GPS
        </button>

        <button
          type="button"
          onClick={handleSavePin}
          disabled={saving || !pin}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-2.5 text-xs transition cursor-pointer disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {saving ? "Saving Pin..." : "Save Map Pin"}
        </button>
      </div>
    </div>
  );
}