type Verdict = 'RJ' | 'AC' | 'NA';
export interface ProblemInfo {
    color?: string; // hex color
    id: string;
    name: string; // A, B, C, ...
}
export interface TeamInfo {
    id: string;
    name: string;
    avatar?: string;
    institution?: string;
    exclude?: boolean; // false by default
}
export interface InstitiutionInfo {
    id: string;
    name: string;
    avatar?: string;
}
export interface SubmissionInfo {
    team: string;
    problem: string;
    verdict: Verdict;
    time: number; // in seconds
}
export interface ResolverInput {
    name: string;
    duration: number; // in seconds
    frozen: number; // in seconds
    problems: ProblemInfo[];
    submissions: SubmissionInfo[];
    teams: TeamInfo[];
    institutions: Record<string, InstitiutionInfo>;
}
