import { type SVGProps } from 'react';

/** Timeline mark: three track bars crossed by a playhead. */
export function TimelineLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#1f2a44" />
      <rect x="4" y="6" width="9" height="3" rx="1" fill="#7373e6" />
      <rect x="8" y="10.5" width="11" height="3" rx="1" fill="#5b8cff" />
      <rect x="5" y="15" width="8" height="3" rx="1" fill="#3fbf86" />
      <rect x="14.25" y="4" width="1.5" height="16" rx="0.75" fill="#ffffff" />
    </svg>
  );
}
