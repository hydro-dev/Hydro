const __memedContestProblemAlphabeticIdList = (() => {
    const list = [];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 26; i++) {
        list.push(alphabet[i]);
    }
    for (let i = 0; i < 26; i++) {
        for (let j = 0; j < 26; j++) {
            list.push(alphabet[i] + alphabet[j]);
        }
    }
    return list;
})();

export function getContestProblemAlphabeticId(index: number) {
    // A...Z, AA...AZ, BA...BZ, ...
    if (index < 0) return '?';

    if (index < __memedContestProblemAlphabeticIdList.length) {
        return __memedContestProblemAlphabeticIdList[index];
    }

    let letters = '';
    index++;
    while (index > 0) {
        index--;
        letters = String.fromCharCode(65 + (index % 26)) + letters;
        index = Math.floor(index / 26);
    }
    return letters;
}
