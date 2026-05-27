/**
 * ScholarMate 专利交易平台 - 全局脚本
 */

const ScholarMate = {
    // 初始化
    init() {
        this.migrateClientStorageForCatalog();
        this.bindEvents();
        this.initComponents();
        this.handleURLParams();
    },

    // 事件绑定
    catalogVersionKey: 'scholarmate_catalog_version',

    getCatalogStorageVersion() {
        const patentIds = (typeof patents !== 'undefined' ? patents : []).map(patent => patent.id).join(',');
        const inventorIds = (typeof inventors !== 'undefined' ? inventors : []).map(inventor => inventor.id).join(',');
        return `cityu:${patentIds}::${inventorIds}`;
    },

    readStorageJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            console.warn(`Failed to read ${key}:`, error);
            return fallback;
        }
    },

    writeStorageJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },

    migrateClientStorageForCatalog() {
        if (typeof localStorage === 'undefined') return false;
        const nextVersion = this.getCatalogStorageVersion();
        if (localStorage.getItem(this.catalogVersionKey) === nextVersion) return false;

        const validPatentIds = new Set((typeof patents !== 'undefined' ? patents : []).map(patent => patent.id));
        const validInventorIds = new Set((typeof inventors !== 'undefined' ? inventors : []).map(inventor => inventor.id));
        const hasValidPatent = patentId => !patentId || validPatentIds.has(patentId);
        const hasValidInventor = inventorId => !inventorId || validInventorIds.has(inventorId);

        const user = this.readStorageJson('scholarmate_user', null);
        if (user && typeof user === 'object') {
            if (Array.isArray(user.purchasedLicenses)) {
                user.purchasedLicenses = user.purchasedLicenses.filter(id => validPatentIds.has(id));
            }
            if (user.licensePurchasedAt && typeof user.licensePurchasedAt === 'object') {
                user.licensePurchasedAt = Object.fromEntries(
                    Object.entries(user.licensePurchasedAt).filter(([id]) => validPatentIds.has(id))
                );
            }
            if (Array.isArray(user.digitalHumanSeats)) {
                user.digitalHumanSeats = user.digitalHumanSeats.filter(seat => (
                    seat &&
                    hasValidInventor(seat.inventorId) &&
                    hasValidPatent(seat.patentId)
                ));
            }
            this.writeStorageJson('scholarmate_user', user);
        }

        const sessions = this.readStorageJson('scholarmate_chat_sessions_v2', null);
        if (Array.isArray(sessions)) {
            this.writeStorageJson('scholarmate_chat_sessions_v2', sessions.filter(session => (
                session &&
                hasValidInventor(session.inventorId) &&
                hasValidPatent(session.patentId)
            )));
        }

        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index);
            if (key && key.startsWith('chat_history_')) {
                localStorage.removeItem(key);
            }
        }

        const projects = this.readStorageJson('scholarmate_demand_projects', null);
        if (Array.isArray(projects)) {
            const cleanedProjects = projects.map(project => {
                if (!project || typeof project !== 'object') return project;
                const nextProject = Object.assign({}, project);
                if (nextProject.matchedPatentId && !validPatentIds.has(nextProject.matchedPatentId)) {
                    nextProject.matchedPatentId = '';
                }
                if (Array.isArray(nextProject.recommendations)) {
                    nextProject.recommendations = nextProject.recommendations.filter(item => (
                        item && validPatentIds.has(item.patentId)
                    ));
                }
                return nextProject;
            });
            this.writeStorageJson('scholarmate_demand_projects', cleanedProjects);
        }

        const intents = this.readStorageJson('scholarmate_trade_intents', null);
        if (Array.isArray(intents)) {
            this.writeStorageJson('scholarmate_trade_intents', intents.filter(intent => (
                intent && hasValidPatent(intent.patentId)
            )));
        }

        localStorage.setItem(this.catalogVersionKey, nextVersion);
        return true;
    },

    bindEvents() {
        // 移动端菜单切换
        const menuToggle = document.querySelector('.menu-toggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => this.toggleMobileMenu());
        }

        // 搜索表单提交
        const searchForm = document.querySelector('.search-form');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => this.handleSearchSubmit(e));
        }

        // Tab 切换
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.handleTabClick(tab));
        });

        // 筛选选项（专利列表页）
        document.querySelectorAll('.patent-list-filter__option').forEach(option => {
            option.addEventListener('click', () => this.handlePatentFilterClick(option));
        });

        // 表单提交
        const publishForm = document.querySelector('.publish-form');
        if (publishForm) {
            publishForm.addEventListener('submit', (e) => this.handlePublishSubmit(e));
        }

        // 图片上传预览
        const imageInput = document.querySelector('input[name="images"]');
        if (imageInput) {
            imageInput.addEventListener('change', (e) => this.handleImagePreview(e));
        }
    },

    // 组件初始化
    initComponents() {
        this.initSearch();
        this.applyMobilePreviewMode();
        this.renderMobilePreviewEntry();
        this.renderPatentCatalogCards();
        this.initDemandUpload();
        this.initFavoriteButtons();
        this.hydratePatentCards();
        this.updateNavbarAuth();
        this.renderMobilePreviewEntry();
        this.showMembershipBanner();
        this.renderMobileBottomNav();
    },

    // 搜索功能
    initSearch() {
        const searchInputs = document.querySelectorAll('.search-input');
        searchInputs.forEach(input => {
            input.addEventListener('input', this.debounce((e) => {
                // 搜索建议功能可以在这里实现
                console.log('Search query:', e.target.value);
            }, 300));
        });
    },

    // 防抖函数
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // 处理 URL 参数
    handleURLParams() {
        const params = new URLSearchParams(window.location.search);
        const searchQuery = params.get('search');
        if (searchQuery) {
            const searchInput = document.querySelector('.search-input');
            if (searchInput) {
                searchInput.value = searchQuery;
            }
            this.filterPatents(searchQuery);
        }
    },

    // 过滤专利列表
    async filterPatents(query) {
        const statusElement = document.querySelector('.semantic-search-status');
        if (statusElement) statusElement.textContent = '正在加载语义推荐模型...';

        const quickItems = ScholarMateBusinessCore.rankPatentsHybrid({
            query,
            project: null,
            patents,
            user: UserManager.getUser()
        });
        this.applyPatentRanking(quickItems, '正在加载语义推荐模型，已先显示本地 Top 5...', {
            mode: 'search',
            minScore: 20
        });

        const result = await this.rankPatents(query, null);
        this.applyPatentRanking(result.items, this.renderSemanticStatus(result, query), {
            mode: 'search',
            minScore: 20
        });
    },

    applyPatentRanking(items, statusHtml, options = {}) {
        const patentCards = document.querySelectorAll('.patent-card');
        const list = document.querySelector('.patent-list');
        const statusElement = document.querySelector('.semantic-search-status');
        const countElement = document.querySelector('.results-count');
        const allItems = Array.isArray(items) ? items : [];
        const minScore = typeof options.minScore === 'number' ? options.minScore : 20;
        const relevantItems = allItems.filter(item => Number(item.score || 0) >= minScore).slice(0, 5);
        const orderMap = new Map(relevantItems.map((item, index) => [item.patentId, { index, item }]));

        Array.from(patentCards)
            .sort((a, b) => {
                const aId = a.dataset.patentId || a.querySelector('.patent-card__favorite')?.dataset.patentId;
                const bId = b.dataset.patentId || b.querySelector('.patent-card__favorite')?.dataset.patentId;
                return (orderMap.get(aId)?.index ?? 999) - (orderMap.get(bId)?.index ?? 999);
            })
            .forEach(card => {
                const patentId = card.dataset.patentId || card.querySelector('.patent-card__favorite')?.dataset.patentId;
                const match = orderMap.get(patentId);
                card.style.display = match ? '' : 'none';
                if (list && card.parentElement === list) list.appendChild(card);
                this.renderSearchReason(card, match && match.item);
                if (options.project && match) {
                    this.applyProjectContextToCard(card, options.project.id);
                }
            });

        if (statusElement && statusHtml) {
            const emptyHint = relevantItems.length
                ? ''
                : ' 未找到足够相关的专利，建议上传完整需求文本获得更准确推荐。';
            statusElement.innerHTML = `${statusHtml}${this.escapeHtml(emptyHint)}`;
        }

        if (countElement) {
            if (options.mode === 'demand') {
                countElement.textContent = relevantItems.length
                    ? `需求推荐 Top ${relevantItems.length}（共 ${allItems.length} 件参与匹配）`
                    : '暂无足够相关的需求推荐';
            } else {
                countElement.textContent = relevantItems.length
                    ? `推荐 Top ${relevantItems.length}（共 ${allItems.length} 件参与匹配）`
                    : '暂无足够相关的专利';
            }
        }
    },

    applyProjectContextToCard(card, projectId) {
        const patentId = card.dataset.patentId || card.querySelector('.patent-card__favorite')?.dataset.patentId;
        if (!patentId || !projectId) return;
        const detailLink = card.querySelector('.patent-card__title a');
        if (detailLink) {
            detailLink.href = this.getMobileBottomNavHref(`patent-detail.html?id=${encodeURIComponent(patentId)}&project=${encodeURIComponent(projectId)}`);
        }
    },

    async rankPatents(query, project) {
        if (window.ScholarMateSemanticSearch) {
            return window.ScholarMateSemanticSearch.rank({
                query,
                project,
                patents,
                user: UserManager.getUser()
            });
        }
        return {
            usedSemanticModel: false,
            notice: '语义模型未加载，已使用本地规则推荐。',
            items: ScholarMateBusinessCore.rankPatentsHybrid({ query, project, patents, user: UserManager.getUser() })
        };
    },

    renderSemanticStatus(result, query) {
        const notice = result.notice || '已按自然语言相关度排序';
        const retryButton = result.retryable
            ? ' <button class="btn btn--ghost btn--sm" onclick="ScholarMate.retrySemanticSearch()">重试语义模型</button>'
            : '';
        return `${this.escapeHtml(notice)}${retryButton}`;
    },

    retrySemanticSearch(query) {
        if (window.ScholarMateSemanticSearch && typeof window.ScholarMateSemanticSearch.retry === 'function') {
            window.ScholarMateSemanticSearch.retry();
        }
        const nextQuery = query || document.querySelector('.search-input')?.value || '';
        if (nextQuery) this.filterPatents(nextQuery);
    },

    renderSearchReason(card, item) {
        let reason = card.querySelector('.patent-card__match-reason');
        if (!item) {
            if (reason) reason.remove();
            return;
        }
        if (!reason) {
            reason = document.createElement('div');
            reason.className = 'patent-card__match-reason';
            card.querySelector('.patent-card__body')?.appendChild(reason);
        }
        reason.textContent = `${item.score}% 匹配：${item.explanations.slice(0, 2).join('；')}`;
    },

    initDemandUpload() {
        const textInput = document.getElementById('demandTextInput');
        const fileInput = document.getElementById('demandTextFile');
        const dropzone = document.querySelector('.demand-upload-dropzone');
        const createBtn = document.getElementById('createDemandRecommendationBtn');
        const clearBtn = document.getElementById('clearDemandTextBtn');
        if (!textInput || !fileInput || !dropzone || !createBtn || !clearBtn) return;

        const refreshPreview = () => this.renderDemandUploadPreview(textInput.value);
        textInput.addEventListener('input', this.debounce(refreshPreview, 120));
        fileInput.addEventListener('change', event => this.readDemandTextFile(event.target.files && event.target.files[0]));
        createBtn.addEventListener('click', () => this.createDemandRecommendationFromText());
        clearBtn.addEventListener('click', () => {
            textInput.value = '';
            fileInput.value = '';
            this.renderDemandUploadPreview('');
        });

        ['dragenter', 'dragover'].forEach(type => {
            dropzone.addEventListener(type, event => {
                event.preventDefault();
                dropzone.classList.add('demand-upload-dropzone--active');
            });
        });
        ['dragleave', 'drop'].forEach(type => {
            dropzone.addEventListener(type, event => {
                event.preventDefault();
                dropzone.classList.remove('demand-upload-dropzone--active');
            });
        });
        dropzone.addEventListener('drop', event => {
            const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
            this.readDemandTextFile(file);
        });
    },

    readDemandTextFile(file) {
        if (!file) return;
        const isTextFile = /\.(txt|md)$/i.test(file.name || '');
        if (!isTextFile) {
            this.setDemandUploadMessage('当前只支持 .txt / .md。Word 或 PDF 请先复制正文粘贴。', true);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const textInput = document.getElementById('demandTextInput');
            if (textInput) {
                textInput.value = String(reader.result || '').slice(0, 5000);
                this.renderDemandUploadPreview(textInput.value);
            }
        };
        reader.onerror = () => this.setDemandUploadMessage('文件读取失败，请复制正文后粘贴。', true);
        reader.readAsText(file, 'utf-8');
    },

    setDemandUploadMessage(message, isError = false) {
        const preview = document.getElementById('demandUploadPreview');
        const actions = document.getElementById('demandUploadActions');
        if (!preview || !actions) return;
        preview.hidden = false;
        actions.hidden = true;
        preview.innerHTML = `<div class="demand-upload-preview__message ${isError ? 'demand-upload-preview__message--error' : ''}">${this.escapeHtml(message)}</div>`;
    },

    renderDemandUploadPreview(text) {
        const preview = document.getElementById('demandUploadPreview');
        const actions = document.getElementById('demandUploadActions');
        if (!preview || !actions) return;
        if (!String(text || '').trim()) {
            preview.hidden = true;
            actions.hidden = true;
            preview.innerHTML = '';
            return;
        }

        const draft = ScholarMateBusinessCore.parseDemandText(text);
        preview.hidden = false;
        actions.hidden = false;
        preview.innerHTML = `
            <div class="demand-upload-preview__grid">
                <div>
                    <span class="demand-upload-preview__label">需求名称</span>
                    <strong>${this.escapeHtml(draft.title)}</strong>
                </div>
                <div>
                    <span class="demand-upload-preview__label">推断行业</span>
                    <strong>${this.escapeHtml(draft.industry)}</strong>
                </div>
                <div>
                    <span class="demand-upload-preview__label">落地阶段</span>
                    <strong>${this.escapeHtml(draft.stage)}</strong>
                </div>
            </div>
            <p class="demand-upload-preview__summary">${this.escapeHtml(draft.summary || draft.description)}</p>
        `;
    },

    async createDemandRecommendationFromText() {
        const textInput = document.getElementById('demandTextInput');
        const rawText = textInput ? textInput.value.trim() : '';
        if (!rawText) {
            this.setDemandUploadMessage('请先上传或粘贴需求文本。', true);
            return;
        }

        let project;
        try {
            const draft = ScholarMateBusinessCore.parseDemandText(rawText);
            project = UserManager.createDemandProject(draft);
        } catch (error) {
            this.setDemandUploadMessage(error.message || '需求项目创建失败，请检查会员项目额度。', true);
            return;
        }

        const query = `${project.title} ${project.industry} ${project.stage} ${project.description} ${project.companyContext || ''}`;
        const quickItems = ScholarMateBusinessCore.rankPatentsHybrid({
            query,
            project,
            patents,
            user: UserManager.getUser()
        });
        project.recommendations = quickItems;
        UserManager.updateDemandProject(project);
        this.applyPatentRanking(quickItems, this.renderDemandProjectStatus(project, '正在加载语义推荐模型，已先显示需求 Top 5...'), {
            mode: 'demand',
            project,
            minScore: 20
        });

        const result = await this.rankPatents(query, project);
        project.recommendations = result.items;
        UserManager.updateDemandProject(project);
        this.applyPatentRanking(result.items, this.renderDemandProjectStatus(project, result.notice || '已按需求文本生成推荐'), {
            mode: 'demand',
            project,
            minScore: 20
        });
        this.renderDemandUploadPreview(rawText);
        this.showToast('已创建技术需求项目并生成推荐');
    },

    renderDemandProjectStatus(project, message) {
        const href = this.getMobileBottomNavHref('user-center.html#demand-projects');
        return `${this.escapeHtml(message)} <a class="btn btn--ghost btn--sm" href="${this.escapeHtml(href)}">查看需求项目</a>`;
    },

    hydratePatentCards() {
        document.querySelectorAll('.patent-card').forEach(card => {
            const patentId = card.dataset.patentId || card.querySelector('.patent-card__favorite')?.dataset.patentId;
            if (!patentId) return;
            const patent = getPatentById(patentId);
            const priceEl = card.querySelector('.patent-card__price');
            if (priceEl) {
                priceEl.textContent = ScholarMateBusinessCore.getPatentLicenseLabel(patent);
            }
        });
    },

    renderPatentCatalogCards() {
        const list = document.querySelector('.patent-list');
        if (!list || !document.querySelector('.patent-list-search')) return;
        const existingIds = new Set(Array.from(list.querySelectorAll('.patent-card')).map(card => card.dataset.patentId));
        patents.forEach((patent, index) => {
            if (existingIds.has(patent.id)) return;
            list.insertAdjacentHTML('beforeend', this.createPatentCardHtml(patent, index + 1));
        });
        const countElement = document.querySelector('.results-count');
        if (countElement && !new URLSearchParams(window.location.search).get('search')) {
            countElement.textContent = `共找到 ${patents.length} 件专利`;
        }
    },

    createPatentMediaHtml(patent, variant = 'card') {
        const mediaUrl = patent.imageUrl || '';
        const isImage = /\.(png|jpg|jpeg|webp)(\?.*)?$/i.test(mediaUrl);
        const alt = `${patent.publicationNumber || patent.id} 专利预览`;
        if (isImage) {
            return `<img src="${this.escapeHtml(mediaUrl)}" alt="${this.escapeHtml(alt)}" class="patent-card__image">`;
        }
        const href = patent.pdfUrl || patent.sourceUrl || '#';
        const label = variant === 'detail' ? '公开文本 / PDF' : (patent.sourceName || '公开来源');
        return `
            <a class="patent-document-preview patent-document-preview--${this.escapeHtml(variant)}" href="${this.escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="打开${this.escapeHtml(patent.publicationNumber || patent.id)}公开文本">
                <span class="patent-document-preview__source">${label}</span>
                <strong>${this.escapeHtml(patent.publicationNumber || patent.id)}</strong>
                <small>${this.escapeHtml(patent.legalStatus || patent.sourceName || '公开来源')}</small>
            </a>
        `;
    },

    createPatentCardHtml(patent, index) {
        const inventor = inventors.find(item => item.id === patent.inventorId) || inventors[0];
        const licenseLabel = ScholarMateBusinessCore.getPatentLicenseLabel(patent);
        const priceHtml = ScholarMateBusinessCore.isFreeSharedPatent(patent)
            ? ''
            : `<div class="patent-card__price">${this.escapeHtml(licenseLabel)}</div>`;
        const sourceHtml = `
            <div class="patent-card__source">
                <span>${this.escapeHtml(patent.sourceName || 'CityUHK Scholars')}</span>
                <span>${this.escapeHtml(patent.leadInventor || inventor.name)}</span>
                <span>${this.escapeHtml(patent.assignee || inventor.affiliation || '')}</span>
                ${patent.sourceUrl ? `<a href="${this.escapeHtml(patent.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看公开来源</a>` : ''}
            </div>`;
        const tag = ScholarMateBusinessCore.isFreeSharedPatent(patent) ? '试用共享' : '资料/对话许可';
        return `
            <article class="patent-card" data-patent-id="${this.escapeHtml(patent.id)}">
                <div class="patent-card__image-wrapper">
                    ${this.createPatentMediaHtml(patent, 'card')}
                    <span class="patent-card__tag">${tag}</span>
                </div>
                <div class="patent-card__body">
                    <div class="patent-card__header">
                        <h3 class="patent-card__title">
                            <a href="patent-detail.html?id=${encodeURIComponent(patent.id)}">${this.escapeHtml(patent.title)}</a>
                        </h3>
                        <span class="patent-card__favorite" data-patent-id="${this.escapeHtml(patent.id)}" role="button" aria-label="收藏" tabindex="0">♡</span>
                    </div>
                    <p class="patent-card__desc">${this.escapeHtml(patent.summary)}</p>
                    <div class="patent-card__meta">
                        <div class="patent-card__info">
                            <span class="patent-card__info-item">${this.escapeHtml(patent.field)}</span>
                            <span class="patent-card__info-item">${this.escapeHtml(patent.publicationNumber || patent.id)}</span>
                            <span class="patent-card__info-item">${this.escapeHtml(patent.industry)}</span>
                        </div>
                        ${priceHtml}
                    </div>
                    ${sourceHtml}
                </div>
                <div class="patent-card__chat">
                    <button class="patent-card__chat-btn" onclick="ScholarMate.handleListChatClick('${this.escapeHtml(inventor.id)}', '${this.escapeHtml(patent.id)}', '${this.escapeHtml(inventor.name)}')" title="与${this.escapeHtml(inventor.name)}对话">
                        <img src="${this.escapeHtml(inventor.avatar)}" alt="${this.escapeHtml(inventor.name)}" class="patent-card__chat-avatar">
                        <span class="patent-card__chat-label">问教授</span>
                    </button>
                </div>
            </article>
        `;
    },

    // 移动端菜单切换
    toggleMobileMenu() {
        const navMenu = document.querySelector('.navbar__menu');
        if (navMenu) {
            navMenu.classList.toggle('navbar__menu--open');
        }
    },

    // 搜索提交处理
    handleSearchSubmit(e) {
        e.preventDefault();
        const searchInput = e.target.querySelector('.search-input');
        if (searchInput && searchInput.value.trim()) {
            window.location.href = `patent-list.html?search=${encodeURIComponent(searchInput.value.trim())}`;
        }
    },

    // Tab 切换
    handleTabClick(tab) {
        const tabId = tab.dataset.tab;
        const parent = tab.closest('.tabs-container');
        const contentScope = parent && parent.classList.contains('tabs-container--my-patents')
            ? document.getElementById('my-patents')
            : parent;
        if (!parent || !contentScope) return;

        // 切换 Tab 样式
        parent.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
        tab.classList.add('tab--active');

        // 切换内容
        contentScope.querySelectorAll(':scope > .tab-content').forEach(content => {
            content.classList.remove('tab-content--active');
            if (content.id === tabId) {
                content.classList.add('tab-content--active');
            }
        });
    },

    // 专利列表筛选处理
    handlePatentFilterClick(option) {
        // 1. 更新激活状态
        const filterGroup = option.closest('.patent-list-filter');
        filterGroup.querySelectorAll('.patent-list-filter__option').forEach(opt => {
            opt.classList.remove('patent-list-filter__option--active');
        });
        option.classList.add('patent-list-filter__option--active');

        // 2. 获取当前筛选条件
        const activeFilters = {};
        document.querySelectorAll('.patent-list-filter').forEach(group => {
            const label = group.querySelector('.patent-list-filter__label').textContent;
            const active = group.querySelector('.patent-list-filter__option--active');
            if (active && !active.textContent.includes('全部') && !active.textContent.includes('不限')) {
                activeFilters[label] = active.textContent;
            }
        });

        // 3. 过滤专利卡片
        this.applyPatentFilters(activeFilters);
    },

    // 应用筛选条件
    applyPatentFilters(filters) {
        const patentCards = document.querySelectorAll('.patent-card');
        let visibleCount = 0;

        patentCards.forEach(card => {
            let show = true;

            // 专利类型
            if (filters['专利类型：']) {
                const tag = card.querySelector('.patent-card__tag')?.textContent;
                if (tag !== filters['专利类型：']) show = false;
            }

            // 技术领域
            if (filters['技术领域：']) {
                const patentId = card.dataset.patentId || card.querySelector('.patent-card__favorite')?.dataset.patentId || '';
                const patent = patentId ? getPatentById(patentId) : null;
                const searchable = patent
                    ? `${patent.field || ''} ${patent.industry || ''} ${patent.summary || ''} ${patent.title || ''}`
                    : Array.from(card.querySelectorAll('.patent-card__info-item')).map(item => item.textContent).join(' ');
                if (!searchable.includes(filters['技术领域：'])) show = false;
            }

            // 资料/对话许可价格
            if (filters['价格区间：']) {
                const patentId = card.dataset.patentId || card.querySelector('.patent-card__favorite')?.dataset.patentId || '';
                const patent = patentId ? getPatentById(patentId) : null;
                const priceText = card.querySelector('.patent-card__price')?.textContent || '';
                const price = patent ? ScholarMateBusinessCore.getPatentLicensePrice(patent) : (parseInt(priceText.replace(/[^0-9]/g, ''), 10) || 0);
                const isFree = patent ? ScholarMateBusinessCore.isFreeSharedPatent(patent) : !price;
                const range = filters['价格区间：'];

                if (range === '免费共享' && !isFree) show = false;
                else if (range === '付费许可' && isFree) show = false;
                else if (range === '¥1,999/年' && price !== 1999) show = false;
                else if (range === '¥2,999/年及以上' && price < 2999) show = false;
            }

            card.style.display = show ? '' : 'none';
            if (show) visibleCount++;
        });

        // 4. 更新计数
        const countElement = document.querySelector('.results-count');
        if (countElement) {
            countElement.textContent = `共找到 ${visibleCount} 件专利`;
        }
    },

    // 发布表单提交
    handlePublishSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);

        // 验证必填字段
        const requiredFields = ['title', 'type', 'price', 'summary'];
        let isValid = true;

        requiredFields.forEach(field => {
            const input = form.querySelector(`[name="${field}"]`);
            if (input && !input.value.trim()) {
                isValid = false;
                input.classList.add('input--error');
            } else if (input) {
                input.classList.remove('input--error');
            }
        });

        if (isValid) {
            // 模拟提交
            alert('专利发布成功！');
            window.location.href = 'user-center.html';
        } else {
            alert('请填写所有必填字段');
        }
    },

    // 图片预览
    handleImagePreview(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                // 可以在这里更新预览
                console.log('Image selected:', file.name);
            };
            reader.readAsDataURL(file);
        }
    },

    // 工具函数：格式化金额
    formatCurrency(amount) {
        return new Intl.NumberFormat('zh-CN', {
            style: 'currency',
            currency: 'CNY'
        }).format(amount);
    },

    // 工具函数：格式化日期
    formatDate(dateString) {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(date);
    },

    // 专利列表页对话按钮点击处理
    handleListChatClick(inventorId, patentId, inventorName) {
        const user = UserManager.getUser();
        const detail = getPatentById(patentId);

        // 1. 检查登录状态
        if (!user || !user.isLoggedIn) {
            if (confirm('注册企业账号后可试聊教授数字学者，是否前往用户中心？')) {
                UserManager.saveUser(UserManager.ensureEnterpriseUser());
                window.location.href = this.getMobileBottomNavHref('user-center.html#enterprise-verification');
            }
            return;
        }

        const firstProject = UserManager.getDemandProjects()[0];
        const projectQuery = firstProject ? '&project=' + encodeURIComponent(firstProject.id) : '';

        // 2. 检查专利是否需要单独购买资料/对话许可
        if (detail && !ScholarMateBusinessCore.isFreeSharedPatent(detail)) {
            if (!UserManager.isVerified()) {
                UserManager.promptVerification('购买资料/对话许可');
                return;
            }
            if (!UserManager.hasPatentLicense(patentId)) {
                if (confirm('该专利需要先购买资料/对话许可，是否前往详情页？')) {
                    window.location.href = this.getMobileBottomNavHref('patent-detail.html?id=' + patentId + projectQuery);
                }
                return;
            }
        }

        // 3. 检查Token
        const remaining = UserManager.getRemainingToken();
        if (remaining < 30) {
            if (confirm('您的今日Token已用完，是否升级会员获取更多Token？')) {
                window.location.href = this.getMobileBottomNavHref('membership.html');
            }
            return;
        }

        // 4. 进入对话页面
        window.location.href = this.getMobileBottomNavHref('chat.html?inventor=' + inventorId + '&patent=' + patentId + projectQuery);
    },

    // 初始化收藏按钮
    initFavoriteButtons() {
        document.querySelectorAll('.patent-card__favorite').forEach(btn => {
            const patentId = btn.dataset.patentId;
            if (patentId && UserManager.isFavorite(patentId)) {
                btn.textContent = '♥';
                btn.style.color = 'var(--danger)';
            }
            btn.addEventListener('click', () => {
                this.handleFavoriteClick(patentId, btn);
            });
        });
    },

    // 处理收藏按钮点击
    handleFavoriteClick(patentId, element) {
        if (!UserManager.isLoggedIn()) {
            if (confirm('登录后即可收藏专利，是否前往登录？')) {
                window.location.href = 'user-center.html';
            }
            return;
        }

        if (UserManager.isFavorite(patentId)) {
            UserManager.removeFavorite(patentId);
            element.textContent = '♡';
            element.style.color = 'var(--text-light)';
            this.showToast('已取消收藏');
        } else {
            UserManager.addFavorite(patentId);
            element.textContent = '♥';
            element.style.color = 'var(--danger)';
            this.showToast('收藏成功');
        }
    },

    // 更新导航栏登录状态
    updateNavbarAuth() {
        const user = UserManager.getUser();
        const navbarActions = document.querySelector('.navbar__actions');
        if (!navbarActions) return;

        if (user && user.isLoggedIn) {
            const safeName = this.escapeHtml(user.name || '用户');
            navbarActions.innerHTML = `
                <a href="${this.escapeHtml(this.getMobilePreviewHref())}" class="btn btn--ghost btn--sm navbar__mobile-preview">${this.isMobilePreviewMode() ? '桌面版' : '手机版预览'}</a>
                <span class="navbar__user" style="margin-right: var(--space-2);">
                    <span class="navbar__user-name">${safeName}</span>
                </span>
                <button class="btn btn--outline btn--sm" onclick="UserManager.logout()">退出登录</button>
            `;
        }
    },

    renderMobilePreviewEntry() {
        const navbarActions = document.querySelector('.navbar__actions');
        if (!navbarActions || navbarActions.querySelector('.navbar__mobile-preview')) return;
        const link = document.createElement('a');
        link.className = 'btn btn--ghost btn--sm navbar__mobile-preview';
        link.href = this.getMobilePreviewHref();
        link.textContent = this.isMobilePreviewMode() ? '桌面版' : '手机版预览';
        navbarActions.insertBefore(link, navbarActions.firstChild);
    },

    isMobilePreviewMode(locationLike) {
        const loc = locationLike || window.location;
        return new URLSearchParams(loc.search || '').get('mobile') === '1';
    },

    getMobilePreviewHref() {
        const url = new URL(window.location.href);
        if (this.isMobilePreviewMode(url)) {
            url.searchParams.delete('mobile');
        } else {
            url.searchParams.set('mobile', '1');
        }
        return `${url.pathname.split('/').pop() || 'index.html'}${url.search}${url.hash}`;
    },

    applyMobilePreviewMode() {
        if (!document.body) return;
        const pathname = window.location.pathname.split('/').pop() || 'index.html';
        document.body.classList.toggle('mobile-preview-mode', this.isMobilePreviewMode());
        document.body.classList.toggle('chat-page', pathname === 'chat.html');
    },

    // 显示会员提示条
    showMembershipBanner() {
        const pathname = window.location.pathname.split('/').pop() || 'index.html';
        if (pathname === 'index.html' || document.body.classList.contains('workbench-page')) return;
        const user = UserManager.getUser();
        if (!user || !user.membership) {
            // 检查是否已存在
            if (document.getElementById('membership-top-banner')) return;

            const banner = document.createElement('div');
            banner.id = 'membership-top-banner';
            banner.className = 'membership-top-banner';
            banner.innerHTML = `
                <div class="container" style="display: flex; align-items: center; justify-content: center; gap: var(--space-3);">
                    <span>升级后获得更多需求项目、顾问席位和交易跟进</span>
                    <a href="membership.html" class="btn btn--primary btn--sm">立即开通</a>
                </div>
            `;
            document.body.insertBefore(banner, document.body.firstChild);
        }
    },

    getMobileBottomNavActive(locationLike) {
        const loc = locationLike || window.location;
        const pathname = (loc.pathname || '').split('/').pop() || 'index.html';
        const hash = loc.hash || '';

        if (pathname === 'index.html' || pathname === '') return 'home';
        if (pathname === 'patent-list.html' || pathname === 'patent-detail.html') return 'discover';
        if (pathname === 'chat.html') return 'advisor';
        if (pathname === 'user-center.html') {
            if (hash === '#demand-projects') return 'demand';
            if (hash === '#my-digital-assets' || hash === '#my-conversations') return 'advisor';
            return 'me';
        }
        return 'me';
    },

    getMobileBottomNavHref(href, locationLike) {
        const loc = locationLike || window.location;
        if (!this.isMobilePreviewMode(loc)) return href;

        const origin = loc.origin || 'http://127.0.0.1';
        const base = loc.href || `${origin}${loc.pathname || '/index.html'}${loc.search || ''}${loc.hash || ''}`;
        const url = new URL(href, base);
        url.searchParams.set('mobile', '1');
        return `${url.pathname.split('/').pop() || 'index.html'}${url.search}${url.hash}`;
    },

    renderMobileBottomNav() {
        if (!document.body) return;
        const pathname = window.location.pathname.split('/').pop() || 'index.html';
        if (pathname === 'index.html' || document.body.classList.contains('workbench-page')) {
            document.body.classList.remove('has-mobile-bottom-nav');
            document.getElementById('mobile-bottom-nav')?.remove();
            return;
        }
        const items = [
            { id: 'home', label: '首页', icon: '⌂', href: 'index.html' },
            { id: 'discover', label: '发现', icon: '⌕', href: 'patent-list.html' },
            { id: 'demand', label: '需求', icon: '＋', href: 'user-center.html#demand-projects' },
            { id: 'advisor', label: '顾问', icon: '◉', href: 'user-center.html#my-digital-assets' },
            { id: 'me', label: '我的', icon: '◎', href: 'user-center.html#enterprise-verification' }
        ];
        let nav = document.getElementById('mobile-bottom-nav');
        if (!nav) {
            nav = document.createElement('nav');
            nav.id = 'mobile-bottom-nav';
            nav.className = 'mobile-bottom-nav';
            nav.setAttribute('aria-label', '手机底部导航');
            document.body.appendChild(nav);
            document.body.classList.add('has-mobile-bottom-nav');
            nav.addEventListener('click', event => this.handleMobileBottomNavClick(event));
        }
        const active = this.getMobileBottomNavActive(window.location);
        nav.innerHTML = items.map(item => `
            <a class="mobile-bottom-nav__item ${item.id === active ? 'mobile-bottom-nav__item--active' : ''}" href="${this.escapeHtml(this.getMobileBottomNavHref(item.href))}" data-nav-id="${item.id}">
                <span class="mobile-bottom-nav__icon">${item.icon}</span>
                <span>${item.label}</span>
            </a>
        `).join('');
    },

    updateMobileBottomNavActive() {
        const nav = document.getElementById('mobile-bottom-nav');
        if (!nav) return;
        const active = this.getMobileBottomNavActive(window.location);
        nav.querySelectorAll('.mobile-bottom-nav__item').forEach(item => {
            item.classList.toggle('mobile-bottom-nav__item--active', item.dataset.navId === active);
        });
    },

    handleMobileBottomNavClick(event) {
        const link = event.target.closest('.mobile-bottom-nav__item');
        if (!link) return;
        const url = new URL(link.getAttribute('href'), window.location.href);
        const samePage = url.pathname === window.location.pathname;
        if (!samePage || !url.hash) return;

        const targetId = url.hash.slice(1);
        const allowed = new Set(['demand-projects', 'my-digital-assets', 'my-conversations', 'enterprise-verification']);
        if (!allowed.has(targetId)) return;

        const sidebarButton = document.querySelector(`.user-sidebar__menu .user-menu__item[data-tab="${targetId}"]`);
        if (!sidebarButton) return;
        event.preventDefault();
        sidebarButton.click();
        this.updateMobileBottomNavActive();
    },

    // 显示 Toast 提示
    showToast(message) {
        // 移除已存在的 toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-dark);
            color: var(--text-white);
            padding: var(--space-2) var(--space-4);
            border-radius: var(--radius);
            font-size: var(--font-sm);
            z-index: 9999;
            animation: fadeIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    },

    escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    formatMessage(value) {
        return this.escapeHtml(value).replace(/\n/g, '<br>');
    }
};

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => ScholarMate.init());
window.addEventListener('hashchange', () => ScholarMate.updateMobileBottomNavActive());

/* --------------------------------------------------------------------------
   通用工具函数
   -------------------------------------------------------------------------- */

// 用户状态管理
const UserManager = {
    // 获取用户数据
    getUser() {
        try {
            const stored = localStorage.getItem('scholarmate_user');
            const user = stored ? JSON.parse(stored) : null;
            if (user) this.normalizeDailyUsage(user);
            return user;
        } catch (e) {
            console.warn('Failed to parse user data:', e);
            return null;
        }
    },

    todayKey() {
        return new Date().toISOString().slice(0, 10);
    },

    normalizeDailyUsage(user) {
        if (!user) return user;
        const today = this.todayKey();
        if (user.tokenUsageDate !== today) {
            user.tokenUsedToday = 0;
            user.tokenUsageDate = today;
            localStorage.setItem('scholarmate_user', JSON.stringify(user));
        }
        return user;
    },

    ensureEnterpriseUser(user) {
        return ScholarMateBusinessCore.ensureEnterpriseUser(user || this.getUser());
    },

    // 保存用户数据
    saveUser(user) {
        localStorage.setItem('scholarmate_user', JSON.stringify(user));
    },

    registerEnterprise() {
        const user = this.ensureEnterpriseUser();
        this.saveUser(user);
        return user;
    },

    // 检查是否登录
    isLoggedIn() {
        const user = this.getUser();
        return user && user.isLoggedIn;
    },

    // 检查会员状态
    hasMembership() {
        const user = this.getUser();
        return user && user.membership;
    },

    isVerified() {
        return ScholarMateBusinessCore.isEnterpriseVerified(this.getUser());
    },

    promptVerification(actionName) {
        const action = actionName || '继续商业操作';
        if (confirm(`${action}需要先完成企业小额打款认证，是否前往认证？`)) {
            this.saveUser(this.ensureEnterpriseUser());
            window.location.href = 'user-center.html#enterprise-verification';
        }
    },

    canPerformCommercialAction() {
        return ScholarMateBusinessCore.canPerformCommercialAction(this.getUser());
    },

    startVerification(form) {
        const user = ScholarMateBusinessCore.startMicroDepositVerification(this.getUser(), form);
        this.saveUser(user);
        return user;
    },

    confirmVerification(amount) {
        const user = ScholarMateBusinessCore.confirmMicroDeposit(this.getUser(), amount);
        this.saveUser(user);
        return user;
    },

    // 获取会员等级
    getMembershipLevel() {
        const user = this.getUser();
        return user && user.membership ? user.membership.level : null;
    },

    // 获取剩余Token
    getRemainingToken() {
        const user = this.getUser();
        if (!user) return 0;
        if (!user.membership) return ScholarMateBusinessCore.MEMBERSHIP_PLANS.free.dailyTokenLimit - (user.tokenUsedToday || 0);
        const used = user.tokenUsedToday || 0;
        const plan = ScholarMateBusinessCore.getMembershipPlan(user.membership);
        return plan.dailyTokenLimit - used;
    },

    // 消耗Token
    consumeToken(amount) {
        const user = this.getUser();
        if (!user) return false;

        const remaining = this.getRemainingToken();
        if (remaining < amount) return false;

        user.tokenUsedToday = (user.tokenUsedToday || 0) + amount;
        user.tokenUsageDate = this.todayKey();
        this.saveUser(user);
        return true;
    },

    // 检查专利许可
    hasPatentLicense(patentId) {
        const user = this.getUser();
        if (!user) return false;
        return user.purchasedLicenses && user.purchasedLicenses.includes(patentId);
    },

    getPurchasedLicensePatents(options = {}) {
        const paidOnly = options.paidOnly !== false;
        const user = this.getUser();
        const ids = user && Array.isArray(user.purchasedLicenses) ? user.purchasedLicenses : [];
        return ids
            .map(patentId => patents.find(patent => patent.id === patentId))
            .filter(patent => patent && patent.id)
            .filter(patent => !paidOnly || !ScholarMateBusinessCore.isFreeSharedPatent(patent));
    },

    getAvailableAdvisorAssets() {
        const user = this.getUser();
        if (!user) return [];
        const byPatent = new Map();
        const labelMap = {
            license: '已购许可',
            seat: '顾问席位'
        };
        const resolvePatent = (patentId, inventorId) => {
            if (patentId) {
                return patents.find(patent => patent.id === patentId) || null;
            }
            if (inventorId) {
                return patents.find(patent => patent.inventorId === inventorId) || null;
            }
            return null;
        };
        const addAsset = ({ patent, inventorId, source, joinedAt = '' }) => {
            if (!patent || !patent.id || !source) return;
            const inventor = inventors.find(item => item.id === (inventorId || patent.inventorId));
            if (!inventor) return;
            const existing = byPatent.get(patent.id) || {
                patentId: patent.id,
                inventorId: inventor.id,
                patent,
                inventor,
                sources: [],
                joinedAt: ''
            };
            if (!existing.sources.includes(source)) {
                existing.sources.push(source);
            }
            existing.joinedAt = existing.joinedAt || joinedAt;
            existing.source = existing.sources.join('+');
            existing.sourceLabel = existing.sources.map(item => labelMap[item] || item).join(' + ');
            byPatent.set(patent.id, existing);
        };

        (user.purchasedLicenses || []).forEach(patentId => {
            const patent = patents.find(item => item.id === patentId);
            if (!patent || ScholarMateBusinessCore.isFreeSharedPatent(patent)) return;
            addAsset({
                patent,
                inventorId: patent.inventorId,
                source: 'license',
                joinedAt: user.licensePurchasedAt && user.licensePurchasedAt[patentId] || ''
            });
        });

        (user.digitalHumanSeats || []).forEach(seat => {
            const patent = resolvePatent(seat.patentId, seat.inventorId);
            addAsset({
                patent,
                inventorId: seat.inventorId || (patent && patent.inventorId),
                source: 'seat',
                joinedAt: seat.joinedAt || ''
            });
        });

        return Array.from(byPatent.values());
    },

    // 购买专利许可
    purchasePatentLicense(patentId) {
        const gate = this.canPerformCommercialAction();
        if (!gate.allowed) return false;
        const user = this.getUser();
        if (!user) return false;

        if (!user.purchasedLicenses) {
            user.purchasedLicenses = [];
        }
        if (!user.purchasedLicenses.includes(patentId)) {
            user.purchasedLicenses.push(patentId);
        }
        user.licensePurchasedAt = user.licensePurchasedAt || {};
        user.licensePurchasedAt[patentId] = user.licensePurchasedAt[patentId] || new Date().toISOString();
        this.saveUser(user);
        return true;
    },

    getDigitalHumanSeats() {
        const user = this.getUser();
        return user && Array.isArray(user.digitalHumanSeats) ? user.digitalHumanSeats : [];
    },

    getAdvisorSeatUsage() {
        const user = this.getUser();
        const plan = ScholarMateBusinessCore.getMembershipPlan(user && user.membership ? user.membership : 'free');
        const limit = ScholarMateBusinessCore.getAdvisorSeatLimit(plan);
        const membershipSeats = ScholarMateBusinessCore.hasPaidMembership(user) ? this.getDigitalHumanSeats() : [];
        const uniqueInventors = new Set(membershipSeats.map(seat => seat.inventorId).filter(Boolean));
        const used = uniqueInventors.size;
        const unlimited = !Number.isFinite(limit);
        return {
            used,
            limit,
            remaining: unlimited ? Infinity : Math.max(limit - used, 0),
            label: unlimited ? `${used}/不限` : `${used}/${limit}`,
            remainingLabel: unlimited ? '不限' : String(Math.max(limit - used, 0))
        };
    },

    joinDigitalHumanSeat({ inventorId, patentId = '', projectId = '' }) {
        const user = this.ensureEnterpriseUser();
        if (!ScholarMateBusinessCore.hasPaidMembership(user)) {
            return { allowed: false, reason: '加入顾问席位需要专业版或企业版会员' };
        }
        const seats = Array.isArray(user.digitalHumanSeats) ? user.digitalHumanSeats : [];
        const exists = seats.find(seat => seat.inventorId === inventorId && (seat.patentId || '') === (patentId || ''));
        if (exists) {
            return { allowed: true, reason: '', asset: exists };
        }
        const seatLimit = ScholarMateBusinessCore.getAdvisorSeatLimit(user.membership);
        const uniqueInventors = new Set(seats.map(seat => seat.inventorId));
        if (Number.isFinite(seatLimit) && !uniqueInventors.has(inventorId) && uniqueInventors.size >= seatLimit) {
            return { allowed: false, reason: `当前会员最多支持 ${seatLimit} 个顾问席位，请升级后继续加入` };
        }
        const asset = {
            inventorId,
            patentId,
            projectId,
            source: 'membership',
            joinedAt: new Date().toISOString()
        };
        seats.unshift(asset);
        user.digitalHumanSeats = seats;
        this.saveUser(user);
        return { allowed: true, reason: '', asset };
    },

    getDigitalHumanAssets() {
        const user = this.getUser();
        if (!user) return [];
        const byKey = new Map();
        const addAsset = asset => {
            const key = `${asset.inventorId || ''}_${asset.patentId || ''}_${asset.source}`;
            if (!asset.inventorId || byKey.has(key)) return;
            byKey.set(key, asset);
        };

        if (ScholarMateBusinessCore.hasPaidMembership(user)) {
            (user.digitalHumanSeats || []).forEach(seat => addAsset({
                inventorId: seat.inventorId,
                patentId: seat.patentId || '',
                projectId: seat.projectId || '',
                source: 'membership',
                joinedAt: seat.joinedAt
            }));
        }

        (user.purchasedLicenses || []).forEach(patentId => {
            const patent = patents.find(item => item.id === patentId);
            if (!patent) return;
            addAsset({
                inventorId: patent.inventorId,
                patentId: patent.id,
                projectId: '',
                source: 'license',
                joinedAt: user.licensePurchasedAt && user.licensePurchasedAt[patentId] || ''
            });
        });

        return Array.from(byKey.values());
    },

    // 开通会员
    activateMembership(level) {
        const user = ScholarMateBusinessCore.activateMembership(this.getUser(), level);
        this.saveUser(user);
        return true;
    },

    getDemandProjects() {
        try {
            return JSON.parse(localStorage.getItem('scholarmate_demand_projects') || '[]');
        } catch (e) {
            return [];
        }
    },

    saveDemandProjects(projects) {
        localStorage.setItem('scholarmate_demand_projects', JSON.stringify(projects));
    },

    createDemandProject(input) {
        const user = this.ensureEnterpriseUser();
        this.saveUser(user);
        const projects = this.getDemandProjects();
        const gate = ScholarMateBusinessCore.canCreateDemandProject(user, projects);
        if (!gate.allowed) {
            throw new Error(gate.reason);
        }
        const project = ScholarMateBusinessCore.createDemandProject(input, patents);
        projects.unshift(project);
        this.saveDemandProjects(projects);
        return project;
    },

    updateDemandProject(project) {
        const projects = this.getDemandProjects();
        const index = projects.findIndex(item => item.id === project.id);
        if (index >= 0) projects[index] = project;
        else projects.unshift(project);
        this.saveDemandProjects(projects);
    },

    canChatAboutPatent(patentId) {
        const user = this.getUser();
        const patent = getPatentById(patentId);
        const hasAdvisorAsset = user && this.getAvailableAdvisorAssets().some(asset => (
            asset.patentId === patentId ||
            (asset.inventorId && patent && asset.inventorId === patent.inventorId)
        ));
        if (hasAdvisorAsset) {
            return { allowed: true, reason: '' };
        }
        return ScholarMateBusinessCore.canChatAboutPatent(
            user,
            patent,
            (user && user.purchasedLicenses) || []
        );
    },

    getDemandProject(projectId) {
        return this.getDemandProjects().find(project => project.id === projectId) || null;
    },

    getTradeIntents() {
        try {
            return JSON.parse(localStorage.getItem('scholarmate_trade_intents') || '[]');
        } catch (e) {
            return [];
        }
    },

    saveTradeIntents(intents) {
        localStorage.setItem('scholarmate_trade_intents', JSON.stringify(intents));
    },

    createTradeIntent(input) {
        const intent = ScholarMateBusinessCore.createTradeIntent(this.getUser(), input);
        const intents = this.getTradeIntents();
        intents.unshift(intent);
        this.saveTradeIntents(intents);
        return intent;
    },

    // 获取收藏列表
    getFavorites() {
        const user = this.getUser();
        return user && user.favorites ? user.favorites : [];
    },

    // 添加收藏
    addFavorite(patentId) {
        const user = this.getUser();
        if (!user) return false;
        if (!user.favorites) user.favorites = [];
        if (!user.favorites.includes(patentId)) {
            user.favorites.push(patentId);
            this.saveUser(user);
        }
        return true;
    },

    // 移除收藏
    removeFavorite(patentId) {
        const user = this.getUser();
        if (!user || !user.favorites) return false;
        user.favorites = user.favorites.filter(id => id !== patentId);
        this.saveUser(user);
        return true;
    },

    // 检查是否已收藏
    isFavorite(patentId) {
        const user = this.getUser();
        return user && user.favorites && user.favorites.includes(patentId);
    },

    // 退出登录
    logout() {
        localStorage.removeItem('scholarmate_user');
        window.location.reload();
    }
};

// 发明人数据
const inventors = [
    {
        "id": "isjian",
        "name": "Jian MA",
        "sourceName": "MA, Jian",
        "email": "isjian@cityu.edu.hk",
        "auId": "isjian",
        "profileUrl": "https://scholars.cityu.edu.hk/en/persons/isjian/",
        "affiliation": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China.",
        "affiliationTier": "top_university",
        "expertise": [
            "large language model",
            "patent recommendation",
            "patent quality",
            "heterogeneous data"
        ],
        "patentIds": [
            "63943642",
            "63943652"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22Jian%20MA%20/%20City%20University%20of%20Hong%20Kong%2C%20Department%20of%20Information%20Systems%2C%20Hong%20Kong%2C%20Peoples%20R%20China.%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%232563eb%22/%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba%28255%2C255%2C255%2C0.24%29%22/%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba%28255%2C255%2C255%2C0.42%29%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3EJM%3C/text%3E%3C/svg%3E",
        "paperBackground": [
            {
                "scholarId": "isjian",
                "title": "Bridging Information Asymmetry in University-Industry Collaboration: MMKG SNR",
                "year": "2025",
                "description": "Multimodal knowledge graph and social-network ranking for matching firms to academics in university-industry collaboration.",
                "doi": "10.1145/3766918.3766942",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/bridging-information-asymmetry-in-university-industry-collaborati/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "university-industry collaboration",
                    "knowledge graph",
                    "recommendation"
                ],
                "authors": [
                    "Jian MA"
                ],
                "paperId": "d9b1b3b9026d"
            },
            {
                "title": "Enhancing patent recommendations for product innovation: integrating industry relevance and technology trends with multi-view learning",
                "authors": [
                    "Jian MA"
                ],
                "year": "2026",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/enhancing-patent-recommendations-for-product-innovation-integrati/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "doi": "10.1007/s11192-026-05592-3",
                "abstract": "The rapid changes in the technological composition of industries drive companies to seek external patents to foster production innovation. Existing patent recommendation methods primarily analyze the textual and bibliographic features of a company’s historical patents but often overlook industry relevance of patents and the technology development trends. To address this, this paper proposes a multi-view learning-based patent recommendation (MVLPR) approach that integrates industry relevance and technology trends. A multi-label classification model is employed to identify the industrial sectors applicable to a patent, while a Long Short-Term Memory (LSTM) network layer is designed to capture technology development trends. Offline experiments demonstrate that MVLPR achieves a better balance between accuracy and diversity than baseline methods. Crucially, the industry sector view alleviates the cold-start problem for new companies by leveraging inter-company similarities within the same industry sector to provide prior signals of technological interest independent of individual historical patents. Furthermore, the technology trend analysis within the International Patent Classificatio",
                "description": "The rapid changes in the technological composition of industries drive companies to seek external patents to foster production innovation. Existing patent recommendation methods primarily analyze the textual and bibliographic features of a company’s historical patents but often overlook industry relevance of patents and the technology development trends. To address this, this paper proposes a multi-view learning-based patent recommendation (MVLPR) approach that integrates industry relevance and technology trends. A multi-label classification model is employed to identify the industrial sectors applicable to a patent, while a Long Short-Term Memory (LSTM) network layer is designed to capture technology development trends. Offline experiments demonstrate that MVLPR achieves a better balance between accuracy and diversity than baseline methods. Crucially, the industry sector view alleviates the cold-start problem for new companies by leveraging inter-company similarities within the same industry sector to provide prior signals of technological interest independent of individual historical patents. Furthermore, the technology trend analysis within the International Patent Classificatio",
                "openAccess": {
                    "isOpenAccess": false,
                    "status": "closed",
                    "url": "",
                    "repositoryHasFullText": false
                },
                "paperId": "d097a85c38ae"
            },
            {
                "title": "Meeting companies’ innovative requirements on online technology trading platforms: A novel large language model-based framework",
                "authors": [
                    "Jian MA"
                ],
                "year": "2025",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/meeting-companies-innovative-requirements-on-online-technology-tr/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "doi": "10.1016/j.ipm.2025.104392",
                "abstract": "Online technology trading platforms (OTTPs) are critical for companies to publish technology requirements and identify solutions like patents. However, semantic gaps persist between market-driven needs and technical supply texts, which traditional methods fail to bridge. While large language models (LLMs) show promise, their effectiveness in OTTPs is limited by hallucination and temporal unawareness. We propose an LLM framework integrating the Hypothetical Document Embedding (HyDE) framework, where we generate pseudo-supply texts based on technical requirements. These texts are then matched with candidate patents using similarity calculations. To reduce hallucination, we use industry-specific knowledge graphs to guide the text generation process and introduce a self-reflective mechanism to refine the generated texts. To address the lack of time awareness, we enhance the knowledge graph with timestamps, turning it into a temporal knowledge graph. Additionally, we introduce the TPPR (Temporal Personalized PageRank) algorithm to improve the relevance of generated texts. Experiments show that our framework performs better than existing methods in Recall, Precision, and Mean Reciprocal ",
                "description": "Online technology trading platforms (OTTPs) are critical for companies to publish technology requirements and identify solutions like patents. However, semantic gaps persist between market-driven needs and technical supply texts, which traditional methods fail to bridge. While large language models (LLMs) show promise, their effectiveness in OTTPs is limited by hallucination and temporal unawareness. We propose an LLM framework integrating the Hypothetical Document Embedding (HyDE) framework, where we generate pseudo-supply texts based on technical requirements. These texts are then matched with candidate patents using similarity calculations. To reduce hallucination, we use industry-specific knowledge graphs to guide the text generation process and introduce a self-reflective mechanism to refine the generated texts. To address the lack of time awareness, we enhance the knowledge graph with timestamps, turning it into a temporal knowledge graph. Additionally, we introduce the TPPR (Temporal Personalized PageRank) algorithm to improve the relevance of generated texts. Experiments show that our framework performs better than existing methods in Recall, Precision, and Mean Reciprocal ",
                "openAccess": {
                    "isOpenAccess": false,
                    "status": "closed",
                    "url": "",
                    "repositoryHasFullText": false
                },
                "paperId": "ba43a3d65ef9"
            },
            {
                "title": "An Interpretable Patent Quality Evaluation Method and System Based on Large Language Model",
                "authors": [
                    "Jian MA"
                ],
                "year": "2025",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-interpretable-patent-quality-evaluation-method-and-system-base/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "description": "Public scholarly background metadata for the digital advisor.",
                "paperId": "8a20a5461f00"
            },
            {
                "title": "An LLMs-based Multi-Agent Collaborative Framework for Intelligent Public Fund Allocation",
                "authors": [
                    "Jian MA"
                ],
                "year": "2025",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-llms-based-multi-agent-collaborative-framework-for-intelligent/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "doi": "10.1145/3766918.3766943",
                "abstract": "With the continuous improvement of e-government platforms and the rapid development of artificial intelligence technology, an innovative public fund allocation model has emerged, which achieves precise allocation of public funds through automatic filling of application forms and intelligent verification of enterprise qualifications. However, existing studies still lacks systematic modeling of the implementation mechanism of this public fund allocation model. In response to the inherent complexity of the operating logic of this model and the unstructured characteristics of policy texts and enterprise data, this paper innovatively proposes a large language models-based multi-agent collaborative intelligent allocation method for public funds. This method consists of three core intelligent agents: policy agent, enterprise agent, and match agent. Among them, the policy agent is responsible for parsing policy texts and simulating government decision-making processes. The enterprise agent constructs the enterprise profile by integrating structured and unstructured data, and automatically generate funding application forms. The match agent is responsible for outputting the matching results",
                "description": "With the continuous improvement of e-government platforms and the rapid development of artificial intelligence technology, an innovative public fund allocation model has emerged, which achieves precise allocation of public funds through automatic filling of application forms and intelligent verification of enterprise qualifications. However, existing studies still lacks systematic modeling of the implementation mechanism of this public fund allocation model. In response to the inherent complexity of the operating logic of this model and the unstructured characteristics of policy texts and enterprise data, this paper innovatively proposes a large language models-based multi-agent collaborative intelligent allocation method for public funds. This method consists of three core intelligent agents: policy agent, enterprise agent, and match agent. Among them, the policy agent is responsible for parsing policy texts and simulating government decision-making processes. The enterprise agent constructs the enterprise profile by integrating structured and unstructured data, and automatically generate funding application forms. The match agent is responsible for outputting the matching results",
                "openAccess": {
                    "isOpenAccess": true,
                    "status": "gold",
                    "url": "https://doi.org/10.1145/3766918.3766943",
                    "repositoryHasFullText": true
                },
                "paperId": "8ae990d2129e"
            }
        ],
        "profileUrls": [
            "https://scholars.cityu.edu.hk/en/persons/isjian/"
        ],
        "identityRules": [
            {
                "id": "identity_controlled_proxy",
                "priority": 100,
                "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
            },
            {
                "id": "identity_no_institutional_commitment",
                "priority": 95,
                "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
            }
        ],
        "evidenceRules": [
            {
                "id": "evidence_type_boundary",
                "priority": 100,
                "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
            },
            {
                "id": "evidence_no_fabrication",
                "priority": 100,
                "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
            },
            {
                "id": "evidence_metadata_limit",
                "priority": 90,
                "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
            }
        ],
        "scholarRules": [
            {
                "id": "scholar_field_scope",
                "priority": 85,
                "text": "Prefer answers grounded in Jian MA's public patent ownership, paper background and expertise fields.",
                "fields": [
                    "large language model",
                    "patent recommendation",
                    "patent quality",
                    "heterogeneous data"
                ]
            },
            {
                "id": "scholar_voice",
                "priority": 55,
                "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
            },
            {
                "id": "scholar_gap_disclosure",
                "priority": 80,
                "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
            }
        ],
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
            }
        ],
        "rules": {
            "identityRules": [
                {
                    "id": "identity_controlled_proxy",
                    "priority": 100,
                    "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
                },
                {
                    "id": "identity_no_institutional_commitment",
                    "priority": 95,
                    "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
                }
            ],
            "evidenceRules": [
                {
                    "id": "evidence_type_boundary",
                    "priority": 100,
                    "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
                },
                {
                    "id": "evidence_no_fabrication",
                    "priority": 100,
                    "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
                },
                {
                    "id": "evidence_metadata_limit",
                    "priority": 90,
                    "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
                }
            ],
            "scholarRules": [
                {
                    "id": "scholar_field_scope",
                    "priority": 85,
                    "text": "Prefer answers grounded in Jian MA's public patent ownership, paper background and expertise fields.",
                    "fields": [
                        "large language model",
                        "patent recommendation",
                        "patent quality",
                        "heterogeneous data"
                    ]
                },
                {
                    "id": "scholar_voice",
                    "priority": 55,
                    "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
                },
                {
                    "id": "scholar_gap_disclosure",
                    "priority": 80,
                    "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
                }
            ],
            "patentRules": [
                {
                    "id": "patent_first",
                    "priority": 100,
                    "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
                },
                {
                    "id": "no_claim_expansion",
                    "priority": 100,
                    "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
                },
                {
                    "id": "no_legal_conclusion",
                    "priority": 95,
                    "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
                }
            ]
        },
        "skills": [
            {
                "id": "patent_fact_extractor",
                "name": "Patent Fact Extractor",
                "description": "Extract current patent title, abstract, field, public source and local original facts before answering.",
                "sourceTypes": [
                    "patent"
                ],
                "priority": 100,
                "triggers": [
                    "all_patent_questions",
                    "selected_patent_context"
                ]
            },
            {
                "id": "paper_evidence_retriever",
                "name": "Paper Evidence Retriever",
                "description": "Retrieve scholar-bound downloaded PDF chunks and metadata-only paper records that match the question.",
                "sourceTypes": [
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 80,
                "triggers": [
                    "research_basis",
                    "technical_explanation",
                    "business_analysis"
                ]
            },
            {
                "id": "commercialization_assessor",
                "name": "Commercialization Assessor",
                "description": "Translate patent and paper evidence into enterprise scenarios, buyer fit and trial path assumptions.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "user_input"
                ],
                "priority": 70,
                "triggers": [
                    "business_analysis",
                    "licensing_next_step"
                ]
            },
            {
                "id": "technical_due_diligence",
                "name": "Technical Due Diligence",
                "description": "Identify technical, data, equipment, integration and validation gaps that require follow-up.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 65,
                "triggers": [
                    "technical_explanation",
                    "risk_question",
                    "business_analysis"
                ]
            },
            {
                "id": "risk_guard",
                "name": "Risk Guard",
                "description": "Block overclaiming, fabricated citations, legal conclusions and treating metadata-only records as full text.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 100,
                "triggers": [
                    "all_answers",
                    "risk_question",
                    "legal_question"
                ]
            },
            {
                "id": "citation_answer_builder",
                "name": "Citation Answer Builder",
                "description": "Build concise answers with explicit source boundaries and reference chips.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 75,
                "triggers": [
                    "all_answers"
                ]
            }
        ],
        "sessionContext": {
            "selectedPatentPolicy": "active_patent_first",
            "longTermMemoryPolicy": "Only user preferences, enterprise demand context and conversation decisions may persist; scholar, patent and paper facts must come from controlled source data.",
            "answerContextPolicy": "Retrieve only the most relevant patent facts and top paper evidence for each turn."
        },
        "paperMemory": [
            {
                "paperId": "d9b1b3b9026d",
                "scholarId": "isjian",
                "title": "Bridging Information Asymmetry in University-Industry Collaboration: MMKG SNR",
                "year": "2025",
                "authors": [
                    "Jian MA"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "university-industry collaboration",
                    "knowledge graph",
                    "recommendation"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/bridging-information-asymmetry-in-university-industry-collaborati/",
                "file": "",
                "description": "Multimodal knowledge graph and social-network ranking for matching firms to academics in university-industry collaboration."
            },
            {
                "paperId": "d097a85c38ae",
                "scholarId": "isjian",
                "title": "Enhancing patent recommendations for product innovation: integrating industry relevance and technology trends with multi-view learning",
                "year": "2026",
                "authors": [
                    "Jian MA"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/enhancing-patent-recommendations-for-product-innovation-integrati/",
                "file": "",
                "description": "The rapid changes in the technological composition of industries drive companies to seek external patents to foster production innovation. Existing patent recommendation methods primarily analyze the textual and bibliographic features of a company’s historical patents but often overlook industry relevance of patents and the technology development trends. To address this, this paper proposes a multi-view learning-based patent recommendation (MVLPR) approach that integrates industry relevance and technology trends. A multi-label classification model is employed to identify the industrial sectors applicable to a patent, while a Long Short-Term Memory (LSTM) network layer is designed to capture technology development trends. Offline experiments demonstrate that MVLPR achieves a better balance between accuracy and diversity than baseline methods. Crucially, the industry sector view alleviates the cold-start problem for new companies by leveraging inter-company similarities within the same industry sector to provide prior signals of technological interest independent of individual historical patents. Furthermore, the technology trend analysis within the International Patent Classificatio"
            },
            {
                "paperId": "ba43a3d65ef9",
                "scholarId": "isjian",
                "title": "Meeting companies’ innovative requirements on online technology trading platforms: A novel large language model-based framework",
                "year": "2025",
                "authors": [
                    "Jian MA"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/meeting-companies-innovative-requirements-on-online-technology-tr/",
                "file": "",
                "description": "Online technology trading platforms (OTTPs) are critical for companies to publish technology requirements and identify solutions like patents. However, semantic gaps persist between market-driven needs and technical supply texts, which traditional methods fail to bridge. While large language models (LLMs) show promise, their effectiveness in OTTPs is limited by hallucination and temporal unawareness. We propose an LLM framework integrating the Hypothetical Document Embedding (HyDE) framework, where we generate pseudo-supply texts based on technical requirements. These texts are then matched with candidate patents using similarity calculations. To reduce hallucination, we use industry-specific knowledge graphs to guide the text generation process and introduce a self-reflective mechanism to refine the generated texts. To address the lack of time awareness, we enhance the knowledge graph with timestamps, turning it into a temporal knowledge graph. Additionally, we introduce the TPPR (Temporal Personalized PageRank) algorithm to improve the relevance of generated texts. Experiments show that our framework performs better than existing methods in Recall, Precision, and Mean Reciprocal"
            },
            {
                "paperId": "8a20a5461f00",
                "scholarId": "isjian",
                "title": "An Interpretable Patent Quality Evaluation Method and System Based on Large Language Model",
                "year": "2025",
                "authors": [
                    "Jian MA"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-interpretable-patent-quality-evaluation-method-and-system-base/",
                "file": "",
                "description": "Public scholarly background metadata for the digital advisor."
            },
            {
                "paperId": "8ae990d2129e",
                "scholarId": "isjian",
                "title": "An LLMs-based Multi-Agent Collaborative Framework for Intelligent Public Fund Allocation",
                "year": "2025",
                "authors": [
                    "Jian MA"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-llms-based-multi-agent-collaborative-framework-for-intelligent/",
                "file": "",
                "description": "With the continuous improvement of e-government platforms and the rapid development of artificial intelligence technology, an innovative public fund allocation model has emerged, which achieves precise allocation of public funds through automatic filling of application forms and intelligent verification of enterprise qualifications. However, existing studies still lacks systematic modeling of the implementation mechanism of this public fund allocation model. In response to the inherent complexity of the operating logic of this model and the unstructured characteristics of policy texts and enterprise data, this paper innovatively proposes a large language models-based multi-agent collaborative intelligent allocation method for public funds. This method consists of three core intelligent agents: policy agent, enterprise agent, and match agent. Among them, the policy agent is responsible for parsing policy texts and simulating government decision-making processes. The enterprise agent constructs the enterprise profile by integrating structured and unstructured data, and automatically generate funding application forms. The match agent is responsible for outputting the matching results"
            }
        ],
        "knowledgeIndex": {
            "path": "assets/scholars/isjian/knowledge/index.json",
            "paperCount": 5,
            "downloadedPdfCount": 0,
            "metadataOnlyCount": 5,
            "chunkCount": 0,
            "topics": [
                "university-industry collaboration",
                "knowledge graph",
                "recommendation"
            ],
            "sourceTypes": [
                "patent",
                "paper_pdf",
                "paper_metadata",
                "profile",
                "user_input"
            ],
            "chunks": [],
            "metadataRecords": [
                {
                    "paperId": "d9b1b3b9026d",
                    "scholarId": "isjian",
                    "title": "Bridging Information Asymmetry in University-Industry Collaboration: MMKG SNR",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "university-industry collaboration",
                        "knowledge graph",
                        "recommendation"
                    ],
                    "description": "Multimodal knowledge graph and social-network ranking for matching firms to academics in university-industry collaboration.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/bridging-information-asymmetry-in-university-industry-collaborati/"
                },
                {
                    "paperId": "d097a85c38ae",
                    "scholarId": "isjian",
                    "title": "Enhancing patent recommendations for product innovation: integrating industry relevance and technology trends with multi-view learning",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "The rapid changes in the technological composition of industries drive companies to seek external patents to foster production innovation. Existing patent recommendation methods primarily analyze the textual and bibliographic features of a company’s historical patents but often overlook industry relevance of patents and the technology development trends. To address this, this paper proposes a multi-view learning-based patent recommendation (MVLPR) approach that integrates industry relevance and technology trends. A multi-label classification model is employed to identify the industrial sectors applicable to a patent, while a Long Short-Term Memory (LSTM) network layer is designed to capture technology development trends. Offline experiments demonstrate that MVLPR achieves a better balance between accuracy and diversity than baseline methods. Crucially, the industry sector view alleviates the cold-start problem for new companies by leveraging inter-company similarities within the same industry sector to provide prior signals of technological interest independent of individual historical patents. Furthermore, the technology trend analysis within the International Patent Classificatio",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/enhancing-patent-recommendations-for-product-innovation-integrati/"
                },
                {
                    "paperId": "ba43a3d65ef9",
                    "scholarId": "isjian",
                    "title": "Meeting companies’ innovative requirements on online technology trading platforms: A novel large language model-based framework",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Online technology trading platforms (OTTPs) are critical for companies to publish technology requirements and identify solutions like patents. However, semantic gaps persist between market-driven needs and technical supply texts, which traditional methods fail to bridge. While large language models (LLMs) show promise, their effectiveness in OTTPs is limited by hallucination and temporal unawareness. We propose an LLM framework integrating the Hypothetical Document Embedding (HyDE) framework, where we generate pseudo-supply texts based on technical requirements. These texts are then matched with candidate patents using similarity calculations. To reduce hallucination, we use industry-specific knowledge graphs to guide the text generation process and introduce a self-reflective mechanism to refine the generated texts. To address the lack of time awareness, we enhance the knowledge graph with timestamps, turning it into a temporal knowledge graph. Additionally, we introduce the TPPR (Temporal Personalized PageRank) algorithm to improve the relevance of generated texts. Experiments show that our framework performs better than existing methods in Recall, Precision, and Mean Reciprocal",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/meeting-companies-innovative-requirements-on-online-technology-tr/"
                },
                {
                    "paperId": "8a20a5461f00",
                    "scholarId": "isjian",
                    "title": "An Interpretable Patent Quality Evaluation Method and System Based on Large Language Model",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Public scholarly background metadata for the digital advisor.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-interpretable-patent-quality-evaluation-method-and-system-base/"
                },
                {
                    "paperId": "8ae990d2129e",
                    "scholarId": "isjian",
                    "title": "An LLMs-based Multi-Agent Collaborative Framework for Intelligent Public Fund Allocation",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "With the continuous improvement of e-government platforms and the rapid development of artificial intelligence technology, an innovative public fund allocation model has emerged, which achieves precise allocation of public funds through automatic filling of application forms and intelligent verification of enterprise qualifications. However, existing studies still lacks systematic modeling of the implementation mechanism of this public fund allocation model. In response to the inherent complexity of the operating logic of this model and the unstructured characteristics of policy texts and enterprise data, this paper innovatively proposes a large language models-based multi-agent collaborative intelligent allocation method for public funds. This method consists of three core intelligent agents: policy agent, enterprise agent, and match agent. Among them, the policy agent is responsible for parsing policy texts and simulating government decision-making processes. The enterprise agent constructs the enterprise profile by integrating structured and unstructured data, and automatically generate funding application forms. The match agent is responsible for outputting the matching results",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-llms-based-multi-agent-collaborative-framework-for-intelligent/"
                }
            ]
        },
        "patentMemory": [
            {
                "id": "63943642",
                "publicationNumber": "63943642",
                "title": "An Interpretable Patent Quality Evaluation Method and System Based on Large Language Model",
                "field": "ai-patent-intelligence",
                "industry": "企业服务",
                "summary": "This CityUHK patent record is available from the public CityUHK Scholars metadata. The original patent text has not been publicly available in the local archive yet.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-interpretable-patent-quality-evaluation-method-and-system-base/",
                "sourceType": "patent",
                "legalStatus": "Accepted/In press/Filed - 18 Dec 2025"
            },
            {
                "id": "63943652",
                "publicationNumber": "63943652",
                "title": "University Patent Recommendation Technology Based on Heterogeneous Data Fusion and Dynamic Attention Mechanism",
                "field": "ai-patent-intelligence",
                "industry": "企业服务",
                "summary": "This CityUHK patent record is available from the public CityUHK Scholars metadata. The original patent text has not been publicly available in the local archive yet.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/university-patent-recommendation-technology-based-on-heterogeneou/",
                "sourceType": "patent",
                "legalStatus": "Accepted/In press/Filed - 18 Dec 2025"
            }
        ]
    },
    {
        "id": "acmleung",
        "name": "Chung Man Alvin LEUNG",
        "sourceName": "LEUNG, Chung Man Alvin",
        "email": "acmleung@cityu.edu.hk",
        "auId": "acmleung",
        "profileUrl": "https://scholars.cityu.edu.hk/en/persons/acmleung/",
        "affiliation": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China.",
        "affiliationTier": "top_university",
        "expertise": [
            "blockchain",
            "ethereum",
            "nft",
            "private key"
        ],
        "patentIds": [
            "CN117950627A"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22Chung%20Man%20Alvin%20LEUNG%20/%20City%20University%20of%20Hong%20Kong%2C%20Department%20of%20Information%20Systems%2C%20Hong%20Kong%2C%20Peoples%20R%20China.%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%230f766e%22/%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba%28255%2C255%2C255%2C0.24%29%22/%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba%28255%2C255%2C255%2C0.42%29%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3ECM%3C/text%3E%3C/svg%3E",
        "paperBackground": [
            {
                "scholarId": "acmleung",
                "title": "Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future",
                "year": "2025",
                "description": "Discusses AI and Bright Internet approaches for transforming internet trust and safety.",
                "doi": "10.1007/s10796-025-10632-z",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/artificial-intelligence-and-the-bright-internet-transforming-the-/",
                "pdfUrl": "https://link.springer.com/content/pdf/10.1007/s10796-025-10632-z.pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "artificial intelligence",
                    "bright internet",
                    "trust"
                ],
                "authors": [
                    "Chung Man Alvin LEUNG"
                ],
                "file": "assets/scholars/acmleung/papers/9dddc36e4b.pdf",
                "downloadUrl": "https://link.springer.com/content/pdf/10.1007/s10796-025-10632-z.pdf",
                "paperId": "0fb807dfa4dc"
            },
            {
                "scholarId": "acmleung",
                "title": "At your fingertips: Do augmented reality gestures reveal product-related emotion?",
                "year": "2025",
                "description": "Uses mobile AR touch gestures and explainable AI to infer product-related emotions.",
                "doi": "10.1016/j.dss.2025.114595",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/at-your-fingertips-do-augmented-reality-gestures-reveal-product-r/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "augmented reality",
                    "emotion detection",
                    "explainable AI"
                ],
                "authors": [
                    "Chung Man Alvin LEUNG"
                ],
                "paperId": "e87e21772afc"
            },
            {
                "scholarId": "acmleung",
                "title": "Enhanced digital embeddedness and bubble mitigation in NFT marketplaces",
                "year": "2025",
                "description": "Difference-in-differences study of rarity-rank labels and NFT trading behavior.",
                "doi": "10.1016/j.dss.2025.114407",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/enhanced-digital-embeddedness-and-bubble-mitigation-in-nft-market/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "NFT marketplace",
                    "digital embeddedness",
                    "trading behavior"
                ],
                "authors": [
                    "Chung Man Alvin LEUNG"
                ],
                "paperId": "cd0afd144d84"
            },
            {
                "title": "Bot Moderation Dynamics in Online Investment Communities",
                "authors": [
                    "Chung Man Alvin LEUNG"
                ],
                "year": "2025",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/bot-moderation-dynamics-in-online-investment-communities/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "abstract": "As retail investor users scale on social media platforms, maintaining the financial informativeness of crowd-generated content becomes difficult. While automated content moderation is widely used in platform governance, its effectiveness for specialized knowledge domains remains underexplored. This study examines how dramatic community expansion influences bot moderation effectiveness in online investment communities by analyzing the GameStop event on Reddit's r/WallStreetBets. Using 1.7 million posts and 419,000 bot moderation comments from 2020-2021, we find that different bot moderations yield varying outcomes, depending on their alignment with the wisdom of crowds boundary conditions. Image-related moderation becomes more effective in the community shift, while humor-embedded moderation grows less effective. Media-related moderation shows different time-dependent effects: positive for short- term returns but negative for longer-term predictions. These findings contribute to platform governance literature on how bot moderation maintains financial information quality during rapid community expansion and provide practical implications for social media platform operations. © 2025, ",
                "description": "As retail investor users scale on social media platforms, maintaining the financial informativeness of crowd-generated content becomes difficult. While automated content moderation is widely used in platform governance, its effectiveness for specialized knowledge domains remains underexplored. This study examines how dramatic community expansion influences bot moderation effectiveness in online investment communities by analyzing the GameStop event on Reddit's r/WallStreetBets. Using 1.7 million posts and 419,000 bot moderation comments from 2020-2021, we find that different bot moderations yield varying outcomes, depending on their alignment with the wisdom of crowds boundary conditions. Image-related moderation becomes more effective in the community shift, while humor-embedded moderation grows less effective. Media-related moderation shows different time-dependent effects: positive for short- term returns but negative for longer-term predictions. These findings contribute to platform governance literature on how bot moderation maintains financial information quality during rapid community expansion and provide practical implications for social media platform operations. © 2025, ",
                "paperId": "e35df48c851c"
            },
            {
                "title": "Corporate Social Responsibility and Firm Value: Exploring the Moderating Effects of Information Technology-Enabled Knowledge Capabilities",
                "authors": [
                    "Chung Man Alvin LEUNG"
                ],
                "year": "2024",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/corporate-social-responsibility-and-firm-value-exploring-the-mode/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "doi": "10.1108/INTR-03-2023-0202",
                "abstract": "Purpose - A substantial amount of research has examined the firm value impact of corporate social responsibility (CSR). Nevertheless, the findings have been inconsistent, prompting researchers to identify contingencies under which the impact varies. This study examines how information technology (IT)-enabled knowledge capabilities moderate the relationship between CSR and firm value. Design/methodology/approach - We conducted the ordinary least squares (OLS) regression analysis on a sample of S&P 500 companies spanning from 2010 to 2017. We employed additional methods to test the robustness of the results, including the generalized method of moments (GMM) estimator and the two-stage least squares (2SLS) method. Findings - The results show that IT-enabled absorptive capability (IT-AC) and IT-enabled social integration capability (IT-SIC) positively moderate the CSR–value relationship. Further, their moderating effects vary in distinct ways when environmental dynamism changes, hinting at the distinct underlying rationales behind the moderating roles of IT-AC and IT-SIC. Research limitations/implications - This study improves the understanding of the business value of CSR and IT. It h",
                "description": "Purpose - A substantial amount of research has examined the firm value impact of corporate social responsibility (CSR). Nevertheless, the findings have been inconsistent, prompting researchers to identify contingencies under which the impact varies. This study examines how information technology (IT)-enabled knowledge capabilities moderate the relationship between CSR and firm value. Design/methodology/approach - We conducted the ordinary least squares (OLS) regression analysis on a sample of S&P 500 companies spanning from 2010 to 2017. We employed additional methods to test the robustness of the results, including the generalized method of moments (GMM) estimator and the two-stage least squares (2SLS) method. Findings - The results show that IT-enabled absorptive capability (IT-AC) and IT-enabled social integration capability (IT-SIC) positively moderate the CSR–value relationship. Further, their moderating effects vary in distinct ways when environmental dynamism changes, hinting at the distinct underlying rationales behind the moderating roles of IT-AC and IT-SIC. Research limitations/implications - This study improves the understanding of the business value of CSR and IT. It h",
                "openAccess": {
                    "isOpenAccess": false,
                    "status": "closed",
                    "url": "",
                    "repositoryHasFullText": false
                },
                "paperId": "9ceb92b77b32"
            }
        ],
        "profileUrls": [
            "https://scholars.cityu.edu.hk/en/persons/acmleung/",
            "https://www.cb.cityu.edu.hk/People-and-Research/People/People-Details?PageSpeed=noscript&eid=acmleung"
        ],
        "identityRules": [
            {
                "id": "identity_controlled_proxy",
                "priority": 100,
                "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
            },
            {
                "id": "identity_no_institutional_commitment",
                "priority": 95,
                "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
            }
        ],
        "evidenceRules": [
            {
                "id": "evidence_type_boundary",
                "priority": 100,
                "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
            },
            {
                "id": "evidence_no_fabrication",
                "priority": 100,
                "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
            },
            {
                "id": "evidence_metadata_limit",
                "priority": 90,
                "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
            }
        ],
        "scholarRules": [
            {
                "id": "scholar_field_scope",
                "priority": 85,
                "text": "Prefer answers grounded in Chung Man Alvin LEUNG's public patent ownership, paper background and expertise fields.",
                "fields": [
                    "blockchain",
                    "ethereum",
                    "nft",
                    "private key"
                ]
            },
            {
                "id": "scholar_voice",
                "priority": 55,
                "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
            },
            {
                "id": "scholar_gap_disclosure",
                "priority": 80,
                "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
            }
        ],
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
            }
        ],
        "rules": {
            "identityRules": [
                {
                    "id": "identity_controlled_proxy",
                    "priority": 100,
                    "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
                },
                {
                    "id": "identity_no_institutional_commitment",
                    "priority": 95,
                    "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
                }
            ],
            "evidenceRules": [
                {
                    "id": "evidence_type_boundary",
                    "priority": 100,
                    "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
                },
                {
                    "id": "evidence_no_fabrication",
                    "priority": 100,
                    "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
                },
                {
                    "id": "evidence_metadata_limit",
                    "priority": 90,
                    "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
                }
            ],
            "scholarRules": [
                {
                    "id": "scholar_field_scope",
                    "priority": 85,
                    "text": "Prefer answers grounded in Chung Man Alvin LEUNG's public patent ownership, paper background and expertise fields.",
                    "fields": [
                        "blockchain",
                        "ethereum",
                        "nft",
                        "private key"
                    ]
                },
                {
                    "id": "scholar_voice",
                    "priority": 55,
                    "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
                },
                {
                    "id": "scholar_gap_disclosure",
                    "priority": 80,
                    "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
                }
            ],
            "patentRules": [
                {
                    "id": "patent_first",
                    "priority": 100,
                    "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
                },
                {
                    "id": "no_claim_expansion",
                    "priority": 100,
                    "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
                },
                {
                    "id": "no_legal_conclusion",
                    "priority": 95,
                    "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
                }
            ]
        },
        "skills": [
            {
                "id": "patent_fact_extractor",
                "name": "Patent Fact Extractor",
                "description": "Extract current patent title, abstract, field, public source and local original facts before answering.",
                "sourceTypes": [
                    "patent"
                ],
                "priority": 100,
                "triggers": [
                    "all_patent_questions",
                    "selected_patent_context"
                ]
            },
            {
                "id": "paper_evidence_retriever",
                "name": "Paper Evidence Retriever",
                "description": "Retrieve scholar-bound downloaded PDF chunks and metadata-only paper records that match the question.",
                "sourceTypes": [
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 80,
                "triggers": [
                    "research_basis",
                    "technical_explanation",
                    "business_analysis"
                ]
            },
            {
                "id": "commercialization_assessor",
                "name": "Commercialization Assessor",
                "description": "Translate patent and paper evidence into enterprise scenarios, buyer fit and trial path assumptions.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "user_input"
                ],
                "priority": 70,
                "triggers": [
                    "business_analysis",
                    "licensing_next_step"
                ]
            },
            {
                "id": "technical_due_diligence",
                "name": "Technical Due Diligence",
                "description": "Identify technical, data, equipment, integration and validation gaps that require follow-up.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 65,
                "triggers": [
                    "technical_explanation",
                    "risk_question",
                    "business_analysis"
                ]
            },
            {
                "id": "risk_guard",
                "name": "Risk Guard",
                "description": "Block overclaiming, fabricated citations, legal conclusions and treating metadata-only records as full text.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 100,
                "triggers": [
                    "all_answers",
                    "risk_question",
                    "legal_question"
                ]
            },
            {
                "id": "citation_answer_builder",
                "name": "Citation Answer Builder",
                "description": "Build concise answers with explicit source boundaries and reference chips.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 75,
                "triggers": [
                    "all_answers"
                ]
            }
        ],
        "sessionContext": {
            "selectedPatentPolicy": "active_patent_first",
            "longTermMemoryPolicy": "Only user preferences, enterprise demand context and conversation decisions may persist; scholar, patent and paper facts must come from controlled source data.",
            "answerContextPolicy": "Retrieve only the most relevant patent facts and top paper evidence for each turn."
        },
        "paperMemory": [
            {
                "paperId": "0fb807dfa4dc",
                "scholarId": "acmleung",
                "title": "Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future",
                "year": "2025",
                "authors": [
                    "Chung Man Alvin LEUNG"
                ],
                "sourceType": "paper_pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "artificial intelligence",
                    "bright internet",
                    "trust"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/artificial-intelligence-and-the-bright-internet-transforming-the-/",
                "file": "assets/scholars/acmleung/papers/9dddc36e4b.pdf",
                "description": "Discusses AI and Bright Internet approaches for transforming internet trust and safety."
            },
            {
                "paperId": "e87e21772afc",
                "scholarId": "acmleung",
                "title": "At your fingertips: Do augmented reality gestures reveal product-related emotion?",
                "year": "2025",
                "authors": [
                    "Chung Man Alvin LEUNG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "augmented reality",
                    "emotion detection",
                    "explainable AI"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/at-your-fingertips-do-augmented-reality-gestures-reveal-product-r/",
                "file": "",
                "description": "Uses mobile AR touch gestures and explainable AI to infer product-related emotions."
            },
            {
                "paperId": "cd0afd144d84",
                "scholarId": "acmleung",
                "title": "Enhanced digital embeddedness and bubble mitigation in NFT marketplaces",
                "year": "2025",
                "authors": [
                    "Chung Man Alvin LEUNG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "NFT marketplace",
                    "digital embeddedness",
                    "trading behavior"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/enhanced-digital-embeddedness-and-bubble-mitigation-in-nft-market/",
                "file": "",
                "description": "Difference-in-differences study of rarity-rank labels and NFT trading behavior."
            },
            {
                "paperId": "e35df48c851c",
                "scholarId": "acmleung",
                "title": "Bot Moderation Dynamics in Online Investment Communities",
                "year": "2025",
                "authors": [
                    "Chung Man Alvin LEUNG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/bot-moderation-dynamics-in-online-investment-communities/",
                "file": "",
                "description": "As retail investor users scale on social media platforms, maintaining the financial informativeness of crowd-generated content becomes difficult. While automated content moderation is widely used in platform governance, its effectiveness for specialized knowledge domains remains underexplored. This study examines how dramatic community expansion influences bot moderation effectiveness in online investment communities by analyzing the GameStop event on Reddit's r/WallStreetBets. Using 1.7 million posts and 419,000 bot moderation comments from 2020-2021, we find that different bot moderations yield varying outcomes, depending on their alignment with the wisdom of crowds boundary conditions. Image-related moderation becomes more effective in the community shift, while humor-embedded moderation grows less effective. Media-related moderation shows different time-dependent effects: positive for short- term returns but negative for longer-term predictions. These findings contribute to platform governance literature on how bot moderation maintains financial information quality during rapid community expansion and provide practical implications for social media platform operations. © 2025,"
            },
            {
                "paperId": "9ceb92b77b32",
                "scholarId": "acmleung",
                "title": "Corporate Social Responsibility and Firm Value: Exploring the Moderating Effects of Information Technology-Enabled Knowledge Capabilities",
                "year": "2024",
                "authors": [
                    "Chung Man Alvin LEUNG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/corporate-social-responsibility-and-firm-value-exploring-the-mode/",
                "file": "",
                "description": "Purpose - A substantial amount of research has examined the firm value impact of corporate social responsibility (CSR). Nevertheless, the findings have been inconsistent, prompting researchers to identify contingencies under which the impact varies. This study examines how information technology (IT)-enabled knowledge capabilities moderate the relationship between CSR and firm value. Design/methodology/approach - We conducted the ordinary least squares (OLS) regression analysis on a sample of S&P 500 companies spanning from 2010 to 2017. We employed additional methods to test the robustness of the results, including the generalized method of moments (GMM) estimator and the two-stage least squares (2SLS) method. Findings - The results show that IT-enabled absorptive capability (IT-AC) and IT-enabled social integration capability (IT-SIC) positively moderate the CSR–value relationship. Further, their moderating effects vary in distinct ways when environmental dynamism changes, hinting at the distinct underlying rationales behind the moderating roles of IT-AC and IT-SIC. Research limitations/implications - This study improves the understanding of the business value of CSR and IT. It h"
            }
        ],
        "knowledgeIndex": {
            "path": "assets/scholars/acmleung/knowledge/index.json",
            "paperCount": 5,
            "downloadedPdfCount": 1,
            "metadataOnlyCount": 4,
            "chunkCount": 8,
            "topics": [
                "artificial intelligence",
                "bright internet",
                "trust",
                "augmented reality",
                "emotion detection",
                "explainable AI",
                "NFT marketplace",
                "digital embeddedness",
                "trading behavior"
            ],
            "sourceTypes": [
                "patent",
                "paper_pdf",
                "paper_metadata",
                "profile",
                "user_input"
            ],
            "chunks": [
                {
                    "id": "0fb807dfa4dc_p1_1",
                    "paperId": "0fb807dfa4dc",
                    "scholarId": "acmleung",
                    "title": "Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "Information Systems Frontiers (2025) 27:1337–1343 https://doi.org/10.1007/s10796-025-10632-z as it creates new uncertainties about evolving job roles and employment security. Of growing interest is the impact of Generative AI (GAI) products such as ChatGPT and Dall-E (Susarla et al., 2023). GAI platforms interact with users, generating texts and images from an expansive web of information. GAI tools are driven by large language models (LLMs) and typically are used in applications such as chatbots (Kushwaha & Kar, 2024). Beyond GAI in chatbots, AI is gradually percolating into different spheres of work in business. However, there is evidence that factors impacting user experiences and adop­ tion of AI tend to vary among stakeholders as roles for AI users continue to evolve (Kar & Kushwaha, 2023; Merhi, 2021). For example, a new area of wor",
                    "topicTags": [
                        "artificial intelligence",
                        "bright internet",
                        "trust"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/artificial-intelligence-and-the-bright-internet-transforming-the-/",
                    "file": "assets/scholars/acmleung/papers/9dddc36e4b.pdf"
                },
                {
                    "id": "0fb807dfa4dc_p1_2",
                    "paperId": "0fb807dfa4dc",
                    "scholarId": "acmleung",
                    "title": "Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "tend to vary among stakeholders as roles for AI users continue to evolve (Kar & Kushwaha, 2023; Merhi, 2021). For example, a new area of work deliverables has emerged in recent job descriptions: prompt engineering, which requires proficiency in using AI to obtain suitable programming code or business documentation. This devel­ opment has been particularly striking in the information technology (IT) and IT-enabled services industries, which are gradually moving from a low-code to a no-code envi­ ronment. Goldman Sachs predicts that AI automation will eliminate 300 million jobs worldwide (Kelley, 2023), and GAI is expected to expedite these changes. Given how easily content can be generated using GAI, concerns are arising about the spread of GAI-produced mis­ information and disinformation using social media. This may create societal challe",
                    "topicTags": [
                        "artificial intelligence",
                        "bright internet",
                        "trust"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/artificial-intelligence-and-the-bright-internet-transforming-the-/",
                    "file": "assets/scholars/acmleung/papers/9dddc36e4b.pdf"
                },
                {
                    "id": "0fb807dfa4dc_p1_3",
                    "paperId": "0fb807dfa4dc",
                    "scholarId": "acmleung",
                    "title": "Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "oncerns are arising about the spread of GAI-produced mis­ information and disinformation using social media. This may create societal challenges surrounding belief and trust in various platforms and institutions. Polarization of belief systems is likely to occur in virtual communities. Further echo-chamber effects may have a larger impact on the way polarization increases within virtual communities due to misuse of GAI-produced content. This could potentially have significant adverse impacts on various internet ecosys­ tems and their stakeholders. Recent editorial deliberations (Dwivedi et al., 2023) have highlighted how GAI can enhance productivity and change employment opportunities, particularly in terms of aug­ menting or complementing human skills. Some believe that 1 Introduction Artificial intelligence (AI) is the subject of growin",
                    "topicTags": [
                        "artificial intelligence",
                        "bright internet",
                        "trust"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/artificial-intelligence-and-the-bright-internet-transforming-the-/",
                    "file": "assets/scholars/acmleung/papers/9dddc36e4b.pdf"
                },
                {
                    "id": "0fb807dfa4dc_p1_4",
                    "paperId": "0fb807dfa4dc",
                    "scholarId": "acmleung",
                    "title": "Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "terms of aug­ menting or complementing human skills. Some believe that 1 Introduction Artificial intelligence (AI) is the subject of growing interest and debate worldwide, based on both the benefits and the adverse impact it may have and is already having on indi­ viduals, societies, and polity. Many studies have highlighted how AI is having both positive and negative effects in orga­ nizations. For example, AI is creating efficiencies through automation and enhancing productivity in areas such as operations, financial management, marketing, and human resource management. It is also bringing about greater reliability in project outcomes and is helping with innova­ tion and standardization of processes. AI is now pervading online ecosystems such as social media, digital platforms, and sharing economy platforms, where it is creating more e",
                    "topicTags": [
                        "artificial intelligence",
                        "bright internet",
                        "trust"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/artificial-intelligence-and-the-bright-internet-transforming-the-/",
                    "file": "assets/scholars/acmleung/papers/9dddc36e4b.pdf"
                },
                {
                    "id": "0fb807dfa4dc_p1_5",
                    "paperId": "0fb807dfa4dc",
                    "scholarId": "acmleung",
                    "title": "Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "s. AI is now pervading online ecosystems such as social media, digital platforms, and sharing economy platforms, where it is creating more engaging user experiences through content and user recom­ mendations. However, AI also has detrimental effects, such as contributing to technostress among users and employees Indranil Bose indranil.bose@neoma-bs.fr Arpan Kumar Kar arpankar@iitd.ac.in Gene Moo Lee gene.lee@sauder.ubc.ca Alvin Chung Man Leung acmleung@cityu.edu.hk Dan J. Kim dan.kim@unt.edu 1 NEOMA Business School, 59 rue Pierre Taittinger, Reims 51100, France 2 Indian Institute of Technology Delhi Hauz Khas, New Delhi 110016, India 3 University of British Columbia, Vancouver, Canada 4 City University of Hong Kong, Hong Kong, Hong Kong 5 University of North Texas, Denton, TX 76203, USA Published online: 23 August 2025 © The Author(s), un",
                    "topicTags": [
                        "artificial intelligence",
                        "bright internet",
                        "trust"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/artificial-intelligence-and-the-bright-internet-transforming-the-/",
                    "file": "assets/scholars/acmleung/papers/9dddc36e4b.pdf"
                },
                {
                    "id": "0fb807dfa4dc_p1_6",
                    "paperId": "0fb807dfa4dc",
                    "scholarId": "acmleung",
                    "title": "Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "y of Hong Kong, Hong Kong, Hong Kong 5 University of North Texas, Denton, TX 76203, USA Published online: 23 August 2025 © The Author(s), under exclusive licence to Springer Science+Business Media, LLC, part of Springer Nature 2025 Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future Indranil Bose1 · Arpan Kumar Kar2 · Gene Moo Lee3 · Alvin Chung Man Leung4 · Dan J. Kim5 1 3",
                    "topicTags": [
                        "artificial intelligence",
                        "bright internet",
                        "trust"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/artificial-intelligence-and-the-bright-internet-transforming-the-/",
                    "file": "assets/scholars/acmleung/papers/9dddc36e4b.pdf"
                },
                {
                    "id": "0fb807dfa4dc_p2_1",
                    "paperId": "0fb807dfa4dc",
                    "scholarId": "acmleung",
                    "title": "Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "Information Systems Frontiers (2025) 27:1337–1343 GAI may negatively impact the cognitive skills and critical thinking abilities of human users. However, others believe that industry and academia need to embrace GAI and cre­ ate environments that foster higher-level cognitive skills and innovation (Susarla et al., 2023). Many concerns about data privacy, fairness, accountability, and trust have been highlighted in recent editorials on the adverse impacts of AI (Mikalef et al., 2022; Sivarajah et al., 2023). It is widely argued that while AI may enable digital transformation, we must also work to ensure sustainable societies in the future (Pappas et al., 2023). Through this special issue, we aim to spark critical reflec­ tion, cross-disciplinary dialogue, and practical innovation. We invited scholars, policymakers, and practitioners to con",
                    "topicTags": [
                        "artificial intelligence",
                        "bright internet",
                        "trust"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/artificial-intelligence-and-the-bright-internet-transforming-the-/",
                    "file": "assets/scholars/acmleung/papers/9dddc36e4b.pdf"
                },
                {
                    "id": "0fb807dfa4dc_p2_2",
                    "paperId": "0fb807dfa4dc",
                    "scholarId": "acmleung",
                    "title": "Artificial Intelligence and the Bright Internet: Transforming the Internet for a Better Future",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "rk critical reflec­ tion, cross-disciplinary dialogue, and practical innovation. We invited scholars, policymakers, and practitioners to contribute to and extend the Bright Internet and Bright AI paradigm—bridging the gap between what is technically possible, what is ethically necessary, and what is globally sustainable. This special issue brought together leading researchers and practitioners to explore how we can reimag­ ine and re-engineer the foundations of cyberspace and AI to serve the public good. 2 The Bright Internet and Bright AI Framework We are living through a defining moment in the digital age. As global internet connectivity expands and AI becomes increasingly powerful and pervasive, societies are confronted with a dual reality. While these technologies offer transfor­ mative benefits—enhancing productivity, decision-making",
                    "topicTags": [
                        "artificial intelligence",
                        "bright internet",
                        "trust"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/artificial-intelligence-and-the-bright-internet-transforming-the-/",
                    "file": "assets/scholars/acmleung/papers/9dddc36e4b.pdf"
                }
            ],
            "metadataRecords": [
                {
                    "paperId": "e87e21772afc",
                    "scholarId": "acmleung",
                    "title": "At your fingertips: Do augmented reality gestures reveal product-related emotion?",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "augmented reality",
                        "emotion detection",
                        "explainable AI"
                    ],
                    "description": "Uses mobile AR touch gestures and explainable AI to infer product-related emotions.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/at-your-fingertips-do-augmented-reality-gestures-reveal-product-r/"
                },
                {
                    "paperId": "cd0afd144d84",
                    "scholarId": "acmleung",
                    "title": "Enhanced digital embeddedness and bubble mitigation in NFT marketplaces",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "NFT marketplace",
                        "digital embeddedness",
                        "trading behavior"
                    ],
                    "description": "Difference-in-differences study of rarity-rank labels and NFT trading behavior.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/enhanced-digital-embeddedness-and-bubble-mitigation-in-nft-market/"
                },
                {
                    "paperId": "e35df48c851c",
                    "scholarId": "acmleung",
                    "title": "Bot Moderation Dynamics in Online Investment Communities",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "As retail investor users scale on social media platforms, maintaining the financial informativeness of crowd-generated content becomes difficult. While automated content moderation is widely used in platform governance, its effectiveness for specialized knowledge domains remains underexplored. This study examines how dramatic community expansion influences bot moderation effectiveness in online investment communities by analyzing the GameStop event on Reddit's r/WallStreetBets. Using 1.7 million posts and 419,000 bot moderation comments from 2020-2021, we find that different bot moderations yield varying outcomes, depending on their alignment with the wisdom of crowds boundary conditions. Image-related moderation becomes more effective in the community shift, while humor-embedded moderation grows less effective. Media-related moderation shows different time-dependent effects: positive for short- term returns but negative for longer-term predictions. These findings contribute to platform governance literature on how bot moderation maintains financial information quality during rapid community expansion and provide practical implications for social media platform operations. © 2025,",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/bot-moderation-dynamics-in-online-investment-communities/"
                },
                {
                    "paperId": "9ceb92b77b32",
                    "scholarId": "acmleung",
                    "title": "Corporate Social Responsibility and Firm Value: Exploring the Moderating Effects of Information Technology-Enabled Knowledge Capabilities",
                    "year": "2024",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Purpose - A substantial amount of research has examined the firm value impact of corporate social responsibility (CSR). Nevertheless, the findings have been inconsistent, prompting researchers to identify contingencies under which the impact varies. This study examines how information technology (IT)-enabled knowledge capabilities moderate the relationship between CSR and firm value. Design/methodology/approach - We conducted the ordinary least squares (OLS) regression analysis on a sample of S&P 500 companies spanning from 2010 to 2017. We employed additional methods to test the robustness of the results, including the generalized method of moments (GMM) estimator and the two-stage least squares (2SLS) method. Findings - The results show that IT-enabled absorptive capability (IT-AC) and IT-enabled social integration capability (IT-SIC) positively moderate the CSR–value relationship. Further, their moderating effects vary in distinct ways when environmental dynamism changes, hinting at the distinct underlying rationales behind the moderating roles of IT-AC and IT-SIC. Research limitations/implications - This study improves the understanding of the business value of CSR and IT. It h",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/corporate-social-responsibility-and-firm-value-exploring-the-mode/"
                }
            ]
        },
        "patentMemory": [
            {
                "id": "CN117950627A",
                "publicationNumber": "CN117950627A",
                "title": "一種智能溯源及假新聞防範系統及防範方法",
                "field": "blockchain-trust",
                "industry": "区块链可信内容",
                "summary": "The present invention proposes an intelligent traceability and fake news prevention system and prevention method, which is based on the Ethereum ERC-721 smart contract. Users using the NFT certification platform first submit the information they publish to the NFT certification platform. The NFT certification platform checks the information uploaded by the user for duplicates. After the duplicate check, the information is cast into NFT through the ERC-721 smart contract, and the NFT is stored in an unalterable manner on the Ethereum blockchain. The platform publishes the information on the completion of NFT casting as a post with a verifiable NFT logo.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E6%99%BA%E8%83%BD%E6%BA%AF%E6%BA%90%E5%8F%8A%E5%81%87%E6%96%B0%E8%81%9E%E9%98%B2%E7%AF%84%E7%B3%BB%E7%B5%B1%E5%8F%8A%E9%98%B2%E7%AF%84%E6%96%B9%E6%B3%95/",
                "sourceType": "patent",
                "legalStatus": "Accepted/In press/Filed - 29 Nov 2023 | external lookup: CN117950627A pub=2024-04-30 assignee=香港城市大学深圳研究院 conf=low"
            }
        ]
    },
    {
        "id": "xingeyu",
        "name": "Xinge YU",
        "sourceName": "YU, Xinge",
        "email": "xingeyu@cityu.edu.hk",
        "auId": "xingeyu",
        "profileUrl": "https://scholars.cityu.edu.hk/en/persons/xingeyu/",
        "affiliation": "City University of Hong Kong, Department of Biomedical Engineering, Hong Kong, Peoples R China.",
        "affiliationTier": "top_university",
        "expertise": [
            "medical",
            "breathing",
            "respiratory",
            "radar"
        ],
        "patentIds": [
            "CN119563958A",
            "US12571139B2"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22Xinge%20YU%20/%20City%20University%20of%20Hong%20Kong%2C%20Department%20of%20Biomedical%20Engineering%2C%20Hong%20Kong%2C%20Peoples%20R%20China.%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%237c3aed%22/%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba%28255%2C255%2C255%2C0.24%29%22/%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba%28255%2C255%2C255%2C0.42%29%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3EXY%3C/text%3E%3C/svg%3E",
        "paperBackground": [
            {
                "scholarId": "xingeyu",
                "title": "A three-dimensional stretchable core-shell cable for soft and hybrid electronics",
                "year": "2026",
                "description": "Recyclable, patternable, noise-resistant stretchable cable for soft and hybrid wearable electronics.",
                "doi": "10.1038/s41928-026-01596-2",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-three-dimensional-stretchable-coreshell-cable-for-soft-and-hybr/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "soft electronics",
                    "wearable electronics",
                    "stretchable cable"
                ],
                "authors": [
                    "Xinge YU"
                ],
                "paperId": "d0d812d7c4c7"
            },
            {
                "scholarId": "xingeyu",
                "title": "An organ-conformal, kirigami-structured bioelectronic patch for precise intracellular delivery",
                "year": "2026",
                "description": "Customizable organ-conformal electro-transfection patch for spatially controlled intracellular delivery.",
                "doi": "10.1016/j.cell.2025.12.021",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-organ-conformal-kirigami-structured-bioelectronic-patch-for-pr/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "bioelectronics",
                    "kirigami",
                    "intracellular delivery"
                ],
                "authors": [
                    "Xinge YU"
                ],
                "paperId": "dbc3bfb00f96"
            },
            {
                "scholarId": "xingeyu",
                "title": "An All-in-One-Integrated Self-Powered Wearable Sensing System",
                "year": "2026",
                "description": "Integrated bioenergy harvesting, storage, and sensing system for multimodal health monitoring.",
                "doi": "10.1021/acsnano.5c17767",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-all-in-one-integrated-self-powered-wearable-sensing-system-for/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "wearable sensing",
                    "self-powered system",
                    "health monitoring"
                ],
                "authors": [
                    "Xinge YU"
                ],
                "paperId": "2222eb36497c"
            },
            {
                "title": "A Perspective on Non-Invasive Blood Pressure Monitoring: Bridging Emerging Principles, Enabling Technologies and Extended Applications",
                "authors": [
                    "Xinge YU"
                ],
                "year": "2026",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-perspective-on-non-invasive-blood-pressure-monitoring-bridging-/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "doi": "10.1109/RBME.2025.3646327",
                "abstract": "Cardiovascular disease (CVD), the leading global cause of death, highlights the critical need for effective blood pressure management. Non-invasive blood pressure (NIBP) monitoring, compared with invasive methods, enables home-based and long-term use, supporting early detection and continuous care. Despite significant progress, challenges remain, including accuracy issues, insufficient validation in real-world settings, limited application-specific sensor designs, and inadequate calibration standards and validation platforms. These gaps call for a systematic review to clarify the unmet needs and future research directions. This article reviews current advances in four key areas: (1) novel NIBP estimation principles designed to minimize user intervention; (2) flexible and wearable electronics that improve accuracy and comfort; (3) integration with theranostic applications and broader healthcare scenarios enabled by NIBP technologies; (4) calibration and validation strategies that enhance reliability and accuracy. With the rapid growth of home healthcare and AI-enabled wearable systems, addressing these challenges is essential to advance personalized, precise and stable cardiovascula",
                "description": "Cardiovascular disease (CVD), the leading global cause of death, highlights the critical need for effective blood pressure management. Non-invasive blood pressure (NIBP) monitoring, compared with invasive methods, enables home-based and long-term use, supporting early detection and continuous care. Despite significant progress, challenges remain, including accuracy issues, insufficient validation in real-world settings, limited application-specific sensor designs, and inadequate calibration standards and validation platforms. These gaps call for a systematic review to clarify the unmet needs and future research directions. This article reviews current advances in four key areas: (1) novel NIBP estimation principles designed to minimize user intervention; (2) flexible and wearable electronics that improve accuracy and comfort; (3) integration with theranostic applications and broader healthcare scenarios enabled by NIBP technologies; (4) calibration and validation strategies that enhance reliability and accuracy. With the rapid growth of home healthcare and AI-enabled wearable systems, addressing these challenges is essential to advance personalized, precise and stable cardiovascula",
                "openAccess": {
                    "isOpenAccess": false,
                    "status": "closed",
                    "url": "",
                    "repositoryHasFullText": false
                },
                "paperId": "0823569c308f"
            },
            {
                "title": "A review of microfluidic technologies for thermal management in flexible electronics",
                "authors": [
                    "Xinge YU"
                ],
                "year": "2026",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-review-of-microfluidic-technologies-for-thermal-management-in-f/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "doi": "10.1039/d5lc00906e",
                "abstract": "Flexible electronics with the features of soft, ultrathin, and shape adaptable properties, are believed as next-generation devices for physiological monitoring, digital diagnostics, and human–computer interaction. With the development of devices towards miniaturization and integration, thermal management has emerged as an essential challenge, which not only influences device performance and long-term stability but also affects user comfort. Various thermal management strategies, including passive and active approaches, have been employed to regulate the operating temperature. Nevertheless, it is still challenging to develop thermal regulation systems with a large temperature regulation range, good temperature uniformity, and high mechanical flexibility. Recently, the microfluidics-based thermal regulation method has emerged as a promising method that integrates active and passive thermoregulation methods. This review explores the thermal management mechanisms enabled by microfluidic devices, emphasizing an integrated strategy that combines material selection, structural geometry, and system optimization to enhance thermal performance. We analyze heat transfer principles in microcha",
                "description": "Flexible electronics with the features of soft, ultrathin, and shape adaptable properties, are believed as next-generation devices for physiological monitoring, digital diagnostics, and human–computer interaction. With the development of devices towards miniaturization and integration, thermal management has emerged as an essential challenge, which not only influences device performance and long-term stability but also affects user comfort. Various thermal management strategies, including passive and active approaches, have been employed to regulate the operating temperature. Nevertheless, it is still challenging to develop thermal regulation systems with a large temperature regulation range, good temperature uniformity, and high mechanical flexibility. Recently, the microfluidics-based thermal regulation method has emerged as a promising method that integrates active and passive thermoregulation methods. This review explores the thermal management mechanisms enabled by microfluidic devices, emphasizing an integrated strategy that combines material selection, structural geometry, and system optimization to enhance thermal performance. We analyze heat transfer principles in microcha",
                "openAccess": {
                    "isOpenAccess": false,
                    "status": "closed",
                    "url": "",
                    "repositoryHasFullText": false
                },
                "paperId": "41eb34b8045b"
            }
        ],
        "profileUrls": [
            "https://scholars.cityu.edu.hk/en/persons/xingeyu/",
            "https://www.cityu.edu.hk/stfprofile/xingeyu.htm"
        ],
        "identityRules": [
            {
                "id": "identity_controlled_proxy",
                "priority": 100,
                "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
            },
            {
                "id": "identity_no_institutional_commitment",
                "priority": 95,
                "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
            }
        ],
        "evidenceRules": [
            {
                "id": "evidence_type_boundary",
                "priority": 100,
                "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
            },
            {
                "id": "evidence_no_fabrication",
                "priority": 100,
                "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
            },
            {
                "id": "evidence_metadata_limit",
                "priority": 90,
                "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
            }
        ],
        "scholarRules": [
            {
                "id": "scholar_field_scope",
                "priority": 85,
                "text": "Prefer answers grounded in Xinge YU's public patent ownership, paper background and expertise fields.",
                "fields": [
                    "medical",
                    "breathing",
                    "respiratory",
                    "radar"
                ]
            },
            {
                "id": "scholar_voice",
                "priority": 55,
                "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
            },
            {
                "id": "scholar_gap_disclosure",
                "priority": 80,
                "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
            }
        ],
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
            }
        ],
        "rules": {
            "identityRules": [
                {
                    "id": "identity_controlled_proxy",
                    "priority": 100,
                    "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
                },
                {
                    "id": "identity_no_institutional_commitment",
                    "priority": 95,
                    "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
                }
            ],
            "evidenceRules": [
                {
                    "id": "evidence_type_boundary",
                    "priority": 100,
                    "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
                },
                {
                    "id": "evidence_no_fabrication",
                    "priority": 100,
                    "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
                },
                {
                    "id": "evidence_metadata_limit",
                    "priority": 90,
                    "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
                }
            ],
            "scholarRules": [
                {
                    "id": "scholar_field_scope",
                    "priority": 85,
                    "text": "Prefer answers grounded in Xinge YU's public patent ownership, paper background and expertise fields.",
                    "fields": [
                        "medical",
                        "breathing",
                        "respiratory",
                        "radar"
                    ]
                },
                {
                    "id": "scholar_voice",
                    "priority": 55,
                    "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
                },
                {
                    "id": "scholar_gap_disclosure",
                    "priority": 80,
                    "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
                }
            ],
            "patentRules": [
                {
                    "id": "patent_first",
                    "priority": 100,
                    "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
                },
                {
                    "id": "no_claim_expansion",
                    "priority": 100,
                    "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
                },
                {
                    "id": "no_legal_conclusion",
                    "priority": 95,
                    "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
                }
            ]
        },
        "skills": [
            {
                "id": "patent_fact_extractor",
                "name": "Patent Fact Extractor",
                "description": "Extract current patent title, abstract, field, public source and local original facts before answering.",
                "sourceTypes": [
                    "patent"
                ],
                "priority": 100,
                "triggers": [
                    "all_patent_questions",
                    "selected_patent_context"
                ]
            },
            {
                "id": "paper_evidence_retriever",
                "name": "Paper Evidence Retriever",
                "description": "Retrieve scholar-bound downloaded PDF chunks and metadata-only paper records that match the question.",
                "sourceTypes": [
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 80,
                "triggers": [
                    "research_basis",
                    "technical_explanation",
                    "business_analysis"
                ]
            },
            {
                "id": "commercialization_assessor",
                "name": "Commercialization Assessor",
                "description": "Translate patent and paper evidence into enterprise scenarios, buyer fit and trial path assumptions.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "user_input"
                ],
                "priority": 70,
                "triggers": [
                    "business_analysis",
                    "licensing_next_step"
                ]
            },
            {
                "id": "technical_due_diligence",
                "name": "Technical Due Diligence",
                "description": "Identify technical, data, equipment, integration and validation gaps that require follow-up.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 65,
                "triggers": [
                    "technical_explanation",
                    "risk_question",
                    "business_analysis"
                ]
            },
            {
                "id": "risk_guard",
                "name": "Risk Guard",
                "description": "Block overclaiming, fabricated citations, legal conclusions and treating metadata-only records as full text.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 100,
                "triggers": [
                    "all_answers",
                    "risk_question",
                    "legal_question"
                ]
            },
            {
                "id": "citation_answer_builder",
                "name": "Citation Answer Builder",
                "description": "Build concise answers with explicit source boundaries and reference chips.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 75,
                "triggers": [
                    "all_answers"
                ]
            }
        ],
        "sessionContext": {
            "selectedPatentPolicy": "active_patent_first",
            "longTermMemoryPolicy": "Only user preferences, enterprise demand context and conversation decisions may persist; scholar, patent and paper facts must come from controlled source data.",
            "answerContextPolicy": "Retrieve only the most relevant patent facts and top paper evidence for each turn."
        },
        "paperMemory": [
            {
                "paperId": "d0d812d7c4c7",
                "scholarId": "xingeyu",
                "title": "A three-dimensional stretchable core-shell cable for soft and hybrid electronics",
                "year": "2026",
                "authors": [
                    "Xinge YU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "soft electronics",
                    "wearable electronics",
                    "stretchable cable"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-three-dimensional-stretchable-coreshell-cable-for-soft-and-hybr/",
                "file": "",
                "description": "Recyclable, patternable, noise-resistant stretchable cable for soft and hybrid wearable electronics."
            },
            {
                "paperId": "dbc3bfb00f96",
                "scholarId": "xingeyu",
                "title": "An organ-conformal, kirigami-structured bioelectronic patch for precise intracellular delivery",
                "year": "2026",
                "authors": [
                    "Xinge YU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "bioelectronics",
                    "kirigami",
                    "intracellular delivery"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-organ-conformal-kirigami-structured-bioelectronic-patch-for-pr/",
                "file": "",
                "description": "Customizable organ-conformal electro-transfection patch for spatially controlled intracellular delivery."
            },
            {
                "paperId": "2222eb36497c",
                "scholarId": "xingeyu",
                "title": "An All-in-One-Integrated Self-Powered Wearable Sensing System",
                "year": "2026",
                "authors": [
                    "Xinge YU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "wearable sensing",
                    "self-powered system",
                    "health monitoring"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-all-in-one-integrated-self-powered-wearable-sensing-system-for/",
                "file": "",
                "description": "Integrated bioenergy harvesting, storage, and sensing system for multimodal health monitoring."
            },
            {
                "paperId": "0823569c308f",
                "scholarId": "xingeyu",
                "title": "A Perspective on Non-Invasive Blood Pressure Monitoring: Bridging Emerging Principles, Enabling Technologies and Extended Applications",
                "year": "2026",
                "authors": [
                    "Xinge YU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-perspective-on-non-invasive-blood-pressure-monitoring-bridging-/",
                "file": "",
                "description": "Cardiovascular disease (CVD), the leading global cause of death, highlights the critical need for effective blood pressure management. Non-invasive blood pressure (NIBP) monitoring, compared with invasive methods, enables home-based and long-term use, supporting early detection and continuous care. Despite significant progress, challenges remain, including accuracy issues, insufficient validation in real-world settings, limited application-specific sensor designs, and inadequate calibration standards and validation platforms. These gaps call for a systematic review to clarify the unmet needs and future research directions. This article reviews current advances in four key areas: (1) novel NIBP estimation principles designed to minimize user intervention; (2) flexible and wearable electronics that improve accuracy and comfort; (3) integration with theranostic applications and broader healthcare scenarios enabled by NIBP technologies; (4) calibration and validation strategies that enhance reliability and accuracy. With the rapid growth of home healthcare and AI-enabled wearable systems, addressing these challenges is essential to advance personalized, precise and stable cardiovascula"
            },
            {
                "paperId": "41eb34b8045b",
                "scholarId": "xingeyu",
                "title": "A review of microfluidic technologies for thermal management in flexible electronics",
                "year": "2026",
                "authors": [
                    "Xinge YU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-review-of-microfluidic-technologies-for-thermal-management-in-f/",
                "file": "",
                "description": "Flexible electronics with the features of soft, ultrathin, and shape adaptable properties, are believed as next-generation devices for physiological monitoring, digital diagnostics, and human–computer interaction. With the development of devices towards miniaturization and integration, thermal management has emerged as an essential challenge, which not only influences device performance and long-term stability but also affects user comfort. Various thermal management strategies, including passive and active approaches, have been employed to regulate the operating temperature. Nevertheless, it is still challenging to develop thermal regulation systems with a large temperature regulation range, good temperature uniformity, and high mechanical flexibility. Recently, the microfluidics-based thermal regulation method has emerged as a promising method that integrates active and passive thermoregulation methods. This review explores the thermal management mechanisms enabled by microfluidic devices, emphasizing an integrated strategy that combines material selection, structural geometry, and system optimization to enhance thermal performance. We analyze heat transfer principles in microcha"
            }
        ],
        "knowledgeIndex": {
            "path": "assets/scholars/xingeyu/knowledge/index.json",
            "paperCount": 5,
            "downloadedPdfCount": 0,
            "metadataOnlyCount": 5,
            "chunkCount": 0,
            "topics": [
                "soft electronics",
                "wearable electronics",
                "stretchable cable",
                "bioelectronics",
                "kirigami",
                "intracellular delivery",
                "wearable sensing",
                "self-powered system",
                "health monitoring"
            ],
            "sourceTypes": [
                "patent",
                "paper_pdf",
                "paper_metadata",
                "profile",
                "user_input"
            ],
            "chunks": [],
            "metadataRecords": [
                {
                    "paperId": "d0d812d7c4c7",
                    "scholarId": "xingeyu",
                    "title": "A three-dimensional stretchable core-shell cable for soft and hybrid electronics",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "soft electronics",
                        "wearable electronics",
                        "stretchable cable"
                    ],
                    "description": "Recyclable, patternable, noise-resistant stretchable cable for soft and hybrid wearable electronics.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-three-dimensional-stretchable-coreshell-cable-for-soft-and-hybr/"
                },
                {
                    "paperId": "dbc3bfb00f96",
                    "scholarId": "xingeyu",
                    "title": "An organ-conformal, kirigami-structured bioelectronic patch for precise intracellular delivery",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "bioelectronics",
                        "kirigami",
                        "intracellular delivery"
                    ],
                    "description": "Customizable organ-conformal electro-transfection patch for spatially controlled intracellular delivery.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-organ-conformal-kirigami-structured-bioelectronic-patch-for-pr/"
                },
                {
                    "paperId": "2222eb36497c",
                    "scholarId": "xingeyu",
                    "title": "An All-in-One-Integrated Self-Powered Wearable Sensing System",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "wearable sensing",
                        "self-powered system",
                        "health monitoring"
                    ],
                    "description": "Integrated bioenergy harvesting, storage, and sensing system for multimodal health monitoring.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-all-in-one-integrated-self-powered-wearable-sensing-system-for/"
                },
                {
                    "paperId": "0823569c308f",
                    "scholarId": "xingeyu",
                    "title": "A Perspective on Non-Invasive Blood Pressure Monitoring: Bridging Emerging Principles, Enabling Technologies and Extended Applications",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Cardiovascular disease (CVD), the leading global cause of death, highlights the critical need for effective blood pressure management. Non-invasive blood pressure (NIBP) monitoring, compared with invasive methods, enables home-based and long-term use, supporting early detection and continuous care. Despite significant progress, challenges remain, including accuracy issues, insufficient validation in real-world settings, limited application-specific sensor designs, and inadequate calibration standards and validation platforms. These gaps call for a systematic review to clarify the unmet needs and future research directions. This article reviews current advances in four key areas: (1) novel NIBP estimation principles designed to minimize user intervention; (2) flexible and wearable electronics that improve accuracy and comfort; (3) integration with theranostic applications and broader healthcare scenarios enabled by NIBP technologies; (4) calibration and validation strategies that enhance reliability and accuracy. With the rapid growth of home healthcare and AI-enabled wearable systems, addressing these challenges is essential to advance personalized, precise and stable cardiovascula",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-perspective-on-non-invasive-blood-pressure-monitoring-bridging-/"
                },
                {
                    "paperId": "41eb34b8045b",
                    "scholarId": "xingeyu",
                    "title": "A review of microfluidic technologies for thermal management in flexible electronics",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Flexible electronics with the features of soft, ultrathin, and shape adaptable properties, are believed as next-generation devices for physiological monitoring, digital diagnostics, and human–computer interaction. With the development of devices towards miniaturization and integration, thermal management has emerged as an essential challenge, which not only influences device performance and long-term stability but also affects user comfort. Various thermal management strategies, including passive and active approaches, have been employed to regulate the operating temperature. Nevertheless, it is still challenging to develop thermal regulation systems with a large temperature regulation range, good temperature uniformity, and high mechanical flexibility. Recently, the microfluidics-based thermal regulation method has emerged as a promising method that integrates active and passive thermoregulation methods. This review explores the thermal management mechanisms enabled by microfluidic devices, emphasizing an integrated strategy that combines material selection, structural geometry, and system optimization to enhance thermal performance. We analyze heat transfer principles in microcha",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-review-of-microfluidic-technologies-for-thermal-management-in-f/"
                }
            ]
        },
        "patentMemory": [
            {
                "id": "CN119563958A",
                "publicationNumber": "CN119563958A",
                "title": "仿生熱調節織物和其構建方法",
                "field": "medical-sensing",
                "industry": "医疗健康",
                "summary": "Provided is a bionic thermal regulating fabric that mimics an army ant campsite and a method for constructing the same. The bionic thermal regulating fabric comprises a plurality of yarns, the plurality of yarns being formed by textile fibers having water-driven curling behavior, wherein the plurality of yarns are woven by a transfer loop organization to form an asymmetric fabric structure, the fabric structure having a positive water-driven expansion rate along a first axis and a negative water-driven expansion rate along a second axis orthogonal to the first axis. The surface of the textile fiber is plasma treated to have one or more hydrophilic functional groups. One or more colorimetric fabric sensors are incorporated to generate colors in response to one or more ambient environmental conditions or user physiological conditions, respectively. The present invention has excellent scalability, biocompatibility, and good dynamic durability, and is advantageous for use in sportswear, outdoor clothing, and medical textiles.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%BB%BF%E7%94%9F%E7%86%B1%E8%AA%BF%E7%AF%80%E7%B9%94%E7%89%A9%E5%92%8C%E5%85%B6%E6%A7%8B%E5%BB%BA%E6%96%B9%E6%B3%95/",
                "sourceType": "patent",
                "legalStatus": "Accepted/In press/Filed - 24 Jul 2024 | external lookup: CN119563958A pub=2025-03-07 assignee=香港城市大学 conf=medium"
            },
            {
                "id": "US12571139B2",
                "publicationNumber": "US12571139B2",
                "title": "Biomimetic Thermal Regulating Fabric and Method for Constructing the Same",
                "field": "medical-sensing",
                "industry": "医疗健康",
                "summary": "A biomimetic thermal regulating fabric (BTRF) imitating army ant bivouacs and a method for constructing the same are provided. The BTRF comprises a plurality of yarns formed of textile fibres having a water-actuated crimp behaviour, wherein the plurality of yarns is knitted by means of transfer stitch to form an unsymmetrical fabric structure which has a positive water-actuated expansion rate along a first axis and a negative water-actuated expansion rate along a second axis orthogonal to the first axis. Surfaces of the textile fibres are plasma-treated to have one or more hydrophilic functional groups. One or more colorimetric fabric sensors are incorporated to generate colours in response to one or more ambient environmental conditions or user physiological conditions respectively. The present invention has excellent scalability, biocompatibility, and great dynamic durability, and is advantageous for applications in athletic wear, outdoor wear, and medical textiles.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/biomimetic-thermal-regulating-fabric-and-method-for-constructing-/",
                "sourceType": "patent",
                "legalStatus": "Published - 10 Mar 2026 | external lookup: US12571139B2 pub=2026-03-10 assignee=City University Of Hong Kong conf=manual"
            }
        ]
    },
    {
        "id": "hanlinli",
        "name": "Han Lin LI",
        "sourceName": "LI, Han Lin",
        "email": "hanlinli@cityu.edu.hk",
        "auId": "hanlinli",
        "profileUrl": "https://scholars.cityu.edu.hk/en/persons/hanlinli/",
        "affiliation": "City University of Hong Kong, Hong Kong Institute for Advanced Study, Hong Kong, Peoples R China.",
        "affiliationTier": "top_university",
        "expertise": [
            "optimization",
            "polynomial",
            "integer variables",
            "solver"
        ],
        "patentIds": [
            "US20230385365A1"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22Han%20Lin%20LI%20/%20City%20University%20of%20Hong%20Kong%2C%20Hong%20Kong%20Institute%20for%20Advanced%20Study%2C%20Hong%20Kong%2C%20Peoples%20R%20China.%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%23dc2626%22/%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba%28255%2C255%2C255%2C0.24%29%22/%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba%28255%2C255%2C255%2C0.42%29%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3EHL%3C/text%3E%3C/svg%3E",
        "paperBackground": [
            {
                "scholarId": "hanlinli",
                "title": "Unifying colors by primes",
                "year": "2023",
                "description": "Prime-number-based universal color coding system for encoding and manipulating colors.",
                "doi": "10.1038/s41377-023-01073-x",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/unifying-colors-by-primes/",
                "pdfUrl": "https://www.nature.com/articles/s41377-023-01073-x.pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "prime numbers",
                    "color coding",
                    "optimization"
                ],
                "authors": [
                    "Han Lin LI"
                ],
                "file": "assets/scholars/hanlinli/papers/8f1b923633.pdf",
                "downloadUrl": "https://www.nature.com/articles/s41377-023-01073-x.pdf",
                "paperId": "1bd5c978c2b5"
            },
            {
                "scholarId": "hanlinli",
                "title": "Forming a therapeutic sphere to treat ailments using optimization techniques",
                "year": "2023",
                "description": "Converts a therapeutic table into a spherical visualization using optimization techniques.",
                "doi": "10.1111/itor.13173",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/forming-a-therapeutic-sphere-to-treat-ailments-using-optimization/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "optimization",
                    "therapeutic visualization",
                    "operations research"
                ],
                "authors": [
                    "Han Lin LI"
                ],
                "paperId": "477f9546531c"
            },
            {
                "scholarId": "hanlinli",
                "title": "Prime-Number-Based Parallel Solver for Engineering Design Optimization Problems",
                "year": "2022",
                "description": "Patent/publication record for partitioning polynomial integer optimization problems using prime-number-based parallelization.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/prime-number-based-parallel-solver-for-engineering-design-optimiz/",
                "downloadStatus": "metadata_only",
                "confidence": "medium",
                "topicTags": [
                    "prime numbers",
                    "parallel solver",
                    "engineering optimization"
                ],
                "authors": [
                    "Han Lin LI"
                ],
                "paperId": "27c1e36a15a9"
            },
            {
                "title": "System And Method For Performing Operation Using Linear-Integer-Programing For Rsa Factorization",
                "authors": [
                    "Han Lin LI"
                ],
                "year": "2026",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/system-and-method-for-performing-operation-using-linear-integer-p/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "description": "Public scholarly background metadata for the digital advisor.",
                "paperId": "60534b12c302"
            },
            {
                "title": "Prime-Number-Based Parallel Solver For Engineering Design Optimization Problems Of Polynomial Forms With Integer Variables",
                "authors": [
                    "Han Lin LI"
                ],
                "year": "2022",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/prime-number-based-parallel-solver-for-engineering-design-optimiz/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "description": "Public scholarly background metadata for the digital advisor.",
                "paperId": "27c1e36a15a9"
            },
            {
                "title": "Universal Color Coding System, And Method of Analyzing Objects with Multiple Attributes Using The Color Coding System",
                "authors": [
                    "Han Lin LI"
                ],
                "year": "2022",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/universal-color-coding-system-and-method-of-analyzing-objects-wit/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "description": "Public scholarly background metadata for the digital advisor.",
                "paperId": "67615de383f1"
            }
        ],
        "profileUrls": [
            "https://scholars.cityu.edu.hk/en/persons/hanlinli/"
        ],
        "identityRules": [
            {
                "id": "identity_controlled_proxy",
                "priority": 100,
                "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
            },
            {
                "id": "identity_no_institutional_commitment",
                "priority": 95,
                "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
            }
        ],
        "evidenceRules": [
            {
                "id": "evidence_type_boundary",
                "priority": 100,
                "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
            },
            {
                "id": "evidence_no_fabrication",
                "priority": 100,
                "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
            },
            {
                "id": "evidence_metadata_limit",
                "priority": 90,
                "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
            }
        ],
        "scholarRules": [
            {
                "id": "scholar_field_scope",
                "priority": 85,
                "text": "Prefer answers grounded in Han Lin LI's public patent ownership, paper background and expertise fields.",
                "fields": [
                    "optimization",
                    "polynomial",
                    "integer variables",
                    "solver"
                ]
            },
            {
                "id": "scholar_voice",
                "priority": 55,
                "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
            },
            {
                "id": "scholar_gap_disclosure",
                "priority": 80,
                "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
            }
        ],
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
            }
        ],
        "rules": {
            "identityRules": [
                {
                    "id": "identity_controlled_proxy",
                    "priority": 100,
                    "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
                },
                {
                    "id": "identity_no_institutional_commitment",
                    "priority": 95,
                    "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
                }
            ],
            "evidenceRules": [
                {
                    "id": "evidence_type_boundary",
                    "priority": 100,
                    "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
                },
                {
                    "id": "evidence_no_fabrication",
                    "priority": 100,
                    "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
                },
                {
                    "id": "evidence_metadata_limit",
                    "priority": 90,
                    "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
                }
            ],
            "scholarRules": [
                {
                    "id": "scholar_field_scope",
                    "priority": 85,
                    "text": "Prefer answers grounded in Han Lin LI's public patent ownership, paper background and expertise fields.",
                    "fields": [
                        "optimization",
                        "polynomial",
                        "integer variables",
                        "solver"
                    ]
                },
                {
                    "id": "scholar_voice",
                    "priority": 55,
                    "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
                },
                {
                    "id": "scholar_gap_disclosure",
                    "priority": 80,
                    "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
                }
            ],
            "patentRules": [
                {
                    "id": "patent_first",
                    "priority": 100,
                    "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
                },
                {
                    "id": "no_claim_expansion",
                    "priority": 100,
                    "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
                },
                {
                    "id": "no_legal_conclusion",
                    "priority": 95,
                    "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
                }
            ]
        },
        "skills": [
            {
                "id": "patent_fact_extractor",
                "name": "Patent Fact Extractor",
                "description": "Extract current patent title, abstract, field, public source and local original facts before answering.",
                "sourceTypes": [
                    "patent"
                ],
                "priority": 100,
                "triggers": [
                    "all_patent_questions",
                    "selected_patent_context"
                ]
            },
            {
                "id": "paper_evidence_retriever",
                "name": "Paper Evidence Retriever",
                "description": "Retrieve scholar-bound downloaded PDF chunks and metadata-only paper records that match the question.",
                "sourceTypes": [
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 80,
                "triggers": [
                    "research_basis",
                    "technical_explanation",
                    "business_analysis"
                ]
            },
            {
                "id": "commercialization_assessor",
                "name": "Commercialization Assessor",
                "description": "Translate patent and paper evidence into enterprise scenarios, buyer fit and trial path assumptions.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "user_input"
                ],
                "priority": 70,
                "triggers": [
                    "business_analysis",
                    "licensing_next_step"
                ]
            },
            {
                "id": "technical_due_diligence",
                "name": "Technical Due Diligence",
                "description": "Identify technical, data, equipment, integration and validation gaps that require follow-up.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 65,
                "triggers": [
                    "technical_explanation",
                    "risk_question",
                    "business_analysis"
                ]
            },
            {
                "id": "risk_guard",
                "name": "Risk Guard",
                "description": "Block overclaiming, fabricated citations, legal conclusions and treating metadata-only records as full text.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 100,
                "triggers": [
                    "all_answers",
                    "risk_question",
                    "legal_question"
                ]
            },
            {
                "id": "citation_answer_builder",
                "name": "Citation Answer Builder",
                "description": "Build concise answers with explicit source boundaries and reference chips.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 75,
                "triggers": [
                    "all_answers"
                ]
            }
        ],
        "sessionContext": {
            "selectedPatentPolicy": "active_patent_first",
            "longTermMemoryPolicy": "Only user preferences, enterprise demand context and conversation decisions may persist; scholar, patent and paper facts must come from controlled source data.",
            "answerContextPolicy": "Retrieve only the most relevant patent facts and top paper evidence for each turn."
        },
        "paperMemory": [
            {
                "paperId": "1bd5c978c2b5",
                "scholarId": "hanlinli",
                "title": "Unifying colors by primes",
                "year": "2023",
                "authors": [
                    "Han Lin LI"
                ],
                "sourceType": "paper_pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "prime numbers",
                    "color coding",
                    "optimization"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/unifying-colors-by-primes/",
                "file": "assets/scholars/hanlinli/papers/8f1b923633.pdf",
                "description": "Prime-number-based universal color coding system for encoding and manipulating colors."
            },
            {
                "paperId": "477f9546531c",
                "scholarId": "hanlinli",
                "title": "Forming a therapeutic sphere to treat ailments using optimization techniques",
                "year": "2023",
                "authors": [
                    "Han Lin LI"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "optimization",
                    "therapeutic visualization",
                    "operations research"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/forming-a-therapeutic-sphere-to-treat-ailments-using-optimization/",
                "file": "",
                "description": "Converts a therapeutic table into a spherical visualization using optimization techniques."
            },
            {
                "paperId": "27c1e36a15a9",
                "scholarId": "hanlinli",
                "title": "Prime-Number-Based Parallel Solver for Engineering Design Optimization Problems",
                "year": "2022",
                "authors": [
                    "Han Lin LI"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "medium",
                "topicTags": [
                    "prime numbers",
                    "parallel solver",
                    "engineering optimization"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/prime-number-based-parallel-solver-for-engineering-design-optimiz/",
                "file": "",
                "description": "Patent/publication record for partitioning polynomial integer optimization problems using prime-number-based parallelization."
            },
            {
                "paperId": "60534b12c302",
                "scholarId": "hanlinli",
                "title": "System And Method For Performing Operation Using Linear-Integer-Programing For Rsa Factorization",
                "year": "2026",
                "authors": [
                    "Han Lin LI"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/system-and-method-for-performing-operation-using-linear-integer-p/",
                "file": "",
                "description": "Public scholarly background metadata for the digital advisor."
            },
            {
                "paperId": "27c1e36a15a9",
                "scholarId": "hanlinli",
                "title": "Prime-Number-Based Parallel Solver For Engineering Design Optimization Problems Of Polynomial Forms With Integer Variables",
                "year": "2022",
                "authors": [
                    "Han Lin LI"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/prime-number-based-parallel-solver-for-engineering-design-optimiz/",
                "file": "",
                "description": "Public scholarly background metadata for the digital advisor."
            },
            {
                "paperId": "67615de383f1",
                "scholarId": "hanlinli",
                "title": "Universal Color Coding System, And Method of Analyzing Objects with Multiple Attributes Using The Color Coding System",
                "year": "2022",
                "authors": [
                    "Han Lin LI"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/universal-color-coding-system-and-method-of-analyzing-objects-wit/",
                "file": "",
                "description": "Public scholarly background metadata for the digital advisor."
            }
        ],
        "knowledgeIndex": {
            "path": "assets/scholars/hanlinli/knowledge/index.json",
            "paperCount": 6,
            "downloadedPdfCount": 1,
            "metadataOnlyCount": 5,
            "chunkCount": 8,
            "topics": [
                "prime numbers",
                "color coding",
                "optimization",
                "therapeutic visualization",
                "operations research",
                "parallel solver",
                "engineering optimization"
            ],
            "sourceTypes": [
                "patent",
                "paper_pdf",
                "paper_metadata",
                "profile",
                "user_input"
            ],
            "chunks": [
                {
                    "id": "1bd5c978c2b5_p1_1",
                    "paperId": "1bd5c978c2b5",
                    "scholarId": "hanlinli",
                    "title": "Unifying colors by primes",
                    "year": "2023",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "Li et al. Light: Science & Applications (2023) 12:32 Ofﬁcial journal of the CIOMP 2047-7538 https://doi.org/10.1038/s41377-023-01073-x www.nature.com/lsa A R T I C L E O p e n A c c e s s Unifying colors by primes Han-Lin Li1, Shu-Cherng Fang2, Bertrand M. T. Lin 3 and Way Kuo4✉ Abstract RGB and CYMK are two major coloring schemes currently available for light colors and pigment colors, respectively. Both systems use letter-based color codes that require a large range of values to represent different colors. The problem is that these two systems are hard to use for manipulating any operations involving combinations of colors, and they lack the capacity for inter-changeability or uniﬁcation. Based on prime number theory and Goldbach’s conjecture, this study presents a universal color system (C235) using a number-based structure to encode,",
                    "topicTags": [
                        "prime numbers",
                        "color coding",
                        "optimization"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/unifying-colors-by-primes/",
                    "file": "assets/scholars/hanlinli/papers/8f1b923633.pdf"
                },
                {
                    "id": "1bd5c978c2b5_p1_2",
                    "paperId": "1bd5c978c2b5",
                    "scholarId": "hanlinli",
                    "title": "Unifying colors by primes",
                    "year": "2023",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "rime number theory and Goldbach’s conjecture, this study presents a universal color system (C235) using a number-based structure to encode, compute and unify all colors on a color wheel. The proposed C235 system offers a uniﬁed representation for the efﬁcient encoding and effective manipulation of color. It can be applied to designing a high-rate LCD system and colorizing objects with multiple attributes and DNA codons, opening the door to manipulating colors and lights for even broader applications. Introduction Numbers and colors are powerful tools for expressing objects such as people, goods, and DNA. The former can quantify objects and the latter can represent them visually. Isaac Newton’s theory of light claims that all colors can be generated from three basic colors: red, green, and blue1. Originating from Newton’s theory1, RGB (Red",
                    "topicTags": [
                        "prime numbers",
                        "color coding",
                        "optimization"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/unifying-colors-by-primes/",
                    "file": "assets/scholars/hanlinli/papers/8f1b923633.pdf"
                },
                {
                    "id": "1bd5c978c2b5_p1_3",
                    "paperId": "1bd5c978c2b5",
                    "scholarId": "hanlinli",
                    "title": "Unifying colors by primes",
                    "year": "2023",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "of light claims that all colors can be generated from three basic colors: red, green, and blue1. Originating from Newton’s theory1, RGB (Red, Green, Blue), a light-color structure that contains 3 × 256 values of letter symbols, and CMYK (Cyan, Magenta, Yellow, Key black), a pigment-color structure that contains 4 × 100 values of letter symbols2,3, have become the most popular color frames used today. Most of the other color frames, such as HSV (Hue, Saturation, Value) are derived from RGB and CMYK3. In the RGB frame, each of R, G, and B colors has 256 values expressed as [0, 1, 2,…, 255], and is coded as (r, g, b). In the CMYK frame, each of C, M, Y, and K has 100 values, expressed as [0, 1, 2,…, 99], and is coded as (c, m, y, k). The weakness of the current CMYK and RGB frames are given below. (i) Expression problems: R, G, B and C, M, Y",
                    "topicTags": [
                        "prime numbers",
                        "color coding",
                        "optimization"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/unifying-colors-by-primes/",
                    "file": "assets/scholars/hanlinli/papers/8f1b923633.pdf"
                },
                {
                    "id": "1bd5c978c2b5_p1_4",
                    "paperId": "1bd5c978c2b5",
                    "scholarId": "hanlinli",
                    "title": "Unifying colors by primes",
                    "year": "2023",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "and is coded as (c, m, y, k). The weakness of the current CMYK and RGB frames are given below. (i) Expression problems: R, G, B and C, M, Y, K are letter symbols; it is hard to use them to explicitly express the relationship between colors. Take the RGB framework as an example. Based on key colors R, G, and B, another nine colors {RY, Y, YG, GC, C, CB, BM, M, MR} can be deduced, where Y stands for yellow, C for cyan, and M for magenta. However, it is not easy for a user to directly realize the components of color from these letter symbols. Difﬁculties arise in various application contexts without a speciﬁc mechanism for mathematical operations. For instance, what is the complement color of R? What are the triad-complementary pairs within these 12 colors? (ii) Computing problems: Letter symbols in the current color frames are hard to use",
                    "topicTags": [
                        "prime numbers",
                        "color coding",
                        "optimization"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/unifying-colors-by-primes/",
                    "file": "assets/scholars/hanlinli/papers/8f1b923633.pdf"
                },
                {
                    "id": "1bd5c978c2b5_p1_5",
                    "paperId": "1bd5c978c2b5",
                    "scholarId": "hanlinli",
                    "title": "Unifying colors by primes",
                    "year": "2023",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "e the triad-complementary pairs within these 12 colors? (ii) Computing problems: Letter symbols in the current color frames are hard to use for color computation. For instance, what is the resulting color after blending four colors of RY, GC, CB, and MR? Moreover, what is the reﬂecting color of an apple if we use a blue light to irradiate a green apple? (iii) Uniﬁcation problems: Letter symbols are hard to use for unifying pigment colors and light colors, same for unifying RGB, CMYK, and HSV frames together. Such issues may cause ineffective conversions among different colors4. (iv) Size problems: In a CMYK frame, each of c, m, y, and k may assume 100 values, while in an RGB frame, each of r, g, and b may assume 256 values. Take RGB as an example. Each of the R, G, and B colors has 256 values, thus resulting in 3 × 2562 hues, which makes",
                    "topicTags": [
                        "prime numbers",
                        "color coding",
                        "optimization"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/unifying-colors-by-primes/",
                    "file": "assets/scholars/hanlinli/papers/8f1b923633.pdf"
                },
                {
                    "id": "1bd5c978c2b5_p1_6",
                    "paperId": "1bd5c978c2b5",
                    "scholarId": "hanlinli",
                    "title": "Unifying colors by primes",
                    "year": "2023",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "may assume 256 values. Take RGB as an example. Each of the R, G, and B colors has 256 values, thus resulting in 3 × 2562 hues, which makes it challenging to distribute and allocate © The Author(s) 2023 OpenAccessThisarticleislicensedunderaCreativeCommonsAttribution4.0InternationalLicense,whichpermitsuse,sharing,adaptation,distributionandreproduction in any medium or format, as long as you give appropriate credit to the original author(s) and the source, provide a link to the Creative Commons license, and indicate if changes were made. The images or other third party material in this article are included in the article’s Creative Commons license, unless indicated otherwise in a credit line to the material. If material is not included in the article’s Creative Commons license and your intended use is not permitted by statutory regulation o",
                    "topicTags": [
                        "prime numbers",
                        "color coding",
                        "optimization"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/unifying-colors-by-primes/",
                    "file": "assets/scholars/hanlinli/papers/8f1b923633.pdf"
                },
                {
                    "id": "1bd5c978c2b5_p1_7",
                    "paperId": "1bd5c978c2b5",
                    "scholarId": "hanlinli",
                    "title": "Unifying colors by primes",
                    "year": "2023",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "rial. If material is not included in the article’s Creative Commons license and your intended use is not permitted by statutory regulation or exceeds the permitted use, you will need to obtain permission directly from the copyright holder. To view a copy of this license, visit http://creativecommons.org/licenses/by/4.0/. Correspondence: Way Kuo (way@cityu.edu.hk) 1Department of Management Science, City University of Hong Kong, Hong Kong, China 2Department of Industrial and Systems Engineering, North Carolina State University, Raleigh, NC 27695, USA Full list of author information is available at the end of the article 1234567890():,; 1234567890():,; 1234567890():,; 1234567890():,;",
                    "topicTags": [
                        "prime numbers",
                        "color coding",
                        "optimization"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/unifying-colors-by-primes/",
                    "file": "assets/scholars/hanlinli/papers/8f1b923633.pdf"
                },
                {
                    "id": "1bd5c978c2b5_p2_1",
                    "paperId": "1bd5c978c2b5",
                    "scholarId": "hanlinli",
                    "title": "Unifying colors by primes",
                    "year": "2023",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "these many colors and hues on a color wheel4,5. In addition, the large number of color values may cause a huge computational burden for combining some of them to generate preferred colors6. The weakness of RGB and CMYK is further reﬂected in emerging applications, such as cell phones, PCs, and TVs, in which RGB and CMYK are widely applied. For current technologies, each pixel on an LCD5 screen requires 3 × 8 = 24 pulses to generate R, G, and B lights7, which is both time- and energy-consuming. Moreover, the trans- formation between lights and colors is so complicated that no usable smart system is currently available8,9. In this study, we present a new color framework based on the prime number theory10,11 and Goldbach’s con- jecture10,12, referred to as C235, to encode colors and colorize objects. The aim is to solve bottlenecks inherent",
                    "topicTags": [
                        "prime numbers",
                        "color coding",
                        "optimization"
                    ],
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/unifying-colors-by-primes/",
                    "file": "assets/scholars/hanlinli/papers/8f1b923633.pdf"
                }
            ],
            "metadataRecords": [
                {
                    "paperId": "477f9546531c",
                    "scholarId": "hanlinli",
                    "title": "Forming a therapeutic sphere to treat ailments using optimization techniques",
                    "year": "2023",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "optimization",
                        "therapeutic visualization",
                        "operations research"
                    ],
                    "description": "Converts a therapeutic table into a spherical visualization using optimization techniques.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/forming-a-therapeutic-sphere-to-treat-ailments-using-optimization/"
                },
                {
                    "paperId": "27c1e36a15a9",
                    "scholarId": "hanlinli",
                    "title": "Prime-Number-Based Parallel Solver for Engineering Design Optimization Problems",
                    "year": "2022",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "medium",
                    "topicTags": [
                        "prime numbers",
                        "parallel solver",
                        "engineering optimization"
                    ],
                    "description": "Patent/publication record for partitioning polynomial integer optimization problems using prime-number-based parallelization.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/prime-number-based-parallel-solver-for-engineering-design-optimiz/"
                },
                {
                    "paperId": "60534b12c302",
                    "scholarId": "hanlinli",
                    "title": "System And Method For Performing Operation Using Linear-Integer-Programing For Rsa Factorization",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Public scholarly background metadata for the digital advisor.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/system-and-method-for-performing-operation-using-linear-integer-p/"
                },
                {
                    "paperId": "27c1e36a15a9",
                    "scholarId": "hanlinli",
                    "title": "Prime-Number-Based Parallel Solver For Engineering Design Optimization Problems Of Polynomial Forms With Integer Variables",
                    "year": "2022",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Public scholarly background metadata for the digital advisor.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/prime-number-based-parallel-solver-for-engineering-design-optimiz/"
                },
                {
                    "paperId": "67615de383f1",
                    "scholarId": "hanlinli",
                    "title": "Universal Color Coding System, And Method of Analyzing Objects with Multiple Attributes Using The Color Coding System",
                    "year": "2022",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Public scholarly background metadata for the digital advisor.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/universal-color-coding-system-and-method-of-analyzing-objects-wit/"
                }
            ]
        },
        "patentMemory": [
            {
                "id": "US20230385365A1",
                "publicationNumber": "US20230385365A1",
                "title": "Prime-Number-Based Parallel Solver For Engineering Design Optimization Problems Of Polynomial Forms With Integer Variables",
                "field": "engineering-optimization",
                "industry": "工程优化",
                "summary": "Received is a main program representing one Engineering Design Optimization Problem (EDOP), the EDOP including polynomial terms with product values. A number (N) of available parallel processors for parallel processing are identified. The main program is partitioned into N subprograms, N being a positive integer greater than one. The N subprograms have fewer overlapping product values between them compared to existing solutions, and the partitioning is prime-number based. Each of the available parallel processors then independently solve a unique subprogram of the N subprograms, resulting in N unique solutions. A best solution is automatically chosen from among the N unique solutions and the best solution is automatically applied to the EDOP.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/prime-number-based-parallel-solver-for-engineering-design-optimiz/",
                "sourceType": "patent",
                "legalStatus": "Accepted/In press/Filed - 25 May 2022 | external lookup: US20230385365A1 pub=2023-11-30 assignee=City University Of Hong Kong conf=high"
            }
        ]
    },
    {
        "id": "issliao",
        "name": "Shaoyi Stephen LIAO",
        "sourceName": "LIAO, Shaoyi Stephen",
        "email": "issliao@cityu.edu.hk",
        "auId": "issliao",
        "profileUrl": "https://scholars.cityu.edu.hk/en/persons/issliao/",
        "affiliation": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China.",
        "affiliationTier": "top_university",
        "expertise": [
            "medical",
            "breathing",
            "respiratory",
            "radar",
            "visual tracking",
            "creating an image",
            "image",
            "tracking"
        ],
        "patentIds": [
            "CN112137620B",
            "CN111104831B",
            "CN111098849B"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22Shaoyi%20Stephen%20LIAO%20/%20City%20University%20of%20Hong%20Kong%2C%20Department%20of%20Information%20Systems%2C%20Hong%20Kong%2C%20Peoples%20R%20China.%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%23ea580c%22/%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba%28255%2C255%2C255%2C0.24%29%22/%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba%28255%2C255%2C255%2C0.42%29%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3ESS%3C/text%3E%3C/svg%3E",
        "paperBackground": [
            {
                "scholarId": "issliao",
                "title": "Advancing text classification: a novel two-stage multi-objective feature selection framework",
                "year": "2025",
                "description": "DEA-based filter-wrapper feature selection framework for text classification.",
                "doi": "10.1007/s10799-025-00450-9",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/advancing-text-classification-a-novel-two-stage-multi-objective-f/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "text classification",
                    "feature selection",
                    "information systems"
                ],
                "authors": [
                    "Shaoyi Stephen LIAO"
                ],
                "paperId": "5dab39aca321"
            },
            {
                "scholarId": "issliao",
                "title": "Behavior-based optimal refund policy under advance selling",
                "year": "2024",
                "description": "Mathematical model of refund policy under consumers' loss fairness concerns.",
                "doi": "10.1080/01605682.2024.2396955",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/behavior-based-optimal-refund-policy-under-advance-selling-an-ana/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "analytics",
                    "operations research",
                    "consumer behavior"
                ],
                "authors": [
                    "Shaoyi Stephen LIAO"
                ],
                "paperId": "8be1b1fd03fa"
            },
            {
                "scholarId": "issliao",
                "title": "Generative AI and Human Bias: Insights from Editing Behaviors on a Knowledge-Sharing Platform",
                "year": "2025",
                "description": "Examines generative AI's effect on knowledge-sharing edits and perceived content quality.",
                "doi": "10.5465/AMPROC.2025.65bp",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/generative-ai-and-human-bias-insights-from-editing-behaviors-on-a/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "generative AI",
                    "knowledge sharing",
                    "human bias"
                ],
                "authors": [
                    "Shaoyi Stephen LIAO"
                ],
                "paperId": "043aede0ee5b"
            },
            {
                "title": "How Online Reviews Should Be Summarized via AI to Facilitate Review Reading",
                "authors": [
                    "Shaoyi Stephen LIAO"
                ],
                "year": "2025",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/how-online-reviews-should-be-summarized-via-ai-to-facilitate-revi/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "abstract": "The abundance of online customer reviews hinders customers’ effective decision-making. AI-generated review summaries provide a promising solution, but their effectiveness largely depends on how they are designed and presented. Drawing on accessibility-diagnosticity theory, this study examines how three review summary designs (attribute block design, descriptive paragraph design, and composite display design) affect customers’ review reading performance. We further investigate two underlying cognitive mechanisms, product usage imagery and perceived product attribute diagnosticity, as mediators of these effects. Our experiment reveals that the composite display design, which integrates attribute blocks and descriptive paragraph, outperforms the other designs in enhancing customers’ review reading performance through both mediators. Specifically, product usage imagery facilitates the review reading process and promotes summary revisit behavior, while perceived product attribute diagnosticity strengthens review reading outcomes and increases add-to-cart behavior. This study contributes valuable theoretical and practical insights to the design and implementation of review summary featur",
                "description": "The abundance of online customer reviews hinders customers’ effective decision-making. AI-generated review summaries provide a promising solution, but their effectiveness largely depends on how they are designed and presented. Drawing on accessibility-diagnosticity theory, this study examines how three review summary designs (attribute block design, descriptive paragraph design, and composite display design) affect customers’ review reading performance. We further investigate two underlying cognitive mechanisms, product usage imagery and perceived product attribute diagnosticity, as mediators of these effects. Our experiment reveals that the composite display design, which integrates attribute blocks and descriptive paragraph, outperforms the other designs in enhancing customers’ review reading performance through both mediators. Specifically, product usage imagery facilitates the review reading process and promotes summary revisit behavior, while perceived product attribute diagnosticity strengthens review reading outcomes and increases add-to-cart behavior. This study contributes valuable theoretical and practical insights to the design and implementation of review summary featur",
                "paperId": "9f67b3046865"
            },
            {
                "title": "Interacting Reviews and Q&As on E-commerce Platforms: Three Information Channel Interaction Designs",
                "authors": [
                    "Shaoyi Stephen LIAO"
                ],
                "year": "2025",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/interacting-reviews-and-qampas-on-e-commerce-platforms-three-info/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "abstract": "Similar to online consumer reviews, online question and answer (Q&A) sections are a pivotal form of electronic word-of-mouth on e-commerce platforms. The integration of a Q&A function typically enhances consumers’ perception of product diagnosticity by providing an additional information channel. However, this addition often results in consumers paying less attention to traditional reviews due to their relatively uncertain nature, thereby reducing the perceived review set helpfulness. In this study, we utilize the cue-summation theory and the certainty effect to elucidate the trade-off associated with introducing new information channels. To mitigate this challenge, we propose three distinct information channel interaction designs that vary based on the level of attention required: focused, peripheral, and implicit interaction designs. Among these, the peripheral interaction design holds the greatest potential in balancing this trade-off. This study offers significant theoretical and practical insights into the design of information channels and their implementation on e-commerce platforms. © 2025, Association for Information Systems.",
                "description": "Similar to online consumer reviews, online question and answer (Q&A) sections are a pivotal form of electronic word-of-mouth on e-commerce platforms. The integration of a Q&A function typically enhances consumers’ perception of product diagnosticity by providing an additional information channel. However, this addition often results in consumers paying less attention to traditional reviews due to their relatively uncertain nature, thereby reducing the perceived review set helpfulness. In this study, we utilize the cue-summation theory and the certainty effect to elucidate the trade-off associated with introducing new information channels. To mitigate this challenge, we propose three distinct information channel interaction designs that vary based on the level of attention required: focused, peripheral, and implicit interaction designs. Among these, the peripheral interaction design holds the greatest potential in balancing this trade-off. This study offers significant theoretical and practical insights into the design of information channels and their implementation on e-commerce platforms. © 2025, Association for Information Systems.",
                "paperId": "a618eebf347d"
            }
        ],
        "profileUrls": [
            "https://scholars.cityu.edu.hk/en/persons/issliao/"
        ],
        "identityRules": [
            {
                "id": "identity_controlled_proxy",
                "priority": 100,
                "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
            },
            {
                "id": "identity_no_institutional_commitment",
                "priority": 95,
                "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
            }
        ],
        "evidenceRules": [
            {
                "id": "evidence_type_boundary",
                "priority": 100,
                "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
            },
            {
                "id": "evidence_no_fabrication",
                "priority": 100,
                "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
            },
            {
                "id": "evidence_metadata_limit",
                "priority": 90,
                "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
            }
        ],
        "scholarRules": [
            {
                "id": "scholar_field_scope",
                "priority": 85,
                "text": "Prefer answers grounded in Shaoyi Stephen LIAO's public patent ownership, paper background and expertise fields.",
                "fields": [
                    "medical",
                    "breathing",
                    "respiratory",
                    "radar",
                    "visual tracking",
                    "creating an image",
                    "image",
                    "tracking"
                ]
            },
            {
                "id": "scholar_voice",
                "priority": 55,
                "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
            },
            {
                "id": "scholar_gap_disclosure",
                "priority": 80,
                "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
            }
        ],
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
            }
        ],
        "rules": {
            "identityRules": [
                {
                    "id": "identity_controlled_proxy",
                    "priority": 100,
                    "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
                },
                {
                    "id": "identity_no_institutional_commitment",
                    "priority": 95,
                    "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
                }
            ],
            "evidenceRules": [
                {
                    "id": "evidence_type_boundary",
                    "priority": 100,
                    "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
                },
                {
                    "id": "evidence_no_fabrication",
                    "priority": 100,
                    "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
                },
                {
                    "id": "evidence_metadata_limit",
                    "priority": 90,
                    "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
                }
            ],
            "scholarRules": [
                {
                    "id": "scholar_field_scope",
                    "priority": 85,
                    "text": "Prefer answers grounded in Shaoyi Stephen LIAO's public patent ownership, paper background and expertise fields.",
                    "fields": [
                        "medical",
                        "breathing",
                        "respiratory",
                        "radar",
                        "visual tracking",
                        "creating an image",
                        "image",
                        "tracking"
                    ]
                },
                {
                    "id": "scholar_voice",
                    "priority": 55,
                    "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
                },
                {
                    "id": "scholar_gap_disclosure",
                    "priority": 80,
                    "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
                }
            ],
            "patentRules": [
                {
                    "id": "patent_first",
                    "priority": 100,
                    "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
                },
                {
                    "id": "no_claim_expansion",
                    "priority": 100,
                    "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
                },
                {
                    "id": "no_legal_conclusion",
                    "priority": 95,
                    "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
                }
            ]
        },
        "skills": [
            {
                "id": "patent_fact_extractor",
                "name": "Patent Fact Extractor",
                "description": "Extract current patent title, abstract, field, public source and local original facts before answering.",
                "sourceTypes": [
                    "patent"
                ],
                "priority": 100,
                "triggers": [
                    "all_patent_questions",
                    "selected_patent_context"
                ]
            },
            {
                "id": "paper_evidence_retriever",
                "name": "Paper Evidence Retriever",
                "description": "Retrieve scholar-bound downloaded PDF chunks and metadata-only paper records that match the question.",
                "sourceTypes": [
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 80,
                "triggers": [
                    "research_basis",
                    "technical_explanation",
                    "business_analysis"
                ]
            },
            {
                "id": "commercialization_assessor",
                "name": "Commercialization Assessor",
                "description": "Translate patent and paper evidence into enterprise scenarios, buyer fit and trial path assumptions.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "user_input"
                ],
                "priority": 70,
                "triggers": [
                    "business_analysis",
                    "licensing_next_step"
                ]
            },
            {
                "id": "technical_due_diligence",
                "name": "Technical Due Diligence",
                "description": "Identify technical, data, equipment, integration and validation gaps that require follow-up.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 65,
                "triggers": [
                    "technical_explanation",
                    "risk_question",
                    "business_analysis"
                ]
            },
            {
                "id": "risk_guard",
                "name": "Risk Guard",
                "description": "Block overclaiming, fabricated citations, legal conclusions and treating metadata-only records as full text.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 100,
                "triggers": [
                    "all_answers",
                    "risk_question",
                    "legal_question"
                ]
            },
            {
                "id": "citation_answer_builder",
                "name": "Citation Answer Builder",
                "description": "Build concise answers with explicit source boundaries and reference chips.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 75,
                "triggers": [
                    "all_answers"
                ]
            }
        ],
        "sessionContext": {
            "selectedPatentPolicy": "active_patent_first",
            "longTermMemoryPolicy": "Only user preferences, enterprise demand context and conversation decisions may persist; scholar, patent and paper facts must come from controlled source data.",
            "answerContextPolicy": "Retrieve only the most relevant patent facts and top paper evidence for each turn."
        },
        "paperMemory": [
            {
                "paperId": "5dab39aca321",
                "scholarId": "issliao",
                "title": "Advancing text classification: a novel two-stage multi-objective feature selection framework",
                "year": "2025",
                "authors": [
                    "Shaoyi Stephen LIAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "text classification",
                    "feature selection",
                    "information systems"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/advancing-text-classification-a-novel-two-stage-multi-objective-f/",
                "file": "",
                "description": "DEA-based filter-wrapper feature selection framework for text classification."
            },
            {
                "paperId": "8be1b1fd03fa",
                "scholarId": "issliao",
                "title": "Behavior-based optimal refund policy under advance selling",
                "year": "2024",
                "authors": [
                    "Shaoyi Stephen LIAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "analytics",
                    "operations research",
                    "consumer behavior"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/behavior-based-optimal-refund-policy-under-advance-selling-an-ana/",
                "file": "",
                "description": "Mathematical model of refund policy under consumers' loss fairness concerns."
            },
            {
                "paperId": "043aede0ee5b",
                "scholarId": "issliao",
                "title": "Generative AI and Human Bias: Insights from Editing Behaviors on a Knowledge-Sharing Platform",
                "year": "2025",
                "authors": [
                    "Shaoyi Stephen LIAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "generative AI",
                    "knowledge sharing",
                    "human bias"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/generative-ai-and-human-bias-insights-from-editing-behaviors-on-a/",
                "file": "",
                "description": "Examines generative AI's effect on knowledge-sharing edits and perceived content quality."
            },
            {
                "paperId": "9f67b3046865",
                "scholarId": "issliao",
                "title": "How Online Reviews Should Be Summarized via AI to Facilitate Review Reading",
                "year": "2025",
                "authors": [
                    "Shaoyi Stephen LIAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/how-online-reviews-should-be-summarized-via-ai-to-facilitate-revi/",
                "file": "",
                "description": "The abundance of online customer reviews hinders customers’ effective decision-making. AI-generated review summaries provide a promising solution, but their effectiveness largely depends on how they are designed and presented. Drawing on accessibility-diagnosticity theory, this study examines how three review summary designs (attribute block design, descriptive paragraph design, and composite display design) affect customers’ review reading performance. We further investigate two underlying cognitive mechanisms, product usage imagery and perceived product attribute diagnosticity, as mediators of these effects. Our experiment reveals that the composite display design, which integrates attribute blocks and descriptive paragraph, outperforms the other designs in enhancing customers’ review reading performance through both mediators. Specifically, product usage imagery facilitates the review reading process and promotes summary revisit behavior, while perceived product attribute diagnosticity strengthens review reading outcomes and increases add-to-cart behavior. This study contributes valuable theoretical and practical insights to the design and implementation of review summary featur"
            },
            {
                "paperId": "a618eebf347d",
                "scholarId": "issliao",
                "title": "Interacting Reviews and Q&As on E-commerce Platforms: Three Information Channel Interaction Designs",
                "year": "2025",
                "authors": [
                    "Shaoyi Stephen LIAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/interacting-reviews-and-qampas-on-e-commerce-platforms-three-info/",
                "file": "",
                "description": "Similar to online consumer reviews, online question and answer (Q&A) sections are a pivotal form of electronic word-of-mouth on e-commerce platforms. The integration of a Q&A function typically enhances consumers’ perception of product diagnosticity by providing an additional information channel. However, this addition often results in consumers paying less attention to traditional reviews due to their relatively uncertain nature, thereby reducing the perceived review set helpfulness. In this study, we utilize the cue-summation theory and the certainty effect to elucidate the trade-off associated with introducing new information channels. To mitigate this challenge, we propose three distinct information channel interaction designs that vary based on the level of attention required: focused, peripheral, and implicit interaction designs. Among these, the peripheral interaction design holds the greatest potential in balancing this trade-off. This study offers significant theoretical and practical insights into the design of information channels and their implementation on e-commerce platforms. © 2025, Association for Information Systems."
            }
        ],
        "knowledgeIndex": {
            "path": "assets/scholars/issliao/knowledge/index.json",
            "paperCount": 5,
            "downloadedPdfCount": 0,
            "metadataOnlyCount": 5,
            "chunkCount": 0,
            "topics": [
                "text classification",
                "feature selection",
                "information systems",
                "analytics",
                "operations research",
                "consumer behavior",
                "generative AI",
                "knowledge sharing",
                "human bias"
            ],
            "sourceTypes": [
                "patent",
                "paper_pdf",
                "paper_metadata",
                "profile",
                "user_input"
            ],
            "chunks": [],
            "metadataRecords": [
                {
                    "paperId": "5dab39aca321",
                    "scholarId": "issliao",
                    "title": "Advancing text classification: a novel two-stage multi-objective feature selection framework",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "text classification",
                        "feature selection",
                        "information systems"
                    ],
                    "description": "DEA-based filter-wrapper feature selection framework for text classification.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/advancing-text-classification-a-novel-two-stage-multi-objective-f/"
                },
                {
                    "paperId": "8be1b1fd03fa",
                    "scholarId": "issliao",
                    "title": "Behavior-based optimal refund policy under advance selling",
                    "year": "2024",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "analytics",
                        "operations research",
                        "consumer behavior"
                    ],
                    "description": "Mathematical model of refund policy under consumers' loss fairness concerns.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/behavior-based-optimal-refund-policy-under-advance-selling-an-ana/"
                },
                {
                    "paperId": "043aede0ee5b",
                    "scholarId": "issliao",
                    "title": "Generative AI and Human Bias: Insights from Editing Behaviors on a Knowledge-Sharing Platform",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "generative AI",
                        "knowledge sharing",
                        "human bias"
                    ],
                    "description": "Examines generative AI's effect on knowledge-sharing edits and perceived content quality.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/generative-ai-and-human-bias-insights-from-editing-behaviors-on-a/"
                },
                {
                    "paperId": "9f67b3046865",
                    "scholarId": "issliao",
                    "title": "How Online Reviews Should Be Summarized via AI to Facilitate Review Reading",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "The abundance of online customer reviews hinders customers’ effective decision-making. AI-generated review summaries provide a promising solution, but their effectiveness largely depends on how they are designed and presented. Drawing on accessibility-diagnosticity theory, this study examines how three review summary designs (attribute block design, descriptive paragraph design, and composite display design) affect customers’ review reading performance. We further investigate two underlying cognitive mechanisms, product usage imagery and perceived product attribute diagnosticity, as mediators of these effects. Our experiment reveals that the composite display design, which integrates attribute blocks and descriptive paragraph, outperforms the other designs in enhancing customers’ review reading performance through both mediators. Specifically, product usage imagery facilitates the review reading process and promotes summary revisit behavior, while perceived product attribute diagnosticity strengthens review reading outcomes and increases add-to-cart behavior. This study contributes valuable theoretical and practical insights to the design and implementation of review summary featur",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/how-online-reviews-should-be-summarized-via-ai-to-facilitate-revi/"
                },
                {
                    "paperId": "a618eebf347d",
                    "scholarId": "issliao",
                    "title": "Interacting Reviews and Q&As on E-commerce Platforms: Three Information Channel Interaction Designs",
                    "year": "2025",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Similar to online consumer reviews, online question and answer (Q&A) sections are a pivotal form of electronic word-of-mouth on e-commerce platforms. The integration of a Q&A function typically enhances consumers’ perception of product diagnosticity by providing an additional information channel. However, this addition often results in consumers paying less attention to traditional reviews due to their relatively uncertain nature, thereby reducing the perceived review set helpfulness. In this study, we utilize the cue-summation theory and the certainty effect to elucidate the trade-off associated with introducing new information channels. To mitigate this challenge, we propose three distinct information channel interaction designs that vary based on the level of attention required: focused, peripheral, and implicit interaction designs. Among these, the peripheral interaction design holds the greatest potential in balancing this trade-off. This study offers significant theoretical and practical insights into the design of information channels and their implementation on e-commerce platforms. © 2025, Association for Information Systems.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/interacting-reviews-and-qampas-on-e-commerce-platforms-three-info/"
                }
            ]
        },
        "patentMemory": [
            {
                "id": "CN112137620B",
                "publicationNumber": "CN112137620B",
                "title": "Human Body Weak Respiratory Signal Detection Method Based on Ultra-wideband Radar",
                "field": "medical-sensing",
                "industry": "医疗健康",
                "summary": "The invention discloses a method for detecting weak human breathing signals based on ultra-wideband radar, comprising the steps of: collecting radar echo signals by using ultra-wideband radar to form a signal matrix X(m,n); for each distance unit, collecting radar echo signals The wave signal is recorded as x m (n); after Motion filtering and normalization processing of the radar echo signal x m (n), the standardized signal is obtained for normalized signals Perform Hilbert-Huang transform to obtain its micro-Doppler feature α 1 ; Perform fast Fourier transform to obtain its spectral characteristic α 2 ; construct noise-free breathing signal x 0 (n); Perform correlation analysis with the noise-free breathing signal x 0 (n) to obtain the correlation feature α 3 ; take the micro-Doppler feature α 1 , the spectral feature α 2 and the correlation feature α 3 as the input features, use the support vector machine model to The radar echo signal x m (n) is classified; according to the classification result, it is judged whether there is a living body and the location information of the living body is obtained. The invention can improve the precision and efficiency of detecting the weak vital features of the human body.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E5%9F%BA%E6%96%BC%E8%B6%85%E5%AF%AC%E5%B8%B6%E9%9B%B7%E9%81%94%E7%9A%84%E4%BA%BA%E9%AB%94%E5%BE%AE%E5%BC%B1%E5%91%BC%E5%90%B8%E4%BF%A1%E8%99%9F%E6%AA%A2%E6%B8%AC%E6%96%B9%E6%B3%95/",
                "sourceType": "patent",
                "legalStatus": "Published - 11 Jun 2021 | external lookup: CN112137620B pub=2021-06-11 assignee=广东省地震局 conf=high"
            },
            {
                "id": "CN111104831B",
                "publicationNumber": "CN111104831B",
                "title": "Visual Tracking Method And Device, Computer Equipment And Medium",
                "field": "computer-vision",
                "industry": "计算机视觉",
                "summary": "The invention provides a visual tracking method, a visual tracking device, computer equipment and a medium, wherein the method processes a given tracking object frame in an initial video frame to obtain sample data and tag data; training a pre-established video tracking network model by utilizing the sample data and the label data; and calibrating a tracking object in a subsequent frame of the video by using the trained video tracking network model, wherein during sample classification and model training, the network top-layer feature map is divided into areas with different confidence levels, the areas with different confidence levels are combined in a weight mode to carry out sample classification and model training, so that the areas with high confidence levels are strengthened, quick training and accurate tracking of the model are realized, further, objects which change continuously in a video image are tracked automatically, and different application scenes can be adapted.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E8%A6%96%E8%A6%BA%E8%BF%BD%E8%B9%A4%E6%96%B9%E6%B3%95%E8%A3%9D%E7%BD%AE%E8%A8%88%E7%AE%97%E6%A9%9F%E8%A8%AD%E5%82%99%E4%BB%A5%E5%8F%8A%E4%BB%8B%E8%B3%AA/",
                "sourceType": "patent",
                "legalStatus": "Published - 29 Sept 2023 | external lookup: CN111104831B pub=2023-09-29 assignee=香港城市大学深圳研究院 conf=high"
            },
            {
                "id": "CN111098849B",
                "publicationNumber": "CN111098849B",
                "title": "New Energy Automobile Stability Control Method And System",
                "field": "vehicle-control",
                "industry": "新能源汽车",
                "summary": "The invention provides a method and system for controlling the stability of a new energy vehicle. The method includes: acquiring the front wheel rotation angle and longitudinal speed of the vehicle; inputting the front wheel rotation angle and longitudinal speed into a linear two-degree-of-freedom model of the vehicle to generate a yaw angle The ideal value and the ideal value of the centroid side slip angle; according to the RBF neural network algorithm, the ideal value of the yaw angular velocity and the actual value of the yaw angular velocity, the ideal value of the centroid side slip angle and the actual value of the centroid side slip angle, so that the car does not Determine that the interference term is bounded; according to the ideal value of the yaw angular velocity and the actual value of the yaw angular velocity, the ideal value of the centroid side slip angle and the actual value of the centroid side slip angle, and the bounded uncertain interference term, the total value of the car is generated. Demand yaw moment; divide the total demand yaw moment to each wheel, and output the division result to the torque regulator. The invention can make the uncertain interference items of the automobile system bounded, effectively improve the anti-interference ability of the automobile system, and ensure the stability of the operation and driving of the vehicle.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E6%96%B0%E8%83%BD%E6%BA%90%E6%B1%BD%E8%BB%8A%E7%A9%A9%E5%AE%9A%E6%80%A7%E6%8E%A7%E5%88%B6%E6%96%B9%E6%B3%95%E5%8F%8A%E7%B3%BB%E7%B5%B1/",
                "sourceType": "patent",
                "legalStatus": "Published - 27 Apr 2021 | external lookup: CN111098849B pub=2021-04-27 assignee=香港城市大学深圳研究院 conf=high"
            }
        ]
    },
    {
        "id": "zhao_jianliang_leon",
        "name": "Jianliang Leon ZHAO",
        "sourceName": "ZHAO, Jianliang Leon",
        "email": "",
        "auId": "",
        "profileUrl": "",
        "affiliation": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China.",
        "affiliationTier": "top_university",
        "expertise": [
            "blockchain",
            "ethereum",
            "nft",
            "private key"
        ],
        "patentIds": [
            "CN114117510B",
            "CN114513317B",
            "CN114077631A"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22Jianliang%20Leon%20ZHAO%20/%20City%20University%20of%20Hong%20Kong%2C%20Department%20of%20Information%20Systems%2C%20Hong%20Kong%2C%20Peoples%20R%20China.%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%230891b2%22/%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba%28255%2C255%2C255%2C0.24%29%22/%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba%28255%2C255%2C255%2C0.42%29%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3EJL%3C/text%3E%3C/svg%3E",
        "paperBackground": [
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "Overview of Business Innovations and Research Opportunities in Blockchain and Introduction to the Special Issue",
                "year": "2016",
                "description": "Editorial overview of blockchain business innovations, trust, cryptocurrencies, and research opportunities.",
                "doi": "10.1186/s40854-016-0049-2",
                "sourceUrl": "https://doi.org/10.1186/s40854-016-0049-2",
                "pdfUrl": "https://link.springer.com/content/pdf/10.1186/s40854-016-0049-2.pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "blockchain",
                    "digital finance",
                    "business innovation"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "file": "assets/scholars/zhao_jianliang_leon/papers/b80a3eb92d.pdf",
                "downloadUrl": "https://link.springer.com/content/pdf/10.1186/s40854-016-0049-2.pdf",
                "paperId": "fe762e37e784"
            },
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "Blockchain and Digital Finance",
                "year": "2022",
                "description": "Open-access review/editorial on blockchain's role in digital finance and financial innovation.",
                "doi": "10.1186/s40854-022-00420-y",
                "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9702689/",
                "pdfUrl": "https://link.springer.com/content/pdf/10.1186/s40854-022-00420-y.pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "blockchain",
                    "digital finance",
                    "financial innovation"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "file": "assets/scholars/zhao_jianliang_leon/papers/6faa14dd0a.pdf",
                "downloadUrl": "https://link.springer.com/content/pdf/10.1186/s40854-022-00420-y.pdf",
                "paperId": "cd90c0b07964"
            },
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "Blockchain, Crypto Assets, and Financial Innovation: A Decade of Insights and Advances",
                "year": "2025",
                "description": "Open-access Springer book co-edited by J. Leon Zhao, covering blockchain, crypto assets, and digital financial innovation.",
                "doi": "10.1007/978-981-96-6839-7",
                "sourceUrl": "https://link.springer.com/book/10.1007/978-981-96-6839-7",
                "pdfUrl": "https://link.springer.com/content/pdf/10.1007/978-981-96-6839-7.pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "blockchain",
                    "crypto assets",
                    "financial innovation"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "file": "assets/scholars/zhao_jianliang_leon/papers/59670ec885.pdf",
                "downloadUrl": "https://link.springer.com/content/pdf/10.1007/978-981-96-6839-7.pdf",
                "paperId": "3ea1c64b8396"
            },
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "Smart Contract Security: A Software Lifecycle Perspective",
                "year": "2019",
                "description": "Review of smart-contract vulnerabilities and defenses across design, implementation, testing, deployment, monitoring, and analysis.",
                "doi": "10.1109/ACCESS.2019.2946988",
                "sourceUrl": "https://doi.org/10.1109/ACCESS.2019.2946988",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "smart contract",
                    "blockchain security",
                    "software lifecycle"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "paperId": "39581bb5208e"
            },
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "Blockchain Security: A Survey of Techniques and Research Directions",
                "year": "2022",
                "description": "Survey of blockchain security at process, data, and infrastructure levels, relevant to cryptographic protection, storage, access, and infrastructure threats.",
                "doi": "10.1109/TSC.2020.3038641",
                "sourceUrl": "https://dblp.org/rec/journals/tsc/LengZZHB22",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "blockchain security",
                    "cryptography",
                    "survey"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "paperId": "3c92fda6dc46"
            },
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "Blockchain-Secured Smart Manufacturing in Industry 4.0: A Survey",
                "year": "2021",
                "description": "Survey of blockchain-secured manufacturing, including scalability, flexibility, and cybersecurity challenges.",
                "doi": "10.1109/TSMC.2020.3040789",
                "sourceUrl": "https://dblp.org/rec/journals/tsmc/LengYZZLGCF21",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "blockchain",
                    "smart manufacturing",
                    "cybersecurity"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "paperId": "2a730a27211c"
            },
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "ManuChain: Combining Permissioned Blockchain With a Holistic Optimization Model as Bi-Level Intelligence for Smart Manufacturing",
                "year": "2020",
                "description": "Permissioned-blockchain architecture for smart manufacturing and decentralized coordination.",
                "doi": "10.1109/TSMC.2019.2930418",
                "sourceUrl": "https://doi.org/10.1109/TSMC.2019.2930418",
                "downloadStatus": "metadata_only",
                "confidence": "medium-high",
                "topicTags": [
                    "permissioned blockchain",
                    "smart manufacturing",
                    "optimization"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "paperId": "a2927b7423c9"
            },
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "Makerchain: A Blockchain With Chemical Signature for Self-Organizing Process in Social Manufacturing",
                "year": "2019",
                "description": "Blockchain-driven decentralized model for product authenticity, anti-counterfeiting, smart contracts, and lifecycle traceability in social manufacturing.",
                "doi": "10.1016/j.jclepro.2019.06.265",
                "sourceUrl": "https://www.sciencedirect.com/science/article/pii/S0959652619322309",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "blockchain",
                    "anti-counterfeiting",
                    "traceability"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "paperId": "7e8c600dd46f"
            },
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "Prediction of Initial Coin Offering Success Based on Team Knowledge and Expert Evaluation",
                "year": "2021",
                "description": "Uses team knowledge and expert evaluation to predict ICO success; relevant to blockchain finance and commercialization.",
                "doi": "10.1016/j.dss.2021.113574",
                "sourceUrl": "https://www.sciencedirect.com/science/article/pii/S0167923621000841",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "ICO",
                    "blockchain finance",
                    "commercialization"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "paperId": "e1b42982672e"
            },
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "SocioLink: Leveraging Relational Information in Knowledge Graphs for Startup Recommendations",
                "year": "2023",
                "description": "Knowledge-graph and machine-learning framework for venture-capital startup recommendation; directly relevant to technology commercialization.",
                "doi": "10.1080/07421222.2023.2196771",
                "sourceUrl": "https://www.tandfonline.com/doi/abs/10.1080/07421222.2023.2196771",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "knowledge graph",
                    "startup recommendation",
                    "technology commercialization"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "paperId": "cc376ceb8d71"
            },
            {
                "scholarId": "zhao_jianliang_leon",
                "title": "Services Computing as the Foundation of Enterprise Agility: Overview of Recent Advances and Introduction to the Special Issue",
                "year": "2007",
                "description": "Overview of service-oriented architecture, web services, services computing, and enterprise agility; relevant to middleware and information systems.",
                "doi": "10.1007/s10796-007-9023-x",
                "sourceUrl": "https://ideas.repec.org/a/spr/infosf/v9y2007i1d10.1007_s10796-007-9023-x.html",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "services computing",
                    "middleware",
                    "enterprise agility"
                ],
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "paperId": "88123fb8401d"
            }
        ],
        "profileUrls": [
            "https://www.cb.cityu.edu.hk/staff/jlzhao/",
            "https://myweb.cuhk.edu.cn/leonzhao/Home/AcademicPublications",
            "https://sfi.cuhk.edu.cn/en/node/6189",
            "https://dblp.org/pid/z/JLeonZhao"
        ],
        "googleScholarUrl": "https://scholar.google.com/citations?user=qCyjuogAAAAJ",
        "identityRules": [
            {
                "id": "identity_controlled_proxy",
                "priority": 100,
                "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
            },
            {
                "id": "identity_no_institutional_commitment",
                "priority": 95,
                "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
            }
        ],
        "evidenceRules": [
            {
                "id": "evidence_type_boundary",
                "priority": 100,
                "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
            },
            {
                "id": "evidence_no_fabrication",
                "priority": 100,
                "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
            },
            {
                "id": "evidence_metadata_limit",
                "priority": 90,
                "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
            }
        ],
        "scholarRules": [
            {
                "id": "scholar_field_scope",
                "priority": 85,
                "text": "Prefer answers grounded in Jianliang Leon ZHAO's public patent ownership, paper background and expertise fields.",
                "fields": [
                    "blockchain",
                    "ethereum",
                    "nft",
                    "private key"
                ]
            },
            {
                "id": "scholar_voice",
                "priority": 55,
                "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
            },
            {
                "id": "scholar_gap_disclosure",
                "priority": 80,
                "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
            }
        ],
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
            }
        ],
        "rules": {
            "identityRules": [
                {
                    "id": "identity_controlled_proxy",
                    "priority": 100,
                    "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
                },
                {
                    "id": "identity_no_institutional_commitment",
                    "priority": 95,
                    "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
                }
            ],
            "evidenceRules": [
                {
                    "id": "evidence_type_boundary",
                    "priority": 100,
                    "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
                },
                {
                    "id": "evidence_no_fabrication",
                    "priority": 100,
                    "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
                },
                {
                    "id": "evidence_metadata_limit",
                    "priority": 90,
                    "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
                }
            ],
            "scholarRules": [
                {
                    "id": "scholar_field_scope",
                    "priority": 85,
                    "text": "Prefer answers grounded in Jianliang Leon ZHAO's public patent ownership, paper background and expertise fields.",
                    "fields": [
                        "blockchain",
                        "ethereum",
                        "nft",
                        "private key"
                    ]
                },
                {
                    "id": "scholar_voice",
                    "priority": 55,
                    "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
                },
                {
                    "id": "scholar_gap_disclosure",
                    "priority": 80,
                    "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
                }
            ],
            "patentRules": [
                {
                    "id": "patent_first",
                    "priority": 100,
                    "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
                },
                {
                    "id": "no_claim_expansion",
                    "priority": 100,
                    "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
                },
                {
                    "id": "no_legal_conclusion",
                    "priority": 95,
                    "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
                }
            ]
        },
        "skills": [
            {
                "id": "patent_fact_extractor",
                "name": "Patent Fact Extractor",
                "description": "Extract current patent title, abstract, field, public source and local original facts before answering.",
                "sourceTypes": [
                    "patent"
                ],
                "priority": 100,
                "triggers": [
                    "all_patent_questions",
                    "selected_patent_context"
                ]
            },
            {
                "id": "paper_evidence_retriever",
                "name": "Paper Evidence Retriever",
                "description": "Retrieve scholar-bound downloaded PDF chunks and metadata-only paper records that match the question.",
                "sourceTypes": [
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 80,
                "triggers": [
                    "research_basis",
                    "technical_explanation",
                    "business_analysis"
                ]
            },
            {
                "id": "commercialization_assessor",
                "name": "Commercialization Assessor",
                "description": "Translate patent and paper evidence into enterprise scenarios, buyer fit and trial path assumptions.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "user_input"
                ],
                "priority": 70,
                "triggers": [
                    "business_analysis",
                    "licensing_next_step"
                ]
            },
            {
                "id": "technical_due_diligence",
                "name": "Technical Due Diligence",
                "description": "Identify technical, data, equipment, integration and validation gaps that require follow-up.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 65,
                "triggers": [
                    "technical_explanation",
                    "risk_question",
                    "business_analysis"
                ]
            },
            {
                "id": "risk_guard",
                "name": "Risk Guard",
                "description": "Block overclaiming, fabricated citations, legal conclusions and treating metadata-only records as full text.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 100,
                "triggers": [
                    "all_answers",
                    "risk_question",
                    "legal_question"
                ]
            },
            {
                "id": "citation_answer_builder",
                "name": "Citation Answer Builder",
                "description": "Build concise answers with explicit source boundaries and reference chips.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 75,
                "triggers": [
                    "all_answers"
                ]
            }
        ],
        "sessionContext": {
            "selectedPatentPolicy": "active_patent_first",
            "longTermMemoryPolicy": "Only user preferences, enterprise demand context and conversation decisions may persist; scholar, patent and paper facts must come from controlled source data.",
            "answerContextPolicy": "Retrieve only the most relevant patent facts and top paper evidence for each turn."
        },
        "paperMemory": [
            {
                "paperId": "fe762e37e784",
                "scholarId": "zhao_jianliang_leon",
                "title": "Overview of Business Innovations and Research Opportunities in Blockchain and Introduction to the Special Issue",
                "year": "2016",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "blockchain",
                    "digital finance",
                    "business innovation"
                ],
                "sourceUrl": "https://doi.org/10.1186/s40854-016-0049-2",
                "file": "assets/scholars/zhao_jianliang_leon/papers/b80a3eb92d.pdf",
                "description": "Editorial overview of blockchain business innovations, trust, cryptocurrencies, and research opportunities."
            },
            {
                "paperId": "cd90c0b07964",
                "scholarId": "zhao_jianliang_leon",
                "title": "Blockchain and Digital Finance",
                "year": "2022",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "blockchain",
                    "digital finance",
                    "financial innovation"
                ],
                "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9702689/",
                "file": "assets/scholars/zhao_jianliang_leon/papers/6faa14dd0a.pdf",
                "description": "Open-access review/editorial on blockchain's role in digital finance and financial innovation."
            },
            {
                "paperId": "3ea1c64b8396",
                "scholarId": "zhao_jianliang_leon",
                "title": "Blockchain, Crypto Assets, and Financial Innovation: A Decade of Insights and Advances",
                "year": "2025",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "blockchain",
                    "crypto assets",
                    "financial innovation"
                ],
                "sourceUrl": "https://link.springer.com/book/10.1007/978-981-96-6839-7",
                "file": "assets/scholars/zhao_jianliang_leon/papers/59670ec885.pdf",
                "description": "Open-access Springer book co-edited by J. Leon Zhao, covering blockchain, crypto assets, and digital financial innovation."
            },
            {
                "paperId": "39581bb5208e",
                "scholarId": "zhao_jianliang_leon",
                "title": "Smart Contract Security: A Software Lifecycle Perspective",
                "year": "2019",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "smart contract",
                    "blockchain security",
                    "software lifecycle"
                ],
                "sourceUrl": "https://doi.org/10.1109/ACCESS.2019.2946988",
                "file": "",
                "description": "Review of smart-contract vulnerabilities and defenses across design, implementation, testing, deployment, monitoring, and analysis."
            },
            {
                "paperId": "3c92fda6dc46",
                "scholarId": "zhao_jianliang_leon",
                "title": "Blockchain Security: A Survey of Techniques and Research Directions",
                "year": "2022",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "blockchain security",
                    "cryptography",
                    "survey"
                ],
                "sourceUrl": "https://dblp.org/rec/journals/tsc/LengZZHB22",
                "file": "",
                "description": "Survey of blockchain security at process, data, and infrastructure levels, relevant to cryptographic protection, storage, access, and infrastructure threats."
            },
            {
                "paperId": "2a730a27211c",
                "scholarId": "zhao_jianliang_leon",
                "title": "Blockchain-Secured Smart Manufacturing in Industry 4.0: A Survey",
                "year": "2021",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "blockchain",
                    "smart manufacturing",
                    "cybersecurity"
                ],
                "sourceUrl": "https://dblp.org/rec/journals/tsmc/LengYZZLGCF21",
                "file": "",
                "description": "Survey of blockchain-secured manufacturing, including scalability, flexibility, and cybersecurity challenges."
            },
            {
                "paperId": "a2927b7423c9",
                "scholarId": "zhao_jianliang_leon",
                "title": "ManuChain: Combining Permissioned Blockchain With a Holistic Optimization Model as Bi-Level Intelligence for Smart Manufacturing",
                "year": "2020",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "medium-high",
                "topicTags": [
                    "permissioned blockchain",
                    "smart manufacturing",
                    "optimization"
                ],
                "sourceUrl": "https://doi.org/10.1109/TSMC.2019.2930418",
                "file": "",
                "description": "Permissioned-blockchain architecture for smart manufacturing and decentralized coordination."
            },
            {
                "paperId": "7e8c600dd46f",
                "scholarId": "zhao_jianliang_leon",
                "title": "Makerchain: A Blockchain With Chemical Signature for Self-Organizing Process in Social Manufacturing",
                "year": "2019",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "blockchain",
                    "anti-counterfeiting",
                    "traceability"
                ],
                "sourceUrl": "https://www.sciencedirect.com/science/article/pii/S0959652619322309",
                "file": "",
                "description": "Blockchain-driven decentralized model for product authenticity, anti-counterfeiting, smart contracts, and lifecycle traceability in social manufacturing."
            },
            {
                "paperId": "e1b42982672e",
                "scholarId": "zhao_jianliang_leon",
                "title": "Prediction of Initial Coin Offering Success Based on Team Knowledge and Expert Evaluation",
                "year": "2021",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "ICO",
                    "blockchain finance",
                    "commercialization"
                ],
                "sourceUrl": "https://www.sciencedirect.com/science/article/pii/S0167923621000841",
                "file": "",
                "description": "Uses team knowledge and expert evaluation to predict ICO success; relevant to blockchain finance and commercialization."
            },
            {
                "paperId": "cc376ceb8d71",
                "scholarId": "zhao_jianliang_leon",
                "title": "SocioLink: Leveraging Relational Information in Knowledge Graphs for Startup Recommendations",
                "year": "2023",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "knowledge graph",
                    "startup recommendation",
                    "technology commercialization"
                ],
                "sourceUrl": "https://www.tandfonline.com/doi/abs/10.1080/07421222.2023.2196771",
                "file": "",
                "description": "Knowledge-graph and machine-learning framework for venture-capital startup recommendation; directly relevant to technology commercialization."
            },
            {
                "paperId": "88123fb8401d",
                "scholarId": "zhao_jianliang_leon",
                "title": "Services Computing as the Foundation of Enterprise Agility: Overview of Recent Advances and Introduction to the Special Issue",
                "year": "2007",
                "authors": [
                    "Jianliang Leon ZHAO"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "services computing",
                    "middleware",
                    "enterprise agility"
                ],
                "sourceUrl": "https://ideas.repec.org/a/spr/infosf/v9y2007i1d10.1007_s10796-007-9023-x.html",
                "file": "",
                "description": "Overview of service-oriented architecture, web services, services computing, and enterprise agility; relevant to middleware and information systems."
            }
        ],
        "knowledgeIndex": {
            "path": "assets/scholars/zhao_jianliang_leon/knowledge/index.json",
            "paperCount": 11,
            "downloadedPdfCount": 3,
            "metadataOnlyCount": 8,
            "chunkCount": 24,
            "topics": [
                "blockchain",
                "digital finance",
                "business innovation",
                "financial innovation",
                "crypto assets",
                "smart contract",
                "blockchain security",
                "software lifecycle",
                "cryptography",
                "survey",
                "smart manufacturing",
                "cybersecurity",
                "permissioned blockchain",
                "optimization",
                "anti-counterfeiting",
                "traceability",
                "ICO",
                "blockchain finance",
                "commercialization",
                "knowledge graph",
                "startup recommendation",
                "technology commercialization",
                "services computing",
                "middleware"
            ],
            "sourceTypes": [
                "patent",
                "paper_pdf",
                "paper_metadata",
                "profile",
                "user_input"
            ],
            "chunks": [
                {
                    "id": "fe762e37e784_p1_1",
                    "paperId": "fe762e37e784",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Overview of Business Innovations and Research Opportunities in Blockchain and Introduction to the Special Issue",
                    "year": "2016",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "EDITORIAL Open Access Overview of business innovations and research opportunities in blockchain and introduction to the special issue J. Leon Zhao1*, Shaokun Fan2 and Jiaqi Yan3 * Correspondence: jlzhao@cityu.edu.hk 1City University of Hong Kong, Hong Kong, China Full list of author information is available at the end of the article Abstract Blockchain has become a new frontier of venture capitals that has attracted the attention of banks, governments, and other business corporations. The recent blockchain related attempts included legal blockchains by Fadada.com and Microsoft and pork tracking blockchains by Walmart and IBM. Blockchain is poised to become the most exciting invention after the Internet; while the latter connects the world to enable new business models based on online business processes, the former will help resolve the tr",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "business innovation"
                    ],
                    "sourceUrl": "https://doi.org/10.1186/s40854-016-0049-2",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/b80a3eb92d.pdf"
                },
                {
                    "id": "fe762e37e784_p1_2",
                    "paperId": "fe762e37e784",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Overview of Business Innovations and Research Opportunities in Blockchain and Introduction to the Special Issue",
                    "year": "2016",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "t; while the latter connects the world to enable new business models based on online business processes, the former will help resolve the trust issue more efficiently via network computing. In this paper, we give an overview on blockchain research and development as well as introduce the papers in this special issue. We show that while blockchain has enabled Bitcoin, the most successful digital currency, its widespread adoption in finance and other business sectors will lead to many business innovations as well as many research opportunities. Keywords: Bitcoin, Blockchain, Business innovation, Public ledger, Computational trust Introduction Since Blockchain was originally conceptualized by Satoshi Nakamoto in 2008 as a core component to support transactions of the digital currency – Bitcoin, blockchain has been known to be the public ledg",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "business innovation"
                    ],
                    "sourceUrl": "https://doi.org/10.1186/s40854-016-0049-2",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/b80a3eb92d.pdf"
                },
                {
                    "id": "fe762e37e784_p1_3",
                    "paperId": "fe762e37e784",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Overview of Business Innovations and Research Opportunities in Blockchain and Introduction to the Special Issue",
                    "year": "2016",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "amoto in 2008 as a core component to support transactions of the digital currency – Bitcoin, blockchain has been known to be the public ledger for all transactions and resolved the double-spend problem by combining peer-to-peer technology with public-key cryptography. Literally, a blockchain is a chain of blocks of information that registers Bitcoin transactions; of course, there is a stringent set of rules that govern how to verify the validity of the block and make certain that the block will not be altered or disappear. The algorithms and the computational infrastructure of creating, inserting, and using the blocks are considered as the blockchain technology. While Blockchain was born with Bitcoin, its applications have gone far beyond Bitcoin or digital currency. Many people believe that blockchain could revolutionize many fields, suc",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "business innovation"
                    ],
                    "sourceUrl": "https://doi.org/10.1186/s40854-016-0049-2",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/b80a3eb92d.pdf"
                },
                {
                    "id": "fe762e37e784_p1_4",
                    "paperId": "fe762e37e784",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Overview of Business Innovations and Research Opportunities in Blockchain and Introduction to the Special Issue",
                    "year": "2016",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "its applications have gone far beyond Bitcoin or digital currency. Many people believe that blockchain could revolutionize many fields, such as finance, accounting, management, and law leading to three genera- tions of blockchains, namly, Blockchain 1.0 for digital currency, Blockchain 2.0 for digital finance, and Blockchain 3.0 for digital society. Interestingly, Blockchain 1.0 took a few years to mature starting from 2008, Blockchain 2.0 and 3.0 have emerged almost in paral- lel in an explosive manner around 2015. Nevertheless, while many experimental projects Financial Innovation © The Author(s). 2016 Open Access This article is distributed under the terms of the Creative Commons Attribution 4.0 International License (http://creativecommons.org/licenses/by/4.0/), which permits unrestricted use, distribution, and reproduction in any me",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "business innovation"
                    ],
                    "sourceUrl": "https://doi.org/10.1186/s40854-016-0049-2",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/b80a3eb92d.pdf"
                },
                {
                    "id": "fe762e37e784_p1_5",
                    "paperId": "fe762e37e784",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Overview of Business Innovations and Research Opportunities in Blockchain and Introduction to the Special Issue",
                    "year": "2016",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "nternational License (http://creativecommons.org/licenses/by/4.0/), which permits unrestricted use, distribution, and reproduction in any medium, provided you give appropriate credit to the original author(s) and the source, provide a link to the Creative Commons license, and indicate if changes were made. Zhao et al. Financial Innovation (2016) 2:28 DOI 10.1186/s40854-016-0049-2",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "business innovation"
                    ],
                    "sourceUrl": "https://doi.org/10.1186/s40854-016-0049-2",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/b80a3eb92d.pdf"
                },
                {
                    "id": "fe762e37e784_p2_1",
                    "paperId": "fe762e37e784",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Overview of Business Innovations and Research Opportunities in Blockchain and Introduction to the Special Issue",
                    "year": "2016",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "have mushroomed, it will take some years for Blockchain 2.0 and 3.0 to take hold and create real economic impacts. According to the search volumes of Bitcoin and blockchain in Fig. 1, Bitcoin had most of the search queries before the year of 2014. While blockchain was not very well recognized with the wave of Bitcoin, it is getting more and more attention from people in many industries recently. While blockchain has been generating enormous impacts to many aspects of our life, research on blockchain technology is still sparse. We conducted a search of “block- chain” in the Web of Science search engine provided by Thomson Reuters and got only 15 published articles in total (As of 11-30-2016). The earliest publication was in 2015, which is just one year before this special issue. We also searched the SSRN database which may include mainly w",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "business innovation"
                    ],
                    "sourceUrl": "https://doi.org/10.1186/s40854-016-0049-2",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/b80a3eb92d.pdf"
                },
                {
                    "id": "fe762e37e784_p2_2",
                    "paperId": "fe762e37e784",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Overview of Business Innovations and Research Opportunities in Blockchain and Introduction to the Special Issue",
                    "year": "2016",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "est publication was in 2015, which is just one year before this special issue. We also searched the SSRN database which may include mainly works that are research-in-progress. In total, we found 107 papers that are published in SSRN (As of 11-30-2016). Similar to the Web of Science data, most of these papers are published in the year of 2015 and 2016. The detailed numbers of papers published in both Web of Science and SSRN are shown in Table 1. Blockchain research The blockchain technology solves the double-spend problem with the help of public-key cryptography, whereby each user is assigned a private key and a public key is shared with all other users. The main idea of blockchain is a distributed database comprising records of transactions that are shared among participating parties. Each and every of these trans- actions is verified by",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "business innovation"
                    ],
                    "sourceUrl": "https://doi.org/10.1186/s40854-016-0049-2",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/b80a3eb92d.pdf"
                },
                {
                    "id": "fe762e37e784_p2_3",
                    "paperId": "fe762e37e784",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Overview of Business Innovations and Research Opportunities in Blockchain and Introduction to the Special Issue",
                    "year": "2016",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "abase comprising records of transactions that are shared among participating parties. Each and every of these trans- actions is verified by the consensus of a majority of the participants in the system, making fraudulent transactions unable to pass collective verification. Once a record is created and accepted by the blockchain, it can never be altered. Existing research on blockchain has been mainly focused on system efficiency, security and innovative applications. By design, efficiency is one of the most important concerns for blockchain. Block- chain requires a very strict verification process to create a new transaction record, which leads to a significant latency of confirmation time and waste of computing re- sources. Currently, it takes about 10 min for a transaction to be confirmed. In addition, thousands of nodes are running to",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "business innovation"
                    ],
                    "sourceUrl": "https://doi.org/10.1186/s40854-016-0049-2",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/b80a3eb92d.pdf"
                },
                {
                    "id": "cd90c0b07964_p1_1",
                    "paperId": "cd90c0b07964",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain and Digital Finance",
                    "year": "2022",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "Blockchain and digital finance Wei Xu1, Daning Hu2*, Karl Reiner Lang3 and J. Leon Zhao4 Blockchain technology and its applications in various business domains have attracted great attention from researchers and practitioners in recent years. Finance, which is arguably the most promising and well-known application domain, has been significantly transformed into digital finance by various novel and open technological and business innovations rooted in blockchain technology, such as decentralized finance and crypto- currency. Digital finance innovations like digital payments, crowdfunding, supply chain finance, and robo-advising have made significant progress. The main goal of this special issue is to deepen and broaden our understanding of the impacts, values, and challenges brought by blockchain technology and digital finance. Blockchain",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9702689/",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/6faa14dd0a.pdf"
                },
                {
                    "id": "cd90c0b07964_p1_2",
                    "paperId": "cd90c0b07964",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain and Digital Finance",
                    "year": "2022",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "eepen and broaden our understanding of the impacts, values, and challenges brought by blockchain technology and digital finance. Blockchain technology is a distributed ledger introduced for cryptocurrency in 2008 by Satoshi Nakamoto. This technology is poised to become one of the most exciting new inventions after the Internet as it resolves the trust issue efficiently via network computing (Zhao et al. 2016). The article in the Economist Magazine on October 31, 2015 suggested blockchain as the trust machine that would shape how businesses are operated and how transactions are executed. In Finance, it not only changes the way how financial information can be stored and processed securely and efficiently, but can also transform the principles and processes embedded in traditional centralized financial institutions. The articles included in",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9702689/",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/6faa14dd0a.pdf"
                },
                {
                    "id": "cd90c0b07964_p1_3",
                    "paperId": "cd90c0b07964",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain and Digital Finance",
                    "year": "2022",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "ly, but can also transform the principles and processes embedded in traditional centralized financial institutions. The articles included in this special issue show how blockchain technology can be applied in novel ways for supporting the transformation of business processes and operations in digital Finance. A large number of submissions were received in response to the call for papers on the theme of blockchain and digital finance. After an extensive review process, 15 of them were included in this 36th volume of Financial Innovation (FIN), Volume 8, No. 6 (2022). Next, we summarize the key outcomes of these articles and then identify an agenda for future research that has emanated from them. A summary of the special issue papers Since cryptocurrency is the earliest and most established application of blockchain tech- nology in digital",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9702689/",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/6faa14dd0a.pdf"
                },
                {
                    "id": "cd90c0b07964_p1_4",
                    "paperId": "cd90c0b07964",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain and Digital Finance",
                    "year": "2022",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "ary of the special issue papers Since cryptocurrency is the earliest and most established application of blockchain tech- nology in digital finance area, most papers in this special issue are related to this topic. These papers can mainly be categorized into four sub themes. The first one is mainly regarding to the price prediction of cryptocurrency and crypto-related assets. Gurrib et al. (2022) find that Fibonacci retracement, a popular technical analysis indicator, cap- tures energy stock prices better than energy cryptocurrencies. Critien et al. (2022) build Open Access © The Author(s) 2022. Open Access This article is licensed under a Creative Commons Attribution 4.0 International License, which permits use, sharing, adaptation, distribution and reproduction in any medium or format, as long as you give appropriate credit to the origi",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9702689/",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/6faa14dd0a.pdf"
                },
                {
                    "id": "cd90c0b07964_p1_5",
                    "paperId": "cd90c0b07964",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain and Digital Finance",
                    "year": "2022",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "permits use, sharing, adaptation, distribution and reproduction in any medium or format, as long as you give appropriate credit to the original author(s) and the source, provide a link to the Creative Commons licence, and indicate if changes were made. The images or other third party material in this article are included in the article’s Creative Commons licence, unless indicated otherwise in a credit line to the mate- rial. If material is not included in the article’s Creative Commons licence and your intended use is not permitted by statutory regulation or exceeds the permitted use, you will need to obtain permission directly from the copyright holder. To view a copy of this licence, visit http://​ creat​iveco​mmons.​org/​licen​ses/​by/4.​0/. EDITORIAL Xu et al. Financial Innovation (2022) 8:97 https://doi.org/10.1186/s40854-022-00420-y",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9702689/",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/6faa14dd0a.pdf"
                },
                {
                    "id": "cd90c0b07964_p1_6",
                    "paperId": "cd90c0b07964",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain and Digital Finance",
                    "year": "2022",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "creat​iveco​mmons.​org/​licen​ses/​by/4.​0/. EDITORIAL Xu et al. Financial Innovation (2022) 8:97 https://doi.org/10.1186/s40854-022-00420-y Financial Innovation *Correspondence: hdaning@gmail.com 1 Renmin University of China, Beijing, China 2 Southern University of Science and Technology, Shenzhen, China 3 City University of New York, New York City, USA 4 The Chinese University of Hong Kong, Shenzhen, China",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9702689/",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/6faa14dd0a.pdf"
                },
                {
                    "id": "cd90c0b07964_p2_1",
                    "paperId": "cd90c0b07964",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain and Digital Finance",
                    "year": "2022",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "Page 2 of 4 Xu et al. Financial Innovation (2022) 8:97 a model to predict the direction and the magnitude of Bitcoin price changes by analyz- ing the sentiment and data volume of tweets. Li et al. (2022) propose a deep-learning model for forecasting the daily price changes in the Bitcoin market and algorithmic trad- ing. The proposed model obtains higher investment returns than benchmark models in a trading simulation. The second sub-theme is mainly about investor behavior and market phenomena in cryptocurrency markets. Blasco et al. (2022) study the herding effect among exchanges before the Bitcoin futures expiration date. Haykir and Yagli (2022) investigate financial bubbles in the cryptocurrency market during the COVID-19 pandemic. They suggest that bubbles are common in cryptocurrency markets, which is inconsistent with the effi- cien",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9702689/",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/6faa14dd0a.pdf"
                },
                {
                    "id": "cd90c0b07964_p2_2",
                    "paperId": "cd90c0b07964",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain and Digital Finance",
                    "year": "2022",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "rket during the COVID-19 pandemic. They suggest that bubbles are common in cryptocurrency markets, which is inconsistent with the effi- cient market hypothesis. Fratrič et al. (2022) design an agent-based model to reproduce Bitcoin market participants’ behaviors during the time of an alleged Bitcoin price manip- ulation. Hasan et al. (2022) examine the dynamics of liquidity connectedness in the cryp- tocurrency market. They report that there is a moderate liquidity connectedness among six major cryptocurrencies, with Bitcoin and Litecoin playing a significant role concern- ing the magnitude of connectedness. Moreover, Cui and Maghyereh (2022) study the higher-order moment co-movements and risk connectedness among cryptocurrencies before and during the COVID-19 pandemic. Lorenzo and Arroyo (2022) describe, sum- marize, and segment the main",
                    "topicTags": [
                        "blockchain",
                        "digital finance",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9702689/",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/6faa14dd0a.pdf"
                },
                {
                    "id": "3ea1c64b8396_p1_1",
                    "paperId": "3ea1c64b8396",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain, Crypto Assets, and Financial Innovation: A Decade of Insights and Advances",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "Gang Kou · Yongqiang Li · Zongyi Zhang · J. Leon Zhao · Zhi Zhuo Editors Blockchain, Crypto Assets, and Financial Innovation A Decade of Insights and Advances",
                    "topicTags": [
                        "blockchain",
                        "crypto assets",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://link.springer.com/book/10.1007/978-981-96-6839-7",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/59670ec885.pdf"
                },
                {
                    "id": "3ea1c64b8396_p3_1",
                    "paperId": "3ea1c64b8396",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain, Crypto Assets, and Financial Innovation: A Decade of Insights and Advances",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 3,
                    "section": "pdf_text",
                    "text": "Gang Kou · Yongqiang Li · Zongyi Zhang · J. Leon Zhao · Zhi Zhuo Editors Blockchain, Crypto Assets, and Financial Innovation A Decade of Insights and Advances",
                    "topicTags": [
                        "blockchain",
                        "crypto assets",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://link.springer.com/book/10.1007/978-981-96-6839-7",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/59670ec885.pdf"
                },
                {
                    "id": "3ea1c64b8396_p4_1",
                    "paperId": "3ea1c64b8396",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain, Crypto Assets, and Financial Innovation: A Decade of Insights and Advances",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 4,
                    "section": "pdf_text",
                    "text": "Editors Gang Kou Southwestern University of Finance and Economics Chengdu, Sichuan, China Xiangjiang Laboratory Changsha, Hunan, China Zongyi Zhang Xiamen University Xiamen, Fujian, China Zhi Zhuo Southwestern University of Finance and Economics Chengdu, Sichuan, China Yongqiang Li Southwestern University of Finance and Economics Chengdu, Sichuan, China J. Leon Zhao Chinese University of Hong Kong (Shenzhen) Shenzhen, Guangdong, China ISBN 978-981-96-6838-0 ISBN 978-981-96-6839-7 (eBook) https://doi.org/10.1007/978-981-96-6839-7 This work was supported by Southwestern University of Finance and Economics. © The Editor(s) (if applicable) and The Author(s) 2025. This book is an open access publication. Open Access This book is licensed under the terms of the Creative Commons Attribution 4.0 International License (http://creativecommons.org/l",
                    "topicTags": [
                        "blockchain",
                        "crypto assets",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://link.springer.com/book/10.1007/978-981-96-6839-7",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/59670ec885.pdf"
                },
                {
                    "id": "3ea1c64b8396_p4_2",
                    "paperId": "3ea1c64b8396",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain, Crypto Assets, and Financial Innovation: A Decade of Insights and Advances",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 4,
                    "section": "pdf_text",
                    "text": "pen Access This book is licensed under the terms of the Creative Commons Attribution 4.0 International License (http://creativecommons.org/licenses/by/4.0/), which permits use, sharing, adaptation, distribution, and reproduction in any medium or format, as long as you give appropriate credit to the original author(s) and the source, provide a link to the Creative Commons license and indicate if changes were made. The images or other third party material in this book are included in the book’s Creative Commons license, unless indicated otherwise in a credit line to the material. If material is not included in the book’s Creative Commons license and your intended use is not permitted by statutory regulation or exceeds the permitted use, you will need to obtain permission directly from the copyright holder. The use of general descriptive nam",
                    "topicTags": [
                        "blockchain",
                        "crypto assets",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://link.springer.com/book/10.1007/978-981-96-6839-7",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/59670ec885.pdf"
                },
                {
                    "id": "3ea1c64b8396_p4_3",
                    "paperId": "3ea1c64b8396",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain, Crypto Assets, and Financial Innovation: A Decade of Insights and Advances",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 4,
                    "section": "pdf_text",
                    "text": "tion or exceeds the permitted use, you will need to obtain permission directly from the copyright holder. The use of general descriptive names, registered names, trademarks, service marks, etc. in this publication does not imply, even in the absence of a speciﬁc statement, that such names are exempt from the relevant protective laws and regulations and therefore free for general use. The publisher, the authors, and the editors are safe to assume that the advice and information in this book are believed to be true and accurate at the date of publication. Neither the publisher nor the authors or the editors give a warranty, expressed or implied, with respect to the material contained herein or for any errors or omissions that may have been made. The publisher remains neutral with regard to jurisdictional claims in published maps and institu",
                    "topicTags": [
                        "blockchain",
                        "crypto assets",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://link.springer.com/book/10.1007/978-981-96-6839-7",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/59670ec885.pdf"
                },
                {
                    "id": "3ea1c64b8396_p4_4",
                    "paperId": "3ea1c64b8396",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain, Crypto Assets, and Financial Innovation: A Decade of Insights and Advances",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 4,
                    "section": "pdf_text",
                    "text": "rrors or omissions that may have been made. The publisher remains neutral with regard to jurisdictional claims in published maps and institutional afﬁliations. This Springer imprint is published by the registered company Springer Nature Singapore Pte Ltd. The registered company address is: 152 Beach Road, #21-01/04 Gateway East, Singapore 189721, Singapore If disposing of this product, please recycle the paper.",
                    "topicTags": [
                        "blockchain",
                        "crypto assets",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://link.springer.com/book/10.1007/978-981-96-6839-7",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/59670ec885.pdf"
                },
                {
                    "id": "3ea1c64b8396_p5_1",
                    "paperId": "3ea1c64b8396",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain, Crypto Assets, and Financial Innovation: A Decade of Insights and Advances",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 5,
                    "section": "pdf_text",
                    "text": "Preface Over the past decade, ﬁnancial technology, particularly blockchain and cryptocurrencies, has undergone a remarkable evolution from their inception to their maturation. Along with the growth of digital currencies and cryptocurrencies, Financial Innovation has celebrated its ﬁrst ten years since its launch in 2015 and was indexed by the SSCI in 2019. As the ﬁrst cryptocurrency, the Bitcoin white paper was published in 2008 by Satoshi Nakamoto, marking the birth of digital currency and blockchain technology. In 2009, Bitcoin was ofﬁcially created on the basis of blockchain technology, which has character- istics such as decentralization, immutability, and anonymity. Many new digital currencies and related technologies, such as Ethereum and Litecoin, have also begun to emerge, the application scenarios and methods of digital currencie",
                    "topicTags": [
                        "blockchain",
                        "crypto assets",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://link.springer.com/book/10.1007/978-981-96-6839-7",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/59670ec885.pdf"
                },
                {
                    "id": "3ea1c64b8396_p5_2",
                    "paperId": "3ea1c64b8396",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain, Crypto Assets, and Financial Innovation: A Decade of Insights and Advances",
                    "year": "2025",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 5,
                    "section": "pdf_text",
                    "text": "d related technologies, such as Ethereum and Litecoin, have also begun to emerge, the application scenarios and methods of digital currencies have begun to diversify, and the market scale has rapidly expanded. At this stage, digital currencies began to venture into areas such as payment, investment, lending, and obtaining a certain legal status in some countries. Since 2020, Bitcoin prices have once again broken through historical highs, and an increasing number of ﬁnancial institutions and businesses are beginning to embrace dig- ital currencies and explore the integration of digital currencies with the traditional ﬁnan- cial system. In addition, some countries have begun to explore the possibility of issuing central bank digital currencies (CBDCs). In terms of technology, blockchain technol- ogy has also been further developed and innov",
                    "topicTags": [
                        "blockchain",
                        "crypto assets",
                        "financial innovation"
                    ],
                    "sourceUrl": "https://link.springer.com/book/10.1007/978-981-96-6839-7",
                    "file": "assets/scholars/zhao_jianliang_leon/papers/59670ec885.pdf"
                }
            ],
            "metadataRecords": [
                {
                    "paperId": "39581bb5208e",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Smart Contract Security: A Software Lifecycle Perspective",
                    "year": "2019",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "smart contract",
                        "blockchain security",
                        "software lifecycle"
                    ],
                    "description": "Review of smart-contract vulnerabilities and defenses across design, implementation, testing, deployment, monitoring, and analysis.",
                    "sourceUrl": "https://doi.org/10.1109/ACCESS.2019.2946988"
                },
                {
                    "paperId": "3c92fda6dc46",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain Security: A Survey of Techniques and Research Directions",
                    "year": "2022",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "blockchain security",
                        "cryptography",
                        "survey"
                    ],
                    "description": "Survey of blockchain security at process, data, and infrastructure levels, relevant to cryptographic protection, storage, access, and infrastructure threats.",
                    "sourceUrl": "https://dblp.org/rec/journals/tsc/LengZZHB22"
                },
                {
                    "paperId": "2a730a27211c",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Blockchain-Secured Smart Manufacturing in Industry 4.0: A Survey",
                    "year": "2021",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "blockchain",
                        "smart manufacturing",
                        "cybersecurity"
                    ],
                    "description": "Survey of blockchain-secured manufacturing, including scalability, flexibility, and cybersecurity challenges.",
                    "sourceUrl": "https://dblp.org/rec/journals/tsmc/LengYZZLGCF21"
                },
                {
                    "paperId": "a2927b7423c9",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "ManuChain: Combining Permissioned Blockchain With a Holistic Optimization Model as Bi-Level Intelligence for Smart Manufacturing",
                    "year": "2020",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "medium-high",
                    "topicTags": [
                        "permissioned blockchain",
                        "smart manufacturing",
                        "optimization"
                    ],
                    "description": "Permissioned-blockchain architecture for smart manufacturing and decentralized coordination.",
                    "sourceUrl": "https://doi.org/10.1109/TSMC.2019.2930418"
                },
                {
                    "paperId": "7e8c600dd46f",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Makerchain: A Blockchain With Chemical Signature for Self-Organizing Process in Social Manufacturing",
                    "year": "2019",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "blockchain",
                        "anti-counterfeiting",
                        "traceability"
                    ],
                    "description": "Blockchain-driven decentralized model for product authenticity, anti-counterfeiting, smart contracts, and lifecycle traceability in social manufacturing.",
                    "sourceUrl": "https://www.sciencedirect.com/science/article/pii/S0959652619322309"
                },
                {
                    "paperId": "e1b42982672e",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Prediction of Initial Coin Offering Success Based on Team Knowledge and Expert Evaluation",
                    "year": "2021",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "ICO",
                        "blockchain finance",
                        "commercialization"
                    ],
                    "description": "Uses team knowledge and expert evaluation to predict ICO success; relevant to blockchain finance and commercialization.",
                    "sourceUrl": "https://www.sciencedirect.com/science/article/pii/S0167923621000841"
                },
                {
                    "paperId": "cc376ceb8d71",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "SocioLink: Leveraging Relational Information in Knowledge Graphs for Startup Recommendations",
                    "year": "2023",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "knowledge graph",
                        "startup recommendation",
                        "technology commercialization"
                    ],
                    "description": "Knowledge-graph and machine-learning framework for venture-capital startup recommendation; directly relevant to technology commercialization.",
                    "sourceUrl": "https://www.tandfonline.com/doi/abs/10.1080/07421222.2023.2196771"
                },
                {
                    "paperId": "88123fb8401d",
                    "scholarId": "zhao_jianliang_leon",
                    "title": "Services Computing as the Foundation of Enterprise Agility: Overview of Recent Advances and Introduction to the Special Issue",
                    "year": "2007",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "services computing",
                        "middleware",
                        "enterprise agility"
                    ],
                    "description": "Overview of service-oriented architecture, web services, services computing, and enterprise agility; relevant to middleware and information systems.",
                    "sourceUrl": "https://ideas.repec.org/a/spr/infosf/v9y2007i1d10.1007_s10796-007-9023-x.html"
                }
            ]
        },
        "patentMemory": [
            {
                "id": "CN114117510B",
                "publicationNumber": "CN114117510B",
                "title": "一種隨機私鑰儲存方法及裝置、隨機私鑰調用方法及裝置",
                "field": "blockchain-trust",
                "industry": "区块链可信内容",
                "summary": "This paper provides a method and apparatus for storing and retrieving random private keys. The random private key storage method includes: modifying data at certain locations in the original private key to generate a new private key and generating a private key encryption information file recording the modification information of the original private key; generating a forged encryption information file; and storing the new private key, the private key encryption information file, and the forged encryption information file respectively. The random private key retrieval method includes: receiving the storage location of the new private key and the storage location of the private key encryption information file selected by the user; determining the private key encryption information file based on the storage location of the private key encryption information file; and using the private key encryption information file to restore the private key at the location of the new private key to obtain the original private key. This paper can protect the security of private keys, prevent private key theft, and improve the convenience of private key operations.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E9%9A%A8%E6%A9%9F%E7%A7%81%E9%91%B0%E5%84%B2%E5%AD%98%E6%96%B9%E6%B3%95%E5%8F%8A%E8%A3%9D%E7%BD%AE%E9%9A%A8%E6%A9%9F%E7%A7%81%E9%91%B0%E8%AA%BF%E7%94%A8%E6%96%B9%E6%B3%95%E5%8F%8A%E8%A3%9D%E7%BD%AE/",
                "sourceType": "patent",
                "legalStatus": "Published - 17 Mar 2026 | external lookup: CN114117510B pub=2026-03-17 assignee=香港城市大学深圳研究院 conf=high"
            },
            {
                "id": "CN114513317B",
                "publicationNumber": "CN114513317B",
                "title": "一種抗分佈式拒絕服務攻擊方法、系統、設備及存儲介質",
                "field": "blockchain-trust",
                "industry": "区块链可信内容",
                "summary": "Provided herein are methods, systems, devices, and storage media for combating distributed denial of service attacks, wherein the methods comprise: randomly selecting form endorsement nodes from redundant endorsement nodes, wherein the redundant endorsement nodes are endorsement nodes except for appointed endorsement nodes of current transaction in a blockchain; and sending a transaction endorsement request to the appointed endorsement node and the form endorsement node. In the method, formal endorsement is carried out by arranging the formal endorsement node, and in the process of trading by the blockchain node, a transaction endorsement request is randomly sent to the formal endorsement node, so that false transaction type judgment information can be transmitted to a DDoS internal attacker, the purpose of interfering the transaction type judgment of the DDoS internal attacker is achieved, and further, the attack measurement of the DDoS internal attacker is difficult to effectively develop.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E6%8A%97%E5%88%86%E4%BD%88%E5%BC%8F%E6%8B%92%E7%B5%95%E6%9C%8D%E5%8B%99%E6%94%BB%E6%93%8A%E6%96%B9%E6%B3%95%E7%B3%BB%E7%B5%B1%E8%A8%AD%E5%82%99%E5%8F%8A%E5%AD%98%E5%84%B2%E4%BB%8B%E8%B3%AA/",
                "sourceType": "patent",
                "legalStatus": "Published - 4 Jun 2024 | external lookup: CN114513317B pub=2024-06-04 assignee=香港城市大学深圳研究院 conf=high"
            },
            {
                "id": "CN114077631A",
                "publicationNumber": "CN114077631A",
                "title": "一種區塊鏈應用系統中間件的數據交互方法及中間件系統",
                "field": "blockchain-trust",
                "industry": "区块链可信内容",
                "summary": "This paper provides a data interaction method and middleware system for blockchain application system middleware, wherein the method includes: converting operation commands received from the blockchain application system into machine instructions recognized by hardware devices; Perform data format conversion on the manufacturing data uploaded by the hardware device to obtain blockchain information that meets the format requirements of the blockchain application system; send the machine instructions to the hardware device, and send the blockchain information to The blockchain application system. This paper can realize the interconnection between different blockchain application systems and different hardware devices, realize the efficient combination of on-chain and off-chain, and make the operation of the blockchain application system on hardware devices more convenient.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E5%8D%80%E5%A1%8A%E9%8F%88%E6%87%89%E7%94%A8%E7%B3%BB%E7%B5%B1%E4%B8%AD%E9%96%93%E4%BB%B6%E7%9A%84%E6%95%B8%E6%93%9A%E4%BA%A4%E4%BA%92%E6%96%B9%E6%B3%95%E5%8F%8A%E4%B8%AD%E9%96%93%E4%BB%B6%E7%B3%BB%E7%B5%B1/",
                "sourceType": "patent",
                "legalStatus": "Accepted/In press/Filed - 18 Aug 2020 | external lookup: CN114077631A pub= assignee=香港城市大学深圳研究院 conf=manual"
            }
        ]
    },
    {
        "id": "ruiyunxu2",
        "name": "Ruiyun XU",
        "sourceName": "XU, Ruiyun",
        "email": "ruiyunxu2-c@my.cityu.edu.hk",
        "auId": "ruiyunxu2",
        "profileUrl": "https://scholars.cityu.edu.hk/en/persons/ruiyunxu2/",
        "affiliation": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China.",
        "affiliationTier": "top_university",
        "expertise": [
            "search",
            "query",
            "document",
            "textual data"
        ],
        "patentIds": [
            "US11386164B2",
            "US10747759B2"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22Ruiyun%20XU%20/%20City%20University%20of%20Hong%20Kong%2C%20Department%20of%20Information%20Systems%2C%20Hong%20Kong%2C%20Peoples%20R%20China.%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%2316a34a%22/%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba%28255%2C255%2C255%2C0.24%29%22/%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba%28255%2C255%2C255%2C0.42%29%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3ERX%3C/text%3E%3C/svg%3E",
        "paperBackground": [
            {
                "scholarId": "ruiyunxu2",
                "title": "SocioLink: Leveraging Relational Information in Knowledge Graphs for Startup Recommendations",
                "year": "2023",
                "description": "Startup recommendation using relational information in knowledge graphs.",
                "doi": "10.1080/07421222.2023.2196771",
                "sourceUrl": "https://www.tandfonline.com/doi/abs/10.1080/07421222.2023.2196771",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "startup recommendation",
                    "knowledge graph",
                    "venture capital"
                ],
                "authors": [
                    "Ruiyun XU"
                ],
                "paperId": "cc376ceb8d71"
            },
            {
                "scholarId": "ruiyunxu2",
                "title": "smartCVC: A Novel Startup Selection Method for Corporate Venture Capital",
                "year": "2018",
                "description": "Topic modeling and network features for recommending promising startups to corporate venture capital investors.",
                "sourceUrl": "https://dblp.org/rec/conf/icis/XuCZ18",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "corporate venture capital",
                    "startup selection",
                    "recommendation"
                ],
                "authors": [
                    "Ruiyun XU"
                ],
                "paperId": "502a66fdfaaf"
            },
            {
                "scholarId": "ruiyunxu2",
                "title": "smartCVC: Data Science Meets Corporate Venture Capital",
                "year": "2018",
                "description": "AMCIS version of a data-science approach to corporate venture capital startup selection.",
                "sourceUrl": "https://dblp.org/rec/conf/amcis/XuCZ18",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "corporate venture capital",
                    "data science",
                    "startup selection"
                ],
                "authors": [
                    "Ruiyun XU"
                ],
                "paperId": "6077ded8da20"
            },
            {
                "title": "Searching Electronic Documents Based on Example-based Search Query",
                "authors": [
                    "Ruiyun XU"
                ],
                "year": "2022",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/searching-electronic-documents-based-on-example-based-search-quer/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "description": "Public scholarly background metadata for the digital advisor.",
                "paperId": "1f51ecda1d47"
            },
            {
                "title": "A System and Method for Conducting a Textual Data Search",
                "authors": [
                    "Ruiyun XU"
                ],
                "year": "2020",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-system-and-method-for-conducting-a-textual-data-search/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "description": "Public scholarly background metadata for the digital advisor.",
                "paperId": "0368d155ae43"
            },
            {
                "title": "A Fast and Comprehensive Literature Search Tool for Information Systems Researchers",
                "authors": [
                    "Ruiyun XU"
                ],
                "year": "2017",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-fast-and-comprehensive-literature-search-tool-for-information-s-2/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "abstract": "For individual researchers, literature search has always been a tedious and time-consuming work, and it is often difficult to find a complete list of relevant articles using existing literature search engines. To address this problem, we propose a novel citation recommendation method using content and citation graph-based information, which produces a list of relevant references given the input of an abstract. In our method, we introduce a new feature of similar peers’ citation choices, which captures the wisdom of crowds in the reference lists of academic articles. The proposed method has achieved better performance in the experiments on a standard dataset compared with existing method. To develop the literature search tool, we plan to first construct a dataset of the paper citation network within the three top IS journals (i.e., ISR, JMIS, MISQ). Then, we plan to implement the proposed method on ISTopic.org, an online platform for the exploration of research topics.",
                "description": "For individual researchers, literature search has always been a tedious and time-consuming work, and it is often difficult to find a complete list of relevant articles using existing literature search engines. To address this problem, we propose a novel citation recommendation method using content and citation graph-based information, which produces a list of relevant references given the input of an abstract. In our method, we introduce a new feature of similar peers’ citation choices, which captures the wisdom of crowds in the reference lists of academic articles. The proposed method has achieved better performance in the experiments on a standard dataset compared with existing method. To develop the literature search tool, we plan to first construct a dataset of the paper citation network within the three top IS journals (i.e., ISR, JMIS, MISQ). Then, we plan to implement the proposed method on ISTopic.org, an online platform for the exploration of research topics.",
                "paperId": "584e72a06ce2"
            }
        ],
        "profileUrls": [
            "https://scholars.cityu.edu.hk/en/persons/ruiyunxu2/"
        ],
        "identityRules": [
            {
                "id": "identity_controlled_proxy",
                "priority": 100,
                "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
            },
            {
                "id": "identity_no_institutional_commitment",
                "priority": 95,
                "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
            }
        ],
        "evidenceRules": [
            {
                "id": "evidence_type_boundary",
                "priority": 100,
                "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
            },
            {
                "id": "evidence_no_fabrication",
                "priority": 100,
                "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
            },
            {
                "id": "evidence_metadata_limit",
                "priority": 90,
                "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
            }
        ],
        "scholarRules": [
            {
                "id": "scholar_field_scope",
                "priority": 85,
                "text": "Prefer answers grounded in Ruiyun XU's public patent ownership, paper background and expertise fields.",
                "fields": [
                    "search",
                    "query",
                    "document",
                    "textual data"
                ]
            },
            {
                "id": "scholar_voice",
                "priority": 55,
                "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
            },
            {
                "id": "scholar_gap_disclosure",
                "priority": 80,
                "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
            }
        ],
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
            }
        ],
        "rules": {
            "identityRules": [
                {
                    "id": "identity_controlled_proxy",
                    "priority": 100,
                    "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
                },
                {
                    "id": "identity_no_institutional_commitment",
                    "priority": 95,
                    "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
                }
            ],
            "evidenceRules": [
                {
                    "id": "evidence_type_boundary",
                    "priority": 100,
                    "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
                },
                {
                    "id": "evidence_no_fabrication",
                    "priority": 100,
                    "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
                },
                {
                    "id": "evidence_metadata_limit",
                    "priority": 90,
                    "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
                }
            ],
            "scholarRules": [
                {
                    "id": "scholar_field_scope",
                    "priority": 85,
                    "text": "Prefer answers grounded in Ruiyun XU's public patent ownership, paper background and expertise fields.",
                    "fields": [
                        "search",
                        "query",
                        "document",
                        "textual data"
                    ]
                },
                {
                    "id": "scholar_voice",
                    "priority": 55,
                    "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
                },
                {
                    "id": "scholar_gap_disclosure",
                    "priority": 80,
                    "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
                }
            ],
            "patentRules": [
                {
                    "id": "patent_first",
                    "priority": 100,
                    "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
                },
                {
                    "id": "no_claim_expansion",
                    "priority": 100,
                    "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
                },
                {
                    "id": "no_legal_conclusion",
                    "priority": 95,
                    "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
                }
            ]
        },
        "skills": [
            {
                "id": "patent_fact_extractor",
                "name": "Patent Fact Extractor",
                "description": "Extract current patent title, abstract, field, public source and local original facts before answering.",
                "sourceTypes": [
                    "patent"
                ],
                "priority": 100,
                "triggers": [
                    "all_patent_questions",
                    "selected_patent_context"
                ]
            },
            {
                "id": "paper_evidence_retriever",
                "name": "Paper Evidence Retriever",
                "description": "Retrieve scholar-bound downloaded PDF chunks and metadata-only paper records that match the question.",
                "sourceTypes": [
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 80,
                "triggers": [
                    "research_basis",
                    "technical_explanation",
                    "business_analysis"
                ]
            },
            {
                "id": "commercialization_assessor",
                "name": "Commercialization Assessor",
                "description": "Translate patent and paper evidence into enterprise scenarios, buyer fit and trial path assumptions.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "user_input"
                ],
                "priority": 70,
                "triggers": [
                    "business_analysis",
                    "licensing_next_step"
                ]
            },
            {
                "id": "technical_due_diligence",
                "name": "Technical Due Diligence",
                "description": "Identify technical, data, equipment, integration and validation gaps that require follow-up.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 65,
                "triggers": [
                    "technical_explanation",
                    "risk_question",
                    "business_analysis"
                ]
            },
            {
                "id": "risk_guard",
                "name": "Risk Guard",
                "description": "Block overclaiming, fabricated citations, legal conclusions and treating metadata-only records as full text.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 100,
                "triggers": [
                    "all_answers",
                    "risk_question",
                    "legal_question"
                ]
            },
            {
                "id": "citation_answer_builder",
                "name": "Citation Answer Builder",
                "description": "Build concise answers with explicit source boundaries and reference chips.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 75,
                "triggers": [
                    "all_answers"
                ]
            }
        ],
        "sessionContext": {
            "selectedPatentPolicy": "active_patent_first",
            "longTermMemoryPolicy": "Only user preferences, enterprise demand context and conversation decisions may persist; scholar, patent and paper facts must come from controlled source data.",
            "answerContextPolicy": "Retrieve only the most relevant patent facts and top paper evidence for each turn."
        },
        "paperMemory": [
            {
                "paperId": "cc376ceb8d71",
                "scholarId": "ruiyunxu2",
                "title": "SocioLink: Leveraging Relational Information in Knowledge Graphs for Startup Recommendations",
                "year": "2023",
                "authors": [
                    "Ruiyun XU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "startup recommendation",
                    "knowledge graph",
                    "venture capital"
                ],
                "sourceUrl": "https://www.tandfonline.com/doi/abs/10.1080/07421222.2023.2196771",
                "file": "",
                "description": "Startup recommendation using relational information in knowledge graphs."
            },
            {
                "paperId": "502a66fdfaaf",
                "scholarId": "ruiyunxu2",
                "title": "smartCVC: A Novel Startup Selection Method for Corporate Venture Capital",
                "year": "2018",
                "authors": [
                    "Ruiyun XU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "corporate venture capital",
                    "startup selection",
                    "recommendation"
                ],
                "sourceUrl": "https://dblp.org/rec/conf/icis/XuCZ18",
                "file": "",
                "description": "Topic modeling and network features for recommending promising startups to corporate venture capital investors."
            },
            {
                "paperId": "6077ded8da20",
                "scholarId": "ruiyunxu2",
                "title": "smartCVC: Data Science Meets Corporate Venture Capital",
                "year": "2018",
                "authors": [
                    "Ruiyun XU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "corporate venture capital",
                    "data science",
                    "startup selection"
                ],
                "sourceUrl": "https://dblp.org/rec/conf/amcis/XuCZ18",
                "file": "",
                "description": "AMCIS version of a data-science approach to corporate venture capital startup selection."
            },
            {
                "paperId": "1f51ecda1d47",
                "scholarId": "ruiyunxu2",
                "title": "Searching Electronic Documents Based on Example-based Search Query",
                "year": "2022",
                "authors": [
                    "Ruiyun XU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/searching-electronic-documents-based-on-example-based-search-quer/",
                "file": "",
                "description": "Public scholarly background metadata for the digital advisor."
            },
            {
                "paperId": "0368d155ae43",
                "scholarId": "ruiyunxu2",
                "title": "A System and Method for Conducting a Textual Data Search",
                "year": "2020",
                "authors": [
                    "Ruiyun XU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-system-and-method-for-conducting-a-textual-data-search/",
                "file": "",
                "description": "Public scholarly background metadata for the digital advisor."
            },
            {
                "paperId": "584e72a06ce2",
                "scholarId": "ruiyunxu2",
                "title": "A Fast and Comprehensive Literature Search Tool for Information Systems Researchers",
                "year": "2017",
                "authors": [
                    "Ruiyun XU"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-fast-and-comprehensive-literature-search-tool-for-information-s-2/",
                "file": "",
                "description": "For individual researchers, literature search has always been a tedious and time-consuming work, and it is often difficult to find a complete list of relevant articles using existing literature search engines. To address this problem, we propose a novel citation recommendation method using content and citation graph-based information, which produces a list of relevant references given the input of an abstract. In our method, we introduce a new feature of similar peers’ citation choices, which captures the wisdom of crowds in the reference lists of academic articles. The proposed method has achieved better performance in the experiments on a standard dataset compared with existing method. To develop the literature search tool, we plan to first construct a dataset of the paper citation network within the three top IS journals (i.e., ISR, JMIS, MISQ). Then, we plan to implement the proposed method on ISTopic.org, an online platform for the exploration of research topics."
            }
        ],
        "knowledgeIndex": {
            "path": "assets/scholars/ruiyunxu2/knowledge/index.json",
            "paperCount": 6,
            "downloadedPdfCount": 0,
            "metadataOnlyCount": 6,
            "chunkCount": 0,
            "topics": [
                "startup recommendation",
                "knowledge graph",
                "venture capital",
                "corporate venture capital",
                "startup selection",
                "recommendation",
                "data science"
            ],
            "sourceTypes": [
                "patent",
                "paper_pdf",
                "paper_metadata",
                "profile",
                "user_input"
            ],
            "chunks": [],
            "metadataRecords": [
                {
                    "paperId": "cc376ceb8d71",
                    "scholarId": "ruiyunxu2",
                    "title": "SocioLink: Leveraging Relational Information in Knowledge Graphs for Startup Recommendations",
                    "year": "2023",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "startup recommendation",
                        "knowledge graph",
                        "venture capital"
                    ],
                    "description": "Startup recommendation using relational information in knowledge graphs.",
                    "sourceUrl": "https://www.tandfonline.com/doi/abs/10.1080/07421222.2023.2196771"
                },
                {
                    "paperId": "502a66fdfaaf",
                    "scholarId": "ruiyunxu2",
                    "title": "smartCVC: A Novel Startup Selection Method for Corporate Venture Capital",
                    "year": "2018",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "corporate venture capital",
                        "startup selection",
                        "recommendation"
                    ],
                    "description": "Topic modeling and network features for recommending promising startups to corporate venture capital investors.",
                    "sourceUrl": "https://dblp.org/rec/conf/icis/XuCZ18"
                },
                {
                    "paperId": "6077ded8da20",
                    "scholarId": "ruiyunxu2",
                    "title": "smartCVC: Data Science Meets Corporate Venture Capital",
                    "year": "2018",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "corporate venture capital",
                        "data science",
                        "startup selection"
                    ],
                    "description": "AMCIS version of a data-science approach to corporate venture capital startup selection.",
                    "sourceUrl": "https://dblp.org/rec/conf/amcis/XuCZ18"
                },
                {
                    "paperId": "1f51ecda1d47",
                    "scholarId": "ruiyunxu2",
                    "title": "Searching Electronic Documents Based on Example-based Search Query",
                    "year": "2022",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Public scholarly background metadata for the digital advisor.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/searching-electronic-documents-based-on-example-based-search-quer/"
                },
                {
                    "paperId": "0368d155ae43",
                    "scholarId": "ruiyunxu2",
                    "title": "A System and Method for Conducting a Textual Data Search",
                    "year": "2020",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "Public scholarly background metadata for the digital advisor.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-system-and-method-for-conducting-a-textual-data-search/"
                },
                {
                    "paperId": "584e72a06ce2",
                    "scholarId": "ruiyunxu2",
                    "title": "A Fast and Comprehensive Literature Search Tool for Information Systems Researchers",
                    "year": "2017",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "For individual researchers, literature search has always been a tedious and time-consuming work, and it is often difficult to find a complete list of relevant articles using existing literature search engines. To address this problem, we propose a novel citation recommendation method using content and citation graph-based information, which produces a list of relevant references given the input of an abstract. In our method, we introduce a new feature of similar peers’ citation choices, which captures the wisdom of crowds in the reference lists of academic articles. The proposed method has achieved better performance in the experiments on a standard dataset compared with existing method. To develop the literature search tool, we plan to first construct a dataset of the paper citation network within the three top IS journals (i.e., ISR, JMIS, MISQ). Then, we plan to implement the proposed method on ISTopic.org, an online platform for the exploration of research topics.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-fast-and-comprehensive-literature-search-tool-for-information-s-2/"
                }
            ]
        },
        "patentMemory": [
            {
                "id": "US11386164B2",
                "publicationNumber": "US11386164B2",
                "title": "Searching Electronic Documents Based on Example-based Search Query",
                "field": "enterprise-search",
                "industry": "信息检索",
                "summary": "A computer implemented method for searching electronic documents, and associated system and computer program product. The method includes receiving an input representing an example-based search query and processing the input. The method also includes determining, for each of the electronic documents, a relevance score between the input and the corresponding electronic document. The determination is based on, at least, textual similarity between the input and the corresponding electronic document, topical similarity between the input and the corresponding electronic document, as well as linkage relationship in a linkage network of the plurality of electronic documents. The method also includes determining, based on the determined relevance scores, a search result containing one or more of the electronic documents. The search results will be provided to the user.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/searching-electronic-documents-based-on-example-based-search-quer/",
                "sourceType": "patent",
                "legalStatus": "Published - 12 Jul 2022 | external lookup: US11386164B2 pub=2022-07-12 assignee=City University Of Hong Kong conf=high"
            },
            {
                "id": "US10747759B2",
                "publicationNumber": "US10747759B2",
                "title": "A System and Method for Conducting a Textual Data Search",
                "field": "enterprise-search",
                "industry": "信息检索",
                "summary": "A system and a method for conducting a textual data search includes receiving a search query associated with a search topic; analyzing the search query to determine at least one attribute of the search topic; processing the at least one attribute and a plurality of articles in a database; and identifying one or more results being relevant to the search topic in the plurality of articles in the database.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-system-and-method-for-conducting-a-textual-data-search/",
                "sourceType": "patent",
                "legalStatus": "Published - 18 Aug 2020 | external lookup: US10747759B2 pub=2020-08-18 assignee=City University Of Hong Kong conf=high"
            }
        ]
    },
    {
        "id": "tsang_sze_chun",
        "name": "Sze Chun TSANG",
        "sourceName": "TSANG, Sze Chun",
        "email": "",
        "auId": "",
        "profileUrl": "",
        "affiliation": "City University of Hong Kong, Department of Management, Hong Kong, Peoples R China.",
        "affiliationTier": "top_university",
        "expertise": [
            "visual tracking",
            "creating an image",
            "image",
            "tracking"
        ],
        "patentIds": [
            "US10432907B2"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22Sze%20Chun%20TSANG%20/%20City%20University%20of%20Hong%20Kong%2C%20Department%20of%20Management%2C%20Hong%20Kong%2C%20Peoples%20R%20China.%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%23be123c%22/%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba%28255%2C255%2C255%2C0.24%29%22/%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba%28255%2C255%2C255%2C0.42%29%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3ESC%3C/text%3E%3C/svg%3E",
        "paperBackground": [
            {
                "scholarId": "tsang_sze_chun",
                "title": "Computational Light Painting and Kinetic Photography",
                "year": "2018",
                "description": "Robotic display/camera paths and real-time slicing for volumetric long-exposure imagery.",
                "doi": "10.1145/3229147.3229167",
                "sourceUrl": "https://dblp.org/rec/conf/npar/HuangTWL18",
                "pdfUrl": "https://diglib.eg.org/bitstream/handle/10.1145/3229147-3229167/14-036-huang.pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "computational photography",
                    "light painting",
                    "robotic imaging"
                ],
                "authors": [
                    "Sze Chun TSANG"
                ],
                "file": "assets/scholars/tsang_sze_chun/papers/cf73fe139b.pdf",
                "downloadUrl": "https://diglib.eg.org/bitstream/handle/10.1145/3229147-3229167/14-036-huang.pdf",
                "paperId": "3950b0a2ee6c"
            },
            {
                "scholarId": "tsang_sze_chun",
                "title": "Real-time model slicing in arbitrary direction using octree",
                "year": "2017",
                "description": "SIGGRAPH poster on octree-based arbitrary-direction model slicing for real-time rendering.",
                "doi": "10.1145/3102163.3102185",
                "sourceUrl": "https://doi.org/10.1145/3102163.3102185",
                "downloadStatus": "metadata_only",
                "confidence": "medium-high",
                "topicTags": [
                    "model slicing",
                    "octree",
                    "real-time rendering"
                ],
                "authors": [
                    "Sze Chun TSANG"
                ],
                "paperId": "6781a54ba830"
            },
            {
                "scholarId": "tsang_sze_chun",
                "title": "Computational swept volume light painting via robotic non-linear motion",
                "year": "2016",
                "description": "SIGGRAPH poster on robotic non-linear motion for swept-volume light painting.",
                "doi": "10.1145/2945078.2945105",
                "sourceUrl": "https://doi.org/10.1145/2945078.2945105",
                "downloadStatus": "metadata_only",
                "confidence": "medium-high",
                "topicTags": [
                    "computational photography",
                    "robotics",
                    "swept volume"
                ],
                "authors": [
                    "Sze Chun TSANG"
                ],
                "paperId": "a71b64b92c81"
            }
        ],
        "profileUrls": [
            "https://dblp.org/pid/182/7155"
        ],
        "identityRules": [
            {
                "id": "identity_controlled_proxy",
                "priority": 100,
                "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
            },
            {
                "id": "identity_no_institutional_commitment",
                "priority": 95,
                "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
            }
        ],
        "evidenceRules": [
            {
                "id": "evidence_type_boundary",
                "priority": 100,
                "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
            },
            {
                "id": "evidence_no_fabrication",
                "priority": 100,
                "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
            },
            {
                "id": "evidence_metadata_limit",
                "priority": 90,
                "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
            }
        ],
        "scholarRules": [
            {
                "id": "scholar_field_scope",
                "priority": 85,
                "text": "Prefer answers grounded in Sze Chun TSANG's public patent ownership, paper background and expertise fields.",
                "fields": [
                    "visual tracking",
                    "creating an image",
                    "image",
                    "tracking"
                ]
            },
            {
                "id": "scholar_voice",
                "priority": 55,
                "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
            },
            {
                "id": "scholar_gap_disclosure",
                "priority": 80,
                "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
            }
        ],
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
            }
        ],
        "rules": {
            "identityRules": [
                {
                    "id": "identity_controlled_proxy",
                    "priority": 100,
                    "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
                },
                {
                    "id": "identity_no_institutional_commitment",
                    "priority": 95,
                    "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
                }
            ],
            "evidenceRules": [
                {
                    "id": "evidence_type_boundary",
                    "priority": 100,
                    "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
                },
                {
                    "id": "evidence_no_fabrication",
                    "priority": 100,
                    "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
                },
                {
                    "id": "evidence_metadata_limit",
                    "priority": 90,
                    "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
                }
            ],
            "scholarRules": [
                {
                    "id": "scholar_field_scope",
                    "priority": 85,
                    "text": "Prefer answers grounded in Sze Chun TSANG's public patent ownership, paper background and expertise fields.",
                    "fields": [
                        "visual tracking",
                        "creating an image",
                        "image",
                        "tracking"
                    ]
                },
                {
                    "id": "scholar_voice",
                    "priority": 55,
                    "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
                },
                {
                    "id": "scholar_gap_disclosure",
                    "priority": 80,
                    "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
                }
            ],
            "patentRules": [
                {
                    "id": "patent_first",
                    "priority": 100,
                    "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
                },
                {
                    "id": "no_claim_expansion",
                    "priority": 100,
                    "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
                },
                {
                    "id": "no_legal_conclusion",
                    "priority": 95,
                    "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
                }
            ]
        },
        "skills": [
            {
                "id": "patent_fact_extractor",
                "name": "Patent Fact Extractor",
                "description": "Extract current patent title, abstract, field, public source and local original facts before answering.",
                "sourceTypes": [
                    "patent"
                ],
                "priority": 100,
                "triggers": [
                    "all_patent_questions",
                    "selected_patent_context"
                ]
            },
            {
                "id": "paper_evidence_retriever",
                "name": "Paper Evidence Retriever",
                "description": "Retrieve scholar-bound downloaded PDF chunks and metadata-only paper records that match the question.",
                "sourceTypes": [
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 80,
                "triggers": [
                    "research_basis",
                    "technical_explanation",
                    "business_analysis"
                ]
            },
            {
                "id": "commercialization_assessor",
                "name": "Commercialization Assessor",
                "description": "Translate patent and paper evidence into enterprise scenarios, buyer fit and trial path assumptions.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "user_input"
                ],
                "priority": 70,
                "triggers": [
                    "business_analysis",
                    "licensing_next_step"
                ]
            },
            {
                "id": "technical_due_diligence",
                "name": "Technical Due Diligence",
                "description": "Identify technical, data, equipment, integration and validation gaps that require follow-up.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 65,
                "triggers": [
                    "technical_explanation",
                    "risk_question",
                    "business_analysis"
                ]
            },
            {
                "id": "risk_guard",
                "name": "Risk Guard",
                "description": "Block overclaiming, fabricated citations, legal conclusions and treating metadata-only records as full text.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 100,
                "triggers": [
                    "all_answers",
                    "risk_question",
                    "legal_question"
                ]
            },
            {
                "id": "citation_answer_builder",
                "name": "Citation Answer Builder",
                "description": "Build concise answers with explicit source boundaries and reference chips.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 75,
                "triggers": [
                    "all_answers"
                ]
            }
        ],
        "sessionContext": {
            "selectedPatentPolicy": "active_patent_first",
            "longTermMemoryPolicy": "Only user preferences, enterprise demand context and conversation decisions may persist; scholar, patent and paper facts must come from controlled source data.",
            "answerContextPolicy": "Retrieve only the most relevant patent facts and top paper evidence for each turn."
        },
        "paperMemory": [
            {
                "paperId": "3950b0a2ee6c",
                "scholarId": "tsang_sze_chun",
                "title": "Computational Light Painting and Kinetic Photography",
                "year": "2018",
                "authors": [
                    "Sze Chun TSANG"
                ],
                "sourceType": "paper_pdf",
                "downloadStatus": "downloaded_pdf",
                "confidence": "high",
                "topicTags": [
                    "computational photography",
                    "light painting",
                    "robotic imaging"
                ],
                "sourceUrl": "https://dblp.org/rec/conf/npar/HuangTWL18",
                "file": "assets/scholars/tsang_sze_chun/papers/cf73fe139b.pdf",
                "description": "Robotic display/camera paths and real-time slicing for volumetric long-exposure imagery."
            },
            {
                "paperId": "6781a54ba830",
                "scholarId": "tsang_sze_chun",
                "title": "Real-time model slicing in arbitrary direction using octree",
                "year": "2017",
                "authors": [
                    "Sze Chun TSANG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "medium-high",
                "topicTags": [
                    "model slicing",
                    "octree",
                    "real-time rendering"
                ],
                "sourceUrl": "https://doi.org/10.1145/3102163.3102185",
                "file": "",
                "description": "SIGGRAPH poster on octree-based arbitrary-direction model slicing for real-time rendering."
            },
            {
                "paperId": "a71b64b92c81",
                "scholarId": "tsang_sze_chun",
                "title": "Computational swept volume light painting via robotic non-linear motion",
                "year": "2016",
                "authors": [
                    "Sze Chun TSANG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "medium-high",
                "topicTags": [
                    "computational photography",
                    "robotics",
                    "swept volume"
                ],
                "sourceUrl": "https://doi.org/10.1145/2945078.2945105",
                "file": "",
                "description": "SIGGRAPH poster on robotic non-linear motion for swept-volume light painting."
            }
        ],
        "knowledgeIndex": {
            "path": "assets/scholars/tsang_sze_chun/knowledge/index.json",
            "paperCount": 3,
            "downloadedPdfCount": 1,
            "metadataOnlyCount": 2,
            "chunkCount": 8,
            "topics": [
                "computational photography",
                "light painting",
                "robotic imaging",
                "model slicing",
                "octree",
                "real-time rendering",
                "robotics",
                "swept volume"
            ],
            "sourceTypes": [
                "patent",
                "paper_pdf",
                "paper_metadata",
                "profile",
                "user_input"
            ],
            "chunks": [
                {
                    "id": "3950b0a2ee6c_p1_1",
                    "paperId": "3950b0a2ee6c",
                    "scholarId": "tsang_sze_chun",
                    "title": "Computational Light Painting and Kinetic Photography",
                    "year": "2018",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "Computational Light Painting and Kinetic Photography Yaozhun Huang City University of Hong Kong Hong Kong, China yaozhuang5-c@my.cityu.edu.hk Sze-Chun Tsang City University of Hong Kong Hong Kong, China szectsang2@cityu.edu.hk Hei-Ting Tamar Wong City University of Hong Kong Hong Kong, China httwong2-c@ad.cityu.edu.hk Miu-Ling Lam∗ City University of Hong Kong Hong Kong, China miu.lam@cityu.edu.hk Figure 1: A gallery of unedited long exposure photographs taken with our computation light painting (Triceratops and Cow models) and kinetic photography (Mermaid and Humpback Whale models) systems. The pink curves illustrate the display or camera motion. ABSTRACT We present a computational framework for creating swept volume light painting and kinetic photography. Unlike conventional light painting technique using hand-held point light source or",
                    "topicTags": [
                        "computational photography",
                        "light painting",
                        "robotic imaging"
                    ],
                    "sourceUrl": "https://dblp.org/rec/conf/npar/HuangTWL18",
                    "file": "assets/scholars/tsang_sze_chun/papers/cf73fe139b.pdf"
                },
                {
                    "id": "3950b0a2ee6c_p1_2",
                    "paperId": "3950b0a2ee6c",
                    "scholarId": "tsang_sze_chun",
                    "title": "Computational Light Painting and Kinetic Photography",
                    "year": "2018",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "ting swept volume light painting and kinetic photography. Unlike conventional light painting technique using hand-held point light source or LED ar- rays, we move a flat-panel display with robot in a curved path. The display shows real-time rendered contours of a 3D object being sliced by the display plane along the path. All light contours are captured in a long exposure and constitute the virtual 3D object augmented in the real space. To ensure geometric accuracy, we use hand-eye calibration method to precisely obtain the transformation between the display and the robot. A path generation algorithm is developed to automatically yield the robot path that can best ∗Corresponding author Permission to make digital or hard copies of part or all of this work for personal or classroom use is granted without fee provided that copies are not mad",
                    "topicTags": [
                        "computational photography",
                        "light painting",
                        "robotic imaging"
                    ],
                    "sourceUrl": "https://dblp.org/rec/conf/npar/HuangTWL18",
                    "file": "assets/scholars/tsang_sze_chun/papers/cf73fe139b.pdf"
                },
                {
                    "id": "3950b0a2ee6c_p1_3",
                    "paperId": "3950b0a2ee6c",
                    "scholarId": "tsang_sze_chun",
                    "title": "Computational Light Painting and Kinetic Photography",
                    "year": "2018",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "ake digital or hard copies of part or all of this work for personal or classroom use is granted without fee provided that copies are not made or distributed for profit or commercial advantage and that copies bear this notice and the full citation on the first page. Copyrights for third-party components of this work must be honored. For all other uses, contact the owner/author(s). Expressive ’18, August 17–19, 2018, Victoria, BC, Canada © 2018 Copyright held by the owner/author(s). ACM ISBN 978-1-4503-5892-7/18/08. https://doi.org/10.1145/3229147.3229167 accommodate the 3D shape of the target model. To further avoid shape distortion due to asynchronization between the display’s pose and the image content, we propose a real-time slicing method for arbitrary slicing direction. By organizing the triangular mesh into Octree data structure, the",
                    "topicTags": [
                        "computational photography",
                        "light painting",
                        "robotic imaging"
                    ],
                    "sourceUrl": "https://dblp.org/rec/conf/npar/HuangTWL18",
                    "file": "assets/scholars/tsang_sze_chun/papers/cf73fe139b.pdf"
                },
                {
                    "id": "3950b0a2ee6c_p1_4",
                    "paperId": "3950b0a2ee6c",
                    "scholarId": "tsang_sze_chun",
                    "title": "Computational Light Painting and Kinetic Photography",
                    "year": "2018",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "nt, we propose a real-time slicing method for arbitrary slicing direction. By organizing the triangular mesh into Octree data structure, the approach can significantly reduce the computational time and improve the performance of real-time rendering. We study the optimal tree level for different ranges of triangle numbers so as to attain competitive computational time. Texture mapping is also implemented to produce colored light painting. We extend our methodologies to computational kinetic photography, which is dual to light painting. Instead of keeping the camera stationary, we move the camera with robot and capture long exposures of a stationary display showing light contours. We transform the display path for light painting to the camera path for kinetic photography. A variety of 3D models are used to verify that the proposed technique",
                    "topicTags": [
                        "computational photography",
                        "light painting",
                        "robotic imaging"
                    ],
                    "sourceUrl": "https://dblp.org/rec/conf/npar/HuangTWL18",
                    "file": "assets/scholars/tsang_sze_chun/papers/cf73fe139b.pdf"
                },
                {
                    "id": "3950b0a2ee6c_p1_5",
                    "paperId": "3950b0a2ee6c",
                    "scholarId": "tsang_sze_chun",
                    "title": "Computational Light Painting and Kinetic Photography",
                    "year": "2018",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 1,
                    "section": "pdf_text",
                    "text": "ay path for light painting to the camera path for kinetic photography. A variety of 3D models are used to verify that the proposed techniques can produce stunning long exposures with high-fidelity volumetric imagery. The techniques have great poten- tial for innovative applications including animation, visible light communication, invisible information visualization and creative art.",
                    "topicTags": [
                        "computational photography",
                        "light painting",
                        "robotic imaging"
                    ],
                    "sourceUrl": "https://dblp.org/rec/conf/npar/HuangTWL18",
                    "file": "assets/scholars/tsang_sze_chun/papers/cf73fe139b.pdf"
                },
                {
                    "id": "3950b0a2ee6c_p2_1",
                    "paperId": "3950b0a2ee6c",
                    "scholarId": "tsang_sze_chun",
                    "title": "Computational Light Painting and Kinetic Photography",
                    "year": "2018",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "Expressive ’18, August 17–19, 2018, Victoria, BC, Canada Yaozhun Huang, Sze-Chun Tsang, Hei-Ting Tamar Wong, and Miu-Ling Lam CCS CONCEPTS • Computing methodologies →Computational photography; Motion path planning; Vision for robotics; • Human-centered computing →Visualization systems and tools; KEYWORDS computational light painting, real-time rendering, model slicing ACM Reference Format: Yaozhun Huang, Sze-Chun Tsang, Hei-Ting Tamar Wong, and Miu-Ling Lam. 2018. Computational Light Painting and Kinetic Photography. In Expressive ’18: The Joint Symposium on Computational Aesthetics and Sketch Based Interfaces and Modeling and Non-Photorealistic Animation and Rendering, August 17–19, 2018, Victoria, BC, Canada. ACM, New York, NY, USA, 9 pages. https://doi.org/10.1145/3229147.3229167 1 INTRODUCTION Light painting is created by moving a lig",
                    "topicTags": [
                        "computational photography",
                        "light painting",
                        "robotic imaging"
                    ],
                    "sourceUrl": "https://dblp.org/rec/conf/npar/HuangTWL18",
                    "file": "assets/scholars/tsang_sze_chun/papers/cf73fe139b.pdf"
                },
                {
                    "id": "3950b0a2ee6c_p2_2",
                    "paperId": "3950b0a2ee6c",
                    "scholarId": "tsang_sze_chun",
                    "title": "Computational Light Painting and Kinetic Photography",
                    "year": "2018",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "C, Canada. ACM, New York, NY, USA, 9 pages. https://doi.org/10.1145/3229147.3229167 1 INTRODUCTION Light painting is created by moving a light source in the space while being captured by long exposure. The technique has been used for over a century for artistic and scientific purposes. In 1889, physiologists and chronophotographers Étienne-Jules Marey and Georges Demeny created the first light painting when studying the movements of humans. They attached light bulbs at the joints of a human and took long exposure photographs when the person was walking. Light painting technique has been used by many famous artists and photographers including Man Ray, Pablo Picasso, Henri Matisse, and Gjon Mili. This aesthetic art form has engaged many professional photographers and hobbyists in the past and is still very popular now. Scientists and engine",
                    "topicTags": [
                        "computational photography",
                        "light painting",
                        "robotic imaging"
                    ],
                    "sourceUrl": "https://dblp.org/rec/conf/npar/HuangTWL18",
                    "file": "assets/scholars/tsang_sze_chun/papers/cf73fe139b.pdf"
                },
                {
                    "id": "3950b0a2ee6c_p2_3",
                    "paperId": "3950b0a2ee6c",
                    "scholarId": "tsang_sze_chun",
                    "title": "Computational Light Painting and Kinetic Photography",
                    "year": "2018",
                    "sourceType": "paper_pdf",
                    "downloadStatus": "downloaded_pdf",
                    "confidence": "high",
                    "page": 2,
                    "section": "pdf_text",
                    "text": "esthetic art form has engaged many professional photographers and hobbyists in the past and is still very popular now. Scientists and engineers have also used light painting technique to visualize various forms of signals, such as invisible light and radio frequency, by varying the brightness or color of the light at different locations. A similar long exposure technique called kinetic photography can also create artistic light patterns. Rather than moving the light source, a camera is moved or thrown into the air (camera tossing) while its shutter opens. Both light painting and kinetic photography techniques involve the relative movement between the camera and the light source. The configuration of the two techniques are dual to each other. Sometimes kinetic photography is also called light painting. In conventional light painting, the l",
                    "topicTags": [
                        "computational photography",
                        "light painting",
                        "robotic imaging"
                    ],
                    "sourceUrl": "https://dblp.org/rec/conf/npar/HuangTWL18",
                    "file": "assets/scholars/tsang_sze_chun/papers/cf73fe139b.pdf"
                }
            ],
            "metadataRecords": [
                {
                    "paperId": "6781a54ba830",
                    "scholarId": "tsang_sze_chun",
                    "title": "Real-time model slicing in arbitrary direction using octree",
                    "year": "2017",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "medium-high",
                    "topicTags": [
                        "model slicing",
                        "octree",
                        "real-time rendering"
                    ],
                    "description": "SIGGRAPH poster on octree-based arbitrary-direction model slicing for real-time rendering.",
                    "sourceUrl": "https://doi.org/10.1145/3102163.3102185"
                },
                {
                    "paperId": "a71b64b92c81",
                    "scholarId": "tsang_sze_chun",
                    "title": "Computational swept volume light painting via robotic non-linear motion",
                    "year": "2016",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "medium-high",
                    "topicTags": [
                        "computational photography",
                        "robotics",
                        "swept volume"
                    ],
                    "description": "SIGGRAPH poster on robotic non-linear motion for swept-volume light painting.",
                    "sourceUrl": "https://doi.org/10.1145/2945078.2945105"
                }
            ]
        },
        "patentMemory": [
            {
                "id": "US10432907B2",
                "publicationNumber": "US10432907B2",
                "title": "An Electronic System for Creating an Image and a Method of Creating an Image",
                "field": "computer-vision",
                "industry": "计算机视觉",
                "summary": "An electronic system and a method for creating an image includes a display arranged to display a plurality of two-dimensional representations within a three-dimensional space, wherein the plurality of two-dimensional representations are arranged to individually represent a portion of a three-dimensional object within the three-dimensional space; and an imager arranged to capture the plurality of two-dimensional representations being displayed within the three-dimensional space; wherein the plurality of two-dimensional representations in a plurality of predefined positions are combined to form an image representative of the three-dimensional object within the three-dimensional space.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-electronic-system-for-creating-an-image-and-a-method-of-creati/",
                "sourceType": "patent",
                "legalStatus": "Published - 1 Oct 2019 | external lookup: US10432907B2 pub=2019-10-01 assignee=City University Of Hong Kong conf=high"
            }
        ]
    },
    {
        "id": "eeshc",
        "name": "Shu Hung Henry CHUNG",
        "sourceName": "CHUNG, Shu Hung Henry",
        "email": "eeshc@cityu.edu.hk",
        "auId": "eeshc",
        "profileUrl": "https://scholars.cityu.edu.hk/en/persons/eeshc/",
        "affiliation": "City University of Hong Kong, Department of Electrical Engineering, Hong Kong, Peoples R China.",
        "affiliationTier": "top_university",
        "expertise": [
            "light sensor",
            "sensor",
            "光传感",
            "傳感器"
        ],
        "patentIds": [
            "USD738319S1"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22Shu%20Hung%20Henry%20CHUNG%20/%20City%20University%20of%20Hong%20Kong%2C%20Department%20of%20Electrical%20Engineering%2C%20Hong%20Kong%2C%20Peoples%20R%20China.%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%23047857%22/%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba%28255%2C255%2C255%2C0.24%29%22/%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba%28255%2C255%2C255%2C0.42%29%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2224%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3ESH%3C/text%3E%3C/svg%3E",
        "paperBackground": [
            {
                "scholarId": "eeshc",
                "title": "A Range-Aware Attention Framework for Meteorological Visibility Estimation",
                "year": "2026",
                "description": "Visibility-estimation dataset and adaptive attention method for fog and haze conditions.",
                "doi": "10.3390/s26061893",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-range-aware-attention-framework-for-meteorological-visibility-e/",
                "pdfUrl": "https://www.mdpi.com/1424-8220/26/6/1893/pdf?version=1773757569",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "visibility estimation",
                    "sensors",
                    "attention model"
                ],
                "authors": [
                    "Shu Hung Henry CHUNG"
                ],
                "note": "Public PDF URL was recorded, but scripted download did not return a PDF.",
                "paperId": "f311e721ff2b"
            },
            {
                "scholarId": "eeshc",
                "title": "A Buck and Boost Inverter with Dual Buck Circuits Sharing a Freewheeling Diode",
                "year": "2026",
                "description": "Transformer-less buck/boost inverter design with a 500 W prototype and 97.98% peak efficiency.",
                "doi": "10.1109/JESTPE.2026.3659155",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-buck-and-boost-inverter-with-dual-buck-circuits-sharing-a-freew/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "power electronics",
                    "inverter",
                    "energy conversion"
                ],
                "authors": [
                    "Shu Hung Henry CHUNG"
                ],
                "paperId": "b86c57f64001"
            },
            {
                "scholarId": "eeshc",
                "title": "Dual-Mode Time-Sharing-Based Buck and Boost Inverter With Reactive Power Injection Capability",
                "year": "2026",
                "description": "Nonisolated single-stage buck/boost inverter with reactive power and bidirectional energy support.",
                "doi": "10.1109/TIE.2026.3672858",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/dual-mode-time-sharing-based-buck-and-boost-inverter-with-reactiv/",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "power electronics",
                    "reactive power",
                    "inverter"
                ],
                "authors": [
                    "Shu Hung Henry CHUNG"
                ],
                "paperId": "242ba50ad054"
            },
            {
                "title": "A Multi-Load-Compatible DC-DC Converter with Permeability-Controlled Variable Inductor and Load-Aware Frequency Control for CPL Stability",
                "authors": [
                    "Shu Hung Henry CHUNG"
                ],
                "year": "2026",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-multi-load-compatible-dc-dc-converter-with-permeability-control/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "doi": "10.1109/JESTPE.2026.3652638",
                "abstract": "DC-DC converter with resistive load (RL) or constant power load (CPL) requires different inductance to satisfy current ripple, efficiency, and stability. To achieve all the targets, a new perspective of using a permeability-controlled variable inductor (PCVI) and load-aware frequency control (LAFC) technique is proposed and employed in the buck converter for multi-load conditions. The key of this design is to achieve continuous conduction mode operation with high inductance for RL and maintain stability with low inductance for CPL via minor frequency variation. The magnetic core of PCVI consists of a ring-shaped ferrite wrapped with a passive LC resonator. The PCVI incorporates two sets of windings: one serving as the inductor terminal integrated into the circuit, and the other connected to a compensation capacitor. This design provides the PCVI with a frequency-variation inductance by modifying the equivalent magnetic reluctance via LC resonator. Besides, PCVI allows a voltage leap and sharp impedance variation within a minor frequency variation. The proposed converter features two decoupled control loops: a conventional output voltage loop and LAFC. The LAFC leverages output volt",
                "description": "DC-DC converter with resistive load (RL) or constant power load (CPL) requires different inductance to satisfy current ripple, efficiency, and stability. To achieve all the targets, a new perspective of using a permeability-controlled variable inductor (PCVI) and load-aware frequency control (LAFC) technique is proposed and employed in the buck converter for multi-load conditions. The key of this design is to achieve continuous conduction mode operation with high inductance for RL and maintain stability with low inductance for CPL via minor frequency variation. The magnetic core of PCVI consists of a ring-shaped ferrite wrapped with a passive LC resonator. The PCVI incorporates two sets of windings: one serving as the inductor terminal integrated into the circuit, and the other connected to a compensation capacitor. This design provides the PCVI with a frequency-variation inductance by modifying the equivalent magnetic reluctance via LC resonator. Besides, PCVI allows a voltage leap and sharp impedance variation within a minor frequency variation. The proposed converter features two decoupled control loops: a conventional output voltage loop and LAFC. The LAFC leverages output volt",
                "openAccess": {
                    "isOpenAccess": false,
                    "status": "closed",
                    "url": "",
                    "repositoryHasFullText": false
                },
                "paperId": "47c3bca9d68a"
            },
            {
                "title": "An Ultra-Wide Input and Power Range Resonant Converter for Renewable-Fed DC Microgrids with Larger Bus Voltage Fluctuations",
                "authors": [
                    "Shu Hung Henry CHUNG"
                ],
                "year": "2026",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-ultra-wide-input-and-power-range-resonant-converter-for-renewa/",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "doi": "10.1109/JESTPE.2026.3674586",
                "abstract": "DC microgrids integrating multiple renewable energies such as solar photovoltaic, wind and hydropower typically exhibit bus voltage fluctuations within a wide but coordinated range. Consequently, DC-link applications with dynamic load in DC microgrid require converters with wide input and power operation range. However, the operational range of conventional resonant converters is limited by their fixed resonant LC parameters and restricted switching frequency variation. In this article, a single-stage narrow frequency variation resonant converter featuring a low-cost permeability-controlled variable inductor (PCVI) is proposed to address this issue. The permeability of PCVI is adjusted passively by the operating frequency of the system without the need for external controllers. This alignment allows the frequency changes necessary for gain adjustment in the resonant converter to correspond with the changes of the inductance of PCVI. As the frequency increases, the gain of the resonant converter decreases while the inductance of the PCVI increases, which further reduces the gain. This design minimizes the frequency variation needed for gain regulation and extends the input and power",
                "description": "DC microgrids integrating multiple renewable energies such as solar photovoltaic, wind and hydropower typically exhibit bus voltage fluctuations within a wide but coordinated range. Consequently, DC-link applications with dynamic load in DC microgrid require converters with wide input and power operation range. However, the operational range of conventional resonant converters is limited by their fixed resonant LC parameters and restricted switching frequency variation. In this article, a single-stage narrow frequency variation resonant converter featuring a low-cost permeability-controlled variable inductor (PCVI) is proposed to address this issue. The permeability of PCVI is adjusted passively by the operating frequency of the system without the need for external controllers. This alignment allows the frequency changes necessary for gain adjustment in the resonant converter to correspond with the changes of the inductance of PCVI. As the frequency increases, the gain of the resonant converter decreases while the inductance of the PCVI increases, which further reduces the gain. This design minimizes the frequency variation needed for gain regulation and extends the input and power",
                "openAccess": {
                    "isOpenAccess": false,
                    "status": "closed",
                    "url": "",
                    "repositoryHasFullText": false
                },
                "paperId": "8aa0c8fe334f"
            }
        ],
        "profileUrls": [
            "https://scholars.cityu.edu.hk/en/persons/eeshc/",
            "https://dblp.org/pid/27/2843"
        ],
        "identityRules": [
            {
                "id": "identity_controlled_proxy",
                "priority": 100,
                "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
            },
            {
                "id": "identity_no_institutional_commitment",
                "priority": 95,
                "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
            }
        ],
        "evidenceRules": [
            {
                "id": "evidence_type_boundary",
                "priority": 100,
                "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
            },
            {
                "id": "evidence_no_fabrication",
                "priority": 100,
                "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
            },
            {
                "id": "evidence_metadata_limit",
                "priority": 90,
                "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
            }
        ],
        "scholarRules": [
            {
                "id": "scholar_field_scope",
                "priority": 85,
                "text": "Prefer answers grounded in Shu Hung Henry CHUNG's public patent ownership, paper background and expertise fields.",
                "fields": [
                    "light sensor",
                    "sensor",
                    "光传感",
                    "傳感器"
                ]
            },
            {
                "id": "scholar_voice",
                "priority": 55,
                "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
            },
            {
                "id": "scholar_gap_disclosure",
                "priority": 80,
                "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
            }
        ],
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
            }
        ],
        "rules": {
            "identityRules": [
                {
                    "id": "identity_controlled_proxy",
                    "priority": 100,
                    "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking."
                },
                {
                    "id": "identity_no_institutional_commitment",
                    "priority": 95,
                    "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments."
                }
            ],
            "evidenceRules": [
                {
                    "id": "evidence_type_boundary",
                    "priority": 100,
                    "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context."
                },
                {
                    "id": "evidence_no_fabrication",
                    "priority": 100,
                    "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs."
                },
                {
                    "id": "evidence_metadata_limit",
                    "priority": 90,
                    "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence."
                }
            ],
            "scholarRules": [
                {
                    "id": "scholar_field_scope",
                    "priority": 85,
                    "text": "Prefer answers grounded in Shu Hung Henry CHUNG's public patent ownership, paper background and expertise fields.",
                    "fields": [
                        "light sensor",
                        "sensor",
                        "光传感",
                        "傳感器"
                    ]
                },
                {
                    "id": "scholar_voice",
                    "priority": 55,
                    "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona."
                },
                {
                    "id": "scholar_gap_disclosure",
                    "priority": 80,
                    "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses."
                }
            ],
            "patentRules": [
                {
                    "id": "patent_first",
                    "priority": 100,
                    "text": "When a patent is selected, use it as the primary context before papers or general scholar profile."
                },
                {
                    "id": "no_claim_expansion",
                    "priority": 100,
                    "text": "Do not expand a paper's broad research finding into the legal scope of the current patent."
                },
                {
                    "id": "no_legal_conclusion",
                    "priority": 95,
                    "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions."
                }
            ]
        },
        "skills": [
            {
                "id": "patent_fact_extractor",
                "name": "Patent Fact Extractor",
                "description": "Extract current patent title, abstract, field, public source and local original facts before answering.",
                "sourceTypes": [
                    "patent"
                ],
                "priority": 100,
                "triggers": [
                    "all_patent_questions",
                    "selected_patent_context"
                ]
            },
            {
                "id": "paper_evidence_retriever",
                "name": "Paper Evidence Retriever",
                "description": "Retrieve scholar-bound downloaded PDF chunks and metadata-only paper records that match the question.",
                "sourceTypes": [
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 80,
                "triggers": [
                    "research_basis",
                    "technical_explanation",
                    "business_analysis"
                ]
            },
            {
                "id": "commercialization_assessor",
                "name": "Commercialization Assessor",
                "description": "Translate patent and paper evidence into enterprise scenarios, buyer fit and trial path assumptions.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "user_input"
                ],
                "priority": 70,
                "triggers": [
                    "business_analysis",
                    "licensing_next_step"
                ]
            },
            {
                "id": "technical_due_diligence",
                "name": "Technical Due Diligence",
                "description": "Identify technical, data, equipment, integration and validation gaps that require follow-up.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata"
                ],
                "priority": 65,
                "triggers": [
                    "technical_explanation",
                    "risk_question",
                    "business_analysis"
                ]
            },
            {
                "id": "risk_guard",
                "name": "Risk Guard",
                "description": "Block overclaiming, fabricated citations, legal conclusions and treating metadata-only records as full text.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 100,
                "triggers": [
                    "all_answers",
                    "risk_question",
                    "legal_question"
                ]
            },
            {
                "id": "citation_answer_builder",
                "name": "Citation Answer Builder",
                "description": "Build concise answers with explicit source boundaries and reference chips.",
                "sourceTypes": [
                    "patent",
                    "paper_pdf",
                    "paper_metadata",
                    "profile",
                    "user_input"
                ],
                "priority": 75,
                "triggers": [
                    "all_answers"
                ]
            }
        ],
        "sessionContext": {
            "selectedPatentPolicy": "active_patent_first",
            "longTermMemoryPolicy": "Only user preferences, enterprise demand context and conversation decisions may persist; scholar, patent and paper facts must come from controlled source data.",
            "answerContextPolicy": "Retrieve only the most relevant patent facts and top paper evidence for each turn."
        },
        "paperMemory": [
            {
                "paperId": "f311e721ff2b",
                "scholarId": "eeshc",
                "title": "A Range-Aware Attention Framework for Meteorological Visibility Estimation",
                "year": "2026",
                "authors": [
                    "Shu Hung Henry CHUNG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "visibility estimation",
                    "sensors",
                    "attention model"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-range-aware-attention-framework-for-meteorological-visibility-e/",
                "file": "",
                "description": "Visibility-estimation dataset and adaptive attention method for fog and haze conditions."
            },
            {
                "paperId": "b86c57f64001",
                "scholarId": "eeshc",
                "title": "A Buck and Boost Inverter with Dual Buck Circuits Sharing a Freewheeling Diode",
                "year": "2026",
                "authors": [
                    "Shu Hung Henry CHUNG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "power electronics",
                    "inverter",
                    "energy conversion"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-buck-and-boost-inverter-with-dual-buck-circuits-sharing-a-freew/",
                "file": "",
                "description": "Transformer-less buck/boost inverter design with a 500 W prototype and 97.98% peak efficiency."
            },
            {
                "paperId": "242ba50ad054",
                "scholarId": "eeshc",
                "title": "Dual-Mode Time-Sharing-Based Buck and Boost Inverter With Reactive Power Injection Capability",
                "year": "2026",
                "authors": [
                    "Shu Hung Henry CHUNG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "high",
                "topicTags": [
                    "power electronics",
                    "reactive power",
                    "inverter"
                ],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/dual-mode-time-sharing-based-buck-and-boost-inverter-with-reactiv/",
                "file": "",
                "description": "Nonisolated single-stage buck/boost inverter with reactive power and bidirectional energy support."
            },
            {
                "paperId": "47c3bca9d68a",
                "scholarId": "eeshc",
                "title": "A Multi-Load-Compatible DC-DC Converter with Permeability-Controlled Variable Inductor and Load-Aware Frequency Control for CPL Stability",
                "year": "2026",
                "authors": [
                    "Shu Hung Henry CHUNG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-multi-load-compatible-dc-dc-converter-with-permeability-control/",
                "file": "",
                "description": "DC-DC converter with resistive load (RL) or constant power load (CPL) requires different inductance to satisfy current ripple, efficiency, and stability. To achieve all the targets, a new perspective of using a permeability-controlled variable inductor (PCVI) and load-aware frequency control (LAFC) technique is proposed and employed in the buck converter for multi-load conditions. The key of this design is to achieve continuous conduction mode operation with high inductance for RL and maintain stability with low inductance for CPL via minor frequency variation. The magnetic core of PCVI consists of a ring-shaped ferrite wrapped with a passive LC resonator. The PCVI incorporates two sets of windings: one serving as the inductor terminal integrated into the circuit, and the other connected to a compensation capacitor. This design provides the PCVI with a frequency-variation inductance by modifying the equivalent magnetic reluctance via LC resonator. Besides, PCVI allows a voltage leap and sharp impedance variation within a minor frequency variation. The proposed converter features two decoupled control loops: a conventional output voltage loop and LAFC. The LAFC leverages output volt"
            },
            {
                "paperId": "8aa0c8fe334f",
                "scholarId": "eeshc",
                "title": "An Ultra-Wide Input and Power Range Resonant Converter for Renewable-Fed DC Microgrids with Larger Bus Voltage Fluctuations",
                "year": "2026",
                "authors": [
                    "Shu Hung Henry CHUNG"
                ],
                "sourceType": "paper_metadata",
                "downloadStatus": "metadata_only",
                "confidence": "auto",
                "topicTags": [],
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-ultra-wide-input-and-power-range-resonant-converter-for-renewa/",
                "file": "",
                "description": "DC microgrids integrating multiple renewable energies such as solar photovoltaic, wind and hydropower typically exhibit bus voltage fluctuations within a wide but coordinated range. Consequently, DC-link applications with dynamic load in DC microgrid require converters with wide input and power operation range. However, the operational range of conventional resonant converters is limited by their fixed resonant LC parameters and restricted switching frequency variation. In this article, a single-stage narrow frequency variation resonant converter featuring a low-cost permeability-controlled variable inductor (PCVI) is proposed to address this issue. The permeability of PCVI is adjusted passively by the operating frequency of the system without the need for external controllers. This alignment allows the frequency changes necessary for gain adjustment in the resonant converter to correspond with the changes of the inductance of PCVI. As the frequency increases, the gain of the resonant converter decreases while the inductance of the PCVI increases, which further reduces the gain. This design minimizes the frequency variation needed for gain regulation and extends the input and power"
            }
        ],
        "knowledgeIndex": {
            "path": "assets/scholars/eeshc/knowledge/index.json",
            "paperCount": 5,
            "downloadedPdfCount": 0,
            "metadataOnlyCount": 5,
            "chunkCount": 0,
            "topics": [
                "visibility estimation",
                "sensors",
                "attention model",
                "power electronics",
                "inverter",
                "energy conversion",
                "reactive power"
            ],
            "sourceTypes": [
                "patent",
                "paper_pdf",
                "paper_metadata",
                "profile",
                "user_input"
            ],
            "chunks": [],
            "metadataRecords": [
                {
                    "paperId": "f311e721ff2b",
                    "scholarId": "eeshc",
                    "title": "A Range-Aware Attention Framework for Meteorological Visibility Estimation",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "visibility estimation",
                        "sensors",
                        "attention model"
                    ],
                    "description": "Visibility-estimation dataset and adaptive attention method for fog and haze conditions.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-range-aware-attention-framework-for-meteorological-visibility-e/"
                },
                {
                    "paperId": "b86c57f64001",
                    "scholarId": "eeshc",
                    "title": "A Buck and Boost Inverter with Dual Buck Circuits Sharing a Freewheeling Diode",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "power electronics",
                        "inverter",
                        "energy conversion"
                    ],
                    "description": "Transformer-less buck/boost inverter design with a 500 W prototype and 97.98% peak efficiency.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-buck-and-boost-inverter-with-dual-buck-circuits-sharing-a-freew/"
                },
                {
                    "paperId": "242ba50ad054",
                    "scholarId": "eeshc",
                    "title": "Dual-Mode Time-Sharing-Based Buck and Boost Inverter With Reactive Power Injection Capability",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "high",
                    "topicTags": [
                        "power electronics",
                        "reactive power",
                        "inverter"
                    ],
                    "description": "Nonisolated single-stage buck/boost inverter with reactive power and bidirectional energy support.",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/dual-mode-time-sharing-based-buck-and-boost-inverter-with-reactiv/"
                },
                {
                    "paperId": "47c3bca9d68a",
                    "scholarId": "eeshc",
                    "title": "A Multi-Load-Compatible DC-DC Converter with Permeability-Controlled Variable Inductor and Load-Aware Frequency Control for CPL Stability",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "DC-DC converter with resistive load (RL) or constant power load (CPL) requires different inductance to satisfy current ripple, efficiency, and stability. To achieve all the targets, a new perspective of using a permeability-controlled variable inductor (PCVI) and load-aware frequency control (LAFC) technique is proposed and employed in the buck converter for multi-load conditions. The key of this design is to achieve continuous conduction mode operation with high inductance for RL and maintain stability with low inductance for CPL via minor frequency variation. The magnetic core of PCVI consists of a ring-shaped ferrite wrapped with a passive LC resonator. The PCVI incorporates two sets of windings: one serving as the inductor terminal integrated into the circuit, and the other connected to a compensation capacitor. This design provides the PCVI with a frequency-variation inductance by modifying the equivalent magnetic reluctance via LC resonator. Besides, PCVI allows a voltage leap and sharp impedance variation within a minor frequency variation. The proposed converter features two decoupled control loops: a conventional output voltage loop and LAFC. The LAFC leverages output volt",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-multi-load-compatible-dc-dc-converter-with-permeability-control/"
                },
                {
                    "paperId": "8aa0c8fe334f",
                    "scholarId": "eeshc",
                    "title": "An Ultra-Wide Input and Power Range Resonant Converter for Renewable-Fed DC Microgrids with Larger Bus Voltage Fluctuations",
                    "year": "2026",
                    "sourceType": "paper_metadata",
                    "downloadStatus": "metadata_only",
                    "confidence": "auto",
                    "topicTags": [],
                    "description": "DC microgrids integrating multiple renewable energies such as solar photovoltaic, wind and hydropower typically exhibit bus voltage fluctuations within a wide but coordinated range. Consequently, DC-link applications with dynamic load in DC microgrid require converters with wide input and power operation range. However, the operational range of conventional resonant converters is limited by their fixed resonant LC parameters and restricted switching frequency variation. In this article, a single-stage narrow frequency variation resonant converter featuring a low-cost permeability-controlled variable inductor (PCVI) is proposed to address this issue. The permeability of PCVI is adjusted passively by the operating frequency of the system without the need for external controllers. This alignment allows the frequency changes necessary for gain adjustment in the resonant converter to correspond with the changes of the inductance of PCVI. As the frequency increases, the gain of the resonant converter decreases while the inductance of the PCVI increases, which further reduces the gain. This design minimizes the frequency variation needed for gain regulation and extends the input and power",
                    "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-ultra-wide-input-and-power-range-resonant-converter-for-renewa/"
                }
            ]
        },
        "patentMemory": [
            {
                "id": "USD738319S1",
                "publicationNumber": "USD738319S1",
                "title": "Light Sensor",
                "field": "sensor-hardware",
                "industry": "智能硬件",
                "summary": "This CityUHK patent record is available from the public CityUHK Scholars metadata. The original patent text has not been publicly available in the local archive yet.",
                "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/light-sensor/",
                "sourceType": "patent",
                "legalStatus": "Published - 8 Sept 2015 | external lookup: USD738319S1 pub=2015-09-08 assignee=City University Of Hong Kong conf=high"
            }
        ]
    }
];

const patents = [
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "63943642",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-interpretable-patent-quality-evaluation-method-and-system-base/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "63943642"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "63943642"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "63943642"
            }
        ],
        "trialAccess": true,
        "id": "63943642",
        "title": "An Interpretable Patent Quality Evaluation Method and System Based on Large Language Model",
        "inventorId": "isjian",
        "imageUrl": "",
        "pdfUrl": "https://hdl.handle.net/2031/ebc0a349-2933-4c8d-8ab5-1815930b212c",
        "localOriginal": "",
        "inventors": [
            "Jian MA",
            "Xia FAN"
        ],
        "leadInventor": "Jian MA",
        "assignee": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China.",
        "applicationNumber": "63/943,642",
        "priorityDate": "63/943,642",
        "filingDate": "2025-12-18",
        "publicationDate": "2025-12-18",
        "legalStatus": "Accepted/In press/Filed - 18 Dec 2025",
        "field": "ai-patent-intelligence",
        "industry": "企业服务",
        "commercialFit": "trial",
        "summary": "This CityUHK patent record is available from the public CityUHK Scholars metadata. The original patent text has not been publicly available in the local archive yet.",
        "keywords": [
            "large language model",
            "patent recommendation",
            "patent quality",
            "heterogeneous data",
            "dynamic attention",
            "An",
            "Interpretable",
            "Patent",
            "Quality",
            "Evaluation",
            "Based",
            "on"
        ],
        "tags": [
            "ai-patent-intelligence",
            "企业服务"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Jian MA",
            "email": "isjian@cityu.edu.hk",
            "auId": "isjian",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "63943652",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/university-patent-recommendation-technology-based-on-heterogeneou/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "63943652"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "63943652"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "63943652"
            }
        ],
        "trialAccess": true,
        "id": "63943652",
        "title": "University Patent Recommendation Technology Based on Heterogeneous Data Fusion and Dynamic Attention Mechanism",
        "inventorId": "isjian",
        "imageUrl": "",
        "pdfUrl": "https://hdl.handle.net/2031/ac7e7c7a-4f8d-4ef2-8cbb-bede2b37c111",
        "localOriginal": "",
        "inventors": [
            "Jian MA"
        ],
        "leadInventor": "Jian MA",
        "assignee": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China.",
        "applicationNumber": "63/943,652",
        "priorityDate": "63/943,652",
        "filingDate": "2025-12-18",
        "publicationDate": "2025-12-18",
        "legalStatus": "Accepted/In press/Filed - 18 Dec 2025",
        "field": "ai-patent-intelligence",
        "industry": "企业服务",
        "commercialFit": "trial",
        "summary": "This CityUHK patent record is available from the public CityUHK Scholars metadata. The original patent text has not been publicly available in the local archive yet.",
        "keywords": [
            "large language model",
            "patent recommendation",
            "patent quality",
            "heterogeneous data",
            "dynamic attention",
            "University",
            "Patent",
            "Recommendation",
            "Technology",
            "Based",
            "on",
            "Heterogeneous"
        ],
        "tags": [
            "ai-patent-intelligence",
            "企业服务"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Jian MA",
            "email": "isjian@cityu.edu.hk",
            "auId": "isjian",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "CN117950627A",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E6%99%BA%E8%83%BD%E6%BA%AF%E6%BA%90%E5%8F%8A%E5%81%87%E6%96%B0%E8%81%9E%E9%98%B2%E7%AF%84%E7%B3%BB%E7%B5%B1%E5%8F%8A%E9%98%B2%E7%AF%84%E6%96%B9%E6%B3%95/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "CN117950627A"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "CN117950627A"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "CN117950627A"
            }
        ],
        "trialAccess": false,
        "id": "CN117950627A",
        "title": "一種智能溯源及假新聞防範系統及防範方法",
        "inventorId": "acmleung",
        "imageUrl": "assets/patents/CN117950627A.png",
        "pdfUrl": "patent_originals/03_CN117950627A.pdf",
        "localOriginal": "patent_originals/03_CN117950627A.pdf",
        "inventors": [
            "Chung Man Alvin LEUNG",
            "Qiang YE",
            "Yuhong ZHAN",
            "Longji WANG",
            "Weizhong LIANG",
            "Lei CHEN",
            "Chaoyue GAO"
        ],
        "leadInventor": "Chung Man Alvin LEUNG",
        "assignee": "Harbin Institute of Technology Shenzhen;City University of Hong Kong CityU",
        "applicationNumber": "202311610584.X",
        "priorityDate": "202311610584.X",
        "filingDate": "2023-11-29",
        "publicationDate": "2023-11-29",
        "legalStatus": "Accepted/In press/Filed - 29 Nov 2023 | external lookup: CN117950627A pub=2024-04-30 assignee=香港城市大学深圳研究院 conf=low",
        "field": "blockchain-trust",
        "industry": "区块链可信内容",
        "commercialFit": "standard",
        "summary": "The present invention proposes an intelligent traceability and fake news prevention system and prevention method, which is based on the Ethereum ERC-721 smart contract. Users using the NFT certification platform first submit the information they publish to the NFT certification platform. The NFT certification platform checks the information uploaded by the user for duplicates. After the duplicate check, the information is cast into NFT through the ERC-721 smart contract, and the NFT is stored in an unalterable manner on the Ethereum blockchain. The platform publishes the information on the completion of NFT casting as a post with a verifiable NFT logo.",
        "keywords": [
            "blockchain",
            "ethereum",
            "nft",
            "private key",
            "ddos",
            "一種智能溯源及假新聞防範系統及防範方法",
            "present",
            "invention",
            "proposes",
            "an",
            "intelligent",
            "traceability"
        ],
        "tags": [
            "blockchain-trust",
            "区块链可信内容"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Chung Man Alvin LEUNG",
            "email": "acmleung@cityu.edu.hk",
            "auId": "acmleung",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "CN119563958A",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%BB%BF%E7%94%9F%E7%86%B1%E8%AA%BF%E7%AF%80%E7%B9%94%E7%89%A9%E5%92%8C%E5%85%B6%E6%A7%8B%E5%BB%BA%E6%96%B9%E6%B3%95/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "CN119563958A"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "CN119563958A"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "CN119563958A"
            }
        ],
        "trialAccess": false,
        "id": "CN119563958A",
        "title": "仿生熱調節織物和其構建方法",
        "inventorId": "xingeyu",
        "imageUrl": "assets/patents/CN119563958A.png",
        "pdfUrl": "patent_originals/04_CN119563958A.pdf",
        "localOriginal": "patent_originals/04_CN119563958A.pdf",
        "inventors": [
            "Xinge YU",
            "Lung CHOW",
            "Xingcan HUANG",
            "Qiang ZHANG"
        ],
        "leadInventor": "Xinge YU",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "202410997112.2",
        "priorityDate": "202410997112.2",
        "filingDate": "2024-07-24",
        "publicationDate": "2024-07-24",
        "legalStatus": "Accepted/In press/Filed - 24 Jul 2024 | external lookup: CN119563958A pub=2025-03-07 assignee=香港城市大学 conf=medium",
        "field": "medical-sensing",
        "industry": "医疗健康",
        "commercialFit": "standard",
        "summary": "Provided is a bionic thermal regulating fabric that mimics an army ant campsite and a method for constructing the same. The bionic thermal regulating fabric comprises a plurality of yarns, the plurality of yarns being formed by textile fibers having water-driven curling behavior, wherein the plurality of yarns are woven by a transfer loop organization to form an asymmetric fabric structure, the fabric structure having a positive water-driven expansion rate along a first axis and a negative water-driven expansion rate along a second axis orthogonal to the first axis. The surface of the textile fiber is plasma treated to have one or more hydrophilic functional groups. One or more colorimetric fabric sensors are incorporated to generate colors in response to one or more ambient environmental conditions or user physiological conditions, respectively. The present invention has excellent scalability, biocompatibility, and good dynamic durability, and is advantageous for use in sportswear, outdoor clothing, and medical textiles.",
        "keywords": [
            "medical",
            "breathing",
            "respiratory",
            "radar",
            "human body",
            "仿生熱調節織物和其構建方法",
            "Provided",
            "is",
            "bionic",
            "thermal",
            "regulating",
            "fabric"
        ],
        "tags": [
            "medical-sensing",
            "医疗健康"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Xinge YU",
            "email": "xingeyu@cityu.edu.hk",
            "auId": "xingeyu",
            "department": "City University of Hong Kong, Department of Biomedical Engineering, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "US12571139B2",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/biomimetic-thermal-regulating-fabric-and-method-for-constructing-/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "US12571139B2"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "US12571139B2"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "US12571139B2"
            }
        ],
        "trialAccess": false,
        "id": "US12571139B2",
        "title": "Biomimetic Thermal Regulating Fabric and Method for Constructing the Same",
        "inventorId": "xingeyu",
        "imageUrl": "assets/patents/US12571139B2.png",
        "pdfUrl": "patent_originals/05_US12571139B2_USPTO.pdf",
        "localOriginal": "patent_originals/05_US12571139B2_USPTO.pdf",
        "inventors": [
            "Xinge YU",
            "Lung CHOW",
            "Xingcan HUANG",
            "Qiang ZHANG"
        ],
        "leadInventor": "Xinge YU",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "US12,571,139",
        "priorityDate": "18/604,516",
        "filingDate": "2024-03-14",
        "publicationDate": "2026-03-10",
        "legalStatus": "Published - 10 Mar 2026 | external lookup: US12571139B2 pub=2026-03-10 assignee=City University Of Hong Kong conf=manual",
        "field": "medical-sensing",
        "industry": "医疗健康",
        "commercialFit": "high",
        "summary": "A biomimetic thermal regulating fabric (BTRF) imitating army ant bivouacs and a method for constructing the same are provided. The BTRF comprises a plurality of yarns formed of textile fibres having a water-actuated crimp behaviour, wherein the plurality of yarns is knitted by means of transfer stitch to form an unsymmetrical fabric structure which has a positive water-actuated expansion rate along a first axis and a negative water-actuated expansion rate along a second axis orthogonal to the first axis. Surfaces of the textile fibres are plasma-treated to have one or more hydrophilic functional groups. One or more colorimetric fabric sensors are incorporated to generate colours in response to one or more ambient environmental conditions or user physiological conditions respectively. The present invention has excellent scalability, biocompatibility, and great dynamic durability, and is advantageous for applications in athletic wear, outdoor wear, and medical textiles.",
        "keywords": [
            "medical",
            "breathing",
            "respiratory",
            "radar",
            "human body",
            "Biomimetic",
            "Thermal",
            "Regulating",
            "Fabric",
            "Constructing",
            "Same",
            "biomimetic"
        ],
        "tags": [
            "medical-sensing",
            "医疗健康"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Xinge YU",
            "email": "xingeyu@cityu.edu.hk",
            "auId": "xingeyu",
            "department": "City University of Hong Kong, Department of Biomedical Engineering, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "US20230385365A1",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/prime-number-based-parallel-solver-for-engineering-design-optimiz/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "US20230385365A1"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "US20230385365A1"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "US20230385365A1"
            }
        ],
        "trialAccess": false,
        "id": "US20230385365A1",
        "title": "Prime-Number-Based Parallel Solver For Engineering Design Optimization Problems Of Polynomial Forms With Integer Variables",
        "inventorId": "hanlinli",
        "imageUrl": "assets/patents/US20230385365A1.png",
        "pdfUrl": "patent_originals/06_US20230385365A1.pdf",
        "localOriginal": "patent_originals/06_US20230385365A1.pdf",
        "inventors": [
            "Han Lin LI",
            "Way KUO",
            "Youhua Frank CHEN",
            "Mingming WANG"
        ],
        "leadInventor": "Han Lin LI",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "17/664,897",
        "priorityDate": "17/664,897",
        "filingDate": "2022-05-25",
        "publicationDate": "2022-05-25",
        "legalStatus": "Accepted/In press/Filed - 25 May 2022 | external lookup: US20230385365A1 pub=2023-11-30 assignee=City University Of Hong Kong conf=high",
        "field": "engineering-optimization",
        "industry": "工程优化",
        "commercialFit": "standard",
        "summary": "Received is a main program representing one Engineering Design Optimization Problem (EDOP), the EDOP including polynomial terms with product values. A number (N) of available parallel processors for parallel processing are identified. The main program is partitioned into N subprograms, N being a positive integer greater than one. The N subprograms have fewer overlapping product values between them compared to existing solutions, and the partitioning is prime-number based. Each of the available parallel processors then independently solve a unique subprogram of the N subprograms, resulting in N unique solutions. A best solution is automatically chosen from among the N unique solutions and the best solution is automatically applied to the EDOP.",
        "keywords": [
            "optimization",
            "polynomial",
            "integer variables",
            "solver",
            "parallel",
            "Prime-Number-Based",
            "Parallel",
            "Solver",
            "Engineering",
            "Design",
            "Optimization",
            "Problems"
        ],
        "tags": [
            "engineering-optimization",
            "工程优化"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Han Lin LI",
            "email": "hanlinli@cityu.edu.hk",
            "auId": "hanlinli",
            "department": "City University of Hong Kong, Hong Kong Institute for Advanced Study, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "CN112137620B",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E5%9F%BA%E6%96%BC%E8%B6%85%E5%AF%AC%E5%B8%B6%E9%9B%B7%E9%81%94%E7%9A%84%E4%BA%BA%E9%AB%94%E5%BE%AE%E5%BC%B1%E5%91%BC%E5%90%B8%E4%BF%A1%E8%99%9F%E6%AA%A2%E6%B8%AC%E6%96%B9%E6%B3%95/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "CN112137620B"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "CN112137620B"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "CN112137620B"
            }
        ],
        "trialAccess": false,
        "id": "CN112137620B",
        "title": "Human Body Weak Respiratory Signal Detection Method Based on Ultra-wideband Radar",
        "inventorId": "issliao",
        "imageUrl": "assets/patents/CN112137620B.png",
        "pdfUrl": "patent_originals/07_CN112137620B.pdf",
        "localOriginal": "patent_originals/07_CN112137620B.pdf",
        "inventors": [
            "Shaoyi Stephen LIAO",
            "Zhening FAN",
            "Hai Zhu XIE",
            "Peimiao RONG",
            "Yi ZHANG",
            "Jin LI",
            "Peng DU",
            "Lixin WANG",
            "Jiajian ZHU",
            "Xianren ZHAO"
        ],
        "leadInventor": "Shaoyi Stephen LIAO",
        "assignee": "GUANGDONG PROVINCE SEISMOLOGY BUREAU;City University of Hong Kong CityU",
        "applicationNumber": "ZL202010876210.2",
        "priorityDate": "202010876210.2",
        "filingDate": "2020-08-27",
        "publicationDate": "2021-06-11",
        "legalStatus": "Published - 11 Jun 2021 | external lookup: CN112137620B pub=2021-06-11 assignee=广东省地震局 conf=high",
        "field": "medical-sensing",
        "industry": "医疗健康",
        "commercialFit": "high",
        "summary": "The invention discloses a method for detecting weak human breathing signals based on ultra-wideband radar, comprising the steps of: collecting radar echo signals by using ultra-wideband radar to form a signal matrix X(m,n); for each distance unit, collecting radar echo signals The wave signal is recorded as x m (n); after Motion filtering and normalization processing of the radar echo signal x m (n), the standardized signal is obtained for normalized signals Perform Hilbert-Huang transform to obtain its micro-Doppler feature α 1 ; Perform fast Fourier transform to obtain its spectral characteristic α 2 ; construct noise-free breathing signal x 0 (n); Perform correlation analysis with the noise-free breathing signal x 0 (n) to obtain the correlation feature α 3 ; take the micro-Doppler feature α 1 , the spectral feature α 2 and the correlation feature α 3 as the input features, use the support vector machine model to The radar echo signal x m (n) is classified; according to the classification result, it is judged whether there is a living body and the location information of the living body is obtained. The invention can improve the precision and efficiency of detecting the weak vital features of the human body.",
        "keywords": [
            "medical",
            "breathing",
            "respiratory",
            "radar",
            "human body",
            "Human",
            "Body",
            "Weak",
            "Respiratory",
            "Signal",
            "Detection",
            "Based"
        ],
        "tags": [
            "medical-sensing",
            "医疗健康"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Shaoyi Stephen LIAO",
            "email": "issliao@cityu.edu.hk",
            "auId": "issliao",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "CN114117510B",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E9%9A%A8%E6%A9%9F%E7%A7%81%E9%91%B0%E5%84%B2%E5%AD%98%E6%96%B9%E6%B3%95%E5%8F%8A%E8%A3%9D%E7%BD%AE%E9%9A%A8%E6%A9%9F%E7%A7%81%E9%91%B0%E8%AA%BF%E7%94%A8%E6%96%B9%E6%B3%95%E5%8F%8A%E8%A3%9D%E7%BD%AE/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "CN114117510B"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "CN114117510B"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "CN114117510B"
            }
        ],
        "trialAccess": false,
        "id": "CN114117510B",
        "title": "一種隨機私鑰儲存方法及裝置、隨機私鑰調用方法及裝置",
        "inventorId": "zhao_jianliang_leon",
        "imageUrl": "assets/patents/CN114117510B.png",
        "pdfUrl": "patent_originals/08_CN114117510A.pdf",
        "localOriginal": "patent_originals/08_CN114117510A.pdf",
        "inventors": [
            "Jianliang Leon ZHAO",
            "Jiewu LENG",
            "Rui SHI",
            "Xinyu ZHU",
            "Yiyang BIAN"
        ],
        "leadInventor": "Jianliang Leon ZHAO",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "ZL202010902081.X",
        "priorityDate": "202010902081.X",
        "filingDate": "2020-09-01",
        "publicationDate": "2026-03-17",
        "legalStatus": "Published - 17 Mar 2026 | external lookup: CN114117510B pub=2026-03-17 assignee=香港城市大学深圳研究院 conf=high",
        "field": "blockchain-trust",
        "industry": "区块链可信内容",
        "commercialFit": "high",
        "summary": "This paper provides a method and apparatus for storing and retrieving random private keys. The random private key storage method includes: modifying data at certain locations in the original private key to generate a new private key and generating a private key encryption information file recording the modification information of the original private key; generating a forged encryption information file; and storing the new private key, the private key encryption information file, and the forged encryption information file respectively. The random private key retrieval method includes: receiving the storage location of the new private key and the storage location of the private key encryption information file selected by the user; determining the private key encryption information file based on the storage location of the private key encryption information file; and using the private key encryption information file to restore the private key at the location of the new private key to obtain the original private key. This paper can protect the security of private keys, prevent private key theft, and improve the convenience of private key operations.",
        "keywords": [
            "blockchain",
            "ethereum",
            "nft",
            "private key",
            "ddos",
            "一種隨機私鑰儲存方法及裝置",
            "隨機私鑰調用方法及裝置",
            "This",
            "paper",
            "provides",
            "apparatus",
            "storing"
        ],
        "tags": [
            "blockchain-trust",
            "区块链可信内容"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Jianliang Leon ZHAO",
            "email": "",
            "auId": "",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "CN114513317B",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E6%8A%97%E5%88%86%E4%BD%88%E5%BC%8F%E6%8B%92%E7%B5%95%E6%9C%8D%E5%8B%99%E6%94%BB%E6%93%8A%E6%96%B9%E6%B3%95%E7%B3%BB%E7%B5%B1%E8%A8%AD%E5%82%99%E5%8F%8A%E5%AD%98%E5%84%B2%E4%BB%8B%E8%B3%AA/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "CN114513317B"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "CN114513317B"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "CN114513317B"
            }
        ],
        "trialAccess": false,
        "id": "CN114513317B",
        "title": "一種抗分佈式拒絕服務攻擊方法、系統、設備及存儲介質",
        "inventorId": "zhao_jianliang_leon",
        "imageUrl": "assets/patents/CN114513317B.png",
        "pdfUrl": "patent_originals/09_CN114513317B.pdf",
        "localOriginal": "patent_originals/09_CN114513317B.pdf",
        "inventors": [
            "Jianliang Leon ZHAO",
            "Rui SHI",
            "Jiewu LENG",
            "Xinyu ZHU",
            "Yiyang BIAN"
        ],
        "leadInventor": "Jianliang Leon ZHAO",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "ZL202011162057.3",
        "priorityDate": "202011162057.3",
        "filingDate": "2020-10-27",
        "publicationDate": "2024-06-04",
        "legalStatus": "Published - 4 Jun 2024 | external lookup: CN114513317B pub=2024-06-04 assignee=香港城市大学深圳研究院 conf=high",
        "field": "blockchain-trust",
        "industry": "区块链可信内容",
        "commercialFit": "high",
        "summary": "Provided herein are methods, systems, devices, and storage media for combating distributed denial of service attacks, wherein the methods comprise: randomly selecting form endorsement nodes from redundant endorsement nodes, wherein the redundant endorsement nodes are endorsement nodes except for appointed endorsement nodes of current transaction in a blockchain; and sending a transaction endorsement request to the appointed endorsement node and the form endorsement node. In the method, formal endorsement is carried out by arranging the formal endorsement node, and in the process of trading by the blockchain node, a transaction endorsement request is randomly sent to the formal endorsement node, so that false transaction type judgment information can be transmitted to a DDoS internal attacker, the purpose of interfering the transaction type judgment of the DDoS internal attacker is achieved, and further, the attack measurement of the DDoS internal attacker is difficult to effectively develop.",
        "keywords": [
            "blockchain",
            "ethereum",
            "nft",
            "private key",
            "ddos",
            "一種抗分佈式拒絕服務攻擊方法",
            "系統",
            "設備及存儲介質",
            "Provided",
            "herein",
            "are",
            "methods"
        ],
        "tags": [
            "blockchain-trust",
            "区块链可信内容"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Jianliang Leon ZHAO",
            "email": "",
            "auId": "",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "CN114077631A",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E5%8D%80%E5%A1%8A%E9%8F%88%E6%87%89%E7%94%A8%E7%B3%BB%E7%B5%B1%E4%B8%AD%E9%96%93%E4%BB%B6%E7%9A%84%E6%95%B8%E6%93%9A%E4%BA%A4%E4%BA%92%E6%96%B9%E6%B3%95%E5%8F%8A%E4%B8%AD%E9%96%93%E4%BB%B6%E7%B3%BB%E7%B5%B1/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "CN114077631A"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "CN114077631A"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "CN114077631A"
            }
        ],
        "trialAccess": false,
        "id": "CN114077631A",
        "title": "一種區塊鏈應用系統中間件的數據交互方法及中間件系統",
        "inventorId": "zhao_jianliang_leon",
        "imageUrl": "assets/patents/CN114077631A.png",
        "pdfUrl": "patent_originals/10_CN114077631A.pdf",
        "localOriginal": "patent_originals/10_CN114077631A.pdf",
        "inventors": [
            "Jianliang Leon ZHAO",
            "Jiewu LENG",
            "Rui SHI",
            "Yiyang BIAN",
            "Xinyu ZHU"
        ],
        "leadInventor": "Jianliang Leon ZHAO",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "202010829799.0",
        "priorityDate": "202010829799.0",
        "filingDate": "2020-08-18",
        "publicationDate": "2020-08-18",
        "legalStatus": "Accepted/In press/Filed - 18 Aug 2020 | external lookup: CN114077631A pub= assignee=香港城市大学深圳研究院 conf=manual",
        "field": "blockchain-trust",
        "industry": "区块链可信内容",
        "commercialFit": "standard",
        "summary": "This paper provides a data interaction method and middleware system for blockchain application system middleware, wherein the method includes: converting operation commands received from the blockchain application system into machine instructions recognized by hardware devices; Perform data format conversion on the manufacturing data uploaded by the hardware device to obtain blockchain information that meets the format requirements of the blockchain application system; send the machine instructions to the hardware device, and send the blockchain information to The blockchain application system. This paper can realize the interconnection between different blockchain application systems and different hardware devices, realize the efficient combination of on-chain and off-chain, and make the operation of the blockchain application system on hardware devices more convenient.",
        "keywords": [
            "blockchain",
            "ethereum",
            "nft",
            "private key",
            "ddos",
            "一種區塊鏈應用系統中間件的數據交互方法及中間件系統",
            "This",
            "paper",
            "provides",
            "data",
            "interaction",
            "middleware"
        ],
        "tags": [
            "blockchain-trust",
            "区块链可信内容"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Jianliang Leon ZHAO",
            "email": "",
            "auId": "",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "US11386164B2",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/searching-electronic-documents-based-on-example-based-search-quer/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "US11386164B2"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "US11386164B2"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "US11386164B2"
            }
        ],
        "trialAccess": false,
        "id": "US11386164B2",
        "title": "Searching Electronic Documents Based on Example-based Search Query",
        "inventorId": "ruiyunxu2",
        "imageUrl": "assets/patents/US11386164B2.png",
        "pdfUrl": "patent_originals/11_US11386164B2.pdf",
        "localOriginal": "patent_originals/11_US11386164B2.pdf",
        "inventors": [
            "Ruiyun XU",
            "Hailiang CHEN",
            "Jianliang Leon ZHAO"
        ],
        "leadInventor": "Ruiyun XU",
        "assignee": "University of Hong Kong HKU;City University of Hong Kong CityU",
        "applicationNumber": "US11386164",
        "priorityDate": "15/930,647",
        "filingDate": "2020-05-13",
        "publicationDate": "2022-07-12",
        "legalStatus": "Published - 12 Jul 2022 | external lookup: US11386164B2 pub=2022-07-12 assignee=City University Of Hong Kong conf=high",
        "field": "enterprise-search",
        "industry": "信息检索",
        "commercialFit": "high",
        "summary": "A computer implemented method for searching electronic documents, and associated system and computer program product. The method includes receiving an input representing an example-based search query and processing the input. The method also includes determining, for each of the electronic documents, a relevance score between the input and the corresponding electronic document. The determination is based on, at least, textual similarity between the input and the corresponding electronic document, topical similarity between the input and the corresponding electronic document, as well as linkage relationship in a linkage network of the plurality of electronic documents. The method also includes determining, based on the determined relevance scores, a search result containing one or more of the electronic documents. The search results will be provided to the user.",
        "keywords": [
            "search",
            "query",
            "document",
            "textual data",
            "electronic documents",
            "Searching",
            "Electronic",
            "Documents",
            "Based",
            "on",
            "Example-based",
            "Search"
        ],
        "tags": [
            "enterprise-search",
            "信息检索"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Ruiyun XU",
            "email": "ruiyunxu2-c@my.cityu.edu.hk",
            "auId": "ruiyunxu2",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "CN111104831B",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E8%A6%96%E8%A6%BA%E8%BF%BD%E8%B9%A4%E6%96%B9%E6%B3%95%E8%A3%9D%E7%BD%AE%E8%A8%88%E7%AE%97%E6%A9%9F%E8%A8%AD%E5%82%99%E4%BB%A5%E5%8F%8A%E4%BB%8B%E8%B3%AA/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "CN111104831B"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "CN111104831B"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "CN111104831B"
            }
        ],
        "trialAccess": false,
        "id": "CN111104831B",
        "title": "Visual Tracking Method And Device, Computer Equipment And Medium",
        "inventorId": "issliao",
        "imageUrl": "assets/patents/CN111104831B.png",
        "pdfUrl": "patent_originals/12_CN111104831B.pdf",
        "localOriginal": "patent_originals/12_CN111104831B.pdf",
        "inventors": [
            "Zhenbin YAN",
            "Shaoyi Stephen LIAO",
            "Xinran CHEN",
            "Yujing XU"
        ],
        "leadInventor": "Shaoyi Stephen LIAO",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "ZL201811268263.5",
        "priorityDate": "201811268263.5",
        "filingDate": "2018-10-29",
        "publicationDate": "2023-09-29",
        "legalStatus": "Published - 29 Sept 2023 | external lookup: CN111104831B pub=2023-09-29 assignee=香港城市大学深圳研究院 conf=high",
        "field": "computer-vision",
        "industry": "计算机视觉",
        "commercialFit": "high",
        "summary": "The invention provides a visual tracking method, a visual tracking device, computer equipment and a medium, wherein the method processes a given tracking object frame in an initial video frame to obtain sample data and tag data; training a pre-established video tracking network model by utilizing the sample data and the label data; and calibrating a tracking object in a subsequent frame of the video by using the trained video tracking network model, wherein during sample classification and model training, the network top-layer feature map is divided into areas with different confidence levels, the areas with different confidence levels are combined in a weight mode to carry out sample classification and model training, so that the areas with high confidence levels are strengthened, quick training and accurate tracking of the model are realized, further, objects which change continuously in a video image are tracked automatically, and different application scenes can be adapted.",
        "keywords": [
            "visual tracking",
            "creating an image",
            "image",
            "tracking",
            "視覺",
            "Visual",
            "Tracking",
            "Device",
            "Computer",
            "Equipment",
            "Medium",
            "invention"
        ],
        "tags": [
            "computer-vision",
            "计算机视觉"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Shaoyi Stephen LIAO",
            "email": "issliao@cityu.edu.hk",
            "auId": "issliao",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "CN111098849B",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/%E4%B8%80%E7%A8%AE%E6%96%B0%E8%83%BD%E6%BA%90%E6%B1%BD%E8%BB%8A%E7%A9%A9%E5%AE%9A%E6%80%A7%E6%8E%A7%E5%88%B6%E6%96%B9%E6%B3%95%E5%8F%8A%E7%B3%BB%E7%B5%B1/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "CN111098849B"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "CN111098849B"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "CN111098849B"
            }
        ],
        "trialAccess": false,
        "id": "CN111098849B",
        "title": "New Energy Automobile Stability Control Method And System",
        "inventorId": "issliao",
        "imageUrl": "assets/patents/CN111098849B.png",
        "pdfUrl": "patent_originals/13_CN111098849B.pdf",
        "localOriginal": "patent_originals/13_CN111098849B.pdf",
        "inventors": [
            "Shaoyi Stephen LIAO",
            "Yujing XU",
            "Puxi WANG"
        ],
        "leadInventor": "Shaoyi Stephen LIAO",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "ZL201811271410.4",
        "priorityDate": "201811271410.4",
        "filingDate": "2018-10-29",
        "publicationDate": "2021-04-27",
        "legalStatus": "Published - 27 Apr 2021 | external lookup: CN111098849B pub=2021-04-27 assignee=香港城市大学深圳研究院 conf=high",
        "field": "vehicle-control",
        "industry": "新能源汽车",
        "commercialFit": "high",
        "summary": "The invention provides a method and system for controlling the stability of a new energy vehicle. The method includes: acquiring the front wheel rotation angle and longitudinal speed of the vehicle; inputting the front wheel rotation angle and longitudinal speed into a linear two-degree-of-freedom model of the vehicle to generate a yaw angle The ideal value and the ideal value of the centroid side slip angle; according to the RBF neural network algorithm, the ideal value of the yaw angular velocity and the actual value of the yaw angular velocity, the ideal value of the centroid side slip angle and the actual value of the centroid side slip angle, so that the car does not Determine that the interference term is bounded; according to the ideal value of the yaw angular velocity and the actual value of the yaw angular velocity, the ideal value of the centroid side slip angle and the actual value of the centroid side slip angle, and the bounded uncertain interference term, the total value of the car is generated. Demand yaw moment; divide the total demand yaw moment to each wheel, and output the division result to the torque regulator. The invention can make the uncertain interference items of the automobile system bounded, effectively improve the anti-interference ability of the automobile system, and ensure the stability of the operation and driving of the vehicle.",
        "keywords": [
            "new energy automobile",
            "stability control",
            "vehicle",
            "新能源",
            "汽車",
            "New",
            "Energy",
            "Automobile",
            "Stability",
            "Control",
            "invention",
            "provides"
        ],
        "tags": [
            "vehicle-control",
            "新能源汽车"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Shaoyi Stephen LIAO",
            "email": "issliao@cityu.edu.hk",
            "auId": "issliao",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "US10747759B2",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/a-system-and-method-for-conducting-a-textual-data-search/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "US10747759B2"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "US10747759B2"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "US10747759B2"
            }
        ],
        "trialAccess": false,
        "id": "US10747759B2",
        "title": "A System and Method for Conducting a Textual Data Search",
        "inventorId": "ruiyunxu2",
        "imageUrl": "assets/patents/US10747759B2.png",
        "pdfUrl": "patent_originals/14_US10747759B2.pdf",
        "localOriginal": "patent_originals/14_US10747759B2.pdf",
        "inventors": [
            "Ruiyun XU",
            "Hailiang CHEN",
            "Jianliang Leon ZHAO"
        ],
        "leadInventor": "Ruiyun XU",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "US10,747,759",
        "priorityDate": "15/631,077",
        "filingDate": "2017-06-23",
        "publicationDate": "2020-08-18",
        "legalStatus": "Published - 18 Aug 2020 | external lookup: US10747759B2 pub=2020-08-18 assignee=City University Of Hong Kong conf=high",
        "field": "enterprise-search",
        "industry": "信息检索",
        "commercialFit": "high",
        "summary": "A system and a method for conducting a textual data search includes receiving a search query associated with a search topic; analyzing the search query to determine at least one attribute of the search topic; processing the at least one attribute and a plurality of articles in a database; and identifying one or more results being relevant to the search topic in the plurality of articles in the database.",
        "keywords": [
            "search",
            "query",
            "document",
            "textual data",
            "electronic documents",
            "Conducting",
            "Textual",
            "Data",
            "Search",
            "conducting",
            "textual",
            "data"
        ],
        "tags": [
            "enterprise-search",
            "信息检索"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Ruiyun XU",
            "email": "ruiyunxu2-c@my.cityu.edu.hk",
            "auId": "ruiyunxu2",
            "department": "City University of Hong Kong, Department of Information Systems, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "US10432907B2",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/an-electronic-system-for-creating-an-image-and-a-method-of-creati/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "发明专利",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "US10432907B2"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "US10432907B2"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "US10432907B2"
            }
        ],
        "trialAccess": false,
        "id": "US10432907B2",
        "title": "An Electronic System for Creating an Image and a Method of Creating an Image",
        "inventorId": "tsang_sze_chun",
        "imageUrl": "assets/patents/US10432907B2.png",
        "pdfUrl": "patent_originals/15_US10432907B2.pdf",
        "localOriginal": "patent_originals/15_US10432907B2.pdf",
        "inventors": [
            "Sze Chun TSANG",
            "Miu Ling LAM",
            "Bin CHEN",
            "Yaozhun HUANG"
        ],
        "leadInventor": "Sze Chun TSANG",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "US10,432,907",
        "priorityDate": "15/216,950",
        "filingDate": "2016-07-22",
        "publicationDate": "2019-10-01",
        "legalStatus": "Published - 1 Oct 2019 | external lookup: US10432907B2 pub=2019-10-01 assignee=City University Of Hong Kong conf=high",
        "field": "computer-vision",
        "industry": "计算机视觉",
        "commercialFit": "high",
        "summary": "An electronic system and a method for creating an image includes a display arranged to display a plurality of two-dimensional representations within a three-dimensional space, wherein the plurality of two-dimensional representations are arranged to individually represent a portion of a three-dimensional object within the three-dimensional space; and an imager arranged to capture the plurality of two-dimensional representations being displayed within the three-dimensional space; wherein the plurality of two-dimensional representations in a plurality of predefined positions are combined to form an image representative of the three-dimensional object within the three-dimensional space.",
        "keywords": [
            "visual tracking",
            "creating an image",
            "image",
            "tracking",
            "視覺",
            "An",
            "Electronic",
            "Creating",
            "an",
            "Image",
            "of",
            "electronic"
        ],
        "tags": [
            "computer-vision",
            "计算机视觉"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Sze Chun TSANG",
            "email": "",
            "auId": "",
            "department": "City University of Hong Kong, Department of Management, Hong Kong, Peoples R China."
        }
    },
    {
        "sourceName": "CityUHK Scholars",
        "publicationNumber": "USD738319S1",
        "sourceUrl": "https://scholars.cityu.edu.hk/en/publications/light-sensor/",
        "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
        "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
        "type": "Design patent",
        "patentRules": [
            {
                "id": "patent_first",
                "priority": 100,
                "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
                "patentId": "USD738319S1"
            },
            {
                "id": "no_claim_expansion",
                "priority": 100,
                "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
                "patentId": "USD738319S1"
            },
            {
                "id": "no_legal_conclusion",
                "priority": 95,
                "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
                "patentId": "USD738319S1"
            }
        ],
        "trialAccess": false,
        "id": "USD738319S1",
        "title": "Light Sensor",
        "inventorId": "eeshc",
        "imageUrl": "assets/patents/USD738319S1.png",
        "pdfUrl": "patent_originals/16_USD738319S1.pdf",
        "localOriginal": "patent_originals/16_USD738319S1.pdf",
        "inventors": [
            "Shu Hung Henry CHUNG",
            "Sui Pung CHEUNG",
            "Tsz Kit LAU",
            "Hoi Ling WONG",
            "Sin Yu YEUNG",
            "Hoi Sing SIU"
        ],
        "leadInventor": "Shu Hung Henry CHUNG",
        "assignee": "City University of Hong Kong CityU",
        "applicationNumber": "D738,319",
        "priorityDate": "29/483,046",
        "filingDate": "2014-02-25",
        "publicationDate": "2015-09-08",
        "legalStatus": "Published - 8 Sept 2015 | external lookup: USD738319S1 pub=2015-09-08 assignee=City University Of Hong Kong conf=high",
        "field": "sensor-hardware",
        "industry": "智能硬件",
        "commercialFit": "high",
        "summary": "This CityUHK patent record is available from the public CityUHK Scholars metadata. The original patent text has not been publicly available in the local archive yet.",
        "keywords": [
            "light sensor",
            "sensor",
            "光传感",
            "傳感器",
            "Light",
            "Sensor",
            "This",
            "CityUHK",
            "patent",
            "record",
            "is",
            "available"
        ],
        "tags": [
            "sensor-hardware",
            "智能硬件"
        ],
        "risks": [
            "需要核验专利权属、法律状态和许可边界",
            "需要结合企业数据、设备接口和试点预算评估落地可行性"
        ],
        "cityuScholar": {
            "name": "Shu Hung Henry CHUNG",
            "email": "eeshc@cityu.edu.hk",
            "auId": "eeshc",
            "department": "City University of Hong Kong, Department of Electrical Engineering, Hong Kong, Peoples R China."
        }
    }
];

function derivePatentPricing(patent) {
    const scholar = inventors.find(item => item.id === patent.inventorId) || {};
    const fit = patent.commercialFit || 'standard';
    const status = String(patent.legalStatus || '');
    let price = 2999;
    let basis = 'university / research institute / strong company patent';

    if (patent.trialAccess || fit === 'trial') {
        price = 0;
        basis = 'selected trial/open discovery record';
    } else if (fit === 'narrow' || /Expired|Withdrawn/i.test(status)) {
        price = 1999;
        basis = 'older, narrower, or lower-confidence commercial fit';
    } else if ((scholar.affiliationTier === 'top_university' || scholar.affiliationTier === 'national_institute') && (fit === 'high' || /Active|Granted/i.test(status))) {
        price = 3999;
        basis = 'top university / national institute plus active or highly relevant patent';
    }

    return {
        price,
        licensePrice: price,
        requireLicense: price > 0,
        licenseTier: price >= 3999 ? 'premium' : price >= 2999 ? 'standard' : price > 0 ? 'basic' : 'free',
        pricingBasis: basis
    };
}

const PATENT_DETAIL_TEXT_EXTRACTION_STATUS = {
    US12571139B2: 'limited_or_image_based',
    US20230385365A1: 'limited_or_image_based'
};

function derivePatentDetailEvidenceAudit(patent) {
    const hasLocalOriginal = Boolean(patent.localOriginal);
    return {
        originalStatus: hasLocalOriginal ? 'local_original_available' : 'metadata_only',
        hasLocalOriginal,
        localOriginal: patent.localOriginal || '',
        originalType: hasLocalOriginal && /\.pdf(\?.*)?$/i.test(patent.localOriginal) ? 'pdf' : (hasLocalOriginal ? 'other' : 'cityu_metadata'),
        textExtractionStatus: hasLocalOriginal
            ? (PATENT_DETAIL_TEXT_EXTRACTION_STATUS[patent.id] || 'extractable_preview_text')
            : 'not_available',
        verifiedSectionKeys: Object.keys(patent.verifiedSections || {})
    };
}

patents.forEach(patent => {
    Object.assign(patent, derivePatentPricing(patent));
    patent.verifiedSections = patent.verifiedSections || {};
    patent.detailEvidenceAudit = derivePatentDetailEvidenceAudit(patent);
});

const patentDetails = patents.reduce((details, patent) => {
    details[patent.id] = {
        requireLicense: patent.requireLicense,
        price: patent.price,
        licensePrice: patent.licensePrice,
        licenseTier: patent.licenseTier,
        pricingBasis: patent.pricingBasis
    };
    return details;
}, {});

function getPatentById(patentId) {
    const base = patents.find(patent => patent.id === patentId) || patents[0];
    return Object.assign({}, base, patentDetails[base.id] || {});
}

// 对话历史管理
const ChatHistory = {
    makeKey(inventorId, projectId, patentId) {
        return `chat_history_${inventorId}_${projectId || 'general'}_${patentId || 'any'}`;
    },

    // 保存对话
    save(inventorId, role, content, context = {}) {
        const key = this.makeKey(inventorId, context.projectId, context.patentId);
        let history = [];
        const stored = localStorage.getItem(key);
        if (stored) history = JSON.parse(stored);

        history.push({
            role,
            content,
            time: new Date().toISOString(),
            inventorId,
            projectId: context.projectId || '',
            patentId: context.patentId || ''
        });

        localStorage.setItem(key, JSON.stringify(history));
    },

    // 获取对话历史
    get(inventorId, context = {}) {
        const key = this.makeKey(inventorId, context.projectId, context.patentId);
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    },

    getAll() {
        const result = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('chat_history_')) {
                try {
                    const messages = JSON.parse(localStorage.getItem(key) || '[]');
                    if (messages.length) result.push({ key, messages });
                } catch (e) {
                    console.warn('Bad chat history:', key, e);
                }
            }
        }
        return result;
    },

    // 清空对话历史
    clear(inventorId, context = {}) {
        const key = this.makeKey(inventorId, context.projectId, context.patentId);
        localStorage.removeItem(key);
    }
};
