import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
require('@hydrooj/register');
const { submissionChecks, submissionFilterQuery, submissionFilters }: typeof import('./jury-submissions') = require('./jury-submissions.ts');

test('jury queue keeps zero verdicts, team members and simultaneous status filters', () => {
    const filters = submissionFilters({ show: 'unjudged', team: '-12', problem: '2164', result: '0', page: '2' }, [2164]);
    assert.equal(filters.page, 2);
    assert.deepEqual(submissionFilterQuery(filters, [3, 7]), {
        uid: { $in: [3, 7] }, pid: 2164, $and: [{ status: { $in: [0, 22] } }, { status: 0 }],
    });
    assert.deepEqual(submissionFilterQuery(submissionFilters({ show: 'judging' }, [])), {
        $and: [{ status: { $in: [20, 21] } }],
    });
});

test('queue filter rejects operators, malformed identities, foreign problems and unbounded pages', () => {
    for (const query of [{ team: { $ne: 3 } }, { team: '0' }, { team: 'NaN' }, { problem: '99' },
        { language: { $regex: '.*' } }, { result: '999' }, { page: '-1' }, { page: '1.1' }, { page: '1000001' }, { show: 'all&x=1' }]) {
        assert.throws(() => submissionFilters(query, [2164]));
    }
});

test('jury testcase badges preserve ordering and distinguish rejected, running and cancelled checks', () => {
    const cases = [{ id: 2, subtaskId: 1, status: 2, message: 'private checker output' },
        { id: 1, subtaskId: 1, status: 1 }, { id: 3, subtaskId: 1, status: 20 }, { id: 4, subtaskId: 1, status: 9 }];
    const checks = submissionChecks(cases);
    assert.deepEqual(checks.map((item) => [item.id, item.symbol, item.style]), [
        [1, '✓', 'success'], [2, 'w', 'danger'], [3, '…', 'warning'], [4, '×', 'secondary'],
    ]);
    assert(!JSON.stringify(checks).includes('private'));
    assert.deepEqual(submissionChecks(), []);
    assert.equal(cases[0].id, 2, 'Rendering must not reorder stored testcase results');
});
