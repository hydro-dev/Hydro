export const ONSITE_RULE = 'icpc_domjudge';
export const MODE_LEAD_MS = 20 * 60 * 1000;

export function modeWindow(tdoc: { rule: string, beginAt: Date | number, endAt: Date | number }, now = Date.now()) {
    const startsAt = +tdoc.beginAt - MODE_LEAD_MS;
    const endsAt = +tdoc.endAt;
    return {
        startsAt,
        active:
            tdoc.rule === ONSITE_RULE
            && Number.isFinite(startsAt)
            && Number.isFinite(endsAt)
            && endsAt > +tdoc.beginAt
            && now >= startsAt
            && now < endsAt,
    };
}

export function identityKey(className: string, name: string) {
    return JSON.stringify([className.trim(), name.trim()]);
}

export function canReuseTeamRoster(
    previous: { members?: number[], journal?: unknown[] } | null | undefined,
    members: number[],
) {
    if (!previous?.journal?.length) return true;
    if (!previous.members?.length) return false;
    const old = new Set(previous.members);
    const current = new Set(members);
    return old.size === current.size && [...old].every((uid) => current.has(uid));
}
