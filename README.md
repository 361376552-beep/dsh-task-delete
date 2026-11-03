# dsh-task-delete

给 DeepSeek Harness 侧栏的每个任务加上「删除」按钮。

> Add a **Delete task** item to every session's "···" menu in the DeepSeek Harness sidebar.

官方 GUI 只提供任务的归档/置顶，没有删除入口。本插件通过官方扩展机制（客户端插槽 + 宿主插件）补上这一项：

- 侧栏任务行「···」菜单底部出现红色「**删除任务**」（官方同款危险色样式与垃圾桶图标）
- **两段式确认**：点一下变「确认删除「标题」？」，4 秒不点自动还原，防误触
- 删除后侧栏行**立即消失**（走官方注册表归档增量，无需刷新）
- **运行中保护**：正在跑回合的任务拒绝删除，提示先停止
- **可恢复**：不是粉碎——会话文件被移入 `~/.dsh/trash/task-delete-<时间戳>/`
- 不手改 `workspace.json`，全部经官方 API，避免与运行中的应用互相覆盖

## 安装

### 方式一：下载安装包（推荐）

1. 到 [Releases](https://github.com/361376552-beep/dsh-task-delete/releases) 下载 `dsh-task-delete-1.0.0.tgz`（或整个 `dsh-task-delete-v1.0.0.zip` 分享包，内含图文说明 INSTALL.txt）
2. 建议把 tgz 放到一个不会误删的固定位置（profile 的 lockfile 会记录它的路径）
3. 终端执行（macOS；把路径换成你的实际路径）：

   ```bash
   "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
     plugin --profile desktop add "/你的路径/dsh-task-delete-1.0.0.tgz"
   ```

   若 `dsh` 已在 PATH，直接 `dsh plugin --profile desktop add <tgz路径>` 即可。
4. **完全退出并重新打开 DeepSeek Harness**（或刷新已打开的 GUI 页面）
5. 验证：侧栏任意任务行「···」菜单底部出现红色「删除任务」；插件页出现「任务删除」

### 方式二：从源码安装

```bash
git clone https://github.com/361376552-beep/dsh-task-delete.git
dsh plugin --profile desktop add ./dsh-task-delete
```

注意：目录方式安装是软链（`link:`），安装后**不要移动或删除该目录**。

## 卸载

```bash
dsh plugin --profile desktop remove @local/dsh-task-delete
```

或在 GUI 插件页取消选择「任务删除」。

## 恢复被删的任务

文件都在 `~/.dsh/trash/task-delete-<时间戳>/`：

| 移回 | 从 | 到 |
|---|---|---|
| 会话目录 | `trash/.../sessions/<id>` | `~/.dsh/sessions/<任一工作区slug>/` |
| 标题缓存 | `trash/.../projcache/<id>.json` | `~/.dsh/storages/session_projcache/sessions/` |

重启应用。如需取消「已归档」状态：应用完全退出后，编辑 `~/.dsh/storages/workspace.json`，把该 id 从 `archivedSessionIds` 移除。

## 安全与隐私

- 插件在应用**本机回环** web 服务上注册一个 POST 专用路由，必须携带自定义请求头 `x-dsh-task-delete`——浏览器对带自定义头的跨源请求强制预检，本路由不回答任何 CORS 头，**恶意网页无法借道删除**
- 不联网、无遥测、无第三方依赖；全部源码即本仓库，欢迎审阅
- 删除只做「移动到回收目录」，永不粉碎数据

## 兼容性

- 已在 **DeepSeek Harness 0.2.1-rc.5**（macOS 桌面版）实测
- 纯 Node / 浏览器标准 API，无平台专属代码；其他版本若插槽与服务接口未变应可直接使用

## 实现结构

| 文件 | 作用 |
|---|---|
| `client.js` | 浏览器半：向官方插槽 `sidebar.workspaces.session.menu.item` 注册菜单项（两段式确认 UI） |
| `index.js` | 宿主半：注册 `/dsh-task-delete/delete` 路由；`workspaceController.archiveSession` 归档 + 文件移入回收目录 |
| `cordis.patch.yml` | 把插件行插入 profile 组合树 |
| `locale/*.json`、`icon.svg` | 插件页展示的名称、描述与图标 |

## License

[MIT](LICENSE)
