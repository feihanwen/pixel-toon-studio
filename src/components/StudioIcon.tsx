import type { CSSProperties } from 'react';

/** Small, consistent line icons that inherit the current theme. */
export function StudioIcon({ name, size = 20, style }: { name: 'photo' | 'plus' | 'sparkles' | 'lock' | 'sliders' | 'arrow'; size?: number; style?: CSSProperties }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
        {name === 'photo' && <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 16 5-5 5 5 3-3 5 5"/></>}
        {name === 'plus' && <path d="M12 5v14M5 12h14"/>}
        {name === 'sparkles' && <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z"/><path d="M20 3v4m-2-2h4"/></>}
        {name === 'lock' && <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>}
        {name === 'sliders' && <><path d="M4 7h5m4 0h7M4 17h9m4 0h3"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>}
        {name === 'arrow' && <path d="M5 12h14m-6-6 6 6-6 6"/>}
    </svg>;
}
