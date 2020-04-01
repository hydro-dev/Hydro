export class User {
    _id: number
    email: string
    emailLower: string
    uname: string
    unameLower: string
    salt: string
    hash: string
    priv: number
    domainId: string = 'system'
    displayName: string = ''
    nAccept: number = 0
    nSubmit: number = 0
    perm: string = '0'
    constructor(user, domainUser) { }
    hasPriv(priv) { }
    hasPerm(perm) { }
    checkPassword(password) { }
    async joinDomain(role, joinAt) { }
}
export interface TestCase {
    time: number,
    memory: number,
    status: number,
    message: string
}
export interface Record {
    _id: import('bson').ObjectID,
    domainId: string,
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
    domainId: string,
    title: string,
    content: string,
    timeLimit: number,
    memoryLimit: number,
    nSubmit: number,
    nAccept: number,
    tags: string[],
    categories: string[]
}