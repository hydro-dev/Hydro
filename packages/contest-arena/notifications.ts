import { createHash } from 'node:crypto';

export function clarificationNotices(clarifications: any[], link: (id: string) => string) {
    return clarifications.flatMap((item) => {
        const did = String(item.docId);
        const notice = (entry: any, key: string) => ({
            id: createHash('sha256').update(`${did}:${key}:${entry.content}`).digest('hex').slice(0, 24),
            did,
            title: item.subject ? 'Clarification from jury' : 'Announcement from jury',
            body: String(entry.content || '').replace(/\s+/g, ' ').slice(0, 300),
            url: link(did),
        });
        return [
            ...(item.owner === 0 ? [notice(item, 'broadcast')] : []),
            ...(item.reply || []).filter((reply) => reply.owner === 0)
                .map((reply) => notice(reply, String(reply._id))),
        ];
    });
}

export function readNotices(previous: string[] = [], ids: string[]) {
    return [...new Set([...previous, ...ids])].slice(-1000);
}
