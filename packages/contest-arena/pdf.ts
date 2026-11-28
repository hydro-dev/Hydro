/** Keep a safe ASCII fallback and send the actual filename using RFC 6266/5987. */
export function inlinePdfDisposition(filename: string) {
    const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return `inline; filename="statement.pdf"; filename*=UTF-8''${encoded}`;
}
