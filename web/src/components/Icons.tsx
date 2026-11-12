import type { ComponentChildren } from 'preact';

// Small inline SVG icons (stroke = currentColor), so no icon font or extra requests

interface IconProps {
  class?: string;
}

const Svg = ({ children, class: cls }: IconProps & { children: ComponentChildren }) => (
  <svg class={`icon ${cls ?? ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconToday = (p: IconProps) => (
  <Svg {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Svg>
);

export const IconWeek = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M8 13h2M14 13h2M8 17h2M14 17h2" /></Svg>
);

export const IconEdit = (p: IconProps) => (
  <Svg {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></Svg>
);

export const IconMore = (p: IconProps) => (
  <Svg {...p}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></Svg>
);

/** Points right: in RTL this means "back/previous". */
export const IconChevronRight = (p: IconProps) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;

export const IconChevronLeft = (p: IconProps) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;

export const IconClose = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;

export const IconShare = (p: IconProps) => (
  <Svg {...p}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></Svg>
);
