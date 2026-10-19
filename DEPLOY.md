# 部署到 GitHub Pages

这个项目已经准备好了 `docs/` 目录：

```text
docs/
  index.html   ← 单文件版游戏（155 KB）
  preview.png  ← 分享封面
  .nojekyll    ← 让 GitHub Pages 不要用 Jekyll 处理
```

只要把整个项目推到 GitHub，然后让 Pages 从 `main` 分支的 `/docs` 目录发布即可。

---

## 一、建仓库

1. 登录 GitHub，右上角 `+` → **New repository**。
2. Repository name 填：`deepseek-border`
3. 选 **Public**。
4. **不要**勾选 “Add a README file / Add .gitignore / Choose a license”，本地已经有文件了。
5. 点 **Create repository**。

创建后会看到 “push an existing repository from the command line” 的提示，先放着。

---

## 二、上传文件

### 方式 A：命令行（推荐，已装 Git）

在项目目录执行：

```bash
cd /Users/lyanxiang/Documents/deepseek-border
git init
git add .
git commit -m "DeepSeek border control game"
git branch -M main
git remote add origin https://github.com/你的用户名/deepseek-border.git
git push -u origin main
```

如果第一次 commit 报 `Author identity unknown`：

```bash
git config user.name "你的名字"
git config user.email "你的邮箱"
```

然后再执行 `git commit`。

如果 push 时让你输密码：**不要输 GitHub 登录密码**，要输 Personal Access Token（PAT）。

生成 PAT：

1. GitHub 右上角头像 → **Settings**
2. 左下角 **Developer settings**
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token (classic)**
5. 勾选 `repo`，生成后复制
6. 回到终端，用户名填 GitHub 用户名，密码粘贴 PAT

> 更省事：装一个 **GitHub Desktop**，登录后 `File → Add Local Repository` 选择这个文件夹，点 `Publish repository`，取消勾选 “Keep this code private”。不用折腾 PAT。

### 方式 B：GitHub Desktop

1. 下载安装 GitHub Desktop，登录。
2. `File` → `Add Local Repository`。
3. 选择 `/Users/lyanxiang/Documents/deepseek-border`。
4. 如果提示不是 Git 仓库，点 `create a repository`。
5. 点右上角 **Publish repository**。
6. **取消勾选** “Keep this code private”，发布为公开仓库。
7. 仓库名填 `deepseek-border`。

---

## 三、开启 GitHub Pages

1. 打开仓库页面。
2. 点 **Settings**。
3. 左侧找到 **Pages**。
4. **Build and deployment** → **Source** 选 `Deploy from a branch`。
5. **Branch** 选 `main`，**Folder** 选 `/docs`。
6. 点 **Save**。
7. 等 1–2 分钟，刷新页面，顶部会出现：

```text
Your site is live at https://你的用户名.github.io/deepseek-border/
```

打开这个地址就能玩了。

如果 404：

- 确认 `docs/index.html` 存在（注意大小写）。
- 确认 `docs/.nojekyll` 存在。
- 再等 1–2 分钟，Pages 第一次构建会慢。
- 看仓库的 **Actions** 或 **Pages** 页面有没有报错。

---

## 四、以后更新游戏

改完源码后：

```bash
cd /Users/lyanxiang/Documents/deepseek-border
node build.js
cp deepseek-border.html docs/index.html
git add .
git commit -m "Update game"
git push
```

等 Pages 自动重新发布即可。

---

## 五、可选：自定义域名

1. 仓库 **Settings → Pages → Custom domain**。
2. 填你的域名，比如 `game.example.com`。
3. 到域名 DNS 服务商加一条 CNAME：

```text
game.example.com  →  你的用户名.github.io
```

4. 回 GitHub Pages 勾选 **Enforce HTTPS**。
5. 等 DNS 生效（几分钟到几小时）。

注意：如果主站面向国内玩家，`github.io` 访问可能不稳定。可以把 GitHub 当源码仓库，游戏另挂 Cloudflare Pages 或国内静态托管，再用自定义域名。

---

## 六、部署后建议

- 把最终网址发我，我可以帮你补 `og:image`、`og:title` 等分享标签，发微信/X/Reddit 时才有封面。
- 在手机浏览器和微信里各打开一次，确认能玩。
- 仓库是公开的，游戏源码也在 HTML 里；不要往仓库里放任何密钥。
