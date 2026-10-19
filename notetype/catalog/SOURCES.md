# 参考曲库来源与范围

本快照包含 4,038 个版本，不代表 4,038 首不同曲目。音频不上传给这些来源。曲库为预先整理的可计算音符，当前不是实时全网搜索引擎。仅返回来源链接和必要音符，不含歌词。

| 来源 | 版本数 | 内容与边界 |
|---|---:|---|
| [MuseTrainer library](https://github.com/musetrainer/library) | 66 | 公共领域曲目 MusicXML，来源仓库许可见上游；参考版本可能不同于演奏者编配 |
| [PDMX](https://zenodo.org/records/15571083) | 824 | 公开数据中的部分 MusicXML，使用 no_license_conflict、有效文件及非付费筛选；并非全量 PDMX |
| [JE](https://github.com/zytx121/je) | 1329 | 社区数字旋律谱，许多未写节奏；只作主旋律参考，原始条目逐条链接保留 |
| [POP909](https://github.com/music-x-lab/POP909-Dataset) | 1818 | 909 首歌曲，每首主旋律和钢琴编配两版；MIDI 含节奏和声部，上游仓库 MIT 许可；作者栏来自演唱者信息，不等于作曲人 |
| NoteType 自有示例 | 1 | 程序合成 C 大调音阶，用于展示流程 |

导入脚本位于 ops/build-catalog.py、ops/import-je.py、ops/import-pop909.mjs。后两者追加到 index.json；重新运行第一个会重建索引，之后需重新导入其余来源。原始下载保留于被忽略的 cache/，部署无需下载原文件。每个 scores/*.json 保留来源、标题、版本类型、音符与检索特征。

公共可访问不等于任意用途授权。上游数据/编配的权利与使用条件以原始来源为准。社区内容权利由贡献者保留；本应用不提供整套原始曲谱下载。若用于商业发行，应核对具体版本授权。
