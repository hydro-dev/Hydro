import type { ObjectId } from 'mongodb';
import { STATUS } from '@hydrooj/common';
import { describeExternalOjBindings, getExternalOjBindings } from '../model/externalOj';
import RecordModel from '../model/record';
import { externalOjActivityUrl, externalOjProfileUrl } from './externalOjs';
import { buildDailyActivity, FirstPass } from './externalOjStats';

async function localPasses(domainId: string, uid: number, visiblePids: number[]): Promise<FirstPass[]> {
    if (!visiblePids.length) return [];
    const first = await RecordModel.coll.aggregate<{ _id: number, first: ObjectId }>([
        {
            $match: {
                domainId, uid, status: STATUS.STATUS_ACCEPTED, pid: { $in: visiblePids },
                contest: { $nin: [RecordModel.RECORD_PRETEST, RecordModel.RECORD_GENERATE] },
            },
        },
        { $group: { _id: '$pid', first: { $min: '$_id' } } },
    ]).toArray();
    return first.map((r) => ({ problem: String(r._id), at: r.first.getTimestamp() }));
}

export async function loadExternalOjProfile(domainId: string, uid: number, visiblePids: number[] | null) {
    const [entries, local] = await Promise.all([
        getExternalOjBindings(uid),
        visiblePids === null ? undefined : localPasses(domainId, uid, visiblePids),
    ]);
    const accounts = describeExternalOjBindings(entries, true).map((account) => ({
        ...account,
        profileUrl: account.handle ? externalOjProfileUrl(account.platform, account.handle) : undefined,
        activityUrl: account.handle ? externalOjActivityUrl(account.platform, account.handle) : undefined,
    }));
    const sources = [
        { id: 'hgnu', label: '本校 OJ', solves: local },
        ...accounts.filter((account) => account.state !== 'unbound').map((account) => {
            const entry = entries.find(({ platform }) => platform === account.platform);
            return {
                id: account.platform, label: account.label, solves: entry?.solves, through: entry?.lastSuccessAt,
            };
        }),
    ];
    const days = buildDailyActivity(sources);
    const leading = (new Date(`${days[0].day}T00:00:00Z`).getUTCDay() + 6) % 7;
    const months = days.flatMap(({ day }, i) => day.endsWith('-01')
        ? [{ label: `${Number(day.slice(5, 7))}月`, column: Math.floor((leading + i) / 7) + 1 }]
        : []);
    return {
        accounts,
        labels: sources.map(({ label }) => label),
        missing: sources.filter(({ solves }) => !solves).map(({ label }) => label),
        leading: Array.from({ length: leading }),
        months,
        hasRecentPasses: days.some(({ total }) => total > 0),
        days,
    };
}
