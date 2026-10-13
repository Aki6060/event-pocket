(function () {
  const EP = (window.EP = window.EP || {});

  // 数据 schema 版本：升级后旧版本键的内容会被自动继承到新键
  const SCHEMA_VERSION = 2;
  const KEY = 'event-pocket:v' + SCHEMA_VERSION;
  // 历史版本存储键，按数组顺序尝试继承（当前键为空时）
  const LEGACY_KEYS = ['event-pocket:v1'];

  const memory = { data: null };

  function hasChromeStorage() {
    try {
      return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    } catch (e) {
      return false;
    }
  }

  function defaultData() {
    return {
      version: SCHEMA_VERSION,
      projects: [],
      themes: [],
      categories: [],
      items: [],
      settings: { lastProjectId: null }
    };
  }

  function normalize(data) {
    const base = defaultData();
    if (!data || typeof data !== 'object') return base;
    const merged = Object.assign(base, data, {
      settings: Object.assign(base.settings, data.settings || {})
    });
    // 始终以当前 schema 版本为准，避免旧版本号遗留
    merged.version = SCHEMA_VERSION;
    return merged;
  }

  function readRaw(key) {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.get(key, (obj) => resolve(obj ? obj[key] : null));
      });
    }
    try {
      const raw = window.localStorage.getItem(key);
      return Promise.resolve(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function writeRaw(key, data) {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: data }, () => resolve(true));
      });
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      memory.data = data;
    }
    return Promise.resolve(true);
  }

  // 自动继承：当前版本键为空、但历史键有内容时，整体拷贝过来。
  // 解决「新版本替换旧版本时」内容丢失、需要手动导入的问题（同扩展 ID 场景）。
  async function migrate() {
    const cur = await readRaw(KEY);
    if (cur && (cur.projects?.length || cur.themes?.length || cur.categories?.length || cur.items?.length)) {
      return;
    }
    for (const lk of LEGACY_KEYS) {
      const legacy = await readRaw(lk);
      if (legacy && (legacy.projects?.length || legacy.themes?.length || legacy.categories?.length || legacy.items?.length)) {
        await writeRaw(KEY, normalize(legacy));
        return;
      }
    }
  }

  function read() {
    return readRaw(KEY);
  }

  function write(data) {
    return writeRaw(KEY, data);
  }

  EP.uid = function () {
    return (
      Math.random().toString(36).slice(2, 8) +
      Date.now().toString(36).slice(-4)
    );
  };

  function mergeList(dst, src) {
    const ids = new Set(dst.map((x) => x.id));
    (src || []).forEach((x) => {
      if (x && x.id && !ids.has(x.id)) dst.push(x);
    });
  }

  EP.store = {
    KEY,
    SCHEMA_VERSION,
    defaultData,

    // 启动时调用：把历史版本的内容自动继承到当前版本键
    async migrate() {
      await migrate();
    },

    async get() {
      await migrate();
      return normalize(await read());
    },

    async set(data) {
      await write(normalize(data));
      return data;
    },

    async update(mutator) {
      await migrate();
      const data = await this.get();
      const result = mutator(data);
      await write(normalize(data));
      return result === undefined ? data : result;
    },

    async reset() {
      await write(defaultData());
      return defaultData();
    },

    // 完整备份：导出全量数据（含项目/主题/类目/素材/设置），用于跨版本 / 跨扩展迁移
    async exportAll() {
      return normalize(await read());
    },

    // 完整恢复：按 id 合并全量结构，已存在的条目不覆盖，仅补齐缺失内容。
    // 与旧版「只导 items」的导入不同，这里会一并继承目录树与设置。
    async importAll(incoming) {
      if (!incoming || typeof incoming !== 'object') return false;
      await migrate();
      const data = normalize(await read());
      mergeList(data.projects, incoming.projects);
      mergeList(data.themes, incoming.themes);
      mergeList(data.categories, incoming.categories);
      mergeList(data.items, incoming.items);
      if (incoming.settings && typeof incoming.settings === 'object') {
        data.settings = Object.assign(data.settings, incoming.settings);
      }
      await write(normalize(data));
      return {
        projects: incoming.projects ? incoming.projects.length : 0,
        themes: incoming.themes ? incoming.themes.length : 0,
        categories: incoming.categories ? incoming.categories.length : 0,
        items: incoming.items ? incoming.items.length : 0
      };
    },

    // 级联删除：删除某一层级时，一并删除其下所有子层级与素材
    // type: 'project' | 'theme' | 'category'
    cascadeDelete(data, type, id) {
      const d = data;
      if (type === 'project') {
        const themeIds = new Set(d.themes.filter((t) => t.projectId === id).map((t) => t.id));
        const catIds = new Set(
          d.categories.filter((c) => c.projectId === id || themeIds.has(c.themeId)).map((c) => c.id)
        );
        d.projects = d.projects.filter((p) => p.id !== id);
        d.themes = d.themes.filter((t) => t.projectId !== id);
        d.categories = d.categories.filter((c) => c.projectId !== id && !themeIds.has(c.themeId));
        // 覆盖素材只带 themeId / categoryId（未带 projectId）的情况
        d.items = d.items.filter(
          (i) => i.projectId !== id && !themeIds.has(i.themeId) && !catIds.has(i.categoryId)
        );
        if (d.settings.lastProjectId === id) d.settings.lastProjectId = null;
      } else if (type === 'theme') {
        const catIds = new Set(d.categories.filter((c) => c.themeId === id).map((c) => c.id));
        d.themes = d.themes.filter((t) => t.id !== id);
        d.categories = d.categories.filter((c) => c.themeId !== id);
        d.items = d.items.filter((i) => i.themeId !== id && !catIds.has(i.categoryId));
      } else if (type === 'category') {
        d.categories = d.categories.filter((c) => c.id !== id);
        d.items = d.items.filter((i) => i.categoryId !== id);
      }
      return d;
    }
  };

  EP.model = {
    SOURCE_TYPES: ['官方活动', '厂商官方', '合作伙伴', '权威媒体', '行业数据', '社交线索', '其他'],
    createProject(name, note) {
      return { id: EP.uid(), name, note: note || '', createdAt: new Date().toISOString() };
    },

    createTheme(projectId, name) {
      return { id: EP.uid(), projectId, name, createdAt: new Date().toISOString() };
    },

    createCategory(projectId, themeId, name) {
      return { id: EP.uid(), projectId, themeId, name, createdAt: new Date().toISOString() };
    },

    createItem(payload) {
      return Object.assign(
        {
          id: EP.uid(),
          projectId: null,
          themeId: null,
          categoryId: null,
          excerpt: '',
          note: '',
          pageTitle: '',
          url: '',
          publisher: '',
          publishedAt: '',
          capturedAt: new Date().toISOString(),
          sourceType: '其他',
          tags: []
        },
        payload || {}
      );
    }
  };
})();
