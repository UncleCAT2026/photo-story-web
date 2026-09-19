(() => {
  "use strict";

  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

  const state = {
    file: null,
    sourceUrl: "",
    resultUrl: "",
    selectedStyleId: window.PHOTO_STORY_STYLES[0].id,
    category: "all",
    query: "",
    subject: "auto",
    generating: false,
    settings: {
      endpoint: "https://api.openai.com/v1/images/edits",
      model: "gpt-image-1",
      key: "",
      authHeader: "Bearer {key}",
    },
  };

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    dropZone: $("#dropZone"),
    photoInput: $("#photoInput"),
    uploadEmpty: $("#uploadEmpty"),
    uploadPreview: $("#uploadPreview"),
    sourcePreview: $("#sourcePreview"),
    fileName: $("#fileName"),
    fileMeta: $("#fileMeta"),
    removePhoto: $("#removePhoto"),
    uploadError: $("#uploadError"),
    categoryTabs: $("#categoryTabs"),
    styleGrid: $("#styleGrid"),
    styleCount: $("#styleCount"),
    emptyStyles: $("#emptyStyles"),
    styleSearch: $("#styleSearch"),
    subjectType: $("#subjectType"),
    structureLevel: $("#structureLevel"),
    aspectRatio: $("#aspectRatio"),
    textPolicy: $("#textPolicy"),
    outputSize: $("#outputSize"),
    storyInput: $("#storyInput"),
    storyCount: $("#storyCount"),
    promptOutput: $("#promptOutput"),
    copyPrompt: $("#copyPrompt"),
    generateButton: $("#generateButton"),
    generationHint: $("#generationHint"),
    generationError: $("#generationError"),
    resultPanel: $("#resultPanel"),
    resultSummary: $("#resultSummary"),
    resultImage: $("#resultImage"),
    resultSource: $("#resultSource"),
    beforeLayer: $("#beforeLayer"),
    comparisonSlider: $("#comparisonSlider"),
    regenerateButton: $("#regenerateButton"),
    downloadResult: $("#downloadResult"),
    settingsButton: $("#settingsButton"),
    settingsDialog: $("#settingsDialog"),
    apiEndpoint: $("#apiEndpoint"),
    apiModel: $("#apiModel"),
    apiKey: $("#apiKey"),
    authHeader: $("#authHeader"),
    saveSettings: $("#saveSettings"),
    toast: $("#toast"),
  };

  function currentStyle() {
    return window.PHOTO_STORY_STYLES.find((style) => style.id === state.selectedStyleId);
  }

  function renderCategories() {
    elements.categoryTabs.replaceChildren(...window.PHOTO_STORY_CATEGORIES.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-tab";
      button.textContent = category.name;
      button.dataset.category = category.id;
      button.setAttribute("aria-pressed", String(state.category === category.id));
      button.addEventListener("click", () => {
        state.category = category.id;
        renderCategories();
        renderStyles();
      });
      return button;
    }));
  }

  function matchingStyles() {
    const query = state.query.trim().toLocaleLowerCase("zh-CN");
    return window.PHOTO_STORY_STYLES
      .filter((style) => state.category === "all" || style.category === state.category)
      .filter((style) => !query || [style.name, style.tags, style.directive, style.story].join(" ").toLocaleLowerCase("zh-CN").includes(query))
      .sort((left, right) => Number(isRecommended(right)) - Number(isRecommended(left)));
  }

  function isRecommended(style) {
    return state.subject !== "auto" && style.recommendedFor.includes(state.subject);
  }

  function renderStyles() {
    const styles = matchingStyles();
    elements.styleCount.textContent = window.PHOTO_STORY_STYLES.length;
    elements.emptyStyles.hidden = styles.length !== 0;
    elements.styleGrid.hidden = styles.length === 0;
    elements.styleGrid.replaceChildren(...styles.map((style) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "style-card";
      card.dataset.styleId = style.id;
      card.style.setProperty("--card-bg", style.color);
      card.setAttribute("aria-pressed", String(state.selectedStyleId === style.id));
      const recommended = isRecommended(style) ? '<span class="recommended">适合当前照片</span>' : "";
      card.innerHTML = `<span class="selected-mark" aria-hidden="true">✓</span><small>${escapeHtml(categoryName(style.category))}</small><strong>${escapeHtml(style.name)}</strong><span>${escapeHtml(style.tags)}</span>${recommended}`;
      card.addEventListener("click", () => {
        state.selectedStyleId = style.id;
        renderStyles();
        updatePrompt();
        updateGenerateState();
      });
      return card;
    }));
  }

  function categoryName(id) {
    return window.PHOTO_STORY_CATEGORIES.find((category) => category.id === id)?.name || id;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }

  function structureInstruction(value) {
    return {
      strict: "严格保持原图主体数量、轮廓、姿态、位置、比例、透视、前中后景和元素关系，不新增或删除主要对象。",
      balanced: "保持原图主体身份、主要轮廓、构图重心和空间关系；允许删减次要细节，以完整呈现目标风格。",
      expressive: "保留原图最具识别度的主体、姿态和叙事关系；允许适度重组尺度与留白，但不得改变核心事件。",
    }[value];
  }

  function textInstruction(value) {
    return {
      style: "文字遵循所选风格的内在规则；若该风格未要求文字，则不要主动添加。",
      none: "禁止添加任何标题、题字、印章、标语、品牌名、日期、编号或可识别文字。",
      minimal: "仅在不遮挡主体的留白中加入极少量、可读且与照片真实内容相关的题注；不要虚构地点、日期或事实。",
    }[value];
  }

  function buildPrompt() {
    const style = currentStyle();
    const ratio = elements.aspectRatio.value === "source" ? "保持原图画幅比例" : `输出画幅为 ${elements.aspectRatio.value}`;
    const customStory = elements.storyInput.value.trim();
    return [
      `将上传的参考照片转换为「${style.name}」风格。`,
      "",
      "【参考图与结构】",
      structureInstruction(elements.structureLevel.value),
      "必须把上传照片作为 reference image 使用。转换后仍应能明确看出与原图的对应关系。",
      "",
      `【${style.name}风格】`,
      style.directive,
      "",
      "【输出控制】",
      `${ratio}；主体完整，避免意外裁切、畸形、重复肢体、错位结构和低清晰度。`,
      textInstruction(elements.textPolicy.value),
      customStory ? `叙事情绪：${customStory}` : `叙事情绪：${style.story}。`,
      "",
      "【质量要求】",
      "风格语言必须贯彻全图；关键细节清晰，材质可信，色彩统一。禁止把风格简化成普通滤镜，禁止添加原图不存在且会改变叙事的主要元素。",
    ].join("\n");
  }

  function updatePrompt() {
    elements.promptOutput.textContent = buildPrompt();
  }

  function formatBytes(bytes) {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
  }

  function showFieldError(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  function clearSource() {
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.file = null;
    state.sourceUrl = "";
    elements.sourcePreview.src = transparentPixel;
    elements.uploadEmpty.hidden = false;
    elements.uploadPreview.hidden = true;
    elements.photoInput.value = "";
    showFieldError(elements.uploadError, "");
    updateGenerateState();
  }

  function loadPhoto(file) {
    showFieldError(elements.uploadError, "");
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      showFieldError(elements.uploadError, "不支持此文件格式。请选择 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showFieldError(elements.uploadError, "图片超过 20MB，请压缩后重试。");
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
      state.file = file;
      state.sourceUrl = url;
      elements.sourcePreview.src = url;
      elements.resultSource.src = url;
      elements.fileName.textContent = file.name;
      elements.fileMeta.textContent = `${probe.naturalWidth} × ${probe.naturalHeight} · ${formatBytes(file.size)}`;
      elements.uploadEmpty.hidden = true;
      elements.uploadPreview.hidden = false;
      updateGenerateState();
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      showFieldError(elements.uploadError, "浏览器无法读取这张图片，请确认文件未损坏。");
    };
    probe.src = url;
  }

  function updateGenerateState() {
    elements.generateButton.disabled = !state.file || state.generating;
    elements.generationHint.textContent = state.file
      ? `已选择「${currentStyle().name}」。未配置 API 时仍可复制提示词。`
      : "上传照片并选择风格后即可生成。也可以只复制提示词到其他图像工具使用。";
  }

  function settingsAreValid() {
    try {
      new URL(state.settings.endpoint);
    } catch {
      showFieldError(elements.generationError, "API Endpoint 不是有效 URL，请打开生成设置修正。");
      return false;
    }
    if (!state.settings.model.trim() || !state.settings.key.trim()) {
      showFieldError(elements.generationError, "请先在「生成设置」中填写 Model 和 API Key。");
      elements.settingsDialog.showModal();
      return false;
    }
    return true;
  }

  function setGenerating(generating) {
    state.generating = generating;
    elements.generateButton.querySelector(".button-label").hidden = generating;
    elements.generateButton.querySelector(".button-progress").hidden = !generating;
    elements.regenerateButton.disabled = generating;
    updateGenerateState();
  }

  function responseErrorMessage(status, body) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key 和 Authorization Header。";
    if (status === 429) return "请求过于频繁或额度不足，请稍后重试并检查账户额度。";
    if (status >= 500) return "图像服务暂时不可用，请稍后重试。";
    const details = body?.error?.message || body?.message;
    return details ? `生成失败：${details}` : `生成失败，服务返回 HTTP ${status}。`;
  }

  async function generateImage() {
    showFieldError(elements.generationError, "");
    if (!state.file || !settingsAreValid()) return;
    setGenerating(true);
    try {
      const form = new FormData();
      form.append("image", state.file, state.file.name);
      form.append("prompt", buildPrompt());
      form.append("model", state.settings.model);
      form.append("size", elements.outputSize.value);
      const authValue = state.settings.authHeader.replace("{key}", state.settings.key);
      const response = await fetch(state.settings.endpoint, {
        method: "POST",
        headers: { Authorization: authValue },
        body: form,
      });
      const contentType = response.headers.get("content-type") || "";
      const body = contentType.includes("application/json") ? await response.json() : null;
      if (!response.ok) throw new Error(responseErrorMessage(response.status, body));
      const item = body?.data?.[0];
      const resultUrl = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
      if (!resultUrl) throw new Error("服务响应中没有可识别的图片。请确认 Endpoint 兼容 OpenAI Images API。");
      state.resultUrl = resultUrl;
      elements.resultImage.src = resultUrl;
      elements.resultSummary.textContent = `${currentStyle().name} · ${elements.aspectRatio.options[elements.aspectRatio.selectedIndex].text}`;
      elements.resultPanel.hidden = false;
      elements.resultPanel.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      showToast("生成完成");
    } catch (error) {
      const corsHint = error instanceof TypeError ? "浏览器无法连接服务，可能是网络或 CORS 限制。可复制提示词改用其他工具。" : error.message;
      showFieldError(elements.generationError, corsHint);
    } finally {
      setGenerating(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildPrompt());
      showToast("提示词已复制");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(elements.promptOutput);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      showToast("已选中提示词，请按 Ctrl+C 复制");
    }
  }

  async function downloadImage() {
    if (!state.resultUrl) return;
    try {
      const response = await fetch(state.resultUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `photo-story-${currentStyle().name}.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      showToast("图片下载已开始");
    } catch {
      window.open(state.resultUrl, "_blank", "noopener,noreferrer");
      showToast("浏览器限制了直接下载，已在新窗口打开图片");
    }
  }

  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2200);
  }

  function bindEvents() {
    elements.dropZone.addEventListener("click", (event) => {
      if (!event.target.closest("button")) elements.photoInput.click();
    });
    elements.dropZone.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
        event.preventDefault();
        elements.photoInput.click();
      }
    });
    ["dragenter", "dragover"].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
    }));
    elements.dropZone.addEventListener("drop", (event) => loadPhoto(event.dataTransfer.files[0]));
    elements.photoInput.addEventListener("change", () => loadPhoto(elements.photoInput.files[0]));
    elements.removePhoto.addEventListener("click", (event) => { event.stopPropagation(); clearSource(); });
    elements.styleSearch.addEventListener("input", () => { state.query = elements.styleSearch.value; renderStyles(); });
    elements.styleSearch.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { elements.styleSearch.value = ""; state.query = ""; renderStyles(); }
    });
    elements.subjectType.addEventListener("change", () => { state.subject = elements.subjectType.value; renderStyles(); });
    [elements.structureLevel, elements.aspectRatio, elements.textPolicy].forEach((element) => element.addEventListener("change", updatePrompt));
    elements.storyInput.addEventListener("input", () => {
      elements.storyCount.textContent = elements.storyInput.value.length;
      updatePrompt();
    });
    elements.copyPrompt.addEventListener("click", copyPrompt);
    elements.generateButton.addEventListener("click", generateImage);
    elements.regenerateButton.addEventListener("click", generateImage);
    elements.downloadResult.addEventListener("click", downloadImage);
    elements.comparisonSlider.addEventListener("input", () => { elements.beforeLayer.style.width = `${elements.comparisonSlider.value}%`; });
    elements.settingsButton.addEventListener("click", () => elements.settingsDialog.showModal());
    elements.saveSettings.addEventListener("click", (event) => {
      event.preventDefault();
      state.settings = {
        endpoint: elements.apiEndpoint.value.trim(),
        model: elements.apiModel.value.trim(),
        key: elements.apiKey.value.trim(),
        authHeader: elements.authHeader.value.trim() || "Bearer {key}",
      };
      elements.settingsDialog.close();
      showToast("生成设置已应用，仅本次页面有效");
    });
    window.addEventListener("beforeunload", () => {
      if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
      if (state.resultUrl.startsWith("blob:")) URL.revokeObjectURL(state.resultUrl);
    });
  }

  elements.sourcePreview.src = transparentPixel;
  elements.resultImage.src = transparentPixel;
  elements.resultSource.src = transparentPixel;
  renderCategories();
  renderStyles();
  updatePrompt();
  updateGenerateState();
  bindEvents();
})();
