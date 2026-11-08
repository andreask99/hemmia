/**
 * The Hemmia ghost in poses for the website (MARKETING.md §3): the logo's drawing plus one
 * prop each. Same colours as the app icon in both themes (the ghost is always cream).
 */
export const POSES = [
  'wave',
  'book',
  'pot',
  'glass',
  'key',
  'house',
  'sleep',
  'sun',
  'brush',
] as const;
export type Pose = (typeof POSES)[number];
export const isPose = (s: string): s is Pose => (POSES as readonly string[]).includes(s);

const GREEN = '#1f4d3f';
const INK = '#17231f';
const CREAM = '#fffdf8';
const BLUSH = '#e9b7a3';
const GOLD = '#d9a441';

function Face({ sleeping }: { sleeping: boolean }) {
  return sleeping ? (
    <>
      <path
        d="M27.4 34q2.6 1.8 5.2 0M39.4 34q2.6 1.8 5.2 0"
        fill="none"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M33.6 40.4q2.4 1.2 4.8 0"
        fill="none"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ) : (
    <>
      <circle cx="30" cy="34" r="2.4" fill={INK} />
      <circle cx="42" cy="34" r="2.4" fill={INK} />
      <path
        d="M32.6 40q3.4 2.8 6.8 0"
        fill="none"
        stroke={INK}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </>
  );
}

function Prop({ pose }: { pose: Pose }) {
  switch (pose) {
    case 'wave':
      return (
        <path
          d="M53 33q6-5 7-11M56 35q5-2 8-6"
          fill="none"
          stroke={GREEN}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      );
    case 'book':
      return (
        <g>
          <path
            d="M28 47l8 2 8-2v-9l-8 2-8-2z"
            fill={CREAM}
            stroke={GREEN}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M36 40v9" stroke={GREEN} strokeWidth="1.3" />
        </g>
      );
    case 'pot':
      return (
        <g>
          <path d="M27 44h18v4a4 4 0 0 1-4 4H31a4 4 0 0 1-4-4z" fill={GREEN} />
          <path d="M24 45h3M45 45h3" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="M32 41q-1-2 0-4M36 41q-1-2 0-4M40 41q-1-2 0-4"
            fill="none"
            stroke={GREEN}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>
      );
    case 'glass':
      return (
        <g>
          <circle
            cx="51"
            cy="45"
            r="5"
            fill="rgba(255,253,248,0.6)"
            stroke={GREEN}
            strokeWidth="1.8"
          />
          <path d="M54.6 48.6l4.4 4.4" stroke={GREEN} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      );
    case 'key':
      return (
        <g>
          <circle cx="50" cy="44" r="3.6" fill="none" stroke={GOLD} strokeWidth="2" />
          <path
            d="M53.4 45.4l7 3M58 47.4l-1 2.4M60.4 48.4l-1 2.2"
            stroke={GOLD}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      );
    case 'house':
      return (
        <g>
          <path
            d="M45 45l6-5 6 5v8H45z"
            fill={CREAM}
            stroke={GREEN}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M49.5 53v-4h3v4" fill="none" stroke={GREEN} strokeWidth="1.3" />
        </g>
      );
    case 'sleep':
      return (
        <text x="50" y="25" fontSize="7" fontWeight="700" fill={GREEN} fontFamily="sans-serif">
          z z
        </text>
      );
    case 'sun':
      return (
        <g>
          <circle cx="54" cy="22" r="4" fill={GOLD} />
          <path
            d="M54 14.5v2.2M54 27.3v2.2M46.5 22h2.2M59.3 22h2.2M48.7 16.7l1.5 1.5M57.8 25.8l1.5 1.5M48.7 27.3l1.5-1.5M57.8 18.2l1.5-1.5"
            stroke={GOLD}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>
      );
    case 'brush':
      return (
        <g>
          <path d="M50 50l9-11" stroke="#8a6a3c" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M47.5 53q0-3.5 2.5-3l1.3 1.1q.2 3-3.8 1.9z" fill="#c45a4a" />
        </g>
      );
  }
}

/** A ghost with a prop; decorative (the text next to it says what it means). */
export function GhostPose({ pose, size = 96 }: { pose: Pose; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="14 12 50 46" aria-hidden="true" className="ghost-pose">
      <path
        d="M20 55V34a16 16 0 0 1 32 0v21l-5.33-4-5.34 4-5.33-4-5.33 4-5.34-4z"
        fill={CREAM}
        stroke={GREEN}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <Face sleeping={pose === 'sleep'} />
      <circle cx="26" cy="39" r="2" fill={BLUSH} />
      <circle cx="46" cy="39" r="2" fill={BLUSH} />
      <Prop pose={pose} />
    </svg>
  );
}
