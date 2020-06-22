function decodeBase64WithUriEncoding(encodedText) {
    return Buffer.from(encodedText, 'base64').toString('utf8');
}

function unescapedString(escapedString) {
    escapedString += new Array(5 - escapedString.length % 4).join('=');
    return escapedString.replace(/\-/g, '+').replace(/_/g, '/');
}

function decodeJWT(idToken) {
    const token = idToken.split('.');
    if (token.length !== 3) {
        throw new Error('Invalid idToken');
    }
    try {
        const headerSegment = JSON.parse(decodeBase64WithUriEncoding(token[0]));
        const payloadSegment = JSON.parse(decodeBase64WithUriEncoding(token[1]));
        const signature = unescapedString(token[2]);
        return {
            dataToSign: [token[0], token[1]].join('.'),
            header: headerSegment,
            payload: payloadSegment,
            signature,
        };
    } catch (e) {
        throw new Error('Invalid payload');
    }
}

function decode(idToken) {
    const decodedJWT = decodeJWT(idToken);
    return decodedJWT.payload;
}

global.Hydro.lib.jwt = module.exports = { decode };
