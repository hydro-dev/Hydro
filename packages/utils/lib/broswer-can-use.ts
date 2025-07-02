export function getContestProblemAlphabeticId(index: number) {
  // A...Z, AA...AZ, BA...BZ, ...
  if (index < 0) return '?';
  let letters = '';
  index ++;
  while (index > 0) {
    index--;
    letters = String.fromCharCode(65 + (index % 26)) + letters;
    index = Math.floor(index / 26);
  }
  return letters;
}