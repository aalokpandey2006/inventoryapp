// ===========================
// FIREBASE CONFIGURATION
// ===========================
const firebaseConfig = {
    apiKey: "AIzaSyAwq2CmeWz3dyQhsKQ6dmDldqOKWaRUBQ0",
    authDomain: "inventoryapp-395f6.firebaseapp.com",
    projectId: "inventoryapp-395f6",
    storageBucket: "inventoryapp-395f6.firebasestorage.app",
    messagingSenderId: "699684934125",
    appId: "1:699684934125:web:88c1463979739fd57f17e4",
    measurementId: "G-PSC8MSEHFL"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ===========================
// CONSTANTS
// ===========================
const WAREHOUSE_CATEGORIES = [
    { id: 'toilet_cleaner',         name: 'Toilet Cleaner',             icon: '🚽' },
    { id: 'dishwasher',             name: 'Dishwasher',                 icon: '🍽️' },
    { id: 'phenyl',                 name: 'Phenyl',                     icon: '🧴' },
    { id: 'glass_cleaner',          name: 'Glass Cleaner',              icon: '🪟' },
    { id: 'bathroom_floor_cleaner', name: 'Bathroom & Floor Cleaner',   icon: '🧹' },
];

const DEFAULT_WAREHOUSE_DOC = {
    // Raw Materials Pipeline
    rawMaterialsOrdered:     0,
    rawMaterialsInInventory: 0,
    productionRatePerDay:    0,
    estimatedClearanceDate:  null,
    // Stock
    stockRemaining:  0,
    minimumStock:    10,
    // Delivery
    outForDelivery:  0,
    lastBatchDate:   null,
    // Meta
    lastUpdated:     null,
    lastUpdatedBy:   '',
};

// ===========================
// MAIN APP
// ===========================
document.addEventListener('DOMContentLoaded', () => {

    // ----- AUTH CHECK & ROLE CHECK -----
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) { window.location.href = 'login.html'; return; }

    // Set sidebar user display
    const sidebarUser = document.getElementById('sidebarUser');
    if (sidebarUser) sidebarUser.textContent = currentUser;

    window.receivesNotifications = true; // Default to true
    window.isSuperAdmin = false; // Default to false

    async function checkUserRole() {
        try {
            const userDoc = await db.collection('users').doc(currentUser.toLowerCase()).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                window.receivesNotifications = userData.receivesNotifications !== false;
                window.isSuperAdmin = userData.role === 'super_admin';
                
                // Update UI based on role
                const navIcon = document.getElementById('nav-admin-icon');
                const navLabel = document.getElementById('nav-admin-label');
                const sectionTitle = document.getElementById('admin-section-title');
                const sectionSubtitle = document.getElementById('admin-section-subtitle');

                if (window.isSuperAdmin) {
                    if (navIcon) navIcon.textContent = '👑';
                    if (navLabel) navLabel.textContent = 'Admin Panel';
                    if (sectionTitle) sectionTitle.innerHTML = '👑 Admin <span class="highlight">Panel</span>';
                    if (sectionSubtitle) sectionSubtitle.textContent = 'Manage system users, adjust access roles, and route notifications.';
                    if (typeof SECTION_LABELS !== 'undefined') SECTION_LABELS.admin = '👑 Admin Panel';
                } else {
                    if (navIcon) navIcon.textContent = '👥';
                    if (navLabel) navLabel.textContent = 'Users';
                    if (sectionTitle) sectionTitle.innerHTML = '👥 User <span class="highlight">Directory</span>';
                    if (sectionSubtitle) sectionSubtitle.textContent = 'View registered users and their access roles.';
                    if (typeof SECTION_LABELS !== 'undefined') SECTION_LABELS.admin = '👥 Users';
                }

                // Initialize the table rendering (since it's now visible to everyone)
                initAdminPanel();
            }
        } catch (err) {
            console.error('Error fetching user role:', err);
            initAdminPanel();
        }
    }
    checkUserRole();

    // ===========================
    // ADMIN PANEL USER MANAGEMENT
    // ===========================
    let usersListener = null;

    function initAdminPanel() {
        if (usersListener) return;
        const usersBody = document.getElementById('usersBody');
        if (!usersBody) return;

        // Dynamically adjust table headers based on role
        const tableHeader = document.getElementById('usersTable')?.querySelector('thead tr');
        if (tableHeader) {
            if (window.isSuperAdmin) {
                tableHeader.innerHTML = `
                    <th>Username</th>
                    <th>Role</th>
                    <th>Alerts Routing</th>
                    <th>Registered At</th>
                `;
            } else {
                tableHeader.innerHTML = `
                    <th>Username</th>
                    <th>Role</th>
                    <th>Registered At</th>
                `;
            }
        }

        usersBody.innerHTML = `<tr><td colspan="${window.isSuperAdmin ? 4 : 3}" style="text-align:center;color:var(--text-secondary);">Loading users...</td></tr>`;

        usersListener = db.collection('users').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
            usersBody.innerHTML = '';
            if (snapshot.empty) {
                usersBody.innerHTML = `<tr><td colspan="${window.isSuperAdmin ? 4 : 3}" style="text-align:center;color:var(--text-secondary);">No registered users found.</td></tr>`;
                return;
            }

            snapshot.forEach(doc => {
                const user = doc.data();
                const uId = doc.id;
                const isSelf = uId === currentUser.toLowerCase();

                const dateStr = user.createdAt
                    ? (user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'N/A';

                const tr = document.createElement('tr');

                if (window.isSuperAdmin) {
                    const roleSelectHtml = `
                        <select class="priority-badge ${user.role === 'super_admin' ? 'priority-high' : 'priority-low'}" 
                                onchange="updateUserRole('${uId}', this.value)"
                                ${isSelf ? 'disabled' : ''}
                                style="cursor:${isSelf ? 'not-allowed' : 'pointer'};border:1px solid rgba(255,255,255,0.1);outline:none;border-radius:4px;padding:0.25rem 0.5rem;font-family:inherit;">
                            <option value="user" ${user.role !== 'super_admin' ? 'selected' : ''}>User</option>
                            <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                        </select>
                    `;

                    const notifEnabled = user.receivesNotifications !== false;
                    const notifSelectHtml = `
                        <select class="priority-badge ${notifEnabled ? 'priority-medium' : 'priority-low'}" 
                                onchange="updateUserNotif('${uId}', this.value === 'true')"
                                style="cursor:pointer;border:1px solid rgba(255,255,255,0.1);outline:none;border-radius:4px;padding:0.25rem 0.5rem;font-family:inherit;">
                            <option value="true" ${notifEnabled ? 'selected' : ''}>Receive Alerts</option>
                            <option value="false" ${!notifEnabled ? 'selected' : ''}>Muted</option>
                        </select>
                    `;

                    tr.innerHTML = `
                        <td data-label="Username" style="font-weight:600;color:var(--text-primary);">${user.username} ${isSelf ? ' <span style="font-size:0.75rem;opacity:0.65;font-weight:normal;">(You)</span>' : ''}</td>
                        <td data-label="Role">${roleSelectHtml}</td>
                        <td data-label="Alerts">${notifSelectHtml}</td>
                        <td data-label="Registered">${dateStr}</td>
                    `;
                } else {
                    const roleBadge = user.role === 'super_admin'
                        ? `<span class="priority-badge priority-high">Super Admin</span>`
                        : `<span class="priority-badge priority-low">User</span>`;

                    tr.innerHTML = `
                        <td data-label="Username" style="font-weight:600;color:var(--text-primary);">${user.username} ${isSelf ? ' <span style="font-size:0.75rem;opacity:0.65;font-weight:normal;">(You)</span>' : ''}</td>
                        <td data-label="Role">${roleBadge}</td>
                        <td data-label="Registered">${dateStr}</td>
                    `;
                }

                usersBody.appendChild(tr);
            });
        }, err => {
            console.error('Users snapshot error:', err);
            usersBody.innerHTML = `<tr><td colspan="${window.isSuperAdmin ? 4 : 3}" style="text-align:center;color:var(--danger-color);">Error loading users. Access Denied.</td></tr>`;
        });
    }

    window.updateUserRole = async (userId, newRole) => {
        try {
            await db.collection('users').doc(userId).update({ role: newRole });
            showToast('Role Updated ✅', `User role updated to ${newRole}.`, 'success');
        } catch (err) {
            console.error('Role update error:', err);
            showToast('Update Failed', 'Failed to update user role.', 'danger');
        }
    };

    window.updateUserNotif = async (userId, receivesNotif) => {
        try {
            await db.collection('users').doc(userId).update({ receivesNotifications: receivesNotif });
            showToast('Alerts Updated ✅', `Alert setting updated.`, 'success');
        } catch (err) {
            console.error('Alert config update error:', err);
            showToast('Update Failed', 'Failed to update alert routing.', 'danger');
        }
    };

    // ===========================
    // NOTIFICATION BELL SYSTEM
    // ===========================
    const notifStore = []; // In-memory notification list
    let unreadCount  = 0;

    function addNotification(type, title, message) {
        if (window.receivesNotifications === false) return; // Muted for current user
        notifStore.unshift({ id: Date.now(), type, title, message, time: new Date(), read: false });
        unreadCount++;
        updateBellBadge();
        showToast(title, message, type); // also show a toast
    }

    function updateBellBadge() {
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    function renderNotifPanel() {
        const list = document.getElementById('notifList');
        if (!list) return;
        if (notifStore.length === 0) {
            list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
            return;
        }
        list.innerHTML = notifStore.map(n => {
            const timeStr = n.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) +
                            ' • ' + n.time.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const iconMap = { danger: '🔴', warn: '⚠️', success: '✅', info: 'ℹ️' };
            return `
                <div class="notif-item ${n.read ? 'notif-read' : ''} notif-type-${n.type}">
                    <span class="notif-item-icon">${iconMap[n.type] || '🔔'}</span>
                    <div class="notif-item-body">
                        <div class="notif-item-title">${n.title}</div>
                        <div class="notif-item-msg">${n.message}</div>
                        <div class="notif-item-time">${timeStr}</div>
                    </div>
                    ${!n.read ? '<span class="notif-unread-dot"></span>' : ''}
                </div>`;
        }).join('');
    }

    window.toggleNotifPanel = function() {
        const panel = document.getElementById('notifPanel');
        if (!panel) return;
        const isOpen = panel.classList.toggle('open');
        if (isOpen) {
            // Mark all as read when opened
            notifStore.forEach(n => { n.read = true; });
            unreadCount = 0;
            updateBellBadge();
            renderNotifPanel();
        }
    };

    window.clearAllNotifications = function() {
        notifStore.length = 0;
        unreadCount = 0;
        updateBellBadge();
        renderNotifPanel();
    };

    // Close notif panel when clicking outside
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('notifPanel');
        const bell  = document.getElementById('notifBellBtn');
        if (panel && panel.classList.contains('open') &&
            !panel.contains(e.target) && e.target !== bell && !bell?.contains(e.target)) {
            panel.classList.remove('open');
        }
    });

    // ----- LOGOUT -----
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('currentUser');
            window.location.href = 'login.html';
        });
    }

    // ===========================
    // SIDEBAR LOGIC
    // ===========================
    const hamburgerBtn   = document.getElementById('hamburgerBtn');
    const sidebar        = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');

    function openSidebar() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    hamburgerBtn.addEventListener('click', openSidebar);
    closeSidebarBtn.addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);

    // ===========================
    // SECTION SWITCHING
    // ===========================
    const navItems            = document.querySelectorAll('.nav-item');
    const pageSections        = document.querySelectorAll('.page-section');
    const headerSectionLabel  = document.getElementById('headerSectionLabel');

    const SECTION_LABELS = {
        delivery:  '🚚 Out for Delivery',
        warehouse: '🏭 Warehouse',
        admin:     '👑 Admin Panel'
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.section;

            navItems.forEach(n => n.classList.remove('active'));
            pageSections.forEach(s => s.classList.remove('active'));

            item.classList.add('active');
            const targetSection = document.getElementById(target + '-section');
            if (targetSection) targetSection.classList.add('active');

            if (headerSectionLabel) headerSectionLabel.textContent = SECTION_LABELS[target] || '';

            closeSidebar();
        });
    });

    // ===========================
    // TOAST NOTIFICATION SYSTEM
    // ===========================
    function showToast(title, msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const icons = { info: 'ℹ️', warn: '⚠️', danger: '🔴', success: '✅' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
            <div class="toast-body">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${msg}</div>
            </div>
        `;
        container.appendChild(toast);

        // Auto-remove after 6s
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        }, 6000);
    }

    // ===========================
    // BROWSER NOTIFICATION HELPER
    // ===========================
    function sendBrowserNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body });
        }
    }

    // ===========================
    // NOTIFICATION SETTINGS
    // ===========================
    const notifSettingsBtn = document.getElementById('notifSettingsBtn');
    const notifModal       = document.getElementById('notifModal');
    const closeNotifBtn    = document.querySelector('.close-notif-btn');
    const notifForm        = document.getElementById('notifForm');

    async function loadNotifSettings() {
        try {
            const doc = await db.collection('settings').doc('notifications').get();
            if (doc.exists) {
                const d = doc.data();
                const emailEl = document.getElementById('notifEmail');
                const phoneEl = document.getElementById('notifPhone');
                const toggleEl = document.getElementById('browserNotifToggle');
                if (emailEl)  emailEl.value    = d.email  || '';
                if (phoneEl)  phoneEl.value    = d.phone  || '';
                if (toggleEl) toggleEl.checked = d.browserNotifications || false;
            }
        } catch (e) { /* silent */ }
    }

    if (notifSettingsBtn) {
        notifSettingsBtn.addEventListener('click', () => {
            loadNotifSettings();
            notifModal.style.display = 'flex';
        });
    }

    if (closeNotifBtn) {
        closeNotifBtn.addEventListener('click', () => { notifModal.style.display = 'none'; });
    }

    window.addEventListener('click', (e) => {
        if (e.target === notifModal) notifModal.style.display = 'none';
    });

    if (notifForm) {
        notifForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email               = document.getElementById('notifEmail').value.trim();
            const phone               = document.getElementById('notifPhone').value.trim();
            const browserNotifications = document.getElementById('browserNotifToggle').checked;

            // Request browser notification permission
            if (browserNotifications && 'Notification' in window && Notification.permission !== 'granted') {
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') {
                    showToast('Permission Denied', 'Browser notifications were not allowed.', 'warn');
                }
            }

            try {
                await db.collection('settings').doc('notifications').set({ email, phone, browserNotifications, updatedBy: currentUser });
                notifModal.style.display = 'none';
                showToast('Settings Saved ✅', 'Notification settings updated successfully.', 'success');
            } catch (err) {
                console.error(err);
                showToast('Error', 'Failed to save settings. Check your connection.', 'danger');
            }
        });
    }

    // ===========================
    // WAREHOUSE DATA & RENDERING
    // ===========================
    let warehouseData = {};
    const notifCheckedOnce = new Set(); // Prevent notification spam on load

    /**
     * Check and fire alerts for a given category.
     * Pushes to the notification bell instead of inline banners.
     */
    function checkAndFireAlerts(catId, data) {
        const cat = WAREHOUSE_CATEGORIES.find(c => c.id === catId);
        if (!cat || notifCheckedOnce.has(catId)) return;
        notifCheckedOnce.add(catId);

        // Minimum stock alert
        if (typeof data.minimumStock === 'number' && data.minimumStock > 0 &&
            typeof data.stockRemaining === 'number' && data.stockRemaining <= data.minimumStock) {
            addNotification('danger',
                `Low Stock: ${cat.name}`,
                `Stock (${data.stockRemaining} units) has hit the minimum level of ${data.minimumStock} units.`);
            sendBrowserNotification(`Low Stock: ${cat.name}`, `Only ${data.stockRemaining} units left.`);
        }

        // Week-clearance alert
        if (data.lastBatchDate) {
            const batchMs   = data.lastBatchDate.toMillis ? data.lastBatchDate.toMillis() : Number(data.lastBatchDate);
            const daysSince = (Date.now() - batchMs) / 86400000;
            if (daysSince > 7 && (data.stockRemaining || 0) > 0) {
                addNotification('warn',
                    `Stock Not Cleared: ${cat.name}`,
                    `Batch is ${Math.floor(daysSince)} days old. Stock should clear within a week.`);
                sendBrowserNotification(`Stock Not Cleared: ${cat.name}`, `Batch is ${Math.floor(daysSince)} days old.`);
            }
        }
    }

    /**
     * renderWarehouseAlerts: replaced by bell notification system — no inline banners.
     */
    function renderWarehouseAlerts() { /* no-op: alerts go to the notification bell */ }

    /**
     * Render the sticky stock indicator strip on the delivery page.
     * Each tank is clickable to edit stock inline.
     */
    function renderStockStrip() {
        const container = document.getElementById('stripIndicators');
        if (!container) return;
        container.innerHTML = '';

        WAREHOUSE_CATEGORIES.forEach(cat => {
            const data     = warehouseData[cat.id] || { stockRemaining: 0, minimumStock: 10 };
            const stock    = data.stockRemaining || 0;
            const minStock = data.minimumStock   || 10;
            const maxRef   = Math.max(stock, minStock * 5, 100);
            const pct      = Math.min(100, Math.max(0, Math.round((stock / maxRef) * 100)));

            let fillClass = 'level-ok';
            if (stock <= minStock) fillClass = 'level-critical';
            else if (pct < 40)    fillClass = 'level-warn';

            const item = document.createElement('div');
            item.className = 'stock-indicator';
            item.dataset.catId = cat.id;
            item.title = `${cat.name}: ${stock} units (${pct}%) — Click to edit`;
            item.innerHTML = `
                <div class="stock-tank strip-tank-clickable"
                     onclick="openStripEdit('${cat.id}', this)"
                     title="Click to edit stock">
                    <div class="stock-tank-fill ${fillClass}" style="height: ${pct}%;"></div>
                    <span class="tank-edit-hint">✏️</span>
                </div>
                <div class="stock-tank-pct">${pct}%</div>
                <div class="stock-indicator-name">${cat.name}</div>
            `;
            container.appendChild(item);
        });
    }

    /**
     * Open a quick-edit popover anchored below a clicked tank
     */
    window.openStripEdit = function(catId, tankEl) {
        // Toggle: close if already open for same cat
        const existing = document.getElementById('strip-popover');
        if (existing) {
            const existingCat = existing.dataset.catId;
            existing.remove();
            if (existingCat === catId) return;
        }

        const data = warehouseData[catId] || { ...DEFAULT_WAREHOUSE_DOC };
        const cat  = WAREHOUSE_CATEGORIES.find(c => c.id === catId);
        if (!cat) return;

        const maxRef = Math.max(data.stockRemaining || 0, (data.minimumStock || 10) * 5, 100);
        const pct    = Math.min(100, Math.max(0, Math.round(((data.stockRemaining || 0) / maxRef) * 100)));

        const popover = document.createElement('div');
        popover.id = 'strip-popover';
        popover.className = 'strip-popover';
        popover.dataset.catId = catId;
        popover.innerHTML = `
            <div class="strip-popover-header">
                <span>${cat.icon} <strong>${cat.name}</strong></span>
                <button class="strip-popover-close" onclick="document.getElementById('strip-popover').remove()">✕</button>
            </div>
            <div class="strip-popover-body">
                <div class="spop-row">
                    <label>Stock Remaining</label>
                    <input type="number" id="spop-stock" value="${data.stockRemaining || 0}" min="0" placeholder="0">
                </div>
                <div class="spop-row">
                    <label>Min. Stock Threshold</label>
                    <input type="number" id="spop-min" value="${data.minimumStock || 10}" min="0" placeholder="10">
                </div>
                <div class="spop-pct-preview">
                    <span>Current: </span>
                    <span id="spop-pct-val" class="spop-pct-num">${pct}%</span>
                    <span style="color:var(--text-secondary)"> of stock capacity</span>
                </div>
            </div>
            <div class="spop-actions">
                <button class="btn-primary spop-save" onclick="saveStripEdit('${catId}')">✓ Save</button>
                <button class="spop-cancel" onclick="document.getElementById('strip-popover').remove()">Cancel</button>
            </div>
        `;

        // Position popover below the strip
        const strip = document.getElementById('stockStrip');
        if (strip) {
            strip.style.overflow = 'visible';
            strip.appendChild(popover);
        }

        // Live-update percentage preview as user types
        const stockInput = document.getElementById('spop-stock');
        if (stockInput) {
            stockInput.focus();
            stockInput.select();
            stockInput.addEventListener('input', () => {
                const s   = parseFloat(stockInput.value) || 0;
                const max = Math.max(s, (data.minimumStock || 10) * 5, 100);
                const p   = Math.min(100, Math.max(0, Math.round((s / max) * 100)));
                const el  = document.getElementById('spop-pct-val');
                if (el) {
                    el.textContent = p + '%';
                    el.style.color = p <= 20 ? '#ff4444' : p < 40 ? '#ffb400' : '#00ff88';
                }
            });
            stockInput.addEventListener('keydown', e => {
                if (e.key === 'Enter')  saveStripEdit(catId);
                if (e.key === 'Escape') document.getElementById('strip-popover')?.remove();
            });
        }

        // Close on outside click (after a short delay to avoid immediate close)
        setTimeout(() => {
            function outsideClick(e) {
                const pop = document.getElementById('strip-popover');
                if (pop && !pop.contains(e.target) && !e.target.closest('.strip-tank-clickable')) {
                    pop.remove();
                    document.removeEventListener('click', outsideClick);
                }
            }
            document.addEventListener('click', outsideClick);
        }, 150);
    };

    /**
     * Save edited stock values from the strip popover to Firestore.
     * Firestore onSnapshot will automatically re-render both the strip
     * and the warehouse cards — keeping both pages in sync.
     */
    window.saveStripEdit = async function(catId) {
        const stockInput = document.getElementById('spop-stock');
        const minInput   = document.getElementById('spop-min');
        if (!stockInput) return;

        const stock    = Math.max(0, parseFloat(stockInput.value) || 0);
        const minStock = Math.max(0, parseFloat(minInput?.value)  || 0);
        const prevStock = (warehouseData[catId] || {}).stockRemaining || 0;

        const update = {
            stockRemaining: stock,
            minimumStock:   minStock,
            lastUpdated:    firebase.firestore.FieldValue.serverTimestamp(),
            lastUpdatedBy:  currentUser,
        };

        // Auto-set batch date when stock is significantly replenished
        if (stock > prevStock * 1.5 || prevStock === 0) {
            update.lastBatchDate = firebase.firestore.FieldValue.serverTimestamp();
        }

        try {
            await db.collection('warehouse').doc(catId).update(update);
            document.getElementById('strip-popover')?.remove();
            const cat = WAREHOUSE_CATEGORIES.find(c => c.id === catId);
            showToast('Stock Updated ✅',
                `${cat?.name || catId}: ${stock} units remaining.`,
                'success');
            // Allow notifications to re-evaluate after the update
            notifCheckedOnce.delete(catId);
        } catch (err) {
            console.error(err);
            showToast('Save Failed', 'Could not update stock. Check your connection.', 'danger');
        }
    };

    /**
     * Build one editable row HTML for a warehouse card
     */
    function buildEditableRow(catId, field, label, value, inputType, unit) {
        let displayVal;
        if (inputType === 'date') {
            if (value && value.toDate) {
                displayVal = value.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            } else if (value) {
                displayVal = new Date(typeof value === 'number' ? value : value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            } else {
                displayVal = '—';
            }
        } else if (inputType === 'number') {
            displayVal = (value !== undefined && value !== null) ? `${value}${unit ? ' ' + unit : ''}` : `0${unit ? ' ' + unit : ''}`;
        } else {
            displayVal = (value !== undefined && value !== null && value !== '') ? value : '—';
        }

        // Encode unit for onclick (avoid quote issues)
        const safeUnit = unit.replace(/'/g, '');
        return `
            <div class="wcard-row" id="row-${catId}-${field}">
                <span class="wcard-label">${label}</span>
                <div class="wcard-value-wrap">
                    <span class="wcard-value" id="val-${catId}-${field}">${displayVal}</span>
                    <button class="btn-edit-field" onclick="startFieldEdit('${catId}','${field}','${inputType}','${safeUnit}')" title="Edit ${label}">✏️</button>
                </div>
            </div>`;
    }

    /**
     * Render a single warehouse card with fields in order:
     * Raw Materials Ordered → In Inventory → Production Rate → Clearance Date
     * → Stock Remaining → Min Threshold → Out for Delivery → Stock After Delivery
     */
    function renderWarehouseCard(cat, data) {
        const stock    = data.stockRemaining      || 0;
        const minStock = data.minimumStock        || 10;
        const outDel   = data.outForDelivery      || 0;
        const rmOrd    = data.rawMaterialsOrdered || 0;
        const rmInv    = data.rawMaterialsInInventory || 0;
        const prodRate = data.productionRatePerDay    || 0;
        const stockAfterDelivery = stock - outDel;

        const maxRef = Math.max(stock, minStock * 5, 100);
        const pct    = Math.min(100, Math.max(0, Math.round((stock / maxRef) * 100)));

        // Auto-calculate clearance date from production rate
        let clearanceDateDisplay = '—';
        let clearanceDateValue   = data.estimatedClearanceDate || null;
        if (prodRate > 0 && stock > 0) {
            const daysNeeded = Math.ceil(stock / prodRate);
            const calcDate   = new Date();
            calcDate.setDate(calcDate.getDate() + daysNeeded);
            clearanceDateDisplay = calcDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ` (~${daysNeeded}d)`;
        } else if (clearanceDateValue) {
            const cd = clearanceDateValue.toDate ? clearanceDateValue.toDate() : new Date(clearanceDateValue);
            clearanceDateDisplay = cd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        }

        // Badge/status
        let fillColor, badgeClass, badgeText, cardClass = '';
        if (stock <= minStock && minStock > 0) {
            fillColor = '#ff4444'; badgeClass = 'badge-critical'; badgeText = 'Critical'; cardClass = 'alert-card';
        } else if (pct < 40) {
            fillColor = '#ffb400'; badgeClass = 'badge-warn'; badgeText = 'Low'; cardClass = 'warn-card';
        } else {
            fillColor = '#00ff88'; badgeClass = 'badge-ok'; badgeText = 'OK';
        }

        // Last updated text
        let updatedText = 'Never updated';
        if (data.lastUpdated) {
            const d = data.lastUpdated.toDate ? data.lastUpdated.toDate() : new Date(data.lastUpdated);
            updatedText = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        }

        // Batch age
        let batchAgeHtml = '';
        let batchDateInput = '';
        if (data.lastBatchDate) {
            const bd = data.lastBatchDate.toDate ? data.lastBatchDate.toDate() : new Date(data.lastBatchDate);
            batchDateInput = bd.toISOString().split('T')[0];
            const daysSince = (Date.now() - bd.getTime()) / 86400000;
            batchAgeHtml = daysSince > 7 && stock > 0
                ? `<span class="clearance-warn">⚠️ Batch ${Math.floor(daysSince)}d old</span>`
                : `<span>Batch: ${Math.floor(daysSince)}d ago</span>`;
        }

        const card = document.createElement('div');
        card.className = `warehouse-card ${cardClass}`;
        card.dataset.catId = cat.id;

        card.innerHTML = `
            <div class="wcard-header">
                <div class="wcard-title">
                    <span class="wcard-icon">${cat.icon}</span>
                    <span class="wcard-name">${cat.name}</span>
                </div>
                <span class="wcard-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="wcard-body">

                <div class="wcard-section-label">📦 Raw Materials</div>
                ${buildEditableRow(cat.id, 'rawMaterialsOrdered',     'Ordered',               rmOrd,    'number', 'units')}
                ${buildEditableRow(cat.id, 'rawMaterialsInInventory', 'In Inventory',           rmInv,    'number', 'units')}
                ${buildEditableRow(cat.id, 'productionRatePerDay',    'Converted / Day',        prodRate, 'number', 'units/day')}
                <div class="wcard-row">
                    <span class="wcard-label">Est. Clearance Date</span>
                    <span class="wcard-value auto-calc" style="font-size:0.8rem;">${clearanceDateDisplay}</span>
                </div>

                <hr class="wcard-divider">
                <div class="wcard-section-label">🏭 Stock</div>
                ${buildEditableRow(cat.id, 'stockRemaining', 'Stock Remaining',      stock,    'number', 'units')}
                ${buildEditableRow(cat.id, 'minimumStock',   'Min. Stock Threshold', minStock, 'number', 'units')}

                <hr class="wcard-divider">
                <div class="wcard-section-label">🚚 Delivery</div>
                ${buildEditableRow(cat.id, 'outForDelivery', 'Out for Delivery', outDel, 'number', 'units')}
                ${buildEditableRow(cat.id, 'lastBatchDate',  'Batch Made On',
                    batchDateInput ? { toDate: () => new Date(batchDateInput) } : null, 'date', '')}
                <div class="wcard-row">
                    <span class="wcard-label">Stock After Delivery</span>
                    <span class="wcard-value auto-calc ${stockAfterDelivery < 0 ? 'negative' : ''}">${stockAfterDelivery} units</span>
                </div>
            </div>
            <div class="wcard-stock-bar-wrap">
                <div class="stock-bar-label">
                    <span>Stock Level</span>
                    <span>${stock} / ~${maxRef} units (${pct}%)</span>
                </div>
                <div class="stock-bar-track">
                    <div class="stock-bar-fill" style="width:${pct}%; background:${fillColor};"></div>
                </div>
            </div>
            <div class="wcard-footer">
                <span>Updated: ${updatedText}${data.lastUpdatedBy ? ' by ' + data.lastUpdatedBy : ''}</span>
                ${batchAgeHtml}
            </div>
        `;
        return card;
    }

    /**
     * Full re-render of warehouse grid + strip
     */
    function renderWarehouseGrid() {
        const grid = document.getElementById('warehouseGrid');
        if (!grid) return;
        grid.innerHTML = '';

        WAREHOUSE_CATEGORIES.forEach(cat => {
            const data = warehouseData[cat.id] || { ...DEFAULT_WAREHOUSE_DOC };
            grid.appendChild(renderWarehouseCard(cat, data));
        });

        renderWarehouseAlerts();
        renderStockStrip();
    }

    // ===========================
    // FIRESTORE — WAREHOUSE
    // ===========================
    db.collection('warehouse').onSnapshot(async (snapshot) => {
        warehouseData = {};
        snapshot.forEach(doc => {
            warehouseData[doc.id] = doc.data();
        });

        // Initialise missing category documents with defaults
        const batch = db.batch();
        let needsCommit = false;

        WAREHOUSE_CATEGORIES.forEach(cat => {
            if (!warehouseData[cat.id]) {
                const ref = db.collection('warehouse').doc(cat.id);
                batch.set(ref, {
                    ...DEFAULT_WAREHOUSE_DOC,
                    category: cat.name,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                });
                needsCommit = true;
            }
        });

        if (needsCommit) {
            await batch.commit().catch(console.error);
        }

        renderWarehouseGrid();

        // Fire alerts (once per session per category)
        WAREHOUSE_CATEGORIES.forEach(cat => {
            if (warehouseData[cat.id]) {
                checkAndFireAlerts(cat.id, warehouseData[cat.id]);
            }
        });
    }, err => console.error('Warehouse Firestore error:', err));

    // ===========================
    // INLINE FIELD EDITING
    // ===========================
    window.startFieldEdit = function (catId, field, inputType, unit) {
        const rowEl = document.getElementById(`row-${catId}-${field}`);
        if (!rowEl) return;

        const data = warehouseData[catId] || {};
        let currentVal = data[field] !== undefined ? data[field] : '';

        // Convert Timestamp to ISO date string for date inputs
        if (inputType === 'date') {
            if (currentVal && currentVal.toDate) {
                currentVal = currentVal.toDate().toISOString().split('T')[0];
            } else if (currentVal && typeof currentVal === 'number') {
                currentVal = new Date(currentVal).toISOString().split('T')[0];
            } else {
                currentVal = '';
            }
        }

        const wrapEl = rowEl.querySelector('.wcard-value-wrap');
        wrapEl.innerHTML = `
            <input
                class="field-input"
                id="finput-${catId}-${field}"
                type="${inputType}"
                value="${currentVal}"
                placeholder="${inputType === 'number' ? '0' : 'Enter...'}"
            >
            <button class="btn-save-field" onclick="saveFieldEdit('${catId}','${field}','${inputType}','${unit}')">✓</button>
        `;

        const input = document.getElementById(`finput-${catId}-${field}`);
        if (input) {
            input.focus();
            if (input.select) input.select();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')  saveFieldEdit(catId, field, inputType, unit);
                if (e.key === 'Escape') renderWarehouseGrid();
            });
        }
    };

    window.saveFieldEdit = async function (catId, field, inputType, unit) {
        const input = document.getElementById(`finput-${catId}-${field}`);
        if (!input) return;

        let value = input.value;

        if (inputType === 'number') {
            value = parseFloat(value);
            if (isNaN(value)) value = 0;
        }

        if (inputType === 'date' && value) {
            value = firebase.firestore.Timestamp.fromDate(new Date(value));
        } else if (inputType === 'date' && !value) {
            value = null;
        }

        const update = {
            [field]: value,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            lastUpdatedBy: currentUser,
        };

        // Auto-set lastBatchDate when stockRemaining is significantly increased
        if (field === 'stockRemaining') {
            const prev = (warehouseData[catId] || {}).stockRemaining || 0;
            const newVal = typeof value === 'number' ? value : 0;
            if (newVal > prev * 1.5 || prev === 0) {
                update.lastBatchDate = firebase.firestore.FieldValue.serverTimestamp();
                showToast('Batch Date Updated', `${catId.replace(/_/g, ' ')} batch date auto-set to today.`, 'info');
            }
        }

        try {
            await db.collection('warehouse').doc(catId).update(update);
            // Allow re-checking notifications after a meaningful update
            notifCheckedOnce.delete(catId);
            showToast('Saved ✅', 'Warehouse data updated.', 'success');
        } catch (err) {
            console.error(err);
            showToast('Save Failed', 'Could not update data. Check your connection.', 'danger');
        }
    };

    // ===========================
    // DELIVERY TABLE — FIRESTORE
    // ===========================
    let inventory = [];
    const addRowBtn     = document.getElementById('addRowBtn');
    const addModal      = document.getElementById('addModal');
    const closeBtn      = document.querySelector('.close-btn');
    const addItemForm   = document.getElementById('addItemForm');
    const inventoryBody = document.getElementById('inventoryBody');

    // Helper: resize image before storing
    function resizeImage(file, maxSize) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;
                    if (w > h && w > maxSize) { h *= maxSize / w; w = maxSize; }
                    else if (h > maxSize)     { w *= maxSize / h; h = maxSize; }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Real-time listener for inventory collection
    db.collection('inventory').orderBy('order', 'asc').onSnapshot(snapshot => {
        inventory = [];
        snapshot.forEach(doc => inventory.push({ id: doc.id, ...doc.data() }));
        renderTable();
    }, err => {
        console.error('Inventory Firestore error:', err);
        if (inventoryBody) {
            inventoryBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--danger-color);">Error connecting to database.</td></tr>`;
        }
    });

    // Open/close modal
    if (addRowBtn) addRowBtn.addEventListener('click', () => { addModal.style.display = 'flex'; });
    if (closeBtn)  closeBtn.addEventListener('click',  () => { addModal.style.display = 'none'; addItemForm.reset(); });
    window.addEventListener('click', e => {
        if (e.target === addModal) { addModal.style.display = 'none'; addItemForm.reset(); }
    });

    // Category mapping helper
    function getCategoryId(categoryName) {
        if (!categoryName) return '';
        const nameLower = categoryName.toLowerCase().trim();
        if (nameLower.includes('toilet')) return 'toilet_cleaner';
        if (nameLower.includes('dish')) return 'dishwasher';
        if (nameLower.includes('phenyl')) return 'phenyl';
        if (nameLower.includes('glass')) return 'glass_cleaner';
        if (nameLower.includes('floor') || nameLower.includes('bathroom')) return 'bathroom_floor_cleaner';
        return '';
    }

    // Form submission
    if (addItemForm) {
        addItemForm.addEventListener('submit', async e => {
            e.preventDefault();
            const submitBtn = addItemForm.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Adding...'; submitBtn.disabled = true;

            const category        = document.getElementById('category').value;
            const productName     = document.getElementById('productName').value;
            const purchaser       = document.getElementById('purchaser').value;
            const quantity        = document.getElementById('quantity').value;
            const clientName      = document.getElementById('clientName').value;
            const broughtBy       = document.getElementById('broughtBy').value;
            const assignedDelivery = document.getElementById('assignedDelivery').value;
            const priority        = document.getElementById('priority').value;
            const imageUpload     = document.getElementById('imageUpload');

            let imageBase64 = null;
            if (imageUpload.files && imageUpload.files[0]) {
                imageBase64 = await resizeImage(imageUpload.files[0], 400);
            }

            const order = inventory.length > 0 ? inventory[inventory.length - 1].order + 100 : 100;

            const newItem = {
                category, productName, purchaser, quantity: parseFloat(quantity) || 0,
                clientName, broughtBy, assignedDelivery, priority,
                status: 'Undelivered',
                addedBy: currentUser,
                image: imageBase64,
                order,
                createdAt: Date.now(),
            };

            try {
                await db.collection('inventory').add(newItem);
                
                // Increment outForDelivery in warehouse
                const catId = getCategoryId(category);
                if (catId) {
                    const qty = parseFloat(quantity) || 0;
                    await db.collection('warehouse').doc(catId).update({
                        outForDelivery: firebase.firestore.FieldValue.increment(qty),
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                        lastUpdatedBy: currentUser
                    });
                }

                addModal.style.display = 'none';
                addItemForm.reset();
                showToast('Task Added ✅', `Added delivery task for ${productName}.`, 'success');
            } catch (err) {
                console.error(err);
                showToast('Error', 'Failed to add task to database.', 'danger');
            } finally {
                submitBtn.textContent = 'Add New Task';
                submitBtn.disabled = false;
            }
        });
    }

    // Status, priority, delete, reorder actions
    window.markDelivered = async id => {
        try {
            const doc = await db.collection('inventory').doc(id).get();
            if (!doc.exists) return;
            const item = doc.data();
            if (item.status === 'Completed') return;

            // Mark completed
            await db.collection('inventory').doc(id).update({ status: 'Completed' });

            // Subtract from warehouse remaining stock and outForDelivery
            const catId = getCategoryId(item.category);
            if (catId) {
                const qty = parseFloat(item.quantity) || 0;
                await db.collection('warehouse').doc(catId).update({
                    stockRemaining: firebase.firestore.FieldValue.increment(-qty),
                    outForDelivery: firebase.firestore.FieldValue.increment(-qty),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdatedBy: currentUser
                });
                
                // Allow notification alerts to check again
                notifCheckedOnce.delete(catId);
            }
            showToast('Delivery Done ✓', 'Warehouse stock and delivery pipeline updated.', 'success');
        } catch (err) {
            console.error('Error marking delivery complete:', err);
            showToast('Error', 'Failed to complete delivery task.', 'danger');
        }
    };

    window.updatePriority = async (id, newPriority) => {
        await db.collection('inventory').doc(id).update({ priority: newPriority });
    };

    window.deleteItem = async id => {
        if (confirm('Are you sure you want to delete this task?')) {
            try {
                const doc = await db.collection('inventory').doc(id).get();
                if (!doc.exists) return;
                const item = doc.data();
                
                await db.collection('inventory').doc(id).delete();

                // If not completed yet, decrement outForDelivery
                if (item.status !== 'Completed') {
                    const catId = getCategoryId(item.category);
                    if (catId) {
                        const qty = parseFloat(item.quantity) || 0;
                        await db.collection('warehouse').doc(catId).update({
                            outForDelivery: firebase.firestore.FieldValue.increment(-qty),
                            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                            lastUpdatedBy: currentUser
                        });
                    }
                }
                showToast('Task Deleted', 'Task removed successfully.', 'success');
            } catch (err) {
                console.error('Error deleting task:', err);
                showToast('Error', 'Failed to delete task.', 'danger');
            }
        }
    };

    window.moveUp = async id => {
        const index = inventory.findIndex(i => i.id === id);
        if (index > 0) {
            const cur = inventory[index], prev = inventory[index - 1];
            const batch = db.batch();
            batch.update(db.collection('inventory').doc(cur.id),  { order: prev.order });
            batch.update(db.collection('inventory').doc(prev.id), { order: cur.order });
            await batch.commit();
        }
    };

    window.moveDown = async id => {
        const index = inventory.findIndex(i => i.id === id);
        if (index > -1 && index < inventory.length - 1) {
            const cur = inventory[index], next = inventory[index + 1];
            const batch = db.batch();
            batch.update(db.collection('inventory').doc(cur.id),  { order: next.order });
            batch.update(db.collection('inventory').doc(next.id), { order: cur.order });
            await batch.commit();
        }
    };

    // Render the delivery table
    function renderTable() {
        if (!inventoryBody) return;
        inventoryBody.innerHTML = '';

        if (inventory.length === 0) {
            inventoryBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center;color:var(--text-secondary);padding:2rem;">
                        No items found. Click <strong>+ Add New Task</strong> to get started.
                    </td>
                </tr>`;
            return;
        }

        inventory.forEach((item, index) => {
            const tr = document.createElement('tr');
            const imageHtml = item.image
                ? `<img src="${item.image}" alt="${item.productName}" style="width:100%;height:100%;object-fit:cover;">`
                : `<span class="no-image">No Img</span>`;

            tr.innerHTML = `
                <td data-label="Category">
                    <span style="background:rgba(0,255,136,0.1);color:var(--accent-color);padding:0.25rem 0.5rem;border-radius:4px;font-weight:700;font-size:0.8rem;">${item.category}</span>
                </td>
                <td data-label="Image">
                    <div class="product-image-container">${imageHtml}</div>
                </td>
                <td data-label="Product">
                    <div style="font-weight:600;color:var(--text-primary);">${item.productName}</div>
                    <div style="color:var(--accent-color);font-size:0.82rem;">${item.quantity} units</div>
                </td>
                <td data-label="Client Info">
                    <div style="font-weight:600;color:var(--text-primary);">${item.clientName || 'N/A'}</div>
                    <div style="color:var(--text-secondary);font-size:0.82rem;">By: ${item.broughtBy || 'N/A'}</div>
                </td>
                <td data-label="Delivery">
                    <div style="color:var(--text-primary);font-size:0.85rem;">From: ${item.purchaser}</div>
                    <div style="color:var(--text-secondary);font-size:0.82rem;">Delivery: ${item.assignedDelivery || 'N/A'}</div>
                </td>
                <td data-label="Priority">
                    <select
                        class="priority-badge priority-${(item.priority || 'medium').toLowerCase()}"
                        onchange="updatePriority('${item.id}', this.value)"
                        style="cursor:pointer;border:1px solid rgba(255,255,255,0.1);outline:none;"
                    >
                        <option value="Low"    ${item.priority === 'Low'    ? 'selected' : ''}>Low</option>
                        <option value="Medium" ${item.priority === 'Medium' || !item.priority ? 'selected' : ''}>Medium</option>
                        <option value="High"   ${item.priority === 'High'   ? 'selected' : ''}>High</option>
                    </select>
                </td>
                <td data-label="Status">
                    ${item.status === 'Completed'
                        ? `<div class="status-indicator status-completed"><span class="status-dot"></span>Completed</div>`
                        : `<div class="status-indicator status-undelivered"><span class="status-dot"></span>LIVE</div>`
                    }
                </td>
                <td data-label="Added By" style="color:var(--text-secondary);font-size:0.82rem;">
                    <i style="opacity:0.65">by</i> ${item.addedBy || 'System'}
                </td>
                <td data-label="Actions" style="white-space:nowrap;">
                    <button class="btn-icon" onclick="moveUp('${item.id}')"   ${index === 0 ? 'disabled' : ''}>▲</button>
                    <button class="btn-icon" onclick="moveDown('${item.id}')" ${index === inventory.length - 1 ? 'disabled' : ''}>▼</button>
                    ${item.status !== 'Completed'
                        ? `<button class="btn-success" onclick="markDelivered('${item.id}')">✓ Done</button>`
                        : ''}
                    <button class="btn-danger" onclick="deleteItem('${item.id}')">Delete</button>
                </td>
            `;
            inventoryBody.appendChild(tr);
        });
    }

}); // end DOMContentLoaded
