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
    loginat: new Date(),
    loginip: '0.0.0.0'
};
/*
export interface Pdoc {
    _id: ObjectID
    pid: string
    owner: number
    title: string
    content: string
    nSubmit: number
    nAccept: number
    tag: string[]
    category: string[],
    data: ObjectID | null
    hidden: boolean
}
export interface TestCase {
    time: number,
    memory: number,
    status: number,
    message: string
}
export interface Rdoc {
    _id: ObjectID,
    pid: ObjectID,
    owner: number,
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