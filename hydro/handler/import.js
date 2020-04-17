const assert = require('assert');
const download = require('../lib/download');
const problem = require('../model/problem');
const { Route, Handler } = require('../service/server');
const { PERM_CREATE_PROBLEM } = require('../permission');
const axios = require('../lib/axios');
const { ValidationError, RemoteOnlineJudgeError } = require('../error');

class ProblemImportHandler extends Handler {
    async syzoj(url) {
        const RE_SYZOJ = /https?:\/\/([a-zA-Z0-9\.]+)\/problem\/([0-9]+)\/?/i;
        assert(url.match(RE_SYZOJ), new ValidationError('url'));
        if (!url.endsWith('/')) url += '/';
        const [, host, pid] = RE_SYZOJ.exec(url);
        const res = await axios.get(`${url}export`);
        assert(res.status === 200, new RemoteOnlineJudgeError('Cannot connect to target server'));
        assert(res.data.success, new RemoteOnlineJudgeError((res.data.error || {}).message));
        const p = res.data.obj;
        const content = [
            this.translate('problem.import.problem_description'),
            p.description,
            this.translate('problem.import.input_format'),
            p.input_format,
            this.translate('problem.import.output_format'),
            p.output_format,
            this.translate('problem.import.hint'),
            p.hint,
            this.translate('problem.import.limit_and_hint'),
            p.limit_and_hint,
        ];
        if (p.have_additional_file) {
            content.push(
                this.translate('problem.import.additional_file'),
                `${url}download/additional_file`,
            );
        }
        const pdoc = {
            title: p.title,
            content: content.join('  \n'),
            owner: this.user._id,
            from: url,
            pid: `${host}_${pid}`,
            config: {
                time: p.time_limit,
                memory: p.memory_limit * 1024,
                filename: p.file_io_input_name,
                type: p.type,
                tags: p.tags,
            },
        };
        const r = await download(`${url}testdata/download`);
        return [pdoc, r];
    }

    async prepare() {
        this.checkPerm(PERM_CREATE_PROBLEM);
    }

    async get() {
        this.response.template = 'problem_import.html';
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['problem_main', '/p'],
                ['problem_import', null],
            ],
        };
    }

    async post({
        url, pid, hidden, remoteType,
    }) {
        if (remoteType !== 'syzoj') throw new ValidationError('remoteType');
        const [pdoc, testdata] = await this.syzoj(url);
        if (pid) pdoc.pid = pid;
        if (hidden) pdoc.hidden = true;
        const _id = await problem.add(pdoc);
        console.log(_id);
        await problem.setTestdata(_id, testdata);
        this.response.body = { pid: pid || _id };
        this.response.redirect = `/p/${pid || _id}/settings`;
    }
}

Route('/problem/import', ProblemImportHandler);
