import { forwardRef, useState } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
export type PressableProps = HTMLMotionProps<'button'>;
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable({ children, className = '', onPointerDown, onPointerUp, onPointerCancel, onPointerLeave, onKeyDown, onKeyUp, onBlur, ...props }, ref) {
  const [pressed, setPressed] = useState(false);
  return <motion.button {...props} ref={ref} type={props.type ?? 'button'} className={`pressable ${className}`} data-pressed={pressed ? 'true' : undefined}
    onPointerDown={e => { if (!props.disabled && e.button === 0) setPressed(true); onPointerDown?.(e); }}
    onPointerUp={e => { setPressed(false); onPointerUp?.(e); }} onPointerCancel={e => { setPressed(false); onPointerCancel?.(e); }}
    onPointerLeave={e => { setPressed(false); onPointerLeave?.(e); }}
    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') setPressed(true); onKeyDown?.(e); }}
    onKeyUp={e => { setPressed(false); onKeyUp?.(e); }} onBlur={e => { setPressed(false); onBlur?.(e); }}
    animate={{ scale: pressed ? .97 : 1, opacity: pressed ? .78 : 1 }} transition={{ type: 'spring', duration: .25, bounce: .1 }}>
    {children}
  </motion.button>;
});
