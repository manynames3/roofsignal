import { useEffect, useLayoutEffect, useRef, useState } from "react";

const useBeforePaint = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type MotionState = "idle" | "armed" | "in";

interface InViewOptions {
  /** Reveal once and stop observing. Pass false to track enter and exit. */
  once?: boolean;
  threshold?: number;
  rootMargin?: string;
}

/**
 * Observes an element. In `once` mode it returns a `motion` state for
 * `data-motion`: "idle" (render the final state), "armed" (below the fold,
 * pre-state allowed) and "in" (play the entrance). Elements already on screen,
 * reduced-motion users and browsers without IntersectionObserver stay "idle",
 * so content is never hidden by a missing observer.
 */
export function useInView<T extends Element = HTMLElement>({ once = true, threshold = 0, rootMargin = "0px 0px -12% 0px" }: InViewOptions = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [armed, setArmed] = useState(false);

  useBeforePaint(() => {
    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    if (once && !prefersReducedMotion()) {
      const rect = element.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.88) setArmed(true);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [once, threshold, rootMargin]);

  const motion: MotionState = armed ? (inView ? "in" : "armed") : "idle";
  return { ref, inView, motion };
}

