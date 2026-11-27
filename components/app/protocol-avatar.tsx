'use client';

import React, { useState } from 'react';
import { parseProtocol } from '@/lib/protocols';
import { cn } from '@/lib/utils';

export interface ProtocolAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  protocol?: string | null;
  version?: string | null;
  size?: number;
  className?: string;
}

export const ProtocolAvatar: React.FC<ProtocolAvatarProps> = ({
  protocol,
  version,
  size = 14,
  className,
  ...props
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const info = parseProtocol(protocol, version);

  React.useEffect(() => {
    setImageFailed(false);
  }, [protocol, version]);

  // Use only local public/protocols/*.png (fallback to /images/unknown.png on error)
  const currentSrc = info.iconUrl;

  if (!imageFailed && currentSrc) {
    return (
      <span
        className={cn('inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full', className)}
        style={{ width: size, height: size }}
        {...props}
      >
        <img
          src={currentSrc}
          alt={info.name}
          width={size}
          height={size}
          onError={() => setImageFailed(true)}
          className="size-full object-contain rounded-full"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden select-none',
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      <img
        src="/images/unknown.png"
        alt={info.name || 'Unknown Protocol'}
        width={size}
        height={size}
        className="size-full object-contain rounded-full select-none shrink-0 pointer-events-none"
        aria-hidden="true"
      />
    </span>
  );
};

