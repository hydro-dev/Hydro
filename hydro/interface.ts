import { ObjectID } from 'mongodb';

export interface Udoc {
    _id: number
    mail: string
    mailLower: string
    uname: string
    unameLower: string
    salt: string
    hash: string
    hashType: string
    nAccept: number
    nSubmit: number
    nLike: number
    perm: string
    viewLang: string
    codeLang: string
    codeTemplate: string
    gravatar: string
    hasPerm: Function
    checkPassword: Function
}
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