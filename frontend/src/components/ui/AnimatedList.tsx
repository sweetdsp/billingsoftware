import { Children, isValidElement, type ReactNode } from 'react';
import type { Variants } from 'framer-motion';
import { MotionBox } from './motion';

export interface AnimatedListProps {
  children: ReactNode;
  /** Chakra spacing between items. Defaults to 3. */
  spacing?: number;
  /** Delay between each child's entrance, in seconds. */
  stagger?: number;
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

/** Staggered entrance for any list of children. Give children stable `key`s. */
export function AnimatedList({ children, spacing = 3, stagger = 0.06 }: AnimatedListProps) {
  const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: stagger } },
  };

  return (
    <MotionBox
      display="flex"
      flexDirection="column"
      gap={spacing}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {Children.toArray(children).map((child, index) => (
        <MotionBox
          key={isValidElement(child) && child.key !== null ? child.key : index}
          variants={itemVariants}
        >
          {child}
        </MotionBox>
      ))}
    </MotionBox>
  );
}

export default AnimatedList;
