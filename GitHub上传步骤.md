# GitHub Pages 拖拽上传清单（手机/电脑通用）

> 依据 LICENSE 第 2.2 条：允许私人部署（自己改、自己用、不公开、不提供给第三人）。
> 仓库务必建 **Public**，否则 GitHub Pages 免费版不给你开。

---

## 开始前先记住三条硬规矩

| 限制 | 数字 | 怎么避坑 |
|---|---|---|
| 一次最多传几个文件 | **100 个** | 你的 `js/` 有 111 个文件，**必须分两趟** |
| 单个文件最大多大 | **25 MB** | 你最大的文件才 0.62 MB，全部安全 |
| 文件名 | 只能英文/数字/-/_ | 你 112 个文件名全合规，不用改名 |

**最重要的一条：所有文件必须放在仓库最外层，绝对不能套一个叫「字卡」的文件夹。**
套了就会变成 `你的网址/字卡/index.html`，打开直接 404。

---

## 第 0 步：建仓库

1. 打开 https://github.com → 右上角 `+` → **New repository**
2. 名字随便，比如 `zika`
3. 选 **Public**
4. **不要**勾 "Add a README file"（勾了也能用，后面会多一个文件而已，无所谓）
5. 点 **Create repository**

---

## 第 1 批（13 个文件）：根目录文件 —— 先传这批

进入刚建好的仓库首页 → 绿色 `Code` 旁边的 **Add file** → **Upload files**。
然后把下面 **13 个文件** 从 `E:\字卡` 里框选（按住 Ctrl 点选）一起拖进虚线框：

```
1.  index.html              ← 最关键，必须传
2.  manifest.json
3.  sw.js
4.  version.json
5.  notice.json
6.  icon-180.png
7.  icon-192.png
8.  icon-512.png
9.  icon-maskable-512.png
10. LICENSE
11. README.md               ← 建议传，是项目说明
12. 部署说明.md              ← 建议传，方便以后自己查
13. .gitignore              ← 可选，传了以后不会误传垃圾文件
```

拖完检查一下列表里是 **13 个**，然后：
- 下面的 **Commit message** 填：`第一批：根目录文件`
- 保持 `Commit directly to the main branch` 选中
- 点绿色 **Commit changes**

> ⚠️ 这一批只传文件，**不要**把 `js` 文件夹一起拖进来（会超过 100 个）。

---

## 第 2 批（112 个文件）：js 文件夹 —— 再传这批

**留在仓库首页**（不要点进任何子文件夹）→ 还是 **Add file** → **Upload files**。

现在拖 `js` **整个文件夹**（在 `E:\字卡` 里把 `js` 文件夹拖进虚线框）。

Github 会把里面 112 个文件连同 `vendor` 子文件夹一起带上来，结构会自动变成：
```
js/xxx.js
js/vendor/pinyin-pro.min.js
```
（这是对的，就应该是这样）

检查列表里是 **112 个**（或者显示成 `js/` 文件夹也行），然后：
- **Commit message** 填：`第二批：js 全部脚本`
- 点 **Commit changes**

> 如果拖文件夹没反应 / 只传了空文件夹：改用 **choose your files**，
> 进入 `E:\字卡\js`，按字母选 **a 到 m 开头的文件**（约 70 个），
> 再单独补传 `n 到 z` 开头的 + 进 `vendor` 文件夹传 `pinyin-pro.min.js`。
> 反正保证每个 js 文件最后都在 `js/` 下面就行。

---

## 第 3 步：开启 GitHub Pages

1. 仓库上方 **Settings**（不是右上角头像那里，是仓库标签栏里的）
2. 左侧菜单往下找 **Pages**
3. **Source** 选 `Deploy from a branch`
4. **Branch** 选 `main`，右边文件夹选 `/ (root)`
5. 点 **Save**
6. 等 1~2 分钟，刷新这个页面，最上面会出现一行：
   `Your site is live at https://你的用户名.github.io/仓库名/`

---

## 第 4 步：手机装成 App

**iPhone Safari**：打开上面那个网址 → 底部「分享」→ **添加到主屏幕**
**安卓 Chrome**：打开网址 → 右上角 `⋮` → **添加到主屏幕**

装完是独立存储，比浏览器标签页稳定，不容易被系统清数据。

⚠️ **务必先在 设置 → 导出数据 做一份备份**，然后定期再备份一次。

---

## 怎么验证传对了

打开 `https://你的用户名.github.io/仓库名/`，正常应该看到开屏密码页。
如果打不开：

| 现象 | 原因 | 解决 |
|---|---|---|
| 404 | `index.html` 不在最外层 | 检查仓库首页是不是直接有一个 `index.html`，而不是只有 `字卡/` 文件夹 |
| 页面打开了但白屏 | `js/` 没传全 | 数一下 `js/` 里是不是 112 个文件，尤其 `js/vendor/pinyin-pro.min.js` |
| 拼音拼字用不了 | 少了 `js/vendor/pinyin-pro.min.js` | 单独进 `js/vendor` 补传这一个 |
| 改了代码但页面没变 | 浏览器缓存/SW | 手机上把网站从主屏幕删掉重装，或者强制刷新 |

---

## 以后更新怎么传

只传改动过的文件，**覆盖**同名文件即可：

1. 仓库首页 → **Add file** → **Upload files**
2. 拖改动过的文件（比如只改了 `index.html` 和 `js/ta-typing.js` 就只拖这两个）
3. Commit message 写 `更新：xxx`
4. **Commit changes**

GitHub 会自动覆盖同名文件，不用担心重复。

> `sw.js` 每次改动都会升级版本号，用户打开时会提示更新。
> 如果你改了很多文件，记得把 `sw.js` 也一起传上去。
