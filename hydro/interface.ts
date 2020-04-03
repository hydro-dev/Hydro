export class User {
    _id: number
    email: string
    emailLower: string
    uname: string
    unameLower: string
    salt: string
    hash: string
    displayName: string = ''
    nAccept: number = 0
    nSubmit: number = 0
    perm: string = '0'
    constructor(user) { }
    hasPerm(perm) { }
    checkPassword(password) { }
}
export interface TestCase {
    time: number,
    memory: number,
    status: number,
    message: string
}
export interface Record {
    _id: import('bson').ObjectID,
    pid: string | boolean,
    creator: number,
    lang: string,
    code: string,
    score: number,
    memory: number,
    time: number,
    judgeTexts: string[],
    compilerTexts: string[],
    testCases: TestCase[],
    judger: string,
    judgeAt: Date,
    status: number
}
export interface Problem {
    _id: number | string,
    title: string,
    content: string,
    timeLimit: number,
    memoryLimit: number,
    nSubmit: number,
    nAccept: number,
    tags: string[],
    categories: string[]
}