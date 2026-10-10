import { Spinner } from '@chakra-ui/react';
import type { MouseEventHandler, ReactNode } from 'react';
import { MotionButton } from './motion';

export interface GradientButtonProps {
  children: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  onClick?: MouseEventHandler<HTMLButtonElement>;
  isDisabled?: boolean;
  isLoading?: boolean;
  /** Text shown next to the spinner while loading. */
  loadingText?: string;
  /** Stretch to the container width. */
  isFullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

const SIZE_STYLES = {
  sm: { px: 4, h: 8, fontSize: 'sm' },
  md: { px: 6, h: 10, fontSize: 'md' },
  lg: { px: 8, h: 12, fontSize: 'lg' },
} as const;

/** Primary call-to-action button with brand gradient and hover/tap motion. */
export function GradientButton({
  children,
  type = 'button',
  onClick,
  isDisabled = false,
  isLoading = false,
  loadingText,
  isFullWidth = false,
  size = 'md',
  ariaLabel,
}: GradientButtonProps) {
  const disabled = isDisabled || isLoading;
  const sizeStyles = SIZE_STYLES[size];

  return (
    <MotionButton
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-busy={isLoading || undefined}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      gap={2}
      w={isFullWidth ? 'full' : 'auto'}
      px={sizeStyles.px}
      h={sizeStyles.h}
      fontSize={sizeStyles.fontSize}
      fontWeight="semibold"
      color="white"
      borderRadius="full"
      bgGradient="linear(to-r, brand.500, accent.500)"
      boxShadow="md"
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? 0.6 : 1}
      _hover={disabled ? undefined : { boxShadow: 'lg' }}
      _focusVisible={{ outline: '2px solid', outlineColor: 'brand.300', outlineOffset: '2px' }}
      whileHover={disabled ? undefined : { scale: 1.02, y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
    >
      {isLoading && <Spinner size="sm" />}
      {isLoading && loadingText ? loadingText : children}
    </MotionButton>
  );
}

export default GradientButton;
