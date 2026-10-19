# 实现映射

- src/main.jsx：登录、体验、角色界面、周课表/手机列表、人员、规则/语义预览、预约、反馈。
- src/style.css：共享颜色、版式、响应式和表单反馈。
- src/ScheduleCalendar.jsx、src/calendar.css：月历/7 天周历/3 天/全部列表、导航、老师筛选、课程拖动与触屏适配。按需加载 FullCalendar，三种日历视图共享课程源。
- src/calendar-model.mjs：北京时间的日程转换、固定 60 分钟时长、移动参数与列表排序。
- POST /cal/api/lessons/move：带原位置核对的原子调课，复用权限/冲突/课时校验。
- server.py：角色鉴权、SQLite 事务、冲突与课时校验、邀请轮换、预约确认、模型规则解析、预览及提交。
- tests/test_app.py：隔离数据的集成测试。
- public/brand-icon.png：当前预览图标；public/icon-concepts/：四版方案页。
- ops/：服务、路由与发布脚本。

会话、访问口令只存哈希。教师/学员/家长权限校验在服务端，正式教室禁止体验身份切换。排课预览绑定会话和数据版本，15 分钟过期，提交时 SQLite BEGIN IMMEDIATE 内复核，避免并发覆盖。
