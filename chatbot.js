/**
 * WorkSync Enterprise - AI Chatbot Assistant
 * Full CRUD Operations Engine for Inventory, Warehouse, and Team Task Tracker
 */

(function () {
    'use strict';

    // ==========================================
    // 1. CHATBOT STATE & CONFIGURATION
    // ==========================================
    const CHATBOT_CONFIG = {
        storageKeyApiKey: 'worksync_ai_gemini_key',
        storageKeyModel: 'worksync_ai_model',
        storageKeyEngine: 'worksync_ai_engine', // 'smart_nlp' or 'gemini_llm'
        storageKeyHistory: 'worksync_ai_chat_history',
        defaultModel: 'gemini-1.5-flash',
    };

    const state = {
        isOpen: false,
        isBusy: false,
        engine: localStorage.getItem(CHATBOT_CONFIG.storageKeyEngine) || 'smart_nlp',
        apiKey: localStorage.getItem(CHATBOT_CONFIG.storageKeyApiKey) || '',
        model: localStorage.getItem(CHATBOT_CONFIG.storageKeyModel) || CHATBOT_CONFIG.defaultModel,
        messages: [],
        pendingAction: null, // For destructive confirm actions
    };

    // Helper: Category metadata lookup
    const CATEGORIES = [
        { id: 'floor_cleaner', name: 'Floor Cleaner', aliases: ['floor cleaner', 'floor', 'surface cleaner'] },
        { id: 'bathroom_cleaner', name: 'Bathroom Cleaner', aliases: ['bathroom cleaner', 'bathroom', 'toilet cleaner'] },
        { id: 'dishwasher', name: 'Dishwasher', aliases: ['dishwasher', 'dish wash', 'dish cleaner', 'utensil cleaner'] },
        { id: 'phenyl', name: 'Phenyl', aliases: ['phenyl', 'phenyle', 'disinfectant'] },
        { id: 'glass_cleaner', name: 'Glass Cleaner', aliases: ['glass cleaner', 'glass', 'colin', 'window cleaner'] },
        { id: 'handwash', name: 'Handwash', aliases: ['handwash', 'hand wash', 'soap'] }
    ];

    function resolveCategory(text) {
        if (!text) return 'Dishwasher';
        const lower = text.toLowerCase().trim();
        for (const cat of CATEGORIES) {
            if (cat.name.toLowerCase() === lower || cat.id.toLowerCase() === lower) return cat.name;
            for (const alias of cat.aliases) {
                if (lower.includes(alias)) return cat.name;
            }
        }
        return text;
    }

    function getCategoryIdByName(catName) {
        const match = CATEGORIES.find(c => c.name.toLowerCase() === catName.toLowerCase() || c.id.toLowerCase() === catName.toLowerCase());
        return match ? match.id : catName.toLowerCase().replace(/\s+/g, '_');
    }

    function getCurrentUser() {
        return localStorage.getItem('currentUser') || 'Admin';
    }

    // ==========================================
    // 2. CORE CHATBOT TOOLS (CRUD Logic)
    // ==========================================
    const ChatbotTools = {
        titleCase(str) {
            if (!str) return '';
            return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        },

        // ----- [CREATE] ADD DELIVERY TASK -----
        async createDeliveryTask(params) {
            const category = resolveCategory(params.category || 'Dishwasher');
            const productName = this.titleCase(params.productName || params.fragrance || 'Standard Formula');
            const clientName = this.titleCase(params.clientName || 'General Client');
            const quantity = parseFloat(params.quantity) || 1;
            const broughtBy = this.titleCase(params.broughtBy || getCurrentUser());
            const purchaser = this.titleCase(params.purchaser || 'Central Warehouse');
            const assignedDelivery = this.titleCase(params.assignedDelivery || params.assignedTo || 'Delivery Team');
            const priority = this.titleCase(params.priority || 'Medium');

            const user = getCurrentUser();

            // Fetch order index
            let order = 100;
            try {
                const snap = await db.collection('inventory').orderBy('order', 'desc').limit(1).get();
                if (!snap.empty) {
                    order = (snap.docs[0].data().order || 100) + 100;
                }
            } catch (e) { console.warn(e); }

            const newTask = {
                category,
                productName,
                clientName,
                quantity,
                broughtBy,
                purchaser,
                assignedDelivery,
                priority,
                status: 'Undelivered',
                addedBy: user,
                image: null,
                order,
                createdAt: Date.now()
            };

            const docRef = await db.collection('inventory').add(newTask);

            // Update warehouse outForDelivery pipeline
            const catId = getCategoryIdByName(category);
            try {
                await db.collection('warehouse').doc(catId).set({
                    outForDelivery: firebase.firestore.FieldValue.increment(quantity),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdatedBy: user
                }, { merge: true });
            } catch (err) {
                console.warn('Warehouse update error on add task:', err);
            }

            return {
                success: true,
                id: docRef.id,
                message: `Successfully created delivery task for **${quantity} units** of **${category}** (${productName}) for client **${clientName}**.`,
                task: { id: docRef.id, ...newTask }
            };
        },

        // ----- [READ] LIST DELIVERY TASKS -----
        async listDeliveryTasks(filter = {}) {
            let query = db.collection('inventory');
            const snap = await query.get();
            let items = [];
            snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

            // In-memory filter
            if (filter.status && filter.status !== 'all') {
                items = items.filter(i => (i.status || '').toLowerCase() === filter.status.toLowerCase());
            }
            if (filter.category) {
                const targetCat = resolveCategory(filter.category).toLowerCase();
                items = items.filter(i => (i.category || '').toLowerCase().includes(targetCat));
            }
            if (filter.client) {
                const targetClient = filter.client.toLowerCase();
                items = items.filter(i => (i.clientName || '').toLowerCase().includes(targetClient));
            }
            if (filter.priority) {
                items = items.filter(i => (i.priority || '').toLowerCase() === filter.priority.toLowerCase());
            }
            if (filter.search) {
                const s = filter.search.toLowerCase();
                items = items.filter(i =>
                    (i.productName || '').toLowerCase().includes(s) ||
                    (i.clientName || '').toLowerCase().includes(s) ||
                    (i.assignedDelivery || '').toLowerCase().includes(s) ||
                    (i.category || '').toLowerCase().includes(s)
                );
            }

            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            return {
                success: true,
                count: items.length,
                items: items.slice(0, 15),
                total: items.length
            };
        },

        // ----- [UPDATE] MARK AS DELIVERED / EDIT TASK -----
        async updateDeliveryTask(params) {
            let taskDoc = null;
            let taskId = params.id;

            if (!taskId && params.query) {
                // Find by client name or product name
                const snap = await db.collection('inventory').get();
                const q = params.query.toLowerCase();
                snap.forEach(doc => {
                    const d = doc.data();
                    if (!taskDoc) {
                        if ((d.clientName && d.clientName.toLowerCase().includes(q)) ||
                            (d.productName && d.productName.toLowerCase().includes(q)) ||
                            (d.category && d.category.toLowerCase().includes(q))) {
                            taskDoc = { id: doc.id, ...d };
                            taskId = doc.id;
                        }
                    }
                });
            } else if (taskId) {
                const doc = await db.collection('inventory').doc(taskId).get();
                if (doc.exists) taskDoc = { id: doc.id, ...doc.data() };
            }

            if (!taskDoc) {
                return { success: false, message: `Could not find any delivery task matching "${params.query || taskId}".` };
            }

            const updates = {};
            const user = getCurrentUser();

            // Mark delivered
            if (params.status === 'Completed' || params.markDelivered) {
                if (taskDoc.status === 'Completed') {
                    return { success: true, message: `Task for **${taskDoc.clientName}** is already marked as Completed.` };
                }
                updates.status = 'Completed';
                await db.collection('inventory').doc(taskId).update(updates);

                // Adjust warehouse stock and outForDelivery
                const catId = getCategoryIdByName(taskDoc.category);
                const qty = parseFloat(taskDoc.quantity) || 0;
                try {
                    await db.collection('warehouse').doc(catId).update({
                        stockRemaining: firebase.firestore.FieldValue.increment(-qty),
                        outForDelivery: firebase.firestore.FieldValue.increment(-qty),
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                        lastUpdatedBy: user
                    });
                } catch (e) { console.warn(e); }

                return {
                    success: true,
                    message: `✅ Task for **${taskDoc.clientName}** (${taskDoc.category} - ${taskDoc.quantity} units) marked as **Completed/Delivered**! Warehouse stock & delivery pipeline updated.`
                };
            }

            // Update priority
            if (params.priority) {
                const prio = params.priority.charAt(0).toUpperCase() + params.priority.slice(1).toLowerCase();
                updates.priority = prio;
            }
            if (params.quantity) updates.quantity = parseFloat(params.quantity);
            if (params.assignedDelivery) updates.assignedDelivery = params.assignedDelivery;

            if (Object.keys(updates).length > 0) {
                await db.collection('inventory').doc(taskId).update(updates);
                return {
                    success: true,
                    message: `Updated task for **${taskDoc.clientName}**: ` + JSON.stringify(updates)
                };
            }

            return { success: false, message: "No valid update parameters provided." };
        },

        // ----- [DELETE] REMOVE DELIVERY TASK -----
        async deleteDeliveryTask(params) {
            let taskDoc = null;
            let taskId = params.id;

            if (!taskId && params.query) {
                const snap = await db.collection('inventory').get();
                const q = params.query.toLowerCase();
                snap.forEach(doc => {
                    const d = doc.data();
                    if (!taskDoc && (
                        (d.clientName && d.clientName.toLowerCase().includes(q)) ||
                        (d.productName && d.productName.toLowerCase().includes(q)) ||
                        (d.category && d.category.toLowerCase().includes(q))
                    )) {
                        taskDoc = { id: doc.id, ...d };
                        taskId = doc.id;
                    }
                });
            } else if (taskId) {
                const doc = await db.collection('inventory').doc(taskId).get();
                if (doc.exists) taskDoc = { id: doc.id, ...doc.data() };
            }

            if (!taskDoc) {
                return { success: false, message: `Could not find delivery task matching "${params.query || taskId}".` };
            }

            // Execute delete
            await db.collection('inventory').doc(taskId).delete();

            // Revert pipeline if not completed
            if (taskDoc.status !== 'Completed') {
                const catId = getCategoryIdByName(taskDoc.category);
                const qty = parseFloat(taskDoc.quantity) || 0;
                try {
                    await db.collection('warehouse').doc(catId).update({
                        outForDelivery: firebase.firestore.FieldValue.increment(-qty),
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                        lastUpdatedBy: getCurrentUser()
                    });
                } catch (e) { console.warn(e); }
            }

            return {
                success: true,
                message: `🗑️ Deleted delivery task for **${taskDoc.clientName}** (${taskDoc.category}, ${taskDoc.quantity} units).`
            };
        },

        // ----- [READ] WAREHOUSE OVERVIEW & STOCK -----
        async getWarehouseStock(params = {}) {
            const snap = await db.collection('warehouse').get();
            const data = {};
            snap.forEach(doc => { data[doc.id] = doc.data(); });

            const results = [];
            const lowStockAlerts = [];

            CATEGORIES.forEach(cat => {
                const w = data[cat.id] || {};
                const stock = w.stockRemaining ?? 0;
                const min = w.minimumStock ?? 10;
                const outDel = w.outForDelivery ?? 0;
                const rawInv = w.rawMaterialsInInventory ?? 0;
                const rawOrd = w.rawMaterialsOrdered ?? 0;
                const prodRate = w.productionRatePerDay ?? 0;
                const isLow = stock <= min;

                const catSummary = {
                    category: cat.name,
                    id: cat.id,
                    stockRemaining: stock,
                    minimumStock: min,
                    outForDelivery: outDel,
                    rawMaterials: rawInv,
                    rawOrdered: rawOrd,
                    dailyProduction: prodRate,
                    isLowStock: isLow
                };

                if (isLow) lowStockAlerts.push(catSummary);
                results.push(catSummary);
            });

            if (params.category) {
                const catId = getCategoryIdByName(resolveCategory(params.category));
                const single = results.find(r => r.id === catId);
                return { success: true, single, lowStockAlerts };
            }

            return {
                success: true,
                categories: results,
                lowStockAlerts,
                hasLowStock: lowStockAlerts.length > 0
            };
        },

        // ----- [UPDATE] SET WAREHOUSE METRIC -----
        async updateWarehouseStock(params) {
            const category = resolveCategory(params.category || 'Dishwasher');
            const catId = getCategoryIdByName(category);
            const field = params.field || 'stockRemaining';
            const value = parseFloat(params.value);

            if (isNaN(value)) {
                return { success: false, message: `Invalid numeric value for field "${field}".` };
            }

            const validFields = ['stockRemaining', 'minimumStock', 'rawMaterialsInInventory', 'rawMaterialsOrdered', 'productionRatePerDay'];
            if (!validFields.includes(field)) {
                return { success: false, message: `Field "${field}" is not a valid warehouse metric. Choose from: ${validFields.join(', ')}.` };
            }

            const updates = {
                [field]: value,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdatedBy: getCurrentUser()
            };

            await db.collection('warehouse').doc(catId).set(updates, { merge: true });

            return {
                success: true,
                message: `✅ Updated **${category}** warehouse metric: **${field}** set to **${value}**.`
            };
        },

        // ----- [UPDATE/INCREMENT] ADD STOCK TO WAREHOUSE -----
        async addWarehouseStock(params) {
            const category = resolveCategory(params.category || 'Dishwasher');
            const catId = getCategoryIdByName(category);
            const quantity = parseFloat(params.quantity || params.amount || params.value) || 0;
            const field = params.field || 'stockRemaining';

            if (quantity <= 0) {
                return { success: false, message: `Please provide a valid positive quantity to add.` };
            }

            await db.collection('warehouse').doc(catId).set({
                [field]: firebase.firestore.FieldValue.increment(quantity),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdatedBy: getCurrentUser()
            }, { merge: true });

            return {
                success: true,
                message: `📦 Added **+${quantity} units** to **${category}** (${field}). Stock updated in database!`
            };
        },

        // ----- [UPDATE/EXCHANGE] STOCK EXCHANGE BETWEEN CATEGORIES -----
        async exchangeStock(params) {
            const fromCategory = resolveCategory(params.fromCategory || 'Floor Cleaner');
            const toCategory = resolveCategory(params.toCategory || 'Dishwasher');
            const quantity = parseFloat(params.quantity || params.amount) || 1;

            if (fromCategory === toCategory) {
                return { success: false, message: `Source and destination categories must be different.` };
            }

            const fromId = getCategoryIdByName(fromCategory);
            const toId = getCategoryIdByName(toCategory);
            const user = getCurrentUser();

            const batch = db.batch();
            const fromRef = db.collection('warehouse').doc(fromId);
            const toRef = db.collection('warehouse').doc(toId);

            batch.set(fromRef, {
                stockRemaining: firebase.firestore.FieldValue.increment(-quantity),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdatedBy: user
            }, { merge: true });

            batch.set(toRef, {
                stockRemaining: firebase.firestore.FieldValue.increment(quantity),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdatedBy: user
            }, { merge: true });

            await batch.commit();

            return {
                success: true,
                message: `🔄 **Exchange Completed**: Transferred **${quantity} units** from **${fromCategory}** to **${toCategory}**.`
            };
        },

        // ----- [CREATE / UPDATE] LOG WORK HOURS (TEAM TRACKER) -----
        async logWorkHours(params) {
            let memberName = (params.memberName || 'Unknown').trim();
            const taskName = (params.taskName || params.name || 'General Task').trim();
            const wageCategory = (params.wageCategory || 'production').toLowerCase();
            const hours = parseFloat(params.hours) || 4;
            const status = (params.status || 'completed').toLowerCase();
            const hasVehicle = params.hasVehicle === true || params.hasVehicle === 'true';
            const commissionAmount = parseFloat(params.commissionAmount) || 0;

            // Ensure member exists — case-insensitive check
            // If exists, adopt the exact casing from the database to keep it consistent
            try {
                const allMems = await db.collection('tracker_members').get();
                const existingMember = allMems.docs.find(
                    d => (d.data().name || '').trim().toLowerCase() === memberName.toLowerCase()
                );
                if (existingMember) {
                    memberName = existingMember.data().name; // Use DB's casing
                } else {
                    await db.collection('tracker_members').add({
                        name: memberName,
                        role: 'Team Member',
                        createdAt: Date.now()
                    });
                }
            } catch (err) {
                console.warn('Auto member add check:', err);
            }

            // Generate dateStr for today (e.g. THU 27)
            const now = new Date();
            const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            const defaultDateStr = `${daysOfWeek[now.getDay()]} ${now.getDate()}`;
            const dateStr = params.dateStr || defaultDateStr;

            // --- UPSERT: check if an entry already exists for this member + date + category ---
            let existingDocId = null;
            let existingHours = 0;
            try {
                const existingSnap = await db.collection('tracker_tasks')
                    .where('memberName', '==', memberName)
                    .where('dateStr', '==', dateStr)
                    .where('wageCategory', '==', wageCategory)
                    .get();
                if (!existingSnap.empty) {
                    existingDocId = existingSnap.docs[0].id;
                    existingHours = parseFloat(existingSnap.docs[0].data().hours) || 0;
                }
            } catch (err) {
                console.warn('Upsert check error:', err);
            }

            // Accumulate hours when updating an existing entry
            const totalHours = existingDocId ? existingHours + hours : hours;

            // Wage calculation based on accumulated total hours
            let calculatedCost = 0;
            if (wageCategory === 'production') {
                calculatedCost = totalHours <= 4 ? 100 : 200;
            } else if (wageCategory === 'delivery') {
                calculatedCost = hasVehicle ? 150 : 50;
            } else if (wageCategory === 'meeting') {
                calculatedCost = commissionAmount;
            }

            if (existingDocId) {
                // UPDATE existing tracker_tasks document
                await db.collection('tracker_tasks').doc(existingDocId).update({
                    hours: totalHours,
                    name: taskName,
                    calculatedCost,
                    updatedAt: Date.now()
                });

                const addedStr = existingHours > 0 ? ` (+${hours}h added to existing ${existingHours}h)` : '';
                return {
                    success: true,
                    id: existingDocId,
                    message: `⏱️ Updated log for **${memberName}** on **${dateStr}**${addedStr}: now **${totalHours}h total** (${wageCategory} — *${taskName}*). Recalculated Wage: **₹${calculatedCost}**.`,
                    log: { id: existingDocId, memberName, dateStr, hours: totalHours, name: taskName, wageCategory, calculatedCost }
                };
            } else {
                // CREATE new tracker_tasks document
                const newLog = {
                    memberName,
                    dateStr,
                    name: taskName,
                    wageCategory,
                    hours,
                    hasVehicle,
                    commissionAmount,
                    calculatedCost,
                    status,
                    paymentStatus: 'pending',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                const docRef = await db.collection('tracker_tasks').add(newLog);

                return {
                    success: true,
                    id: docRef.id,
                    message: `⏱️ Logged **${hours}h** for **${memberName}** on **${dateStr}** (${wageCategory} — *${taskName}*). Calculated Wage: **₹${calculatedCost}**.`,
                    log: { id: docRef.id, ...newLog }
                };
            }
        },

        // ----- [READ] WAGES & TASK LOG SUMMARY -----
        async getWagesSummary(params = {}) {
            const snap = await db.collection('tracker_tasks').get();
            let tasks = [];
            snap.forEach(doc => tasks.push({ id: doc.id, ...doc.data() }));

            if (params.memberName && params.memberName !== 'all') {
                tasks = tasks.filter(t => (t.memberName || '').toLowerCase() === params.memberName.toLowerCase());
            }

            let totalWages = 0;
            let totalHours = 0;
            let countProduction = 0;
            let countDelivery = 0;
            let countMeeting = 0;

            const memberBreakdown = {};

            tasks.forEach(t => {
                let cost = parseFloat(t.calculatedCost);
                if (isNaN(cost)) {
                    if (t.wageCategory === 'production') cost = t.hours <= 4 ? 100 : 200;
                    else if (t.wageCategory === 'delivery') cost = t.hasVehicle ? 150 : 50;
                    else if (t.wageCategory === 'meeting') cost = parseFloat(t.commissionAmount) || 0;
                    else cost = 0;
                }
                const h = parseFloat(t.hours) || 0;
                totalWages += cost;
                totalHours += h;

                if (t.wageCategory === 'production') countProduction += cost;
                else if (t.wageCategory === 'delivery') countDelivery += cost;
                else if (t.wageCategory === 'meeting') countMeeting += cost;

                const m = t.memberName || 'Unknown';
                if (!memberBreakdown[m]) memberBreakdown[m] = { name: m, hours: 0, wages: 0, tasks: 0 };
                memberBreakdown[m].hours += h;
                memberBreakdown[m].wages += cost;
                memberBreakdown[m].tasks += 1;
            });

            return {
                success: true,
                totalWages,
                totalHours,
                taskCount: tasks.length,
                productionWages: countProduction,
                deliveryWages: countDelivery,
                meetingWages: countMeeting,
                members: Object.values(memberBreakdown),
                recentLogs: tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5)
            };
        },

        // ----- [CREATE] ADD TEAM MEMBER -----
        async addTeamMember(params) {
            const name = params.name;
            const role = params.role || 'Production Staff';
            if (!name) return { success: false, message: 'Please specify the member name.' };

            const docRef = await db.collection('tracker_members').add({
                name,
                role,
                createdAt: Date.now()
            });

            return {
                success: true,
                message: `👤 Added **${name}** (${role}) to the team directory.`
            };
        },

        // ----- [READ] LIST TEAM MEMBERS -----
        async listTeamMembers() {
            const snap = await db.collection('tracker_members').orderBy('createdAt', 'asc').get();
            const members = [];
            snap.forEach(doc => members.push({ id: doc.id, ...doc.data() }));
            return {
                success: true,
                count: members.length,
                members
            };
        }
    };

    // ==========================================
    // 3. SMART BUILT-IN NLP INTENT PARSER
    // ==========================================
    const SmartNLP = {
        async process(userInput) {
            const text = userInput.trim();
            const lower = text.toLowerCase();

            // --- INTENT 6A: ADD / INCREMENT WAREHOUSE STOCK ---
            // Must come BEFORE delivery task intent to avoid "Add 50 stock to Floor Cleaner" being mis-routed
            // e.g. "Add 50 stock to Floor Cleaner" or "Increase stock of Phenyl by 25" or "Restock dishwasher 30"
            if ((lower.includes('add') || lower.includes('increase') || lower.includes('restock')) &&
                (lower.includes('stock') || lower.includes('raw material'))) {

                let category = 'Floor Cleaner';
                for (const cat of CATEGORIES) {
                    for (const a of cat.aliases) {
                        if (lower.includes(a)) { category = cat.name; break; }
                    }
                }

                let field = 'stockRemaining';
                if (lower.includes('raw') || lower.includes('material')) field = 'rawMaterialsInInventory';

                let quantity = 10;
                const qtyMatch6a = text.match(/(\d+(\.\d+)?)\s*(units?|qty|boxes?|bottles?)?/i);
                if (qtyMatch6a) quantity = parseFloat(qtyMatch6a[1]);

                const res = await ChatbotTools.addWarehouseStock({ category, quantity, field });
                return { text: res.message };
            }

            // --- INTENT 6B: STOCK EXCHANGE BETWEEN CATEGORIES ---
            // e.g. "Exchange 20 Dishwasher for Floor Cleaner" or "Swap 15 Floor Cleaner with Phenyl"
            if (lower.includes('exchange') || lower.includes('swap') || lower.includes('transfer stock')) {
                let quantity = 10;
                const qtyMatch6b = text.match(/(\d+(\.\d+)?)\s*(units?|qty|boxes?|bottles?)?/i);
                if (qtyMatch6b) quantity = parseFloat(qtyMatch6b[1]);

                const foundCats = [];
                for (const cat of CATEGORIES) {
                    for (const a of cat.aliases) {
                        if (lower.includes(a) && !foundCats.includes(cat.name)) {
                            foundCats.push(cat.name);
                            break;
                        }
                    }
                }

                let fromCategory = foundCats[0] || 'Floor Cleaner';
                let toCategory = foundCats[1] || 'Dishwasher';

                if (foundCats.length < 2) {
                    const splitMatch = text.match(/(?:exchange|swap|transfer)\s+(?:\d+\s+)?([a-zA-Z\s]+?)\s+(?:for|to|with|into)\s+([a-zA-Z\s]+)/i);
                    if (splitMatch) {
                        fromCategory = resolveCategory(splitMatch[1].trim());
                        toCategory = resolveCategory(splitMatch[2].trim());
                    }
                }

                const res = await ChatbotTools.exchangeStock({ fromCategory, toCategory, quantity });
                return { text: res.message };
            }

            // --- INTENT 6C: UPDATE/SET WAREHOUSE METRIC ---
            if ((lower.includes('update') || lower.includes('set')) &&
                (lower.includes('stock') || lower.includes('threshold') || lower.includes('minimum') || lower.includes('raw material') || lower.includes('production rate'))) {

                let category = 'Floor Cleaner';
                for (const cat of CATEGORIES) {
                    for (const a of cat.aliases) {
                        if (lower.includes(a)) { category = cat.name; break; }
                    }
                }

                let field = 'stockRemaining';
                if (lower.includes('threshold') || lower.includes('minimum') || lower.includes('min')) field = 'minimumStock';
                else if (lower.includes('raw') || lower.includes('material')) field = 'rawMaterialsInInventory';
                else if (lower.includes('daily') || lower.includes('rate') || lower.includes('production rate')) field = 'productionRatePerDay';

                const valMatch6c = text.match(/to\s+(\d+(\.\d+)?)|(?:is|set)\s+(\d+(\.\d+)?)|(\d+(\.\d+)?)\s*(?:units)?$/i);
                let value6c = null;
                if (valMatch6c) value6c = parseFloat(valMatch6c[1] || valMatch6c[3] || valMatch6c[5]);

                if (value6c === null || isNaN(value6c)) {
                    return { text: `Please specify the number to set for ${category}. (e.g. *"Update ${category} stock to 100"*).` };
                }

                const res = await ChatbotTools.updateWarehouseStock({ category, field, value: value6c });
                return { text: res.message };
            }

            // --- INTENT 1: CREATE DELIVERY TASK ---
            if (lower.startsWith('add delivery') || lower.startsWith('create delivery') ||
                lower.startsWith('add task') || lower.startsWith('create task') ||
                (lower.startsWith('add ') && (lower.includes('for client') || lower.includes('units') || lower.includes('cleaner') || lower.includes('dishwasher') || lower.includes('phenyl') || lower.includes('handwash')))) {

                // Extract quantity
                let quantity = 1;
                const qtyMatch = text.match(/(\d+(\.\d+)?)\s*(units?|bottles?|boxes?|qty|pieces?)?/i);
                if (qtyMatch) quantity = parseFloat(qtyMatch[1]);

                // Extract Category
                let category = 'Dishwasher';
                for (const cat of CATEGORIES) {
                    for (const a of cat.aliases) {
                        if (lower.includes(a)) {
                            category = cat.name;
                            break;
                        }
                    }
                }

                // Extract Fragrance / Product Name
                let productName = 'Standard Formula';
                const fragMatch = text.match(/fragrance\s+([a-zA-Z0-9\s]+?)(?=\s+(for|assigned|priority|client|qty|$))/i) ||
                                  text.match(/product\s+([a-zA-Z0-9\s]+?)(?=\s+(for|assigned|priority|client|qty|$))/i);
                if (fragMatch) productName = fragMatch[1].trim();

                // Extract Client
                let clientName = 'General Client';
                const clientMatch = text.match(/(?:for\s+client|client|to\s+client|customer|for)\s+([a-zA-Z0-9\s\.\,\-\&]+?)(?=\s+(?:assigned|priority|fragrance|brought|from|by|$))/i);
                if (clientMatch) {
                    clientName = clientMatch[1].replace(/^(for\s+client|client|for)\s+/i, '').trim();
                }

                // Extract Assigned Delivery
                let assignedDelivery = 'Delivery Team';
                const assignMatch = text.match(/assigned\s+(?:to\s+)?([a-zA-Z0-9\s]+?)(?=\s+(?:priority|client|fragrance|$))/i);
                if (assignMatch) assignedDelivery = assignMatch[1].trim();

                // Extract Priority
                let priority = 'Medium';
                if (lower.includes('high priority') || lower.includes('priority high')) priority = 'High';
                else if (lower.includes('low priority') || lower.includes('priority low')) priority = 'Low';

                const res = await ChatbotTools.createDeliveryTask({
                    category,
                    productName,
                    clientName,
                    quantity,
                    assignedDelivery,
                    priority
                });

                return {
                    text: res.message,
                    cardType: 'task_created',
                    cardData: res.task
                };
            }

            // --- INTENT 2: COMPLETE / MARK DELIVERED ---
            if (lower.includes('mark delivered') || lower.includes('mark as delivered') || lower.includes('mark completed') || lower.includes('complete delivery') || lower.includes('deliver task')) {
                const targetQuery = text.replace(/mark\s+(?:as\s+)?(?:delivered|completed)|complete\s+delivery|deliver\s+task|for\s+client|for|task/gi, '').trim();
                const res = await ChatbotTools.updateDeliveryTask({
                    query: targetQuery,
                    markDelivered: true
                });
                return { text: res.message };
            }

            // --- INTENT 3: DELETE DELIVERY TASK (WITH CONFIRMATION) ---
            if (lower.startsWith('delete delivery') || lower.startsWith('remove delivery') || lower.startsWith('delete task') || lower.startsWith('remove task')) {
                const targetQuery = text.replace(/delete\s+(?:delivery|task)|remove\s+(?:delivery|task)|for\s+client|for/gi, '').trim();
                if (!targetQuery) {
                    return { text: 'Please specify which task or client name to delete.' };
                }

                // Stage for confirmation
                return {
                    text: `⚠️ Are you sure you want to delete the delivery task matching **"${targetQuery}"**?`,
                    requiresConfirmation: true,
                    actionPayload: {
                        type: 'delete_delivery',
                        query: targetQuery
                    }
                };
            }

            // --- INTENT 4: LIST DELIVERY TASKS ---
            if (lower.includes('list deliveries') || lower.includes('show deliveries') || lower.includes('active deliveries') || lower.includes('undelivered') || lower.includes('delivery tasks') || lower.includes('what is out for delivery')) {
                let status = 'all';
                if (lower.includes('undelivered') || lower.includes('active') || lower.includes('pending') || lower.includes('out for delivery')) {
                    status = 'Undelivered';
                } else if (lower.includes('completed') || lower.includes('delivered')) {
                    status = 'Completed';
                }

                const res = await ChatbotTools.listDeliveryTasks({ status });
                if (res.items.length === 0) {
                    return { text: `📦 No ${status !== 'all' ? status : ''} delivery tasks found in the system.` };
                }

                let textResp = `📦 **Found ${res.count} Delivery Tasks (${status}):**\n\n`;
                res.items.slice(0, 6).forEach((item, idx) => {
                    const stBadge = item.status === 'Completed' ? '✅ Done' : '⏳ LIVE';
                    textResp += `${idx + 1}. **${item.clientName}** — ${item.category} (${item.quantity} units) | Priority: *${item.priority || 'Med'}* | ${stBadge}\n`;
                });
                if (res.items.length > 6) {
                    textResp += `\n*...and ${res.items.length - 6} more visible on your dashboard table.*`;
                }

                return {
                    text: textResp,
                    cardType: 'task_list',
                    items: res.items.slice(0, 6)
                };
            }

            // --- INTENT 5: WAREHOUSE STOCK STATUS & LOW STOCK ALERTS ---
            if (lower.includes('warehouse stock') || lower.includes('check stock') || lower.includes('stock status') || lower.includes('low stock') || lower.includes('warehouse status') || lower.includes('inventory status')) {
                const res = await ChatbotTools.getWarehouseStock();
                let textResp = `📊 **Warehouse Inventory Status:**\n\n`;

                res.categories.forEach(c => {
                    const alertDot = c.isLowStock ? '🔴 **LOW**' : '🟢 Good';
                    textResp += `• **${c.category}**: **${c.stockRemaining} units** available (Min: ${c.minimumStock}) | Delivery: ${c.outForDelivery} | ${alertDot}\n`;
                });

                if (res.hasLowStock) {
                    textResp += `\n⚠️ **Low Stock Warning:** ${res.lowStockAlerts.map(a => a.category).join(', ')} require restocking!`;
                }

                return {
                    text: textResp,
                    cardType: 'warehouse_overview',
                    categories: res.categories
                };
            }

            // (Intents 6A, 6B, 6C moved to top of SmartNLP.process for correct routing priority)

            // --- INTENT 7: LOG WORK HOURS (TEAM TRACKER) ---
            if (lower.startsWith('log ') || lower.includes('log hours') || lower.includes('log work') ||
                lower.includes('add log') || lower.includes('log task') || lower.includes('hours to ') || lower.includes('hours for ')) {

                let hours = 4;
                const hoursMatch = text.match(/(\d+(\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
                if (hoursMatch) hours = parseFloat(hoursMatch[1]);

                // Member name: capture only the SINGLE word immediately after "for" or "to"
                // (multi-word greedy match was creating names like "Aalok with task Chemical Formulation")
                let memberName = 'Unknown';
                const SKIP_WORDS = new Set(['hours', 'hrs', 'log', 'task', 'production', 'delivery',
                    'meeting', 'the', 'work', 'add', 'with', 'a', 'an', 'some', 'my', 'his', 'her']);

                // Match exactly one word after "for" or "to"
                const memMatchPrimary = text.match(/\b(?:for|to)\s+([A-Za-z]+)/i);
                if (memMatchPrimary) {
                    const candidate = memMatchPrimary[1].trim();
                    if (!SKIP_WORDS.has(candidate.toLowerCase())) {
                        memberName = candidate;
                    }
                }

                // Fallback: last valid word not in skip list (case insensitive)
                if (memberName === 'Unknown') {
                    const words = text.split(/\s+/);
                    for (let i = words.length - 1; i >= 0; i--) {
                        const w = words[i].replace(/[^a-zA-Z]/g, '');
                        if (w.length > 1 && !SKIP_WORDS.has(w.toLowerCase())) {
                            memberName = w;
                            break;
                        }
                    }
                }


                let wageCategory = 'production';
                if (lower.includes('delivery')) wageCategory = 'delivery';
                else if (lower.includes('meeting') || lower.includes('client meet')) wageCategory = 'meeting';
                else if (lower.includes('other')) wageCategory = 'others';

                let hasVehicle = lower.includes('vehicle') || lower.includes('bike') || lower.includes('car');

                // --- Task name extraction (priority order) ---
                let taskName = null;

                // 1. Explicit: "with task <name>" or "task name: <name>"
                const explicitTaskMatch = text.match(/(?:with\s+task|doing)\s+([a-zA-Z0-9][a-zA-Z0-9\s]{1,50}?)(?:\s+(?:for|to|on|hours?|$)|$)/i);
                if (explicitTaskMatch) {
                    taskName = explicitTaskMatch[1].trim();
                }

                // 2. Inline word between "hours" and "for": "Log 5 hours test for Aalok"
                //    Captures any non-keyword word(s) sitting between the hours value and "for <name>"
                if (!taskName) {
                    const inlineTaskMatch = text.match(/(?:hours?|hrs?)\s+([a-zA-Z][a-zA-Z0-9\s]{0,40}?)\s+(?:for|to)\s+[a-zA-Z]/i);
                    if (inlineTaskMatch) {
                        const candidate = inlineTaskMatch[1].trim();
                        const CATEGORY_WORDS = new Set(['production', 'delivery', 'meeting', 'others', 'other']);
                        if (candidate && !CATEGORY_WORDS.has(candidate.toLowerCase())) {
                            taskName = candidate;
                        }
                    }
                }

                // 3. Fallback: use the wage category as the task label
                if (!taskName) {
                    taskName = `${wageCategory.charAt(0).toUpperCase() + wageCategory.slice(1)} Task`;
                }

                const res = await ChatbotTools.logWorkHours({
                    memberName,
                    taskName,
                    hours,
                    wageCategory,
                    hasVehicle
                });

                return {
                    text: res.message,
                    cardType: 'work_logged',
                    cardData: res.log
                };
            }

            // --- INTENT 8: WAGES & HOURS REPORT ---
            if (lower.includes('wages') || lower.includes('salary') || lower.includes('total wages') || lower.includes('wage report')) {
                let memberName = 'all';
                const memMatch = text.match(/for\s+([a-zA-Z]+)/i);
                if (memMatch) memberName = memMatch[1];

                const res = await ChatbotTools.getWagesSummary({ memberName });

                let textResp = `💰 **Wages & Hours Summary${memberName !== 'all' ? ` for ${memberName}` : ''}:**\n\n`;
                textResp += `• **Total Wages**: ₹${res.totalWages.toFixed(2)}\n`;
                textResp += `• **Total Hours Logged**: ${res.totalHours.toFixed(1)} hrs\n`;
                textResp += `• **Total Tasks**: ${res.taskCount}\n\n`;
                textResp += `**Breakdown by Category:**\n`;
                textResp += `- Production: ₹${res.productionWages.toFixed(2)}\n`;
                textResp += `- Delivery: ₹${res.deliveryWages.toFixed(2)}\n`;
                textResp += `- Client Meetings: ₹${res.meetingWages.toFixed(2)}\n`;

                return { text: textResp };
            }

            // --- INTENT 9: ADD TEAM MEMBER ---
            if (lower.startsWith('add team member') || lower.startsWith('add member') || lower.startsWith('new member')) {
                const clean = text.replace(/add\s+(?:team\s+)?member|new\s+member/gi, '').trim();
                const parts = clean.split(/\s+(?:as|role)\s+/i);
                const name = parts[0]?.trim();
                const role = parts[1]?.trim() || 'Team Member';

                if (!name) return { text: 'Please specify the name of the new member. (e.g. *"Add member Alex as Warehouse Manager"*).' };

                const res = await ChatbotTools.addTeamMember({ name, role });
                return { text: res.message };
            }

            // --- INTENT 10: HELP / CAPABILITIES ---
            if (lower === 'help' || lower.includes('what can you do') || lower.includes('commands') || lower.includes('capabilities')) {
                const helpText = `🤖 **WorkSync AI Assistant Capabilities (CRUD):**\n\n` +
                    `📦 **Inventory & Delivery Tasks:**\n` +
                    `• *"Add 50 Dishwasher for client Stark Corp assigned to Mike priority High"*\n` +
                    `• *"Show all active delivery tasks"*\n` +
                    `• *"Mark delivery for Stark Corp as completed"*\n` +
                    `• *"Delete delivery task for Stark Corp"*\n\n` +
                    `📊 **Warehouse Stock:**\n` +
                    `• *"Check warehouse stock status"*\n` +
                    `• *"Update floor cleaner stock to 150"*\n` +
                    `• *"Set dishwasher minimum threshold to 20"*\n\n` +
                    `⏱️ **Team Task Tracker & Wages:**\n` +
                    `• *"Log 4 hours production for Sarah with task Mixing"*\n` +
                    `• *"Log delivery for Mike 2 hours with vehicle"*\n` +
                    `• *"Show total wages report"*\n` +
                    `• *"Add team member David as Logistics Lead"*`;
                return { text: helpText };
            }

            // Fallback for Smart NLP
            return {
                text: `I understood you said: *"^${text}"*.\n\nI can perform any CRUD operations on deliveries, warehouse stock, and wages. Type **"help"** or click one of the quick suggestions below!`
            };
        }
    };

    // ==========================================
    // 4. GEMINI API LLM AGENTIC ENGINE (OPTIONAL)
    // ==========================================
    const GeminiLLM = {
        toolDeclarations: [
            {
                name: 'createDeliveryTask',
                description: 'Creates a new delivery task in the inventory system.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        category: { type: 'STRING', description: 'Category: Floor Cleaner, Bathroom Cleaner, Dishwasher, Phenyl, Glass Cleaner, Handwash' },
                        productName: { type: 'STRING', description: 'Fragrance or formula name' },
                        clientName: { type: 'STRING', description: 'Name of the client receiving delivery' },
                        quantity: { type: 'NUMBER', description: 'Quantity units delivered' },
                        assignedDelivery: { type: 'STRING', description: 'Person assigned for delivery' },
                        priority: { type: 'STRING', enum: ['Low', 'Medium', 'High'], description: 'Task priority' }
                    },
                    required: ['category', 'clientName', 'quantity']
                }
            },
            {
                name: 'listDeliveryTasks',
                description: 'Lists delivery tasks filtered by status, category, client, or priority.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        status: { type: 'STRING', enum: ['all', 'Undelivered', 'Completed'] },
                        category: { type: 'STRING' },
                        client: { type: 'STRING' }
                    }
                }
            },
            {
                name: 'updateDeliveryTask',
                description: 'Marks a delivery task as completed/delivered or updates its details.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        query: { type: 'STRING', description: 'Client name or product name to search and update' },
                        status: { type: 'STRING', enum: ['Completed', 'Undelivered'] },
                        markDelivered: { type: 'BOOLEAN' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'deleteDeliveryTask',
                description: 'Deletes a delivery task by client or query.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        query: { type: 'STRING', description: 'Client or task name to delete' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'getWarehouseStock',
                description: 'Gets current warehouse inventory levels, thresholds, and low-stock alerts.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        category: { type: 'STRING', description: 'Optional specific category' }
                    }
                }
            },
            {
                name: 'updateWarehouseStock',
                description: 'Updates a warehouse stock metric (stockRemaining, minimumStock, rawMaterialsInInventory, etc.).',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        category: { type: 'STRING', description: 'Product category' },
                        field: { type: 'STRING', enum: ['stockRemaining', 'minimumStock', 'rawMaterialsInInventory', 'rawMaterialsOrdered', 'productionRatePerDay'] },
                        value: { type: 'NUMBER', description: 'New numerical value' }
                    },
                    required: ['category', 'field', 'value']
                }
            },
            {
                name: 'logWorkHours',
                description: 'Logs work hours and task for a team member into Team Performance Hub with automated wage formula calculation.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        memberName: { type: 'STRING', description: 'Name of the team member' },
                        taskName: { type: 'STRING', description: 'Task description' },
                        hours: { type: 'NUMBER', description: 'Number of hours worked' },
                        wageCategory: { type: 'STRING', enum: ['production', 'delivery', 'meeting', 'others'] },
                        hasVehicle: { type: 'BOOLEAN', description: 'Whether personal vehicle was used (for delivery)' }
                    },
                    required: ['memberName', 'hours', 'wageCategory']
                }
            },
            {
                name: 'getWagesSummary',
                description: 'Retrieves wage calculations, total hours, and category breakdown for team members.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        memberName: { type: 'STRING', description: 'Optional member name or "all"' }
                    }
                }
            }
        ],

        async process(userInput) {
            if (!state.apiKey) {
                return { text: '🔑 Please configure your Gemini API Key in the Chatbot settings, or switch back to the Built-in Smart NLP Engine.' };
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${state.apiKey}`;

            const systemInstruction = {
                role: 'user',
                parts: [{
                    text: 'You are the WorkSync Enterprise AI Assistant. You help warehouse managers manage inventory, create/update/delete delivery tasks, monitor warehouse stock, and log work hours with wages. Always use the available tools when asked to create, read, update, or delete data.'
                }]
            };

            const payload = {
                contents: [
                    systemInstruction,
                    { role: 'user', parts: [{ text: userInput }] }
                ],
                tools: [{ functionDeclarations: this.toolDeclarations }]
            };

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.error('Gemini API Error:', errText);
                    return { text: `Gemini API returned error (${response.status}). Falling back to local engine:\n\n` + (await SmartNLP.process(userInput)).text };
                }

                const result = await response.json();
                const candidate = result.candidates?.[0];
                if (!candidate) return { text: 'No response from Gemini.' };

                const part = candidate.content?.parts?.[0];

                // If model requested tool calls
                if (part?.functionCall) {
                    const call = part.functionCall;
                    const toolName = call.name;
                    const args = call.args || {};

                    if (typeof ChatbotTools[toolName] === 'function') {
                        const toolResult = await ChatbotTools[toolName](args);
                        return {
                            text: toolResult.message || `Executed ${toolName} successfully.`,
                            toolCall: { name: toolName, args, result: toolResult }
                        };
                    }
                }

                return { text: part?.text || 'Operation completed.' };
            } catch (e) {
                console.error('Gemini Exception:', e);
                return { text: `Error connecting to Gemini: ${e.message}. Using Smart NLP fallback:\n\n` + (await SmartNLP.process(userInput)).text };
            }
        }
    };

    // ==========================================
    // 5. CHATBOT UI CONTROLLER & RENDERING
    // ==========================================
    const ChatbotUI = {
        init() {
            this.injectHTML();
            this.bindEvents();
            this.renderWelcome();
        },

        injectHTML() {
            if (document.getElementById('chatbotWrapper')) return;

            const html = `
            <!-- Chatbot Floating Launcher -->
            <div id="chatbotFloatingBtn" class="chatbot-floating-btn" title="WorkSync AI Assistant">
                <div class="chatbot-btn-pulse"></div>
                <div class="chatbot-btn-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 8V4H8"></path>
                        <rect width="16" height="12" x="4" y="8" rx="2"></rect>
                        <path d="M2 14h2"></path>
                        <path d="M20 14h2"></path>
                        <path d="M15 13v2"></path>
                        <path d="M9 13v2"></path>
                    </svg>
                </div>
                <span class="chatbot-btn-label">AI Bot</span>
                <span id="chatbotUnreadBadge" class="chatbot-unread-badge" style="display:none;">1</span>
            </div>

            <!-- Chatbot Panel Container -->
            <div id="chatbotPanel" class="chatbot-panel" style="display:none;">
                <!-- Header -->
                <div class="chatbot-header">
                    <div class="chatbot-header-info">
                        <div class="chatbot-avatar">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                            </svg>
                        </div>
                        <div>
                            <div class="chatbot-title">
                                WorkSync AI
                                <span class="chatbot-status-pill"><span class="chatbot-status-dot"></span>Online</span>
                            </div>
                            <div class="chatbot-subtitle" id="chatbotEngineLabel">Smart NLU • CRUD Ready</div>
                        </div>
                    </div>
                    <div class="chatbot-header-actions">
                        <button id="chatbotSettingsBtn" class="chatbot-header-btn" title="Model & API Settings">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        </button>
                        <button id="chatbotClearBtn" class="chatbot-header-btn" title="Clear Chat History">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        </button>
                        <button id="chatbotCloseBtn" class="chatbot-header-btn" title="Minimize Chat">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>

                <!-- Messages Body -->
                <div id="chatbotMessages" class="chatbot-messages"></div>

                <!-- Quick Action Chips -->
                <div id="chatbotChips" class="chatbot-chips-container">
                    <button class="chatbot-chip" data-query="Check warehouse stock status">📊 Stock Status</button>
                    <button class="chatbot-chip" data-query="Show active delivery tasks">📦 Deliveries</button>
                    <button class="chatbot-chip" data-query="Add 20 Dishwasher for client Stark Corp priority High">➕ Add Delivery</button>
                    <button class="chatbot-chip" data-query="Show wages report">💰 Wages Report</button>
                    <button class="chatbot-chip" data-query="Help">❓ Help</button>
                </div>

                <!-- Input Footer -->
                <form id="chatbotForm" class="chatbot-input-form">
                    <input type="text" id="chatbotInput" class="chatbot-input" placeholder="Ask AI to add tasks, update stock, check wages..." autocomplete="off">
                    <button type="submit" id="chatbotSendBtn" class="chatbot-send-btn" title="Send Command">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </form>
            </div>

            <!-- Chatbot Settings Modal -->
            <div id="chatbotSettingsModal" class="modal" style="display:none;">
                <div class="modal-content" style="max-width: 480px;">
                    <span class="close-btn" id="closeChatbotSettingsModal">&times;</span>
                    <h2>AI Assistant Settings</h2>
                    <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1.5rem;">
                        WorkSync AI features a zero-setup <b>Smart Built-in NLP Engine</b> and an optional <b>Google Gemini LLM Engine</b> for complex natural conversation.
                    </p>
                    <form id="chatbotSettingsForm">
                        <div class="form-group">
                            <label for="aiEngineSelect">Execution Engine</label>
                            <select id="aiEngineSelect" style="width:100%;padding:0.75rem;background-color:var(--bg-color);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:0.95rem;">
                                <option value="smart_nlp">⚡ Built-in Smart NLP Engine (Instant, Offline, No Keys)</option>
                                <option value="gemini_llm">✨ Google Gemini LLM (Full Conversational Agent)</option>
                            </select>
                        </div>
                        <div class="form-group" id="geminiKeyGroup" style="display:none;">
                            <label for="geminiApiKeyInput">Google Gemini API Key</label>
                            <input type="password" id="geminiApiKeyInput" placeholder="AIzaSy..." style="width:100%;padding:0.75rem;background-color:var(--bg-color);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:0.95rem;">
                            <small style="color:var(--text-secondary);display:block;margin-top:0.35rem;">Your API key is securely saved locally in your browser storage.</small>
                        </div>
                        <div style="display:flex;gap:1rem;margin-top:1.5rem;">
                            <button type="submit" class="btn-primary" style="flex:1;">Save Settings</button>
                            <button type="button" class="btn-secondary" id="cancelChatbotSettingsBtn" style="flex:1;">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
            `;

            const wrapper = document.createElement('div');
            wrapper.id = 'chatbotWrapper';
            wrapper.innerHTML = html;
            document.body.appendChild(wrapper);
        },

        bindEvents() {
            const fab = document.getElementById('chatbotFloatingBtn');
            const panel = document.getElementById('chatbotPanel');
            const closeBtn = document.getElementById('chatbotCloseBtn');
            const clearBtn = document.getElementById('chatbotClearBtn');
            const settingsBtn = document.getElementById('chatbotSettingsBtn');
            const form = document.getElementById('chatbotForm');
            const input = document.getElementById('chatbotInput');
            const chips = document.getElementById('chatbotChips');

            const settingsModal = document.getElementById('chatbotSettingsModal');
            const closeSettingsBtn = document.getElementById('closeChatbotSettingsModal');
            const cancelSettingsBtn = document.getElementById('cancelChatbotSettingsBtn');
            const settingsForm = document.getElementById('chatbotSettingsForm');
            const engineSelect = document.getElementById('aiEngineSelect');
            const keyGroup = document.getElementById('geminiKeyGroup');
            const keyInput = document.getElementById('geminiApiKeyInput');

            // Toggle open / close
            fab?.addEventListener('click', () => this.toggleChat());
            closeBtn?.addEventListener('click', () => this.toggleChat(false));

            // Clear chat
            clearBtn?.addEventListener('click', () => {
                state.messages = [];
                state.pendingAction = null;
                const container = document.getElementById('chatbotMessages');
                if (container) container.innerHTML = '';
                this.renderWelcome();
            });

            // Settings Modal
            settingsBtn?.addEventListener('click', () => {
                if (engineSelect) engineSelect.value = state.engine;
                if (keyInput) keyInput.value = state.apiKey;
                if (keyGroup) keyGroup.style.display = state.engine === 'gemini_llm' ? 'block' : 'none';
                if (settingsModal) settingsModal.style.display = 'flex';
            });

            engineSelect?.addEventListener('change', (e) => {
                if (keyGroup) keyGroup.style.display = e.target.value === 'gemini_llm' ? 'block' : 'none';
            });

            closeSettingsBtn?.addEventListener('click', () => { if (settingsModal) settingsModal.style.display = 'none'; });
            cancelSettingsBtn?.addEventListener('click', () => { if (settingsModal) settingsModal.style.display = 'none'; });

            settingsForm?.addEventListener('submit', (e) => {
                e.preventDefault();
                state.engine = engineSelect.value;
                state.apiKey = keyInput.value.trim();
                localStorage.setItem(CHATBOT_CONFIG.storageKeyEngine, state.engine);
                localStorage.setItem(CHATBOT_CONFIG.storageKeyApiKey, state.apiKey);

                const engineLabel = document.getElementById('chatbotEngineLabel');
                if (engineLabel) {
                    engineLabel.textContent = state.engine === 'gemini_llm' ? 'Gemini LLM • Agentic Mode' : 'Smart NLU • CRUD Ready';
                }

                if (settingsModal) settingsModal.style.display = 'none';
                this.addMessage('assistant', `⚙️ Engine updated to **${state.engine === 'gemini_llm' ? 'Google Gemini LLM' : 'Built-in Smart NLP'}**.`);
            });

            // Quick suggestion chips
            chips?.addEventListener('click', (e) => {
                const btn = e.target.closest('.chatbot-chip');
                if (btn && btn.dataset.query) {
                    input.value = btn.dataset.query;
                    form.dispatchEvent(new Event('submit'));
                }
            });

            // Form Submit (User send message)
            form?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const query = input.value.trim();
                if (!query || state.isBusy) return;

                input.value = '';
                this.addMessage('user', query);

                // Process pending confirmation if answering yes/no
                if (state.pendingAction) {
                    const lowerQ = query.toLowerCase();
                    if (lowerQ === 'yes' || lowerQ === 'confirm' || lowerQ === 'y' || lowerQ === 'ok') {
                        const payload = state.pendingAction;
                        state.pendingAction = null;
                        await this.executeConfirmedAction(payload);
                        return;
                    } else if (lowerQ === 'no' || lowerQ === 'cancel' || lowerQ === 'n') {
                        state.pendingAction = null;
                        this.addMessage('assistant', 'Action cancelled.');
                        return;
                    }
                }

                // Normal execution
                state.isBusy = true;
                this.showTypingIndicator();

                try {
                    let response;
                    if (state.engine === 'gemini_llm' && state.apiKey) {
                        response = await GeminiLLM.process(query);
                    } else {
                        response = await SmartNLP.process(query);
                    }

                    this.hideTypingIndicator();

                    if (response.requiresConfirmation && response.actionPayload) {
                        state.pendingAction = response.actionPayload;
                        this.renderConfirmationCard(response.text, response.actionPayload);
                    } else {
                        this.addMessage('assistant', response.text, {
                            cardType: response.cardType,
                            cardData: response.cardData || response.items || response.categories
                        });
                    }
                } catch (err) {
                    console.error('Chatbot Processing Error:', err);
                    this.hideTypingIndicator();
                    this.addMessage('assistant', `⚠️ Sorry, I encountered an error: ${err.message}`);
                } finally {
                    state.isBusy = false;
                }
            });
        },

        toggleChat(force) {
            state.isOpen = typeof force === 'boolean' ? force : !state.isOpen;
            const panel = document.getElementById('chatbotPanel');
            const badge = document.getElementById('chatbotUnreadBadge');
            if (panel) {
                panel.style.display = state.isOpen ? 'flex' : 'none';
                if (state.isOpen) {
                    if (badge) badge.style.display = 'none';
                    const input = document.getElementById('chatbotInput');
                    if (input) setTimeout(() => input.focus(), 150);
                    this.scrollToBottom();
                }
            }
        },

        renderWelcome() {
            const user = getCurrentUser();
            const welcomeText = `👋 Hello **${user}**! I am your **WorkSync AI Assistant**.\n\nI can execute live **CRUD operations** directly on your database:\n• Create and assign delivery tasks\n• Check and adjust warehouse stock & thresholds\n• Log work hours & calculate wages\n• Query active tasks and team stats\n\nHow can I help you today?`;
            this.addMessage('assistant', welcomeText);
        },

        addMessage(role, text, extra = {}) {
            const container = document.getElementById('chatbotMessages');
            if (!container) return;

            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const msgEl = document.createElement('div');
            msgEl.className = `chatbot-msg chatbot-msg-${role}`;

            // Parse Markdown Bold & List formatting
            let formattedText = text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');

            let extraHtml = '';
            if (extra.cardType === 'task_created' && extra.cardData) {
                const t = extra.cardData;
                extraHtml = `
                    <div class="chatbot-result-card">
                        <div class="card-badge">Task Created</div>
                        <div style="font-weight:700;font-size:0.95rem;color:var(--accent-color);">${t.category} (${t.quantity} units)</div>
                        <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px;">Client: <strong style="color:var(--text-primary);">${t.clientName}</strong></div>
                        <div style="font-size:0.82rem;color:var(--text-secondary);">Delivery: ${t.assignedDelivery} | Priority: ${t.priority}</div>
                    </div>
                `;
            } else if (extra.cardType === 'work_logged' && extra.cardData) {
                const l = extra.cardData;
                extraHtml = `
                    <div class="chatbot-result-card">
                        <div class="card-badge" style="background:rgba(245,158,11,0.2);color:#f59e0b;">Hours Logged</div>
                        <div style="font-weight:700;font-size:0.95rem;color:var(--primary-color);">${l.memberName} — ${l.hours}h</div>
                        <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px;">Task: ${l.name} (${l.wageCategory})</div>
                        <div style="font-size:0.85rem;font-weight:600;color:var(--accent-color);margin-top:4px;">Calculated Wage: ₹${l.calculatedCost}</div>
                    </div>
                `;
            }

            msgEl.innerHTML = `
                <div class="chatbot-msg-bubble">
                    <div class="chatbot-msg-content">${formattedText}</div>
                    ${extraHtml}
                    <div class="chatbot-msg-time">${timeStr}</div>
                </div>
            `;

            container.appendChild(msgEl);
            this.scrollToBottom();
        },

        renderConfirmationCard(promptText, actionPayload) {
            const container = document.getElementById('chatbotMessages');
            if (!container) return;

            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            // Use unique IDs to avoid conflicts when multiple confirmations are rendered
            const uniqueId = Date.now();
            const msgEl = document.createElement('div');
            msgEl.className = 'chatbot-msg chatbot-msg-assistant';

            msgEl.innerHTML = `
                <div class="chatbot-msg-bubble" style="border-left: 3px solid var(--danger-color);">
                    <div class="chatbot-msg-content">${promptText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
                    <div class="chatbot-confirm-actions">
                        <button class="btn-confirm-yes" data-uid="${uniqueId}">✅ Confirm Delete</button>
                        <button class="btn-confirm-no" data-uid="${uniqueId}">❌ Cancel</button>
                    </div>
                    <div class="chatbot-msg-time">${timeStr}</div>
                </div>
            `;

            container.appendChild(msgEl);
            this.scrollToBottom();

            // Bind click handlers using data attributes (no duplicate ID issue)
            const yesBtn = msgEl.querySelector('.btn-confirm-yes');
            const noBtn = msgEl.querySelector('.btn-confirm-no');
            const actionsDiv = msgEl.querySelector('.chatbot-confirm-actions');

            yesBtn?.addEventListener('click', async () => {
                actionsDiv.remove();
                state.pendingAction = null;
                await this.executeConfirmedAction(actionPayload);
            });

            noBtn?.addEventListener('click', () => {
                actionsDiv.remove();
                state.pendingAction = null;
                this.addMessage('assistant', '❌ Action cancelled.');
            });
        },

        async executeConfirmedAction(payload) {
            this.showTypingIndicator();
            try {
                let res;
                if (payload.type === 'delete_delivery') {
                    res = await ChatbotTools.deleteDeliveryTask({ query: payload.query });
                } else if (payload.type === 'delete_task_log') {
                    res = await ChatbotTools.deleteTaskLog({ id: payload.id });
                } else {
                    res = { message: '⚠️ Unknown action type.' };
                }
                this.hideTypingIndicator();
                this.addMessage('assistant', res.message);
            } catch (e) {
                this.hideTypingIndicator();
                this.addMessage('assistant', `⚠️ Action failed: ${e.message}`);
            }
        },

        showTypingIndicator() {
            const container = document.getElementById('chatbotMessages');
            if (!container) return;
            this.hideTypingIndicator();

            const ind = document.createElement('div');
            ind.id = 'chatbotTypingIndicator';
            ind.className = 'chatbot-msg chatbot-msg-assistant chatbot-typing';
            ind.innerHTML = `
                <div class="chatbot-msg-bubble" style="padding: 0.6rem 1rem;">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            `;
            container.appendChild(ind);
            this.scrollToBottom();
        },

        hideTypingIndicator() {
            const ind = document.getElementById('chatbotTypingIndicator');
            if (ind) ind.remove();
        },

        scrollToBottom() {
            const container = document.getElementById('chatbotMessages');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }
    };

    // ==========================================
    // 6. INITIALIZE ON DOM READY
    // ==========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ChatbotUI.init());
    } else {
        ChatbotUI.init();
    }

    // Expose global access for debug / extensions
    window.WorkSyncChatbot = {
        tools: ChatbotTools,
        nlp: SmartNLP,
        llm: GeminiLLM,
        ui: ChatbotUI,
        open: () => ChatbotUI.toggleChat(true),
        close: () => ChatbotUI.toggleChat(false),
    };

})();
