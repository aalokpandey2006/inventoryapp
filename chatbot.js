/**
 * WorkSync Enterprise - AI Chatbot Assistant
 * Full CRUD Operations Engine for Inventory, Warehouse, and Team Task Tracker
 */

(function () {
    'use strict';

    // ==========================================
    // 1. CHATBOT STATE & CONFIGURATION
    // ==========================================
    const CHATBOT_CONFIG = { // 'smart_nlp' or 'gemini_llm'
        storageKeyHistory: 'worksync_ai_chat_history',
    };

    const state = {
        isOpen: false,
        isBusy: false,
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
            // Capitalize first letter properly
            memberName = memberName.charAt(0).toUpperCase() + memberName.slice(1).toLowerCase();

            let taskName = (params.taskName || params.name || 'General Task').trim();
            taskName = taskName.charAt(0).toUpperCase() + taskName.slice(1);

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
    // 3. GEMINI AI ENGINE (Direct Serverless API)
    // ==========================================
    const GeminiCloudFunction = {
        getApiKey() {
            return localStorage.getItem('worksync_gemini_api_key') || 
                   (typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey ? firebaseConfig.apiKey : '');
        },

        async fetchSupportedModels(apiKey) {
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                if (!res.ok) return [];
                const data = await res.json();
                if (!data.models || !Array.isArray(data.models)) return [];

                // Filter models that support generateContent
                const available = data.models
                    .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => m.name.replace(/^models\//, ''))
                    .filter(name => name.includes('flash') || name.includes('pro'));

                // Sort: flash models first for fast responses, then others
                available.sort((a, b) => {
                    if (a.includes('flash') && !b.includes('flash')) return -1;
                    if (!a.includes('flash') && b.includes('flash')) return 1;
                    return 0;
                });

                return available;
            } catch (e) {
                console.warn('Dynamic model fetch failed, using fallback list:', e);
                return [];
            }
        },

        async getRegisteredMembers() {
            try {
                if (typeof trackerMembers !== 'undefined' && Array.isArray(trackerMembers) && trackerMembers.length > 0) {
                    return trackerMembers.map(m => m.name).filter(Boolean);
                }
                if (typeof db !== 'undefined') {
                    const snap = await db.collection('tracker_members').get();
                    const list = [];
                    snap.forEach(d => {
                        const data = d.data();
                        if (data && data.name) list.push(data.name);
                    });
                    return list;
                }
            } catch (e) {
                console.warn('Could not read tracker_members:', e);
            }
            return [];
        },

        async process(userInput) {
            const trimmed = (userInput || '').trim();

            // Command to set or update API key directly from chat: e.g. /apikey AIzaSy...
            if (trimmed.startsWith('/apikey') || trimmed.toLowerCase().startsWith('set apikey')) {
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 2 && parts[1]) {
                    localStorage.setItem('worksync_gemini_api_key', parts[1].trim());
                    return { text: '✅ Gemini API Key saved successfully! You can now log work hours freely.' };
                }
                return { text: 'ℹ️ Usage: Type `/apikey YOUR_KEY_HERE` to set your Gemini API key.' };
            }

            const apiKey = this.getApiKey();
            if (!apiKey) {
                return {
                    text: '⚠️ Gemini API Key not configured. Please type `/apikey YOUR_GEMINI_KEY` (Free from aistudio.google.com) or configure it in script.js.'
                };
            }

            const registeredMembers = await this.getRegisteredMembers();
            const memberConstraint = registeredMembers.length > 0
                ? `CRITICAL MEMBER RULE: The ONLY existing registered team members are: [${registeredMembers.join(', ')}]. You MUST match any employee names in the user's message to one of these exact registered names. If an employee mentioned is NOT in this list, return null for name.`
                : `Extract and clean the employee name matching the registered team members.`;

            const systemInstruction = `You are a precise data extraction engine for a payroll and inventory dashboard. 
Analyze the incoming text log, completely ignoring word patterns, spelling mistakes, or case variations.
${memberConstraint}
Extract and map the variables into a JSON array of log objects (or a single JSON object):
[
  {
    "name": "Exact matching name from the registered team members list",
    "hours": number value (convert words like 'one', 'two' into digit format),
    "task": "short category or description matching the task (e.g. Delivery, Dishwash Production, Packaging)",
    "category": "strictly classify as one of: 'delivery' (for all delivery/dispatch/dropping orders, even if misspelled 'delievery'), 'production' (for manufacturing, making cleaner/dishwash, batch, bottles), 'meeting' (client visits, meetings), or 'others'",
    "produced": "summary of the deliverable or output created (or null if not mentioned)"
  }
]
Note: If multiple employees are mentioned in the message (e.g. 'aalok and jay'), return an array containing an entry for EACH employee with their respective hours and task.
If a critical value is missing (such as name or hours), return null for that property. Return raw JSON only. Do not include markdown wraps or code blocks.`;

            const promptText = `${systemInstruction}\n\nIMPORTANT: Respond with pure JSON only (no markdown, no backticks, no explanatory text).\n\nUser input to parse:\n"${trimmed}"`;

            const payload = {
                contents: [
                    {
                        parts: [{ text: promptText }]
                    }
                ]
            };

            // Dynamically discover active models enabled on this specific key
            let candidateModels = await this.fetchSupportedModels(apiKey);
            if (!candidateModels || candidateModels.length === 0) {
                candidateModels = [
                    'gemini-1.5-flash-latest',
                    'gemini-1.5-flash',
                    'gemini-2.0-flash-exp',
                    'gemini-3.8-flash'
                ];
            }

            const sleep = ms => new Promise(r => setTimeout(r, ms));
            let lastError = null;

            for (const model of candidateModels) {
                const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        const response = await fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });

                        const data = await response.json();

                        if (!response.ok) {
                            const errMsg = data.error?.message || response.statusText;
                            lastError = { status: response.status, message: errMsg };

                            if (response.status === 403 || errMsg.includes('disabled') || errMsg.includes('PERMISSION_DENIED')) {
                                return { 
                                    text: `⚠️ **Gemini API Key Permission:**<br>Your key is not permitted for Generative Language API.<br>1. Create a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--primary-color);text-decoration:underline;">Google AI Studio</a>.<br>2. Type in chat: <code>/apikey YOUR_KEY</code>` 
                                };
                            }
                            if (response.status === 400 && errMsg.includes('API key')) {
                                return { text: `⚠️ Invalid API Key. Please update it by typing: \`/apikey YOUR_GEMINI_API_KEY\`` };
                            }

                            // If 503 or 429, wait 600ms and try once more or fallback to next model
                            if (response.status === 503 || response.status === 429) {
                                if (attempt === 0) {
                                    await sleep(600);
                                    continue;
                                }
                            }
                            break; // Try next model
                        }

                        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!rawText) break;

                        let extracted;
                        try {
                            let clean = rawText.trim();
                            clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                            const bStart = clean.indexOf('[');
                            const oStart = clean.indexOf('{');
                            if (bStart !== -1 && (oStart === -1 || bStart < oStart)) {
                                const bEnd = clean.lastIndexOf(']');
                                if (bEnd !== -1) clean = clean.substring(bStart, bEnd + 1);
                            } else if (oStart !== -1) {
                                const oEnd = clean.lastIndexOf('}');
                                if (oEnd !== -1) clean = clean.substring(oStart, oEnd + 1);
                            }
                            extracted = JSON.parse(clean);
                        } catch (parseErr) {
                            console.error('JSON Parse Error on text:', rawText, parseErr);
                            return { text: `⚠️ Could not parse structured data: ${rawText}` };
                        }

                        // Normalize to array
                        const items = Array.isArray(extracted) ? extracted : [extracted];
                        const validLogs = items.filter(it => it && it.name && it.hours && it.task);

                        if (validLogs.length === 0) {
                            return {
                                text: '⚠️ Missing details: Please ensure your message includes an existing employee name, number of hours, and the task performed.',
                                cardType: 'work_logged',
                                cardData: items[0] || null
                            };
                        }

                        // Strictly verify against existing registered members only
                        const verifiedLogs = [];
                        const unregisteredNames = [];

                        for (const item of validLogs) {
                            let matchedName = null;
                            if (registeredMembers.length > 0) {
                                const found = registeredMembers.find(m => m.trim().toLowerCase() === String(item.name).trim().toLowerCase());
                                if (found) {
                                    matchedName = found; // Use the exact registered casing
                                } else {
                                    unregisteredNames.push(item.name);
                                }
                            } else {
                                matchedName = String(item.name).trim();
                            }

                            if (matchedName) {
                                verifiedLogs.push({ ...item, name: matchedName });
                            }
                        }

                        if (verifiedLogs.length === 0 && unregisteredNames.length > 0) {
                            return {
                                text: `⚠️ **Member Not Found:** "${unregisteredNames.join(', ')}" is not in your registered team list.<br>Existing members: **${registeredMembers.join(', ')}**.<br>*(The bot only logs hours for existing members).*`
                            };
                        }

                        // Save each verified log to Firestore
                        const savedLogs = [];
                        for (const item of verifiedLogs) {
                            const logEntry = {
                                name: item.name,
                                hours: Number(item.hours),
                                task: String(item.task).trim(),
                                produced: item.produced ? String(item.produced).trim() : 'N/A',
                                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                                dateString: new Date().toISOString()
                            };

                            if (typeof db !== 'undefined') {
                                // 1. Write to hours_logs for bi-monthly salary tracker
                                await db.collection('hours_logs').add(logEntry);

                                // 2. Write to tracker_tasks for main Team Performance table
                                const catRaw = (item.category || '').toLowerCase().trim();
                                const taskCombined = ((logEntry.task || '') + ' ' + (item.category || '') + ' ' + trimmed).toLowerCase();

                                let wageCategory = 'others';
                                let calculatedCost = logEntry.hours * 25; // default fallback

                                if (catRaw === 'delivery' || /(?:delie?ve?r|deliv|delv|dispatch|drop|transport|shipping)/i.test(taskCombined)) {
                                    wageCategory = 'delivery';
                                    calculatedCost = 150; // standard delivery with vehicle
                                } else if (catRaw === 'production' || /(?:prod|make|making|batch|dishwash|cleaner|pack|bottle|manufactur)/i.test(taskCombined)) {
                                    wageCategory = 'production';
                                    calculatedCost = logEntry.hours <= 4 ? 100 : 200;
                                } else if (catRaw === 'meeting' || /(?:meet|client|visit|consult)/i.test(taskCombined)) {
                                    wageCategory = 'meeting';
                                    calculatedCost = 100;
                                }

                                const now = new Date();
                                const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
                                const gridDateStr = `${daysOfWeek[now.getDay()]} ${now.getDate()}`;
                                const todayStr = now.toISOString().split('T')[0];

                                const trackerTaskDoc = {
                                    memberName: logEntry.name,
                                    dateStr: gridDateStr,
                                    isoDate: todayStr,
                                    name: logEntry.task,
                                    wageCategory: wageCategory,
                                    hours: logEntry.hours,
                                    hasVehicle: wageCategory === 'delivery',
                                    commissionAmount: 0,
                                    calculatedCost: calculatedCost,
                                    status: 'Completed',
                                    paymentStatus: 'pending',
                                    createdAt: Date.now(),
                                    updatedAt: Date.now()
                                };

                                logEntry.wageCategory = wageCategory;
                                logEntry.calculatedCost = calculatedCost;

                                await db.collection('tracker_tasks').add(trackerTaskDoc);
                                // Note: We NEVER add to tracker_members here! Existing members only.
                            }
                            savedLogs.push(logEntry);
                        }

                        if (savedLogs.length === 1) {
                            const l = savedLogs[0];
                            return {
                                text: `✅ Successfully logged ${l.hours}h for **${l.name}** on task: "${l.task}".`,
                                cardType: 'work_logged',
                                cardData: l
                            };
                        } else {
                            const names = savedLogs.map(l => `${l.name} (${l.hours}h)`).join(', ');
                            return {
                                text: `✅ Successfully logged hours for **${savedLogs.length} team members**: ${names}.`,
                                cardType: 'work_logged',
                                cardData: savedLogs[0]
                            };
                        }

                    } catch (fetchErr) {
                        console.warn(`Error contacting endpoint:`, fetchErr);
                        lastError = { status: 0, message: fetchErr.message };
                        break;
                    }
                }
            }

            return {
                text: `⚠️ All Gemini free models are currently under heavy load (${lastError?.message || '503'}). Please retry in a moment.`
            };

        },

        initRealtimeDashboard() {
            const period1Dashboard = document.getElementById("period1-salary");
            const period2Dashboard = document.getElementById("period2-salary");
            const CURRENCY_MULTIPLIER = 25; // ₹25 per hour standard multiplier

            if (typeof db === 'undefined') return;

            db.collection("hours_logs").orderBy("timestamp", "asc").onSnapshot((snapshot) => {
                let period1Total = 0;
                let period2Total = 0;

                snapshot.forEach((doc) => {
                    const log = doc.data();
                    if (log.hours) {
                        const logDate = log.timestamp && typeof log.timestamp.toDate === 'function' 
                            ? log.timestamp.toDate() 
                            : new Date(log.dateString || Date.now());
                        const dateDay = logDate.getDate();
                        const accruedSalary = Number(log.hours) * CURRENCY_MULTIPLIER;

                        if (dateDay >= 1 && dateDay <= 15) {
                            period1Total += accruedSalary;
                        } else {
                            period2Total += accruedSalary;
                        }
                    }
                });

                if (period1Dashboard) {
                    period1Dashboard.textContent = `₹${period1Total.toFixed(2)}`;
                }
                if (period2Dashboard) {
                    period2Dashboard.textContent = `₹${period2Total.toFixed(2)}`;
                }
            }, (error) => {
                console.warn('Hours logs snapshot listener notice:', error);
            });
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
            // Start dashboard listener
            GeminiCloudFunction.initRealtimeDashboard();
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
                            <div class="chatbot-subtitle">AI Assistant • Agentic Mode</div>
                        </div>
                    </div>
                    <div class="chatbot-header-actions">
                        
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

                // Normal execution
                state.isBusy = true;
                this.showTypingIndicator();

                try {
                    const response = await GeminiCloudFunction.process(query);

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
            const welcomeText = `Hello admin how may i assist u`;
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
                const catLabel = l.wageCategory ? l.wageCategory.toUpperCase() : 'HOURS LOGGED';
                const wageLabel = l.calculatedCost ? ` • ₹${l.calculatedCost}` : '';
                extraHtml = `
                    <div class="chatbot-result-card">
                        <div class="card-badge" style="background:rgba(245,158,11,0.2);color:#f59e0b;">${catLabel}${wageLabel}</div>
                        <div style="font-weight:700;font-size:0.95rem;color:var(--primary-color);">${l.name} — ${l.hours}h</div>
                        <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px;">Task: ${l.task}</div>
                        <div style="font-size:0.85rem;font-weight:600;color:var(--accent-color);margin-top:4px;">Output: ${l.produced}</div>
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
        open: () => ChatbotUI.toggleChat(true),
        close: () => ChatbotUI.toggleChat(false),
    };

})();
