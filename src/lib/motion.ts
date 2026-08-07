import type { Transition, Variants } from "motion/react";

/**
 * Shared motion vocabulary. Every animated surface pulls from here so the
 * whole product moves with one personality: quick, damped, never bouncy.
 */

export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 };
export const springSnappy: Transition = { type: "spring", stiffness: 420, damping: 34 };
export const easeOut: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
};

export const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: easeOut },
};

export const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12 } },
};
