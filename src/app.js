(function () {
  const EP = (window.EP = window.EP || {});

  const state = {
    data: null,
    projectId: null,
    themeId: null,
    categoryId: null,
    q: ''
  };

  let root = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  function nameOf(list, id, fallback) {
    const hit = (list || []).find((x) => x.id === id);
    return hit ? hit.name : fallback || '未归类';
  }

  function currentThemeId() {
    return (state.data && state.data.settings && state.data.settings.theme) || 'night';
  }

  // 视图范围：project=某个项目 / all=查看全部 / unassigned=只看未归入项目的素材
  // 存在 settings.viewMode 里，刷新侧栏后保持；默认值 project 兼容旧数据
  function currentViewMode() {
    return (state.data && state.data.settings && state.data.settings.viewMode) || 'project';
  }

  function isAllView() {
    return currentViewMode() === 'all';
  }

  function isUnassignedView() {
    return currentViewMode() === 'unassigned';
  }

  function isCrossProjectView() {
    return isAllView() || isUnassignedView();
  }

  function setViewMode(mode) {
    state.data.settings.viewMode = mode;
  }

  // 主题变量写在 documentElement 上：弹窗 #ep-modal 在 .ep-app 之外，只有 :root 级别的变量才全局生效
  function applyTheme() {
    if (EP.themes) EP.themes.apply(currentThemeId(), document.documentElement);
  }

  function themesOf(projectId) {
    return state.data.themes.filter((t) => t.projectId === projectId);
  }

  function themesOfProject() {
    // 查看全部 / 未归类 下没有单一项目口径，展示所有项目的主题
    return isCrossProjectView() ? state.data.themes.slice() : themesOf(state.projectId);
  }

  // 类目通过 themeId 已隐含项目归属，不再按项目二次过滤（避免切项目后类目被误清空）
  function categoriesOfTheme(themeId) {
    return state.data.categories.filter((c) => c.themeId === themeId);
  }

  function currentFilter() {
    return {
      projectId: state.projectId,
      themeId: state.themeId,
      categoryId: state.categoryId,
      q: state.q,
      unassigned: isUnassignedView()
    };
  }

  function render() {
    if (!root || !state.data) return;
    root.innerHTML = shell();
    bindShell();
    renderSidebar();
    renderList();
  }

  function shell() {
    return (
      '<div class="ep-app">' +
      '<header class="ep-head">' +
      '<div class="ep-brand"><span class="ep-logo">EP</span>' +
      '<div><div class="ep-title">Event Pocket</div>' +
      '<div class="ep-slogan">Collect signals. Build insights.</div></div></div>' +
      '<div class="ep-actions">' +
      '<button class="ep-btn primary" data-action="new-item">新增素材</button>' +
      '<button class="ep-btn" data-action="export-md">导出 Markdown</button>' +
      '<button class="ep-btn" data-action="export-json">导出 JSON</button>' +
      '<button class="ep-btn ghost" data-action="import-json">导入</button>' +
      '<button class="ep-btn ghost" data-action="export-backup">备份</button>' +
      '<button class="ep-btn ghost" data-action="theme">换肤</button>' +
      '</div></header>' +
      '<div class="ep-body">' +
      '<aside class="ep-side" id="ep-side"></aside>' +
      '<main class="ep-main">' +
      '<div class="ep-filter">' +
      '<input id="ep-q" class="ep-input" placeholder="搜索原文、批注、标题、标签" value="' + esc(state.q) + '">' +
      '<button class="ep-btn ghost sm" data-action="clear-filter">清除筛选</button>' +
      '</div>' +
      '<div class="ep-list" id="ep-list"></div>' +
      '</main></div></div>' +
      '<div class="ep-modal" id="ep-modal" hidden></div>'
    );
  }

  function bindShell() {
    // [data-action] 已改为 root 级事件委托（见 mount），不再逐元素绑定

    const q = root.querySelector('#ep-q');
    if (q) {
      q.addEventListener('input', () => {
        state.q = q.value.trim();
        renderList();
      });
      q.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') q.blur();
      });
    }
  }

  function renderSidebar() {
    const side = root.querySelector('#ep-side');
    if (!side) return;

    const items = state.data.items || [];
    const mode = currentViewMode();
    const unassignedCount = items.filter((i) => !i.projectId).length;

    // 三个同级根节点：查看全部 / 未归类 / 项目（三级树只挂在「项目」下面）
    const scopes =
      '<div class="ep-node ep-root-node' + (mode === 'all' ? ' on' : '') + '" data-view="all">' +
      '<span class="ep-node-name">查看全部</span>' +
      '<span class="ep-count">' + items.length + '</span>' +
      '</div>' +
      '<div class="ep-node ep-root-node' + (mode === 'unassigned' ? ' on' : '') + '" data-view="unassigned">' +
      '<span class="ep-node-name">未归类</span>' +
      '<span class="ep-count">' + unassignedCount + '</span>' +
      '</div>';

    // 一棵真实的三级树：项目 → 主题 → 类目；每一级节点右侧 + 只创建下一级。
    const projects = state.data.projects.map((p) => {
      const themes = state.data.themes.filter((t) => t.projectId === p.id).map((t) => {
        const cats = state.data.categories.filter((c) => c.themeId === t.id).map((c) =>
          '<div class="ep-node ep-tree-node ep-tree-cat' + (state.categoryId === c.id ? ' on' : '') + '" data-category="' + c.id + '">' +
          '<span class="ep-node-name">' + esc(c.name) + '</span>' +
          '<button class="ep-mini" data-ren-category="' + c.id + '" title="重命名">✎</button>' +
          '<button class="ep-mini" data-del-category="' + c.id + '" title="删除类目">×</button></div>'
        ).join('');
        return '<div class="ep-tree-branch"><div class="ep-node ep-tree-node ep-tree-theme' +
          (state.themeId === t.id && !state.categoryId ? ' on' : '') + '" data-theme="' + t.id + '">' +
          '<span class="ep-node-name">' + esc(t.name) + '</span>' +
          '<button class="ep-tree-add" data-add-category="' + t.id + '" title="在「' + esc(t.name) + '」下新增类目">+ 类目</button>' +
          '<button class="ep-mini" data-ren-theme="' + t.id + '" title="重命名">✎</button>' +
          '<button class="ep-mini" data-del-theme="' + t.id + '" title="删除主题">×</button></div>' +
          '<div class="ep-tree-children">' + cats + '</div></div>';
      }).join('');
      return '<div class="ep-tree-branch"><div class="ep-node ep-tree-node ep-tree-project' +
        (state.projectId === p.id ? ' on' : '') + '" data-project="' + p.id + '">' +
        '<span class="ep-dot"></span><span class="ep-node-name">' + esc(p.name) + '</span>' +
        '<button class="ep-tree-add" data-add-theme="' + p.id + '" title="在「' + esc(p.name) + '」下新增主题">+ 主题</button>' +
        '<button class="ep-mini" data-ren-project="' + p.id + '" title="重命名">✎</button>' +
        '<button class="ep-mini" data-del-project="' + p.id + '" title="删除项目">×</button></div>' +
        '<div class="ep-tree-children">' + themes + '</div></div>';
    }).join('');

    side.innerHTML =
      '<div class="ep-side-block">' +
      scopes +
      '<div class="ep-root-node ep-project-root">' +
      '<div class="ep-node"><span class="ep-node-name">项目</span>' +
      '<button class="ep-tree-add ep-root-add" data-action="new-project" title="新增项目">+ 新增项目</button></div>' +
      '<div class="ep-tree">' + (projects || '<div class="ep-empty-sm">还没有项目，点击「+ 新增项目」开始。</div>') + '</div>' +
      '</div></div>';

    side.querySelectorAll('[data-view]').forEach((el) => {
      el.addEventListener('click', async () => {
        setViewMode(el.getAttribute('data-view'));
        state.projectId = null;
        state.themeId = null;
        state.categoryId = null;
        await EP.store.set(state.data);
        render();
      });
    });

    side.querySelectorAll('[data-project]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const add = e.target.getAttribute('data-add-theme');
        if (add) return addTheme(add);
        if (e.target.getAttribute('data-del-project')) return;
        if (e.target.getAttribute('data-ren-project')) return;
        state.projectId = el.getAttribute('data-project');
        state.themeId = null;
        state.categoryId = null;
        setViewMode('project');
        state.data.settings.lastProjectId = state.projectId;
        EP.store.set(state.data);
        render();
      });
    });

    side.querySelectorAll('[data-theme]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const add = e.target.getAttribute('data-add-category');
        const ren = e.target.getAttribute('data-ren-theme');
        const del = e.target.getAttribute('data-del-theme');
        if (add) return addCategory(add);
        if (ren) return renameTheme(ren);
        if (del) return delTheme(del);
        state.themeId = el.getAttribute('data-theme');
        state.categoryId = null;
        render();
      });
    });

    side.querySelectorAll('[data-category]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const ren = e.target.getAttribute('data-ren-category');
        if (ren) return renameCategory(ren);
        if (e.target.getAttribute('data-del-category')) return delCategory(e.target.getAttribute('data-del-category'));
        state.themeId = null;
        state.categoryId = el.getAttribute('data-category');
        render();
      });
    });

    side.querySelectorAll('[data-del-project]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        delProject(el.getAttribute('data-del-project'));
      });
    });

    side.querySelectorAll('[data-ren-project]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        renameProject(el.getAttribute('data-ren-project'));
      });
    });
  }

  // 素材归属路径：跨项目视图下补上项目名，未归类素材只显示「未归类」
  function itemPath(item) {
    const theme = nameOf(state.data.themes, item.themeId, '未归类主题');
    const cat = nameOf(state.data.categories, item.categoryId, '未归类');
    if (!isCrossProjectView()) return theme + ' / ' + cat;
    if (!item.projectId) return '未归类';
    return nameOf(state.data.projects, item.projectId, '未归类项目') + ' / ' + theme + ' / ' + cat;
  }

  function renderList() {
    const list = root.querySelector('#ep-list');
    if (!list) return;
    const items = EP.exporter.filterItems(state.data, currentFilter());

    if (!items.length) {
      list.innerHTML =
        '<div class="ep-empty">' +
        '<div class="ep-empty-title">这里还没有素材</div>' +
        '<div class="ep-empty-sub">' +
        (isUnassignedView()
          ? '所有素材都已归入项目，暂时没有待整理的内容。'
          : '浏览网页时选中原文并保存，最后统一导出研究素材包。') +
        '</div>' +
        '</div>';
      return;
    }

    list.innerHTML = items
      .slice()
      .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))
      .map((item) => {
        return (
          '<article class="ep-card" data-item="' + item.id + '">' +
          '<div class="ep-card-top">' +
          '<span class="ep-badge line">' + esc(item.sourceType || '其他') + '</span>' +
          (item.documentType === 'pdf' ? '<span class="ep-badge line">PDF</span>' : '') +
          (isAllView() && !item.projectId ? '<span class="ep-badge line">未归类</span>' : '') +
          '<span class="ep-path">' + esc(itemPath(item)) + '</span>' +
          '<span class="ep-spacer"></span>' +
          '<button class="ep-mini" data-edit="' + item.id + '">编辑</button>' +
          '<button class="ep-mini danger" data-del-item="' + item.id + '">删除</button>' +
          '</div>' +
          '<h3 class="ep-card-title">' + esc(item.pageTitle || '未命名来源') + '</h3>' +
          '<a class="ep-url" href="' + esc(item.url) + '" target="_blank" rel="noreferrer">' + esc(item.url) + '</a>' +
          '<div class="ep-block"><div class="ep-label">原文摘录</div>' +
          '<blockquote class="ep-quote">' + esc(item.excerpt || '（无）') + '</blockquote></div>' +
          '<div class="ep-block"><div class="ep-label">用户批注</div>' +
          '<div class="ep-note">' + esc(item.note || '（无）') + '</div></div>' +
          '<div class="ep-card-foot">' +
          '<span>' + esc(item.publisher || '') + '</span>' +
          '<span>' + fmtDate(item.capturedAt) + '</span>' +
          ((item.tags || []).length ? '<span class="ep-tags">' + item.tags.map(esc).join(' · ') + '</span>' : '') +
          '</div>' +
          '</article>'
        );
      })
      .join('');

    list.querySelectorAll('[data-edit]').forEach((el) => {
      el.addEventListener('click', () => openEditor(el.getAttribute('data-edit')));
    });

    list.querySelectorAll('[data-del-item]').forEach((el) => {
      el.addEventListener('click', () => delItem(el.getAttribute('data-del-item')));
    });
  }

  async function handleAction(action) {
    if (action === 'new-item') return openEditor(null);
    if (action === 'new-project') return addProject();
    if (action === 'new-theme') return addTheme();
    if (action === 'clear-filter') {
      state.themeId = null;
      state.categoryId = null;
      state.q = '';
      return render();
    }
    if (action === 'export-md') return doExport('md');
    if (action === 'export-json') return doExport('json');
    if (action === 'export-backup') return doBackup();
    if (action === 'import-json') return doImport();
    if (action === 'theme') return openThemePicker();
  }

  // 换肤：主题同时作用于管理页与划词浮窗（浮窗经后台 EP_GET_TREE 读取同一设置）
  function openThemePicker() {
    const modal = root.querySelector('#ep-modal');
    if (!modal || !EP.themes) return;
    const cur = currentThemeId();
    modal.hidden = false;
    modal.innerHTML =
      '<div class="ep-modal-mask" data-close="1"></div>' +
      '<div class="ep-modal-box ep-theme-box">' +
      '<div class="ep-modal-head">换肤</div>' +
      '<div class="ep-modal-body"><div class="ep-theme-grid">' +
      EP.themes
        .list()
        .map(
          (t) =>
            '<button class="ep-theme-card' + (t.id === cur ? ' on' : '') + '" data-theme-id="' + esc(t.id) + '">' +
            '<div class="ep-swatches">' +
            t.sw.map((c) => '<span class="ep-sw" style="background:' + esc(c) + '"></span>').join('') +
            '</div>' +
            '<div class="ep-theme-name">' + esc(t.name) +
            (t.en ? ' <span class="ep-theme-en">' + esc(t.en) + '</span>' : '') + '</div>' +
            '</button>'
        )
        .join('') +
      '</div></div>' +
      '<div class="ep-modal-foot"><button class="ep-btn ghost" id="ep-theme-close">关闭</button></div>' +
      '</div>';

    modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
    modal.querySelector('#ep-theme-close').addEventListener('click', closeModal);
    modal.querySelectorAll('[data-theme-id]').forEach((el) => {
      el.addEventListener('click', async () => {
        state.data.settings.theme = el.getAttribute('data-theme-id');
        await EP.store.set(state.data);
        applyTheme();
        closeModal();
        render();
      });
    });
  }

  // 页面内对话框：Side Panel 中 window.prompt / confirm / alert 会被浏览器禁用，必须自建
  function closeModal() {
    const modal = root.querySelector('#ep-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.innerHTML = '';
  }

  function ask(opts) {
    return new Promise((resolve) => {
      const modal = root.querySelector('#ep-modal');
      if (!modal) return resolve(opts.type === 'confirm' ? false : null);
      const isPrompt = opts.type === 'prompt';
      modal.hidden = false;
      modal.innerHTML =
        '<div class="ep-modal-mask" data-close="1"></div>' +
        '<div class="ep-modal-box ep-dialog">' +
        '<div class="ep-modal-head">' + esc(opts.title || '提示') + '</div>' +
        '<div class="ep-modal-body">' +
        (opts.message ? '<p class="ep-dialog-msg">' + esc(opts.message) + '</p>' : '') +
        (isPrompt
          ? '<label>' + esc(opts.label || '') +
            '<input id="ep-ask-input" value="' + esc(opts.value || '') +
            '" placeholder="' + esc(opts.placeholder || '') + '"></label>'
          : '') +
        '</div>' +
        '<div class="ep-modal-foot">' +
        '<button class="ep-btn ghost" id="ep-ask-cancel">' + (opts.type === 'alert' ? '知道了' : '取消') + '</button>' +
        (opts.type === 'alert'
          ? ''
          : '<button class="ep-btn primary" id="ep-ask-ok">' + (opts.okText || '确定') + '</button>') +
        '</div></div>';

      const input = modal.querySelector('#ep-ask-input');
      if (input) setTimeout(() => { input.focus(); input.select(); }, 20);

      function finish(v) {
        closeModal();
        resolve(v);
      }

      modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => finish(null)));
      const cancel = modal.querySelector('#ep-ask-cancel');
      if (cancel) cancel.addEventListener('click', () => finish(null));
      const ok = modal.querySelector('#ep-ask-ok');
      if (ok) ok.addEventListener('click', () => finish(isPrompt ? (input ? input.value.trim() : '') : true));
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finish(input.value.trim());
          if (e.key === 'Escape') finish(null);
        });
      }
    });
  }

  function epAlert(message, title) {
    return ask({ type: 'alert', title: title || '提示', message });
  }

  function epConfirm(message, title) {
    return ask({ type: 'confirm', title: title || '确认', message, okText: '确认' }).then((v) => v === true);
  }

  function epPrompt(title, value, placeholder) {
    return ask({ type: 'prompt', title, value, placeholder });
  }

  async function addProject() {
    const name = await epPrompt('新建项目', '', '例如：IFA 2026');
    if (!name) return;
    const p = EP.model.createProject(name.trim());
    await EP.store.update((d) => {
      d.projects.push(p);
      d.settings.lastProjectId = p.id;
    });
    state.projectId = p.id;
    state.themeId = null;
    state.categoryId = null;
    await refresh();
  }

  async function renameProject(id) {
    const p = state.data.projects.find((x) => x.id === id);
    if (!p) return;
    const name = await epPrompt('重命名项目', p.name);
    if (!name || !name.trim() || name.trim() === p.name) return;
    await EP.store.update((d) => {
      const t = d.projects.find((x) => x.id === id);
      if (t) t.name = name.trim();
    });
    await refresh();
  }

  async function renameTheme(id) {
    const t = state.data.themes.find((x) => x.id === id);
    if (!t) return;
    const name = await epPrompt('重命名主题', t.name);
    if (!name || !name.trim() || name.trim() === t.name) return;
    await EP.store.update((d) => {
      const x = d.themes.find((y) => y.id === id);
      if (x) x.name = name.trim();
    });
    await refresh();
  }

  async function renameCategory(id) {
    const c = state.data.categories.find((x) => x.id === id);
    if (!c) return;
    const name = await epPrompt('重命名类目', c.name);
    if (!name || !name.trim() || name.trim() === c.name) return;
    await EP.store.update((d) => {
      const x = d.categories.find((y) => y.id === id);
      if (x) x.name = name.trim();
    });
    await refresh();
  }

  async function delProject(id) {
    if (!(await epConfirm('删除该项目会同时删除其下所有主题、类目和素材，且不可恢复。确认删除？', '删除项目'))) return;
    await EP.store.update((d) => EP.store.cascadeDelete(d, 'project', id));
    if (state.projectId === id) {
      state.projectId = null;
      state.themeId = null;
      state.categoryId = null;
    }
    await refresh();
  }

  async function addTheme(projectId) {
    const pid = projectId || state.projectId;
    if (!pid) return epAlert('请先选择或新建一个项目。');
    const name = await epPrompt('新建主题', '', '例如：AI 与主动执行');
    if (!name) return;
    const t = EP.model.createTheme(pid, name.trim());
    await EP.store.update((d) => d.themes.push(t));
    await refresh();
  }

  async function delTheme(id) {
    if (!(await epConfirm('删除主题会同时删除其下所有类目和素材，且不可恢复。确认删除？', '删除主题'))) return;
    await EP.store.update((d) => EP.store.cascadeDelete(d, 'theme', id));
    if (state.themeId === id) {
      state.themeId = null;
      state.categoryId = null;
    }
    await refresh();
  }

  async function addCategory(themeId) {
    const name = await epPrompt('新建类目', '', '例如：家庭场景');
    if (!name) return;
    // 跨项目视图下 state.projectId 为空，类目归属要跟着主题所属的项目走
    const theme = state.data.themes.find((t) => t.id === themeId);
    const c = EP.model.createCategory(theme ? theme.projectId : state.projectId, themeId, name.trim());
    await EP.store.update((d) => d.categories.push(c));
    await refresh();
  }

  async function delCategory(id) {
    if (!(await epConfirm('删除类目会同时删除其下所有素材，且不可恢复。确认删除？', '删除类目'))) return;
    await EP.store.update((d) => EP.store.cascadeDelete(d, 'category', id));
    if (state.categoryId === id) state.categoryId = null;
    await refresh();
  }

  async function delItem(id) {
    if (!(await epConfirm('删除这条素材？', '删除素材'))) return;
    await EP.store.update((d) => {
      d.items = d.items.filter((i) => i.id !== id);
    });
    await refresh();
  }

  function selectOptions(list, selected, placeholder) {
    return (
      '<option value="">' + placeholder + '</option>' +
      list.map(
        (x) =>
          '<option value="' + x.id + '"' +
          (selected === x.id ? ' selected' : '') +
          '>' + esc(x.name) + '</option>'
      ).join('')
    );
  }

  function openEditor(id) {
    const item =
      (state.data.items || []).find((i) => i.id === id) ||
      EP.model.createItem({
        projectId: state.projectId,
        themeId: state.themeId,
        categoryId: state.categoryId
      });

    const modal = root.querySelector('#ep-modal');
    modal.hidden = false;
    modal.innerHTML =
      '<div class="ep-modal-mask" data-close="1"></div>' +
      '<div class="ep-modal-box">' +
      '<div class="ep-modal-head">' + (id ? '编辑素材' : '新增素材') + '</div>' +
      '<div class="ep-form">' +
      '<label>原文摘录<textarea id="f-excerpt" rows="4">' + esc(item.excerpt) + '</textarea></label>' +
      '<label>用户批注<textarea id="f-note" rows="3" placeholder="为什么值得保留？可能支持什么判断？">' + esc(item.note) + '</textarea></label>' +
      '<div class="ep-row">' +
      '<label>项目<select id="f-project">' + selectOptions(state.data.projects, item.projectId, '未归类') + '</select></label>' +
      '<label>主题<select id="f-theme">' + selectOptions(themesOfProject(), item.themeId, '未归类') + '</select></label>' +
      '<label>类目<select id="f-category">' + selectOptions(categoriesOfTheme(item.themeId), item.categoryId, '未归类') + '</select></label>' +
      '</div>' +
      '<div class="ep-row">' +
      '<label>网页标题<input id="f-title" value="' + esc(item.pageTitle) + '"></label>' +
      '<label>URL<input id="f-url" value="' + esc(item.url) + '"></label>' +
      '</div>' +
      '<div class="ep-row">' +
      '<label>来源<input id="f-publisher" value="' + esc(item.publisher) + '"></label>' +
      '<label>发布时间<input id="f-published" value="' + esc(item.publishedAt) + '"></label>' +
      '</div>' +
      '<div class="ep-row">' +
      '<label>类型<select id="f-type">' +
      EP.model.SOURCE_TYPES.map(
        (t) => '<option' + (item.sourceType === t ? ' selected' : '') + '>' + t + '</option>'
      ).join('') +
      '</select></label>' +
      '<label>标签<input id="f-tags" value="' + esc((item.tags || []).join(', ')) + '" placeholder="用逗号分隔"></label>' +
      '</div>' +
      '</div>' +
      '<div class="ep-modal-foot">' +
      '<button class="ep-btn ghost" data-close="1">取消</button>' +
      '<button class="ep-btn primary" id="f-save">保存</button>' +
      '</div></div>';

    const projSel = modal.querySelector('#f-project');
    const themeSel = modal.querySelector('#f-theme');
    const catSel = modal.querySelector('#f-category');

    // 切换项目后主题/类目必须重算，否则选了项目却只能看到上一个项目的主题
    projSel.addEventListener('change', () => {
      themeSel.innerHTML = selectOptions(themesOf(projSel.value || null), '', '未归类');
      catSel.innerHTML = selectOptions([], '', '未归类');
    });

    themeSel.addEventListener('change', () => {
      catSel.innerHTML = selectOptions(categoriesOfTheme(themeSel.value), '', '未归类');
    });
    modal.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => {
        modal.hidden = true;
        modal.innerHTML = '';
      });
    });

    modal.querySelector('#f-save').addEventListener('click', async () => {
      const payload = {
        excerpt: modal.querySelector('#f-excerpt').value.trim(),
        note: modal.querySelector('#f-note').value.trim(),
        projectId: modal.querySelector('#f-project').value || null,
        themeId: modal.querySelector('#f-theme').value || null,
        categoryId: modal.querySelector('#f-category').value || null,
        pageTitle: modal.querySelector('#f-title').value.trim(),
        url: modal.querySelector('#f-url').value.trim(),
        publisher: modal.querySelector('#f-publisher').value.trim(),
        publishedAt: modal.querySelector('#f-published').value.trim(),
        sourceType: modal.querySelector('#f-type').value,
        tags: modal
          .querySelector('#f-tags')
          .value.split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      };

      await EP.store.update((d) => {
        const idx = d.items.findIndex((i) => i.id === item.id);
        if (idx >= 0) {
          d.items[idx] = Object.assign({}, d.items[idx], payload);
        } else {
          d.items.push(EP.model.createItem(payload));
        }
        if (payload.projectId) d.settings.lastProjectId = payload.projectId;
      });

      modal.hidden = true;
      modal.innerHTML = '';
      await refresh();
    });
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function scopeName() {
    if (isUnassignedView()) return '未归类素材';
    if (!state.projectId) return '全部素材';
    return nameOf(state.data.projects, state.projectId, '项目');
  }

  function doExport(kind) {
    const f = currentFilter();
    const stamp = new Date().toISOString().slice(0, 10);
    const base = scopeName().replace(/[\\/:*?"<>|]/g, '-') + ' 研究素材包 ' + stamp;
    if (kind === 'md') {
      download(base + '.md', EP.exporter.markdown(state.data, f), 'text/markdown;charset=utf-8');
    } else {
      download(base + '.json', EP.exporter.json(state.data, f), 'application/json;charset=utf-8');
    }
  }

  function doImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          // 完整备份：含 projects/themes/categories/items/settings，按 id 合并继承全部内容
          const hasStructure =
            Array.isArray(parsed.projects) ||
            Array.isArray(parsed.themes) ||
            Array.isArray(parsed.categories);
          if (hasStructure) {
            const counts = await EP.store.importAll(parsed);
            await refresh();
            await epAlert(
              '已从备份继承全部内容（项目 ' + counts.projects + ' · 主题 ' + counts.themes +
              ' · 类目 ' + counts.categories + ' · 素材 ' + counts.items + '）。',
              '继承成功'
            );
            return;
          }
          // 旧版 / 局部导出：仅含 items（层级只存 id）。按素材引用重建 项目→主题→类目，
          // 让旧版导出文件在 0.5.2 上内容与项目结构同步导入。
          const incoming = Array.isArray(parsed) ? parsed : parsed.items || [];
          const rebuilt = EP.store.rebuildStructure(incoming);
          const counts = await EP.store.importAll({
            projects: rebuilt.projects,
            themes: rebuilt.themes,
            categories: rebuilt.categories,
            items: incoming
          });
          await refresh();
          const structNote = (counts.projects + counts.themes + counts.categories) > 0
            ? '，并按旧版格式重建项目结构（项目 ' + counts.projects + ' · 主题 ' + counts.themes + ' · 类目 ' + counts.categories + '）。旧版导出未包含层级名称，已用「项目 1 / 主题 1…」占位，可在树中直接重命名'
            : '';
          await epAlert('导入完成，新增 ' + counts.items + ' 条素材' + structNote + '。', '导入成功');
        } catch (e) {
          await epAlert('导入失败：文件不是有效的 JSON。', '导入失败');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  async function doBackup() {
    const data = await EP.store.exportAll();
    const stamp = new Date().toISOString().slice(0, 10);
    download('EventPocket 备份 ' + stamp + '.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    await epAlert(
      '已导出完整备份（含项目 / 主题 / 类目 / 素材 / 设置）。换版本或换扩展后，用「导入」即可全量继承。',
      '备份完成'
    );
  }

  async function refresh() {
    state.data = await EP.store.get();
    // 关键：查看全部 / 未归类 时必须保留 projectId 为空。
    // 以前这里无条件回填 lastProjectId，导致「不选项目」的状态永远不可达，
    // 未归入项目的素材因此在 UI 上彻底查不到。
    if (isCrossProjectView()) {
      state.projectId = null;
    } else if (!state.projectId) {
      state.projectId =
        state.data.settings.lastProjectId || (state.data.projects[0] && state.data.projects[0].id) || null;
    }
    applyTheme();
    render();
  }

  EP.app = {
    mount(el, opts) {
      root = el;
      // data-action 用事件委托：侧栏按钮在 renderSidebar 时才生成，逐元素绑定会丢失
      root.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
        if (btn) handleAction(btn.getAttribute('data-action'), btn);
      });
      if (opts && opts.state) Object.assign(state, opts.state);
      return refresh();
    },
    refresh,
    state
  };
})();
