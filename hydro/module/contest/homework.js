module.exports = {
    TEXT: 'Assignment',
    check() {},
    stat(tdoc, journal) {
        const effective = {};
        const detail = [];
        let score = 0;
        let time = 0;
        for (const j in journal) {
            if (tdoc.pids.includes(j.pid)
            && !(effective.includes(j.pid) && effective[j.pid].accept)) {
                effective[j.pid] = j;
            }
        }
        const _time = (jdoc) => jdoc.rid.generationTime - Math.floor(tdoc.beginAt / 1000);
        for (const j in effective) {
            detail.push({
                ...effective[j],
                time: _time(effective[j]),
            });
        }
        for (const d of detail) {
            score += d.score;
            time += d.time;
        }
        return {
            score, time, detail,
        };
    },
    scoreboard(isExport, _, tdoc, rankedTsdocs, udict, pdict) {
        const columns = [
            { type: 'rank', value: _('Rank') },
            { type: 'user', value: _('User') },
            { type: 'display_name', value: _('Display Name') },
            { type: 'total_score', value: _('Score') },
        ];
        if (isExport) {
            columns.push(
                { type: 'total_original_score', value: _('Original Score') },
                { type: 'total_time', value: _('Total Time (Seconds)') },
            );
        }
        columns.push({ type: 'total_time_str', value: _('Total Time') });
        for (const i in tdoc.pids) {
            if (isExport) {
                columns.push(
                    { type: 'problem_score', value: '#{0} {1}'.format(i + 1, pdict[tdoc.pids[i]].title) },
                    { type: 'problem_original_score', value: '#{0} {1}'.format(i + 1, _('Original Score')) },
                    { type: 'problem_time', value: '#{0} {1}'.format(i + 1, _('Time (Seconds)')) },
                    { type: 'problem_time_str', value: '#{0} {1}'.format(i + 1, _('Time')) },
                );
            } else columns.push({ type: 'problem_detail', value: '#{0}'.format(i + 1), raw: pdict[tdoc.pids[i]] });
        }
        const rows = [columns];
        for (const [rank, tsdoc] in rankedTsdocs) {
            const tsddict = {};
            if (tsdoc.detail) { for (const item of tsdoc.detail) tsddict[item.pid] = item; }
            const row = [
                { type: 'string', value: rank },
                { type: 'user', value: udict[tsdoc.uid].uname, raw: udict[tsdoc.uid] },
                { type: 'string', value: tsdoc.penalty_score || 0 },
            ];
            if (isExport) {
                row.push(
                    { type: 'string', value: tsdoc.score || 0 },
                    { type: 'string', value: tsdoc.time || 0.0 },
                );
            }
            row.push({ type: 'string', value: tsdoc.time || 0 });
            for (const pid of tdoc.pids) {
                const rdoc = (tsddict[pid] || {}).rid || null;
                const colScore = (tsddict[pid] || {}).penalty_score || '-';
                const colOriginalScore = (tsddict[pid] || {}).score || '-';
                const colTime = (tsddict[pid] || {}).time || '-';
                const colTimeStr = colTime !== '-' ? colTime : '-';
                if (isExport) {
                    row.push(
                        { type: 'string', value: colScore },
                        { type: 'string', value: colOriginalScore },
                        { type: 'string', value: colTime },
                        { type: 'string', value: colTimeStr },
                    );
                } else {
                    row.push({
                        type: 'record',
                        value: '{0} / {1}\n{2}'.format(colScore, colOriginalScore, colTimeStr),
                        raw: rdoc,
                    });
                }
            }
            rows.push(row);
        }
        return rows;
    },
};
