declare module 'superagent' {
    interface Request {
        proxy: (url: string) => this;
    }
}
export default {};
