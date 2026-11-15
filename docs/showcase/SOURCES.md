# 展示图片与原片来源

README 展示的是 Pixel & Toon Studio 实际处理这些照片的结果。照片来自 Unsplash，按 [Unsplash License](https://unsplash.com/license) 用于产品效果展示。照片版权仍归原摄影师，项目的 MIT 许可证不改变照片本身的许可。

## 原片

| 编号 | 照片 | 摄影师 | 来源 |
| --- | --- | --- | --- |
| C | 京都雨巷，撑伞的行人与传统建筑 | Hamza ERBAY | [Unsplash 原片](https://unsplash.com/photos/woman-holding-grey-umbrella-iRx2qFPhgk4) |
| D | 意大利五渔村的彩色房屋与海岸 | Sung Jin Cho | [Unsplash 原片](https://unsplash.com/photos/buildings-on-cliff-during-daytime-bwORldZq6BI) |
| E | 德国波恩的樱花街道 | Stephan Widua | [Unsplash 原片](https://unsplash.com/it/foto/albero-di-ciliegio-rosa-vicino-alle-auto-parcheggiate-in-strada-durante-il-giorno-ae4VmMbhanQ) |
| F | 美式餐厅与老车 | Preston Bousley | [Unsplash 原片](https://unsplash.com/photos/a-red-car-parked-in-front-of-a-restaurant-WUmW5MR0cyQ) |

为控制展示素材与处理时间，输入下载为宽 1600 px 的 JPEG：C 为 1600 × 2133，D 与 E 为 1600 × 1067。F 同样以宽 1600 px JPEG 作为输入。样例图片不代表摄影师、照片中的人物、商家或车辆品牌对项目的认可。照片许可不自动涵盖人物肖像、商标等其他权利。

## 实际处理方式

- 所有艺术风格样例均使用当前生产构建，通过真实编辑器导入并导出 PNG；使用风格默认参数，智能调色与照片增强关闭。胶片与美式波普展示来自 v1.0.1；其他风格与 v1.0.0 的处理算法相同。
- `editor.jpg` 是应用真实界面的截图：导入三张照片，海滨小镇选择水彩油画，并开启左右对比。
- `kyoto.jpg` 是 C 原图、默认复古胶片和默认黑白日漫的并排展示。
- `coast.jpg` 是 D 原图、默认赛璐璐和默认水彩油画的并排展示。
- `blossoms.jpg` 是 E 原图、默认水彩油画和默认彩铅手绘的并排展示。
- `styles.jpg` 展示八种风格，分别选用 C、D、E、F 的实际输出；波普使用 F，胶片使用 v1.0.1 新默认。缩略图为统一网格尺寸进行了裁切，各场景对比图与 PNG 文件保留完整构图。
- `americana.jpg` 是 F 原图与默认美漫波普，不叠加智能调色。
- `film.jpg` 比较 C 原图、v1.0.0 原版胶片与 v1.0.1 新版胶片，下面是三个相同位置的 1:1 局部。新版默认：褪色 48、颗粒 64、柔化涂抹 45、色温 24、高光晕染 38；原版为 38、28、0、24、22。
- `frames.jpg` 是 C 新版复古胶片、D 水彩油画、E 彩铅手绘的相框 PNG 成品。三张都选择应用内文案 Postcard from here.。
- `enhancement.jpg` 使用 D 经浏览器高质量缩小得到的 600 × 400 输入，经实际 LiveAction 生成 1200 × 800 输出，与同一输入的浏览器高质量插值放大比较。两边均截取输出坐标 x=260、y=290、宽 503、高 300 的相同区域，以 1:1 像素显示；不叠加艺术风格。

排版图只进行缩放、组合与 JPEG 压缩，没有使用生成式图片、局部修补或额外调色来替代软件效果。

## 可直接打开的成品

`samples/` 下的 PNG 是编辑器直接导出的文件，没有再次压缩或修改：

- [京都 · 黑白日漫](samples/kyoto-manga.png)
- [海滨小镇 · 水彩油画](samples/coast-watercolor.png)
- [樱花街道 · 彩铅手绘](samples/blossoms-pencil.png)
- [美式餐厅 · 美漫波普](samples/americana-pop.png)
- [京都 · 新版复古胶片](samples/kyoto-film.png)

这些展示素材与 tests/fixtures 中用于代码回归的测试样片用途独立。README 不再使用宇航员或猫咪测试图作为产品展示。
