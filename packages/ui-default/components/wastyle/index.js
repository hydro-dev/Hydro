import astyleBinaryUrl from 'wastyle/dist/astyle-optimize-size.wasm';

export default async function load() {
  const { init, format } = await import('wastyle');
  try {
    await init(astyleBinaryUrl);
    console.log('WAstyle is ready!');
    const formatter = (code, options) => {
      const [success, result] = format(code, options);
      return [success, (result || '').replace(/^#(include|import)[\t ]*(<|")/gm, (match, p1, p2) => `#${p1} ${p2}`)];
    };
    return [true, formatter];
  } catch (e) {
    return [false, e.message];
  }
}
