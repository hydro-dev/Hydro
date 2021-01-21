export interface SFile {
    src?: string,
    content?: string,
    fileId?: string,
}
export interface Execute {
    execute: string,
    clean: Function,
    copyIn: Record<string, SFile>,
    time?: number,
}
export interface CompileErrorInfo {
    stdout?: string,
    stderr?: string,
    status?: string
}
