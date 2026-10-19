# NoteType

上传演奏视频，识别音高与起止时间，在保留原声的视频下方逐步绘制五线谱，再通过 Remotion 导出 MP4。

## 使用

1. 打开 https://m.mikeywa.site/notetype/，上传带声音的演奏视频（MP4、MOV、WebM、M4V，0.3–60 秒，≤80 MB），或点击合成音阶示例。
2. 等待解析与自动检索，试听候选并确认曲目和版本；也可按曲名搜索。无需提供曲谱。系统将参考音符对齐到演奏时间；未找到时可明确选择识别初稿。确认后可修改标题、风格、音名和整体偏移。
3. 点击“校正识别音符”修改音高和起止时间，或删除误音。校正时点击音符可定位预览。
4. 点击“导出视频”，完成后点击“下载 MP4”。修改设置后可重新导出。

数据处理在本服务器进行。任务地址使用随机 UUID；不提供作品列表。原视频、音符和导出文件 6 小时后清理，清理任务每分钟运行一次。刷新页面可从当前浏览器标签页恢复任务。

## 能力边界

先用 Spotify Basic Pitch 提取软音高特征与音符，再用音级分布、旋律片段筛选参考，使用子序列动态时间规整对齐片段及速度变化，支持移调。确认后优先采用参考音高，根据实际音符微调起止时间。相似等级是特征一致程度，不是识别正确概率。

当前内置 4,038 个参考版本，覆盖古典、909 首中文流行歌曲的旋律与钢琴编配，以及社区旋律谱；来源见 [catalog/SOURCES.md](catalog/SOURCES.md)。曲库按公开来源预先整理，上传音视频不发送给外部检索服务。不同乐器均可尝试，但并非任意曲目、完整吉他指法谱或复杂混音均可识别。社区无节奏旋律单独标注，不能冒充完整编配。踏板、噪声、混音、大幅改编、跨段跳奏均可能影响结果；匹配弱时不自动套谱。

动态双谱表按真实演奏时间排列，每 4 秒翻页，按音高拆分高低谱表。音符时值只是近似视觉表示；未识别调号、拍号、小节和休止符，不等于可出版的规范乐谱。当前先上传、离线识别，再同步播放，未实现摄像头实时转录。

导出实际使用 Remotion 服务端渲染，720 × 960、30 fps、H.264 + AAC，3:4 竖屏；原视频强高斯模糊并压暗作为谱面背景，下方以 contain 保留清晰演奏画面与原声。整段音符固定显示，演奏到时只在原位发光，不使用弹跳或位移动画。示例为自行生成的音阶录音和键盘视频，不是实际钢琴演奏。

## 本地运行

需要 Node.js 18+、FFmpeg/ffprobe、Chrome（Remotion 可自动下载）。

```sh
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:8795/notetype/。开发时另外执行 `npm run dev`。环境变量：`PORT`（8795）、`DATA_DIR`（默认 data）、`CHROME_PATH`（可选）。识别模型随 npm 包安装，不需要 API Key，不调用外部识别服务。识别在独立子进程执行；共享服务器逐项执行识别与渲染，避免阻塞 API。

## 部署

服务器：ubuntu@115.159.25.169。前后端统一由 `notetype.service` 运行；Nginx 配置仅处理 m.mikeywa.site，不改动主站。`/opt/notetype/releases/<version>` 保存代码与构建结果，`/opt/notetype/current` 为活动链接，数据位于 `/var/lib/notetype`。先构建、传输文件、在目标平台 `npm ci --omit=dev`，切换活动链接，安装 ops/notetype.service 和 ops/nginx.conf，检查 `nginx -t` 后重载。旧发布目录保留，可切回链接并重启服务恢复。

校验：`npm test`、`npm run build`；线上实际上传视频，等待匹配候选、确认参考并对齐，再提交导出并用 ffprobe 检查 H.264、AAC、尺寸与时长，浏览器检查播放、校正、移动端布局与控制台。

## 第三方

- [Spotify Basic Pitch](https://github.com/spotify/basic-pitch-ts)：Apache-2.0，模型与推断库。
- [Remotion](https://www.remotion.dev/)：预览及视频渲染；许可条件以官方 LICENSE 为准。
- [Noto Music](https://github.com/google/fonts/tree/main/ofl/notomusic)：SIL Open Font License，字体许可见 public/MUSIC-FONT-LICENSE.txt。
- Phosphor：MIT。
