/**
 * Autoplay rules for the Labs hero, kept pure so they can be tested.
 * A person's explicit choice (pause, or navigating by hand) is never undone
 * by the carousel; hover, focus, a hidden tab or scrolling away only hold it.
 */
export interface CarouselState {
  index: number;
  count: number;
  /** Set by the pause button, by manual navigation, or by reduced-motion preference. */
  userPaused: boolean;
  hovered: boolean;
  focused: boolean;
  hidden: boolean;
  offscreen: boolean;
}

export type CarouselAction =
  | { type: "next" | "prev"; manual: boolean }
  | { type: "go"; index: number }
  | { type: "toggle" }
  | { type: "hover" | "focus" | "hidden" | "offscreen"; value: boolean };

export function initialCarousel(count: number, reducedMotion: boolean): CarouselState {
  return { index: 0, count, userPaused: reducedMotion, hovered: false, focused: false, hidden: false, offscreen: false };
}

export function carouselReducer(state: CarouselState, action: CarouselAction): CarouselState {
  const wrap = (i: number) => (i + state.count) % state.count;
  switch (action.type) {
    case "next":
    case "prev":
      return {
        ...state,
        index: wrap(state.index + (action.type === "next" ? 1 : -1)),
        userPaused: state.userPaused || action.manual,
      };
    case "go":
      return { ...state, index: wrap(action.index), userPaused: true };
    case "toggle":
      // Pressing play is an explicit request: it overrides the pointer or focus
      // that is necessarily resting on the play button at that moment.
      return state.userPaused
        ? { ...state, userPaused: false, hovered: false, focused: false }
        : { ...state, userPaused: true };
    case "hover":
      return { ...state, hovered: action.value };
    case "focus":
      return { ...state, focused: action.value };
    case "hidden":
      return { ...state, hidden: action.value };
    case "offscreen":
      return { ...state, offscreen: action.value };
  }
}

export const isAutoplaying = (s: CarouselState) =>
  s.count > 1 && !s.userPaused && !s.hovered && !s.focused && !s.hidden && !s.offscreen;

/** Horizontal swipes change slides; mostly-vertical drags are left to page scrolling. */
export function swipeDirection(dx: number, dy: number, threshold = 48): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}
