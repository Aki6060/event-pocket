(function () {
  const EP = window.EP;

  const el = (id) => document.getElementById(id);
  let data = null;

  function fill(list, selected, placeholder) {
    return (
      '<option value="">' + placeholder + '</option>' +
      list.map((x) => '<option value="' + x.id + '"' + (selected === x.id ? ' selected' : '') + '>' + x.name + '</option>').join('')
    );
  }

  function renderProjects() {
    const pid = el('project').value || (data.settings && data.settings.lastProjectId) || (data.projects[0] && data.projects[0].id) || '';
    el('project').innerHTML = fill(data.projects, pid, '未归类');
    renderThemes();
  }

  function renderThemes() {
    const pid = el('project').value;
    const themes = data.themes.filter((t) => t.projectId === pid);
    el('theme').innerHTML = fill(themes, '', '未归类');
    renderCategories();
  }

  function renderCategories() {
    const tid = el('theme').value;
    const cats = data.categories.filter((c) => c.themeId === tid);
    el('category').innerHTML = fill(cats, '', '未归类');
  }

  function toast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.hidden = false;
    setTimeout(() => {
      t.hidden = true;
    }, 1600);
  }

  async function captureCurrentTab() {
    return new Promise((resolve) => {
      if (!chrome.tabs || !chrome.tabs.query) return resolve(null);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab) return resolve(null);
        chrome.tabs.sendMessage(tab.id, { type: 'EP_CAPTURE' }, (res) => {
          resolve(Object.assign({ pageTitle: tab.title, url: tab.url, publisher: '', publishedAt: '', selection: '' }, res || {}));
        });
      });
    });
  }

  async function init() {
    data = await EP.store.get();

    el('type').innerHTML = EP.model.SOURCE_TYPES.map((t) => '<option>' + t + '</option>').join('');
    renderProjects();

    const page = await captureCurrentTab();
    if (page) {
      window.__page = page;
      el('meta').textContent = page.pageTitle + ' · ' + (page.publisher || page.url);
      if (page.selection) el('excerpt').value = page.selection;
    } else {
      el('meta').textContent = '未读取到页面信息，可手动粘贴原文。';
    }
  }

  el('project').addEventListener('change', renderThemes);
  el('theme').addEventListener('change', renderCategories);

  el('manage').addEventListener('click', () => {
    // 优先在浏览器侧边栏打开素材管理，不支持时降级为标签页
    try {
      chrome.runtime.sendMessage({ type: 'EP_OPEN_MANAGE' }, () => {
        if (chrome.runtime.lastError) {
          chrome.tabs.create({ url: chrome.runtime.getURL('src/manage.html') });
        }
      });
    } catch (e) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/manage.html') });
    }
    window.close();
  });

  el('save').addEventListener('click', async () => {
    const excerpt = el('excerpt').value.trim();
    const note = el('note').value.trim();
    if (!excerpt && !note) {
      toast('请填写原文摘录或批注');
      return;
    }

    const page = window.__page || {};
    await EP.store.update((d) => {
      d.items.push(
        EP.model.createItem({
          excerpt,
          note,
          projectId: el('project').value || null,
          themeId: el('theme').value || null,
          categoryId: el('category').value || null,
          pageTitle: page.pageTitle || '',
          url: page.url || '',
          publisher: page.publisher || '',
          publishedAt: page.publishedAt || '',
          sourceType: el('type').value,
          tags: el('tags').value.split(',').map((t) => t.trim()).filter(Boolean)
        })
      );
      if (el('project').value) d.settings.lastProjectId = el('project').value;
    });

    el('excerpt').value = '';
    el('note').value = '';
    el('tags').value = '';
    toast('已保存到 Event Pocket');
  });

  init();
})();
