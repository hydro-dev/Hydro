module.exports = function* ranked(diter, equ = (a, b) => a == b) {
    let last_doc = null;
    let r = 0, count = 0;
    for (let doc of diter) {
        count++;
        if (count == 1 || !equ(last_doc, doc))
            r = count;
        last_doc = doc;
        yield [r, doc];
    }
};
