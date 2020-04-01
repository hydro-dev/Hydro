module.exports = {
    check: () => { },
    stat: (tdoc, journal) => {
        let naccept = {}, effective = {}, detail = [], accept = 0, time = 0;
        for (let j in journal) {
            if (tdoc.pids.includes(j.pid) && !(effective.includes(j.pid) && effective[j.pid].accept))
                effective[j.pid] = j;
            if (!j.accept)
                naccept[j.pid]++;
        }
        function _time(jdoc) {
            let real = jdoc.rid.generation_time - Math.floor(tdoc.begin_at / 1000);
            let penalty = 20 * 60 * naccept[jdoc.pid];
            return real + penalty;
        }
        for (let j of effective)
            detail.push(Object.assign({}, j, {
                naccept: naccept[j.pid], time: _time(j)
            }));
        for (let d of detail) {
            accept += d.accept;
            if (d.accept) time += d.time;
        }
        return { accept, time, detail };
    },
    scoreboard(is_export, _, tdoc, ranked_tsdocs, udict, dudict, pdict) {
        let columns = [
            { type: 'rank', value: _('Rank') },
            { type: 'user', value: _('User') },
            { type: 'display_name', value: _('Display Name') },
            { type: 'solved_problems', value: _('Solved Problems') }
        ];
        if (is_export) {
            columns.push({ 'type': 'total_time', 'value': _('Total Time (Seconds)') });
            columns.push({ 'type': 'total_time_str', 'value': _('Total Time') });
        }
        for (let i in tdoc.pids)
            if (is_export) {
                columns.push({
                    type: 'problem_flag',
                    value: '#{0} {1}'.format(i + 1, pdict[tdoc.pids[i]].title)
                });
                columns.push({
                    type: 'problem_time',
                    value: '#{0} {1}'.format(i + 1, _('Time (Seconds)'))
                });
                columns.push({
                    type: 'problem_time_str',
                    value: '#{0} {1}'.format(i + 1, _('Time'))
                });
            } else
                columns.push({
                    type: 'problem_detail',
                    value: '#{0}'.format(i + 1), raw: pdict[tdoc.pids[i]]
                });
        let rows = [columns];
        for (let [rank, tsdoc] of ranked_tsdocs) {
            let tsddict = {};
            if (tdoc.detail)
                for (let item of tsdoc.detail)
                    tsddict[item.pid] = item;
            let row = [];
            row.push(
                { type: 'string', value: rank },
                { type: 'user', value: udict[tsdoc.uid].uname, raw: udict[tsdoc.uid] },
                { type: 'display_name', value: (dudict[tsdoc.uid] || {}).display_name || '' },
                { type: 'string', value: tsdoc.accept || 0 });
            if (is_export)
                row.push(
                    { type: 'string', value: tsdoc.time || 0.0 },
                    { type: 'string', value: tsdoc.time || 0.0 }
                );
            for (let pid of tdoc.pids) {
                let rdoc, col_accepted, col_time, col_time_str;
                if ((tsddict[pid] || {}).accept) {
                    rdoc = tsddict[pid].rid;
                    col_accepted = _('Accepted');
                    col_time = tsddict[pid].time;
                    col_time_str = col_time;
                } else {
                    rdoc = null;
                    col_accepted = '-';
                    col_time = '-';
                    col_time_str = '-';
                }
                if (is_export) {
                    row.push({ type: 'string', value: col_accepted });
                    row.push({ type: 'string', value: col_time });
                    row.push({ type: 'string', value: col_time_str });
                } else {
                    row.push({
                        type: 'record',
                        value: '{0}\n{1}'.format(col_accepted, col_time_str),
                        raw: rdoc
                    });
                }
                rows.push(row);
            }
        }
        return rows;
    }
};