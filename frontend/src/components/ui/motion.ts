import { chakra, shouldForwardProp } from '@chakra-ui/react';
import { isValidMotionProp, motion } from 'framer-motion';

/**
 * Chakra + Framer Motion bridges. They accept Chakra style props AND motion props
 * (initial, animate, exit, variants, whileHover, whileTap ...).
 *
 * Note: Chakra's `transition` style prop shadows Framer's `transition` prop in the types, so put
 * motion transitions inside the target objects / variants instead, e.g.
 * `animate={{ opacity: 1, transition: { duration: 0.3 } }}`.
 */
const forwardMotionProps = (prop: string): boolean =>
  isValidMotionProp(prop) || shouldForwardProp(prop);

export const MotionBox = chakra(motion.div, { shouldForwardProp: forwardMotionProps });

export const MotionButton = chakra(motion.button, { shouldForwardProp: forwardMotionProps });
