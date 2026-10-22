# App Icon · 果断笔触探索

2026-10-22，使用内置 image_gen 生成，供用户选择。用户已选 D「节奏签名」为正式默认图标；图标选择面板已移除，四张 WebP 仅保留在设计目录。

- A.webp：折线冲刺
- B.webp：双波交织（推荐）
- C.webp：声波环
- D.webp：节奏签名

四张保留 256 px WebP 预览；生成任务完成的顺序为 D、C、B、A，文件字母为准。

## Final prompt set

Common prompt:

> Use case: logo-brand. Create ONE square app icon for a musical drawing canvas: graffiti and sound-wave interference fused into one bold unforgettable symbol. Flat warm ivory background, saturated plum and raspberry pigment only. NO gradients, no glow, no shadows, no text, no lettering, no mockup, no border. Physical wax crayon / oil pastel pigment, confident decisive thick strokes with strong directional tension, ragged dry edges but a solid readable silhouette, intentional negative space. Large centered mark filling 72% of the square with safe margins.

Append one direction for each generated image:

A:
> A single powerful ascending zigzag sound wave, drawn as one broad sweeping calligraphic crayon gesture. Deep plum main body, one short raspberry counter-stroke intersecting it. Dynamic compact iconic shape.

B:
> Two broad looping crayon gestures collide like interfering waves: one dark plum angular loop, one raspberry S wave cutting across. Strong asymmetrical balance, deliberate blunt ends, only two strokes.

C:
> A rough circular plum orbit broken by a bold raspberry waveform running through its middle. Ring and wave form one compact symbol. Assertive slashing gesture, physical pigment with visible pressure.

D:
> Three powerful slanted plum sound-wave strokes of different heights joined by a sweeping raspberry graffiti underline curling upward. Bold rhythmic silhouette, energetic like a signature but absolutely no letters.

## 发布尺寸

线上只发布 D 的 128 × 128 WebP，用于 favicon；左上角已改为作品名。256 × 256 方案仅作为设计存档。均为 quality 88 WebP，无放大尺寸或大 PNG 发布副本。原始生成文件保留在生成工具的默认存储目录，不参与构建。
