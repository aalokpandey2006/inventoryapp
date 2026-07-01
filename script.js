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
    { id: 'toilet_cleaner',         name: 'Toilet Cleaner',             icon: '' },
    { id: 'dishwasher',             name: 'Dishwasher',                 icon: '' },
    { id: 'phenyl',                 name: 'Phenyl',                     icon: '' },
    { id: 'glass_cleaner',          name: 'Glass Cleaner',              icon: '' },
    { id: 'bathroom_floor_cleaner', name: 'Bathroom & Floor Cleaner',   icon: '' },
];

const DEFAULT_WAREHOUSE_DOC = {
    rawMaterialsOrdered:     0,
    rawMaterialsInInventory: 0,
    productionRatePerDay:    0,
    estimatedClearanceDate:  null,
    stockRemaining:  0,
    minimumStock:    10,
    outForDelivery:  0,
    lastBatchDate:   null,
    lastUpdated:     null,
    lastUpdatedBy:   '',
};

// ===========================
// MAIN APP
// ===========================
document.addEventListener('DOMContentLoaded', () => {

    // ----- AUTH CHECK & SPA ROUTING -----
    let currentUser = localStorage.getItem('currentUser');
    
    window.showLogin = function() {
        document.getElementById('register-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    };
    window.showRegister = function() {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('register-section').style.display = 'block';
    };
    
    window.togglePasswordVisibility = function(id, btn) {
        const input = document.getElementById(id);
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = 'Hide';
        } else {
            input.type = 'password';
            btn.textContent = 'Show';
        }
    };

    window.receivesNotifications = true;
    window.isSuperAdmin = false;

    async function loadDesignSettings() {
        try {
            const doc = await db.collection('settings').doc('design').get();
            const editor = document.getElementById('designEditor');
            if (!editor) return;
            if (doc.exists && doc.data().content) {
                editor.value = doc.data().content;
            } else {
                const res = await fetch('DESIGN.md');
                if (res.ok) editor.value = await res.text();
            }
        } catch (e) { console.error("Error loading design", e); }
    }

    async function checkUserRole() {
        try {
            const userDoc = await db.collection('users').doc(currentUser.toLowerCase()).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                window.receivesNotifications = userData.receivesNotifications !== false;
                window.isSuperAdmin = userData.role === 'super_admin';
                
                const navLabel = document.getElementById('nav-admin-label');
                const sectionTitle = document.getElementById('admin-section-title');
                const sectionSubtitle = document.getElementById('admin-section-subtitle');

                const navWarehouse = document.getElementById('nav-warehouse');
                const stockStrip = document.getElementById('stockStrip');
                const navDesign = document.getElementById('nav-design');
                const navTasks = document.getElementById('nav-tasks');
                const sidebarCreateTaskBtn = document.getElementById('sidebarCreateTaskBtn');

                if (window.isSuperAdmin) {
                    if (navLabel) navLabel.textContent = 'Admin Panel';
                    if (sectionTitle) sectionTitle.innerHTML = 'Admin Panel';
                    if (sectionSubtitle) sectionSubtitle.textContent = 'Manage system users, adjust access roles, and route notifications.';
                    if (typeof SECTION_LABELS !== 'undefined') SECTION_LABELS.admin = 'Admin Panel';
                    
                    if (navWarehouse) navWarehouse.style.display = 'flex';
                    if (stockStrip) stockStrip.style.display = 'flex';
                    if (navDesign) navDesign.style.display = 'flex';
                    if (navTasks) navTasks.style.display = 'flex';
                    if (sidebarCreateTaskBtn) sidebarCreateTaskBtn.style.display = 'block';
                    loadDesignSettings();
                } else {
                    if (navLabel) navLabel.textContent = 'Users';
                    if (sectionTitle) sectionTitle.innerHTML = 'User Directory';
                    if (sectionSubtitle) sectionSubtitle.textContent = 'View registered users and their access roles.';
                    if (typeof SECTION_LABELS !== 'undefined') SECTION_LABELS.admin = 'Users';
                    
                    if (navWarehouse) navWarehouse.style.display = 'none';
                    if (stockStrip) stockStrip.style.display = 'flex';
                    if (navDesign) navDesign.style.display = 'none';
                    if (navTasks) navTasks.style.display = 'none';
                    if (sidebarCreateTaskBtn) sidebarCreateTaskBtn.style.display = 'none';

                    // Safeguard: Redirect if the current nav tab is restricted
                    const activeNavItem = document.querySelector('.nav-item.active');
                    if (activeNavItem) {
                        const activeSection = activeNavItem.dataset.section;
                        if (activeSection === 'tasks' || activeSection === 'warehouse' || activeSection === 'design') {
                            navItems.forEach(n => n.classList.remove('active'));
                            pageSections.forEach(s => s.classList.remove('active'));
                            
                            const deliveryNav = document.getElementById('nav-delivery');
                            const deliverySection = document.getElementById('delivery-section');
                            if (deliveryNav) deliveryNav.classList.add('active');
                            if (deliverySection) deliverySection.classList.add('active');
                            if (headerSectionLabel) headerSectionLabel.textContent = SECTION_LABELS.delivery || '';
                        }
                    }
                }

                initAdminPanel();
            }
        } catch (err) {
            console.error('Error fetching user role:', err);
            initAdminPanel();
        }
    }

    window.checkAuth = function() {
        currentUser = localStorage.getItem('currentUser');

        if (!currentUser) {
            window.location.href = 'login.html';
        } else {
            document.getElementById('app-wrapper').style.display = 'grid';
            
            const sidebarUser = document.getElementById('sidebarUser');
            if (sidebarUser) sidebarUser.textContent = currentUser;
            
            checkUserRole();
        }
    }
    
    checkAuth();

    // ===========================
    // ADMIN PANEL USER MANAGEMENT
    // ===========================
    let usersListener = null;

    function initAdminPanel() {
        if (usersListener) return;
        const usersBody = document.getElementById('usersBody');
        if (!usersBody) return;

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
            // Security verification: Check Firestore directly for active user role
            const activeUserDoc = await db.collection('users').doc(currentUser.toLowerCase()).get();
            if (!activeUserDoc.exists || activeUserDoc.data().role !== 'super_admin') {
                showToast('Unauthorized', 'Only Super Admins can modify roles.', 'danger');
                return;
            }

            if (userId === currentUser.toLowerCase()) {
                showToast('Action Denied', 'You cannot modify your own role.', 'danger');
                return;
            }
            
            await db.collection('users').doc(userId).update({ role: newRole });
            showToast('Role Updated', `User role updated to ${newRole}. Reloading...`, 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (err) {
            console.error('Role update error:', err);
            showToast('Update Failed', 'Failed to update user role.', 'danger');
        }
    };

    window.updateUserNotif = async (userId, receivesNotif) => {
        try {
            // Security verification: Check Firestore directly for active user role
            const activeUserDoc = await db.collection('users').doc(currentUser.toLowerCase()).get();
            if (!activeUserDoc.exists || activeUserDoc.data().role !== 'super_admin') {
                showToast('Unauthorized', 'Only Super Admins can update notification routing.', 'danger');
                return;
            }

            await db.collection('users').doc(userId).update({ receivesNotifications: receivesNotif });
            showToast('Alerts Updated', `Alert setting updated.`, 'success');
        } catch (err) {
            console.error('Alert config update error:', err);
            showToast('Update Failed', 'Failed to update alert routing.', 'danger');
        }
    };

    // ===========================
    // NOTIFICATION BELL SYSTEM
    // ===========================
    const notifStore = [];
    let unreadCount  = 0;

    function addNotification(type, title, message) {
        if (window.receivesNotifications === false) return;
        notifStore.unshift({ id: Date.now(), type, title, message, time: new Date(), read: false });
        unreadCount++;
        updateBellBadge();
        showToast(title, message, type);
    }

    function updateBellBadge() {
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    function renderNotifPanel() {
        const list = document.getElementById('notifList');
        if (!list) return;
        list.innerHTML = '';
        if (notifStore.length === 0) {
            list.innerHTML = '<div class="notif-empty">No alerts yet</div>';
            return;
        }

        notifStore.forEach(n => {
            const timeStr = n.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const item = document.createElement('div');
            item.className = `notif-item notif-type-${n.type}`;
            item.innerHTML = `
                <div class="notif-item-header">
                    <span class="notif-item-title">${n.title}</span>
                    <span class="notif-item-time">${timeStr}</span>
                </div>
                <div class="notif-item-body">${n.message}</div>
            `;
            list.appendChild(item);
        });
    }

    window.toggleNotifPanel = function() {
        const panel = document.getElementById('notifPanel');
        if (!panel) return;
        const isOpen = panel.classList.toggle('open');
        if (isOpen) {
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
            checkAuth();
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

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    // ===========================
    // SECTION SWITCHING
    // ===========================
    const navItems            = document.querySelectorAll('.nav-item');
    const pageSections        = document.querySelectorAll('.page-section');
    const headerSectionLabel  = document.getElementById('headerSectionLabel');

    const SECTION_LABELS = {
        delivery:  'Out for Delivery',
        warehouse: 'Warehouse',
        admin:     'Admin Panel',
        design:    'Design System',
        tasks:     'Task Tracker'
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

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-body">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${msg}</div>
            </div>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        }, 6000);
    }

    // ===========================
    // WAREHOUSE CONTROLLER & ALERTS
    // ===========================
    let warehouseData = {};
    const notifCheckedOnce = new Set();

    db.collection('warehouse').onSnapshot(snapshot => {
        snapshot.forEach(doc => {
            warehouseData[doc.id] = doc.data();
        });
        renderWarehouseGrid();
        checkWarehouseAlerts();
    });

    function getCategoryId(catName) {
        const match = WAREHOUSE_CATEGORIES.find(c => c.name === catName);
        return match ? match.id : null;
    }

    function checkWarehouseAlerts() {
        WAREHOUSE_CATEGORIES.forEach(cat => {
            const data = warehouseData[cat.id];
            if (!data) return;

            if (data.stockRemaining <= data.minimumStock) {
                if (!notifCheckedOnce.has(cat.id)) {
                    addNotification('warn', 'Low Stock Warning', `${cat.name} is down to ${data.stockRemaining} units! (Threshold: ${data.minimumStock})`);
                    notifCheckedOnce.add(cat.id);
                }
            }
        });
    }

    // ===========================
    // INVENTORY LIST CONTROLLER
    // ===========================
    let inventory = [];
    const addRowBtn = document.getElementById('addRowBtn');
    const addModal = document.getElementById('addModal');
    const closeBtn = document.querySelector('.close-btn');
    const addItemForm = document.getElementById('addItemForm');
    const inventoryBody = document.getElementById('inventoryBody');

    if (addRowBtn && addModal) {
        addRowBtn.addEventListener('click', () => { addModal.style.display = 'flex'; });
    }
    if (closeBtn && addModal) {
        closeBtn.addEventListener('click', () => { addModal.style.display = 'none'; });
    }
    window.addEventListener('click', e => {
        if (e.target === addModal) addModal.style.display = 'none';
    });

    db.collection('inventory').orderBy('order').onSnapshot(snapshot => {
        inventory = [];
        snapshot.forEach(doc => {
            inventory.push({ id: doc.id, ...doc.data() });
        });
        renderTable();
        updateStockStrip();
    });

    function updateStockStrip() {
        const indicators = document.getElementById('stripIndicators');
        if (!indicators) return;
        indicators.innerHTML = '';

        WAREHOUSE_CATEGORIES.forEach(cat => {
            const data = warehouseData[cat.id];
            const stock = data ? data.stockRemaining : 0;
            const minStock = data ? data.minimumStock : 10;
            const isLow = stock <= minStock;

            const div = document.createElement('div');
            div.className = `indicator-item ${isLow ? 'low-stock' : ''}`;
            div.innerHTML = `
                <span class="indicator-dot ${isLow ? 'low' : 'good'}"></span>
                <span class="indicator-name">${cat.name}:</span>
                <span class="indicator-val">${stock} units</span>
            `;
            indicators.appendChild(div);
        });
    }

    async function resizeImage(file, maxSide) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = event => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    if (width > height) {
                        if (width > maxSide) {
                            height *= maxSide / width;
                            width = maxSide;
                        }
                    } else {
                        if (height > maxSide) {
                            width *= maxSide / height;
                            height = maxSide;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
            };
            reader.onerror = error => reject(error);
        });
    }

    if (addItemForm) {
        addItemForm.addEventListener('submit', async e => {
            e.preventDefault();
            const submitBtn = addItemForm.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Adding Task...';
            submitBtn.disabled = true;

            const category = document.getElementById('category').value;
            const productName = document.getElementById('productName').value;
            const clientName = document.getElementById('clientName').value;
            const broughtBy = document.getElementById('broughtBy').value;
            const purchaser = document.getElementById('purchaser').value;
            const assignedDelivery = document.getElementById('assignedDelivery').value;
            const priority        = document.getElementById('priority').value;
            const imageUpload     = document.getElementById('imageUpload');

            let imageBase64 = null;
            if (imageUpload.files && imageUpload.files[0]) {
                imageBase64 = await resizeImage(imageUpload.files[0], 400);
            }

            const order = inventory.length > 0 ? inventory[inventory.length - 1].order + 100 : 100;

            const newItem = {
                category, productName, purchaser, quantity: parseFloat(document.getElementById('quantity').value) || 0,
                clientName, broughtBy, assignedDelivery, priority,
                status: 'Undelivered',
                addedBy: currentUser,
                image: imageBase64,
                order,
                createdAt: Date.now(),
            };

            try {
                await db.collection('inventory').add(newItem);
                const catId = getCategoryId(category);
                if (catId) {
                    const qty = parseFloat(document.getElementById('quantity').value) || 0;
                    await db.collection('warehouse').doc(catId).update({
                        outForDelivery: firebase.firestore.FieldValue.increment(qty),
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                        lastUpdatedBy: currentUser
                    });
                }

                addModal.style.display = 'none';
                addItemForm.reset();
                showToast('Task Added', `Added delivery task for ${productName}.`, 'success');
            } catch (err) {
                console.error(err);
                showToast('Error', 'Failed to add task.', 'danger');
            } finally {
                submitBtn.textContent = 'Add New Task';
                submitBtn.disabled = false;
            }
        });
    }

    window.markDelivered = async id => {
        try {
            const doc = await db.collection('inventory').doc(id).get();
            if (!doc.exists) return;
            const item = doc.data();
            if (item.status === 'Completed') return;

            await db.collection('inventory').doc(id).update({ status: 'Completed' });

            const catId = getCategoryId(item.category);
            if (catId) {
                const qty = parseFloat(item.quantity) || 0;
                await db.collection('warehouse').doc(catId).update({
                    stockRemaining: firebase.firestore.FieldValue.increment(-qty),
                    outForDelivery: firebase.firestore.FieldValue.increment(-qty),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdatedBy: currentUser
                });
                notifCheckedOnce.delete(catId);
            }
            showToast('Delivery Done', 'Warehouse stock and pipeline updated.', 'success');
        } catch (err) {
            console.error(err);
            showToast('Error', 'Failed to complete delivery.', 'danger');
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
                console.error(err);
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

    function renderTable() {
        if (!inventoryBody) return;
        inventoryBody.innerHTML = '';

        if (inventory.length === 0) {
            inventoryBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center;color:var(--text-secondary);padding:2rem;">
                        No items found. Click + Add New Task to get started.
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
                    <span style="background:rgba(45,212,191,0.1);color:var(--accent-color);padding:0.25rem 0.5rem;border-radius:4px;font-weight:700;font-size:0.8rem;">${item.category}</span>
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

    // ----- WAREHOUSE GRID RENDERER -----
    function renderWarehouseGrid() {
        const grid = document.getElementById('warehouseGrid');
        if (!grid) return;
        grid.innerHTML = '';

        WAREHOUSE_CATEGORIES.forEach(cat => {
            const data = warehouseData[cat.id] || { ...DEFAULT_WAREHOUSE_DOC };
            const stock = data.stockRemaining;
            const minStock = data.minimumStock;
            const isLow = stock <= minStock;
            const outDel = data.outForDelivery;
            const rawOrd = data.rawMaterialsOrdered;
            const rawInv = data.rawMaterialsInInventory;
            const prodRate = data.productionRatePerDay;
            const lastDate = data.lastBatchDate;

            let clearanceDateDisplay = 'N/A';
            if (prodRate > 0 && stock > 0) {
                const daysNeeded = Math.ceil(stock / prodRate);
                const d = new Date();
                d.setDate(d.getDate() + daysNeeded);
                clearanceDateDisplay = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            }

            const batchDateInput = lastDate
                ? (lastDate.toDate ? lastDate.toDate().toISOString().split('T')[0] : new Date(lastDate).toISOString().split('T')[0])
                : '';

            const maxRef = Math.max(stock, 100);
            const pct = Math.min(Math.round((stock / maxRef) * 100), 100);

            const card = document.createElement('div');
            card.className = `warehouse-card ${isLow ? 'low-stock' : ''}`;
            card.innerHTML = `
                <div class="wcard-header">
                    <div class="wcard-title-wrap">
                        <h3>${cat.name}</h3>
                    </div>
                    <span class="wcard-badge ${isLow ? 'low' : 'good'}">${isLow ? 'REFILL NEEDED' : 'STOCK STABLE'}</span>
                </div>
                <div class="wcard-body">
                    <div class="wcard-section-label">Raw Materials</div>
                    ${buildEditableRow(cat.id, 'rawMaterialsOrdered',     'Ordered',                rawOrd,     'number', 'units')}
                    ${buildEditableRow(cat.id, 'rawMaterialsInInventory', 'In Inventory',           rawInv,     'number', 'units')}
                    ${buildEditableRow(cat.id, 'productionRatePerDay',    'Converted / Day',        prodRate,   'number', 'units/day')}
                    <div class="wcard-row">
                        <span class="wcard-label">Est. Clearance Date</span>
                        <span class="wcard-value auto-calc" style="font-size:0.8rem;">${clearanceDateDisplay}</span>
                    </div>
                    <hr class="wcard-divider">
                    <div class="wcard-section-label">Stock</div>
                    ${buildEditableRow(cat.id, 'stockRemaining', 'Stock Remaining',      stock,    'number', 'units')}
                    ${buildEditableRow(cat.id, 'minimumStock',   'Min. Stock Threshold', minStock, 'number', 'units')}
                    <hr class="wcard-divider">
                    <div class="wcard-section-label">Delivery</div>
                    <div class="wcard-row">
                        <span class="wcard-label">Out for Delivery</span>
                        <span class="wcard-value">${outDel} units</span>
                    </div>
                    ${buildEditableRow(cat.id, 'lastBatchDate',  'Batch Made On',
                        batchDateInput ? { toDate: () => new Date(batchDateInput) } : null, 'date', '')}
                </div>
                <div class="wcard-stock-bar-wrap">
                    <div class="stock-bar-label">
                        <span>Stock Level</span>
                        <span>${stock} / ~${maxRef} units (${pct}%)</span>
                    </div>
                    <div class="stock-bar-track">
                        <div class="stock-bar-fill" style="width:${pct}%;background-color:${isLow ? 'var(--danger-color)' : 'var(--accent-color)'};"></div>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    function buildEditableRow(catId, field, label, val, type, suffix) {
        let displayVal = val;
        if (val && val.toDate) {
            displayVal = val.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        } else if (!val && type === 'date') {
            displayVal = 'N/A';
        } else if (!val && type === 'number') {
            displayVal = '0';
        }

        return `
            <div class="wcard-row">
                <span class="wcard-label">${label}</span>
                <div class="wcard-value-wrap">
                    <span class="wcard-value" id="val-${catId}-${field}">${displayVal} ${suffix}</span>
                    <button class="btn-edit-field" onclick="startEditField('${catId}', '${field}', '${type}', '${suffix}')">edit</button>
                </div>
            </div>
        `;
    }

    window.startEditField = (catId, field, type, suffix) => {
        const wrap = document.querySelector(`#val-${catId}-${field}`).parentNode;
        const currentText = document.querySelector(`#val-${catId}-${field}`).textContent.replace(suffix, '').trim();
        
        let inputHtml = '';
        if (type === 'date') {
            let defaultDate = '';
            if (currentText !== 'N/A') {
                const dateObj = new Date(currentText);
                if (!isNaN(dateObj)) defaultDate = dateObj.toISOString().split('T')[0];
            }
            inputHtml = `<input type="date" id="input-${catId}-${field}" value="${defaultDate}" class="field-input" style="color-scheme:dark;">`;
        } else {
            inputHtml = `<input type="number" id="input-${catId}-${field}" value="${parseFloat(currentText) || 0}" class="field-input" step="any">`;
        }

        wrap.innerHTML = `
            ${inputHtml}
            <button class="btn-save-field" onclick="saveEditField('${catId}', '${field}', '${type}', '${suffix}')">save</button>
        `;
    };

    window.saveEditField = async (catId, field, type, suffix) => {
        const input = document.getElementById(`input-${catId}-${field}`);
        let newVal = input.value;

        if (type === 'number') {
            newVal = parseFloat(newVal) || 0;
        } else if (type === 'date') {
            newVal = newVal ? firebase.firestore.FieldValue.serverTimestamp() : null;
            if (newVal) {
                const pickedDate = new Date(input.value);
                newVal = firebase.firestore.Timestamp.fromDate(pickedDate);
            }
        }

        try {
            await db.collection('warehouse').doc(catId).set({
                [field]: newVal,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdatedBy: currentUser
            }, { merge: true });
            showToast('Warehouse Updated', 'Field saved successfully.', 'success');
        } catch (e) {
            console.error(e);
            showToast('Error', 'Failed to update field.', 'danger');
        }
    };

    // ----- NOTIFICATIONS CONFIG -----
    const notifSettingsBtn = document.getElementById('notifSettingsBtn');
    const notifModal = document.getElementById('notifModal');
    const closeNotifBtn = document.querySelector('.close-notif-btn');
    const notifForm = document.getElementById('notifForm');

    if (notifSettingsBtn && notifModal) {
        notifSettingsBtn.addEventListener('click', () => {
            notifModal.style.display = 'flex';
            loadNotifSettings();
        });
    }
    if (closeNotifBtn && notifModal) {
        closeNotifBtn.addEventListener('click', () => { notifModal.style.display = 'none'; });
    }
    window.addEventListener('click', e => {
        if (e.target === notifModal) notifModal.style.display = 'none';
    });

    async function loadNotifSettings() {
        try {
            const doc = await db.collection('settings').doc('notifications').get();
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('notifEmail').value = data.email || '';
                document.getElementById('notifPhone').value = data.phone || '';
                document.getElementById('browserNotifToggle').checked = data.browserNotifications === true;
            }
        } catch (e) { console.error("Error loading alert settings", e); }
    }

    if (notifForm) {
        notifForm.addEventListener('submit', async e => {
            e.preventDefault();
            const email = document.getElementById('notifEmail').value;
            const phone = document.getElementById('notifPhone').value;
            const browserNotifications = document.getElementById('browserNotifToggle').checked;

            try {
                await db.collection('settings').doc('notifications').set({
                    email, phone, browserNotifications, updatedBy: currentUser
                });
                notifModal.style.display = 'none';
                showToast('Settings Saved', 'Alert configurations updated successfully.', 'success');
            } catch (err) {
                console.error(err);
                showToast('Error', 'Failed to save settings.', 'danger');
            }
        });
    }

    const saveDesignBtn = document.getElementById('saveDesignBtn');
    if (saveDesignBtn) {
        saveDesignBtn.addEventListener('click', async () => {
            try {
                const content = document.getElementById('designEditor').value;
                await db.collection('settings').doc('design').set({ content, updatedBy: currentUser });
                showToast('Design Saved', 'Design system updated successfully.', 'success');
            } catch (e) {
                console.error(e);
                showToast('Error', 'Failed to save design.', 'danger');
            }
        });
    }

    // =========================================================================
    // =========================== CALENDAR WORK TRACKER ========================
    // =========================================================================
    let trackerMembers = [];
    let trackerDates = [];
    let trackerTasks = [];
    let selectedDayFilter = 'all';

    // Seeding logic for dates
    async function seedDefaultDates() {
        try {
            const snap = await db.collection('tracker_dates').get();
            
            // Check if we need to reseed (either empty, or containing old un-timestamped data)
            let needsReseed = snap.empty;
            if (!snap.empty) {
                const firstDoc = snap.docs[0].data();
                if (!firstDoc.timestamp) {
                    needsReseed = true;
                    // Delete old dates to avoid duplicates or mixing
                    const deleteBatch = db.batch();
                    snap.docs.forEach(doc => deleteBatch.delete(doc.ref));
                    await deleteBatch.commit();
                }
            }
            
            if (needsReseed) {
                const batch = db.batch();
                
                // Calculate Monday of the current week (today's week)
                const today = new Date();
                const day = today.getDay(); // 0 is Sunday, 1 is Monday...
                const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(today.setDate(diff));
                monday.setHours(12, 0, 0, 0); // avoid timezone shifts
                
                const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
                
                for (let i = 0; i < 5; i++) {
                    const currentDate = new Date(monday.getTime() + i * 86400000);
                    const dayName = daysOfWeek[currentDate.getDay()];
                    const dayNum = currentDate.getDate();
                    const dateStr = `${dayName} ${dayNum}`;
                    
                    const ref = db.collection('tracker_dates').doc();
                    batch.set(ref, {
                        dateStr: dateStr,
                        order: i + 1,
                        timestamp: currentDate.getTime()
                    });
                }
                await batch.commit();
            }
        } catch (e) {
            console.error("Error seeding dates", e);
        }
    }
    
    seedDefaultDates();

    // Listen to Database
    db.collection('tracker_members').orderBy('createdAt', 'asc').onSnapshot(snap => {
        trackerMembers = [];
        snap.forEach(doc => {
            trackerMembers.push({ id: doc.id, ...doc.data() });
        });
        updateTrackerDropdowns();
        renderCalendarGrid();
    });

    db.collection('tracker_dates').orderBy('order', 'asc').onSnapshot(snap => {
        trackerDates = [];
        snap.forEach(doc => {
            trackerDates.push({ id: doc.id, ...doc.data() });
        });
        updateTrackerDropdowns();
        updateDayFilterDropdown();
        renderCalendarGrid();
    });

    db.collection('tracker_tasks').orderBy('createdAt', 'desc').onSnapshot(snap => {
        trackerTasks = [];
        snap.forEach(doc => {
            trackerTasks.push({ id: doc.id, ...doc.data() });
        });
        renderCalendarGrid();
        renderComparisonChart();
        renderRecentLogs();
    });

    // Populate dropdown fields
    function updateTrackerDropdowns() {
        const memberSelect = document.getElementById('taskMemberSelect');
        const dateSelect = document.getElementById('taskDateSelect');
        if (memberSelect) {
            memberSelect.innerHTML = '<option value="">Select Member...</option>';
            trackerMembers.forEach(m => {
                const roleStr = m.role ? ` (${m.role})` : '';
                memberSelect.innerHTML += `<option value="${m.name}">${m.name}${roleStr}</option>`;
            });
        }
        if (dateSelect) {
            dateSelect.innerHTML = '<option value="">Select Date Row...</option>';
            trackerDates.forEach(d => {
                dateSelect.innerHTML += `<option value="${d.dateStr}">${d.dateStr}</option>`;
            });
        }
    }

    function updateDayFilterDropdown() {
        const filter = document.getElementById('dayFilter');
        if (!filter) return;
        
        const currentValue = filter.value;
        filter.innerHTML = '<option value="all">All Days</option>';
        trackerDates.forEach(d => {
            filter.innerHTML += `<option value="${d.dateStr}">${d.dateStr}</option>`;
        });
        
        filter.value = currentValue;
    }

    // Filter Trigger
    const dayFilter = document.getElementById('dayFilter');
    if (dayFilter) {
        dayFilter.addEventListener('change', (e) => {
            selectedDayFilter = e.target.value;
            renderCalendarGrid();
            renderComparisonChart();
        });
    }

    // Render Grid
    function renderCalendarGrid() {
        const headerRow = document.getElementById('gridHeaderRow');
        const gridBody = document.getElementById('gridBody');
        if (!headerRow || !gridBody) return;

        // Header cols
        headerRow.innerHTML = '<th>Date</th>';
        trackerMembers.forEach(m => {
            headerRow.innerHTML += `
                <th>
                    <div class="member-header-card">
                        <button class="btn-delete-member" onclick="deleteMember('${m.id}', '${m.name}')">✕</button>
                        <input type="text" value="${m.name}" onchange="updateMemberName('${m.id}', this.value)">
                        <input type="text" class="member-role-input" value="${m.role}" onchange="updateMemberRole('${m.id}', this.value)">
                    </div>
                </th>
            `;
        });

        // Rows
        gridBody.innerHTML = '';
        const filteredDates = selectedDayFilter === 'all' 
            ? trackerDates 
            : trackerDates.filter(d => d.dateStr === selectedDayFilter);

        if (filteredDates.length === 0) {
            gridBody.innerHTML = `<tr><td colspan="${trackerMembers.length + 1}" style="text-align:center;padding:2rem;color:var(--text-secondary);">No dates match the current filter.</td></tr>`;
            return;
        }

        filteredDates.forEach(date => {
            const tr = document.createElement('tr');
            
            // Date cell
            tr.innerHTML = `
                <td class="date-row-header">
                    ${date.dateStr.split(' ')[0]}
                    <span>${date.dateStr.split(' ')[1] || ''}</span>
                </td>
            `;

            // Cells in front of names (columns)
            trackerMembers.forEach(member => {
                const td = document.createElement('td');
                const matchingTasks = trackerTasks.filter(t => t.memberName === member.name && t.dateStr === date.dateStr);

                let cellContentHtml = '';
                if (matchingTasks.length > 0) {
                    matchingTasks.forEach(task => {
                        cellContentHtml += `
                            <div class="task-card-item" onclick="startEditTask('${task.id}')">
                                <div class="task-card-title">${task.name}</div>
                                <div class="task-card-meta">
                                    <span>${task.hours}h</span>
                                    <span class="task-status-badge ${task.status}">${task.status.replace('-', ' ')}</span>
                                </div>
                            </div>
                        `;
                    });
                } else {
                    // Empty container
                    cellContentHtml = `
                        <div class="task-cell-inner" onclick="openAddTaskPopup('${member.name}', '${date.dateStr}')">
                            <span style="opacity: 0.15; font-size: 1.2rem;">+</span>
                        </div>
                    `;
                }

                td.innerHTML = cellContentHtml;
                tr.appendChild(td);
            });

            gridBody.appendChild(tr);
        });
    }

    // Member updaters
    window.updateMemberName = async (id, newName) => {
        if (!newName.trim()) return;
        try {
            await db.collection('tracker_members').doc(id).update({ name: newName.trim() });
            showToast('Member Updated', 'Name saved successfully.', 'success');
        } catch (e) {
            showToast('Error', 'Failed to update member name.', 'danger');
        }
    };

    window.updateMemberRole = async (id, newRole) => {
        if (!newRole.trim()) return;
        try {
            await db.collection('tracker_members').doc(id).update({ role: newRole.trim() });
            showToast('Member Updated', 'Role saved successfully.', 'success');
        } catch (e) {
            showToast('Error', 'Failed to update member role.', 'danger');
        }
    };

    // Render Workload Comparison
    function renderComparisonChart() {
        const list = document.getElementById('comparisonList');
        if (!list) return;
        list.innerHTML = '';

        // Calculate hours
        const totals = {};
        trackerMembers.forEach(m => { totals[m.name] = 0; });

        const filteredTasks = selectedDayFilter === 'all'
            ? trackerTasks
            : trackerTasks.filter(t => t.dateStr === selectedDayFilter);

        filteredTasks.forEach(task => {
            if (totals[task.memberName] !== undefined) {
                totals[task.memberName] += parseFloat(task.hours) || 0;
            }
        });

        // Compute metrics
        let sumHours = 0;
        let doneCount = 0;
        filteredTasks.forEach(t => {
            sumHours += parseFloat(t.hours) || 0;
            if (t.status === 'completed') doneCount++;
        });

        const totalHoursVal = document.getElementById('trackerTotalHours');
        const tasksDoneVal = document.getElementById('trackerTasksDone');
        const headerTotalHours = document.getElementById('headerTotalHours');
        const headerTasksDone = document.getElementById('headerTasksDone');

        if (totalHoursVal) totalHoursVal.textContent = sumHours.toFixed(1);
        if (tasksDoneVal) tasksDoneVal.textContent = doneCount;
        if (headerTotalHours) headerTotalHours.textContent = sumHours.toFixed(1);
        if (headerTasksDone) headerTasksDone.textContent = doneCount;

        // Sort members
        const sorted = Object.keys(totals).map(name => ({
            name,
            hours: totals[name]
        })).sort((a, b) => b.hours - a.hours);

        const maxHours = Math.max(...sorted.map(s => s.hours), 1);

        if (sorted.length === 0 || maxHours === 0) {
            list.innerHTML = '<div style="font-size:0.85rem;color:var(--text-secondary);text-align:center;">No logs recorded to compute comparison.</div>';
            return;
        }

        sorted.forEach(item => {
            const pct = Math.round((item.hours / maxHours) * 100);
            const row = document.createElement('div');
            row.className = 'comparison-row';
            row.innerHTML = `
                <div class="comparison-name">${item.name}</div>
                <div class="comparison-bar-wrapper">
                    <div class="comparison-bar-fill" style="width: ${pct}%;"></div>
                </div>
                <div class="comparison-value">${item.hours.toFixed(1)}h</div>
            `;
            list.appendChild(row);
        });
    }

    // Render Recent Logs table
    function renderRecentLogs() {
        const body = document.getElementById('recentLogsBody');
        if (!body) return;
        body.innerHTML = '';

        if (trackerTasks.length === 0) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:1rem;">No task logs saved.</td></tr>';
            return;
        }

        // Limit to 5 logs
        trackerTasks.slice(0, 5).forEach(task => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${task.dateStr}</td>
                <td style="font-weight:600;">${task.name}</td>
                <td>${task.memberName}</td>
                <td><span class="task-status-badge ${task.status}">${task.status.replace('-', ' ')}</span></td>
                <td style="font-weight:700;color:var(--primary-color);">${task.hours}h</td>
            `;
            body.appendChild(tr);
        });
    }

    // Modals controllers
    const trackerAddModal = document.getElementById('trackerAddModal');
    const trackerMemberModal = document.getElementById('trackerMemberModal');
    
    const sidebarCreateTaskBtn = document.getElementById('sidebarCreateTaskBtn');
    const trackerLogHoursBtn = document.getElementById('trackerLogHoursBtn');
    const headerLogHoursBtn = document.getElementById('headerLogHoursBtn');
    
    const closeTrackerAddModalBtn = document.getElementById('closeTrackerAddModalBtn');
    const closeTrackerMemberModalBtn = document.getElementById('closeTrackerMemberModalBtn');

    let currentEditingTaskId = null;

    // Open log hours modal
    function openLogHoursModal() {
        currentEditingTaskId = null;
        document.getElementById('trackerAddForm').reset();
        trackerAddModal.querySelector('h2').textContent = 'Log Work Details';
        const delBtn = document.getElementById('deleteTaskBtn');
        if (delBtn) delBtn.style.display = 'none';
        trackerAddModal.style.display = 'flex';
    }

    if (sidebarCreateTaskBtn) sidebarCreateTaskBtn.addEventListener('click', openLogHoursModal);
    if (trackerLogHoursBtn) trackerLogHoursBtn.addEventListener('click', openLogHoursModal);
    if (headerLogHoursBtn) headerLogHoursBtn.addEventListener('click', openLogHoursModal);

    window.openAddTaskPopup = (memberName, dateStr) => {
        currentEditingTaskId = null;
        document.getElementById('trackerAddForm').reset();
        trackerAddModal.querySelector('h2').textContent = 'Log Work Details';
        
        const memberSelect = document.getElementById('taskMemberSelect');
        const dateSelect = document.getElementById('taskDateSelect');
        
        if (memberSelect) memberSelect.value = memberName;
        if (dateSelect) dateSelect.value = dateStr;
        
        const delBtn = document.getElementById('deleteTaskBtn');
        if (delBtn) delBtn.style.display = 'none';
        
        trackerAddModal.style.display = 'flex';
    };

    window.startEditTask = (taskId) => {
        const task = trackerTasks.find(t => t.id === taskId);
        if (!task) return;
        currentEditingTaskId = taskId;
        
        trackerAddModal.querySelector('h2').textContent = 'Edit Work Details';
        document.getElementById('taskMemberSelect').value = task.memberName;
        document.getElementById('taskDateSelect').value = task.dateStr;
        document.getElementById('taskName').value = task.name;
        document.getElementById('taskHours').value = task.hours;
        document.getElementById('taskStatus').value = task.status;
        
        const delBtn = document.getElementById('deleteTaskBtn');
        if (delBtn) delBtn.style.display = 'block';
        
        trackerAddModal.style.display = 'flex';
    };

    if (closeTrackerAddModalBtn) {
        closeTrackerAddModalBtn.addEventListener('click', () => { trackerAddModal.style.display = 'none'; });
    }
    if (closeTrackerMemberModalBtn) {
        closeTrackerMemberModalBtn.addEventListener('click', () => { trackerMemberModal.style.display = 'none'; });
    }
    
    // Add Member column trigger
    const addMemberBtn = document.getElementById('addMemberBtn');
    if (addMemberBtn) {
        addMemberBtn.addEventListener('click', () => {
            document.getElementById('trackerMemberForm').reset();
            trackerMemberModal.style.display = 'flex';
        });
    }

    // Save/Edit task form submit
    const trackerAddForm = document.getElementById('trackerAddForm');
    if (trackerAddForm) {
        trackerAddForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const memberName = document.getElementById('taskMemberSelect').value;
            const dateStr = document.getElementById('taskDateSelect').value;
            const name = document.getElementById('taskName').value;
            const hours = parseFloat(document.getElementById('taskHours').value) || 0;
            const status = document.getElementById('taskStatus').value;

            const submitData = {
                memberName, dateStr, name, hours, status,
                updatedAt: Date.now()
            };

            try {
                if (currentEditingTaskId) {
                    await db.collection('tracker_tasks').doc(currentEditingTaskId).update(submitData);
                    showToast('Log Entry Saved', 'Task updated successfully.', 'success');
                } else {
                    submitData.createdAt = Date.now();
                    await db.collection('tracker_tasks').add(submitData);
                    showToast('Work Hours Logged', 'Logged new hours successfully.', 'success');
                }
                trackerAddModal.style.display = 'none';
            } catch (err) {
                console.error(err);
                showToast('Error', 'Failed to log hours.', 'danger');
            }
        });
    }

    // Add Member form submit
    const trackerMemberForm = document.getElementById('trackerMemberForm');
    if (trackerMemberForm) {
        trackerMemberForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('memberName').value.trim();
            const role = document.getElementById('memberRole').value.trim();

            try {
                await db.collection('tracker_members').add({
                    name, role, createdAt: Date.now()
                });
                trackerMemberModal.style.display = 'none';
                showToast('Member Added', `${name} added to the team columns.`, 'success');
            } catch (err) {
                console.error(err);
                showToast('Error', 'Failed to add member.', 'danger');
            }
        });
    }

    // Extend row date trigger (+ Add Date Row)
    const addDateRowBtn = document.getElementById('addDateRowBtn');
    if (addDateRowBtn) {
        addDateRowBtn.addEventListener('click', async () => {
            let nextDateStr = '';
            let nextOrder = 1;
            let nextTimestamp = Date.now();

            if (trackerDates.length > 0) {
                const lastDoc = trackerDates[trackerDates.length - 1];
                nextOrder = (lastDoc.order || 0) + 1;
                
                // Use stored timestamp if available, otherwise parse last dateStr
                let lastTimestamp = lastDoc.timestamp;
                if (!lastTimestamp) {
                    const parts = lastDoc.dateStr.split(' ');
                    const lastNum = parseInt(parts[1]) || 23;
                    const d = new Date();
                    d.setDate(lastNum);
                    lastTimestamp = d.getTime();
                }
                
                const nextDate = new Date(lastTimestamp + 86400000);
                const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
                nextDateStr = `${daysOfWeek[nextDate.getDay()]} ${nextDate.getDate()}`;
                nextTimestamp = nextDate.getTime();
            } else {
                const today = new Date();
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(today.setDate(diff));
                monday.setHours(12, 0, 0, 0);
                const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
                nextDateStr = `${daysOfWeek[monday.getDay()]} ${monday.getDate()}`;
                nextTimestamp = monday.getTime();
            }

            try {
                await db.collection('tracker_dates').add({
                    dateStr: nextDateStr,
                    order: nextOrder,
                    timestamp: nextTimestamp
                });
                showToast('Row Extended', `Added date row ${nextDateStr}.`, 'success');
            } catch (err) {
                console.error(err);
                showToast('Error', 'Failed to add date row.', 'danger');
            }
        });
    }

    // Delete team member & clean tasks
    window.deleteMember = async (memberId, memberName) => {
        if (confirm(`Are you sure you want to delete team member ${memberName}? All their logged tasks will also be deleted.`)) {
            try {
                // Delete member doc
                await db.collection('tracker_members').doc(memberId).delete();
                
                // Query and delete all tasks for this member
                const snap = await db.collection('tracker_tasks').where('memberName', '==', memberName).get();
                const batch = db.batch();
                snap.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                
                showToast('Member Deleted', `${memberName} and their tasks have been removed.`, 'success');
            } catch (e) {
                console.error("Error deleting member", e);
                showToast('Error', 'Failed to delete member.', 'danger');
            }
        }
    };

    // Delete task log listener
    const deleteTaskBtn = document.getElementById('deleteTaskBtn');
    if (deleteTaskBtn) {
        deleteTaskBtn.addEventListener('click', async () => {
            if (currentEditingTaskId && confirm('Are you sure you want to delete this log entry?')) {
                try {
                    await db.collection('tracker_tasks').doc(currentEditingTaskId).delete();
                    trackerAddModal.style.display = 'none';
                    showToast('Log Entry Deleted', 'Task log removed.', 'success');
                } catch (err) {
                    console.error(err);
                    showToast('Error', 'Failed to delete log entry.', 'danger');
                }
            }
        });
    }

    // Window clicks to close modals
    window.addEventListener('click', (e) => {
        if (e.target === trackerAddModal) trackerAddModal.style.display = 'none';
        if (e.target === trackerMemberModal) trackerMemberModal.style.display = 'none';
    });

});
