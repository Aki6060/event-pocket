/* Event Pocket · 主题层
   与 src/content.css 中的 .ep-root[data-theme] 色值保持同步（浮窗走 CSS，管理页走本文件）
   name 为中文主名；en 为名称旁的英文小词（换肤卡片与预览页展示用） */
(function () {
  var DEFAULT_ID = 'night';

  var VARS = [
    'line', 'ink', 'sub', 'muted', 'bg', 'soft', 'hover',
    'surface', 'surface-2',
    'accent', 'on-accent', 'hot', 'danger',
    'select-bg', 'select-fg',
    'quote-line', 'link', 'badge-bg', 'badge-fg',
    'toast-bg', 'toast-fg', 'toast-sub'
  ];

  var THEMES = {
    night: {
      name: '深红',
      en: 'crimson',
      sw: ['#B9182A', '#1A1A1C', '#9B989E', '#F2F2F3'],
      vars: {
        line: '#E1E1E4', ink: '#1A1A1C', sub: '#6E6C73', muted: '#9B989E',
        bg: '#FFFFFF', soft: '#F2F2F3', hover: '#F2F2F3',
        surface: '#FFFFFF', 'surface-2': '#FAFAFB',
        accent: '#B9182A', 'on-accent': '#FFFFFF', hot: '#B9182A', danger: '#B9182A',
        'select-bg': '#FBEDEF', 'select-fg': '#B9182A',
        'quote-line': '#B9182A', link: '#B9182A',
        'badge-bg': '#F2F2F3', 'badge-fg': '#4A4A50',
        'toast-bg': '#1A1A1C', 'toast-fg': '#FFFFFF', 'toast-sub': '#C9C8CC'
      }
    },
    rei: {
      name: '静蓝',
      en: 'rei',
      sw: ['#35618F', '#BE3A32', '#DCE3EC', '#F7F9FC'],
      vars: {
        line: '#DCE3EC', ink: '#243447', sub: '#5E7186', muted: '#94A3B2',
        bg: '#F7F9FC', soft: '#EDF2F7', hover: '#EDF2F7',
        surface: '#FFFFFF', 'surface-2': '#F7F9FC',
        accent: '#35618F', 'on-accent': '#FFFFFF', hot: '#BE3A32', danger: '#B8324A',
        'select-bg': '#E4EDF6', 'select-fg': '#2F5B8A',
        'quote-line': '#BE3A32', link: '#35618F',
        'badge-bg': '#E4EDF6', 'badge-fg': '#3A5670',
        'toast-bg': '#243447', 'toast-fg': '#F7F9FC', 'toast-sub': '#A8B8C8'
      }
    },
    asuka: {
      name: '焰红',
      en: 'asuka',
      sw: ['#CE2C26', '#2E262B', '#F0DCD3', '#FDF7F4'],
      vars: {
        line: '#F0DCD3', ink: '#2E262B', sub: '#6F5F63', muted: '#A3908F',
        bg: '#FDF7F4', soft: '#FAEDE8', hover: '#FAEDE8',
        surface: '#FFFFFF', 'surface-2': '#FDF7F4',
        accent: '#CE2C26', 'on-accent': '#FFFFFF', hot: '#CE2C26', danger: '#B8324A',
        'select-bg': '#FBEAE5', 'select-fg': '#AE2A20',
        'quote-line': '#CE2C26', link: '#AE2A20',
        'badge-bg': '#FBEAE5', 'badge-fg': '#7A4038',
        'toast-bg': '#2E262B', 'toast-fg': '#FDF7F4', 'toast-sub': '#C3A79E'
      }
    },
    mari: {
      name: '品红',
      en: 'mari',
      sw: ['#B93B78', '#1F9E86', '#EFDDE9', '#FDFAFC'],
      vars: {
        line: '#EFDDE9', ink: '#33243A', sub: '#6B5874', muted: '#A08FA8',
        bg: '#FDFAFC', soft: '#F7EAF2', hover: '#F7EAF2',
        surface: '#FFFFFF', 'surface-2': '#FDFAFC',
        accent: '#B93B78', 'on-accent': '#FFFFFF', hot: '#B93B78', danger: '#B8324A',
        'select-bg': '#F7E6F0', 'select-fg': '#963165',
        'quote-line': '#1F9E86', link: '#963165',
        'badge-bg': '#E4F5F0', 'badge-fg': '#2B6B5E',
        'toast-bg': '#33243A', 'toast-fg': '#FDFAFC', 'toast-sub': '#BFA8C6'
      }
    },
    shinji: {
      name: '紫辉',
      en: 'shinji',
      sw: ['#5B45A8', '#D98324', '#4A9E4F', '#F7F5FA'],
      vars: {
        line: '#E2DEEA', ink: '#2A2440', sub: '#5F5878', muted: '#948DA8',
        bg: '#F7F5FA', soft: '#EFEBF6', hover: '#EFEBF6',
        surface: '#FFFFFF', 'surface-2': '#F7F5FA',
        accent: '#5B45A8', 'on-accent': '#FFFFFF', hot: '#5B45A8', danger: '#B8324A',
        'select-bg': '#EAE4F5', 'select-fg': '#4A3788',
        'quote-line': '#D98324', link: '#4A3788',
        'badge-bg': '#E7F2E6', 'badge-fg': '#38653C',
        'toast-bg': '#2A2440', 'toast-fg': '#F7F5FA', 'toast-sub': '#ADA5C2'
      }
    }
  };

  function get(id) {
    return THEMES[id] || THEMES[DEFAULT_ID];
  }

  function list() {
    return Object.keys(THEMES).map(function (id) {
      return { id: id, name: THEMES[id].name, en: THEMES[id].en, sw: THEMES[id].sw };
    });
  }

  // 把主题变量写到目标元素（管理页传 document.documentElement，浮窗传 shadow 内元素）
  function apply(id, target) {
    var el = target || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!el) return;
    var t = get(id);
    VARS.forEach(function (k) {
      if (t.vars[k]) el.style.setProperty('--ep-' + k, t.vars[k]);
    });
    el.setAttribute('data-ep-theme', t === THEMES[id] ? id : DEFAULT_ID);
  }

  window.EP = window.EP || {};
  window.EP.themes = {
    DEFAULT_ID: DEFAULT_ID,
    get: get,
    list: list,
    apply: apply
  };
})();
