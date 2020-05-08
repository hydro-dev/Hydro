// Webpack Required
const fs = require('fs');
const path = require('path');
const child = require('child_process');

async function postInit() {
    const { mkdirp, rmdir, compilerText } = require('./HydroJudger/judger/utils');
    const log = require('./HydroJudger/judger/log');
    const { CACHE_DIR, TEMP_DIR } = require('./HydroJudger/judger/config');
    const tmpfs = require('./HydroJudger/judger/tmpfs');
    const { FormatError, CompileError, SystemError } = require('./HydroJudger/judger/error');
    const { STATUS_COMPILE_ERROR, STATUS_SYSTEM_ERROR } = require('./HydroJudger/judger/status');
    const readCases = require('./HydroJudger/judger/cases');
    const judger = require('./HydroJudger/judger/judger');

    const fsp = fs.promises;
    const { problem, task } = global.Hydro.model;
    const { judge } = global.Hydro.handler;

    async function problemData(pid, savePath) {
        const tmpFilePath = path.resolve(CACHE_DIR, `download_${pid}`);
        const res = await problem.getData(pid);
        const w = await fs.createWriteStream(tmpFilePath);
        res.data.pipe(w);
        await new Promise((resolve, reject) => {
            w.on('finish', resolve);
            w.on('error', reject);
        });
        mkdirp(path.dirname(savePath));
        await new Promise((resolve, reject) => {
            child.exec(`unzip ${tmpFilePath} -d ${savePath}`, (e) => {
                if (e) reject(e);
                else resolve();
            });
        });
        await fsp.unlink(tmpFilePath);
        await this.processData(savePath).catch();
        return savePath;
    }

    async function cacheOpen(pid, version) {
        const filePath = path.join(CACHE_DIR, pid);
        if (fs.existsSync(filePath)) {
            let ver;
            try {
                ver = fs.readFileSync(path.join(filePath, 'version')).toString();
            } catch (e) { /* ignore */ }
            if (version === ver) return filePath;
            rmdir(filePath);
        }
        mkdirp(filePath);
        await problemData(pid, filePath);
        fs.writeFileSync(path.join(filePath, 'version'), version);
        return filePath;
    }

    function getNext(that) {
        that.nextId = 1;
        that.nextWaiting = [];
        return (data, id) => {
            data.key = 'next';
            data.rid = that.rid;
            if (id) {
                if (id === that.nextId) {
                    judge.next(data);
                    that.nextId++;
                    let t = true;
                    while (t) {
                        t = false;
                        for (const i in that.nextWaiting) {
                            if (that.nextId === that.nextWaiting[i].id) {
                                judge.next(that.nextWaiting[i].data);
                                that.nextId++;
                                that.nextWaiting.splice(i, 1);
                                t = true;
                            }
                        }
                    }
                } else that.nextWaiting.push({ data, id });
            } else judge.next(data);
        };
    }

    function getEnd(rid) {
        return (data) => {
            data.key = 'end';
            data.rid = rid;
            log.log({
                status: data.status,
                score: data.score,
                time_ms: data.time_ms,
                memory_kb: data.memory_kb,
            });
            judge.end(data);
        };
    }

    class JudgeTask {
        constructor(request) {
            this.stat = {};
            this.stat.receive = new Date();
            this.request = request;
        }

        async handle() {
            try {
                this.stat.handle = new Date();
                this.event = this.request.event;
                this.pid = this.request.pid;
                this.rid = this.request.rid;
                this.lang = this.request.lang;
                this.code = this.request.code;
                this.data = this.request.data;
                this.next = getNext(this);
                this.end = getEnd(this.rid);
                this.tmpdir = path.resolve(TEMP_DIR, 'tmp', this.rid);
                this.clean = [];
                mkdirp(this.tmpdir);
                tmpfs.mount(this.tmpdir, '64m');
                log.submission(`${this.rid}`, { pid: this.pid });
                if (!this.event) await this.submission();
                else throw new SystemError(`Unsupported type: ${this.type}`);
            } catch (e) {
                if (e instanceof CompileError) {
                    this.next({ compiler_text: compilerText(e.stdout, e.stderr) });
                    this.end({
                        status: STATUS_COMPILE_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                    });
                } else if (e instanceof FormatError) {
                    this.next({ judge_text: `${e.message}\n${JSON.stringify(e.params)}` });
                    this.end({
                        status: STATUS_SYSTEM_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                    });
                } else {
                    log.error(e);
                    this.next({ judge_text: `${e.message}\n${e.stack}\n${JSON.stringify(e.params)}` });
                    this.end({
                        status: STATUS_SYSTEM_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                    });
                }
            }
            for (const clean of this.clean) await clean().catch();
            tmpfs.umount(this.tmpdir);
            await rmdir(this.tmpdir);
        }

        async submission() {
            this.stat.cache_start = new Date();
            this.folder = await cacheOpen(this.pid, this.data);
            this.stat.read_cases = new Date();
            this.config = await readCases(
                this.folder,
                { detail: true },
                { next: this.next },
            );
            this.stat.judge = new Date();
            await judger[this.config.type || 'default'].judge(this);
        }
    }
    task.consume((t) => {
        (new JudgeTask(t)).handle();
    });
}

module.exports = { postInit };
