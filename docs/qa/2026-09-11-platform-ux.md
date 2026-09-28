# 平台多尺寸体验验收

## 范围

使用本地 demo 账户，检查 320、390、834、1280、1440 px 五种视口。每种尺寸访问登录、注册及 18 个业务页面，共 100 次页面访问；同时检查部分页面滚动状态、弹窗和浅色主题。

业务页面：工作台、投资总览、投资目录、资产总览、记录交易、个人财务、决策、股票池、BWXT 详情、量化监控、财报日历、研究库、研究专题、工具、个人设置、IBKR 导入、关于、使用指南。

## 修复内容

| 问题 | 修改 |
| --- | --- |
| 手机盘中预警占据多屏，主看板难以到达 | 默认展示两条，按风险级别排序；提供缓存条数及全部展开/收起 |
| 决策页四项统计在手机竖排 | 手机/平板 2×2，宽屏四列 |
| 财报页同时高亮股票池和财报日历 | 二级导航选择最精确路由；自动将当前项滚动到可见区域 |
| 财务页没有所属主导航 | 纳入投资区，并加入个人财务入口 |
| 导航透出底下文字、锚点易被导航遮住 | 实色导航背景、动态测量导航高度，修正滚动预留空间与量化搜索栏定位 |
| 平板及手机控件点击区偏小 | 扩大按钮/选择框、研究切换器、主题色板和工具按钮触控区域 |
| 暗色辅助文字与浅色主按钮对比不足 | 提高默认暗色辅助文字亮度，降低浅色主题主按钮背景亮度 |
| 无投资时仍展示不可提交交易表单 | 增加投资目录/导入入口，区分加载、错误与空状态，提供重试 |
| 提交交易缺乏进行中反馈 | 禁用重复提交并显示提交状态；未实际提交交易验收 |
| 空研究库误提示“没有匹配结果” | 区分初始空库和搜索无结果，提供第一条研究入口 |
| 手机财报单元格只能看到截断代码 | 改为事件数量入口，点开当日明细；编辑/添加时滚到编辑区域 |
| 键盘和弹窗焦点不完整 | 跳到正文、导航当前页语义、语言菜单方向键、弹窗焦点循环/Escape/焦点恢复；危险确认默认聚焦取消 |
| 资产总览自动弹出旧版引导遮挡页面 | 改为主动打开使用指南 |
| 研究页导出额外组件违反 Next 路由类型约束 | 将实现原样移入 NotesClient/ResearchTopicsClient，保留薄路由入口 |

## 验证

- 多尺寸巡检和交互测试：8 passed；4 skipped 是同一附加视口在其它项目中的重复组合。
- 最终 320、390、834 px 巡检未报告小于 40px 高的可见按钮/选择框；各尺寸页面无整体横向溢出。
- 验证预警展开收起、唯一导航高亮、当前导航项可见、语言菜单键盘操作、2×2 统计、空状态入口、工具弹窗及手机财报弹窗。
- TypeScript、涉及文件 ESLint 和 diff whitespace 检查通过。
- 未执行资产/交易提交、导入、删除、策略扫描、密码修改或研究自动保存。

## 截图

完整前后截图在本地 `/tmp/seekcost-platform-ux.u87Xkh/`，`before` 为改动前，`final` 为最终矩阵。

- [手机决策页](/tmp/seekcost-platform-ux.u87Xkh/final/platform-ux-audit-platform-read-only-responsive-audit-mobile/decision.png)
- [PC 工作台](/tmp/seekcost-platform-ux.u87Xkh/final/platform-ux-audit-platform-read-only-responsive-audit-desktop/workbench.png)
- [平板设置页](/tmp/seekcost-platform-ux.u87Xkh/final/platform-ux-audit-platform-read-only-responsive-audit-tablet/profile-scrolled.png)
- [手机财报明细](/tmp/seekcost-platform-ux.u87Xkh/final/platform-ux-interactions-n-f7ebe-e-and-dialogs-remain-usable-mobile/earnings-day.png)
- [手机浅色工具页](/tmp/seekcost-platform-ux.u87Xkh/final/platform-ux-interactions-n-f7ebe-e-and-dialogs-remain-usable-mobile/tools-light.png)

## 边界与服务

浏览器验证基于 Chrome 的响应式模拟，不等同于真机 Safari/Android 验收。demo 的投资目录、研究库和工具库为空，未将空数据页面的通过结果视为已验证全部有数据/交易流程；股票池、K 线、量化和财报使用实际已有数据。未做完整生产构建。

本地 Turbopack 曾复用旧全局 CSS，缓存已移到上述临时目录备份，没有删除业务数据。当前前端使用 `npm run dev -- --webpack` 运行于 3000 端口，后端仍为 8001；项目默认 dev 命令未改动。
