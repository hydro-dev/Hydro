export function isAbove(width) {
  if (window.matchMedia) {
    return window.matchMedia(`(min-width: ${width}px)`).matches;
  }
  return window.innerWidth >= width;
}

export function isBelow(width) {
  if (window.matchMedia) {
    return window.matchMedia(`(max-width: ${width}px)`).matches;
  }
  return window.innerWidth <= width;
}
