import astyleBinaryUrl from 'wastyle/dist/astyle-optimize-size.wasm';

export default async function load() {
    const { init, format } = await import('wastyle');
    try {
        await init(astyleBinaryUrl);
        console.log('WAstyle is ready!');
        return [true, format];
    } catch (e) {
        return [false, e.message];
    }
}
