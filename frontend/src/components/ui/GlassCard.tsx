import type { ReactNode } from 'react';
import { MotionBox } from './motion';

export interface GlassCardProps {
  children: ReactNode;
  /** Chakra spacing token or CSS value. Defaults to 6. */
  padding?: number | string;
  /** Lift on hover. Defaults to true. */
  hoverLift?: boolean;
  /** Width (Chakra value). */
  width?: string;
  /** Optional accessible label when the card acts as a region. */
  ariaLabel?: string;
}

/** Frosted glass surface used for all card containers. */
export function GlassCard({
  children,
  padding = 6,
  hoverLift = true,
  width = 'full',
  ariaLabel,
}: GlassCardProps) {
  return (
    <MotionBox
      role={ariaLabel ? 'region' : undefined}
      aria-label={ariaLabel}
      w={width}
      p={padding}
      bg="surface-glass"
      backdropFilter="blur(16px) saturate(160%)"
      borderWidth="1px"
      borderColor="border-subtle"
      borderRadius="card"
      boxShadow="card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.3 } }}
      whileHover={hoverLift ? { y: -4, transition: { duration: 0.2 } } : undefined}
      _hover={hoverLift ? { boxShadow: 'card-hover' } : undefined}
    >
      {children}
    </MotionBox>
  );
}

export default GlassCard;
