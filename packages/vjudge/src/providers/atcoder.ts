/* eslint-disable no-await-in-loop */
import {
    Logger, sleep, STATUS,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';

const logger = new Logger('atcoder');

const VERDICT = {
    'C': STATUS.STATUS_COMPILE_ERROR,
    'R': STATUS.STATUS_RUNTIME_ERROR,
    'T': STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    'M': STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    'O': STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
    'W': STATUS.STATUS_WRONG_ANSWER,
    'A': STATUS.STATUS_ACCEPTED,
};

const langId = {
    'atcoder.fishr': '5080',
    'atcoder.ada': '5068',
    'atcoder.asm64': '5040',
    'atcoder.awk': '5038',
    'atcoder.bash': '5023',
    'atcoder.bc': '5035',
    'atcoder.brainfuck': '5020',
    'atcoder.csharpcsharp': '5003',
    'atcoder.csharpaot': '5042',
    'atcoder.cpp17clang': '5072',
    'atcoder.cpp17gcc': '5053',
    'atcoder.cpp20clang': '5073',
    'atcoder.cpp20gcc': '5001',
    'atcoder.cpp23clang': '5031',
    'atcoder.cpp23gcc': '5028',
    'atcoder.c': '5017',
    'atcoder.carp': '5071',
    'atcoder.clojurebabashka': '5050',
    'atcoder.clojureclojure': '5064',
    'atcoder.cobolfree': '5030',
    'atcoder.cobolfixed': '5090',
    'atcoder.commonlisp': '5029',
    'atcoder.crystal': '5019',
    'atcoder.cyber': '5070',
    'atcoder.ddmd': '5012',
    'atcoder.dgdc': '5077',
    'atcoder.dldc': '5013',
    'atcoder.dart': '5015',
    'atcoder.dc': '5036',
    'atcoder.eclipse': '5066',
    'atcoder.elixir': '5085',
    'atcoder.elispbyte': '5075',
    'atcoder.elispnative': '5062',
    'atcoder.elispno': '5088',
    'atcoder.erlang': '5051',
    'atcoder.fsharp': '5021',
    'atcoder.factor': '5076',
    'atcoder.forth': '5049',
    'atcoder.fortran': '5026',
    'atcoder.go': '5002',
    'atcoder.haskell': '5025',
    'atcoder.haxejvm': '5084',
    'atcoder.java': '5005',
    'atcoder.jsdeno': '5010',
    'atcoder.jsnode': '5009',
    'atcoder.jq': '5069',
    'atcoder.julia': '5022',
    'atcoder.koka': '5057',
    'atcoder.kotlinjvm': '5004',
    'atcoder.llvmir': '5074',
    'atcoder.lua': '5043',
    'atcoder.luajit': '5027',
    'atcoder.mercury': '5086',
    'atcoder.nibbles': '5067',
    'atcoder.nim': '5006',
    'atcoder.ocaml': '5059',
    'atcoder.octave': '5083',
    'atcoder.pascal': '5041',
    'atcoder.perl': '5037',
    'atcoder.php': '5016',
    'atcoder.powershell': '5045',
    'atcoder.prolog': '5044',
    'atcoder.pythoncpython': '5055',
    'atcoder.pythoncython': '5082',
    'atcoder.pythonmambaforge': '5063',
    'atcoder.pythonpypy': '5078',
    'atcoder.r': '5011',
    'atcoder.raku': '5060',
    'atcoder.reasonml': '5081',
    'atcoder.ruby': '5018',
    'atcoder.rust': '5054',
    'atcoder.sagemath': '5033',
    'atcoder.scaladotty': '5056',
    'atcoder.scalanative': '5047',
    'atcoder.scheme': '5046',
    'atcoder.sed': '5034',
    'atcoder.seed7': '5087',
    'atcoder.swift': '5014',
    'atcoder.text': '5024',
    'atcoder.typescriptdeno': '5052',
    'atcoder.typescriptnode': '5058',
    'atcoder.unison': '5089',
    'atcoder.v': '5007',
    'atcoder.vim': '5061',
    'atcoder.vb': '5048',
    'atcoder.whitespace': '5079',
    'atcoder.zig': '5008',
    'atcoder.zsh': '5032',
    'atcoder.nadesiko': '5039',
    'atcoder.prodel': '5065',
};

/*
atcoder:
  display: AtCoder
  execute: /bin/echo Invalid
  domain:
  - atcoder
atcoder.fishr:
  display: '>&<> (fishr 0.1.0)'
atcoder.ada:
  display: 'Ada (GNAT 12.2)'
atcoder.asm64:
  display: 'Assembly x64 (NASM 2.15.05)'
atcoder.awk:
  display: 'AWK (GNU Awk 5.0.1)'
atcoder.bash:
  display: 'Bash (bash 5.2.2)'
atcoder.bc:
  display: 'bc (bc 1.07.1)'
atcoder.brainfuck:
  display: 'Brainfuck (bf 20041219)'
atcoder.csharpcsharp:
  display: 'C# 11.0 (.NET 7.0.7)'
atcoder.csharpaot:
  display: 'C# 11.0 AOT (.NET 7.0.7)'
atcoder.cpp17clang:
  display: 'C++ 17 (Clang 16.0.6)'
atcoder.cpp17gcc:
  display: 'C++ 17 (gcc 12.2)'
atcoder.cpp20clang:
  display: 'C++ 20 (Clang 16.0.6)'
atcoder.cpp20gcc:
  display: 'C++ 20 (gcc 12.2)'
atcoder.cpp23clang:
  display: 'C++ 23 (Clang 16.0.6)'
atcoder.cpp23gcc:
  display: 'C++ 23 (gcc 12.2)'
atcoder.c:
  display: 'C (gcc 12.2.0)'
atcoder.carp:
  display: 'Carp (Carp 0.5.5)'
atcoder.clojurebabashka:
  display: 'Clojure (babashka 1.3.181)'
atcoder.clojureclojure:
  display: 'Clojure (clojure 1.11.1)'
atcoder.cobolfree:
  display: 'COBOL (Free) (GnuCOBOL 3.1.2)'
atcoder.cobolfixed:
  display: 'COBOL (GnuCOBOL(Fixed) 3.1.2)'
atcoder.commonlisp:
  display: 'Common Lisp (SBCL 2.3.6)'
atcoder.crystal:
  display: 'Crystal (Crystal 1.9.1)'
atcoder.cyber:
  display: 'Cyber (Cyber v0.2-Latest)'
atcoder.ddmd:
  display: 'D (DMD 2.104.0)'
atcoder.dgdc:
  display: 'D (GDC 12.2)'
atcoder.dldc:
  display: 'D (LDC 1.32.2)'
atcoder.dart:
  display: 'Dart (Dart 3.0.5)'
atcoder.dc:
  display: 'dc (dc 1.07.1)'
atcoder.eclipse:
  display: 'ECLiPSe (ECLiPSe 7.1_13)'
atcoder.elixir:
  display: 'Elixir (Elixir 1.15.2)'
atcoder.elispbyte:
  display: 'Emacs Lisp (Byte Compile) (GNU Emacs 28.2)'
atcoder.elispnative:
  display: 'Emacs Lisp (Native Compile) (GNU Emacs 28.2)'
atcoder.elispno:
  display: 'Emacs Lisp (No Compile) (GNU Emacs 28.2)'
atcoder.erlang:
  display: 'Erlang (Erlang 26.0.2)'
atcoder.fsharp:
  display: 'F# 7.0 (.NET 7.0.7)'
atcoder.factor:
  display: 'Factor (Factor 0.98)'
atcoder.forth:
  display: 'Forth (gforth 0.7.3)'
atcoder.fortran:
  display: 'Fortran (gfortran 12.2)'
atcoder.go:
  display: 'Go (go 1.20.6)'
atcoder.haskell:
  display: 'Haskell (GHC 9.4.5)'
atcoder.haxejvm:
  display: 'Haxe (JVM) (Haxe 4.3.1)'
atcoder.java:
  display: 'Java (OpenJDK 17)'
atcoder.jsdeno:
  display: 'JavaScript (Deno 1.35.1)'
atcoder.jsnode:
  display: 'JavaScript (Node.js 18.16.1)'
atcoder.jq:
  display: 'jq (jq 1.6)'
atcoder.julia:
  display: 'Julia (Julia 1.9.2)'
atcoder.koka:
  display: 'Koka (koka 2.4.0)'
atcoder.kotlinjvm:
  display: 'Kotlin (Kotlin/JVM 1.8.20)'
atcoder.llvmir:
  display: 'LLVM IR (Clang 16.0.6)'
atcoder.lua:
  display: 'Lua (Lua 5.4.6)'
atcoder.luajit:
  display: 'Lua (LuaJIT 2.1.0-beta3)'
atcoder.mercury:
  display: 'Mercury (Mercury 22.01.6)'
atcoder.nibbles:
  display: 'Nibbles (literate form) (nibbles 1.01)'
atcoder.nim:
  display: 'Nim (Nim 1.6.14)'
atcoder.ocaml:
  display: 'OCaml (ocamlopt 5.0.0)'
atcoder.octave:
  display: 'Octave (GNU Octave 8.2.0)'
atcoder.pascal:
  display: 'Pascal (fpc 3.2.2)'
atcoder.perl:
  display: 'Perl (perl 5.34)'
atcoder.php:
  display: 'PHP (php 8.2.8)'
atcoder.powershell:
  display: 'PowerShell (PowerShell 7.3.1)'
atcoder.prolog:
  display: 'Prolog (SWI-Prolog 9.0.4)'
atcoder.pythoncpython:
  display: 'Python (CPython 3.11.4)'
atcoder.pythoncython:
  display: 'Python (Cython 0.29.34)'
atcoder.pythonmambaforge:
  display: 'Python (Mambaforge / CPython 3.10.10)'
atcoder.pythonpypy:
  display: 'Python (PyPy 3.10-v7.3.12)'
atcoder.r:
  display: 'R (GNU R 4.2.1)'
atcoder.raku:
  display: 'Raku (Rakudo 2023.06)'
atcoder.reasonml:
  display: 'ReasonML (reason 3.9.0)'
atcoder.ruby:
  display: 'Ruby (ruby 3.2.2)'
atcoder.rust:
  display: 'Rust (rustc 1.70.0)'
atcoder.sagemath:
  display: 'SageMath (SageMath 9.5)'
atcoder.scaladotty:
  display: 'Scala (Dotty 3.3.0)'
atcoder.scalanative:
  display: 'Scala 3.3.0 (Scala Native 0.4.14)'
atcoder.scheme:
  display: 'Scheme (Gauche 0.9.12)'
atcoder.sed:
  display: 'Sed (GNU sed 4.8)'
atcoder.seed7:
  display: 'Seed7 (Seed7 3.2.1)'
atcoder.swift:
  display: 'Swift (swift 5.8.1)'
atcoder.text:
  display: 'Text (cat 8.32)'
atcoder.typescriptdeno:
  display: 'TypeScript 5.1 (Deno 1.35.1)'
atcoder.typescriptnode:
  display: 'TypeScript 5.1 (Node.js 18.16.1)'
atcoder.unison:
  display: 'Unison (Unison M5b)'
atcoder.v:
  display: 'V (V 0.4)'
atcoder.vim:
  display: 'Vim (vim 9.0.0242)'
atcoder.vb:
  display: 'Visual Basic 16.9 (.NET 7.0.7)'
atcoder.whitespace:
  display: 'Whitespace (whitespacers 1.0.0)'
atcoder.zig:
  display: 'Zig (Zig 0.10.1)'
atcoder.zsh:
  display: 'Zsh (Zsh 5.9)'
atcoder.nadesiko:
  display: 'なでしこ (cnako3 3.4.20)'
atcoder.prodel:
  display: 'プロデル (mono版プロデル 1.9.1182)'
*/

// 似乎用 vjudge.d0j1a1701.cc 就会报 ETIMEOUT，但是用镜像站就不会
export default class AtCoderProvider extends BasicFetcher implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'https://vjudge.d0j1a1701.cc', 'form', logger);
    }

    get loggedIn() {
        return false;
    }

    async ensureLogin() {
        if (await this.loggedIn) {
            return true;
        }
        logger.info('retry login');
        const res = await this.post('/user/login').send({
            username: this.account.handle,
            password: this.account.password,
            captcha: '',
        });
        if (res.header['set-cookie']) await this.setCookie(res.header['set-cookie'], true);
        return true;
    }

    async getProblem(id: string) {
        const { document } = await this.html(`https://vjudge.d0j1a1701.cc/problem/AtCoder-${id}`);
        logger.info(id);
        const time = JSON.parse(document.querySelector('textarea[name="dataJson"]').textContent).properties.find(property => property.content.includes('ms')).content.replace(/\s+/g, '');
        const memory = JSON.parse(document.querySelector('textarea[name="dataJson"]').textContent).properties.find(property => property.content.includes('kB')).content.replace(/\s+/g, '').toLowerCase();

        const iframe = document.querySelector('iframe#frame-description');
        const iframeSrc = iframe?.getAttribute('src');
        if (!iframeSrc) {
            throw new Error('Iframe not found');
        }
        const iframeWindow = await this.html('https://vjudge.d0j1a1701.cc' + iframeSrc);
        const idocument = iframeWindow.document;
        const textarea = idocument.querySelector('textarea.data-json-container');
        const data = JSON.parse(textarea.textContent);
        const sections = data.sections;
        const container = document.createElement('div');
        sections.forEach(section => {
            const h2 = document.createElement('h2');
            h2.textContent = section.title || '';
            const contentDiv = document.createElement('div');
            contentDiv.innerHTML = section.value.content;
            container.appendChild(h2);
            container.appendChild(contentDiv);
        });

        const result = container.innerHTML.replace(/<pre>[\s\S]*?<\/pre>/g, (preMatch) => {
            return preMatch.replace(/<var>(.*?)<\/var>/g, (varMatch, varContent) => {
                return `<var>${varContent.split('\\(').join('').split('\\)').join('')}</var>`;
            });
        });

        return {
            title: document.querySelector('meta[property="og:title"]').getAttribute('content').split('- Virtual Judge')[0].trim(),
            data: {
                'config.yaml': Buffer.from(`time: ${time}\nmemory: ${memory}\ntype: remote_judge\nsubType: atcoder\ntarget: ${id}`),
            },
            tag: [],
            content: result,
        };
    }

    async listProblem(page: number, resync = false) {
        if (page > 1) return [];
        // 镜像站的题目列表似乎只能显示前 100 个，所以我从 vjudge.d0j1a1701.cc 把题目列表爬下来了
        // 也可以防止爬取 vjudge 上因为 bug 爬到的一些题
        const response = await fetch(`https://cdn.llong.tech/vj-atcoder.json`);
        const content = await response.text();
        const jsres = JSON.parse(content);
        const result: string[] = jsres.data.map((item: { originProb: string }) => item.originProb.toUpperCase());
        return result;
    }

    async submitProblem(problemcode: string, lang: string, code: string, info, next, end) {
        // TODO check submit time to ensure submission
        logger.info(`submit ${problemcode.toLowerCase()}, language=${lang}(${langId[lang]})`);
        const response = await this.post('/problem/submit').send({
            method: '0',
            language: langId[lang],
            open: '0',
            captcha: '',
            oj: 'AtCoder',
            probNum: problemcode.toLowerCase(),
            source: btoa(encodeURIComponent(code)),
        });
        logger.info(response.text);
        const runId = JSON.parse(response.text).runId;
        if(!runId) {
            end({ status: STATUS.STATUS_SYSTEM_ERROR, message: 'Duplicated source code, rejected by Vjudge.'});
            return null;
        }
        return runId;
    }

    async waitForSubmission(id: string, next, end) {
        logger.debug('Waiting for %s', id);
        // eslint-disable-next-line no-constant-condition
        while (true) {
            await sleep(3000);
            const response = await fetch(`https://vjudge.d0j1a1701.cc/solution/data/${id}`);
            const content = await response.text();
            const jsres = JSON.parse(content);
            if(jsres.processing == true) continue;
            const status = VERDICT[jsres.statusCanonical[0]] || STATUS.STATUS_WRONG_ANSWER;
            const timestr = jsres.runtime;
            const time = timestr === '-' ? 0 : (+timestr);
            const memorystr = jsres.memory;
            const memory = memorystr === '-' ? 0 : (+memorystr);
            return await end({
                status,
                score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
                time,
                memory,
            });
        }
    }
}
