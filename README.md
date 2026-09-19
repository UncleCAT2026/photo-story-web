# Photo Story Web

零依赖的浏览器照片故事工作台。它将 `photo-story` 技能的风格知识整理成可搜索、可配置、可直接调用图像编辑 API 的单页工具。

## 在线使用

公开站点：<https://unclecat2026.github.io/photo-story-web/>

## 运行

直接打开 `index.html` 可使用上传、风格筛选、提示词生成与复制功能。若浏览器限制本地文件脚本，可在仓库根目录启动任意静态服务器，例如：

```powershell
python -m http.server 4173
```

然后访问 `http://localhost:4173/examples/photo-story-web/`。

## 图像生成

1. 上传 JPG、PNG 或 WebP 参考图。
2. 选择风格并调整结构保留、画幅、文字策略和故事感。
3. 在“生成设置”中填写 OpenAI-compatible `images/edits` Endpoint、Model 和 API Key。
4. 点击“生成照片故事”。

请求使用 `multipart/form-data`，始终把上传照片作为 `image` 字段传入。响应支持 OpenAI Images API 的 `data[0].b64_json` 或 `data[0].url`。

## 安全与兼容边界

- API Key 只保存在当前页面的 JavaScript 内存中，不写入 `localStorage`、URL 或仓库。
- 浏览器会直接连接配置的 Endpoint；目标服务必须允许浏览器 CORS 请求。
- 不建议在共享设备或不可信网页环境中使用生产密钥。
- 未配置 API 或服务不兼容时，提示词生成、复制和照片预览仍可正常使用。
- 本示例不包含生成图片、客户数据、远程字体、追踪脚本或未经授权素材。

## 来源与许可

风格知识改编自 `photo-story` 技能（MIT License）。界面与代码为本仓库可审阅的原生 HTML、CSS 和 JavaScript 示例。
