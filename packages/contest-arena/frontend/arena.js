/* The arena deliberately uses full navigation; OJ PJAX/CSS does not cross layouts. */
(() => {
    'use strict';
    const root = document.documentElement;
    const navbar = document.querySelector('.navbar');
    const fitNavigation = () => {
        if (navbar) root.style.setProperty('--arena-nav-height', `${Math.ceil(navbar.getBoundingClientRect().height)}px`);
    };
    if (navbar && typeof ResizeObserver === 'function') new ResizeObserver(fitNavigation).observe(navbar);
    fitNavigation();
    const view = root.dataset.arenaView;
    const state = root.dataset.arenaState;
    let offset = Number(root.dataset.arenaNow) - Date.now();
    let start = Number(root.dataset.arenaStart);
    let end = Number(root.dataset.arenaEnd);
    const initiallyBefore = Number(root.dataset.arenaNow) < start;
    const initiallyEnded = root.dataset.arenaEnded === 'true';
    const initiallyParticipantEnded = root.dataset.arenaParticipantEnded === 'true';
    const initiallyRestricted = root.dataset.arenaRestricted === 'true';
    let busy = false;
    let stopped = false;
    let notifications = false;
    let polling = false;
    const rendered = new Map();
    for (const el of document.querySelectorAll('[data-arena-live]')) {
        rendered.set(el.dataset.arenaLive, el.innerHTML);
    }
    const home = state.replace(/\/state$/, '');
    const detailDialog = document.getElementById('detail-modal');
    const hasDraft = (element) => [...(element?.querySelectorAll('textarea') || [])].some((input) => input.value.trim());
    const replaceDetailFragment = (target, html) => {
        if (!target || target.innerHTML === html) return;
        const open = new Set([...target.querySelectorAll('details[open][data-detail-key]')].map((el) => el.dataset.detailKey));
        const scroll = target.scrollTop;
        target.innerHTML = html;
        for (const element of target.querySelectorAll('details[data-detail-key]')) {
            element.open = open.has(element.dataset.detailKey);
        }
        target.scrollTop = scroll;
    };
    let detailUrl = '';
    let detailLoading = false;
    const readDetail = async (href, initial = true) => {
        if (!detailDialog || detailLoading) return;
        if (!initial && hasDraft(detailDialog)) return;
        const url = new URL(href, location.href);
        const base = new URL(home, location.origin);
        if (
            url.origin !== base.origin
            || ![`${base.pathname}/submission`, `${base.pathname}/clarification`].includes(url.pathname)
        ) {
            return;
        }
        const submission = url.pathname.endsWith('/submission');
        detailUrl = href;
        detailLoading = true;
        if (initial) {
            detailDialog.querySelector('#detail-title').textContent = submission
                ? 'Submission details'
                : 'Clarification';
            detailDialog.querySelector('[data-detail-body]').textContent = 'Loading…';
            detailDialog.setAttribute('aria-busy', 'true');
            detailDialog.showModal();
        }
        try {
            if (!initial && submission) {
                url.pathname = `${base.pathname}/state`;
                url.searchParams.set('view', 'submission');
                url.searchParams.delete('modal');
            } else url.searchParams.set('modal', '1');
            const response = await fetch(url, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error('Unable to load details. Close this window and try again.');
            const data = await response.json();
            if (!detailDialog.open || detailUrl !== href) return;
            if (!initial && hasDraft(detailDialog)) return;
            if (!initial && submission) {
                const html = data.fragments?.['submission-status'];
                if (typeof html !== 'string') throw new TypeError('Unable to refresh submission details.');
                replaceDetailFragment(detailDialog.querySelector('[data-arena-live="submission-status"]'), html);
            } else {
                if (typeof data.html !== 'string') throw new TypeError('Unable to load details. Reload the page and try again.');
                detailDialog.querySelector('#detail-title').textContent = data.title;
                detailDialog.querySelector('[data-detail-body]').innerHTML = data.html;
            }
        } catch (error) {
            if (detailDialog.open && detailUrl === href && initial) {
                detailDialog.querySelector('[data-detail-body]').textContent = error.message;
            }
        } finally {
            detailLoading = false;
            detailDialog.removeAttribute('aria-busy');
        }
    };
    setInterval(() => {
        if (detailDialog?.open && detailUrl && !busy && !document.hidden) {
            readDetail(detailUrl, false);
        }
    }, 4000);
    const showError = (message, target = document.getElementById('arena-error')) => {
        if (!target) return;
        target.textContent = message;
        target.hidden = false;
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const hideError = () => {
        const el = document.getElementById('arena-error');
        if (el) el.hidden = true;
    };
    const clock = () => {
        const now = Date.now() + offset;
        const seconds = Math.max(0, Math.ceil(((now < start ? start : end) - now) / 1000));
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor(seconds / 60) % 60;
        const secs = seconds % 60;
        const el = document.querySelector('[data-countdown]');
        const finished = initiallyEnded || initiallyParticipantEnded || now >= end;
        if (el) {
            const remaining = [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
            el.textContent = finished
                ? 'Contest ended'
                : `${now < start ? 'Starts in ' : ''}${remaining}`;
            el.parentElement.classList.toggle('ended', finished);
        }
        const track = document.querySelector('.progress-track');
        const value = document.querySelector('.progress-value');
        const percent = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
        if (value) value.style.width = `${percent}%`;
        if (track) {
            track.hidden = now < start || finished;
            track.setAttribute('aria-valuenow', String(Math.round(percent)));
        }
        const canSubmit = root.dataset.arenaParticipant === 'true' && !finished && now >= start;
        for (const link of document.querySelectorAll('[data-open-submit]')) {
            link.classList.toggle('disabled', !canSubmit);
            link.setAttribute('aria-disabled', String(!canSubmit));
        }
        for (const button of document.querySelectorAll('[data-submit-solution] button[type=submit]')) {
            button.disabled = !canSubmit || busy || !button.form.querySelector('[data-submit-language]')?.value;
        }
    };
    clock();
    setInterval(clock, 1000);
    document.querySelector('.navbar-toggler')?.addEventListener('click', (event) => {
        const menu = document.querySelector('.navbar-collapse');
        event.currentTarget.setAttribute('aria-expanded', String(menu.classList.toggle('open')));
    });
    const filterTeams = () => {
        window.arenaScoreboard?.refresh();
    };
    const notified = new Set();
    async function refresh(manual = false) {
        if (
            polling
            || busy
            || stopped
            || (!manual && (document.hidden || window.arenaScoreboard?.autoRefreshEnabled() === false))
        ) {
            return;
        }
        polling = true;
        try {
            const url = new URL(state, location.origin);
            url.search = location.search;
            url.searchParams.set('view', view);
            const response = await fetch(url, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
                throw new Error(
                    response.status === 403
                        ? 'Session expired or access denied. Reload the page to log in again.'
                        : 'Unable to refresh. Your last displayed results are retained.',
                );
            }
            const data = await response.json();
            if (!data.fragments) throw new Error('Unable to refresh. Reload this page if the problem continues.');
            offset = Number(data.now) - Date.now();
            start = Number(data.start);
            end = Number(data.end);
            if (
                (typeof data.before === 'boolean' && data.before !== initiallyBefore)
                || (typeof data.ended === 'boolean' && data.ended !== initiallyEnded)
                || (typeof data.participantEnded === 'boolean' && data.participantEnded !== initiallyParticipantEnded)
                || (typeof data.restrictExit === 'boolean' && data.restrictExit !== initiallyRestricted)
            ) {
                location.reload();
                return;
            }
            for (const [key, html] of Object.entries(data.fragments)) {
                const target = document.querySelector(`[data-arena-live="${key}"]`);
                if (!target || rendered.get(key) === html) continue;
                if (['jury-requests', 'clarification-details'].includes(key) && hasDraft(target)) continue;
                if (key === 'submission-status') replaceDetailFragment(target, html);
                else if (target.querySelector('details[open]') && key === 'clarifications') {
                    const open = [...target.querySelectorAll('details')].map((el, i) => (el.open ? i : -1));
                    target.innerHTML = html;
                    for (const [i, el] of target.querySelectorAll('details').entries()) {
                        if (open.includes(i)) el.open = true;
                    }
                } else target.innerHTML = html;
                rendered.set(key, html);
            }
            document.querySelector('.progress-track')?.classList.toggle('frozen', !!data.frozen);
            const updated = document.querySelector('[data-updated]');
            if (updated) {
                updated.textContent = `Last Update: ${new Date(data.now).toLocaleString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false })} CST`;
            }
            if (notifications && 'Notification' in window && Notification.permission === 'granted') {
                for (const row of document.querySelectorAll('.submissions-table tbody tr')) {
                    const id = row.querySelector('a')?.textContent;
                    const verdict = row.querySelector('.verdict')?.textContent.trim();
                    if (id && verdict && !/PENDING|JUDGING|COMPILING/.test(verdict) && !notified.has(id)) {
                        notified.add(id);
                        const notification = new Notification('Submission result', {
                            body: `${id}: ${verdict}`,
                            tag: `arena-${id}`,
                        });
                        notification.addEventListener('click', () => window.focus());
                    }
                }
            }
            filterTeams();
            clock();
            if (manual) hideError();
        } catch (error) {
            if (manual) showError(error.message);
            const updated = document.querySelector('[data-updated]');
            if (updated) updated.textContent = 'Connection interrupted — reconnecting…';
        } finally {
            polling = false;
        }
    }
    setInterval(
        () => refresh(),
        ['home', 'scoreboard', 'submission', 'clarifications', 'clarification', 'jury'].includes(view) ? 4000 : 15000,
    );
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refresh();
    });
    window.addEventListener('pagehide', () => {
        stopped = true;
    });
    window.addEventListener('pageshow', () => {
        stopped = false;
        refresh();
    });
    window.addEventListener('online', () => refresh());
    window.addEventListener('focus', () => refresh());
    document.querySelector('[data-refresh]')?.addEventListener('click', () => refresh(true));
    document.querySelector('[data-auto-refresh]')?.addEventListener('change', (event) => {
        if (event.currentTarget.checked) refresh(true);
    });
    const notify = document.querySelector('.notify-button');
    if (notify && 'Notification' in window) {
        notify.hidden = false;
        notify.addEventListener('click', async () => {
            if (notifications) {
                notifications = false;
                notify.textContent = 'Enable Notifications';
                return;
            }
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                for (const a of document.querySelectorAll('.submissions-table tbody tr td:first-child a')) {
                    notified.add(a.textContent);
                }
                notifications = true;
                notify.textContent = 'Disable Notifications';
            }
        });
    }
    const setProblem = (form, pid) => {
        const select = form.querySelector('[data-submit-problem]');
        if (pid && [...select.options].some((option) => option.value === String(pid))) select.value = String(pid);
        form.action = select.selectedOptions[0]?.dataset.submitUrl || form.action;
        const allowed = (select.selectedOptions[0]?.dataset.languages || '').split(',').filter(Boolean);
        const language = form.querySelector('[data-submit-language]');
        for (const option of language.options) option.hidden = option.disabled = !allowed.includes(option.value);
        if (!allowed.includes(language.value)) {
            language.value = [...language.options].find((option) => !option.disabled)?.value || '';
        }
        const submit = form.querySelector('button[type=submit]');
        if (submit) submit.disabled = !language.value || form.dataset.canSubmit !== 'true' || Date.now() + offset >= end;
    };
    const applyLanguage = (form, filename) => {
        const base = filename.split('.')[0].toUpperCase();
        const problem = [...form.querySelector('[data-submit-problem]').options].find((o) => o.dataset.label === base);
        if (problem) setProblem(form, problem.value);
        const language = form.querySelector('[data-submit-language]');
        const extension = filename.split('.').at(-1).toLowerCase();
        const matches = {
            cpp: ['cc.cc20', 'cc.cc17', 'cc.cc14', 'cc'],
            cc: ['cc.cc20', 'cc.cc17', 'cc'],
            c: ['c.c17', 'c'],
            py: ['py', 'pypy3', 'python.py3', 'python.pypy3', 'python'],
            java: ['java'],
            rs: ['rs', 'rust'],
            kt: ['kt', 'kotlin'],
        };
        let previous = '';
        try {
            previous = localStorage.getItem('hgnu-arena-language') || '';
        } catch {}
        const options = [...language.options].filter((o) => !o.disabled).map((o) => o.value);
        const candidates = [
            ...(matches[extension] || []).flatMap((id) => [
                id,
                ...options.filter((value) => value === id || value.startsWith(`${id}.`)),
            ]),
            ...[...language.options]
                .filter((option) => !option.disabled && option.dataset.extension === extension)
                .map((option) => option.value),
        ];
        if (candidates.includes(previous) && options.includes(previous)) language.value = previous;
        else {
            const found = candidates.find((id) => options.includes(id));
            if (found) language.value = found;
        }
    };
    for (const form of document.querySelectorAll('[data-submit-solution]')) {
        setProblem(form);
        const language = form.querySelector('[data-submit-language]');
        try {
            if ([...language.options].some((o) => !o.disabled && o.value === localStorage.getItem('hgnu-arena-language'))) {
                language.value = localStorage.getItem('hgnu-arena-language');
            }
        } catch {}
        form.querySelector('[data-submit-problem]').addEventListener('change', () => setProblem(form));
        form.querySelector('[data-source-file]').addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            applyLanguage(form, file.name);
            const info = form.querySelector('.submit-file-info');
            info.hidden = false;
            info.textContent = `${file.name} · ${file.size.toLocaleString()} bytes`;
        });
    }
    document.addEventListener('click', (event) => {
        const detail = event.target.closest('[data-arena-modal]');
        if (detail && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
            event.preventDefault();
            readDetail(detail.href);
            return;
        }
        const submit = event.target.closest('[data-open-submit]');
        if (submit && !submit.classList.contains('disabled')) {
            const dialog = document.getElementById('submit-modal');
            if (dialog) {
                event.preventDefault();
                setProblem(dialog.querySelector('form'), submit.dataset.problem);
                dialog.showModal();
            }
        }
        const clarify = event.target.closest('[data-open-clarification]');
        if (clarify) document.getElementById('clarification-modal')?.showModal();
        const close = event.target.closest('[data-close-dialog]');
        if (close) {
            const dialog = close.closest('dialog');
            if (dialog) dialog.close();
            else location.href = home;
        }
        const confirm = event.target.closest('[data-confirm]');
        // eslint-disable-next-line no-alert -- Confirm the contest action before sending it.
        if (confirm && !window.confirm(confirm.dataset.confirm)) event.preventDefault();
    });
    const previews = new WeakMap();
    document.addEventListener('input', (event) => {
        const input = event.target.closest('[data-clarification-input]');
        if (!input) return;
        const form = input.form;
        const preview = form.querySelector('[data-clarification-preview]');
        if (!preview) return;
        clearTimeout(previews.get(input));
        if (!input.value.trim()) {
            preview.textContent = 'Start typing to see a preview of your message';
            return;
        }
        const content = input.value;
        previews.set(
            input,
            setTimeout(async () => {
                try {
                    const body = new FormData();
                    body.set('operation', 'preview');
                    body.set('csrf', form.elements.csrf.value);
                    body.set('content', content);
                    const response = await fetch(`${home}/clarifications`, {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { Accept: 'application/json' },
                        body,
                        signal: AbortSignal.timeout(10000),
                    });
                    const data = await response.json();
                    if (response.ok && typeof data.html === 'string' && input.value === content) preview.innerHTML = data.html;
                } catch {
                    if (input.value === content) preview.textContent = content;
                }
            }, 300),
        );
    });
    const closeBackdrop = (event) => {
        const dialog = event.currentTarget;
        if (event.target === dialog && !busy) {
            const rect = dialog.getBoundingClientRect();
            if (
                event.clientX < rect.left
                || event.clientX > rect.right
                || event.clientY < rect.top
                || event.clientY > rect.bottom
            ) {
                dialog.close();
            }
        }
    };
    for (const dialog of document.querySelectorAll('dialog')) {
        dialog.addEventListener('click', closeBackdrop);
    }
    const parseResponse = async (response) => {
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error('The server did not confirm this action. Check your submissions before trying again.');
        }
        if (!response.ok || data.error) {
            throw new Error(data.error?.message || data.error || data.message || `Request failed (${response.status}).`);
        }
        return data;
    };
    document.addEventListener('submit', async (event) => {
        const form = event.target;
        if (!form.matches('[data-submit-solution], [data-arena-form], [data-rejudge]')) return;
        event.preventDefault();
        if (busy) return;
        const solution = form.matches('[data-submit-solution]');
        const target = form.querySelector('.form-error') || document.getElementById('arena-error');
        if (target) target.hidden = true;
        if (solution) {
            const file = form.querySelector('[data-source-file]').files[0];
            if (!file) return;
            const problem = form.querySelector('[data-submit-problem]').selectedOptions[0].textContent;
            const lang = form.querySelector('[data-submit-language]').selectedOptions[0]?.textContent;
            // eslint-disable-next-line no-alert -- Confirm the contest action before sending it.
            if (!window.confirm(`Submit ${file.name}\nProblem: ${problem}\nLanguage: ${lang}?`)) return;
        }
        busy = true;
        const button = form.querySelector('button[type=submit]');
        const label = button?.innerHTML;
        if (button) {
            button.disabled = true;
            button.textContent = 'Sending…';
        }
        try {
            const data = await parseResponse(
                await fetch(form.action || location.href, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    body: new FormData(form),
                }),
            );
            if (solution) {
                if (!data.rid) throw new Error('Submission confirmation is missing. Check Home before submitting again.');
                try {
                    localStorage.setItem('hgnu-arena-language', form.querySelector('[data-submit-language]').value);
                } catch {}
                location.href = `${home}?submitted=${encodeURIComponent(data.rid)}`;
            } else if (form.matches('[data-rejudge]')) {
                location.reload();
            } else location.href = data.redirect || location.href;
        } catch (error) {
            showError(error.message || 'Connection interrupted. Check your submissions before trying again.', target);
        } finally {
            busy = false;
            if (button) {
                button.disabled = false;
                button.innerHTML = label;
            }
        }
    });
    document.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-copy-source]');
        if (!button) return;
        const code = button.closest('.submission-source')?.querySelector('.source-code code');
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code.textContent);
            button.textContent = 'Copied';
        } catch {
            button.textContent = 'Select and copy';
        }
    });
})();
