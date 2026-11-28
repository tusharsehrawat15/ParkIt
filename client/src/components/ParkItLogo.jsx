import { useId } from "react";

export default function ParkItLogo({ className = "h-8 w-8" }) {
  const uid = useId();
  const gradId = `parkit-grad-${uid}`;
  const glowId = `parkit-glow-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ParkIt Logo"
    >
      <defs>
        <linearGradient id={gradId} x1="25" y1="16" x2="75" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>

        <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Dark rounded badge with subtle emerald border */}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="22"
        fill="#0c1219"
        stroke="#22c55e"
        strokeOpacity="0.35"
        strokeWidth="2.5"
      />

      {/* Glowing bold emerald P */}
      <path
        d="M35 18 H52 A21 21 0 0 1 52 60 H44 V74 A8.5 8.5 0 0 1 27 74 V26 A8 8 0 0 1 35 18 Z"
        fill={`url(#${gradId})`}
        filter={`url(#${glowId})`}
      />

      {/* Negative-space car silhouette inside the P */}
      <g>
        {/* Cabin / Roof */}
        <path
          d="M44 37.5 L46.2 30.5 C46.7 29.1 47.9 28.2 49.4 28.2 H54.6 C56.1 28.2 57.3 29.1 57.8 30.5 L60 37.5 Z"
          fill="#0c1219"
        />
        {/* Windshield */}
        <path
          d="M46.5 36.2 L48 31.3 C48.2 30.7 48.7 30.3 49.4 30.3 H54.6 C55.3 30.3 55.8 30.7 56 31.3 L57.5 36.2 Z"
          fill={`url(#${gradId})`}
        />
        {/* Side mirrors */}
        <rect x="39.8" y="35.2" width="3.6" height="2.2" rx="1" fill="#0c1219" />
        <rect x="60.6" y="35.2" width="3.6" height="2.2" rx="1" fill="#0c1219" />
        {/* Main body / Bumper */}
        <rect x="41.5" y="37" width="21" height="9.2" rx="3" fill="#0c1219" />
        {/* Headlights & grille */}
        <circle cx="45.5" cy="41.5" r="1.6" fill={`url(#${gradId})`} />
        <circle cx="58.5" cy="41.5" r="1.6" fill={`url(#${gradId})`} />
        <rect x="48.8" y="41.2" width="6.4" height="1.5" rx="0.75" fill={`url(#${gradId})`} />
        {/* Tires */}
        <rect x="42.5" y="45.5" width="4.2" height="4.5" rx="1.2" fill="#0c1219" />
        <rect x="57.3" y="45.5" width="4.2" height="4.5" rx="1.2" fill="#0c1219" />
        {/* Inner stem notch */}
        <rect x="42.5" y="49" width="2.8" height="11.5" fill="#0c1219" />
      </g>
    </svg>
  );
}