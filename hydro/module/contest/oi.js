const ranked = require('../../lib/rank');

module.exports = {
    TEXT: 'OI',
    check: () => { },
    stat: (tdoc, journal) => {
        let detail = {}, score = 0;
        for (let j in journal)
            if (tdoc.pids.includes(j.pid)) {
                detail[j.pid] = j;
                score += j.score;
            }
        return { score, detail };
    },
    showScoreboard(tdoc, now) {
        return now > tdoc.endAt;
    },
    showRecord(tdoc, now) {
        return now > tdoc.endAt;
    },
    scoreboard(is_export, _, tdoc, ranked_tsdocs, udict, pdict) {
        let columns = [
            { type: 'rank', value: _('Rank') },
            { type: 'user', value: _('User') },
            { type: 'total_score', value: _('Total Score') }
        ];
        for (let i in tdoc.pids)
            if (is_export)
                columns.push({
                    type: 'problem_score',
                    value: '#{0} {1}'.format(i + 1, pdict[tdoc.pids[i]].title)
                });
            else
                columns.push({
                    type: 'problem_detail',
                    value: '#{0}'.format(i + 1),
                    raw: pdict[tdoc.pids[i]]
                });
        let rows = [columns];
        for (let [rank, tsdoc] of ranked_tsdocs) {
            let tsddict = {};
            if (tsdoc.journal)
                for (let item of tsdoc.journal)
                    tsddict[item.pid] = item;
            let row = [];
            row.push({ type: 'string', value: rank });
            row.push({ type: 'user', value: udict[tsdoc.uid].uname, raw: udict[tsdoc.uid] });
            row.push({ type: 'string', value: tsdoc.score || 0 });
            for (let pid of tdoc.pids)
                row.push({
                    type: 'record',
                    value: (tsddict[pid] || {}).score || '-',
                    raw: (tsddict[pid] || {}).rid || null
                });
            rows.push(row);
        }
        return rows;
    },
    rank: tdocs => ranked(tdocs, (a, b) => a.score == b.score)
};