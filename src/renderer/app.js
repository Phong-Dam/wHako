// ============================================================
// App Entry
// ============================================================

// ============================================================
// Init
// ============================================================
async function initApp() {
    try {
        await initNavbar();
    } catch (e) {
        console.error('[App] initNavbar error:', e);
    }

    try {
        initDetail();
    } catch (e) {
        console.error('[App] initDetail error:', e);
    }

    try {
        await initHome();
    } catch (e) {
        console.error('[App] initHome error:', e);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    try {
        initApp();
    } catch (e) {
        console.error('[App] initApp error:', e);
    }
});
