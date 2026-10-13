(function () {
  const EP = (window.EP = window.EP || {});

  function matchItem(item, f) {
    // unassigned：只看没有归入任何项目的素材（与 projectId 过滤互斥）
    if (f.unassigned && item.projectId) return false;
    if (f.projectId && item.projectId !== f.projectId) return false;
    if (f.themeId && item.themeId !== f.themeId) return false;
    if (f.categoryId && item.categoryId !== f.categoryId) return false;
    if (f.q) {
      const hay = [item.excerpt, item.note, item.pageTitle, item.url, item.publisher, (item.tags || []).join(' ')]
        .join(' ')
        .toLowerCase();
      if (hay.indexOf(String(f.q).toLowerCase()) === -1) return false;
    }
    return true;
  }

  function filterItems(data, f) {
    return (data.items || []).filter((item) => matchItem(item, f || {}));
  }

  function nameOf(list, id, fallback) {
    const hit = (list || []).find((x) => x.id === id);
    return hit ? hit.name : fallback || '未归类';
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  function group(items, data) {
    const byCategory = new Map();
    items.forEach((item) => {
      const themeKey = item.themeId || '__none_theme__';
      const catKey = item.categoryId || '__none_cat__';
      if (!byCategory.has(themeKey)) {
        byCategory.set(themeKey, { themeId: item.themeId, categories: new Map() });
      }
      const themeNode = byCategory.get(themeKey);
      if (!themeNode.categories.has(catKey)) {
        themeNode.categories.set(catKey, { categoryId: item.categoryId, items: [] });
      }
      themeNode.categories.get(catKey).items.push(item);
    });
    return byCategory;
  }

  function markdown(data, f) {
    const items = filterItems(data, f || {});
    const project = (data.projects || []).find((p) => p.id === (f || {}).projectId);
    const lines = [];

    const scopeTitle = f && f.unassigned ? '未归类素材' : project ? project.name : '全部素材';
    lines.push('# ' + scopeTitle + ' 研究素材包');
    lines.push('');
    lines.push('> Event Pocket · Collect signals. Build insights.');
    lines.push('> 导出时间：' + fmtDate(new Date().toISOString()));
    lines.push('> 素材数量：' + items.length + ' 条');
    if (f && f.themeId) lines.push('> 范围主题：' + nameOf(data.themes, f.themeId));
    if (f && f.categoryId) lines.push('> 范围类目：' + nameOf(data.categories, f.categoryId));
    lines.push('');

    if (!items.length) {
      lines.push('_当前筛选范围内没有素材。_');
      return lines.join('\n');
    }

    group(items, data).forEach((themeNode) => {
      const themeName = themeNode.themeId
        ? nameOf(data.themes, themeNode.themeId, '未归类主题')
        : '未归类主题';
      lines.push('## ' + themeName);
      lines.push('');

      themeNode.categories.forEach((catNode) => {
        const catName = catNode.categoryId
          ? nameOf(data.categories, catNode.categoryId, '未归类')
          : '未归类';
        lines.push('### ' + catName);
        lines.push('');

        catNode.items.forEach((item, idx) => {
          lines.push('#### Source ' + String(idx + 1).padStart(3, '0') + ' · ' + (item.pageTitle || '未命名来源'));
          lines.push('');
          lines.push('- URL：' + (item.url || ''));
          lines.push('- 来源：' + (item.publisher || ''));
          lines.push('- 类型：' + (item.sourceType || ''));
          lines.push('- 发布：' + (item.publishedAt || ''));
          lines.push('- 采集：' + fmtDate(item.capturedAt));
          if ((item.tags || []).length) lines.push('- 标签：' + item.tags.join(' / '));
          lines.push('');
          lines.push('**原文摘录**');
          lines.push('');
          lines.push(
            String(item.excerpt || '')
              .split('\n')
              .map((l) => '> ' + l)
              .join('\n') || '> （无）'
          );
          lines.push('');
          lines.push('**用户批注**');
          lines.push('');
          lines.push(item.note || '（无）');
          lines.push('');
          lines.push('---');
          lines.push('');
        });
      });
    });

    return lines.join('\n');
  }

  // 收集导出素材实际引用到的层级定义（最小集合），
  // 保证「导出 JSON」自包含：换版本导入时项目/主题/类目可完整还原，不再出现只有素材、树为空的问题。
  function referencedStructure(items, data) {
    const pIds = new Set();
    const tIds = new Set();
    const cIds = new Set();
    (items || []).forEach((it) => {
      if (it.projectId) pIds.add(it.projectId);
      if (it.themeId) tIds.add(it.themeId);
      if (it.categoryId) cIds.add(it.categoryId);
    });
    // 沿层级向上补齐父节点（类目→主题→项目），保证引用链完整不断裂
    (data.categories || []).forEach((c) => {
      if (cIds.has(c.id)) {
        if (c.themeId) tIds.add(c.themeId);
        if (c.projectId) pIds.add(c.projectId);
      }
    });
    (data.themes || []).forEach((t) => {
      if (tIds.has(t.id) && t.projectId) pIds.add(t.projectId);
    });
    return {
      projects: (data.projects || []).filter((p) => pIds.has(p.id)),
      themes: (data.themes || []).filter((t) => tIds.has(t.id)),
      categories: (data.categories || []).filter((c) => cIds.has(c.id))
    };
  }

  function json(data, f) {
    const items = filterItems(data, f || {});
    const structure = referencedStructure(items, data);
    return JSON.stringify(
      {
        generator: 'Event Pocket',
        exportedAt: new Date().toISOString(),
        scope: f || {},
        projects: structure.projects,
        themes: structure.themes,
        categories: structure.categories,
        items: items
      },
      null,
      2
    );
  }

  EP.exporter = { filterItems, markdown, json };
})();
