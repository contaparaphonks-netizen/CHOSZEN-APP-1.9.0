import { useState } from 'react';
import { Shield } from 'lucide-react';

interface TeamBadgeProps {
  src: string | null;
  name: string;
  abbr?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TeamBadge({ src, name, abbr, size = 'md' }: TeamBadgeProps) {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'sm' ? 'w-6 h-6 text-[10px]' : size === 'lg' ? 'w-12 h-12 text-xs' : 'w-8 h-8 text-[11px]';

  if (!src || failed) {
    return (
      <div
        className={`${dims} rounded-lg bg-[#161C28] border border-white/[0.08] flex items-center justify-center text-slate-300 font-semibold shrink-0 select-none`}
        aria-label={name}
        title={name}
      >
        {abbr ? abbr.slice(0, 3) : <Shield className="w-3.5 h-3.5 text-slate-400" />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dims} object-contain shrink-0 select-none`}
    />
  );
}
