(function () {
  let root = null;      // 浮窗内容容器
  let host = null;      // Shadow DOM 宿主（隔离宿主页面的深色模式等样式污染）
  let cardOpen = false;
  let anchorRect = null;
  let tree = { projects: [], themes: [], categories: [], lastProjectId: null };
  let themeId = null;   // 主题 id，与管理页「换肤」设置同步
  let cssText = '';
  let cssPromise = null;

  // 浮窗样式放进 Shadow DOM，页面里的全局选择器（如深色模式）无法穿透
  function ensureCss() {
    if (cssText) return Promise.resolve();
    if (!cssPromise) {
      cssPromise = new Promise((resolve) => {
        try {
          fetch(chrome.runtime.getURL('src/content.css'))
            .then((r) => r.text())
            .then((t) => { cssText = t; resolve(); })
            .catch(() => resolve());
        } catch (e) {
          resolve();
        }
      });
    }
    return cssPromise;
  }
  ensureCss();
  fetchTree(); // 页面加载即同步主题与项目树，划词时无需等待

  function pickPublishedAt() {
    const candidates = [
      'meta[property="article:published_time"]',
      'meta[name="publish_date"]',
      'meta[name="date"]',
      'time[datetime]'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const value = el.getAttribute('content') || el.getAttribute('datetime');
      if (value) return value;
    }
    return '';
  }

  function pickPublisher() {
    const site =
      document.querySelector('meta[property="og:site_name"]') ||
      document.querySelector('meta[name="publisher"]');
    if (site) {
      const v = site.getAttribute('content');
      if (v) return v;
    }
    return location.hostname.replace(/^www\./, '');
  }

  function pageMeta() {
    return {
      pageTitle: document.title || '',
      url: location.href,
      publisher: pickPublisher(),
      publishedAt: pickPublishedAt()
    };
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function options(list, placeholder) {
    return (
      '<option value="">' + placeholder + '</option>' +
      list.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>').join('')
    );
  }

  function createNode(type, name, parent) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          type: 'EP_CREATE_NODE',
          payload: { type, name, projectId: parent && parent.projectId, themeId: parent && parent.themeId }
        }, (res) => {
          const err = chrome.runtime.lastError;
          if (err || !res || !res.ok) {
            resolve({ node: null, error: (err && err.message) || '新增失败，请刷新网页后重试。' });
            return;
          }
          tree = Object.assign(tree, res.tree || {});
          resolve({ node: res.node || null, error: '' });
        });
      } catch (e) {
        resolve({ node: null, error: '新增失败，请刷新网页后重试。' });
      }
    });
  }

  // 浮窗内部对话框：不调用浏览器原生 prompt / alert，始终保持插件自己的视觉与交互
  function askName(container, label, placeholder) {
    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      dialog.className = 'ep-inline-dialog';
      dialog.innerHTML =
        '<div class="ep-inline-mask"></div>' +
        '<div class="ep-inline-box" role="dialog" aria-modal="true">' +
          '<div class="ep-inline-title">' + esc(label) + '</div>' +
          '<input class="ep-inline-input" placeholder="' + esc(placeholder || '请输入名称') + '">' +
          '<div class="ep-inline-actions">' +
            '<button class="ep-btn ep-btn-ghost" type="button" data-inline-cancel>取消</button>' +
            '<button class="ep-btn ep-btn-primary" type="button" data-inline-ok>新增</button>' +
          '</div>' +
        '</div>';
      container.appendChild(dialog);
      const input = dialog.querySelector('.ep-inline-input');
      const finish = (value) => { dialog.remove(); resolve(value); };
      dialog.querySelector('[data-inline-cancel]').addEventListener('click', () => finish(''));
      dialog.querySelector('.ep-inline-mask').addEventListener('click', () => finish(''));
      dialog.querySelector('[data-inline-ok]').addEventListener('click', () => finish(input.value.trim()));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(input.value.trim());
        if (e.key === 'Escape') finish('');
      });
      setTimeout(() => input.focus(), 0);
    });
  }

  function showInlineNotice(container, message) {
    const dialog = document.createElement('div');
    dialog.className = 'ep-inline-dialog';
    dialog.innerHTML =
      '<div class="ep-inline-mask"></div>' +
      '<div class="ep-inline-box" role="dialog" aria-modal="true">' +
        '<div class="ep-inline-title">提示</div>' +
        '<div class="ep-inline-message">' + esc(message) + '</div>' +
        '<div class="ep-inline-actions"><button class="ep-btn ep-btn-primary" type="button" data-inline-ok>知道了</button></div>' +
      '</div>';
    container.appendChild(dialog);
    const close = () => dialog.remove();
    dialog.querySelector('[data-inline-ok]').addEventListener('click', close);
    dialog.querySelector('.ep-inline-mask').addEventListener('click', close);
  }

  function mount() {
    if (root) return root;
    host = document.createElement('div');
    host.setAttribute('data-event-pocket-root', '');
    host.style.cssText =
      'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;' +
      'color:#16181d;font-size:13px;line-height:1.5;';
    const shadow = host.attachShadow({ mode: 'open' });
    if (cssText) {
      const style = document.createElement('style');
      style.textContent = cssText;
      shadow.appendChild(style);
    }
    root = document.createElement('div');
    root.className = 'ep-root';
    root.setAttribute('data-theme', themeId || 'night');
    shadow.appendChild(root);
    document.body.appendChild(host);
    return root;
  }

  function place(node, rect) {
    const top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - 400;
    if (left > maxLeft) left = Math.max(window.scrollX + 8, maxLeft);
    node.style.top = top + 'px';
    node.style.left = left + 'px';
  }

  // 浮窗卡片可从标题栏拖动，位置跟随宿主 host，滚动页面时保持绝对定位
  function enableDrag(card) {
    const head = card.querySelector('.ep-card-head');
    if (!head || !host) return;
    head.classList.add('ep-draggable');
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    const onMove = (e) => {
      if (!dragging) return;
      host.style.left = originLeft + e.clientX - startX + 'px';
      host.style.top = originTop + e.clientY - startY + 'px';
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      head.classList.remove('ep-dragging');
    };

    head.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      const left = parseFloat(host.style.left) || 0;
      const top = parseFloat(host.style.top) || 0;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = left;
      originTop = top;
      head.classList.add('ep-dragging');
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    });
  }

  function remove() {
    if (host) {
      host.remove();
      host = null;
      root = null;
    }
    cardOpen = false;
    anchorRect = null;
  }

  // 从后台读取项目 / 主题 / 类目（与管理页同一份数据）
  function fetchTree() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'EP_GET_TREE' }, (res) => {
          tree = Object.assign({ projects: [], themes: [], categories: [], lastProjectId: null }, res || {});
          if (tree.theme) {
            themeId = tree.theme;
            if (root) root.setAttribute('data-theme', themeId);
          }
          resolve(tree);
        });
      } catch (e) {
        resolve(tree);
      }
    });
  }

  function showBubble(text, rect) {
    anchorRect = rect;
    const el = mount();
    el.innerHTML =
      '<div class="ep-bubble" id="ep-bubble"><span class="ep-dot"></span>收进 Event Pocket</div>';
    place(el, rect);
    el.querySelector('#ep-bubble').addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showCard(text, rect);
    });
  }

  function showCard(text, rect) {
    cardOpen = true;
    const el = mount();
    const meta = pageMeta();
    el.innerHTML =
      '<div class="ep-card">' +
        '<div class="ep-card-head">' +
          '<span class="ep-logo">Event Pocket</span>' +
          '<span class="ep-slogan">Collect signals. Build insights.</span>' +
          '<button class="ep-close" id="ep-close" title="关闭">×</button>' +
        '</div>' +
        '<div class="ep-card-body">' +
          '<div class="ep-field">' +
            '<label>原文摘录 <span class="ep-req">*</span></label>' +
            '<textarea id="ep-excerpt">' + esc(text) + '</textarea>' +
          '</div>' +
          '<div class="ep-field">' +
            '<label>我的批注 <span class="ep-optional">选填</span></label>' +
            '<textarea id="ep-note" placeholder="为什么值得留？可能支撑什么判断？"></textarea>' +
          '</div>' +
          '<div class="ep-field">' +
            '<label>项目 <button class="ep-add" id="ep-add-project" type="button">+ 新增</button></label>' +
            '<select id="ep-project"><option value="">未归类</option></select>' +
          '</div>' +
          '<div class="ep-row ep-indent">' +
            '<div class="ep-field">' +
              '<label>主题 <button class="ep-add" id="ep-add-theme" type="button">+ 新增</button></label>' +
              '<select id="ep-theme"><option value="">未归类</option></select>' +
            '</div>' +
            '<div class="ep-field">' +
              '<label>类目 <button class="ep-add" id="ep-add-category" type="button">+ 新增</button></label>' +
              '<select id="ep-category"><option value="">未归类</option></select>' +
            '</div>' +
          '</div>' +
          '<div class="ep-row">' +
            '<div class="ep-field">' +
              '<label>来源类型</label>' +
              '<select id="ep-type">' +
                ['官方活动', '厂商官方', '合作伙伴', '权威媒体', '行业数据', '社交线索', '其他']
                  .map((t) => '<option>' + t + '</option>').join('') +
              '</select>' +
            '</div>' +
            '<div class="ep-field">' +
              '<label>标签</label>' +
              '<input id="ep-tags" placeholder="逗号分隔" />' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ep-card-foot">' +
          '<button class="ep-btn ep-btn-primary" id="ep-save">保存</button>' +
          '<button class="ep-btn ep-btn-ghost" id="ep-cancel">取消</button>' +
          '<span class="ep-foot-note">' + esc(meta.publisher) + '</span>' +
        '</div>' +
      '</div>';
    place(el, rect);
    enableDrag(el.querySelector('.ep-card'));

    const projectSel = el.querySelector('#ep-project');
    const themeSel = el.querySelector('#ep-theme');
    const catSel = el.querySelector('#ep-category');

    function themesOf(pid) {
      return tree.themes.filter((t) => t.projectId === pid);
    }
    function catsOf(tid) {
      return tree.categories.filter((c) => c.themeId === tid);
    }

    function fillTree() {
      if (!tree.projects.length) {
        projectSel.innerHTML = '<option value="">（暂无项目，可在侧边栏新建）</option>';
      } else {
        projectSel.innerHTML = options(tree.projects, '未归类');
      }
      if (tree.lastProjectId && tree.projects.some((p) => p.id === tree.lastProjectId)) {
        projectSel.value = tree.lastProjectId;
      }
      themeSel.innerHTML = options(themesOf(projectSel.value), '未归类');
      catSel.innerHTML = options([], '未归类');
    }

    projectSel.addEventListener('change', () => {
      themeSel.innerHTML = options(themesOf(projectSel.value), '未归类');
      catSel.innerHTML = options([], '未归类');
    });
    themeSel.addEventListener('change', () => {
      catSel.innerHTML = options(catsOf(themeSel.value), '未归类');
    });

    // 用卡片级委托承接动态 UI，避免 Shadow DOM 事件重定向造成按钮监听失效。
    el.addEventListener('click', async (event) => {
      const button = event.composedPath ? event.composedPath().find((node) => node && node.id && /^ep-add-/.test(node.id)) : event.target.closest('[id^="ep-add-"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const action = button.id;
      button.disabled = true;
      try {
        if (action === 'ep-add-project') {
          const name = await askName(el, '新增项目', '例如：IFA 2026');
          if (!name) return;
          const result = await createNode('project', name, null);
          if (!result.node) return showInlineNotice(el, result.error);
          fillTree();
          projectSel.value = result.node.id;
          themeSel.innerHTML = options(themesOf(result.node.id), '未归类');
          catSel.innerHTML = options([], '未归类');
        }
        if (action === 'ep-add-theme') {
          const projectId = projectSel.value;
          if (!projectId) return showInlineNotice(el, '请先选择项目，再新增主题。');
          const name = await askName(el, '新增主题', '例如：AI 与主动执行');
          if (!name) return;
          const result = await createNode('theme', name, { projectId });
          if (!result.node) return showInlineNotice(el, result.error);
          themeSel.innerHTML = options(themesOf(projectId), '未归类');
          themeSel.value = result.node.id;
          catSel.innerHTML = options([], '未归类');
        }
        if (action === 'ep-add-category') {
          const projectId = projectSel.value;
          const selectedThemeId = themeSel.value;
          if (!projectId || !selectedThemeId) return showInlineNotice(el, '请先选择项目和主题，再新增类目。');
          const name = await askName(el, '新增类目', '例如：家庭场景');
          if (!name) return;
          const result = await createNode('category', name, { projectId, themeId: selectedThemeId });
          if (!result.node) return showInlineNotice(el, result.error);
          catSel.innerHTML = options(catsOf(selectedThemeId), '未归类');
          catSel.value = result.node.id;
        }
      } finally {
        button.disabled = false;
      }
    });

    fillTree();
    fetchTree().then(fillTree);

    el.querySelector('#ep-close').addEventListener('click', remove);
    el.querySelector('#ep-cancel').addEventListener('click', remove);

    const note = el.querySelector('#ep-note');
    setTimeout(() => note.focus(), 30);

    el.querySelector('#ep-save').addEventListener('click', () => {
      const saveBtn = el.querySelector('#ep-save');
      const excerpt = el.querySelector('#ep-excerpt').value.trim();
      const noteVal = note.value.trim();
      if (!excerpt) {
        el.querySelector('#ep-excerpt').focus();
        return;
      }
      const projectId = projectSel.value || null;
      saveBtn.disabled = true;
      saveBtn.textContent = '收录中…';
      chrome.runtime.sendMessage(
        {
          type: 'EP_SAVE_QUICK',
          payload: {
            excerpt,
            note: noteVal,
            projectId,
            themeId: (projectId && themeSel.value) || null,
            categoryId: (projectId && catSel.value) || null,
            sourceType: el.querySelector('#ep-type').value,
            tags: el.querySelector('#ep-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
            page: meta
          }
        },
        () => {
          if (chrome.runtime.lastError) {
            el.innerHTML =
              '<div class="ep-toast err"><span class="ep-toast-dot"></span>' +
              '<span>保存失败：插件刚更新过，请刷新本网页后重试</span></div>';
            setTimeout(remove, 3000);
            return;
          }
          const path = [
            projectSel.options[projectSel.selectedIndex] &&
              (projectSel.selectedIndex > 0 ? projectSel.options[projectSel.selectedIndex].text : ''),
            themeSel.selectedIndex > 0 ? themeSel.options[themeSel.selectedIndex].text : ''
          ].filter(Boolean).join(' / ');
          el.innerHTML =
            '<div class="ep-toast"><span class="ep-toast-dot"></span>' +
            '<span>已收录</span>' +
            '<button class="ep-toast-link" id="ep-view-detail" type="button">查看详情 ↗</button>' +
            '</div>';
          el.querySelector('#ep-view-detail').addEventListener('click', () => {
            try { chrome.runtime.sendMessage({ type: 'EP_OPEN_MANAGE' }); } catch (e) { /* 预览环境忽略 */ }
            remove();
          });
          setTimeout(remove, 2200);
        }
      );
    });
  }

  function inFloating(e) {
    // Shadow DOM 中事件 target 会被重定向为 host，需要用 composedPath 判断
    if (e.target === host) return true;
    const path = e.composedPath ? e.composedPath() : [];
    return path.includes(root);
  }

  document.addEventListener('mouseup', async (e) => {
    if (root && inFloating(e)) return;
    if (e.target && e.target.closest) {
      // 输入控件与管理界面内部不触发采集浮窗
      if (e.target.closest('input, textarea, select, [data-ep-no-capture]')) return;
    }
    const sel = window.getSelection();
    const text = sel ? String(sel).trim() : '';
    if (!text || text.length < 4) {
      if (!cardOpen) remove();
      return;
    }
    const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!range) return;
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return;
    await ensureCss();
    showBubble(text, rect);
  });

  document.addEventListener('mousedown', (e) => {
    if (root && !inFloating(e)) remove();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') remove();
  });

  // 快捷键：Alt+Shift+S 直接打开采集卡片
  document.addEventListener('keydown', async (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
      const sel = window.getSelection();
      const text = sel ? String(sel).trim() : '';
      const rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : { left: 40, bottom: 120 };
      await ensureCss();
      showCard(text, rect);
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'EP_CAPTURE') {
      sendResponse(
        Object.assign(pageMeta(), {
          selection: String(window.getSelection() || '').trim()
        })
      );
    }
    return true;
  });
})();
