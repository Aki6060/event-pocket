(function () {
  const EP = window.EP;
  const root = document.getElementById('root');
  let data = null;
  let draft = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function options(list, selected, placeholder) {
    return '<option value="">' + placeholder + '</option>' + (list || []).map((x) =>
      '<option value="' + esc(x.id) + '"' + (selected === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'
    ).join('');
  }

  function setTheme() {
    if (EP.themes) EP.themes.apply((data.settings && data.settings.theme) || 'night', document.documentElement);
  }

  function themesOf(projectId) {
    return data.themes.filter((t) => t.projectId === projectId);
  }

  function categoriesOf(themeId) {
    return data.categories.filter((c) => c.themeId === themeId);
  }

  function toast(message) {
    const el = document.querySelector('#pdf-toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 1800);
  }

  function dialog(title, placeholder) {
    return new Promise((resolve) => {
      const box = document.querySelector('#pdf-dialog');
      box.hidden = false;
      box.innerHTML =
        '<div class="pdf-dialog-mask" data-close></div>' +
        '<div class="pdf-dialog-box"><div class="pdf-dialog-title">' + esc(title) + '</div>' +
        '<input id="pdf-dialog-input" placeholder="' + esc(placeholder) + '">' +
        '<div class="pdf-dialog-actions"><button class="ep-btn ghost" data-close>取消</button><button class="ep-btn primary" id="pdf-dialog-ok">新增</button></div></div>';
      const input = box.querySelector('#pdf-dialog-input');
      const done = (v) => { box.hidden = true; box.innerHTML = ''; resolve(v); };
      box.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => done('')));
      box.querySelector('#pdf-dialog-ok').addEventListener('click', () => done(input.value.trim()));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(input.value.trim());
        if (e.key === 'Escape') done('');
      });
      setTimeout(() => input.focus(), 0);
    });
  }

  async function addNode(type, name, parent) {
    if (!name) return null;
    const node = type === 'project'
      ? EP.model.createProject(name)
      : type === 'theme'
        ? EP.model.createTheme(parent.projectId, name)
        : EP.model.createCategory(parent.projectId, parent.themeId, name);
    await EP.store.update((d) => {
      if (type === 'project') { d.projects.push(node); d.settings.lastProjectId = node.id; }
      else if (type === 'theme') d.themes.push(node);
      else d.categories.push(node);
    });
    data = await EP.store.get();
    return node;
  }

  function render() {
    if (!draft) {
      root.innerHTML = '<main class="pdf-collect"><div class="pdf-empty">没有待收录的 PDF 选文。<br>请回到 PDF，选中文字后右键「保存到 Event Pocket」。</div></main>';
      return;
    }
    root.innerHTML =
      '<main class="pdf-collect">' +
      '<header class="pdf-head"><div class="pdf-logo">EP</div><div><div class="pdf-title">收录 PDF 选文</div><div class="pdf-sub">Collect signals. Build insights.</div></div></header>' +
      '<div class="pdf-main">' +
      '<div class="pdf-source"><div class="pdf-source-type">PDF Document</div><div class="pdf-source-name" title="' + esc(draft.pageTitle) + '">' + esc(draft.pageTitle || 'PDF 文档') + '</div></div>' +
      '<div class="pdf-form">' +
      '<label>原文摘录<textarea id="f-excerpt" rows="5">' + esc(draft.excerpt) + '</textarea></label>' +
      '<label>我的批注（选填）<textarea id="f-note" rows="3" placeholder="为什么值得留？可能支撑什么判断？"></textarea></label>' +
      '<label>项目 <button class="pdf-add" id="add-project" type="button">+ 新增项目</button><select id="f-project"></select></label>' +
      '<div class="pdf-row"><label>主题 <button class="pdf-add" id="add-theme" type="button">+ 新增主题</button><select id="f-theme"></select></label>' +
      '<label>类目 <button class="pdf-add" id="add-category" type="button">+ 新增类目</button><select id="f-category"></select></label></div>' +
      '<div class="pdf-row"><label>类型<select id="f-type">' + EP.model.SOURCE_TYPES.map((t) => '<option>' + t + '</option>').join('') + '</select></label>' +
      '<label>标签<input id="f-tags" placeholder="用逗号分隔"></label></div>' +
      '</div></div>' +
      '<footer class="pdf-foot"><button class="ep-btn ghost" id="cancel">取消</button><button class="ep-btn primary" id="save">收录</button></footer>' +
      '<div class="pdf-toast" id="pdf-toast" hidden></div><div class="pdf-dialog" id="pdf-dialog" hidden></div>' +
      '</main>';

    const project = root.querySelector('#f-project');
    const theme = root.querySelector('#f-theme');
    const category = root.querySelector('#f-category');
    const refreshSelects = (preserveProject) => {
      const pid = preserveProject || project.value || data.settings.lastProjectId || '';
      project.innerHTML = options(data.projects, pid, '未归类');
      theme.innerHTML = options(themesOf(project.value), '', '未归类');
      category.innerHTML = options([], '', '未归类');
    };
    refreshSelects();
    project.addEventListener('change', () => { theme.innerHTML = options(themesOf(project.value), '', '未归类'); category.innerHTML = options([], '', '未归类'); });
    theme.addEventListener('change', () => { category.innerHTML = options(categoriesOf(theme.value), '', '未归类'); });

    root.querySelector('#add-project').addEventListener('click', async () => {
      const node = await addNode('project', await dialog('新增项目', '例如：IFA 2026'));
      if (!node) return;
      refreshSelects(node.id);
    });
    root.querySelector('#add-theme').addEventListener('click', async () => {
      if (!project.value) return toast('请先选择项目');
      const node = await addNode('theme', await dialog('新增主题', '例如：AI 与主动执行'), { projectId: project.value });
      if (!node) return;
      theme.innerHTML = options(themesOf(project.value), node.id, '未归类');
      category.innerHTML = options([], '', '未归类');
    });
    root.querySelector('#add-category').addEventListener('click', async () => {
      if (!project.value || !theme.value) return toast('请先选择项目和主题');
      const node = await addNode('category', await dialog('新增类目', '例如：家庭场景'), { projectId: project.value, themeId: theme.value });
      if (!node) return;
      category.innerHTML = options(categoriesOf(theme.value), node.id, '未归类');
    });

    root.querySelector('#cancel').addEventListener('click', () => window.close());
    root.querySelector('#save').addEventListener('click', async () => {
      const excerpt = root.querySelector('#f-excerpt').value.trim();
      if (!excerpt) return toast('请保留至少一段原文摘录');
      const pid = project.value || null;
      await EP.store.update((d) => {
        d.items.push(EP.model.createItem({
          excerpt,
          note: root.querySelector('#f-note').value.trim(),
          projectId: pid,
          themeId: pid ? (theme.value || null) : null,
          categoryId: pid ? (category.value || null) : null,
          pageTitle: draft.pageTitle || 'PDF 文档',
          url: draft.url || '',
          publisher: draft.publisher || '',
          publishedAt: draft.publishedAt || '',
          sourceType: root.querySelector('#f-type').value,
          tags: root.querySelector('#f-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
          documentType: 'pdf'
        }));
        if (pid) d.settings.lastProjectId = pid;
      });
      try { chrome.runtime.sendMessage({ type: 'EP_CLEAR_PDF_DRAFT' }); } catch (e) { /* 忽略 */ }
      toast('已收录');
      setTimeout(() => window.close(), 600);
    });
  }

  (async () => {
    data = await EP.store.get();
    setTheme();
    try {
      draft = await new Promise((resolve) => chrome.runtime.sendMessage({ type: 'EP_GET_PDF_DRAFT' }, resolve));
    } catch (e) {
      draft = null;
    }
    render();
  })();
})();
