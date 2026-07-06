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
    { id: 'floor_cleaner',          name: 'Floor Cleaner',              icon: '' },
    { id: 'bathroom_cleaner',       name: 'Bathroom Cleaner',           icon: '' },
    { id: 'dishwasher',             name: 'Dishwasher',                 icon: '' },
    { id: 'phenyl',                 name: 'Phenyl',                     icon: '' },
    { id: 'glass_cleaner',          name: 'Glass Cleaner',              icon: '' },
    { id: 'handwash',               name: 'Handwash',                   icon: '' },
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
                window.isAdmin = userData.role === 'admin';
                
                const navLabel = document.getElementById('nav-admin-label');
                const sectionTitle = document.getElementById('admin-section-title');
                const sectionSubtitle = document.getElementById('admin-section-subtitle');

                const navWarehouse = document.getElementById('nav-warehouse');
                const stockStrip = document.getElementById('stockStrip');
                const navDesign = document.getElementById('nav-design');
                const navTasks = document.getElementById('nav-tasks');
                const navWages = document.getElementById('nav-wages');
                const sidebarCreateTaskBtn = document.getElementById('sidebarCreateTaskBtn');

                if (window.isSuperAdmin || window.isAdmin) {
                    if (navLabel) navLabel.textContent = window.isSuperAdmin ? 'Admin Panel' : 'Users';
                    if (sectionTitle) sectionTitle.innerHTML = window.isSuperAdmin ? 'Admin Panel' : 'User Directory';
                    if (sectionSubtitle) sectionSubtitle.textContent = window.isSuperAdmin ? 'Manage system users, adjust access roles, and route notifications.' : 'View registered users and their access roles.';
                    if (typeof SECTION_LABELS !== 'undefined') SECTION_LABELS.admin = window.isSuperAdmin ? 'Admin Panel' : 'Users';
                    
                    if (navWarehouse) navWarehouse.style.display = 'flex';
                    if (stockStrip) stockStrip.style.display = 'flex';
                    if (navDesign) navDesign.style.display = 'flex';
                    if (navTasks) navTasks.style.display = 'flex';
                    if (navWages) navWages.style.display = 'flex';
                    
                    // Specific restrictions for regular Admin vs Super Admin
                    const trackerLogHoursBtn = document.getElementById('trackerLogHoursBtn');
                    const addDateRowBtn = document.getElementById('addDateRowBtn');
                    const addMemberBtn = document.getElementById('addMemberBtn');
                    const designEditor = document.getElementById('designEditor');
                    const saveDesignBtn = document.getElementById('saveDesignBtn');
                    
                    if (trackerLogHoursBtn) trackerLogHoursBtn.style.display = window.isSuperAdmin ? 'block' : 'none';
                    if (addDateRowBtn) addDateRowBtn.style.display = window.isSuperAdmin ? 'inline-block' : 'none';
                    if (addMemberBtn) addMemberBtn.style.display = window.isSuperAdmin ? 'inline-block' : 'none';
                    if (designEditor) designEditor.disabled = !window.isSuperAdmin;
                    if (saveDesignBtn) saveDesignBtn.style.display = window.isSuperAdmin ? 'block' : 'none';

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
                    if (navWages) navWages.style.display = 'none';
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
                        <select class="priority-badge ${user.role === 'super_admin' ? 'priority-high' : (user.role === 'admin' ? 'priority-medium' : 'priority-low')}" 
                                onchange="updateUserRole('${uId}', this.value)"
                                ${isSelf ? 'disabled' : ''}
                                style="cursor:${isSelf ? 'not-allowed' : 'pointer'};border:1px solid rgba(255,255,255,0.1);outline:none;border-radius:4px;padding:0.25rem 0.5rem;font-family:inherit;">
                            <option value="user" ${user.role !== 'super_admin' && user.role !== 'admin' ? 'selected' : ''}>User</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
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
                    let roleBadgeStr = `<span class="priority-badge priority-low">User</span>`;
                    if (user.role === 'super_admin') roleBadgeStr = `<span class="priority-badge priority-high">Super Admin</span>`;
                    else if (user.role === 'admin') roleBadgeStr = `<span class="priority-badge priority-medium">Admin</span>`;
                    const roleBadge = roleBadgeStr;

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
    const hamburgerBtn     = document.getElementById('hamburgerBtn');
    const sidebar          = document.getElementById('sidebar');
    const sidebarOverlay   = document.getElementById('sidebarOverlay');
    const appWrapper       = document.getElementById('app-wrapper');
    const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');

    function toggleSidebar() {
        const isCollapsed = appWrapper.classList.toggle('sidebar-collapsed');
        // Update collapse button chevron direction
        if (sidebarCollapseBtn) {
            sidebarCollapseBtn.innerHTML = isCollapsed ? '&#8250;' : '&#8249;';
            sidebarCollapseBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
        }
        // On mobile: also handle overlay
        if (window.innerWidth < 768) {
            if (!isCollapsed) {
                sidebarOverlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            } else {
                sidebarOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
    }

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleSidebar);
    if (sidebarCollapseBtn) sidebarCollapseBtn.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => {
        appWrapper.classList.add('sidebar-collapsed');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
    });


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
        tasks:     'Task Tracker',
        wages:     'Wages Dashboard'
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
        let keepModalOpen = false;
        
        const saveAndAddAnotherBtn = document.getElementById('saveAndAddAnotherBtn');
        if (saveAndAddAnotherBtn) {
            saveAndAddAnotherBtn.addEventListener('click', () => {
                keepModalOpen = true;
                if (addItemForm.reportValidity()) {
                    addItemForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
            });
        }

        addItemForm.addEventListener('submit', async e => {
            e.preventDefault();
            const submitBtn = addItemForm.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Adding Task...';
            submitBtn.disabled = true;
            if (saveAndAddAnotherBtn) saveAndAddAnotherBtn.disabled = true;

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

                if (!keepModalOpen) {
                    addModal.style.display = 'none';
                }
                
                // Reset fields but keep category and some other potentially recurring fields if desired. 
                // For now, full reset as requested by 'Add Another' pattern, except maybe priority.
                const lastCategory = document.getElementById('category').value;
                const lastAssigned = document.getElementById('assignedDelivery').value;
                addItemForm.reset();
                if (keepModalOpen) {
                    document.getElementById('category').value = lastCategory;
                    document.getElementById('assignedDelivery').value = lastAssigned;
                }
                
                showToast('Task Added', `Added delivery task for ${productName}.`, 'success');
            } catch (err) {
                console.error(err);
                showToast('Error', 'Failed to add task.', 'danger');
            } finally {
                submitBtn.textContent = 'Add New Task';
                submitBtn.disabled = false;
                if (saveAndAddAnotherBtn) saveAndAddAnotherBtn.disabled = false;
                keepModalOpen = false;
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

        // Calculate Dishwasher Qty Out For Delivery
        const dishwashQtyEl = document.getElementById('dishwashDeliveryQty');
        if (dishwashQtyEl) {
            let totalDishwash = 0;
            inventory.forEach(item => {
                if (item.category === 'Dishwasher' && item.status !== 'Completed') {
                    totalDishwash += parseFloat(item.quantity) || 0;
                }
            });
            dishwashQtyEl.textContent = totalDishwash + ' units';
        }

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
    const placeholderImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgcng9IjgiIGZpbGw9IiNlOGVhZWQiLz48cGF0aCBkPSJNMTcwIDEzMCBsMzAgNDAgbDIwLTE1IGw0MCA1NSBIMTQweiIgZmlsbD0iI2JkYzFjNiIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjEyMCIgcj0iMTgiIGZpbGw9IiNiZGMxYzYiLz48L3N2Zz4=';
    const categoryMetadata = {
        'floor_cleaner': {
            img: placeholderImg,
            sku: 'CHM-F102',
            subtitle: 'Industrial Grade',
            tags: ['Chemical', 'Liquid']
        },
        'bathroom_cleaner': {
            img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBC7Syp5Bjy482dtMHwmqzfRqlYCErJBrcacBJ7BvkGC4VfA2J1F3spM6TK7qud_mR41QXgiIheqsTSKwypr1uTtgwKbmrLCHqUzmsONCePIVCsa0tZWiirAKrDVP_0n-A0_Cz04gZ4GtpsZTPU6o9OG2nCi7JiLHsaFYtZRREg0VsImaywDylVPojLDQaOIF0h7dK9SEn3F_ZhhBhHURWP5vVzkuZZUThuUZMC1NABMMdWmWCvSAMmKYN_CeydP1PkJujYcyJ8y00K',
            sku: 'CHM-B205',
            subtitle: 'Acidic Compound',
            tags: ['Chemical', 'Acidic']
        },
        'dishwasher': {
            img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD0TPom27EWnQkbNv5dzF818TC_1MILillqfrW6strLRBNz3jwSQUcg8S4mmdswrSyqxNKKxG3jrC2Qq6hgZllbpk7ABaNAyNRBAhGgMA6kxDri1SkyNBmdlqFS5na95yDxtP017m5htV_3OkqOajl-LTfHR11kjrarOVjp_HNuxKH36Z3QKHAlEbhvVoB6_I6HzmKaXOgbjv9TniVTgDp_bJYgXd__UBxPyHdsP0FOww-WhSaTEIJY_0GcwSYEMkfMrtHg73_nsT3b',
            sku: 'CHM-D301',
            subtitle: 'Standard Base',
            tags: ['Chemical', 'Base']
        },
        'phenyl': {
            img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCUxbPevEWvsDnC2-tNBLaVRQ0M50p1Qi4dtZUZyGwmQXZ4ALFVDK5VtNf67kakb4nhp27PqMIg6EOWJyV-4O0oMJLQB7tdYitSS7_lGXFoN4PPYb6rEtG6jXrHvD601lXiwRKi-XSVA1VJpIlx87yqEEFtXfojhC_9J32Xm5M2mrp5KkyYYRDb-0Io9RhgVXTGMpHwIoAlT-8YV6u-JaGfJsLIPk1QwtNX2_RLJXeKRmPtdevEMGBwRD4CTMPQKS950NQ7QQwta2cY',
            sku: 'CHM-P5590',
            subtitle: 'Concentrated Disinfectant',
            tags: ['Chemical', 'Disinfectant']
        },
        'glass_cleaner': {
            img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCu-rrcZs-q5UOWYs-x5jJVSjob4f7v6cZ9pqE-D6n1DSFyNtqUw9hwGoTZofqm2OBfttJBTRJmOY0lQxintLqVI9hJr7OfOiWz76upkct0iHKpQDupT4ammugE8OgsGoNjovvqGJu7M8oWdS1hwzjEJUsuplwfOmv0qgwD2Q0dCHZYSurFUUqW5iSgGK1qvFKOD8CxXOi6lnw9dsFEp0nGflOGT12K4oDgp9r6mQiHf9G4BdmiWwPsu0KCWpJVApyjVgRczu5mtieu',
            sku: 'CHM-G442',
            subtitle: 'Ammonia Solution',
            tags: ['Chemical', 'Ammonia']
        },
        'handwash': {
            img: placeholderImg,
            sku: 'CHM-H550',
            subtitle: 'Hygiene Grade',
            tags: ['Chemical', 'Hygiene']
        }
    };

    function renderWarehouseGrid() {
        const grid = document.getElementById('warehouseGrid');
        if (!grid) return;
        grid.innerHTML = '';
        
        // Remove old CSS grid logic to rely entirely on flex/grid from CSS classes we injected
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        grid.style.gap = '1.5rem';

        WAREHOUSE_CATEGORIES.forEach(cat => {
            const data = warehouseData[cat.id] || { ...DEFAULT_WAREHOUSE_DOC };
            const stock = data.stockRemaining || 0;
            const minStock = data.minimumStock || 0;
            const isLow = stock <= minStock;
            const outDel = data.outForDelivery || 0;
            const rawOrd = data.rawMaterialsOrdered || 0;
            const rawInv = data.rawMaterialsInInventory || 0;
            const prodRate = data.productionRatePerDay || 0;
            const lastDate = data.lastBatchDate;

            let batchDateDisplay = 'N/A';
            if (lastDate) {
                batchDateDisplay = (lastDate.toDate ? lastDate.toDate() : new Date(lastDate)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            }

            const meta = categoryMetadata[cat.id] || { img: '', sku: 'UNKNOWN', subtitle: '', tags: [] };
            const tagsHtml = meta.tags.map(t => `<span class="wh-tag">${t}</span>`).join('');

            const card = document.createElement('div');
            card.className = `wh-product-card group`;
            card.innerHTML = `
                <div class="wh-product-img-box">
                    <img src="${meta.img}" alt="${cat.name}" class="wh-product-img">
                </div>
                
                <div class="wh-product-details">
                    <div>
                        <div class="wh-sku-wrap">
                            <span class="wh-sku-dot ${isLow ? 'low' : 'good'}"></span>
                        </div>
                        <h3 class="wh-product-title">${cat.name}</h3>
                        <p class="wh-product-subtitle">${meta.subtitle} &bull; Batch: <span style="color:var(--text-primary);cursor:pointer;" onclick="startEditFieldNew('${cat.id}', 'lastBatchDate', 'date')" id="val-${cat.id}-lastBatchDate">${batchDateDisplay}</span></p>
                        <div id="wrap-${cat.id}-lastBatchDate" style="display:none;"></div> <!-- Placeholder for date edit -->
                    </div>
                    <div class="wh-product-tags">${tagsHtml}</div>
                </div>

                <div class="wh-metrics-grid">
                    ${buildMetricBox(cat.id, 'stockRemaining', 'Available', stock)}
                    ${buildMetricBox(cat.id, 'minimumStock', 'Threshold', minStock)}
                    ${buildMetricBox(cat.id, 'rawMaterialsInInventory', 'Raw Stock', rawInv)}
                    ${buildMetricBox(cat.id, 'rawMaterialsOrdered', 'Ordered', rawOrd)}
                    ${buildMetricBox(cat.id, 'productionRatePerDay', 'Daily Prod', prodRate)}
                    ${buildMetricBox(cat.id, 'outForDelivery', 'Delivered', outDel)}
                </div>
            `;
            grid.appendChild(card);
        });
    }

    function buildMetricBox(catId, field, label, val) {
        return `
            <div class="wh-metric-box" id="wrap-${catId}-${field}" onclick="startEditFieldNew('${catId}', '${field}', 'number')">
                <p class="wh-metric-label">${label}</p>
                <p class="wh-metric-value" id="val-${catId}-${field}">${val}</p>
            </div>
        `;
    }

    window.startEditFieldNew = (catId, field, type) => {
        const wrap = document.getElementById(`wrap-${catId}-${field}`);
        if (!wrap) return;
        
        // Prevent double clicking
        if (wrap.querySelector('input')) return;

        const valSpan = document.getElementById(`val-${catId}-${field}`);
        const currentText = valSpan.textContent.trim();

        let inputHtml = '';
        if (type === 'date') {
            // For date, we hide the text and show input inside the placeholder
            wrap.style.display = 'flex';
            wrap.style.marginTop = '4px';
            inputHtml = `<input type="date" id="input-${catId}-${field}" class="field-input" style="color-scheme:dark; width: 110px;">`;
        } else {
            inputHtml = `<input type="number" id="input-${catId}-${field}" value="${currentText}" class="field-input" step="any" onclick="event.stopPropagation()">`;
        }

        wrap.innerHTML = `
            ${inputHtml}
            <button class="btn-save-field" onclick="event.stopPropagation(); saveEditFieldNew('${catId}', '${field}', '${type}')">SAVE</button>
        `;
    };

    window.saveEditFieldNew = async (catId, field, type) => {
        const input = document.getElementById(`input-${catId}-${field}`);
        if (!input) return;
        
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

    // Helper: Safely calculate cost for older tasks missing calculatedCost
    function getTaskCalculatedCost(task) {
        let cost = parseFloat(task.calculatedCost);
        if (isNaN(cost)) {
            if (task.wageCategory === 'production') cost = task.hours <= 4 ? 100 : 200;
            else if (task.wageCategory === 'delivery') cost = task.hasVehicle ? 150 : 50;
            else if (task.wageCategory === 'meeting') cost = parseFloat(task.commissionAmount) || 0;
            else cost = 0;
        }
        return cost;
    }

    // Helper: Convert "MON 29" date string to a logical Unix timestamp for filtering and sorting
    function getTaskLogicalDate(task) {
        const match = (task.dateStr || '').match(/\d+/);
        if (!match) return task.createdAt || 0;
        const day = parseInt(match[0], 10);
        const createdDate = new Date(task.createdAt || Date.now());
        let year = createdDate.getFullYear();
        let month = createdDate.getMonth();
        // If task logged early in month (1-7) but date is late (24-31), it belongs to previous month
        if (createdDate.getDate() <= 7 && day >= 24) {
            month -= 1;
            if (month < 0) { month = 11; year -= 1; }
        }
        // If task logged late in month (24-31) but date is early (1-7), it belongs to next month
        else if (createdDate.getDate() >= 24 && day <= 7) {
            month += 1;
            if (month > 11) { month = 0; year += 1; }
        }
        return new Date(year, month, day).getTime();
    }

    // Removed seedDefaultDates logic since dates are now auto-generated by month.
    const _now = new Date();
    let viewYear = _now.getFullYear();
    let viewMonth = _now.getMonth(); // 0-indexed

    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    function generateMonthDates() {
        trackerDates = [];
        const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const targetDate = new Date(viewYear, viewMonth, day);
            const dateStr = `${daysOfWeek[targetDate.getDay()]} ${day}`;
            trackerDates.push({
                id: `date_${viewYear}_${viewMonth}_${day}`,
                dateStr: dateStr,
                order: day,
                timestamp: targetDate.getTime()
            });
        }

        // Update the label
        const label = document.getElementById('dateRangeLabel');
        if (label) {
            label.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
        }

        // Reset day filter when month changes so no stale day stays selected
        selectedDayFilter = 'all';
        const dayFilterEl = document.getElementById('dayFilter');
        if (dayFilterEl) dayFilterEl.value = 'all';

        updateTrackerDropdowns();
        updateDayFilterDropdown();
        renderCalendarGrid();
    }

    generateMonthDates();

    // Listen to Database
    db.collection('tracker_members').orderBy('createdAt', 'asc').onSnapshot(snap => {
        trackerMembers = [];
        snap.forEach(doc => {
            trackerMembers.push({ id: doc.id, ...doc.data() });
        });
        updateTrackerDropdowns();
        updateMemberFilterDropdown();
        renderCalendarGrid();
    });

    // No tracker_dates listener; dates are generated in memory based on month selection

    db.collection('tracker_tasks').orderBy('createdAt', 'desc').onSnapshot(snap => {
        trackerTasks = [];
        snap.forEach(doc => {
            trackerTasks.push({ id: doc.id, ...doc.data() });
        });
        renderCalendarGrid();
        renderComparisonChart();
        renderRecentLogs();
        renderWagesTable();
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
        updateMemberFilterDropdown();
    }

    // Filter Triggers
    let selectedMemberFilter = 'all';
    let selectedWagePeriodFilter = 'all';
    let selectedWagesDashboardMemberFilter = 'all';
    let selectedWagesDashboardPeriodFilter = 'current_month';

    function updateMemberFilterDropdown() {
        const filter = document.getElementById('memberFilter');
        const wagesMemberFilter = document.getElementById('wagesMemberFilter');
        
        let optionsHtml = '<option value="all">All Members</option>';
        trackerMembers.forEach(m => {
            optionsHtml += `<option value="${m.name}">${m.name}</option>`;
        });

        if (filter) {
            const currentValue = filter.value;
            filter.innerHTML = optionsHtml;
            filter.value = currentValue || 'all';
        }

        if (wagesMemberFilter) {
            const currentValue = wagesMemberFilter.value;
            wagesMemberFilter.innerHTML = optionsHtml;
            wagesMemberFilter.value = currentValue || 'all';
        }
    }

    const dayFilter = document.getElementById('dayFilter');
    if (dayFilter) {
        dayFilter.addEventListener('change', (e) => {
            selectedDayFilter = e.target.value;
            renderCalendarGrid();
            renderComparisonChart();
            renderRecentLogs();
        });
    }

    const memberFilter = document.getElementById('memberFilter');
    if (memberFilter) {
        memberFilter.addEventListener('change', (e) => {
            selectedMemberFilter = e.target.value;
            renderComparisonChart();
            renderRecentLogs();
        });
    }

    const wagePeriodFilter = document.getElementById('wagePeriodFilter');
    if (wagePeriodFilter) {
        wagePeriodFilter.addEventListener('change', (e) => {
            selectedWagePeriodFilter = e.target.value;
            renderComparisonChart();
            renderRecentLogs();
        });
    }

    const wagesMemberFilter = document.getElementById('wagesMemberFilter');
    if (wagesMemberFilter) {
        wagesMemberFilter.addEventListener('change', (e) => {
            selectedWagesDashboardMemberFilter = e.target.value;
            renderWagesTable();
        });
    }

    const wagesPeriodFilter = document.getElementById('wagesPeriodFilter');
    if (wagesPeriodFilter) {
        wagesPeriodFilter.addEventListener('change', (e) => {
            selectedWagesDashboardPeriodFilter = e.target.value;
            renderWagesTable();
        });
    }

    // Month Navigation Buttons
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            viewMonth -= 1;
            if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
            generateMonthDates();
        });
    }

    const nextMonthBtn = document.getElementById('nextMonthBtn');
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            viewMonth += 1;
            if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
            generateMonthDates();
        });
    }

    const currentMonthBtn = document.getElementById('currentMonthBtn');
    if (currentMonthBtn) {
        currentMonthBtn.addEventListener('click', () => {
            const today = new Date();
            viewYear = today.getFullYear();
            viewMonth = today.getMonth();
            generateMonthDates();
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
                        ${window.isSuperAdmin ? `<button class="btn-delete-member" onclick="deleteMember('${m.id}', '${m.name}')">✕</button>` : ''}
                        <input type="text" value="${m.name}" onchange="updateMemberName('${m.id}', this.value)" ${!window.isSuperAdmin ? 'disabled' : ''} style="${!window.isSuperAdmin ? 'background:transparent;border:none;' : ''}">
                        <input type="text" class="member-role-input" value="${m.role}" onchange="updateMemberRole('${m.id}', this.value)" ${!window.isSuperAdmin ? 'disabled' : ''} style="${!window.isSuperAdmin ? 'background:transparent;border:none;' : ''}">
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

                let cellContentHtml = '<div style="display: flex; flex-direction: column; gap: 4px; height: 100%; min-height: 40px;">';
                if (matchingTasks.length > 0) {
                    matchingTasks.forEach(task => {
                        cellContentHtml += `
                            <div class="task-card-item" ${window.isSuperAdmin ? `onclick="startEditTask('${task.id}')"` : 'style="cursor:default;"'}>
                                <div class="task-card-title">${task.name}</div>
                                <div class="task-card-meta">
                                    <span>${task.hours}h</span>
                                    <span class="task-status-badge ${task.status}">${task.status.replace('-', ' ')}</span>
                                </div>
                            </div>
                        `;
                    });
                }
                
                if (window.isSuperAdmin) {
                    // Always show add button so multiple tasks can be added
                    cellContentHtml += `
                        <div class="task-cell-inner" onclick="openAddTaskPopup('${member.name}', '${date.dateStr}')" style="cursor:pointer; flex: 1; display: flex; align-items: center; justify-content: center; min-height: 24px; border-radius: 4px; transition: background 0.2s; margin-top: auto;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                            <span style="opacity: 0.15; font-size: 1.2rem;">+</span>
                        </div>
                    `;
                } else if (matchingTasks.length === 0) {
                    // Empty placeholder for non-admins
                    cellContentHtml += `
                        <div class="task-cell-inner" style="cursor:default; flex: 1;">
                            <span style="opacity: 0;">+</span>
                        </div>
                    `;
                }
                cellContentHtml += '</div>';

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

        // Calculate hours and wages
        const totals = {};
        const wageTotals = {};
        trackerMembers.forEach(m => { 
            totals[m.name] = 0; 
            wageTotals[m.name] = 0;
        });

        let filteredTasks = trackerTasks;

        if (selectedDayFilter !== 'all') {
            filteredTasks = filteredTasks.filter(t => t.dateStr === selectedDayFilter);
        }
        if (selectedMemberFilter !== 'all') {
            filteredTasks = filteredTasks.filter(t => t.memberName === selectedMemberFilter);
        }
        if (selectedWagePeriodFilter !== 'all') {
            const daysToFilter = parseInt(selectedWagePeriodFilter);
            const cutoffTime = Date.now() - (daysToFilter * 24 * 60 * 60 * 1000);
            filteredTasks = filteredTasks.filter(t => getTaskLogicalDate(t) >= cutoffTime);
        }

        filteredTasks.forEach(task => {
            if (totals[task.memberName] !== undefined) {
                totals[task.memberName] += parseFloat(task.hours) || 0;
                wageTotals[task.memberName] += getTaskCalculatedCost(task);
            }
        });

        // Compute metrics
        let sumHours = 0;
        let sumWages = 0;
        let doneCount = 0;
        filteredTasks.forEach(t => {
            sumHours += parseFloat(t.hours) || 0;
            sumWages += getTaskCalculatedCost(t);
            doneCount++;
        });

        const totalHoursVal = document.getElementById('trackerTotalHours');
        const totalWagesVal = document.getElementById('trackerTotalWages');
        const tasksDoneVal = document.getElementById('trackerTasksDone');
        const headerTotalHours = document.getElementById('headerTotalHours');
        const headerTasksDone = document.getElementById('headerTasksDone');

        if (totalHoursVal) totalHoursVal.textContent = sumHours.toFixed(1);
        if (totalWagesVal) totalWagesVal.textContent = sumWages;
        if (tasksDoneVal) tasksDoneVal.textContent = doneCount;
        if (headerTotalHours) headerTotalHours.textContent = sumHours.toFixed(1);
        if (headerTasksDone) headerTasksDone.textContent = doneCount;

        // Sort members
        const sorted = Object.keys(totals).map(name => ({
            name,
            hours: totals[name],
            wages: wageTotals[name]
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

        let filteredTasks = trackerTasks;

        if (selectedDayFilter !== 'all') {
            filteredTasks = filteredTasks.filter(t => t.dateStr === selectedDayFilter);
        }
        if (selectedMemberFilter !== 'all') {
            filteredTasks = filteredTasks.filter(t => t.memberName === selectedMemberFilter);
        }
        if (selectedWagePeriodFilter !== 'all') {
            const daysToFilter = parseInt(selectedWagePeriodFilter);
            const cutoffTime = Date.now() - (daysToFilter * 24 * 60 * 60 * 1000);
            filteredTasks = filteredTasks.filter(t => getTaskLogicalDate(t) >= cutoffTime);
        }

        // Sort chronologically (newest first for recent logs)
        filteredTasks.sort((a, b) => getTaskLogicalDate(b) - getTaskLogicalDate(a));

        if (filteredTasks.length === 0) {
            body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:1rem;">No task logs saved.</td></tr>';
            return;
        }

        // Limit to 5 logs
        filteredTasks.slice(0, 5).forEach(task => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${task.dateStr}</td>
                <td style="font-weight:600;">${task.name}</td>
                <td>${task.memberName}</td>
                <td><span class="task-status-badge ${task.status}">${task.status.replace('-', ' ')}</span></td>
                <td style="font-weight:700;color:var(--primary-color);">${task.hours || 0}h</td>
                <td style="font-weight:700;color:var(--accent-color);">₹${getTaskCalculatedCost(task)}</td>
            `;
            body.appendChild(tr);
        });
    }

    // Toggle wage payment status (Pending <-> Paid)
    window.toggleWagePaymentStatus = async (taskId, currentStatus) => {
        const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
        try {
            await db.collection('tracker_tasks').doc(taskId).update({ paymentStatus: newStatus });
        } catch (e) {
            showToast('Error', 'Failed to update payment status.', 'danger');
        }
    };

    // Render Dedicated Wages Table
    function renderWagesTable() {
        const body = document.getElementById('wagesBody');
        const detailsBody = document.getElementById('wagesDetailsBody');
        const totalDisplay = document.getElementById('wagesTotalDisplay');
        const prodDisplay = document.getElementById('wagesProductionDisplay');
        const delDisplay = document.getElementById('wagesDeliveryDisplay');
        const meetDisplay = document.getElementById('wagesMeetingDisplay');
        const tasksDisplay = document.getElementById('wagesTasksDisplay');
        const hoursDisplay = document.getElementById('wagesHoursDisplay');

        if (!body) return;
        body.innerHTML = '';
        if (detailsBody) detailsBody.innerHTML = '';

        // Valid wage categories (includes 'others' - shown with ₹0 wage)
        const VALID_CATEGORIES = ['production', 'delivery', 'meeting', 'others'];

        // 1. Filter to valid categories + period
        let periodFilteredTasks = trackerTasks.filter(t => VALID_CATEGORIES.includes(t.wageCategory));

        const now = new Date();
        if (selectedWagesDashboardPeriodFilter === '7_days') {
            const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
            periodFilteredTasks = periodFilteredTasks.filter(t => getTaskLogicalDate(t) >= cutoff);
        } else if (selectedWagesDashboardPeriodFilter === '15_days') {
            const cutoff = Date.now() - (15 * 24 * 60 * 60 * 1000);
            periodFilteredTasks = periodFilteredTasks.filter(t => getTaskLogicalDate(t) >= cutoff);
        } else if (selectedWagesDashboardPeriodFilter === 'current_month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
            periodFilteredTasks = periodFilteredTasks.filter(t => {
                const ts = getTaskLogicalDate(t);
                return ts >= startOfMonth && ts <= endOfMonth;
            });
        }

        // 2. Accumulate overall summary comparison for ALL members
        const memberWages = {};
        trackerMembers.forEach(m => {
            memberWages[m.name] = { tasks: 0, total: 0 };
        });

        periodFilteredTasks.forEach(task => {
            let cost = getTaskCalculatedCost(task);
            if (memberWages[task.memberName] !== undefined) {
                memberWages[task.memberName].tasks += 1;
                memberWages[task.memberName].total += cost;
            }
        });

        // 3. Filter by Member ONLY for metrics cards and detailed log table
        let detailFilteredTasks = periodFilteredTasks;
        if (selectedWagesDashboardMemberFilter !== 'all') {
            detailFilteredTasks = detailFilteredTasks.filter(t => t.memberName === selectedWagesDashboardMemberFilter);
        }

        let grandTotal = 0;
        let productionTotal = 0;
        let deliveryTotal = 0;
        let meetingTotal = 0;
        let totalHours = 0;
        let totalTasksCount = detailFilteredTasks.length;

        // Sort by logical calendar date descending (newest first, so 1st of July is at the bottom)
        const sortedDetailTasks = [...detailFilteredTasks].sort((a, b) => {
            return getTaskLogicalDate(b) - getTaskLogicalDate(a);
        });

        sortedDetailTasks.forEach(task => {
            let cost = getTaskCalculatedCost(task);

            if (task.wageCategory === 'production') productionTotal += cost;
            else if (task.wageCategory === 'delivery') deliveryTotal += cost;
            else if (task.wageCategory === 'meeting') meetingTotal += cost;

            grandTotal += cost;
            totalHours += parseFloat(task.hours) || 0;

            // Detailed row rendering
            if (detailsBody) {
                const tr = document.createElement('tr');
                let breakdown = '';
                if (task.wageCategory === 'production') {
                    breakdown = `${task.hours || 0}h logged (${task.hours <= 4 ? '₹100 flat ≤4h' : '₹200 flat >4h'})`;
                } else if (task.wageCategory === 'delivery') {
                    breakdown = `Delivery (${task.hasVehicle ? 'With Vehicle ₹150' : 'No Vehicle ₹50'})`;
                } else if (task.wageCategory === 'meeting') {
                    breakdown = `Meeting / Client (Commission ₹${task.commissionAmount || 0})`;
                } else if (task.wageCategory === 'others') {
                    breakdown = `Other work — ${task.name || ''}`.trim();
                }

                const payStatus = task.paymentStatus || 'pending';
                const isPaid = payStatus === 'paid';
                const canToggle = window.isSuperAdmin ? `onclick="toggleWagePaymentStatus('${task.id}', '${payStatus}')" style="cursor:pointer;"` : '';
                const badgeStyle = isPaid
                    ? `background:rgba(45,212,191,0.15);color:#2dd4bf;border:1px solid rgba(45,212,191,0.4);`
                    : `background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);`;

                tr.innerHTML = `
                    <td style="color:var(--text-secondary);font-size:0.85rem;white-space:nowrap;">${task.dateStr}</td>
                    <td style="font-weight:600;">${task.memberName}</td>
                    <td><span style="text-transform:capitalize;background:rgba(148,163,184,0.1);padding:2px 8px;border-radius:4px;font-size:0.8rem;">${task.wageCategory}</span></td>
                    <td style="color:var(--text-secondary);font-size:0.82rem;">${breakdown}</td>
                    <td style="font-weight:700;color:var(--accent-color);">₹${cost.toFixed(2)}</td>
                    <td><span ${canToggle} style="padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;letter-spacing:0.5px;${badgeStyle}">${isPaid ? '✓ Paid' : '⏳ Pending'}</span></td>
                `;
                detailsBody.appendChild(tr);
            }
        });

        // Update displays
        if (totalDisplay) totalDisplay.textContent = `₹${grandTotal.toFixed(2)}`;
        if (prodDisplay) prodDisplay.textContent = `₹${productionTotal.toFixed(2)}`;
        if (delDisplay) delDisplay.textContent = `₹${deliveryTotal.toFixed(2)}`;
        if (meetDisplay) meetDisplay.textContent = `₹${meetingTotal.toFixed(2)}`;
        if (tasksDisplay) tasksDisplay.textContent = totalTasksCount;
        if (hoursDisplay) hoursDisplay.textContent = `${totalHours.toFixed(1)}h`;

        // Render Summary Comparison table
        const sortedMembers = Object.keys(memberWages).map(name => ({
            name,
            ...memberWages[name]
        })).filter(m => m.total > 0 || m.tasks > 0).sort((a, b) => b.total - a.total);

        if (sortedMembers.length === 0) {
            body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:1rem;">No wages recorded for this period.</td></tr>';
            if (detailsBody && sortedDetailTasks.length === 0) {
                detailsBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:1rem;">No detailed records found.</td></tr>';
            }
            return;
        }

        sortedMembers.forEach(member => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:600;">${member.name}</td>
                <td>${member.tasks} tasks</td>
                <td style="font-weight:700;color:var(--accent-color);">₹${member.total.toFixed(2)}</td>
            `;
            body.appendChild(tr);
        });

        if (sortedDetailTasks.length === 0 && detailsBody) {
            detailsBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:1rem;">No detailed records found for this member/period.</td></tr>';
        }
    }

    // Modal Operations// Modals controllers
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

    window.toggleWageFields = function() {
        const cat = document.getElementById('wageCategory').value;
        const pFields = document.getElementById('productionFields');
        const dFields = document.getElementById('deliveryFields');
        const mFields = document.getElementById('meetingFields');
        if (pFields) pFields.style.display = (cat === 'production') ? 'block' : 'none';
        if (dFields) dFields.style.display = (cat === 'delivery') ? 'block' : 'none';
        if (mFields) mFields.style.display = (cat === 'meeting') ? 'block' : 'none';
    };

    window.startEditTask = (taskId) => {
        const task = trackerTasks.find(t => t.id === taskId);
        if (!task) return;
        currentEditingTaskId = taskId;
        
        trackerAddModal.querySelector('h2').textContent = 'Edit Work Details';
        document.getElementById('taskMemberSelect').value = task.memberName;
        document.getElementById('taskDateSelect').value = task.dateStr;
        document.getElementById('taskName').value = task.name;
        
        document.getElementById('wageCategory').value = task.wageCategory || 'production';
        if (typeof toggleWageFields === 'function') toggleWageFields();
        
        document.getElementById('taskHours').value = task.hours;
        document.getElementById('hasVehicle').checked = task.hasVehicle || false;
        document.getElementById('commissionAmount').value = task.commissionAmount || '';
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
            const wageCategory = document.getElementById('wageCategory').value;
            const hours = parseFloat(document.getElementById('taskHours').value) || 0;
            const hasVehicle = document.getElementById('hasVehicle').checked;
            const commissionAmount = parseFloat(document.getElementById('commissionAmount').value) || 0;
            const status = document.getElementById('taskStatus').value;
            
            let calculatedCost = 0;
            if (wageCategory === 'production') {
                calculatedCost = hours <= 4 ? 100 : 200;
            } else if (wageCategory === 'delivery') {
                calculatedCost = hasVehicle ? 150 : 50;
            } else if (wageCategory === 'meeting') {
                calculatedCost = commissionAmount;
            }

            const submitData = {
                memberName, dateStr, name, status,
                wageCategory, hours, hasVehicle, commissionAmount, calculatedCost,
                updatedAt: Date.now()
            };

            try {
                if (currentEditingTaskId) {
                    await db.collection('tracker_tasks').doc(currentEditingTaskId).update(submitData);
                    showToast('Log Entry Saved', 'Task updated successfully.', 'success');
                } else {
                    submitData.createdAt = Date.now();
                    submitData.paymentStatus = 'pending'; // New tasks start as Pending
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

    // (Month Navigation Listeners are set up above near other filter listeners)

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
