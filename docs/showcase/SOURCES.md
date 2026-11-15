# 展示图片与原片来源

README 展示的是 Pixel & Toon Studio v1.0.0 实际处理这三张照片的结果。照片来自 Unsplash，按 [Unsplash License](https://unsplash.com/license) 用于产品效果展示。照片版权仍归原摄影师，项目的 MIT 许可证不改变照片本身的许可。

## 三张原片

| 编号 | 照片 | 摄影师 | 来源 |
| --- | --- | --- | --- |
| C | 京都雨巷，撑伞的行人与传统建筑 | Hamza ERBAY | [Unsplash 原片](https://unsplash.com/photos/woman-holding-grey-umbrella-iRx2qFPhgk4) |
| D | 意大利五渔村的彩色房屋与海岸 | Sung Jin Cho | [Unsplash 原片](https://unsplash.com/photos/buildings-on-cliff-during-daytime-bwORldZq6BI) |
| E | 德国波恩的樱花街道 | Stephan Widua | [Unsplash 原片](https://unsplash.com/it/foto/albero-di-ciliegio-rosa-vicino-alle-auto-parcheggiate-in-strada-durante-il-giorno-ae4VmMbhanQ) |

为控制展示素材与处理时间，输入下载为宽 1600 px 的 JPEG：C 为 1600 × 2133，D 与 E 为 1600 × 1067。样例图片不代表摄影师或图中人物对项目的认可。

## 实际处理方式

- 所有艺术风格样例均使用当前生产构建，通过真实编辑器导入并导出 PNG；使用风格默认参数，智能调色与照片增强关闭。
- `editor.jpg` 是应用真实界面的截图：导入三张照片，海滨小镇选择水彩油画，并开启左右对比。
- `kyoto.jpg` 是 C 原图、默认复古胶片和默认黑白日漫的并排展示。
- `coast.jpg` 是 D 原图、默认赛璐璐和默认水彩油画的并排展示。
- `blossoms.jpg` 是 E 原图、默认水彩油画和默认彩铅手绘的并排展示。
- `styles.jpg` 展示八种风格，分别选用 C、D、E 的实际输出。缩略图为统一网格尺寸进行了裁切，各场景对比图与 PNG 文件保留完整构图。
- `frames.jpg` 是 C 复古胶片、D 水彩油画、E 彩铅手绘的相框 PNG 成品。三张都选择应用内文案 Postcard from here.。
- `enhancement.jpg` 使用 D 经浏览器高质量缩小得到的 600 × 400 输入，经实际 LiveAction 生成 1200 × 800 输出，与同一输入的浏览器高质量插值放大比较。两边均截取输出坐标 x=260、y=290、宽 503、高 300 的相同区域，以 1:1 像素显示；不叠加艺术风格。

排版图只进行缩放、组合与 JPEG 压缩，没有使用生成式图片、局部修补或额外调色来替代软件效果。

## 可直接打开的成品

`samples/` 下三张 PNG 是编辑器直接导出的文件，没有再次压缩或修改：

- [京都 · 黑白日漫](samples/kyoto-manga.png)
- [海滨小镇 · 水彩油画](samples/coast-watercolor.png)
- [樱花街道 · 彩铅手绘](samples/blossoms-pencil.png)

这些展示素材与 tests/fixtures 中用于代码回归的测试样片用途独立。README 不再使用宇航员或猫咪测试图作为产品展示。
