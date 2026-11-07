/** The few building blocks every screen uses ("Forest & Champagne"). */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-forest text-on-forest hover:bg-forest-hover',
  secondary: 'border border-line bg-card text-ink hover:bg-champagne',
  ghost: 'text-ink hover:bg-champagne',
  danger: 'border border-line bg-card text-danger hover:bg-danger-soft',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

/** Square 44px button holding an icon; give it an aria-label. */
export function IconButton({
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string }) {
  return (
    <button
      type={type}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-champagne disabled:opacity-40 ${className}`}
      {...rest}
    />
  );
}

export function Field({
  label,
  hint,
  id,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        className={`min-h-12 rounded-xl border border-line bg-paper px-3.5 text-base text-ink placeholder:text-muted/70 focus:border-forest focus:outline-none ${className}`}
        {...rest}
      />
      {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(23,35,31,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Alert({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'ok';
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl px-3.5 py-2.5 text-sm ${tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-champagne text-ok'}`}
    >
      {children}
    </p>
  );
}

/** The Hemmia ghost (the same drawing as the app icon), `size` px square. */
export function Ghost({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="16 16 40 40" aria-hidden="true" className="shrink-0">
      <path
        d="M20 55V34a16 16 0 0 1 32 0v21l-5.33-4-5.34 4-5.33-4-5.33 4-5.34-4z"
        fill="#fffdf8"
        stroke="#1f4d3f"
        strokeWidth={size < 40 ? 2.2 : 1.8}
        strokeLinejoin="round"
      />
      <circle cx="30" cy="34" r="2.4" fill="#17231f" />
      <circle cx="42" cy="34" r="2.4" fill="#17231f" />
      <path
        d="M32.6 40q3.4 2.8 6.8 0"
        fill="none"
        stroke="#17231f"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="26" cy="39" r="2" fill="#e9b7a3" />
      <circle cx="46" cy="39" r="2" fill="#e9b7a3" />
    </svg>
  );
}

/** The Hemmia mark next to the name or on its own (32, 40 or 56 px). */
export function Logo({ size = 40 }: { size?: 32 | 40 | 56 }) {
  return <Ghost size={size} />;
}

/** Centered page for sign-in, invite and recovery screens. */
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-paper px-5 py-10">
      <div className="flex w-full max-w-sm flex-col gap-7">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo size={56} />
          <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
          {intro && <p className="text-[15px] leading-relaxed text-muted">{intro}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Bar widths in 5% steps (inline styles are not allowed). */
const WIDTHS = [
  'w-[0%]',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-[100%]',
] as const;

/** The width class for a percentage (0–100, rounded to 5%). */
export function widthClass(pct: number): string {
  return WIDTHS[Math.round(Math.min(100, Math.max(0, pct)) / 5)] ?? 'w-[0%]';
}
