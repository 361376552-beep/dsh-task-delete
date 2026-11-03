/**
 * Browser half of @local/dsh-task-delete.
 *
 * Registers one entry in the sidebar session row's "..." menu slot
 * (`sidebar.workspaces.session.menu.item`). The item uses a two-step inline
 * confirm, then POSTs to the host route registered by index.js. Styling and
 * the trash glyph mirror the host's own menu item (danger variant); classes
 * are renamed under the _tdel_ prefix and only --dsw-alias-* tokens are used.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-task-delete',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const CSS = `
._tdel_wrap{position:relative}
._tdel_sep{height:.5px;margin:3px 2px;background:var(--dsw-alias-border-l2)}
._tdel_item{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary);text-align:left}
._tdel_item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
._tdel_item:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);outline:none}
._tdel_item:disabled{opacity:.4;cursor:not-allowed}
._tdel_icon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center;color:inherit}
._tdel_icon svg{width:14px;height:14px}
._tdel_label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

    const PATHS = [
      'M1.28149 3.88831H14.7187',
      'M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833',
      'M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831',
      'M6.44946 6.98926V11.1238',
      'M9.55054 6.98926V11.1238',
    ];

    function TrashIcon() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', strokeWidth: 1 },
        PATHS.map((d, i) => h('path', { key: i, d, stroke: 'currentColor' })),
      );
    }

    function DeleteSessionMenuItem(props) {
      const sessionId = props.sessionId;
      const displayTitle = props.displayTitle || '';
      const useMenuOpenState = props.useMenuOpenState;
      const menuState = typeof useMenuOpenState === 'function' ? useMenuOpenState() : null;
      const setMenuOpen = menuState ? menuState[1] : () => {};
      const [stage, setStage] = React.useState('idle');
      const [errorText, setErrorText] = React.useState('');
      const resetTimer = React.useRef(null);

      const clearReset = () => {
        if (resetTimer.current !== null) {
          clearTimeout(resetTimer.current);
          resetTimer.current = null;
        }
      };
      React.useEffect(() => clearReset, []);
      const armReset = (ms) => {
        clearReset();
        resetTimer.current = setTimeout(() => setStage('idle'), ms);
      };

      const fail = (message) => {
        setErrorText(message || '删除失败');
        setStage('error');
        armReset(4000);
      };

      const run = async () => {
        setStage('busy');
        try {
          const res = await fetch('/dsh-task-delete/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-dsh-task-delete': '1' },
            body: JSON.stringify({ sessionId }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            setMenuOpen(false);
            return;
          }
          fail(data.message);
        } catch {
          fail('无法连接宿主服务');
        }
      };

      const onClick = () => {
        if (stage === 'busy') return;
        if (stage === 'confirm') {
          clearReset();
          run();
          return;
        }
        setStage('confirm');
        armReset(4000);
      };

      const shortTitle = displayTitle.length > 12 ? `${displayTitle.slice(0, 12)}…` : displayTitle;
      const label =
        stage === 'confirm' ? `确认删除「${shortTitle}」？`
        : stage === 'busy' ? '正在删除…'
        : stage === 'error' ? errorText
        : '删除任务';

      return h(
        'div',
        { className: '_tdel_wrap' },
        h('style', null, CSS),
        h('div', { className: '_tdel_sep', role: 'separator' }),
        h(
          'button',
          {
            type: 'button',
            role: 'menuitem',
            className: '_tdel_item',
            disabled: stage === 'busy',
            title: '移入本地回收目录，可恢复',
            onClick,
          },
          h('span', { className: '_tdel_icon' }, h(TrashIcon, null)),
          h('span', { className: '_tdel_label' }, label),
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
          ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.menu.item',
              id: 'task-delete',
              order: 500,
            },
            DeleteSessionMenuItem,
          ),
        );
      },
    };
  },
});
