module.exports = {
    TEXT: 'ACM/ICPC',
    check: () => { },
    showScoreboard: () => true,
    showRecord: (tdoc, now) => now > tdoc.endAt,
    stat: (tdoc, journal) => {
        const naccept = {};
        const effective = {};
        const detail = [];
        let accept = 0;
        let time = 0;
        for (const j in journal) {
            if (tdoc.pids.includes(j.pid)
            && !(effective.includes(j.pid) && effective[j.pid].accept)) {
                effective[j.pid] = j;
            }
            if (!j.accept) naccept[j.pid]++;
        }
        function _time(jdoc) {
            const real = jdoc.rid.generationTime - Math.floor(tdoc.begin_at / 1000);
            const penalty = 20 * 60 * naccept[jdoc.pid];
            return real + penalty;
        }
        for (const j of effective) detail.push({ ...j, naccept: naccept[j.pid], time: _time(j) });
        for (const d of detail) {
            accept += d.accept;
            if (d.accept) time += d.time;
        }
        return { accept, time, detail };
    },
    scoreboard(isExport, _, tdoc, rankedTsdocs, udict, pdict) {
        const columns = [
            { type: 'rank', value: _('Rank') },
            { type: 'user', value: _('User') },
            { type: 'solved_problems', value: _('Solved Problems') },
        ];
        if (isExport) {
            columns.push({ type: 'total_time', value: _('Total Time (Seconds)') });
            columns.push({ type: 'total_time_str', value: _('Total Time') });
        }
        for (const i in tdoc.pids) {
            if (isExport) {
                columns.push({
                    type: 'problem_flag',
                    value: '#{0} {1}'.format(i + 1, pdict[tdoc.pids[i]].title),
                });
                columns.push({
                    type: 'problem_time',
                    value: '#{0} {1}'.format(i + 1, _('Time (Seconds)')),
                });
                columns.push({
                    type: 'problem_time_str',
                    value: '#{0} {1}'.format(i + 1, _('Time')),
                });
            } else {
                columns.push({
                    type: 'problem_detail',
                    value: '#{0}'.format(i + 1),
                    raw: pdict[tdoc.pids[i]],
                });
            }
        }
        const rows = [columns];
        for (const [rank, tsdoc] of rankedTsdocs) {
            const tsddict = {};
            if (tdoc.detail) { for (const item of tsdoc.detail) tsddict[item.pid] = item; }
            const row = [];
            row.push(
                { type: 'string', value: rank },
                { type: 'user', value: udict[tsdoc.uid].uname, raw: udict[tsdoc.uid] },
                { type: 'string', value: tsdoc.accept || 0 },
            );
            if (isExport) {
                row.push(
                    { type: 'string', value: tsdoc.time || 0.0 },
                    { type: 'string', value: tsdoc.time || 0.0 },
                );
            }
            for (const pid of tdoc.pids) {
                let rdoc;
                let colAccepted;
                let colTime;
                let colTimeStr;
                if ((tsddict[pid] || {}).accept) {
                    rdoc = tsddict[pid].rid;
                    colAccepted = _('Accepted');
                    colTime = tsddict[pid].time;
                    colTimeStr = colTime;
                } else {
                    rdoc = null;
                    colAccepted = '-';
                    colTime = '-';
                    colTimeStr = '-';
                }
                if (isExport) {
                    row.push({ type: 'string', value: colAccepted });
                    row.push({ type: 'string', value: colTime });
                    row.push({ type: 'string', value: colTimeStr });
                } else {
                    row.push({
                        type: 'record',
                        value: '{0}\n{1}'.format(colAccepted, colTimeStr),
                        raw: rdoc,
                    });
                }
                rows.push(row);
            }
        }
        return rows;
    },
};
