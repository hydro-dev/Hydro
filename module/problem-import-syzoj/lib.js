const assert = require('assert');

const { download } = global.Hydro.lib;
const { axios } = global.Hydro.lib;
const { ValidationError, RemoteOnlineJudgeError } = global.Hydro.error;

async function syzoj(url, handler) {
    const RE_SYZOJ = /https?:\/\/([a-zA-Z0-9.]+)\/problem\/([0-9]+)\/?/i;
    assert(url.match(RE_SYZOJ), new ValidationError('url'));
    if (!url.endsWith('/')) url += '/';
    const [, host, pid] = RE_SYZOJ.exec(url);
    const res = await axios.get(`${url}export`);
    assert(res.status === 200, new RemoteOnlineJudgeError('Cannot connect to target server'));
    assert(res.data.success, new RemoteOnlineJudgeError((res.data.error || {}).message));
    const p = res.data.obj;
    const content = [];
    if (p.description) {
        content.push(
            handler.translate('problem.import.problem_description'),
            p.description,
        );
    }
    if (p.input_format) {
        content.push(
            handler.translate('problem.import.input_format'),
            p.input_format,
        );
    }
    if (p.output_format) {
        content.push(
            handler.translate('problem.import.output_format'),
            p.output_format,
        );
    }
    if (p.hint) {
        content.push(
            handler.translate('problem.import.hint'),
            p.hint,
        );
    }
    if (p.limit_and_hint) {
        content.push(
            handler.translate('problem.import.limit_and_hint'),
            p.limit_and_hint,
        );
    }
    if (p.have_additional_file) {
        content.push(
            handler.translate('problem.import.additional_file'),
            `${url}download/additional_file`,
        );
    }
    const pdoc = {
        title: p.title,
        content: content.join('  \n'),
        owner: handler.user._id,
        from: url,
        pid: `${host}_${pid}`,
        tags: p.tags,
        config: {
            time: p.time_limit,
            memory: p.memory_limit * 1024,
            filename: p.file_io_input_name,
            type: p.type,
        },
    };
    const r = await download(`${url}testdata/download`);
    return [pdoc, r];
}

global.Hydro.lib['import.syzoj'] = syzoj;
