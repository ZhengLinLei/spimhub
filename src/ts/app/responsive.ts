// =================
//
//  Responsive helpers (styles: src/scss/page/_responsive.scss)
//   - --header-h: height of the top bar (dropdowns and drawer go under it)
//   - phone: explorer is a drawer (closed on start and after opening a file)
//   - touch: top menus open with a tap instead of hover
//
// =================

const PHONE = window.matchMedia('(max-width: 640px)');
const RESPONSIVE = {
    is_phone: () => PHONE.matches,
    close_drawer: () => {},
    sync: () => {},
};

document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('body > header') as HTMLElement;
    const drawer = document.querySelector('#main-folder') as HTMLElement;

    const backdrop = document.createElement('div');
    backdrop.id = 'drawer-backdrop';
    document.body.appendChild(backdrop);

    const is_phone = RESPONSIVE.is_phone;

    const close_menus = () => {
        header.querySelectorAll('.left .open').forEach(el => el.classList.remove('open'));
    };

    const close_drawer = () => {
        if (is_phone() && drawer.classList.contains('active')) toggle_opt(0);
    };

    const sync = () => {
        document.documentElement.style.setProperty('--header-h', `${header.getBoundingClientRect().height}px`);
        document.body.classList.toggle('drawer-open', is_phone() && drawer.classList.contains('active'));
    };

    // Drawer state -> backdrop
    new MutationObserver(sync).observe(drawer, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', sync);
    PHONE.addEventListener('change', () => {
        if (is_phone()) close_drawer();
        close_menus();
        sync();
    });

    backdrop.addEventListener('click', close_drawer);

    // Tap menus (phone): the label toggles its dropdown, any other tap closes it
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!is_phone()) return;

        const label = target.closest('body > header .left > div > div > a:first-child') as HTMLElement;
        if (label && !label.getAttribute('href')) {
            const item = label.parentElement;
            const open = item.classList.contains('open');
            close_menus();
            if (!open) item.classList.add('open');
            e.preventDefault();
            return;
        }
        if (!target.closest('body > header .left ul')) close_menus();
        else if (target.closest('a[href]')) setTimeout(close_menus, 0);

        // Opening something from the drawer closes it
        if (target.closest('#main-folder .x-file, #opt-files .runner a, #opt-files .pipeline a, #opt-files .editor a, #search-manager-ui a, #search-manager-ui li')) {
            setTimeout(close_drawer, 0);
        }
    }, true);

    // Start: on phones the editor comes first
    const init = () => {
        if (is_phone()) close_drawer();
        sync();
    };
    if (document.readyState === 'complete') setTimeout(init, 0);
    else window.addEventListener('load', () => setTimeout(init, 0));

    RESPONSIVE.close_drawer = close_drawer;
    RESPONSIVE.sync = sync;
});
