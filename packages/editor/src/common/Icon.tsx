import type { SVGProps } from 'react';

const PATHS = {
  box: 'M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7ZM3.3 8.6 12 13l8.7-4.4M12 13v8',
  sphere:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.2 9.5h17.6M3.2 14.5h17.6M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18',
  cylinder: 'M12 8c4.4 0 8-1.34 8-3s-3.6-3-8-3-8 1.34-8 3 3.6 3 8 3ZM4 5v14c0 1.66 3.6 3 8 3s8-1.34 8-3V5',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  model: 'M12 2.6 4 7v10l8 4.4 8-4.4V7l-8-4.4ZM4 7l8 4.4L20 7M12 11.4v10',
  import: 'M12 15V3M8 7l4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  export: 'M12 3v12M8 11l4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-4',
  redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h4',
  camera:
    'M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a2 2 0 0 0 1.7-1l.4-.7a2 2 0 0 1 1.7-1h3a2 2 0 0 1 1.7 1l.4.7a2 2 0 0 0 1.7 1h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8ZM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  command:
    'M9 3a3 3 0 1 0 0 6h6a3 3 0 1 0 0-6M6 9a3 3 0 1 0 0 6h12a3 3 0 1 0 0-6M9 15a3 3 0 1 0 0 6h6a3 3 0 1 0 0-6',
  layers: 'm12 3 9 5-9 5-9-5 9-5ZM3 12.5 12 18l9-5.5M3 17l9 5 9-5',
  assets:
    'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13ZM4 15l4.5-4.5L14 16M14.5 13l2.5-2.5L20 13.5',
  sliders: 'M4 7h10M18 7h2M4 12h3M11 12h9M4 17h10M18 17h2M14 4v6M7 9v6M14 14v6',
  grid: 'M3 9h18M3 15h18M9 3v18M15 3v18',
  fit: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4.2-4.2',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff:
    'M3 3l18 18M10.6 6.1A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.2 2.9M6.2 6.6A17 17 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.4 0 2.7-.3 3.8-.8',
  trash:
    'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  check: 'm5 13 4 4L19 7',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  scale: 'M4 20 20 4M14 4h6v6M10 20H4v-6',
  chevron: 'm6 9 6 6 6-6',
  panel:
    'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13ZM9.5 3v18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  history: 'M3.5 12a8.5 8.5 0 1 1 2.5 6M3.5 12V7m0 5H8M12 7v5l3.5 2',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 16,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
