(function () {
  const EP = (window.EP = window.EP || {});

  const KEY = 'event-pocket:v1';
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
      version: 1,
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
    return Object.assign(base, data, {
      settings: Object.assign(base.settings, data.settings || {})
    });
  }

  function read() {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.get(KEY, (obj) => resolve(obj ? obj[KEY] : null));
      });
    }
    try {
      const raw = window.localStorage.getItem(KEY);
      return Promise.resolve(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return Promise.resolve(memory.data);
    }
  }

  function write(data) {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [KEY]: data }, () => resolve(true));
      });
    }
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      memory.data = data;
    }
    return Promise.resolve(true);
  }

  EP.uid = function () {
    return (
      Math.random().toString(36).slice(2, 8) +
      Date.now().toString(36).slice(-4)
    );
  };

  EP.store = {
    KEY,
    defaultData,

    async get() {
      return normalize(await read());
    },

    async set(data) {
      await write(normalize(data));
      return data;
    },

    async update(mutator) {
      const data = await this.get();
      const result = mutator(data);
      await write(normalize(data));
      return result === undefined ? data : result;
    },

    async reset() {
      await write(defaultData());
      return defaultData();
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
