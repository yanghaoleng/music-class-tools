# 李老师角色素材

采用内置image_gen生成，原始透明PNG为1254×1254，6列×6行，每格209×209。角色为前刺短发、黑色方框眼镜的亲和男性音乐老师。统一暖色衣领与柔和黏土质感，18种双帧表情。

生成结果实际尺寸与提示词中建议的1536不同；制作时依据实际209px格裁切，不假定输出尺寸。运行图集使用192px格，圆形头像在界面以40—68px显示。头发、眼镜和面部在各格内部；肩部仅作头像边缘装饰。原图保存在`teacher-master.png`。

网页图集：`../web/assets/teacher-emotions.webp`、`teacher-positive-emotions.webp`、`teacher-cool-expressions.webp`、`teacher-gaze.webp`。图标位于`../web/assets/icons/`，首页与favicon使用同一随机表情。原JOJO小鸡图像不包含在本应用素材中。

最终生成提示词：

> Use case: stylized-concept. Asset type: production character expression sprite sheet for a Chinese music learning app called 李老师的音乐班. Create ONE sprite atlas, perfectly square 1536 x 1536 pixels, an EXACT regular 6 columns by 6 rows grid, 36 identical square cells. Transparent background, no visible grid lines, no text, no watermark. Each cell contains the same character in precisely aligned centered head-and-upper-shoulders framing, occupying about 82 percent of cell with 9 percent padding all sides, no overlap. Character: a friendly approachable male Chinese music teacher about 35, short black hair with distinctly short forward/upward spiky front fringe (前刺短发, textured short spikes at forehead, NOT a side part), thick BLACK RECTANGULAR eyeglass frames, warm smile, soft peach skin, dark eyebrows, no beard, cream crew-neck T-shirt and tiny mustard cardigan shoulders. Premium playful clay 3D editorial illustration, matte soft material, restrained rounded proportions, warm studio light, expressive but reassuring, readable at 48px. Human adult teacher, NEVER a chick or animal. Maintain EXACT same hair, glasses, face identity, scale, lighting and camera across every cell. Each expression occupies TWO ADJACENT columns as subtle animation frames, frame 2 only differs in blink/smile slightly. Reading left to right then top to bottom, pairs are: row1 neutral friendly, happy, thoughtful; row2 curious, pleasantly surprised, encouraging; row3 empathetic gentle, puzzled, playful; row4 delighted, approving, inspired; row5 relieved, grateful, amused; row6 cool relaxed, confident warm, mischievous wink. Every head and all forward spikes must fit entirely inside its own square safe area. Keep transparent pixels around each head.
