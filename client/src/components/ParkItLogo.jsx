export default function ParkItLogo({ className = "h-10 w-10" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Rounded emerald-tinted badge */}
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill="#10b981"
        fillOpacity="0.14"
        stroke="#10b981"
        strokeOpacity="0.4"
        strokeWidth="2"
      />
      {/* Bold 'P' stem & loop */}
      <path
        d="M17 50V14H36C44.284 14 50 19.373 50 26.5C50 33.627 44.284 39 36 39H25.5V50H17Z"
        fill="#10b981"
      />
      {/* Cutout inside the 'P' loop */}
      <path
        d="M25.5 21.5H35.2C39.2 21.5 42 23.6 42 26.5C42 29.4 39.2 31.5 35.2 31.5H25.5V21.5Z"
        fill="#09090b"
      />
      {/* Mini car silhouette parked inside the P */}
      <path
        d="M27.5 28.5L29 25.2C29.3 24.5 30 24 30.8 24H36.2C37 24 37.7 24.5 38 25.2L39.5 28.5H27.5Z"
        fill="#34d399"
      />
      <rect x="26.5" y="27.8" width="14" height="3.2" rx="1.4" fill="#10b981" />
      <circle cx="29.5" cy="31.2" r="1.4" fill="#fafafa" />
      <circle cx="37.5" cy="31.2" r="1.4" fill="#fafafa" />
    </svg>
  );
}