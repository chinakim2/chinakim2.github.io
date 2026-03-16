# 轻计划

一个面向小学低年级家庭的陪学节奏管理 APP 原型。

## 这版已经包含

- 家长端基础设置：孩子昵称、年级、到家时间、睡觉时间、可专注时长、自由玩耍时长
- 今日任务录入：学校作业、自主复习、习惯养成、兴趣班
- 任务时长支持到 180 分钟，适合录入长时段兴趣班
- 智能生成今晚计划：自动插入到家缓冲、晚饭、休息、睡前整理
- 超负荷提醒：当任务偏多时，给出“建议延后”提示
- 孩子端执行页：只展示当前任务和接下来的 2 到 3 步
- 晚间复盘：完成情况、较顺利环节、明日建议
- 本地保存：刷新页面后仍会保留当前数据
- 已升级为可安装的 PWA：支持主屏幕安装、基础离线打开、导出 / 导入家庭数据
- 已预留家庭云同步结构：前端同步入口、配置文件、数据库脚本

兴趣班的时长建议按“总占用时长”填写，也就是上课、等待、接送和路上时间一起算，这样系统判断负荷会更接近真实情况。

## 如何运行

最简单的方式：

1. 直接用浏览器打开 `/Users/mac/Documents/New project/index.html`

如果你想用本地预览服务：

1. 在当前目录运行 `python3 -m http.server 4173`
2. 打开 `http://[::1]:4173/index.html`

## 装到手机和平板

要真正安装到手机和平板，建议把这个项目部署到一个带 HTTPS 的线上地址。

- iPhone：用 Safari 打开后，点“分享” -> “添加到主屏幕”
- 华为手机 / 平板：在浏览器菜单里找“安装应用”或“添加到主屏幕”
- 目前这版还是本地存储，不是实时云同步版
- 现在可以先用页面里的“导出家庭数据 / 导入家庭数据”在不同设备之间搬家
- 如果想三台设备永远保持同一份数据，下一步需要把 `config.js` 接到真实云端，并执行 Supabase 数据库脚本

## 文件结构

- `/Users/mac/Documents/New project/index.html`：页面结构
- `/Users/mac/Documents/New project/styles.css`：视觉与响应式样式
- `/Users/mac/Documents/New project/app.js`：排程逻辑、交互、本地存储
- `/Users/mac/Documents/New project/manifest.webmanifest`：PWA 安装清单
- `/Users/mac/Documents/New project/sw.js`：离线缓存
- `/Users/mac/Documents/New project/icons/`：安装图标
- `/Users/mac/Documents/New project/config.js`：云同步配置入口
- `/Users/mac/Documents/New project/supabase/family-sync.sql`：家庭同步数据库脚本

## 下一步适合继续做的方向

- 增加“周模板”和“工作日 / 周末”切换
- 引入登录和多孩子家庭支持
- 增加真实的奖励体系和成长记录
- 接入后端后做跨设备同步
