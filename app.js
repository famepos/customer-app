// 📌 ใส่ลิงก์ Google Apps Script Web App (ลิงก์ /exec ของคุณ)
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwVwzvMQA7vNWfh5RHTtNhSUrvFVBMKxIjMKmKm7ylD5wIGPvO8sj_lo1feUGAXvz3D/exec";

let storeInfo = {};
let allProducts = [];
let cart = [];
let currentCategory = 'ทั้งหมด';

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

// ตอนโหลดเมนู ให้เก็บข้อมูล tableSession และ buffetPackages ไว้ใช้
function loadCustomerMenu() {
    let targetUrl = `${GAS_API_URL}?action=getCustomerMenu&storeId=${storeId}&table=${table}`;
    
    fetch(targetUrl)
        .then(res => res.json())
        .then(res => {
            if (res.status === "Success") {
                storeInfo = res.data.storeInfo || {};
                allProducts = res.data.products || [];
                buffetPackages = res.data.buffetPackages || [];
                tableSession = res.data.tableSession || null;

                if (storeInfo.storeName) document.getElementById('storeName').innerText = storeInfo.storeName;
                
                // แสดงป้ายบอกแพ็กเกจที่โต๊ะกำลังกินอยู่ (ถ้ามี)
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
// 🧠 ฟังก์ชันเช็คสิทธิ์บุฟเฟต์ฝั่งลูกค้า (จำลองจากโค้ดที่คุณมี)
function checkClientBuffetPrivilege(productCategory) {
    if (!tableSession || tableSession.mode !== 'buffet') return { isFree: false };

    let pkg = buffetPackages.find(p => String(p.id) === String(tableSession.packageId));
    if (!pkg || !pkg.allowedCategories) return { isFree: false };

    let allowedStr = pkg.allowedCategories.trim();
    if (allowedStr === "") return { isFree: true }; // เว้นว่าง = ฟรีทุกหมวด

    let allowedArr = allowedStr.split(',').map(s => s.trim().toLowerCase());
    let pCat = (productCategory || "ทั่วไป").trim().toLowerCase();

    if (allowedArr.includes(pCat) || allowedArr.includes('ทั้งหมด')) {
        return { isFree: true };
    }
    return { isFree: false };
}

function renderCategoryFilters(products) {
    let categories = ['ทั้งหมด', ...new Set(products.map(p => p.category).filter(c => c))];
    let container = document.getElementById('customerCategoryContainer');
    
    container.innerHTML = categories.map(cat => `
        <button onclick="filterCategory('${cat}', this)" class="cat-btn px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl text-xs font-bold whitespace-nowrap shadow-xs transition">${cat}</button>
    `).join('');
    
    if(container.children.length > 0) {
        container.children[0].className = "cat-btn px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold whitespace-nowrap shadow-xs transition";
    }
}

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

// ตอนเรนเดอร์สินค้า ให้เช็คว่าอันไหนฟรี/อันไหนเสียเงิน
function renderProductGrid(products) {
    let grid = document.getElementById('customerProductGrid');
    
    grid.innerHTML = products.map(p => {
        let privilege = checkClientBuffetPrivilege(p.category);
        let displayPrice = privilege.isFree ? 0 : p.price;
        
        let priceTag = privilege.isFree 
            ? `<span class="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md font-bold">ฟรี (ในบุฟเฟต์)</span>`
            : `<span class="font-black text-orange-600 text-base">฿${p.price.toFixed(2)}</span>`;

        return `
            <div onclick="addToCart('${p.id}', ${privilege.isFree})" class="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer active:scale-95 transition">
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
    
    Swal.fire({
        title: 'กำลังส่งคำสั่งซื้อ...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    let payload = {
        action: "submitCustomerOrder",
        args: [storeId, table, token, cart]
    };

    fetch(GAS_API_URL, {
        method: "POST",
        mode: "no-cors", // ป้องกันปัญหา CORS บน Apps Script
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    })
    .then(() => {
        Swal.fire('สำเร็จ! 🎉', 'ส่งออเดอร์ไปยังห้องครัวเรียบร้อยแล้ว', 'success');
        cart = [];
        updateCartUI();
        closeCartModal();
    })
    .catch(err => {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถส่งออเดอร์ได้ กรุณาลองใหม่อีกครั้ง', 'error');
    });
}
