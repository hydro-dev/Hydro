export default function (ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
