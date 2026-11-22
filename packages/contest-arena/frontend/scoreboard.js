/* Followed teams and pinned headings mirror DOMjudge's public scoreboard. */
(() => {
    'use strict';
    if (!document.querySelector('.scoreboard-table')) return;
    const key = `hgnu-arena-favorites:${location.pathname.split('/arena')[0]}`;
    const followed = new Set();
    try {
        const saved = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(saved)) {
            for (const id of saved.slice(0, 1000).filter((value) => /^-?\d+$/.test(String(value)))) {
                followed.add(String(id));
            }
        }
    } catch {
    /* Browser storage can be disabled. */
    }
    const search = document.getElementById('team-filter');
    const affiliation = document.getElementById('affiliation-filter');
    const category = document.getElementById('category-filter');
    const teamDialog = document.getElementById('team-dialog');
    function fallbackAvatar(image) {
        if (
            !(image instanceof HTMLImageElement)
            || !image.hasAttribute('data-user-avatar')
            || image.dataset.avatarFallback
        ) {
            return;
        }
        image.dataset.avatarFallback = '1';
        image.src = '/arena-assets/logo/hgnu-logo.png';
    }
    document.addEventListener('error', (event) => fallbackAvatar(event.target), true);
    let pinned, pinnedTable, pinSource, frame;
    const mainRows = (table) => [
        ...(table.querySelector('[data-scoreboard-main]')?.querySelectorAll('[data-scoreboard-row]') || []),
    ];
    const problemRow = (row) =>
        row.nextElementSibling?.hasAttribute('data-team-problems') ? row.nextElementSibling : null;
    function updateDialog(row) {
        if (!row || !teamDialog) return;
        const values = {
            name: row.dataset.teamLabel,
            affiliation: row.dataset.affiliation,
            rank: row.dataset.rank,
            solved: row.dataset.solved,
            penalty: `${row.dataset.penalty} minutes`,
            category: row.dataset.category,
            members: row.dataset.members ? `Members: ${row.dataset.members}` : '',
        };
        for (const [field, text] of Object.entries(values)) {
            const target = teamDialog.querySelector(`[data-team-dialog-${field}]`);
            if (target) target.textContent = text || '';
        }
        teamDialog.dataset.teamId = row.dataset.teamId;
    }
    function pinPosition() {
        frame = null;
        if (!pinned || !pinSource || !pinnedTable || !pinSource.isConnected || !pinSource.offsetWidth) {
            if (pinned) pinned.hidden = true;
            return;
        }
        const head = pinSource.tHead.getBoundingClientRect();
        const table = pinSource.getBoundingClientRect();
        const wrapper = pinSource.closest('.scoreboard-scroll').getBoundingClientRect();
        const top = document.querySelector('.navbar')?.getBoundingClientRect().bottom || 0;
        pinned.hidden = head.top >= top || table.bottom <= top + head.height;
        const left = Math.max(wrapper.left, table.left);
        const right = Math.min(wrapper.right, table.right);
        pinned.style.top = `${top}px`;
        pinned.style.left = `${left}px`;
        pinned.style.width = `${Math.max(0, right - left)}px`;
        pinnedTable.style.transform = `translateX(${table.left - left}px)`;
    }
    const schedulePin = () => {
        frame ||= requestAnimationFrame(pinPosition);
    };
    function rebuildPin() {
        pinSource = document.getElementById('scoreboard');
        if (!pinSource?.offsetWidth) {
            if (pinned) pinned.hidden = true;
            return;
        }
        if (!pinned) {
            pinned = document.createElement('div');
            pinned.className = 'pinned-scoreheader';
            pinned.setAttribute('aria-hidden', 'true');
            pinned.hidden = true;
            document.body.append(pinned);
        }
        pinnedTable = document.createElement('table');
        pinnedTable.className = 'scoreboard-table desktop-scoreboard';
        const head = pinSource.tHead.cloneNode(true);
        const originals = [...pinSource.tHead.querySelectorAll('th')];
        for (const [i, cell] of [...head.querySelectorAll('th')].entries()) {
            cell.removeAttribute('colspan');
            cell.removeAttribute('id');
            const width = `${originals[i].getBoundingClientRect().width}px`;
            cell.style.width = width;
            cell.style.minWidth = width;
            cell.style.maxWidth = width;
        }
        pinnedTable.style.width = `${pinSource.getBoundingClientRect().width}px`;
        pinnedTable.append(head);
        pinned.replaceChildren(pinnedTable);
        pinSource.closest('.scoreboard-scroll').onscroll = schedulePin;
        pinPosition();
    }
    function refreshBoard() {
        for (const image of document.querySelectorAll('img[data-user-avatar]')) {
            if (image.complete && !image.naturalWidth) fallbackAvatar(image);
        }
        const text = (search?.value || '').trim().toLocaleLowerCase();
        const school = affiliation?.value || '';
        const group = category?.value || '';
        let visible = 0;
        let total = 0;
        for (const table of document.querySelectorAll('#scoreboard, #scoreboard-mobile')) {
            const rows = mainRows(table);
            const favorites = table.querySelector('[data-scoreboard-favorites]');
            favorites?.replaceChildren();
            let count = 0;
            let previousRank = null;
            for (const row of rows) {
                row.hidden =
                    !row.dataset.teamName.includes(text)
                    || (!!school && row.dataset.affiliation !== school)
                    || (!!group && row.dataset.category !== group);
                const pair = problemRow(row);
                const selected = followed.has(row.dataset.teamId);
                if (pair) {
                    pair.hidden = row.hidden;
                    pair.classList.toggle('followed-team', selected);
                }
                row.classList.toggle('followed-team', selected);
                for (const heart of row.querySelectorAll('[data-favorite]')) {
                    heart.setAttribute('aria-pressed', String(selected));
                    heart.setAttribute('aria-label', `${selected ? 'Unfollow' : 'Follow'} ${row.dataset.teamLabel}`);
                    heart.title = selected ? 'Unfollow this team' : 'Follow this team';
                }
                if (row.hidden) continue;
                count++;
                const rank = row.dataset.rank;
                const label = row.querySelector('[data-rank-label]') || row.querySelector('.rank');
                if (label) label.textContent = rank === previousRank && rank !== '*' ? '' : rank;
                previousRank = rank;
                if (selected && favorites && row.querySelector('[data-favorite]')) {
                    const copy = row.cloneNode(true);
                    copy.classList.add('pinned-team');
                    const rankLabel = copy.querySelector('[data-rank-label]') || copy.querySelector('.rank');
                    if (rankLabel) rankLabel.textContent = rank;
                    favorites.append(copy);
                    if (pair) favorites.append(pair.cloneNode(true));
                }
            }
            const noMatches = table.querySelector('.score-no-matches');
            if (noMatches) noMatches.hidden = count > 0 || rows.length === 0;
            if (table.id === 'scoreboard') {
                visible = count;
                total = rows.length;
            }
        }
        const counter = document.querySelector('[data-team-count]');
        if (counter) counter.textContent = visible === total ? `${total} teams` : `${visible} / ${total} teams`;
        const filtered = document.querySelector('[data-filter-label]');
        if (filtered) filtered.textContent = text || school || group ? 'Filtered' : 'Filter';
        if (teamDialog?.open) {
            updateDialog(
                [...document.querySelectorAll('[data-scoreboard-row]')].find(
                    (row) => row.dataset.teamId === teamDialog.dataset.teamId,
                ),
            );
        }
        rebuildPin();
    }
    for (const input of [search, affiliation, category]) {
        input?.addEventListener(input === search ? 'input' : 'change', refreshBoard);
    }
    document.querySelector('[data-clear-filters]')?.addEventListener('click', () => {
        for (const input of [search, affiliation, category]) if (input) input.value = '';
        refreshBoard();
        search?.focus();
    });
    document.addEventListener('click', (event) => {
        const heart = event.target.closest('[data-favorite]');
        if (heart) {
            const id = heart.dataset.favorite;
            if (!/^-?\d+$/.test(id)) return;
            if (followed.has(id)) followed.delete(id);
            else followed.add(id);
            try {
                localStorage.setItem(key, JSON.stringify([...followed]));
            } catch {}
            refreshBoard();
        }
        const team = event.target.closest('[data-team-dialog]');
        if (team) {
            updateDialog(team.closest('[data-scoreboard-row]'));
            if (teamDialog && !teamDialog.open) teamDialog.showModal();
        }
    });
    window.addEventListener('scroll', schedulePin, { passive: true });
    window.addEventListener('resize', rebuildPin);
    window.arenaScoreboard = {
        refresh: refreshBoard,
        autoRefreshEnabled: () => document.querySelector('[data-auto-refresh]')?.checked !== false,
    };
    refreshBoard();
})();
