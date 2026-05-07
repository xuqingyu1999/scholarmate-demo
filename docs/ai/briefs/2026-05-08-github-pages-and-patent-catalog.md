# ScholarMate GitHub Pages 部署准备与专利库扩充

## Goal

把当前静态前端原型整理成可部署到 GitHub Pages 的形态，并扩充演示专利库，让搜索、上传需求推荐、数字顾问资产和专利详情有更丰富的演示数据。

## Acceptance Criteria

- 项目根目录具备 GitHub Pages 友好的入口文件，`index.html` 可直接作为站点首页。
- 新增 GitHub Pages 部署说明和可选 GitHub Actions workflow。
- 当前目录不是 git 仓库时，不强行初始化或推送；最终说明需要用户提供 GitHub repo 或自行推送。
- 专利数据从当前 12 条扩充到至少 24 条，覆盖医疗健康、新能源、先进制造、企业服务、隐私计算、物联网、农业环保等演示场景。
- 新专利有清晰 `field`、`industry`、`summary`、`keywords`、价格/免费共享状态、风险提示和发明人映射。
- 专利列表动态渲染后能展示扩充后的数据，推荐搜索仍保持“少而准”。
- 全量测试、语法检查和浏览器 smoke 通过。

## Test Plan

- 更新或新增测试断言专利数不少于 24。
- 覆盖典型搜索：医疗 AI、电池热失控、隐私医疗数据、农业病虫害、碳排放/节能。
- 浏览器打开 `patent-list.html`，检查列表卡片数量、筛选、搜索结果和详情跳转。
- 跑现有全部 `.mjs` 测试。
