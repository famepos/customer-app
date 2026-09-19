// 📌 ใส่ลิงก์ Google Apps Script Web App (ลิงก์ /exec ของคุณ)
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwVwzvMQA7vNWfh5RHTtNhSUrvFVBMKxIjMKmKm7ylD5wIGPvO8sj_lo1feUGAXvz3D/exec";

let storeInfo = {};
let allProducts = [];
let cart = [];
let currentCategory = 'ทั้งหมด';
let orderHistory = [];

// ดึงค่าจาก URL ที่สแกน QR มา (storeId, table, token)
const urlParams = new URLSearchParams(window.location.search);
const storeId = urlParams.get('storeId');
const table = urlParams.get('table');
const token = urlParams.get('token');

window.onload = function() {
    if (!storeId || !table) {
        document.body.innerHTML = '<div class="flex h-screen items-center justify-center font-bold text-red-500 text-center p-6">❌ ลิงก์ไม่ถูกต้อง หรือ QR Code ไม่สมบูรณ์</div>';
        return;
    }

    document.getElementById('tableInfo').innerText = `โต๊ะ: ${table}`;
    loadCustomerMenu();
};

let tableSession = null;
let buffetPackages = [];

function loadCustomerMenu() {
    // 🟢 1. ใช้ encodeURIComponent ห่อตัวแปร table
    let safeTable = encodeURIComponent(table);
    let targetUrl = `${GAS_API_URL}?action=getCustomerMenu&storeId=${storeId}&table=${safeTable}`;
    
    fetch(targetUrl)
        .then(res => res.json())
        .then(res => {
            if (res.status === "Success") {
                storeInfo = res.data.storeInfo || {};
                allProducts = res.data.products || [];
                buffetPackages = res.data.buffetPackages || [];
                tableSession = res.data.tableSession || null;

                // 🛑 1. ดักจับคนแอบสแกนบิลเก่า: ถ้าโต๊ะถูกเคลียร์แล้ว หรือรหัส Token ไม่ตรง ให้บล็อกทันที!
                if (!tableSession || tableSession.token !== token) {
                    if (typeof lockScreenAfterCheckout === 'function') lockScreenAfterCheckout();
                    return; // หยุดทำงาน ไม่แสดงเมนูอาหารให้สั่ง
                }

                // 🕵️‍♂️ 2. สั่งให้สายลับเริ่มแอบเช็คสถานะโต๊ะเผื่อแคชเชียร์กดเคลียร์
                if (typeof startTableWatcher === 'function') startTableWatcher();

                // 🟢 3. ดึงรายการอาหารที่ "สั่งเข้าครัวไปแล้ว" มาเป็นประวัติ
                if (tableSession && tableSession.cart && tableSession.cart.length > 0) {
                    orderHistory = tableSession.cart;
                } else {
                    orderHistory = []; // ถ้าแคชเชียร์เช็คบิล/เคลียร์โต๊ะ ประวัติจะว่างเปล่าอัตโนมัติ
                }
                if (typeof updateHistoryUI === 'function') updateHistoryUI(); // อัปเดตปุ่มประวัติบนหน้าจอ
                
                if (storeInfo.storeName) document.getElementById('storeName').innerText = storeInfo.storeName;
                
                // 4. แสดงชื่อแพ็กเกจที่โต๊ะกำลังใช้งานอยู่
                if (tableSession && tableSession.mode === 'buffet') {
                    let pkg = buffetPackages.find(p => String(p.id) === String(tableSession.packageId));
                    if (pkg) {
                        document.getElementById('tableInfo').innerText = `โต๊ะ: ${table} (${pkg.name})`;
                    }
                }

                renderCategoryFilters(allProducts);
                renderProductGrid(allProducts);
            }
        });
}

// 🧠 ฟังก์ชันเช็คสิทธิ์บุฟเฟต์ฝั่งลูกค้า
function checkClientBuffetPrivilege(productCategory) {
    if (!tableSession || tableSession.mode !== 'buffet') return { isFree: false };

    let pkg = buffetPackages.find(p => String(p.id) === String(tableSession.packageId));
    if (!pkg || !pkg.allowedCategories) return { isFree: false };

    let allowedStr = pkg.allowedCategories.trim();
    if (allowedStr === "") return { isFree: true }; // ถ้าเว้นว่างไว้ = ฟรีทุกหมวด

    let allowedArr = allowedStr.split(',').map(s => s.trim().toLowerCase());
    let pCat = (productCategory || "ทั่วไป").trim().toLowerCase();

    if (allowedArr.includes(pCat) || allowedArr.includes('ทั้งหมด')) {
        return { isFree: true };
    }
    return { isFree: false };
}

// 🏷️ ฟังก์ชันสร้างปุ่มกรองหมวดหมู่สินค้าด้านบนเมนู
function renderCategoryFilters(products) {
    let categories = ['ทั้งหมด', ...new Set(products.map(p => p.category).filter(c => c))];
    let container = document.getElementById('customerCategoryContainer');
    
    if (!container) return;

    container.innerHTML = categories.map(cat => `
        <button onclick="filterCategory('${cat}', this)" class="cat-btn px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl text-xs font-bold whitespace-nowrap shadow-xs transition">${cat}</button>
    `).join('');
    
    if(container.children.length > 0) {
        container.children[0].className = "cat-btn px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold whitespace-nowrap shadow-xs transition";
    }
}

// 🔍 ฟังก์ชันกรองหมวดหมู่เมื่อกดปุ่ม
function filterCategory(cat, btn) {
    currentCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => {
        b.className = "cat-btn px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl text-xs font-bold whitespace-nowrap shadow-xs transition";
    });
    btn.className = "cat-btn px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold whitespace-nowrap shadow-xs transition";
    
    filterCustomerMenu();
}

function filterCustomerMenu() {
    let keyword = document.getElementById('searchMenuInput').value.toLowerCase().trim();
    let filtered = allProducts.filter(p => {
        let matchCat = (currentCategory === 'ทั้งหมด' || p.category === currentCategory);
        let matchName = p.name.toLowerCase().includes(keyword);
        return matchCat && matchName;
    });
    renderProductGrid(filtered);
}

// เรนเดอร์สินค้าพร้อมเช็คราคาฟรี/เสียเงิน
function renderProductGrid(products) {
    let grid = document.getElementById('customerProductGrid');
    if (products.length === 0) {
        grid.innerHTML = '<div class="col-span-2 text-center text-slate-400 py-12 font-medium">ไม่พบเมนูอาหาร</div>';
        return;
    }

    grid.innerHTML = products.map(p => {
        let privilege = checkClientBuffetPrivilege(p.category);
        let displayPrice = privilege.isFree ? 0 : p.price;
        
        let priceTag = privilege.isFree 
            ? `<span class="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md font-bold">ฟรี (ในบุฟเฟต์)</span>`
            : `<span class="font-black text-orange-600 text-base">฿${p.price.toFixed(2)}</span>`;

        return `
            <div onclick="addToCart('${p.id}', ${privilege.isFree})" class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer active:scale-95 transition">
                <div>
                    <img src="${p.image || 'https://placehold.co/150'}" class="w-full h-32 object-cover rounded-xl mb-2 bg-slate-50 border border-slate-100">
                    <h4 class="font-bold text-slate-800 text-sm line-clamp-2">${p.name}</h4>
                </div>
                <div class="mt-3 flex justify-between items-end">
                    ${priceTag}
                    <span class="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded-lg font-bold">+ สั่ง</span>
                </div>
            </div>
        `;
    }).join('');
}

function addToCart(productId, isFree) {
    let p = allProducts.find(item => item.id === productId);
    if (!p) return;

    let finalPrice = isFree ? 0 : p.price;

    let existing = cart.find(i => i.id === p.id && i.price === finalPrice);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ 
            id: p.id, 
            name: p.name, 
            price: finalPrice, 
            basePrice: p.price,
            qty: 1, 
            unit: 'ชิ้น',
            isBuffetFree: isFree 
        });
    }
    updateCartUI();
    Swal.fire({ toast: true, position: 'top', icon: 'success', title: `เพิ่ม ${p.name} แล้ว`, showConfirmButton: false, timer: 1200 });
}

function updateCartUI() {
    let totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
    let totalPrice = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

    document.getElementById('cartItemCount').innerText = totalQty;
    document.getElementById('cartTotalPrice').innerText = '฿' + totalPrice.toFixed(2);
    document.getElementById('cartModalTotal').innerText = '฿' + totalPrice.toFixed(2);

    let bar = document.getElementById('floatingCartBar');
    if (totalQty > 0) bar.classList.remove('hidden');
    else bar.classList.add('hidden');
}

function openCartModal() {
    let container = document.getElementById('cartModalItemsList');
    container.innerHTML = cart.map((item, idx) => `
        <div class="py-3 flex justify-between items-center text-sm">
            <div>
                <div class="font-bold text-slate-800">${item.name}</div>
                <div class="text-xs text-orange-600 font-bold">฿${item.price} x ${item.qty}</div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="changeQty(${idx}, 1)" class="w-8 h-8 bg-slate-100 rounded-xl font-bold text-slate-600">+</button>
                <span class="font-bold text-sm w-5 text-center">${item.qty}</span>
                <button onclick="changeQty(${idx}, -1)" class="w-8 h-8 bg-slate-100 rounded-xl font-bold text-slate-600">-</button>
            </div>
        </div>
    `).join('');
    document.getElementById('cartModal').classList.remove('hidden');
}

function closeCartModal() {
    document.getElementById('cartModal').classList.add('hidden');
}

function changeQty(index, val) {
    cart[index].qty += val;
    if (cart[index].qty <= 0) cart.splice(index, 1);
    updateCartUI();
    openCartModal();
}

function submitCustomerOrder() {
    if (cart.length === 0) return;

    // 🟢 1. โชว์ว่าสำเร็จทันที! ไม่ต้องรอ Google ประมวลผล (Optimistic UI)
    Swal.fire({
        title: 'สำเร็จ! 🎉',
        text: 'ส่งรายการอาหารเข้าครัวเรียบร้อยแล้ว',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
    });

    // 🟢 2. ย้ายของเข้าประวัติ และเคลียร์ตะกร้าหน้าจอทันที
    let payloadCart = [...cart]; // ก็อปปี้ข้อมูลไว้ส่งหลังบ้าน
    if (typeof orderHistory !== 'undefined') {
        orderHistory = [...orderHistory, ...cart];
        if (typeof updateHistoryUI === 'function') updateHistoryUI();
    }
    cart = [];
    updateCartUI();
    closeCartModal();

    // 🟢 3. แอบแพ็คข้อมูลส่งไปหลังบ้านเงียบๆ (Background Process)
    let payload = {
        action: "submitCustomerOrder",
        args: [storeId, table, token, payloadCart]
    };

    fetch(GAS_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload)
    }).then(res => res.json())
      .then(res => {
          console.log("ส่งออเดอร์เข้าหลังบ้านสำเร็จ", res);
          
          // 🛑 4. ถ้าลูกค้ามือไว! มากดส่งออเดอร์ในจังหวะเดียวกับที่เรากดเช็คบิล ให้บล็อกหน้าจอทันที
          if (res.status === "Error" && (res.message.includes("ไม่พบข้อมูลโต๊ะ") || res.message.includes("ไม่ได้เปิดใช้งาน"))) {
              if (typeof lockScreenAfterCheckout === 'function') lockScreenAfterCheckout();
          }
      })
      .catch(err => console.error("Error ส่งออเดอร์เบื้องหลัง:", err));
}
// ==========================================
// 📜 ระบบประวัติการสั่งอาหาร (ที่ส่งเข้าครัวไปแล้ว)
// ==========================================
function updateHistoryUI() {
    let btnHistory = document.getElementById('btnOrderHistory');
    if (!btnHistory) return;

    if (orderHistory.length > 0) {
        let totalQty = orderHistory.reduce((sum, item) => sum + item.qty, 0);
        let totalPrice = orderHistory.reduce((sum, item) => sum + (item.price * item.qty), 0);
        
        document.getElementById('historyQtyCount').innerText = totalQty;
        document.getElementById('historyTotalPrice').innerText = '฿' + totalPrice.toFixed(2);
        btnHistory.classList.remove('hidden'); // แสดงปุ่มเมื่อมีประวัติ
    } else {
        btnHistory.classList.add('hidden'); // ซ่อนปุ่มเมื่อไม่มีประวัติ (เช่น เพิ่งเปิดโต๊ะ หรือ เช็คบิลแล้ว)
    }
}

function openOrderHistoryModal() {
    if (orderHistory.length === 0) return;

    let grandTotal = 0;
    let htmlContent = '<div class="text-left space-y-3 max-h-[60vh] overflow-y-auto pr-2 mt-2">';
    
    orderHistory.forEach(item => {
        let lineTotal = item.price * item.qty;
        grandTotal += lineTotal;
        
        let priceTag = item.price === 0 
            ? `<span class="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md font-bold">ฟรี</span>` 
            : `<span class="font-bold text-slate-800">฿${lineTotal.toFixed(2)}</span>`;

        htmlContent += `
        <div class="flex justify-between items-center border-b border-slate-100 pb-2">
            <div>
                <div class="font-bold text-sm text-slate-800">${item.name}</div>
                <div class="text-xs text-slate-500">${item.qty} ${item.unit || 'ชิ้น'}</div>
            </div>
            <div>${priceTag}</div>
        </div>`;
    });

    htmlContent += `
        <div class="flex justify-between items-center pt-3 mt-2 bg-orange-50 p-3 rounded-xl border border-orange-100">
            <div class="font-bold text-orange-800 text-sm">ยอดรวมรายการที่สั่งไปแล้ว:</div>
            <div class="text-xl font-black text-orange-600">฿${grandTotal.toFixed(2)}</div>
        </div>
    </div>`;

    Swal.fire({
        title: '📜 อาหารที่สั่งเข้าครัวไปแล้ว',
        html: htmlContent,
        confirmButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#ea580c',
        width: '400px'
    });
}
// ==========================================
// 🔒 ระบบตรวจสอบสถานะโต๊ะ (ป้องกันกดสั่งหลังเช็คบิล)
// ==========================================
let tableCheckInterval = null;

function startTableWatcher() {
    if (tableCheckInterval) clearInterval(tableCheckInterval);
    
    tableCheckInterval = setInterval(() => {
        // 🟢 2. ใช้ encodeURIComponent ห่อตัวแปร table ตรงนี้ด้วย!
        let safeTable = encodeURIComponent(table);
        let targetUrl = `${GAS_API_URL}?action=getCustomerMenu&storeId=${storeId}&table=${safeTable}`;
        
        fetch(targetUrl)
            .then(res => res.json())
            .then(res => {
                if (res.status === "Success") {
                    let currentSession = res.data.tableSession;
                    if (!currentSession || currentSession.token !== token) {
                        lockScreenAfterCheckout();
                    }
                }
            })
            .catch(err => console.log("Watcher Error:", err));
    }, 10000);
}

function lockScreenAfterCheckout() {
    if (tableCheckInterval) clearInterval(tableCheckInterval);
    
    // เคลียร์หน้าจอเมนูทิ้งทั้งหมด แล้วขึ้นป้ายขอบคุณ
    document.body.innerHTML = `
        <div class="flex flex-col h-screen items-center justify-center bg-slate-50 p-6 text-center animate-fade-in">
            <div class="w-24 h-24 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center text-5xl mb-4 shadow-inner">
                👋
            </div>
            <h2 class="text-2xl font-bold text-slate-800 mb-2">ขอบคุณที่ใช้บริการ!</h2>
            <p class="text-slate-500">โต๊ะนี้ทำการเช็คบิลและเคลียร์โต๊ะเรียบร้อยแล้ว<br>ไม่สามารถสั่งอาหารเพิ่มได้ครับ</p>
        </div>
    `;
}
