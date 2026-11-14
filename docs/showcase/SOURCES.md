# 展示图来源与制作说明

README 的所有界面与效果图均由 Pixel & Toon Studio v1.0.0 的实际生产构建产生。没有通过生成式图片模拟、修补或夸大处理效果。

## 原图

采用与回归样片相同来源的 scikit-image v0.25.2 公开图片：

| 原图 | 作者 / 权利说明 | 固定来源 |
| --- | --- | --- |
| astronaut.png（512 × 512） | NASA，宇航员 Eileen Collins；public domain | [原始文件](https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/astronaut.png) |
| chelsea.png（451 × 300） | Stefan van der Walt；CC0 | [原始文件](https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/chelsea.png) |

作者和许可说明：[scikit-image v0.25.2 官方数据说明](https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/_fetchers.py)。人物与宠物图片仅用于说明功能，不代表原作者、NASA 或图中人物对项目的认可。

## 文件对应关系

- `editor.jpg`：网页生产构建的真实浅色界面，导入两张图片，选择水彩油画并开启左右对比。
- `styles.jpg`：同一张 astronaut 原图在八种风格下的真实 PNG 导出，使用各自默认参数，不开启智能调色或照片增强。
- `portrait.jpg`：astronaut 原图、默认赛璐璐与默认黑白日漫输出。
- `pets.jpg`：chelsea 原图、默认彩铅手绘与默认复古胶片输出。
- `enhancement.jpg`：tests/fixtures/local-v2/low/chelsea-bicubic.png（225 × 150）经 LiveAction 生成 450 × 300 的真实增强底图，未叠加艺术滤镜。左侧输入以最近邻放大，右侧按同等显示尺寸展示。
- `frames.jpg`：复古胶片人像、彩铅手绘宠物的真实相框 PNG 导出，选择应用内短句 Life lately.。

画廊仅做等比例排版、缩放和 JPEG 压缩，保留图像内容。网页和 Mac 使用同一套处理管线；展示不构成对所有照片效果或恢复能力的保证。
