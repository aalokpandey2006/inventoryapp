// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAwq2CmeWz3dyQhsKQ6dmDldqOKWaRUBQ0",
  authDomain: "inventoryapp-395f6.firebaseapp.com",
  projectId: "inventoryapp-395f6",
  storageBucket: "inventoryapp-395f6.firebasestorage.app",
  messagingSenderId: "699684934125",
  appId: "1:699684934125:web:88c1463979739fd57f17e4",
  measurementId: "G-PSC8MSEHFL"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', () => {
    const addRowBtn = document.getElementById('addRowBtn');
    const modal = document.getElementById('addModal');
    const closeBtn = document.querySelector('.close-btn');
    const addItemForm = document.getElementById('addItemForm');
    const inventoryBody = document.getElementById('inventoryBody');
    const currentUserDisplay = document.getElementById('currentUserDisplay');
    const logoutBtn = document.getElementById('logoutBtn');

    // Get current user
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    if (currentUserDisplay) {
        currentUserDisplay.textContent = currentUser;
    }

    // Handle logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('currentUser');
            window.location.href = 'login.html';
        });
    }

    let inventory = [];

    // Helper to resize image to prevent hitting Firestore 1MB doc limits
    function resizeImage(file, maxSize) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    if (width > height && width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    } else if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Subscribe to Firestore Realtime Updates
    db.collection("inventory").orderBy("order", "asc").onSnapshot((snapshot) => {
        inventory = [];
        snapshot.forEach((doc) => {
            inventory.push({ id: doc.id, ...doc.data() });
        });
        renderTable();
    }, (error) => {
        console.error("Firestore error:", error);
        inventoryBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger-color);">Error connecting to database. Check your internet connection.</td></tr>`;
    });

    // Open Modal
    addRowBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
    });

    // Close Modal
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        addItemForm.reset();
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            addItemForm.reset();
        }
    });

    // Handle Form Submit
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = addItemForm.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Adding...';
        submitBtn.disabled = true;

        const category = document.getElementById('category').value;
        const productName = document.getElementById('productName').value;
        const purchaser = document.getElementById('purchaser').value;
        const quantity = document.getElementById('quantity').value;
        const clientName = document.getElementById('clientName').value;
        const broughtBy = document.getElementById('broughtBy').value;
        const assignedDelivery = document.getElementById('assignedDelivery').value;
        const priority = document.getElementById('priority').value;

        const imageUpload = document.getElementById('imageUpload');
        let imageBase64 = null;

        if (imageUpload.files && imageUpload.files[0]) {
            imageBase64 = await resizeImage(imageUpload.files[0], 400);
        }

        const order = inventory.length > 0 ? inventory[inventory.length - 1].order + 100 : 100;

        const newItem = {
            category,
            productName,
            purchaser,
            quantity,
            clientName,
            broughtBy,
            assignedDelivery,
            priority,
            status: 'Undelivered',
            addedBy: currentUser,
            image: imageBase64,
            order: order,
            createdAt: Date.now()
        };

        try {
            await db.collection("inventory").add(newItem);
            modal.style.display = 'none';
            addItemForm.reset();
        } catch (error) {
            console.error("Error adding document: ", error);
            alert("Error adding item to database. Please try again.");
        } finally {
            submitBtn.textContent = 'Add to Inventory';
            submitBtn.disabled = false;
        }
    });

    // Handle Status Update
    window.markDelivered = async function(id) {
        await db.collection("inventory").doc(id).update({ status: 'Completed' });
    }

    // Handle Priority Update
    window.updatePriority = async function(id, newPriority) {
        await db.collection("inventory").doc(id).update({ priority: newPriority });
    }

    // Handle Delete
    window.deleteItem = async function(id) {
        if (confirm("Are you sure you want to delete this item?")) {
            await db.collection("inventory").doc(id).delete();
        }
    }

    // Handle Move Up
    window.moveUp = async function(id) {
        const index = inventory.findIndex(item => item.id === id);
        if (index > 0) {
            const currentItem = inventory[index];
            const prevItem = inventory[index - 1];
            const batch = db.batch();
            batch.update(db.collection("inventory").doc(currentItem.id), { order: prevItem.order });
            batch.update(db.collection("inventory").doc(prevItem.id), { order: currentItem.order });
            await batch.commit();
        }
    }

    // Handle Move Down
    window.moveDown = async function(id) {
        const index = inventory.findIndex(item => item.id === id);
        if (index > -1 && index < inventory.length - 1) {
            const currentItem = inventory[index];
            const nextItem = inventory[index + 1];
            const batch = db.batch();
            batch.update(db.collection("inventory").doc(currentItem.id), { order: nextItem.order });
            batch.update(db.collection("inventory").doc(nextItem.id), { order: currentItem.order });
            await batch.commit();
        }
    }

    // Render Table
    function renderTable() {
        if (!inventoryBody) return;
        inventoryBody.innerHTML = '';

        if (inventory.length === 0) {
            inventoryBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-secondary);">No items found. Add a new item to get started.</td></tr>`;
            return;
        }

        inventory.forEach((item, index) => {
            const tr = document.createElement('tr');

            const imageHtml = item.image
                ? `<img src="${item.image}" alt="${item.productName}">`
                : `<span class="no-image">No Img</span>`;

            const addedByText = item.addedBy ? item.addedBy : 'System';

            tr.innerHTML = `
                <td data-label="Category"><span style="background: rgba(0,255,136,0.1); color: var(--accent-color); padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600;">${item.category}</span></td>
                <td data-label="Image">
                    <div class="product-image-container">
                        ${imageHtml}
                    </div>
                </td>
                <td data-label="Product">
                    <div style="font-weight: 600; color: var(--text-primary);">${item.productName}</div>
                    <div style="color: var(--accent-color);">${item.quantity} units</div>
                </td>
                <td data-label="Client Info">
                    <div style="font-weight: 600; color: var(--text-primary);">${item.clientName || 'N/A'}</div>
                    <div style="color: var(--text-secondary);">Brought by: ${item.broughtBy || 'N/A'}</div>
                </td>
                <td data-label="Delivery">
                    <div style="color: var(--text-primary);">Purchased From: ${item.purchaser}</div>
                    <div style="color: var(--text-secondary);">Delivery: ${item.assignedDelivery || 'N/A'}</div>
                </td>
                <td data-label="Priority">
                    <select class="priority-badge priority-${(item.priority || 'Medium').toLowerCase()}" onchange="updatePriority('${item.id}', this.value)" style="cursor: pointer; border: 1px solid rgba(255,255,255,0.1); outline: none;">
                        <option value="Low" ${item.priority === 'Low' ? 'selected' : ''}>Low</option>
                        <option value="Medium" ${item.priority === 'Medium' || !item.priority ? 'selected' : ''}>Medium</option>
                        <option value="High" ${item.priority === 'High' ? 'selected' : ''}>High</option>
                    </select>
                </td>
                <td data-label="Status">
                    ${item.status === 'Completed'
                        ? `<div class="status-indicator status-completed"><span class="status-dot"></span>Completed</div>`
                        : `<div class="status-indicator status-undelivered"><span class="status-dot"></span>LIVE</div>`
                    }
                </td>
                <td data-label="Added By" style="color: var(--text-secondary);"><i style="opacity: 0.7">by</i> ${addedByText}</td>
                <td data-label="Actions" style="white-space: nowrap;">
                    <button class="btn-icon" onclick="moveUp('${item.id}')" ${index === 0 ? 'disabled' : ''}>▲</button>
                    <button class="btn-icon" onclick="moveDown('${item.id}')" ${index === inventory.length - 1 ? 'disabled' : ''}>▼</button>
                    ${item.status !== 'Completed' ? `<button class="btn-success" onclick="markDelivered('${item.id}')">✓ Done</button>` : ''}
                    <button class="btn-danger" onclick="deleteItem('${item.id}')">Delete</button>
                </td>
            `;
            inventoryBody.appendChild(tr);
        });
    }
});
