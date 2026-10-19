# 交接 · 2026-10-17

## 当前线上

- https://m.mikeywa.site/cal/ ，图标方案 https://m.mikeywa.site/cal/icon-concepts/ 。
- 运行版本 /opt/music-cal/releases/20261017-182143，music-cal.service 监听 127.0.0.1:8802。
- 本地与线上 server.py SHA256：11f16102388dd208fdd08b3e66200976670021e53b34693e1d0c263ef545f2f2。
- 当前提供月历、7 天周历、3 天和全部列表；首次桌面默认周历，手机默认 3 天，选择会保存在浏览器。
- 管理员与老师可拖动已预约课程：月历仅改日期并保留时间，周历与 3 天视图按 15 分钟调整日期/时间。课程始终 60 分钟，含课内休息 10 分钟。学员/家长只读，已完成课程不能拖动。
- 调课接口 POST /cal/api/lessons/move 在事务中核对原位置、老师权限、冲突、休假、时段与余额，失败回退。保留同一课程 ID、琴房、反馈和课时账目。
- 日历按需加载，主入口约 302KB，日历模块约 350KB（压缩前），无第三方 CDN。

## 验证证据

- 12 组 Python 集成测试、3 组日期/时区/列表检查通过。
- 本地浏览器实测月历拖动（周日→周一，保留 10:00）、3 天改时间（10:00→11:30）、周历跨天改时间（周一 11:30→周二 12:00）、冲突回退、全部列表同步和 390×844 手机布局。控制台错误/警告为空。
- 本地截图 design/qa/calendar-month.png 与 design/qa/calendar-three-days.png；均为独立虚构体验教室。
- 线上通过已校验证书的 TLS/Nginx 回环访问核验移动保存、余额与元数据保留、过期原位置 409、冲突回退 400、学员调课 403。首页与所有 JS/CSS 逐字节一致。详见 design/calendar-verification.json。
- 客户端公网访问有间歇性超时：实际公网调课与过期保护已成功返回，完整验收随后在服务器 TLS/Nginx 回环完成。线上浏览器连接超时，未取得当前线上截图或控制台。不要把本地截图描述成线上截图。
- 可复验：上传 ops/verify-calendar.py 到服务器，在 current 目录运行 python3 /tmp/music-cal-verify-calendar.py --local-edge。仅新建独立虚构体验空间，不写正式教室。

## 访问和配置

- 正式管理员口令在 .private/正式教室访问.txt（600），服务器 /var/lib/music-cal/admin-access.txt；禁止进入 Git。
- ARK key 仅保存在 .private/runtime.env 和 /etc/music-cal.env。沿用 Mini、关闭思考，遇到未开通 Fast 的特定错误才回退同模型常规档。
- D「微笑音符」已由用户选定，网站标识、favicon、手机收藏图标统一使用 D，资源参数 ?v=d1。四个原图和说明均保留。
- 本地独立 cal/ 仓库，无远端；未替用户创建 GitHub 仓库，未修改相邻音乐项目。
