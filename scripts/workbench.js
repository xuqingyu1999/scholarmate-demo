(function (global) {
    'use strict';

    const MODES = {
        patent: {
            label: '寻找专利',
            placeholder: '描述你的技术需求，例如：基层医院影像诊断效率提升',
            hint: '输入自然语言需求后，将进入专利搜索结果页。'
        },
        advisor: {
            label: '与数字学者对话',
            placeholder: '向我的数字学者提问，例如：这项技术适合我们试点吗？',
            hint: '将从已购许可和已加入顾问席位的数字学者中匹配回答。'
        }
    };

    const state = {
        mode: 'patent',
        sidebarOpen: true
    };

    function $(id) {
        return global.document && global.document.getElementById(id);
    }

    function getScholarMate() {
        return global.ScholarMate || (typeof ScholarMate !== 'undefined' ? ScholarMate : null);
    }

    function getUserManager() {
        return global.UserManager || (typeof UserManager !== 'undefined' ? UserManager : null);
    }

    function getInventorList() {
        return global.inventors || (typeof inventors !== 'undefined' ? inventors : []);
    }

    function getPatentList() {
        return global.patents || (typeof patents !== 'undefined' ? patents : []);
    }

    function escapeHtml(value) {
        const app = getScholarMate();
        if (app && typeof app.escapeHtml === 'function') {
            return app.escapeHtml(value);
        }
        const div = global.document.createElement('div');
        div.textContent = String(value || '');
        return div.innerHTML;
    }

    function formatDate(value) {
        if (!value) return '最近';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '最近';
        return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    }

    function getInventor(inventorId) {
        const list = getInventorList();
        return list.find(item => item.id === inventorId) || list[0] || {};
    }

    function getPatent(patentId) {
        if (typeof global.getPatentById === 'function') return global.getPatentById(patentId);
        if (typeof getPatentById === 'function') return getPatentById(patentId);
        return getPatentList().find(item => item.id === patentId) || {};
    }

    function getAvailableAdvisorAssets() {
        const manager = getUserManager();
        if (manager && typeof manager.getAvailableAdvisorAssets === 'function') {
            return manager.getAvailableAdvisorAssets();
        }
        const user = manager && manager.getUser ? manager.getUser() : null;
        const byPatent = new Map();
        const add = ({ patent, inventor, sourceLabel }) => {
            if (!patent || !patent.id || !inventor || !inventor.id) return;
            const existing = byPatent.get(patent.id) || {
                patentId: patent.id,
                inventorId: inventor.id,
                patent,
                inventor,
                sourceLabel: ''
            };
            existing.sourceLabel = existing.sourceLabel
                ? `${existing.sourceLabel} + ${sourceLabel}`
                : sourceLabel;
            byPatent.set(patent.id, existing);
        };
        (user && user.purchasedLicenses || []).forEach(id => {
            const patent = getPatentList().find(item => item.id === id);
            if (!patent || global.ScholarMateBusinessCore.isFreeSharedPatent(patent)) return;
            add({ patent, inventor: getInventor(patent.inventorId), sourceLabel: '已购许可' });
        });
        (user && user.digitalHumanSeats || []).forEach(seat => {
            const patent = getPatentList().find(item => item.id === seat.patentId)
                || getPatentList().find(item => item.inventorId === seat.inventorId);
            if (!patent) return;
            add({ patent, inventor: getInventor(seat.inventorId || patent.inventorId), sourceLabel: '顾问席位' });
        });
        return Array.from(byPatent.values());
    }

    function normalizeScore(score, index) {
        const numeric = Number(score || 0);
        if (numeric > 0) return Math.max(58, Math.min(98, numeric));
        return Math.max(62, 76 - index * 6);
    }

    function buildAdvisorPreview({ inventor, patent, question }) {
        const reply = global.ScholarMateBusinessCore.composeAdvisorReply({
            inventorName: inventor.name,
            patent,
            project: null,
            question
        });
        const compact = reply.replace(/\s+/g, ' ').trim();
        return compact.length > 78 ? `${compact.slice(0, 78)}...` : compact;
    }

    function toLocalHref(href) {
        const app = getScholarMate();
        if (app && typeof app.getMobileBottomNavHref === 'function') {
            return app.getMobileBottomNavHref(href);
        }
        return href;
    }

    function setResultsLayout(enabled) {
        if (global.document && global.document.body) {
            global.document.body.classList.toggle('workbench-has-results', !!enabled);
        }
    }

    function hydratePreferredLogo() {
        if (!global.document || typeof global.Image !== 'function') return;
        const logo = global.document.querySelector('.workbench-logo[data-preferred-src]');
        if (!logo) return;
        const preferredSrc = logo.getAttribute('data-preferred-src');
        if (!preferredSrc) return;
        const candidate = new global.Image();
        let settled = false;
        const timeout = global.setTimeout(() => {
            if (settled) return;
            settled = true;
            candidate.src = '';
        }, 900);
        candidate.onload = () => {
            if (settled) return;
            settled = true;
            global.clearTimeout(timeout);
            logo.src = preferredSrc;
            logo.classList.remove('workbench-logo--fallback-crop');
        };
        candidate.onerror = () => {
            if (settled) return;
            settled = true;
            global.clearTimeout(timeout);
        };
        candidate.src = preferredSrc;
    }

    function renderEmptyAdvisorNotice() {
        const result = $('workbenchResult');
        if (!result) return;
        setResultsLayout(true);
        result.innerHTML = `
            <div class="workbench-notice" role="status">
                <strong>您还没有可用数字学者</strong>
                <p>请先在寻找专利模式中购买资料/对话许可，或把合适的数字学者加入顾问席位。免费共享专利可浏览，加入席位后可作为长期数字学者使用。</p>
                <a class="btn btn--primary btn--sm" href="${escapeHtml(toLocalHref('patent-list.html'))}">前往寻找专利</a>
            </div>
        `;
    }

    function renderAdvisorCards(cards, query) {
        const result = $('workbenchResult');
        if (!result) return;
        if (!cards.length) {
            renderEmptyAdvisorNotice();
            return;
        }
        setResultsLayout(true);
        result.innerHTML = `
            <div class="workbench-candidates">
                <div class="workbench-candidates__head">
                    <span>我的数字学者中最相关的候选</span>
                    <small>Top ${cards.length}</small>
                </div>
                ${cards.map((card, index) => {
                    const encodedQuestion = encodeURIComponent(query || '');
                    return `
                    <article class="workbench-advisor-card">
                        <div class="workbench-advisor-card__avatar">
                            <img src="${escapeHtml(card.inventor.avatar || '')}" alt="${escapeHtml(card.inventor.name || '数字学者')}">
                        </div>
                        <div class="workbench-advisor-card__body">
                            <div class="workbench-advisor-card__title">
                                <strong>${escapeHtml(card.inventor.name || '数字学者')}</strong>
                                <span>相关度 ${normalizeScore(card.score, index)}%</span>
                            </div>
                            <div class="workbench-advisor-card__patent">${escapeHtml(card.patent.title || '')}</div>
                            <div class="workbench-advisor-card__source">${escapeHtml(card.sourceLabel || '数字学者资产')}</div>
                            <p>${escapeHtml(card.preview)}</p>
                        </div>
                        <button class="btn btn--primary btn--sm" type="button" onclick="ScholarMateWorkbench.startAdvisorChat('${escapeHtml(card.inventor.id)}', '${escapeHtml(card.patent.id)}', decodeURIComponent('${encodedQuestion}'))">深入交流</button>
                    </article>
                `;
                }).join('')}
            </div>
        `;
    }

    function rankAdvisorAssets(query, assets) {
        const manager = getUserManager();
        const user = manager && manager.getUser ? manager.getUser() : null;
        const patentsForRanking = assets.map(asset => asset.patent).filter(Boolean);
        return global.ScholarMateBusinessCore.rankPatentsHybrid({
            query,
            project: null,
            patents: patentsForRanking,
            user
        });
    }

    function renderAdvisorCandidates(query) {
        const assets = getAvailableAdvisorAssets();
        if (!assets.length) {
            renderEmptyAdvisorNotice();
            return [];
        }

        const ranked = rankAdvisorAssets(query, assets)
            .filter(item => assets.some(asset => asset.patentId === item.patentId))
            .slice(0, 3);
        const fallbackRanked = ranked.length ? ranked : assets.slice(0, 3).map((asset, index) => ({
            patentId: asset.patentId,
            inventorId: asset.inventorId,
            score: 76 - index * 6
        }));
        const cards = fallbackRanked.map(item => {
            const asset = assets.find(candidate => candidate.patentId === item.patentId);
            const patent = asset && asset.patent || getPatent(item.patentId);
            const inventor = asset && asset.inventor || getInventor(item.inventorId || patent.inventorId);
            return {
                inventor,
                patent,
                score: item.score,
                sourceLabel: asset && asset.sourceLabel,
                preview: buildAdvisorPreview({ inventor, patent, question: query || '请先介绍这项专利的价值和落地风险' })
            };
        }).filter(card => card.patent && card.patent.id && card.inventor && card.inventor.id);

        renderAdvisorCards(cards, query);
        return cards;
    }

    function renderSidebar() {
        const body = $('workbenchSidebarBody');
        if (!body) return;
        const manager = getUserManager();
        const user = manager && manager.getUser ? manager.getUser() : null;
        const verified = manager && manager.isVerified ? manager.isVerified() : false;
        const showVerificationCta = !user || !user.isLoggedIn || !verified;
        const verificationCtaHref = toLocalHref('user-center.html?return=index.html#enterprise-verification');
        const advisorAssets = getAvailableAdvisorAssets();
        const sessions = global.ChatSessions && global.ChatSessions.listAll ? global.ChatSessions.listAll().slice(0, 8) : [];
        const accountName = user && (user.companyName || user.name) ? (user.companyName || user.name) : '演示企业用户';
        const accountState = user && user.isLoggedIn ? (verified ? '已完成企业认证' : '企业账号未认证') : '未登录演示状态';

        body.innerHTML = `
            <section class="workbench-sidebar-section">
                <div class="workbench-sidebar-section__title">用户中心</div>
                <div class="workbench-account">
                    <div class="workbench-account__avatar">企</div>
                    <div>
                        <strong>${escapeHtml(accountName)}</strong>
                        <span>${escapeHtml(accountState)}</span>
                    </div>
                </div>
                <a class="workbench-sidebar-link" href="${escapeHtml(toLocalHref('user-center.html#account-settings'))}">账号信息与设置</a>
                ${showVerificationCta ? `<a class="workbench-sidebar-link workbench-verify-cta" href="${escapeHtml(verificationCtaHref)}"><strong>请先去企业认证</strong><span>完成认证后可购买会员、资料许可并提交交易意向</span></a>` : ''}
            </section>

            <section class="workbench-sidebar-section">
                <div class="workbench-sidebar-section__title">我的数字学者</div>
                ${advisorAssets.length ? advisorAssets.map(asset => {
                    const patent = asset.patent;
                    const inventor = asset.inventor || getInventor(asset.inventorId);
                    return `
                        <a class="workbench-license-link" href="${escapeHtml(toLocalHref(`chat.html?inventor=${encodeURIComponent(inventor.id)}&patent=${encodeURIComponent(patent.id)}`))}">
                            <strong>${escapeHtml(patent.title)}</strong>
                            <span>${escapeHtml(inventor.name || '数字学者')} · ${escapeHtml(asset.sourceLabel || '数字学者资产')}</span>
                        </a>
                    `;
                }).join('') : '<div class="workbench-empty">暂无可用数字学者</div>'}
            </section>

            ${state.mode === 'advisor' ? `
                <section class="workbench-sidebar-section">
                    <div class="workbench-sidebar-section__title">对话历史</div>
                    ${sessions.length ? sessions.map(session => {
                        const projectQuery = session.projectId ? `&project=${encodeURIComponent(session.projectId)}` : '';
                        const href = `chat.html?inventor=${encodeURIComponent(session.inventorId)}&patent=${encodeURIComponent(session.patentId || '')}${projectQuery}&session=${encodeURIComponent(session.sessionId)}`;
                        const encodedSessionId = encodeURIComponent(session.sessionId);
                        return `
                            <div class="workbench-history-row">
                                <a class="workbench-history-link" href="${escapeHtml(toLocalHref(href))}">
                                    <strong>${escapeHtml(session.title || '新的技术顾问对话')}</strong>
                                    <span>${escapeHtml(formatDate(session.updatedAt))}</span>
                                </a>
                                <button class="workbench-history-delete" type="button" onclick="ScholarMateWorkbench.deleteSession(decodeURIComponent('${encodedSessionId}'), event)" aria-label="删除对话 ${escapeHtml(session.title || '')}">删除</button>
                            </div>
                        `;
                    }).join('') : '<div class="workbench-empty">暂无对话历史</div>'}
                </section>
            ` : ''}
        `;
    }

    function setMode(mode) {
        if (!MODES[mode]) return;
        state.mode = mode;
        const input = $('workbenchInput');
        const result = $('workbenchResult');
        const patentTab = $('workbenchPatentTab');
        const advisorTab = $('workbenchAdvisorTab');
        if (input) input.placeholder = MODES[mode].placeholder;
        if (result) {
            result.innerHTML = `<div class="workbench-hint">${escapeHtml(MODES[mode].hint)}</div>`;
        }
        setResultsLayout(false);
        if (patentTab && advisorTab) {
            patentTab.classList.toggle('workbench-mode-tab--active', mode === 'patent');
            advisorTab.classList.toggle('workbench-mode-tab--active', mode === 'advisor');
            patentTab.setAttribute('aria-selected', mode === 'patent' ? 'true' : 'false');
            advisorTab.setAttribute('aria-selected', mode === 'advisor' ? 'true' : 'false');
        }
        if (global.document && global.document.body) {
            global.document.body.classList.toggle('workbench-mode-advisor', mode === 'advisor');
        }
        renderSidebar();
    }

    function submitInput() {
        const input = $('workbenchInput');
        const query = input ? input.value.trim() : '';
        if (!query) {
            if (input) input.focus();
            return;
        }
        if (state.mode === 'patent') {
            global.location.href = toLocalHref(`patent-list.html?search=${encodeURIComponent(query)}`);
            return;
        }
        renderAdvisorCandidates(query);
    }

    function startAdvisorChat(inventorId, patentId, question = '') {
        const params = new URLSearchParams({
            inventor: inventorId,
            patent: patentId
        });
        if (question) params.set('draft', question);
        global.location.href = toLocalHref(`chat.html?${params.toString()}`);
    }

    function deleteSession(sessionId, event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        if (!sessionId || !global.ChatSessions || typeof global.ChatSessions.clearSession !== 'function') return;
        if (typeof global.confirm === 'function' && !global.confirm('确定删除这条对话历史吗？')) return;
        global.ChatSessions.clearSession(sessionId);
        renderSidebar();
    }

    function toggleSidebar(force) {
        state.sidebarOpen = typeof force === 'boolean' ? force : !state.sidebarOpen;
        const shell = $('workbenchShell');
        const toggle = $('workbenchSidebarToggle');
        const overlay = $('workbenchSidebarOverlay');
        if (shell) shell.classList.toggle('workbench-shell--sidebar-collapsed', !state.sidebarOpen);
        if (toggle) toggle.setAttribute('aria-expanded', state.sidebarOpen ? 'true' : 'false');
        if (overlay) overlay.hidden = !state.sidebarOpen;
    }

    function resetCurrentMode() {
        const input = $('workbenchInput');
        if (input) {
            input.value = '';
            input.style.height = 'auto';
            input.focus();
        }
        setMode(state.mode);
    }

    function autoResizeInput() {
        const input = $('workbenchInput');
        if (!input) return;
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    }

    function bindEvents() {
        const form = $('workbenchInputForm');
        const input = $('workbenchInput');
        const overlay = $('workbenchSidebarOverlay');
        if (form) {
            form.addEventListener('submit', event => {
                event.preventDefault();
                submitInput();
            });
        }
        if (input) {
            input.addEventListener('input', autoResizeInput);
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submitInput();
                }
            });
        }
        if (overlay) overlay.addEventListener('click', () => toggleSidebar(false));
    }

    function init() {
        if (!$('workbenchShell')) return;
        if (global.ChatSessions && typeof global.ChatSessions.migrateLegacy === 'function') {
            global.ChatSessions.migrateLegacy();
        }
        hydratePreferredLogo();
        bindEvents();
        const params = new URLSearchParams(global.location.search || '');
        const initialMode = params.get('mode') === 'advisor' || global.location.hash === '#advisor' ? 'advisor' : 'patent';
        const restoredQuestion = params.get('q') || params.get('question') || '';
        setMode(initialMode);
        toggleSidebar(global.innerWidth ? global.innerWidth > 780 : true);
        if (initialMode === 'advisor' && restoredQuestion) {
            const input = $('workbenchInput');
            if (input) {
                input.value = restoredQuestion;
                autoResizeInput();
            }
            renderAdvisorCandidates(restoredQuestion);
        }
    }

    global.ScholarMateWorkbench = {
        init,
        setMode,
        submitInput,
        toggleSidebar,
        renderSidebar,
        renderAdvisorCandidates,
        startAdvisorChat,
        deleteSession,
        resetCurrentMode,
        __test: {
            getAvailableAdvisorAssets,
            rankAdvisorAssets,
            normalizeScore
        }
    };

    if (global.document) {
        global.document.addEventListener('DOMContentLoaded', init);
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
