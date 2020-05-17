const { ObjectID } = require('bson');

exports.udoc = {
    _id: 0,
    mail: '',
    mailLower: '',
    uname: '',
    unameLower: '',
    salt: '',
    hash: '',
    hashType: 'hydro',
    nAccept: 0,
    nSubmit: 0,
    nLike: 0,
    bio: '',
    gender: 0,
    regat: new Date(),
    regip: '0.0.0.0',
    gravatar: '',
    viewLang: 'zh_CN',
    loginat: new Date(),
    loginip: '0.0.0.0',
};

exports.pdoc = {
    _id: new ObjectID(),
    pid: 'P1000',
    owner: 0,
    title: 'No Title',
    content: 'No Content',
    nSubmit: 0,
    nAccept: 0,
    tag: [],
    category: [],
    data: null,
    hidden: false,
};

/*
export interface TestCase {
    time: number,
    memory: number,
    status: number,
    message: string
}
export interface Rdoc {
    _id: ObjectID,
    pid: ObjectID,
    uid: number,
    lang: string,
    code: string,
    score: number,
    memory: number,
    time: number,
    judgeTexts: string[],
    compilerTexts: string[],
    testCases: TestCase[],
    rejudged: boolean,
    judger: string,
    judgeAt: Date,
    status: number
}
export interface Bdoc {
    _id: string,
    expireAt: Date
}
export interface Tdoc {
    _id: ObjectID
    beginAt: Date
    endAt: Date
    attend: number
    title: string
    content: string
    pids: ObjectID[]
}
*/
