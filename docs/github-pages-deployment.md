# GitHub Pages 部署说明

ScholarMate 当前是纯静态前端原型，可以直接部署到 GitHub Pages。

## 当前项目已准备好的内容

- 根目录已有 `index.html`，可作为 GitHub Pages 首页。
- 已添加 `.nojekyll`，避免 GitHub Pages 用 Jekyll 处理静态资源。
- 已添加 `.github/workflows/pages.yml`，推送到 `main` 分支后可用 GitHub Actions 自动发布。

## 方式 A：用 GitHub Actions 自动部署

1. 在 GitHub 新建一个空仓库，例如 `scholarmate-demo`。
2. 在本地项目目录初始化并推送：

```bash
git init
git add .
git commit -m "Deploy ScholarMate static prototype"
git branch -M main
git remote add origin https://github.com/<your-name>/scholarmate-demo.git
git push -u origin main
```

3. 打开 GitHub 仓库：

```text
Settings -> Pages -> Build and deployment
```

4. Source 选择：

```text
GitHub Actions
```

5. 等 Actions 跑完后，Pages 会显示一个访问地址，通常类似：

```text
https://<your-name>.github.io/scholarmate-demo/
```

## 方式 B：用 GitHub Pages 分支目录部署

如果不想用 Actions，也可以：

1. 推送到 GitHub。
2. 打开 `Settings -> Pages`。
3. Source 选择 `Deploy from a branch`。
4. Branch 选择 `main`，目录选择 `/root`。
5. 保存后等待 Pages 构建。

## 试用注意事项

- 所有用户状态保存在访问者自己的浏览器 `localStorage` 中，不会同步给其他人。
- LLM Key 只保存在当前标签页 `sessionStorage` 中，不会写入仓库或 localStorage。
- 语义推荐模型需要访问 jsDelivr 和 Hugging Face；无法访问时会自动回退到本地规则推荐。
- 这仍是演示原型，不包含真实账号、支付、认证、合同或数据库。

## 不建议公开放入真实 Key

如果把站点发布到公网，不要在源码里写任何 API key。聊天页里的 OpenAI-compatible 配置只适合演示者在自己浏览器临时填写。正式产品应改成后端代理或临时令牌。
