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
    shouldRenderPatentImage(patent) {
        if (!patent || patent.imageQuality === 'low') return false;
        const mediaUrl = String(patent.imageUrl || '');
        if (!/\.(png|jpg|jpeg|webp)(\?.*)?$/i.test(mediaUrl)) return false;
        const width = Number(patent.imageWidth || 0);
        const height = Number(patent.imageHeight || 0);
        if (width > 0 && height > 0) return width >= 240 && height >= 240;
        return true;
    },

    getSafePublicDocHref(url, patentId) {
        const value = String(url || '').trim();
        if (!value) return `patent-detail.html?id=${encodeURIComponent(patentId || '')}`;
        const isBlockedGooglePatentLink =
            /patents\.google\.com/i.test(value) ||
            /patentimages\.storage\.googleapis\.com/i.test(value) ||
            /googleapis\.com\/.*patent/i.test(value) ||
            /googleusercontent\.com\/.*patent/i.test(value);
        if (isBlockedGooglePatentLink) return `patent-detail.html?id=${encodeURIComponent(patentId || '')}`;
        return value;
    },

    createPatentMediaHtml(patent, variant = 'card') {
        const mediaUrl = patent.imageUrl || '';
        const alt = `${patent.publicationNumber || patent.id} \u4e13\u5229\u9644\u56fe`;
        if (this.shouldRenderPatentImage(patent)) {
            return `<img src="${this.escapeHtml(mediaUrl)}" alt="${this.escapeHtml(alt)}" class="patent-card__image patent-card__image--contain">`;
        }
        const href = this.getSafePublicDocHref(patent.pdfUrl || patent.sourceUrl, patent.id);
        const label = variant === 'detail' ? '\u4e13\u5229\u516c\u5f00\u6587\u672c / PDF' : '\u4e13\u5229\u516c\u5f00\u6587\u672c';
        return `
            <a class="patent-document-preview patent-document-preview--${this.escapeHtml(variant)}" href="${this.escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="\u6253\u5f00${this.escapeHtml(patent.publicationNumber || patent.id)}\u516c\u5f00\u6587\u672c">
                <span class="patent-document-preview__source">${label}</span>
                <strong>${this.escapeHtml(patent.publicationNumber || patent.id)}</strong>
                <small>${this.escapeHtml(patent.legalStatus || '\u6cd5\u5f8b\u72b6\u6001\u9700\u4e8c\u6b21\u6838\u9a8c')}</small>
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
                <span>${this.escapeHtml(patent.sourceName || '\u79d1\u7814\u4e4b\u53cb\u4e13\u5229\u5e93')}</span>
                <span>${this.escapeHtml(patent.leadInventor || inventor.name)}</span>
                <span>${this.escapeHtml(patent.assignee || inventor.affiliation || '')}</span>
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
                        <span class="patent-card__chat-label">问顾问</span>
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
        "id": "inv_001",
        "name": "李传富",
        "affiliation": "合肥综合性国家科学中心人工智能研究院",
        "affiliationTier": "national_institute",
        "expertise": [
            "医学影像AI",
            "读片知识图谱",
            "影像数据治理"
        ],
        "patentIds": [
            "CN115062165A",
            "CN115512810A",
            "CN114240935B"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22%E6%9D%8E%E4%BC%A0%E5%AF%8C%20%2F%20%E5%90%88%E8%82%A5%E7%BB%BC%E5%90%88%E6%80%A7%E5%9B%BD%E5%AE%B6%E7%A7%91%E5%AD%A6%E4%B8%AD%E5%BF%83%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%E7%A0%94%E7%A9%B6%E9%99%A2%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%232563eb%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba(255%2C255%2C255%2C0.24)%22%2F%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.42)%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3E%E6%9D%8E%3C%2Ftext%3E%3C%2Fsvg%3E"
    },
    {
        "id": "inv_002",
        "name": "汤进",
        "affiliation": "合肥综合性国家科学中心人工智能研究院",
        "affiliationTier": "national_institute",
        "expertise": [
            "医学报告生成",
            "影像报告标注",
            "医学NLP"
        ],
        "patentIds": [
            "CN115132314A",
            "CN114582470B"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22%E6%B1%A4%E8%BF%9B%20%2F%20%E5%90%88%E8%82%A5%E7%BB%BC%E5%90%88%E6%80%A7%E5%9B%BD%E5%AE%B6%E7%A7%91%E5%AD%A6%E4%B8%AD%E5%BF%83%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%E7%A0%94%E7%A9%B6%E9%99%A2%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%230f766e%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba(255%2C255%2C255%2C0.24)%22%2F%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.42)%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3E%E6%B1%A4%3C%2Ftext%3E%3C%2Fsvg%3E"
    },
    {
        "id": "inv_003",
        "name": "程勇",
        "affiliation": "深圳前海微众银行股份有限公司（微众银行）",
        "affiliationTier": "strong_company",
        "expertise": [
            "联邦学习",
            "隐私计算",
            "可信金融科技"
        ],
        "patentIds": [
            "CN110503207A",
            "CN110610242A",
            "CN110632554A"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22%E7%A8%8B%E5%8B%87%20%2F%20%E6%B7%B1%E5%9C%B3%E5%89%8D%E6%B5%B7%E5%BE%AE%E4%BC%97%E9%93%B6%E8%A1%8C%E8%82%A1%E4%BB%BD%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8%EF%BC%88%E5%BE%AE%E4%BC%97%E9%93%B6%E8%A1%8C%EF%BC%89%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%237c3aed%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba(255%2C255%2C255%2C0.24)%22%2F%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.42)%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3E%E7%A8%8B%3C%2Ftext%3E%3C%2Fsvg%3E"
    },
    {
        "id": "inv_004",
        "name": "冯旭宁",
        "affiliation": "清华大学",
        "affiliationTier": "top_university",
        "expertise": [
            "电池热失控",
            "锂离子电池安全",
            "电池材料"
        ],
        "patentIds": [
            "CN104346524A",
            "CN112029343A"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22%E5%86%AF%E6%97%AD%E5%AE%81%20%2F%20%E6%B8%85%E5%8D%8E%E5%A4%A7%E5%AD%A6%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%23dc2626%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba(255%2C255%2C255%2C0.24)%22%2F%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.42)%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3E%E5%86%AF%3C%2Ftext%3E%3C%2Fsvg%3E"
    },
    {
        "id": "inv_005",
        "name": "王昱",
        "affiliation": "清华大学",
        "affiliationTier": "top_university",
        "expertise": [
            "动力电池安全评价",
            "热失控抑制",
            "电池数据库"
        ],
        "patentIds": [
            "CN110109020A",
            "CN110045287A",
            "CN115051051A"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22%E7%8E%8B%E6%98%B1%20%2F%20%E6%B8%85%E5%8D%8E%E5%A4%A7%E5%AD%A6%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%23ea580c%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba(255%2C255%2C255%2C0.24)%22%2F%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.42)%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3E%E7%8E%8B%3C%2Ftext%3E%3C%2Fsvg%3E"
    },
    {
        "id": "inv_006",
        "name": "刘妹琴",
        "affiliation": "浙江大学",
        "affiliationTier": "top_university",
        "expertise": [
            "工业视觉",
            "缺陷检测",
            "小样本学习"
        ],
        "patentIds": [
            "CN119090851A",
            "CN114092389A",
            "CN113888477B"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22%E5%88%98%E5%A6%B9%E7%90%B4%20%2F%20%E6%B5%99%E6%B1%9F%E5%A4%A7%E5%AD%A6%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%230891b2%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba(255%2C255%2C255%2C0.24)%22%2F%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.42)%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3E%E5%88%98%3C%2Ftext%3E%3C%2Fsvg%3E"
    },
    {
        "id": "inv_007",
        "name": "康重庆",
        "affiliation": "清华大学",
        "affiliationTier": "top_university",
        "expertise": [
            "电力系统低碳化",
            "碳排放计量",
            "能源调度"
        ],
        "patentIds": [
            "CN105046353A",
            "CN106251095B"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22%E5%BA%B7%E9%87%8D%E5%BA%86%20%2F%20%E6%B8%85%E5%8D%8E%E5%A4%A7%E5%AD%A6%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%2316a34a%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba(255%2C255%2C255%2C0.24)%22%2F%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.42)%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3E%E5%BA%B7%3C%2Ftext%3E%3C%2Fsvg%3E"
    },
    {
        "id": "inv_008",
        "name": "常虹",
        "affiliation": "广东省农业科学院植物保护研究所",
        "affiliationTier": "research_institute",
        "expertise": [
            "农业虫害识别",
            "草地贪夜蛾预警",
            "虫情监测"
        ],
        "patentIds": [
            "CN114550108B",
            "CN114170513B"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22%E5%B8%B8%E8%99%B9%20%2F%20%E5%B9%BF%E4%B8%9C%E7%9C%81%E5%86%9C%E4%B8%9A%E7%A7%91%E5%AD%A6%E9%99%A2%E6%A4%8D%E7%89%A9%E4%BF%9D%E6%8A%A4%E7%A0%94%E7%A9%B6%E6%89%80%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%2365a30d%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba(255%2C255%2C255%2C0.24)%22%2F%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.42)%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3E%E5%B8%B8%3C%2Ftext%3E%3C%2Fsvg%3E"
    },
    {
        "id": "inv_009",
        "name": "吕华",
        "affiliation": "北京大学",
        "affiliationTier": "top_university",
        "expertise": [
            "蛋白质偶联",
            "聚氨基酸材料",
            "生物医药材料"
        ],
        "patentIds": [
            "CN106924753A",
            "CN111388679A",
            "CN106924752B"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22%E5%90%95%E5%8D%8E%20%2F%20%E5%8C%97%E4%BA%AC%E5%A4%A7%E5%AD%A6%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%23be123c%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba(255%2C255%2C255%2C0.24)%22%2F%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.42)%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3E%E5%90%95%3C%2Ftext%3E%3C%2Fsvg%3E"
    },
    {
        "id": "inv_010",
        "name": "王潇楠",
        "affiliation": "广东省农业科学院植物保护研究所",
        "affiliationTier": "research_institute",
        "expertise": [
            "植保无人机",
            "纳米农药施药",
            "精准喷雾"
        ],
        "patentIds": [
            "CN115316172A",
            "CN116171962B"
        ],
        "avatar": "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20role%3D%22img%22%20aria-label%3D%22%E7%8E%8B%E6%BD%87%E6%A5%A0%20%2F%20%E5%B9%BF%E4%B8%9C%E7%9C%81%E5%86%9C%E4%B8%9A%E7%A7%91%E5%AD%A6%E9%99%A2%E6%A4%8D%E7%89%A9%E4%BF%9D%E6%8A%A4%E7%A0%94%E7%A9%B6%E6%89%80%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20rx%3D%2218%22%20fill%3D%22%23047857%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%2224%22%20r%3D%2212%22%20fill%3D%22rgba(255%2C255%2C255%2C0.24)%22%2F%3E%3Cpath%20d%3D%22M18%2068h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.42)%22%20stroke-width%3D%224%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%2248%22%20y%3D%2256%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20fill%3D%22%23fff%22%3E%E7%8E%8B%3C%2Ftext%3E%3C%2Fsvg%3E"
    }
];

const patents = [
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN115062165A",
        "sourceUrl": "https://patents.google.com/patent/CN115062165A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": false,
        "licenseTier": "free",
        "licensePrice": 0,
        "id": "CN115062165A",
        "title": "基于读片知识图谱的医学影像诊断方法及装置",
        "inventorId": "inv_001",
        "imageUrl": "assets/patents/CN115062165A.png",
        "pdfUrl": "https://patentimages.storage.googleapis.com/f9/00/69/8b7371d67497cb/CN115062165A.pdf",
        "inventors": [
            "李传富",
            "谷宗运",
            "黄莉莉",
            "赵海峰",
            "汤进"
        ],
        "leadInventor": "李传富",
        "assignee": "合肥综合性国家科学中心人工智能研究院",
        "applicationNumber": "CN202210995624.6A",
        "priorityDate": "2022-08-18",
        "filingDate": "2022-08-18",
        "publicationDate": "2022-09-16",
        "legalStatus": "Granted / Active",
        "field": "医学影像AI",
        "industry": "医疗健康",
        "commercialFit": "trial",
        "trialAccess": true,
        "price": 0,
        "summary": "围绕医学影像读片知识图谱，将影像特征、诊断规则和报告线索组织成可检索的推理路径，适合基层影像辅助诊断和质控场景。",
        "keywords": [
            "医学影像",
            "读片知识图谱",
            "诊断",
            "辅助诊断",
            "医疗AI",
            "基层医院"
        ],
        "tags": [
            "medical-ai",
            "knowledge-graph"
        ],
        "risks": [
            "需要本地病种和影像设备数据二次验证",
            "临床使用前需要合规和伦理审查"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN115512810A",
        "sourceUrl": "https://patents.google.com/patent/CN115512810A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN115512810A",
        "title": "一种医学影像数据的数据治理方法及系统",
        "inventorId": "inv_001",
        "imageUrl": "assets/patents/CN115512810A.png",
        "pdfUrl": "https://patents.google.com/patent/CN115512810A/zh",
        "inventors": [
            "李传富",
            "谷宗运",
            "汤进"
        ],
        "leadInventor": "李传富",
        "assignee": "合肥综合性国家科学中心人工智能研究院",
        "applicationNumber": "CN202211463754.1A",
        "priorityDate": "2022-11-17",
        "filingDate": "2022-11-17",
        "publicationDate": "2022-12-23",
        "legalStatus": "Pending",
        "field": "医学数据治理",
        "industry": "医疗健康",
        "commercialFit": "high",
        "price": 3999,
        "summary": "面向医学影像数据接入、清洗、标注和质量管理，建立可追踪的数据治理流程，为影像AI训练和医院数据资产化提供底座。",
        "keywords": [
            "医学影像",
            "数据治理",
            "标注",
            "质量控制",
            "医疗AI",
            "数据资产"
        ],
        "tags": [
            "medical-data",
            "data-governance"
        ],
        "risks": [
            "落地依赖医院数据标准化程度",
            "需要处理隐私和数据授权边界"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN114240935B",
        "sourceUrl": "https://patents.google.com/patent/CN114240935B/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN114240935B",
        "title": "一种空频域特征融合的医学影像特征识别方法及装置",
        "inventorId": "inv_001",
        "imageUrl": "assets/patents/CN114240935B.png",
        "pdfUrl": "https://patents.google.com/patent/CN114240935B/zh",
        "inventors": [
            "李传富",
            "谷宗运",
            "汤进"
        ],
        "leadInventor": "李传富",
        "assignee": "合肥综合性国家科学中心人工智能研究院",
        "applicationNumber": "CN202210166385.3A",
        "priorityDate": "2022-02-24",
        "filingDate": "2022-02-24",
        "publicationDate": "2022-05-20",
        "legalStatus": "Active",
        "field": "医学影像识别",
        "industry": "医疗健康",
        "commercialFit": "high",
        "price": 3999,
        "summary": "融合空间域与频域特征进行医学影像识别，适合提升病灶特征表达、跨设备鲁棒性和模型可解释性的影像AI产品。",
        "keywords": [
            "医学影像",
            "空频域融合",
            "特征识别",
            "病灶识别",
            "模型鲁棒性"
        ],
        "tags": [
            "medical-ai",
            "feature-fusion"
        ],
        "risks": [
            "需要在目标设备和目标病种上复测",
            "频域特征解释需要临床专家参与"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN115132314A",
        "sourceUrl": "https://patents.google.com/patent/CN115132314A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN115132314A",
        "title": "检查印象生成模型训练方法、装置及生成方法",
        "inventorId": "inv_002",
        "imageUrl": "assets/patents/CN115132314A.png",
        "pdfUrl": "https://patents.google.com/patent/CN115132314A/zh",
        "inventors": [
            "汤进",
            "李传富",
            "谷宗运"
        ],
        "leadInventor": "汤进",
        "assignee": "合肥综合性国家科学中心人工智能研究院",
        "applicationNumber": "CN202211059675.4A",
        "priorityDate": "2022-09-01",
        "filingDate": "2022-09-01",
        "publicationDate": "2022-09-30",
        "legalStatus": "Active",
        "field": "医学报告生成",
        "industry": "医疗健康",
        "commercialFit": "high",
        "price": 3999,
        "summary": "训练检查印象生成模型，把检查所见转化为结构化印象描述，适合影像报告自动草拟、质控和医生工作流提效。",
        "keywords": [
            "医学报告",
            "检查印象",
            "自然语言生成",
            "影像报告",
            "医疗NLP"
        ],
        "tags": [
            "medical-nlp",
            "report-generation"
        ],
        "risks": [
            "生成内容需医生复核",
            "不同医院报告模板需要适配"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN114582470B",
        "sourceUrl": "https://patents.google.com/patent/CN114582470B/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN114582470B",
        "title": "一种模型的训练方法、训练装置及医学影像报告标注方法",
        "inventorId": "inv_002",
        "imageUrl": "assets/patents/CN114582470B.png",
        "pdfUrl": "https://patentimages.storage.googleapis.com/15/2b/89/960e7445f77dfb/CN114582470B.pdf",
        "inventors": [
            "汤进",
            "李传富",
            "谷宗运"
        ],
        "leadInventor": "汤进",
        "assignee": "合肥综合性国家科学中心人工智能研究院",
        "applicationNumber": "CN202210463888.7A",
        "priorityDate": "2022-04-29",
        "filingDate": "2022-04-29",
        "publicationDate": "2022-09-09",
        "legalStatus": "Active",
        "field": "医学影像报告标注",
        "industry": "医疗健康",
        "commercialFit": "high",
        "price": 3999,
        "summary": "面向医学影像报告标注和模型训练，提取报告文本中的诊断线索，降低人工标注成本并提高训练样本一致性。",
        "keywords": [
            "医学影像报告",
            "标注",
            "模型训练",
            "医疗NLP",
            "影像AI"
        ],
        "tags": [
            "medical-nlp",
            "annotation"
        ],
        "risks": [
            "标注规则需与医院质控标准对齐",
            "需要持续抽检样本质量"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN110503207A",
        "sourceUrl": "https://patents.google.com/patent/CN110503207A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "standard",
        "licensePrice": 2999,
        "id": "CN110503207A",
        "title": "联邦学习信用管理方法、装置、设备及可读存储介质",
        "inventorId": "inv_003",
        "imageUrl": "assets/patents/CN110503207A.png",
        "pdfUrl": "https://patentimages.storage.googleapis.com/4d/89/90/e7b6d750075549/CN110503207A.pdf",
        "inventors": [
            "程勇",
            "范力欣",
            "李斌"
        ],
        "leadInventor": "程勇",
        "assignee": "深圳前海微众银行股份有限公司（微众银行）",
        "applicationNumber": "CN201910802526.4A",
        "priorityDate": "2019-08-28",
        "filingDate": "2019-08-28",
        "publicationDate": "2019-11-26",
        "legalStatus": "Pending",
        "field": "联邦学习信用管理",
        "industry": "金融科技",
        "commercialFit": "standard",
        "price": 2999,
        "summary": "在多方数据不出域的前提下构建信用管理与模型协同机制，适合金融风控、联合建模和隐私保护数据合作。",
        "keywords": [
            "联邦学习",
            "信用管理",
            "隐私计算",
            "金融风控",
            "多方建模"
        ],
        "tags": [
            "federated-learning",
            "privacy-computing"
        ],
        "risks": [
            "需要参与方数据口径统一",
            "合规审计和模型安全成本较高"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN110610242A",
        "sourceUrl": "https://patents.google.com/patent/CN110610242A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "standard",
        "licensePrice": 2999,
        "id": "CN110610242A",
        "title": "一种联邦学习中参与者权重的设置方法及装置",
        "inventorId": "inv_003",
        "imageUrl": "assets/patents/CN110610242A.png",
        "pdfUrl": "https://patentimages.storage.googleapis.com/5a/e6/07/bf2f446997e74b/CN110610242A.pdf",
        "inventors": [
            "程勇",
            "刘晓勇"
        ],
        "leadInventor": "程勇",
        "assignee": "深圳前海微众银行股份有限公司（微众银行）",
        "applicationNumber": "CN201910823635.4A",
        "priorityDate": "2019-09-02",
        "filingDate": "2019-09-02",
        "publicationDate": "2019-12-24",
        "legalStatus": "Active",
        "field": "联邦学习权重设置",
        "industry": "隐私计算",
        "commercialFit": "standard",
        "price": 2999,
        "summary": "根据参与者贡献和数据表现调整联邦学习权重，改善多机构协同训练中的公平性、稳定性和模型效果。",
        "keywords": [
            "联邦学习",
            "参与者权重",
            "贡献评估",
            "隐私计算",
            "模型训练"
        ],
        "tags": [
            "federated-learning",
            "model-training"
        ],
        "risks": [
            "权重机制需要防止策略操纵",
            "跨机构评估指标需提前约定"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN110632554A",
        "sourceUrl": "https://patents.google.com/patent/CN110632554A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "basic",
        "licensePrice": 1999,
        "id": "CN110632554A",
        "title": "基于联邦学习的室内定位方法、装置、终端设备及介质",
        "inventorId": "inv_003",
        "imageUrl": "assets/patents/CN110632554A.png",
        "pdfUrl": "https://patents.google.com/patent/CN110632554A/zh",
        "inventors": [
            "程勇",
            "张伟"
        ],
        "leadInventor": "程勇",
        "assignee": "深圳前海微众银行股份有限公司（微众银行）",
        "applicationNumber": "CN201910898051.3A",
        "priorityDate": "2019-09-20",
        "filingDate": "2019-09-20",
        "publicationDate": "2019-12-31",
        "legalStatus": "Pending",
        "field": "联邦学习定位",
        "industry": "金融科技",
        "commercialFit": "narrow",
        "price": 1999,
        "summary": "把联邦学习用于室内定位模型训练，使终端或场地数据保持本地化，适合金融网点、园区和隐私敏感定位场景。",
        "keywords": [
            "联邦学习",
            "室内定位",
            "终端设备",
            "隐私保护",
            "园区定位"
        ],
        "tags": [
            "federated-learning",
            "indoor-positioning"
        ],
        "risks": [
            "商业场景较窄",
            "终端采样一致性会影响定位质量"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN104346524A",
        "sourceUrl": "https://patents.google.com/patent/CN104346524A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "basic",
        "licensePrice": 1999,
        "id": "CN104346524A",
        "title": "一种锂离子电池热失控的建模方法",
        "inventorId": "inv_004",
        "imageUrl": "assets/patents/CN104346524A.png",
        "pdfUrl": "https://patents.google.com/patent/CN104346524A/zh",
        "inventors": [
            "冯旭宁",
            "欧阳明高",
            "何向明"
        ],
        "leadInventor": "冯旭宁",
        "assignee": "清华大学; 宝马（中国）服务有限公司",
        "applicationNumber": "CN201410470610.8A",
        "priorityDate": "2014-09-16",
        "filingDate": "2014-09-16",
        "publicationDate": "2015-02-11",
        "legalStatus": "Active",
        "field": "电池热失控建模",
        "industry": "新能源车",
        "commercialFit": "narrow",
        "price": 1999,
        "summary": "构建锂离子电池热失控模型，用于评估失效触发、热传播和安全边界，适合动力电池安全仿真与测试方案设计。",
        "keywords": [
            "锂离子电池",
            "热失控",
            "建模",
            "电池安全",
            "新能源汽车"
        ],
        "tags": [
            "battery-safety",
            "thermal-runaway"
        ],
        "risks": [
            "较早期专利需要结合新电芯体系更新参数",
            "工程落地依赖测试数据校准"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN112029343A",
        "sourceUrl": "https://patents.google.com/patent/CN112029343A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "basic",
        "licensePrice": 1999,
        "id": "CN112029343A",
        "title": "用于抑制锂离子电池热失控的涂料、涂层、正极片、负极片、隔膜和锂离子电池",
        "inventorId": "inv_004",
        "imageUrl": "assets/patents/CN112029343A.png",
        "pdfUrl": "https://patentimages.storage.googleapis.com/38/42/df/8b076c003cf811/CN112029343A.pdf",
        "inventors": [
            "冯旭宁",
            "王莉",
            "何向明",
            "欧阳明高",
            "任东生"
        ],
        "leadInventor": "冯旭宁",
        "assignee": "清华大学",
        "applicationNumber": "CN202010690608.7A",
        "priorityDate": "2020-07-17",
        "filingDate": "2020-07-17",
        "publicationDate": "2020-12-04",
        "legalStatus": "Withdrawn",
        "field": "电池热失控抑制材料",
        "industry": "新能源车",
        "commercialFit": "narrow",
        "price": 1999,
        "summary": "通过壳核结构抑制剂颗粒和涂层材料，在热失控触发前释放抑制组分，面向电芯材料层面的安全提升。",
        "keywords": [
            "锂离子电池",
            "热失控",
            "涂层",
            "隔膜",
            "电池安全"
        ],
        "tags": [
            "battery-safety",
            "materials"
        ],
        "risks": [
            "科研之友专利库 显示为撤回状态",
            "材料体系需要重新验证产业化可行性"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN110109020A",
        "sourceUrl": "https://patents.google.com/patent/CN110109020A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN110109020A",
        "title": "数据库驱动的动力电池热失控安全性正向评价方法及装置",
        "inventorId": "inv_005",
        "imageUrl": "assets/patents/CN110109020A.png",
        "pdfUrl": "https://patents.google.com/patent/CN110109020A/zh",
        "inventors": [
            "王昱",
            "冯旭宁",
            "欧阳明高"
        ],
        "leadInventor": "王昱",
        "assignee": "清华大学",
        "applicationNumber": "CN201910260025.8A",
        "priorityDate": "2019-04-02",
        "filingDate": "2019-04-02",
        "publicationDate": "2019-08-09",
        "legalStatus": "Active",
        "field": "动力电池安全评价",
        "industry": "新能源车",
        "commercialFit": "high",
        "price": 3999,
        "summary": "以数据库驱动的方式对动力电池热失控安全性进行正向评价，适合电池包设计、测试筛选和安全认证前评估。",
        "keywords": [
            "动力电池",
            "热失控",
            "安全评价",
            "数据库",
            "新能源汽车"
        ],
        "tags": [
            "battery-safety",
            "evaluation"
        ],
        "risks": [
            "数据库覆盖度决定评价可信度",
            "需要结合企业自有测试标准"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN110045287A",
        "sourceUrl": "https://patents.google.com/patent/CN110045287A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "standard",
        "licensePrice": 2999,
        "id": "CN110045287A",
        "title": "动力电池热失控安全性的定量评价方法及系统",
        "inventorId": "inv_005",
        "imageUrl": "assets/patents/CN110045287A.png",
        "pdfUrl": "https://patents.google.com/patent/CN110045287A/zh",
        "inventors": [
            "王昱",
            "冯旭宁",
            "欧阳明高"
        ],
        "leadInventor": "王昱",
        "assignee": "清华大学",
        "applicationNumber": "CN201910259977.8A",
        "priorityDate": "2019-04-02",
        "filingDate": "2019-04-02",
        "publicationDate": "2019-07-23",
        "legalStatus": "Pending",
        "field": "电池热失控量化评价",
        "industry": "新能源车",
        "commercialFit": "standard",
        "price": 2999,
        "summary": "提供动力电池热失控安全性的量化评价框架，帮助企业把测试指标转为可比较的安全等级和改进方向。",
        "keywords": [
            "动力电池",
            "热失控",
            "定量评价",
            "安全等级",
            "电池测试"
        ],
        "tags": [
            "battery-safety",
            "quantitative-evaluation"
        ],
        "risks": [
            "量化模型需结合目标电芯体系校准",
            "评价结果不等同监管认证"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN115051051A",
        "sourceUrl": "https://patents.google.com/patent/CN115051051A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN115051051A",
        "title": "电池热失控的抑制方法、系统、装置和计算机设备",
        "inventorId": "inv_005",
        "imageUrl": "assets/patents/CN115051051A.png",
        "pdfUrl": "https://patents.google.com/patent/CN115051051A/zh",
        "inventors": [
            "王昱",
            "冯旭宁",
            "欧阳明高"
        ],
        "leadInventor": "王昱",
        "assignee": "清华大学",
        "applicationNumber": "CN202210465821.7A",
        "priorityDate": "2022-04-29",
        "filingDate": "2022-04-29",
        "publicationDate": "2022-09-13",
        "legalStatus": "Active",
        "field": "电池热失控抑制系统",
        "industry": "新能源车",
        "commercialFit": "high",
        "price": 3999,
        "summary": "围绕电池热失控检测、判别和抑制动作建立方法与系统，适合电池管理系统安全策略和预警处置方案。",
        "keywords": [
            "电池热失控",
            "抑制方法",
            "电池管理系统",
            "安全预警",
            "新能源汽车"
        ],
        "tags": [
            "battery-safety",
            "bms"
        ],
        "risks": [
            "需要与BMS硬件和传感器能力适配",
            "车规落地需长周期验证"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN119090851A",
        "sourceUrl": "https://patents.google.com/patent/CN119090851A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN119090851A",
        "title": "一种MiniLED缺陷检测方法、电子设备、介质",
        "inventorId": "inv_006",
        "imageUrl": "assets/patents/CN119090851A.png",
        "pdfUrl": "https://patents.google.com/patent/CN119090851A/zh",
        "inventors": [
            "刘妹琴",
            "李晓明"
        ],
        "leadInventor": "刘妹琴",
        "assignee": "浙江大学",
        "applicationNumber": "CN202411220178.7A",
        "priorityDate": "2024-09-02",
        "filingDate": "2024-09-02",
        "publicationDate": "2024-12-06",
        "legalStatus": "Active",
        "field": "工业视觉缺陷检测",
        "industry": "先进制造",
        "commercialFit": "high",
        "price": 3999,
        "summary": "面向 MiniLED 生产环节的缺陷检测，通过视觉模型识别微小缺陷，适合显示面板、精密电子和产线质检。",
        "keywords": [
            "MiniLED",
            "缺陷检测",
            "工业视觉",
            "电子设备",
            "产线质检"
        ],
        "tags": [
            "industrial-vision",
            "defect-detection"
        ],
        "risks": [
            "需采集目标产线样本微调",
            "光照和拍摄条件会影响检测效果"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN114092389A",
        "sourceUrl": "https://patents.google.com/patent/CN114092389A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "standard",
        "licensePrice": 2999,
        "id": "CN114092389A",
        "title": "一种基于小样本学习的玻璃面板表面缺陷检测方法",
        "inventorId": "inv_006",
        "imageUrl": "assets/patents/CN114092389A.png",
        "pdfUrl": "https://patents.google.com/patent/CN114092389A/zh",
        "inventors": [
            "刘妹琴",
            "李晓明"
        ],
        "leadInventor": "刘妹琴",
        "assignee": "浙江大学",
        "applicationNumber": "CN202111068447.9A",
        "priorityDate": "2021-09-13",
        "filingDate": "2021-09-13",
        "publicationDate": "2022-02-25",
        "legalStatus": "Active",
        "field": "玻璃面板缺陷检测",
        "industry": "先进制造",
        "commercialFit": "standard",
        "price": 2999,
        "summary": "利用小样本学习降低玻璃面板缺陷数据采集成本，适合缺陷样本稀缺、型号频繁切换的制造质检场景。",
        "keywords": [
            "小样本学习",
            "玻璃面板",
            "表面缺陷",
            "缺陷检测",
            "工业视觉"
        ],
        "tags": [
            "industrial-vision",
            "few-shot-learning"
        ],
        "risks": [
            "小样本能力需要对新缺陷类型持续验证",
            "上线前需打通相机和MES数据链路"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN113888477B",
        "sourceUrl": "https://patents.google.com/patent/CN113888477B/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN113888477B",
        "title": "网络模型的训练方法、金属表面缺陷检测方法及电子设备",
        "inventorId": "inv_006",
        "imageUrl": "assets/patents/CN113888477B.png",
        "pdfUrl": "https://patents.google.com/patent/CN113888477B/zh",
        "inventors": [
            "刘妹琴",
            "李晓明"
        ],
        "leadInventor": "刘妹琴",
        "assignee": "浙江大学",
        "applicationNumber": "CN202111068474.6A",
        "priorityDate": "2021-09-13",
        "filingDate": "2021-09-13",
        "publicationDate": "2024-12-31",
        "legalStatus": "Active",
        "field": "金属表面缺陷检测",
        "industry": "先进制造",
        "commercialFit": "high",
        "price": 3999,
        "summary": "训练网络模型识别金属表面缺陷，覆盖材料加工、装备制造和自动化检测线，强调模型训练与电子设备部署。",
        "keywords": [
            "金属表面",
            "缺陷检测",
            "网络模型",
            "工业视觉",
            "电子设备"
        ],
        "tags": [
            "industrial-vision",
            "metal-defect"
        ],
        "risks": [
            "不同材料纹理差异较大",
            "需要对误检漏检成本做产线评估"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN105046353A",
        "sourceUrl": "https://patents.google.com/patent/CN105046353A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "basic",
        "licensePrice": 1999,
        "id": "CN105046353A",
        "title": "一种电力系统低碳化水平的评价方法",
        "inventorId": "inv_007",
        "imageUrl": "assets/patents/CN105046353A.png",
        "pdfUrl": "https://patents.google.com/patent/CN105046353A/zh",
        "inventors": [
            "康重庆",
            "周天睿",
            "夏清"
        ],
        "leadInventor": "康重庆",
        "assignee": "清华大学; 国家电网有限公司",
        "applicationNumber": "CN201510390459.1A",
        "priorityDate": "2015-07-06",
        "filingDate": "2015-07-06",
        "publicationDate": "2015-11-11",
        "legalStatus": "Expired - Fee Related",
        "field": "电力系统低碳评价",
        "industry": "能源环保",
        "commercialFit": "narrow",
        "price": 1999,
        "summary": "从发电、输配和用电侧指标评价电力系统低碳化水平，适合园区能源诊断、低碳改造和指标体系建设。",
        "keywords": [
            "电力系统",
            "低碳化",
            "评价方法",
            "碳排放",
            "能源环保"
        ],
        "tags": [
            "carbon-accounting",
            "power-system"
        ],
        "risks": [
            "法律状态显示费用相关失效",
            "指标体系需要对接最新碳核算规则"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN106251095B",
        "sourceUrl": "https://patents.google.com/patent/CN106251095B/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN106251095B",
        "title": "一种电力系统碳排放实时计量的方法及碳表系统",
        "inventorId": "inv_007",
        "imageUrl": "assets/patents/CN106251095B.png",
        "pdfUrl": "https://patents.google.com/patent/CN106251095B/zh",
        "inventors": [
            "康重庆",
            "周天睿",
            "夏清"
        ],
        "leadInventor": "康重庆",
        "assignee": "清华大学",
        "applicationNumber": "CN201610805076.0A",
        "priorityDate": "2016-09-06",
        "filingDate": "2016-09-06",
        "publicationDate": "2018-08-17",
        "legalStatus": "Active",
        "field": "电力碳排放实时计量",
        "industry": "能源环保",
        "commercialFit": "high",
        "price": 3999,
        "summary": "建立电力系统碳排放实时计量和碳表系统，为园区、企业和电网侧提供动态碳核算与低碳调度依据。",
        "keywords": [
            "电力系统",
            "碳排放",
            "实时计量",
            "碳表",
            "低碳调度"
        ],
        "tags": [
            "carbon-accounting",
            "energy-management"
        ],
        "risks": [
            "需要接入实时电力数据",
            "碳因子更新和地方规则需维护"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN114550108B",
        "sourceUrl": "https://patents.google.com/patent/CN114550108B/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": false,
        "licenseTier": "free",
        "licensePrice": 0,
        "id": "CN114550108B",
        "title": "一种草地贪夜蛾的识别预警方法及系统",
        "inventorId": "inv_008",
        "imageUrl": "assets/patents/CN114550108B.png",
        "pdfUrl": "https://patents.google.com/patent/CN114550108B/zh",
        "inventors": [
            "常虹",
            "王潇楠",
            "李振宇"
        ],
        "leadInventor": "常虹",
        "assignee": "广东省农业科学院植物保护研究所",
        "applicationNumber": "CN202210443122.2A",
        "priorityDate": "2022-04-26",
        "filingDate": "2022-04-26",
        "publicationDate": "2022-07-08",
        "legalStatus": "Active",
        "field": "农业虫害识别预警",
        "industry": "农业科技",
        "commercialFit": "trial",
        "trialAccess": true,
        "price": 0,
        "summary": "针对草地贪夜蛾建立识别和预警流程，适合农业物联网监测、县域植保服务和病虫害早期响应。",
        "keywords": [
            "草地贪夜蛾",
            "识别预警",
            "虫害监测",
            "农业AI",
            "植保"
        ],
        "tags": [
            "agriculture-ai",
            "pest-warning"
        ],
        "risks": [
            "虫害样本地域差异需要复核",
            "预警闭环依赖基层植保响应能力"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN114170513B",
        "sourceUrl": "https://patents.google.com/patent/CN114170513B/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "standard",
        "licensePrice": 2999,
        "id": "CN114170513B",
        "title": "一种草地贪夜蛾的虫情监测方法、系统及存储介质",
        "inventorId": "inv_008",
        "imageUrl": "assets/patents/CN114170513B.png",
        "pdfUrl": "https://patents.google.com/patent/CN114170513B/zh",
        "inventors": [
            "常虹",
            "王潇楠",
            "李振宇"
        ],
        "leadInventor": "常虹",
        "assignee": "广东省农业科学院植物保护研究所",
        "applicationNumber": "CN202111489231.XA",
        "priorityDate": "2021-12-08",
        "filingDate": "2021-12-08",
        "publicationDate": "2022-03-11",
        "legalStatus": "Active",
        "field": "虫情监测系统",
        "industry": "农业科技",
        "commercialFit": "standard",
        "price": 2999,
        "summary": "通过虫情监测方法和系统采集、识别、统计草地贪夜蛾发生态势，为区域化防控和精准施药提供依据。",
        "keywords": [
            "草地贪夜蛾",
            "虫情监测",
            "农业物联网",
            "病虫害",
            "精准防控"
        ],
        "tags": [
            "agriculture-ai",
            "monitoring"
        ],
        "risks": [
            "设备布点和维护成本需要测算",
            "模型需要覆盖不同生长期和光照环境"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN106924753A",
        "sourceUrl": "https://patents.google.com/patent/CN106924753A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN106924753A",
        "title": "制备蛋白质-聚氨基酸环状偶联物的方法",
        "inventorId": "inv_009",
        "imageUrl": "assets/patents/CN106924753A.png",
        "pdfUrl": "https://patents.google.com/patent/CN106924753A/zh",
        "inventors": [
            "吕华",
            "王成"
        ],
        "leadInventor": "吕华",
        "assignee": "北京大学",
        "applicationNumber": "CN201611247250.0A",
        "priorityDate": "2015-12-30",
        "filingDate": "2016-12-29",
        "publicationDate": "2017-07-07",
        "legalStatus": "Active",
        "field": "蛋白质偶联材料",
        "industry": "生物医药",
        "commercialFit": "high",
        "price": 3999,
        "summary": "提供蛋白质-聚氨基酸环状偶联物制备方法，用于改善蛋白质药物稳定性、递送性能和生物材料功能化。",
        "keywords": [
            "蛋白质",
            "聚氨基酸",
            "偶联物",
            "生物医药",
            "蛋白质药物"
        ],
        "tags": [
            "biomedicine",
            "protein-conjugate"
        ],
        "risks": [
            "从材料制备到药物开发仍需长周期验证",
            "适应症和产业路线需进一步筛选"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN111388679A",
        "sourceUrl": "https://patents.google.com/patent/CN111388679A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN111388679A",
        "title": "蛋白质-螺旋聚氨基酸偶联物、其制备方法及用途",
        "inventorId": "inv_009",
        "imageUrl": "assets/patents/CN111388679A.png",
        "pdfUrl": "https://patents.google.com/patent/CN111388679A/zh",
        "inventors": [
            "吕华",
            "王成"
        ],
        "leadInventor": "吕华",
        "assignee": "北京大学",
        "applicationNumber": "CN201911391425.9A",
        "priorityDate": "2019-01-03",
        "filingDate": "2019-12-30",
        "publicationDate": "2020-07-10",
        "legalStatus": "Pending",
        "field": "蛋白质药物修饰",
        "industry": "生物医药",
        "commercialFit": "high",
        "price": 3999,
        "summary": "利用螺旋聚氨基酸与蛋白质构建偶联物，面向蛋白质药物修饰、功能材料和药物递送体系开发。",
        "keywords": [
            "蛋白质",
            "螺旋聚氨基酸",
            "偶联",
            "药物递送",
            "生物材料"
        ],
        "tags": [
            "biomedicine",
            "drug-delivery"
        ],
        "risks": [
            "实验室制备向规模化转化需验证",
            "药物用途需要单独临床和注册路径"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN106924752B",
        "sourceUrl": "https://patents.google.com/patent/CN106924752B/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "premium",
        "licensePrice": 3999,
        "id": "CN106924752B",
        "title": "制备蛋白质-聚氨基酸偶联物的方法",
        "inventorId": "inv_009",
        "imageUrl": "assets/patents/CN106924752B.png",
        "pdfUrl": "https://patents.google.com/patent/CN106924752B/zh",
        "inventors": [
            "吕华",
            "王成"
        ],
        "leadInventor": "吕华",
        "assignee": "北京大学",
        "applicationNumber": "CN201611244996.6A",
        "priorityDate": "2015-12-30",
        "filingDate": "2016-12-29",
        "publicationDate": "2019-07-19",
        "legalStatus": "Active",
        "field": "蛋白质偶联制备",
        "industry": "生物医药",
        "commercialFit": "high",
        "price": 3999,
        "summary": "围绕蛋白质-聚氨基酸偶联物的可控制备，支持蛋白质稳定化、半衰期改善和新型生物材料构建。",
        "keywords": [
            "蛋白质",
            "聚氨基酸",
            "偶联物",
            "制备方法",
            "生物医药"
        ],
        "tags": [
            "biomedicine",
            "protein-engineering"
        ],
        "risks": [
            "需要补充具体蛋白对象的实验数据",
            "转化价值取决于下游适应症选择"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN115316172A",
        "sourceUrl": "https://patents.google.com/patent/CN115316172A/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "standard",
        "licensePrice": 2999,
        "id": "CN115316172A",
        "title": "一种基于植保无人机的纳米农药施药方法及系统",
        "inventorId": "inv_010",
        "imageUrl": "assets/patents/CN115316172A.png",
        "pdfUrl": "https://patents.google.com/patent/CN115316172A/zh",
        "inventors": [
            "王潇楠",
            "常虹",
            "陈炳旭"
        ],
        "leadInventor": "王潇楠",
        "assignee": "广东省农业科学院植物保护研究所",
        "applicationNumber": "CN202210981520.3A",
        "priorityDate": "2022-08-16",
        "filingDate": "2022-08-16",
        "publicationDate": "2022-11-11",
        "legalStatus": "Pending",
        "field": "植保无人机施药",
        "industry": "农业科技",
        "commercialFit": "standard",
        "price": 2999,
        "summary": "把植保无人机与纳米农药施药流程结合，服务精准喷施、药剂减量和大田病虫害防治场景。",
        "keywords": [
            "植保无人机",
            "纳米农药",
            "施药方法",
            "精准农业",
            "病虫害防治"
        ],
        "tags": [
            "agriculture-ai",
            "uav-spraying"
        ],
        "risks": [
            "需根据作物和药剂登记要求核验",
            "飞防作业受天气和地形影响"
        ]
    },
    {
        "sourceName": "科研之友专利库",
        "publicationNumber": "CN116171962B",
        "sourceUrl": "https://patents.google.com/patent/CN116171962B/zh",
        "statusNote": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "sourceCaveat": "科研之友专利库 公开页面参考；法律状态、权利边界、权属信息和可实施性均需二次核验，本原型不构成法律许可结论。",
        "type": "发明专利",
        "requireLicense": true,
        "licenseTier": "standard",
        "licensePrice": 2999,
        "id": "CN116171962B",
        "title": "一种植保无人机的高效对靶喷雾调控方法及系统",
        "inventorId": "inv_010",
        "imageUrl": "assets/patents/CN116171962B.png",
        "pdfUrl": "https://patents.google.com/patent/CN116171962B/zh",
        "inventors": [
            "王潇楠",
            "常虹",
            "陈炳旭"
        ],
        "leadInventor": "王潇楠",
        "assignee": "广东省农业科学院植物保护研究所",
        "applicationNumber": "CN202310134653.6A",
        "priorityDate": "2023-02-20",
        "filingDate": "2023-02-20",
        "publicationDate": "2024-03-01",
        "legalStatus": "Active",
        "field": "无人机对靶喷雾",
        "industry": "农业科技",
        "commercialFit": "standard",
        "price": 2999,
        "summary": "通过对靶喷雾调控提高植保无人机施药效率和命中率，适合精准农业、农药减量和规模化飞防服务。",
        "keywords": [
            "植保无人机",
            "对靶喷雾",
            "喷雾调控",
            "精准施药",
            "农业科技"
        ],
        "tags": [
            "agriculture-ai",
            "precision-spraying"
        ],
        "risks": [
            "需要与无人机硬件和喷头型号适配",
            "规模化作业需评估维护和培训成本"
        ]
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

const patentImageMetaById = {
    CN115062165A: { imageWidth: 124, imageHeight: 120, imageQuality: 'low' },
    CN115512810A: { imageWidth: 155, imageHeight: 120, imageQuality: 'low' },
    CN114240935B: { imageWidth: 73, imageHeight: 120, imageQuality: 'low' },
    CN115132314A: { imageWidth: 155, imageHeight: 120, imageQuality: 'low' },
    CN114582470B: { imageWidth: 548, imageHeight: 120, imageQuality: 'low' },
    CN110632554A: { imageWidth: 248, imageHeight: 120, imageQuality: 'low' },
    CN112029343A: { imageWidth: 137, imageHeight: 120, imageQuality: 'low' },
    CN115051051A: { imageWidth: 252, imageHeight: 120, imageQuality: 'low' },
    CN114092389A: { imageWidth: 95, imageHeight: 120, imageQuality: 'low' },
    CN106251095B: { imageWidth: 237, imageHeight: 120, imageQuality: 'low' },
    CN114550108B: { imageWidth: 193, imageHeight: 120, imageQuality: 'low' },
    CN111388679A: { imageWidth: 164, imageHeight: 120, imageQuality: 'low' },
    CN106924752B: { imageWidth: 240, imageHeight: 120, imageQuality: 'low' },
    CN115316172A: { imageWidth: 108, imageHeight: 120, imageQuality: 'low' },
    CN110503207A: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' },
    CN110610242A: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' },
    CN104346524A: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' },
    CN110109020A: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' },
    CN110045287A: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' },
    CN119090851A: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' },
    CN113888477B: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' },
    CN105046353A: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' },
    CN114170513B: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' },
    CN106924753A: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' },
    CN116171962B: { imageWidth: 952, imageHeight: 1348, imageQuality: 'high' }
};
const localizedSourceName = '\u79d1\u7814\u4e4b\u53cb\u4e13\u5229\u5e93';
const localizedSourceCaveat = '\u4e13\u5229\u516c\u5f00\u6587\u672c\uff1b\u6cd5\u5f8b\u72b6\u6001\u9700\u4e8c\u6b21\u6838\u9a8c\uff0c\u672c\u9875\u9762\u4e0d\u6784\u6210\u8bb8\u53ef\u7ed3\u8bba\u3002';

patents.forEach(patent => {
    const meta = patentImageMetaById[patent.id];
    if (meta) Object.assign(patent, meta);
    if (!patent.imageQuality) {
        const width = Number(patent.imageWidth || 0);
        const height = Number(patent.imageHeight || 0);
        patent.imageQuality = width >= 240 && height >= 240 ? 'high' : 'low';
    }
    patent.sourceName = localizedSourceName;
    patent.statusNote = localizedSourceCaveat;
    patent.sourceCaveat = localizedSourceCaveat;
    Object.assign(patent, derivePatentPricing(patent));
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
