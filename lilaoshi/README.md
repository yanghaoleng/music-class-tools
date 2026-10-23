# 李老师的音乐班

以本机 JOJO 设计班为交互原型的独立音乐学习应用。保留暖黄纸感、章节线雕、连续教练、聊天答题、随机题序与选项、收藏笔记、错题重练和受保护的学习数据后台。原有四个音乐工具保持各自独立。

正式入口：[m.mikeywa.site/pianoclass/](https://m.mikeywa.site/pianoclass/)。`pianoclass` 表示钢琴与音乐课堂，与现有音乐工具并列。

## 课程

7章，每章6道比较判断和2道对话题，共56题。题目与谱例均为原创教学内容。

1. 听见音乐的轮廓：音高、时值、力度、音色、音名与旋律方向。
2. 把节奏放进身体：稳定拍点、音符时值、四四拍、休止与附点。
3. 读懂第一张乐谱：五线谱、高低音谱号、中央C、升号与力度。
4. 音阶与音程的小秘密：全半音、大调结构、度数与音程听辨。
5. 让旋律有个和声伙伴：三和弦、大小性质、I/IV/V、转位与分解。
6. 第一次坐到钢琴前：键盘定位、手指编号、基础指法、放松与连奏。
7. 弹出你的第一段音乐：分手与合手、慢练、乐句、踏板与复盘。

涉及声音的题提供独立试听按钮，点击才发声，可停止、重播；切题和切到后台会停止声音。试听、提示与虚拟钢琴共用居中轴线，同组内容紧凑排列。钢琴章节可展开C4到C5的虚拟键盘，支持鼠标、触摸及电脑键盘：白键`A S D F G H J K`、黑键`W E T Y U`，可同时按键弹和弦，松键释放，窗口失焦清理。键盘旁的小图标可展开映射图，聊天输入时不触发琴音。试听是Web Audio合成示范音，未接入麦克风或真实钢琴演奏评分。乐谱使用科学音高记法，中央C为C4、MIDI 60。

首页与favicon每次打开或刷新共用一个随机李老师表情，避免连续重复；全部18种表情均使用清理过裁剪边界的独立图标。意见反馈保留可复制微信号，直接显示当前浏览器的可复制UID，与笔记和后台共用同一匿名身份。

## 本地运行

```sh
python3 scripts/dev.py
```

打开 <http://127.0.0.1:8798/lilaoshi/>。程序生成独立的本地密钥与管理访问码，保存在被Git忽略且权限受限的`.runtime/dev-config.json`。数据使用本应用独立数据库和浏览器存储，不混入设计班记录。

可选：复制`.env.example`为`.env`，只在本机填写AI服务配置。也可用`python3 scripts/dev.py --ai-env /绝对路径/私有配置文件`，只在进程中读取兼容配置的AI_KEY、AI_BASE、AI_MODEL，不复制原站的数据库、管理密码或密钥。不配置模型时，比较题、试听、键盘、笔记与本机进度可用；对话题明确显示模型未配置，不伪造判定。

本地后台位于`/lilaoshi/data/`，线上后台位于`/pianoclass/data/`，使用本应用的六位访问码。保留匿名练习事件、已提交文字、路径与收藏，90天滚动保留；草稿只保存在本机。课堂AI只依据文字讨论，不声称听到用户演奏。生产环境通过`MUSICCLASS_BASE=/pianoclass`配置路径，设置独立的`MUSICCLASS_SECRET`、`MUSICCLASS_PIN_SHA256`、`MUSICCLASS_DB`、`MUSICCLASS_ORIGINS`及服务端AI配置，通过HTTPS提供服务。

## 部署与恢复

在仓库根目录先更新、提交并推送，再运行`sh lilaoshi/ops/deploy.sh`。默认SSH别名`mikeywa-rive-old`，服务器`ubuntu@115.159.25.169`。独立`pianoclass.service`监听`127.0.0.1:8842`，Nginx只新增`m.mikeywa.site/pianoclass/`。网站资源与服务端接口共用该路径；本地路径保持不变。

版本目录`/opt/pianoclass/releases/<version>`，活动链接`/opt/pianoclass/current`。数据库位于`/var/lib/pianoclass/analytics.sqlite3`，私有环境位于`/etc/pianoclass.env`。首次初始化只复用已授权的设计班AI提供商配置；新生成独立HMAC密钥和后台访问码，不导入原站用户数据。后台访问码仅保存在服务器权限为0600的`/etc/pianoclass-access.json`，不写入仓库、网页或发布包。

每次连接路由前备份Nginx并检查配置；健康检查失败时恢复上一发布。后续回滚时把`current`指回`previous-release`中的目录并重启服务，数据目录保留。首次撤回可停止`pianoclass.service`并恢复`/etc/nginx/m.mikeywa.site.before-pianoclass-*.bak`，检查Nginx后重载。

## 素材与维护

- `web/`为可直接运行的静态源码，`server/`为Python标准库后端。
- 修改课程后运行`python3 scripts/build-course.py`，题库与预加载目录一起生成。
- 李老师为本项目生成的前刺短发、黑框眼镜、亲和男性音乐老师形象，18组双帧表情。生成方式与提示词见[角色说明](design/teacher.md)。
- 原始透明角色图位于`design/teacher-master.png`，网页只加载压缩WebP图集与独立图标。`scripts/build-teacher.cjs`用于机械裁切、缩放与编码，需要Sharp。
- 文字动效构建：`npm ci && npm run build:text`。已提交打包后的本地依赖，无需外部CDN。Iconoir、Manrope及文字动效依赖授权保留在`vendor/`与`web/`中。
- [课程依据与审核边界](design/curriculum.md)。基础乐理参考[musictheory.net](https://www.musictheory.net/lessons)，钢琴动作参考[Yamaha](https://www.yamaha.com/en/musical_instrument_guide/piano/play/play002.html)与[指法基础](https://hub.yamaha.com/keyboards/k-how-to/the-basics-of-piano-keyboard-fingering/)。来源用于事实核对，未复制其教材图片、谱例或原文。

## 验证

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.cjs
```

浏览器验收脚本为`tests/browser.cjs`，覆盖桌面、手机、声音调度、键盘、整章结算与错题。模型模拟与真实模型检查在验收记录中分别列出。

`node tests/widgets.cjs`单独验证13个电脑键映射、和弦与松键、输入框保护、居中布局、反馈UID复制以及随机头像与favicon同步。可设置`CLASSROOM_URL`对正式目录进行验证。

## 其他领域学习入口（2026-10-24）

首页在隐私协议左侧通过可悬停或点击的“更多课程”小面板推荐 [JOJO 设计班](https://mikeywa.site/refinetaste/)、[问问哲学班](https://mikeywa.site/philosophy/) 和 [阿映自媒体班](https://mikeywa.site/mediaclass/)。跳转使用真实站点地址，音乐学习、笔记、试听和后台记录继续独立。样式为 `web/other-fields.css`，由本应用静态路由提供。
