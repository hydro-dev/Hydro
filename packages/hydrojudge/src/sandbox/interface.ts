export interface SandboxVersion {
    buildVersion: string;
    goVersion: string;
    platform: string;
    os: string;
    copyOutOptional?: boolean;
    pipeProxy?: boolean;
    addressSpaceLimit?: boolean;
    stream?: boolean;
}

export interface LocalFile {
    src: string;
}

export interface MemoryFile {
    content: string | Buffer;
}

export interface PreparedFile {
    fileId: string;
}

export interface Collector {
    name: string;
    max: number;
    pipe?: boolean;
}

// Symlink creates symlink for copyIn location: v1.6.0+
export interface Symlink {
    symlink: string;
}

// StreamIn enables the stream input on /stream interface: v1.8.1+
export interface StreamIn {
    streamIn: boolean;
}

// StreamOut enables the stream out on /stream interface: v1.8.1+
export interface StreamOut {
    streamOut: boolean;
}

export type CopyInFile = LocalFile | MemoryFile | PreparedFile;
export type CopyIn = Record<string, CopyInFile>;
// CmdFile defines file descriptor for the command. null is reserved for group execution and it must be provided via pipeMapping
export type CmdFile = LocalFile | MemoryFile | PreparedFile | Collector | StreamIn | StreamOut | null;

/**
 * Cmd defines a single command to be executed by sandbox server
 */
export interface Cmd {
    args: string[];
    env?: string[];
    /** files defines open file descriptor for the command */
    files?: CmdFile[];
    tty?: boolean;

    /** cpuLimit and clockLimit defines time limitations in ns */
    cpuLimit?: number;
    clockLimit?: number;
    /** memoryLimit and stackLimit defines memory limitation in bytes */
    memoryLimit?: number;
    stackLimit?: number;
    procLimit?: number;
    /** cpuRateLimit defines cpu share limits in 1/1000 cpus if enabled in sandbox server */
    cpuRateLimit?: number;
    /** cpuSetLimit defines cpu set limit if enabled in sandbox server */
    cpuSetLimit?: string;
    /** @deprecated use dataSegmentLimit instead, keep compatibility for old versions */
    strictMemoryLimit?: boolean;
    /** dataSegmentLimit set rlimit_data limit for memoryLimit */
    dataSegmentLimit?: boolean;
    /** addressSpaceLimit set rlimit_address_space limit for memoryLimit */
    addressSpaceLimit?: boolean;

    /** files to be copied into sandbox before execution */
    copyIn?: Record<string, CopyInFile | Symlink>;

    /**
     * files to be copied out from sandbox after execution.
     * append '?' to make the file optional and do not cause FileError when missing
     */
    copyOut?: string[];
    /** similar to copyOut but fileId returned instead */
    copyOutCached?: string[];
    /** copyOut limit in byte */
    copyOutMax?: number;
}

/**
 * SandboxRequest defines a single request to sandbox server
 */
export interface SandboxRequest {
    requestId?: string;
    cmd: Cmd[];
    pipeMapping?: PipeMap[];
}

export enum SandboxStatus {
    Accepted = 'Accepted',
    MemoryLimitExceeded = 'Memory Limit Exceeded',
    TimeLimitExceeded = 'Time Limit Exceeded',
    OutputLimitExceeded = 'Output Limit Exceeded',
    FileError = 'File Error',
    NonzeroExitStatus = 'Nonzero Exit Status',
    Signalled = 'Signalled',
    InternalError = 'Internal Error',
}

export interface PipeIndex {
    index: number;
    fd: number;
}

export interface PipeMap {
    in: PipeIndex;
    out: PipeIndex;
    /** enable pipe proxy */
    proxy?: boolean;
    /** if proxy enabled, save transmitted content */
    name?: string;
    max?: number;
}

export enum FileErrorType {
    CopyInOpenFile = 'CopyInOpenFile',
    CopyInCreateFile = 'CopyInCreateFile',
    CopyInCopyContent = 'CopyInCopyContent',
    CopyOutOpen = 'CopyOutOpen',
    CopyOutNotRegularFile = 'CopyOutNotRegularFile',
    CopyOutSizeExceeded = 'CopyOutSizeExceeded',
    CopyOutCreateFile = 'CopyOutCreateFile',
    CopyOutCopyContent = 'CopyOutCopyContent',
    CollectSizeExceeded = 'CollectSizeExceeded',
}

export interface FileError {
    name: string;
    type: FileErrorType;
    message?: string;
}

/**
 * SandboxResult defines result from sandbox server
 */
export interface SandboxResult {
    status: SandboxStatus;
    /** contains error message if status is not Accept */
    error?: string;
    /** signal number if status is Signalled, otherwise exit status */
    exitStatus: number;
    /** cpu time in ns */
    time: number;
    /** peak memory in byte */
    memory: number;
    /** wall clock time in ns */
    runTime: number;
    /** copyOut file name to content (UTF-8 encoded and invalid character replaced) */
    files?: Record<string, string>;
    /** copyOutCached file name to fileId */
    fileIds?: Record<string, string>;
    /** contains detailed error if status is FileError */
    fileError?: FileError[];
}

export interface Resize {
    index?: number;
    fd?: number;
    rows: number;
    cols: number;
    x?: number;
    y?: number;
}

export interface Input {
    index?: number;
    fd?: number;
    content: Buffer;
}

export interface Output {
    index: number;
    fd: number;
    content: Buffer;
}
