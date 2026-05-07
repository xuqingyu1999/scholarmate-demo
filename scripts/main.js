/**
 * ScholarMate 专利交易平台 - 全局脚本
 */

const ScholarMate = {
    // 初始化
    init() {
        this.bindEvents();
        this.initComponents();
        this.handleURLParams();
    },

    // 事件绑定
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

    createPatentCardHtml(patent, index) {
        const inventor = inventors.find(item => item.id === patent.inventorId) || inventors[0];
        const licenseLabel = ScholarMateBusinessCore.getPatentLicenseLabel(patent);
        const priceHtml = ScholarMateBusinessCore.isFreeSharedPatent(patent)
            ? ''
            : `<div class="patent-card__price">${this.escapeHtml(licenseLabel)}</div>`;
        const tag = patent.requireLicense ? '发明专利' : '免费共享';
        return `
            <article class="patent-card" data-patent-id="${this.escapeHtml(patent.id)}">
                <div class="patent-card__image-wrapper">
                    <img src="https://picsum.photos/seed/patent${index + 10}/400/300" alt="专利图片" class="patent-card__image">
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
                            <span class="patent-card__info-item">📂 ${this.escapeHtml(patent.field)}</span>
                            <span class="patent-card__info-item">🔢 ${this.escapeHtml(patent.id)}</span>
                            <span class="patent-card__info-item">🏷️ ${this.escapeHtml(patent.industry)}</span>
                        </div>
                        ${priceHtml}
                    </div>
                </div>
                <div class="patent-card__chat">
                    <button class="patent-card__chat-btn" onclick="ScholarMate.handleListChatClick('${this.escapeHtml(inventor.id)}', '${this.escapeHtml(patent.id)}', '${this.escapeHtml(inventor.name)}')" title="与${this.escapeHtml(inventor.name)}对话">
                        <img src="${this.escapeHtml(inventor.avatar)}" alt="${this.escapeHtml(inventor.name)}" class="patent-card__chat-avatar">
                        <span class="patent-card__chat-label">💬 问顾问</span>
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
            if (confirm('注册企业账号后可试聊数字顾问，是否前往用户中心？')) {
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
        return ScholarMateBusinessCore.canChatAboutPatent(
            this.getUser(),
            getPatentById(patentId),
            (this.getUser() && this.getUser().purchasedLicenses) || []
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
        id: 'inv_001',
        name: '张明远',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=ZhangMingyuan',
        persona: '你是张明远，AI医疗领域专家，热情、专业，喜欢用生动的案例解释技术问题。',
        expertise: ['人工智能', '医疗影像', '深度学习']
    },
    {
        id: 'inv_002',
        name: '李智能',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=LiZhineng',
        persona: '你是李智能，新能源电池专家，性格严谨，说话简洁有力。',
        expertise: ['新能源', '电池技术', '热管理系统']
    },
    {
        id: 'inv_003',
        name: '王物联',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=WangWulian',
        persona: '你是王物联，物联网技术专家，善于用生活案例解释技术原理。',
        expertise: ['物联网', '智能家居', '传感器网络']
    },
    {
        id: 'inv_004',
        name: '赵区块链',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=ZhaoQukuailian',
        persona: '你是赵区块链，区块链安全专家，说话专业且谨慎。',
        expertise: ['区块链', '密码学', '隐私计算']
    },
    {
        id: 'inv_005',
        name: '钱机器人',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=QianJiqiren',
        persona: '你是钱机器人，工业自动化专家，性格开朗，喜欢分享技术趣事。',
        expertise: ['智能制造', '工业机器人', '自动化控制']
    },
    {
        id: 'inv_006',
        name: '孙隐私',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=SunYinsi',
        persona: '你是孙隐私，隐私计算与医疗数据协同专家，表达谨慎，重视合规边界。',
        expertise: ['隐私计算', '医疗数据', '联邦学习']
    },
    {
        id: 'inv_007',
        name: '陈推荐',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=ChenTuijian',
        persona: '你是陈推荐，推荐系统与企业知识库专家，擅长用业务语言解释算法价值。',
        expertise: ['推荐系统', 'RAG', '知识图谱']
    },
    {
        id: 'inv_008',
        name: '周冷链',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=ZhouLenglian',
        persona: '你是周冷链，供应链和物联网预测专家，回答务实，关注落地成本。',
        expertise: ['冷链物流', '物联网', '预测控制']
    },
    {
        id: 'inv_009',
        name: '吴农研',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=WuNongyan',
        persona: '你是吴农研，智慧农业和作物感知专家，善于把模型能力转化成田间管理建议。',
        expertise: ['智慧农业', '作物识别', '遥感监测']
    },
    {
        id: 'inv_010',
        name: '郑双碳',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=ZhengShuangtan',
        persona: '你是郑双碳，节能环保和碳核算专家，回答关注合规、数据口径和改造成本。',
        expertise: ['碳核算', '节能环保', '工业减排']
    },
    {
        id: 'inv_011',
        name: '冯安防',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=FengAnfang',
        persona: '你是冯安防，工业安全和视频感知专家，表达谨慎，重视误报漏报和现场责任边界。',
        expertise: ['工业安全', '视频感知', '风险预警']
    },
    {
        id: 'inv_012',
        name: '高药研',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=GaoYaoyan',
        persona: '你是高药研，生物医药 AI 专家，擅长解释药物筛选、蛋白设计和研发验证路径。',
        expertise: ['生物医药', '药物筛选', '蛋白设计']
    },
    {
        id: 'inv_013',
        name: '罗康复',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=LuoKangfu',
        persona: '你是罗康复，康复机器人和养老照护专家，关注用户体验、临床验证和服务运营。',
        expertise: ['康复机器人', '养老照护', '人机交互']
    },
    {
        id: 'inv_014',
        name: '许教育',
        avatar: 'https://api.dicebear.com/7.x/personas/svg?seed=XuJiaoyu',
        persona: '你是许教育，教育测评和学习分析专家，擅长用学校和企业培训能理解的语言解释模型价值。',
        expertise: ['教育测评', '学习分析', '个性化推荐']
    }
];

// 专利数据
const patents = [
    {
        id: 'ZL202410001234.5',
        title: '一种基于人工智能的医疗诊断系统及方法',
        inventorId: 'inv_001',
        field: '人工智能',
        industry: '医疗健康',
        summary: '利用深度学习算法对医学影像进行自动分析，辅助基层医生提升诊断效率。',
        keywords: ['人工智能', '医学影像', '医疗诊断', '基层医院', '辅助诊断', '深度学习'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['需要接入医院影像数据并做本地化验证', '需要明确辅助诊断责任边界']
    },
    {
        id: 'ZL202410005678.9',
        title: '一种智能家居控制系统及其控制方法',
        inventorId: 'inv_003',
        field: '物联网',
        industry: '智能家居',
        summary: '通过物联网技术实现家居设备互联互通，支持语音控制和远程管理。',
        keywords: ['物联网', '智能家居', '语音控制', '设备互联', '远程管理'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['需要适配不同品牌设备协议', '家庭隐私数据需要单独评估']
    },
    {
        id: 'ZL202410009012.3',
        title: '一种新能源汽车电池热管理系统',
        inventorId: 'inv_002',
        field: '新能源',
        industry: '新能源汽车',
        summary: '提升电池温度控制能力，提高寿命、安全性和极端环境稳定性。',
        keywords: ['新能源汽车', '电池热管理', '热失控', '高温安全', '电芯寿命'],
        requireLicense: true,
        price: 2999,
        licensePrice: 2999,
        licenseTier: 'standard',
        risks: ['量产前需要热仿真和实车验证', '需要结合具体电芯平台评估改造成本']
    },
    {
        id: 'ZL202410003456.7',
        title: '一种折叠式智能穿戴设备外观设计',
        inventorId: 'inv_005',
        field: '智能制造',
        industry: '消费电子',
        summary: '折叠式穿戴设备结构设计，兼顾便携性和产品识别度。',
        keywords: ['消费电子', '穿戴设备', '外观设计', '结构设计'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['外观设计保护范围需要与产品形态逐项比对']
    },
    {
        id: 'ZL202410007890.1',
        title: '一种区块链隐私保护方法及系统',
        inventorId: 'inv_004',
        field: '区块链',
        industry: '金融科技',
        summary: '在保证链上可追溯的同时降低敏感业务数据暴露风险。',
        keywords: ['区块链', '隐私保护', '数据上链', '加密', '合规', '可信追溯'],
        requireLicense: true,
        price: 3999,
        licensePrice: 3999,
        licenseTier: 'premium',
        risks: ['需要审查合规要求和性能开销', '隐私计算方案需与现有系统架构匹配']
    },
    {
        id: 'ZL202410002345.8',
        title: '一种工业机器人协作控制系统',
        inventorId: 'inv_005',
        field: '智能制造',
        industry: '先进制造',
        summary: '实现多台工业机器人协同作业，提高产线效率和柔性调度能力。',
        keywords: ['工业机器人', '先进制造', '协作控制', '柔性产线', '产线调度'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['需要现场节拍数据和安全边界验证']
    },
    {
        id: 'ZL202410006666.2',
        title: '一种少样本工业视觉缺陷检测方法',
        inventorId: 'inv_005',
        field: '人工智能',
        industry: '先进制造',
        summary: '通过少样本学习降低缺陷检测标注成本，适合新产线快速上线质检模型。',
        keywords: ['人工智能', '工业视觉', '缺陷检测', '少样本学习', '质量检测', '先进制造'],
        requireLicense: true,
        price: 1999,
        licensePrice: 1999,
        licenseTier: 'basic',
        risks: ['需要少量现场样本校准', '不同光照和相机条件会影响泛化效果']
    },
    {
        id: 'ZL202410008888.6',
        title: '一种医疗数据隐私保护联邦建模方法',
        inventorId: 'inv_006',
        field: '隐私计算',
        industry: '医疗健康',
        summary: '支持多机构医疗数据不出域协同建模，兼顾模型效果和隐私合规。',
        keywords: ['医疗数据', '隐私保护', '联邦学习', '联邦建模', '合规', '多机构协同'],
        requireLicense: true,
        price: 2999,
        licensePrice: 2999,
        licenseTier: 'standard',
        risks: ['需要评估各院数据标准一致性', '联邦训练通信成本需单独测算']
    },
    {
        id: 'ZL202410004321.0',
        title: '一种企业知识库RAG推荐问答系统',
        inventorId: 'inv_007',
        field: '人工智能',
        industry: '企业服务',
        summary: '将企业知识库检索、证据过滤和推荐解释结合，生成可追溯的顾问式回答。',
        keywords: ['RAG', '知识库', '推荐系统', '企业问答', '可追溯回答'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['需要整理企业知识库权限', '回答质量依赖文档结构和检索召回']
    },
    {
        id: 'ZL202410010234.4',
        title: '一种冷链物流温控预测与预警系统',
        inventorId: 'inv_008',
        field: '物联网',
        industry: '供应链物流',
        summary: '结合传感器时序数据预测冷链温度异常，提前预警运输和仓储风险。',
        keywords: ['冷链物流', '物联网', '温控预测', '传感器', '供应链预警'],
        requireLicense: true,
        price: 1999,
        licensePrice: 1999,
        licenseTier: 'basic',
        risks: ['需要稳定传感器采集链路', '不同货品温控阈值需业务配置']
    },
    {
        id: 'ZL202410011678.2',
        title: '一种制造车间能耗优化调度方法',
        inventorId: 'inv_005',
        field: '智能制造',
        industry: '工业节能',
        summary: '根据订单节拍、设备负荷和电价波动生成车间能耗优化调度建议。',
        keywords: ['制造车间', '能耗优化', '调度', '工业节能', '设备负荷'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['需要对接设备能耗数据', '调度策略需避免影响交付节拍']
    },
    {
        id: 'ZL202410012345.6',
        title: '一种多模态内容冷启动推荐方法',
        inventorId: 'inv_007',
        field: '推荐系统',
        industry: '内容平台',
        summary: '融合文本、图像和首轮反馈信号，提升新用户和新内容的推荐冷启动效果。',
        keywords: ['推荐系统', '冷启动', '多模态', '内容平台', '用户反馈'],
        requireLicense: true,
        price: 2999,
        licensePrice: 2999,
        licenseTier: 'standard',
        risks: ['需要多模态特征工程支持', '线上效果需结合AB实验验证']
    },
    {
        id: 'ZL202410013210.9',
        title: '一种农作物病虫害智能识别与预警系统',
        inventorId: 'inv_009',
        field: '人工智能',
        industry: '智慧农业',
        summary: '利用田间图像和气象数据识别作物病虫害风险，为农业合作社提供预警和处置建议。',
        keywords: ['智慧农业', '农作物', '病虫害', '图像识别', '气象数据', '预警'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['需要本地作物和病虫害样本校准', '田间拍摄光照会影响识别稳定性']
    },
    {
        id: 'ZL202410014567.1',
        title: '一种温室精准灌溉与土壤水分调控方法',
        inventorId: 'inv_009',
        field: '物联网',
        industry: '智慧农业',
        summary: '通过土壤传感器和作物需水模型自动生成温室灌溉策略，降低用水量并稳定产量。',
        keywords: ['智慧农业', '精准灌溉', '土壤水分', '温室', '传感器', '节水'],
        requireLicense: true,
        price: 1999,
        licensePrice: 1999,
        licenseTier: 'basic',
        risks: ['需要部署传感器网络', '不同作物需水模型需要单独配置']
    },
    {
        id: 'ZL202410015678.4',
        title: '一种工业园区碳排放核算与节能诊断系统',
        inventorId: 'inv_010',
        field: '节能环保',
        industry: '节能环保',
        summary: '整合电力、燃气和生产数据，形成园区碳排放核算、异常能耗识别和节能改造建议。',
        keywords: ['碳排放', '碳核算', '工业园区', '节能诊断', '能耗异常', '双碳'],
        requireLicense: true,
        price: 2999,
        licensePrice: 2999,
        licenseTier: 'standard',
        risks: ['需要统一企业能耗数据口径', '节能建议需结合现场工艺验证']
    },
    {
        id: 'ZL202410016789.5',
        title: '一种污水处理过程智能曝气控制方法',
        inventorId: 'inv_010',
        field: '节能环保',
        industry: '节能环保',
        summary: '根据水质指标和负荷变化动态调节曝气强度，降低污水处理能耗并稳定出水质量。',
        keywords: ['水处理', '污水处理', '曝气控制', '节能', '水质监测', '环保'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['需要接入水质在线监测数据', '控制策略需与现有工艺参数联动']
    },
    {
        id: 'ZL202410017890.2',
        title: '一种工地危险作业视频识别与风险预警系统',
        inventorId: 'inv_011',
        field: '计算机视觉',
        industry: '工业安全',
        summary: '识别未佩戴安全帽、高空作业越界和危险区域闯入，向项目管理人员推送实时风险预警。',
        keywords: ['工业安全', '视频识别', '工地安全', '风险预警', '安全帽', '高空作业'],
        requireLicense: true,
        price: 1999,
        licensePrice: 1999,
        licenseTier: 'basic',
        risks: ['需要评估摄像头覆盖盲区', '误报漏报责任边界需提前约定']
    },
    {
        id: 'ZL202410018901.8',
        title: '一种矿山设备异常振动监测与预测维护方法',
        inventorId: 'inv_011',
        field: '物联网',
        industry: '工业安全',
        summary: '采集矿山关键设备振动和温度数据，识别潜在故障并生成预测维护计划。',
        keywords: ['矿山安全', '设备监测', '振动分析', '预测维护', '物联网', '风险预警'],
        requireLicense: true,
        price: 2999,
        licensePrice: 2999,
        licenseTier: 'standard',
        risks: ['需要传感器长期稳定采集', '故障标签不足会影响模型校准']
    },
    {
        id: 'ZL202410019012.0',
        title: '一种面向药物筛选的分子活性预测方法',
        inventorId: 'inv_012',
        field: '人工智能',
        industry: '生物医药',
        summary: '基于分子结构和靶点特征预测候选化合物活性，缩短早期药物筛选周期。',
        keywords: ['生物医药', '药物筛选', '分子活性', '靶点', '人工智能', '临床前研发'],
        requireLicense: true,
        price: 3999,
        licensePrice: 3999,
        licenseTier: 'premium',
        risks: ['预测结果需要实验验证', '数据来源和模型适用域需单独评估']
    },
    {
        id: 'ZL202410020123.7',
        title: '一种蛋白质结构设计与稳定性评估系统',
        inventorId: 'inv_012',
        field: '生物计算',
        industry: '生物医药',
        summary: '结合序列特征和结构预测结果评估蛋白稳定性，为酶改造和抗体设计提供候选方案。',
        keywords: ['蛋白设计', '结构预测', '稳定性评估', '酶改造', '抗体设计', '生物医药'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['需要结合湿实验验证', '候选序列知识产权边界需单独确认']
    },
    {
        id: 'ZL202410021234.8',
        title: '一种脑卒中康复训练动作评估系统',
        inventorId: 'inv_013',
        field: '康复机器人',
        industry: '医疗健康',
        summary: '通过视觉和穿戴传感器评估康复训练动作质量，生成个性化训练反馈。',
        keywords: ['康复训练', '脑卒中', '动作评估', '穿戴传感器', '康复机器人', '医疗健康'],
        requireLicense: true,
        price: 2999,
        licensePrice: 2999,
        licenseTier: 'standard',
        risks: ['需要临床康复师参与标注', '医疗器械合规路径需提前评估']
    },
    {
        id: 'ZL202410022345.9',
        title: '一种养老照护跌倒检测与主动呼叫系统',
        inventorId: 'inv_013',
        field: '物联网',
        industry: '养老照护',
        summary: '融合毫米波雷达和环境传感器检测老人跌倒风险，并联动护理人员主动呼叫。',
        keywords: ['养老照护', '跌倒检测', '毫米波雷达', '主动呼叫', '物联网', '风险预警'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['需要评估居家隐私接受度', '误报会影响护理人员工作流']
    },
    {
        id: 'ZL202410023456.0',
        title: '一种企业培训学习效果智能评测方法',
        inventorId: 'inv_014',
        field: '教育科技',
        industry: '企业服务',
        summary: '结合测验、学习行为和岗位任务表现，评估企业培训效果并推荐后续学习路径。',
        keywords: ['教育评测', '企业培训', '学习分析', '个性化推荐', '岗位能力', '企业服务'],
        requireLicense: true,
        price: 1999,
        licensePrice: 1999,
        licenseTier: 'basic',
        risks: ['需要定义岗位能力模型', '员工行为数据使用需获得授权']
    },
    {
        id: 'ZL202410024567.3',
        title: '一种课堂专注度分析与个性化教学反馈系统',
        inventorId: 'inv_014',
        field: '人工智能',
        industry: '教育科技',
        summary: '分析课堂互动、答题和学习轨迹，为教师提供班级专注度和个性化教学反馈。',
        keywords: ['教育科技', '学习分析', '课堂互动', '个性化教学', '专注度', '人工智能'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['学生数据隐私需严格保护', '不应把专注度作为单一评价指标']
    },
    {
        id: 'ZL202410025678.6',
        title: '一种跨境电商商品需求预测与库存优化系统',
        inventorId: 'inv_007',
        field: '推荐系统',
        industry: '供应链物流',
        summary: '结合搜索趋势、历史订单和物流时效预测商品需求，辅助跨境仓库存和补货决策。',
        keywords: ['需求预测', '库存优化', '跨境电商', '供应链', '推荐系统', '补货决策'],
        requireLicense: true,
        price: 2999,
        licensePrice: 2999,
        licenseTier: 'standard',
        risks: ['需要稳定订单和库存数据', '促销活动会带来预测偏差']
    },
    {
        id: 'ZL202410026789.7',
        title: '一种多源数据驱动的城市内涝预警方法',
        inventorId: 'inv_008',
        field: '物联网',
        industry: '城市治理',
        summary: '融合雨量、管网水位和道路积水数据，对城市内涝风险进行分级预警。',
        keywords: ['城市治理', '内涝预警', '雨量监测', '管网水位', '物联网', '风险预警'],
        requireLicense: true,
        price: 3999,
        licensePrice: 3999,
        licenseTier: 'premium',
        risks: ['需要城市传感器覆盖', '预警结果需与应急处置流程联动']
    },
    {
        id: 'ZL202410027890.4',
        title: '一种新能源汽车充电站负荷预测与调度系统',
        inventorId: 'inv_002',
        field: '新能源',
        industry: '新能源汽车',
        summary: '预测充电站高峰负荷并优化充电调度，降低配电压力并提升车主排队体验。',
        keywords: ['新能源汽车', '充电站', '负荷预测', '调度优化', '电力负荷', '排队体验'],
        requireLicense: false,
        price: 0,
        licensePrice: 0,
        risks: ['需要接入充电订单和配电容量数据', '调度策略需避免影响用户体验']
    },
    {
        id: 'ZL202410028901.5',
        title: '一种电子病历结构化抽取与质控方法',
        inventorId: 'inv_001',
        field: '自然语言处理',
        industry: '医疗健康',
        summary: '从电子病历文本中抽取诊断、用药和检验指标，并进行病历质控和科研检索。',
        keywords: ['医疗健康', '电子病历', '自然语言处理', '结构化抽取', '病历质控', '科研检索'],
        requireLicense: true,
        price: 2999,
        licensePrice: 2999,
        licenseTier: 'standard',
        risks: ['需要医院数据脱敏', '不同科室病历模板差异较大']
    }
];

// 专利详情数据（包含价格和许可需求）
const patentDetails = {
    'ZL202410001234.5': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410005678.9': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410009012.3': { requireLicense: true, price: 2999, licensePrice: 2999, licenseTier: 'standard' },
    'ZL202410003456.7': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410007890.1': { requireLicense: true, price: 3999, licensePrice: 3999, licenseTier: 'premium' },
    'ZL202410002345.8': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410006666.2': { requireLicense: true, price: 1999, licensePrice: 1999, licenseTier: 'basic' },
    'ZL202410008888.6': { requireLicense: true, price: 2999, licensePrice: 2999, licenseTier: 'standard' },
    'ZL202410004321.0': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410010234.4': { requireLicense: true, price: 1999, licensePrice: 1999, licenseTier: 'basic' },
    'ZL202410011678.2': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410012345.6': { requireLicense: true, price: 2999, licensePrice: 2999, licenseTier: 'standard' },
    'ZL202410013210.9': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410014567.1': { requireLicense: true, price: 1999, licensePrice: 1999, licenseTier: 'basic' },
    'ZL202410015678.4': { requireLicense: true, price: 2999, licensePrice: 2999, licenseTier: 'standard' },
    'ZL202410016789.5': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410017890.2': { requireLicense: true, price: 1999, licensePrice: 1999, licenseTier: 'basic' },
    'ZL202410018901.8': { requireLicense: true, price: 2999, licensePrice: 2999, licenseTier: 'standard' },
    'ZL202410019012.0': { requireLicense: true, price: 3999, licensePrice: 3999, licenseTier: 'premium' },
    'ZL202410020123.7': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410021234.8': { requireLicense: true, price: 2999, licensePrice: 2999, licenseTier: 'standard' },
    'ZL202410022345.9': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410023456.0': { requireLicense: true, price: 1999, licensePrice: 1999, licenseTier: 'basic' },
    'ZL202410024567.3': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410025678.6': { requireLicense: true, price: 2999, licensePrice: 2999, licenseTier: 'standard' },
    'ZL202410026789.7': { requireLicense: true, price: 3999, licensePrice: 3999, licenseTier: 'premium' },
    'ZL202410027890.4': { requireLicense: false, price: 0, licensePrice: 0 },
    'ZL202410028901.5': { requireLicense: true, price: 2999, licensePrice: 2999, licenseTier: 'standard' }
};

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
