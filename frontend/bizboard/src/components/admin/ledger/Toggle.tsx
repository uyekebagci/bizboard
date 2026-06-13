"use client";

/**
 * Küçük accent switch — admin toggle'ları için tek-tip. Çift tema + a11y
 * (role=switch, aria-checked). Telegram sayfasındaki switch deseniyle aynı dil,
 * Daxa accent rengiyle.
 */

export function Toggle({
  checked,
  disabled = false,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        checked ? "bg-accent" : "bg-[rgb(var(--v2-muted))]/40"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default Toggle;
