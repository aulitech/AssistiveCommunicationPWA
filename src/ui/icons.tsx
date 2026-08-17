
// Every icon the app draws, as inline SVG.
//
// Inline rather than a sprite or an icon font: the app has to work with no
// network, and each of these is a handful of path data that gzips to nothing.
// Icons used by exactly one screen stay with that screen instead.

export function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

export function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}

export function SpeakIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

export function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

export function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.74 3.17.78 1.21-.24 2.37-.93 3.67-.84 1.56.12 2.73.72 3.5 1.9-3.22 1.94-2.45 6.06.56 7.34-.65 1.58-1.51 3.17-2.9 3.7zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  )
}

export function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="#1877F2" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

// The Peri mark. No backing plate here — it sits on the page background, which
// is the same dark the icon files use behind it. The paths are duplicated in
// public/icon.svg and public/icon-maskable.svg, which are static files and
// cannot import them.
export function AppLogoIcon() {
  return (
    <svg viewBox="0 0 1970.57 1903.4" xmlns="http://www.w3.org/2000/svg" fill="var(--brand)" aria-hidden="true">
      <path d="M1086.39,1256.11c-2.28-1.87-10.82-6.34-13.73-7.28-20.8-6.68-113.08-5.44-138.64-3.44-18.28,1.43-30.5,5.25-41.78,20.19-26.16,34.63-46.68,88.62-71.48,126.42-10.93,16.66-18.83,27.33-40.51,29.46-41.59,4.08-130.19,3.75-172.08-.02-13.74-1.23-22.82-6.03-32.89-15.09-38.55-49-95.26-92.49-132.99-140.89-10.4-13.34-16.83-28.88-9.54-45.55,161.34-282.15,322.69-565.08,489.36-844.03,8.52-6.89,17.31-10.52,28.24-11.74,18.67-2.08,90.8-2.5,105.78,3.65,6.83,2.81,15.23,10.35,19.77,16.22l478.57,826.82c15.29,34.51,1.16,46.32-20.61,70.63-38.88,43.42-82.35,83.17-120.95,126.94l-27.01,12.97c-40.34,3.89-118.73,5.07-173.99.07-8.33-.75-17.26-3.13-24.3-7.68-23-14.89-69.65-115.95-90.94-144.95-1.8-2.46-8.66-11.38-10.27-12.71ZM706.55,1256.81c35.98-43.88,61.65-102.66,96.64-146.24,9.93-12.37,18.05-19.43,34.86-21.11l327.05.96c12.01,3.04,21.06,12.01,28.7,21.28,32.69,39.64,58.52,97.38,91.48,136.41,39.16,46.37,105.38-7.62,78.35-56.35-113.31-192.14-220.73-388.28-337.52-578.05-17.2-15.1-38.14-12.97-56.41-1.29l-338.24,580.32c-24.39,42.42,36.43,97.43,75.09,64.08Z"/>
      <path d="M1868.2,1237.94c10.81-1.44,22.13,1.85,31.15,7.85,11.3,7.53,61.64,56.3,66.8,67.14,6.97,14.64,5.2,27.01-1.82,41.16-113.43,117.45-224.57,238.02-339.48,354.2-35.44,35.83-58.68,74.72-112.93,74.99-133.66.67-300.01-7.81-445.63.18-50.3,6.43-68.63,55.61-107.36,82.55-152.45,106.02-354.01-28.98-316.73-210.77,28.1-137.06,187.55-203.25,306.73-130.76,40.31,24.52,60.37,71.26,109.37,78.54l423.07-.22,28.87-11.12c115.69-109.8,221.96-229.89,335.42-342.27,5.59-5.22,14.96-10.47,22.54-11.48ZM895.39,1698.57c0-29.72-24.1-53.82-53.82-53.82s-53.82,24.1-53.82,53.82,24.1,53.82,53.82,53.82,53.82-24.1,53.82-53.82Z"/>
      <path d="M580.84,174.58c228.66-12.88,300.9,297.2,100.78,388.63-53.81,24.59-103.67,6.87-141.16,60.75-100.06,189.51-227.77,372.36-325.39,562.2-22.93,44.59-24.96,76.06,8.4,116.21,81.08,97.6,183.65,189.18,268.84,284.91,18.59,20.88,41.57,40.26,27.35,71.38-5.1,11.16-65.08,66.86-76.78,71.16-30.3,11.12-46.71-10.5-65.6-29.51-121.74-122.53-233.33-255.94-354.82-378.85-19.75-23.44-27.06-51.52-19.58-81.59,129.81-244.02,279.62-477.79,409.87-721.61,10.13-42.97-18.18-78.97-21.38-121.43-8.57-113.49,74.57-215.78,189.47-222.25ZM648.64,378.01c0-29.67-24.05-53.72-53.72-53.72s-53.72,24.05-53.72,53.72,24.05,53.72,53.72,53.72,53.72-24.05,53.72-53.72Z"/>
      <path d="M792.61.53l423.43-.53c44.31,3.75,60.13,30.67,81.73,64.21,142.98,222.05,267.44,456.65,411.06,678.44,30.36,35.45,59.18,28.26,99.45,38.49,140.06,35.56,198.32,205.97,110.33,321.34-123.14,161.45-380.51,62.63-365.85-141.94,2.44-34.08,23.44-68.3,24.09-97.98.82-37.59-45.13-100.94-65.17-134.66-108.65-182.79-219.66-365.05-332.91-544.68-14.87-12.84-32.96-22.63-52.8-23.17-83.17-2.27-204.49,2.48-315.91.05-19.77-.43-44.14-11.88-48.43-33.54-2.52-12.76-1.9-85.81,1.44-97.59,3.85-13.57,16.77-23.78,29.55-28.42ZM1809.89,978.56c0-29.61-24.01-53.62-53.62-53.62s-53.62,24-53.62,53.62,24.01,53.62,53.62,53.62,53.62-24,53.62-53.62Z"/>
    </svg>
  )
}

export function AutoSpeakIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
      <polygon points="10 5 6 9 3 9 3 15 6 15 10 19 10 5" />
      <polyline points="18 6 15 11.5 19 11.5 16 18" />
    </svg>
  )
}

export function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

// Two arrows passing each other: the control that turns reordering on, on the
// category tabs and on the emergency bar alike.
export function ReorderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="7 8 4 5 1 8" /><line x1="4" y1="5" x2="4" y2="19" />
      <polyline points="17 16 20 19 23 16" /><line x1="20" y1="19" x2="20" y2="5" />
    </svg>
  )
}

/**
 * A screenful in one direction. Here rather than beside either bar because both
 * the phrase grid's rail and the category bar draw it, the same reason
 * `ReorderIcon` is here.
 *
 * A **double** chevron, and that is the whole of the design. Three sizes of jump
 * sit next to each other on both bars and a gaze user has to tell them apart
 * without reading: one chevron nudges, two chevrons move a screen, and a chevron
 * against a bar goes to the end. Anything else drawn for "page" — a rectangle, a
 * document, an arrow with a line under it — reads as a new thing rather than as
 * more of the same thing.
 */
export function PageIcon({ direction }: { direction: 'up' | 'down' | 'left' | 'right' }) {
  // Two chevrons, one behind the other along the axis of travel. Written as a
  // rotation of the "up" pair so the four never drift apart by hand.
  const turn = { up: 0, right: 90, down: 180, left: 270 }[direction]
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform={`rotate(${turn} 12 12)`}>
        <polyline points="18 12 12 6 6 12" />
        <polyline points="18 19 12 13 6 19" />
      </g>
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="20" height="20" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

// ── DwellCursor ───────────────────────────────────────────────────────────────
// Isolated component — updates DOM directly, never re-renders the tree.
