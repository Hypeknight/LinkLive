window.LinkdNV2UI = {
  topbar(title, links = []) {
    return `
      <div class="topbar">
        <div class="brand">${title}</div>
        <div class="nav">${links.map(l => `<a href="${l.href}">${l.label}</a>`).join('')}</div>
      </div>
    `;
  },
  shell(title, links = []) {
    return `
      <div class="sidebar-shell">
        <aside class="sidebar">
          <div class="brand">${title}</div>
          <div class="section">${links.map(l => `<a href="${l.href}">${l.label}</a>`).join('')}</div>
        </aside>
        <main class="page"><div id="content"></div></main>
      </div>
    `;
  }
};
