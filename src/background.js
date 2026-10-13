const KEY = 'event-pocket:v2';
const LEGACY_KEYS = ['event-pocket:v1'];
const PDF_DRAFT_KEY = 'event-pocket:pdf-draft';

function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function emptyData() {
  return { version: 2, projects: [], themes: [], categories: [], items: [], settings: { lastProjectId: null } };
}

// 与管理页 EP.store 保持同一份 schema 与归一逻辑，杜绝两套存储键分裂
function normalize(data) {
  const base = emptyData();
  if (!data || typeof data !== 'object') return base;
  const merged = Object.assign(base, data, {
    settings: Object.assign(base.settings, data.settings || {})
  });
  merged.version = 2;
  return merged;
}

function readRaw() {
  return new Promise((resolve) => {
    chrome.storage.local.get(KEY, (obj) => resolve(obj && obj[KEY] ? obj[KEY] : null));
  });
}

function read() {
  return readRaw().then((d) => normalize(d || emptyData()));
}

function write(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [KEY]: data }, () => resolve(true));
  });
}

// 一次性合并：把历史 v1 键数据按 id 并入当前 v2 键，再删除 v1。
// 修复 0.5.2 升级时 background 仍读 v1、与素材管理页（v2）分裂，导致浮窗取树/建节点/存素材不同步。
async function migrate() {
  for (const lk of LEGACY_KEYS) {
    const legacy = await new Promise((resolve) => chrome.storage.local.get(lk, (o) => resolve(o && o[lk] ? o[lk] : null)));
    if (!legacy) continue;
    const cur = normalize(await readRaw() || {});
    const merge = (key, seen) => {
      (legacy[key] || []).forEach((x) => { if (x && x.id && !seen.has(x.id)) cur[key].push(x); });
    };
    merge('projects', new Set((cur.projects || []).map((x) => x.id)));
    merge('themes', new Set((cur.themes || []).map((x) => x.id)));
    merge('categories', new Set((cur.categories || []).map((x) => x.id)));
    merge('items', new Set((cur.items || []).map((x) => x.id)));
    if (legacy.settings && typeof legacy.settings === 'object') {
      cur.settings = Object.assign(cur.settings, legacy.settings);
    }
    await write(cur);
    await new Promise((resolve) => chrome.storage.local.remove(lk, resolve));
  }
}

function writePdfDraft(draft) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [PDF_DRAFT_KEY]: draft }, () => resolve(true));
  });
}

function defaultProjectId(data) {
  return data.settings.lastProjectId || (data.projects[0] && data.projects[0].id) || null;
}

function isPdfTab(tab) {
  const url = String((tab && tab.url) || '').toLowerCase();
  const title = String((tab && tab.title) || '').toLowerCase();
  // Chrome 的内置 PDF Viewer 地址和常见 .pdf URL 都覆盖；文件名也作为保守兜底
  return url.indexOf('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/') === 0 ||
    /\.pdf(?:[?#]|$)/.test(url) || /\.pdf$/.test(title);
}

function originalPdfUrl(tab, info) {
  const raw = String((tab && tab.url) || '');
  const pageUrl = String((info && info.pageUrl) || '');
  // Chrome PDF Viewer 常把原始地址放在 ?file= 参数中；优先保存原文档 URL，而非 chrome-extension:// viewer 地址。
  for (const value of [raw, pageUrl]) {
    const match = value.match(/[?&]file=([^&]+)/);
    if (match) {
      try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
    }
  }
  return pageUrl || raw;
}

function pdfName(tab, info) {
  const title = String((tab && tab.title) || '').trim();
  if (title) return title;
  const raw = originalPdfUrl(tab, info).split(/[?#]/)[0];
  try { return decodeURIComponent(raw.split('/').pop() || 'PDF 文档'); } catch (e) { return 'PDF 文档'; }
}

function openPdfCollectWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL('src/pdf-collect.html'),
    type: 'popup',
    width: 460,
    height: 720
  });
}

async function createNode(payload) {
  await migrate();
  const data = await read();
  const p = payload || {};
  const name = String(p.name || '').trim();
  if (!name) return null;

  let node = null;
  if (p.type === 'project') {
    node = { id: uid(), name, note: '', createdAt: new Date().toISOString() };
    data.projects.push(node);
    data.settings.lastProjectId = node.id;
  } else if (p.type === 'theme' && p.projectId) {
    node = { id: uid(), projectId: p.projectId, name, createdAt: new Date().toISOString() };
    data.themes.push(node);
  } else if (p.type === 'category' && p.projectId && p.themeId) {
    node = { id: uid(), projectId: p.projectId, themeId: p.themeId, name, createdAt: new Date().toISOString() };
    data.categories.push(node);
  }
  if (!node) return null;
  await write(data);
  return { node, tree: {
    projects: data.projects,
    themes: data.themes,
    categories: data.categories,
    lastProjectId: data.settings.lastProjectId || null,
    theme: data.settings.theme || 'night'
  }};
}

async function saveItem(payload) {
  await migrate();
  const data = await read();
  const page = (payload && payload.page) || {};
  const p = payload || {};
  data.items.push({
    id: uid(),
    // 浮窗明确选择「未归类」时保留 null；右键等旧调用未传 projectId 才使用默认项目
    projectId: Object.prototype.hasOwnProperty.call(p, 'projectId') ? (p.projectId || null) : defaultProjectId(data),
    themeId: p.themeId || null,
    categoryId: p.categoryId || null,
    excerpt: (payload && payload.excerpt) || '',
    note: (payload && payload.note) || '',
    pageTitle: page.pageTitle || '',
    url: page.url || '',
    publisher: page.publisher || '',
    publishedAt: page.publishedAt || '',
    capturedAt: new Date().toISOString(),
    sourceType: (payload && payload.sourceType) || '其他',
    tags: (payload && payload.tags) || []
  });
  await write(data);
  badge();
  return true;
}

function badge() {
  try {
    chrome.action.setBadgeText({ text: '✓' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
  } catch (e) {
    // 忽略徽标异常
  }
}

// 降级：独立小窗口（比标签页更轻，且不打断当前浏览）
function openManageWindow() {
  try {
    chrome.windows.create({
      url: chrome.runtime.getURL('src/manage.html'),
      type: 'popup',
      width: 460,
      height: 720
    });
  } catch (e) {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/manage.html') });
  }
}

// 优先侧边栏；不支持或打开失败时降级为小窗口 / 标签页
function openManage() {
  if (!(chrome.sidePanel && chrome.sidePanel.open)) return openManageWindow();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs && tabs[0] ? tabs[0].id : null;
    const done = () => {
      if (chrome.runtime.lastError) openManageWindow();
    };
    try {
      if (tabId) chrome.sidePanel.open({ tabId }, done);
      else chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT }, done);
    } catch (e) {
      openManageWindow();
    }
  });
}

// 点击工具栏图标 = 打开素材管理（用户手势，可靠触发侧边栏）
chrome.action.onClicked.addListener(() => {
  openManage();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ep-capture-selection',
    title: '收录到 Event Pocket',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'ep-capture-page',
    title: '保存本页到 Event Pocket',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'ep-open-manage',
    title: '打开 Event Pocket 素材管理',
    contexts: ['page', 'selection']
  });

  // 图标右键菜单：Chrome 支持 action context，失败不影响其他菜单
  try {
    chrome.contextMenus.create({
      id: 'ep-open-manage-window',
      title: '在新窗口打开素材管理',
      contexts: ['action']
    });
  } catch (e) {
    // 部分浏览器不支持 action context，忽略
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ep-open-manage') {
    openManage();
    return;
  }
  if (info.menuItemId === 'ep-open-manage-window') {
    openManageWindow();
    return;
  }

  const selection = info.menuItemId === 'ep-capture-selection' ? String(info.selectionText || '').trim() : '';

  // Chrome 内置 PDF Viewer 不允许注入 content.js；但右键菜单会安全地把 selectionText 交给扩展。
  // 用插件自有采集窗补齐批注与归档，保留浏览器原生阅读体验。
  if (info.menuItemId === 'ep-capture-selection' && isPdfTab(tab)) {
    await writePdfDraft({
      documentType: 'pdf',
      excerpt: selection,
      pageTitle: pdfName(tab, info),
      url: originalPdfUrl(tab, info),
      publisher: '',
      publishedAt: '',
      capturedAt: new Date().toISOString()
    });
    openPdfCollectWindow();
    return;
  }

  const page = { pageTitle: tab && tab.title ? tab.title : '', url: tab && tab.url ? tab.url : '', publisher: '', publishedAt: '', selection };
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'EP_CAPTURE' });
    if (res) {
      page.pageTitle = res.pageTitle || page.pageTitle;
      page.url = res.url || page.url;
      page.publisher = res.publisher || '';
      page.publishedAt = res.publishedAt || '';
    }
  } catch (e) {
    // 页面无内容脚本时，回退使用标签页基本信息
  }

  await saveItem({ excerpt: selection, note: '', page });
});

// 来自划词浮窗的保存请求
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'EP_GET_TREE') {
    (async () => {
      await migrate();
      const d = await read();
      sendResponse({
        projects: d.projects,
        themes: d.themes,
        categories: d.categories,
        lastProjectId: d.settings.lastProjectId || (d.projects[0] && d.projects[0].id) || null,
        theme: d.settings.theme || 'night'
      });
    })();
    return true;
  }
  if (msg && msg.type === 'EP_GET_PDF_DRAFT') {
    chrome.storage.local.get(PDF_DRAFT_KEY, (obj) => sendResponse((obj && obj[PDF_DRAFT_KEY]) || null));
    return true;
  }
  if (msg && msg.type === 'EP_CLEAR_PDF_DRAFT') {
    chrome.storage.local.remove(PDF_DRAFT_KEY, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'EP_CREATE_NODE') {
    createNode(msg.payload).then((result) => sendResponse(result ? { ok: true, node: result.node, tree: result.tree } : { ok: false }));
    return true;
  }
  if (msg && msg.type === 'EP_SAVE_QUICK') {
    saveItem(msg.payload).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'EP_OPEN_MANAGE') {
    openManage();
    sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.type === 'EP_OPEN_MANAGE_WINDOW') {
    openManageWindow();
    sendResponse({ ok: true });
    return true;
  }
});
