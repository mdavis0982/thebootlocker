const API_URL = "/api";
const INSTAGRAM_URL = "https://www.instagram.com/the_boot_locker/";

let adminToken = sessionStorage.getItem("bootLockerAdminToken") || "";
let products = [];

function element(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normaliseStatus(value) {
  return ["available", "reserved", "sold"].includes(value)
    ? value
    : "available";
}

function statusBadge(status) {
  if (status === "sold") {
    return '<span class="badge bg-danger text-white">Sold</span>';
  }
  if (status === "reserved") {
    return '<span class="badge bg-warning text-dark">Reserved</span>';
  }
  return '<span class="badge bg-success text-white">Available</span>';
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (adminToken) {
    headers.set("Authorization", `Bearer ${adminToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && path !== "/admin/login") {
    setAdminState(false);
    alert("Your admin session has expired. Please log in again.");
  }
  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function setAdminState(loggedIn) {
  if (!loggedIn) {
    adminToken = "";
    sessionStorage.removeItem("bootLockerAdminToken");
  }

  element("adminLogin").style.display = loggedIn ? "none" : "block";
  element("adminPanel").style.display = loggedIn ? "block" : "none";
  element("adminLoginError").style.display = "none";
  element("adminPass").value = "";

  if (loggedIn) renderAdminProductList(products);
}

function showProductMessage(message, type) {
  const messageElement = element("addProductMsg");
  messageElement.textContent = message;
  messageElement.className =
    type === "success" ? "mt-2 text-success" : "mt-2 text-danger";
  messageElement.style.display = "block";
}

async function loadProducts() {
  try {
    const response = await apiFetch("/products");
    if (!response.ok) throw new Error("Unable to load products");

    const data = await readJson(response);
    products = Array.isArray(data) ? data : [];
    renderProducts(products);

    const availableCount = products.filter(
      (product) => normaliseStatus(product.status) === "available",
    ).length;
    element("productCount").textContent = availableCount;
    element("listingsCount").textContent =
      `${products.length} boots • ${availableCount} available`;

    if (adminToken) renderAdminProductList(products);
  } catch (error) {
    console.error("Unable to load products:", error);
    element("productGrid").innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h5>Could not load products</h5>
        <p>Please try again in a moment.</p>
      </div>
    `;
  }
}

function renderProducts(items) {
  const grid = element("productGrid");
  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-box-open"></i>
        <h5>No boots yet</h5>
        <p>Check back soon – new stock arriving regularly.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items
    .map((product) => {
      const id = escapeHtml(product.id);
      const name = escapeHtml(product.name);
      const brand = escapeHtml(product.brand || "No brand");
      const size = escapeHtml(product.size || "No size");
      const condition = escapeHtml(product.condition || "Condition unknown");
      const imageUrl = product.image_url
        ? escapeHtml(product.image_url)
        : "";
      const price = Number(product.price);
      const status = normaliseStatus(product.status);

      return `
        <article class="product-card">
          <div class="product-image">
            ${
              imageUrl
                ? `<img src="${imageUrl}" alt="${name}" loading="lazy" />`
                : '<div class="no-image"><i class="fas fa-shoe-prints"></i></div>'
            }
            ${status === "sold" ? '<span class="sold-badge">SOLD</span>' : ""}
            ${
              status === "reserved"
                ? '<span class="sold-badge bg-warning text-dark">RESERVED</span>'
                : ""
            }
          </div>
          <div class="product-body">
            <div class="product-name">${name}</div>
            <div class="product-brand">${brand} • ${size}</div>
            <div class="product-meta">
              <span class="badge bg-light text-dark">${condition}</span>
              ${statusBadge(status)}
            </div>
            <div class="product-price">£<span>${Number.isFinite(price) ? price.toFixed(2) : "0.00"}</span></div>
            <div class="product-actions">
              ${
                status === "available"
                  ? `<button class="btn btn-outline-dark enquire-button" data-product-id="${id}" data-product-name="${name}">
                       <i class="fab fa-instagram me-1"></i>Enquire on Instagram
                     </button>`
                  : `<button class="btn btn-sold" disabled>${status === "sold" ? "Sold" : "Reserved"}</button>`
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  grid.querySelectorAll(".enquire-button").forEach((button) => {
    button.addEventListener("click", () => {
      enquire(button.dataset.productId, button.dataset.productName);
    });
  });
}

function enquire(id, name) {
  const message = `Hi, I'm interested in ${name} (stock #${id}). Is it still available?`;
  window.open(INSTAGRAM_URL, "_blank", "noopener,noreferrer");
  navigator.clipboard?.writeText(message).catch(() => {});
  alert(`Instagram is opening. We've copied this message for you:\n\n${message}`);
}

function renderAdminProductList(items) {
  const container = element("adminProductList");
  if (items.length === 0) {
    container.innerHTML = '<p class="text-muted">No products yet.</p>';
    return;
  }

  container.innerHTML = `<div class="list-group">${items
    .map((product) => {
      const id = escapeHtml(product.id);
      const name = escapeHtml(product.name);
      const brand = escapeHtml(product.brand || "No brand");
      const size = escapeHtml(product.size || "No size");
      const price = Number(product.price);
      const status = normaliseStatus(product.status);

      return `
        <div class="list-group-item d-flex justify-content-between align-items-center gap-2">
          <div>
            <strong>${name}</strong>
            <span class="badge bg-light text-dark ms-2">£${Number.isFinite(price) ? price.toFixed(2) : "0.00"}</span>
            ${statusBadge(status)}
            <br><small class="text-muted">${brand} • ${size}</small>
          </div>
          <div class="d-flex gap-1">
            <select class="form-select form-select-sm status-select" data-product-id="${id}" aria-label="Product status">
              <option value="available" ${status === "available" ? "selected" : ""}>Available</option>
              <option value="reserved" ${status === "reserved" ? "selected" : ""}>Reserved</option>
              <option value="sold" ${status === "sold" ? "selected" : ""}>Sold</option>
            </select>
            <button class="btn btn-sm btn-outline-danger delete-button" data-product-id="${id}" aria-label="Delete ${name}">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("")}</div>`;

  container.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", () => {
      updateStatus(select.dataset.productId, select.value);
    });
  });
  container.querySelectorAll(".delete-button").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(button.dataset.productId));
  });
}

async function updateStatus(id, status) {
  try {
    const response = await apiFetch(`/products/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const data = await readJson(response);
      throw new Error(data.error || "Failed to update status");
    }
    await loadProducts();
  } catch (error) {
    alert(error.message);
    await loadProducts();
  }
}

async function deleteProduct(id) {
  if (!confirm("Permanently delete this boot?")) return;

  try {
    const response = await apiFetch(`/products/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await readJson(response);
      throw new Error(data.error || "Failed to delete product");
    }
    await loadProducts();
  } catch (error) {
    alert(error.message);
  }
}

element("adminLoginBtn").addEventListener("click", async () => {
  const username = element("adminUser").value.trim();
  const password = element("adminPass").value;
  const errorElement = element("adminLoginError");
  errorElement.style.display = "none";

  try {
    const response = await apiFetch("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const data = await readJson(response);
    if (!response.ok || !data.token) {
      throw new Error(data.error || "Invalid credentials");
    }

    adminToken = data.token;
    sessionStorage.setItem("bootLockerAdminToken", adminToken);
    setAdminState(true);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.style.display = "block";
  }
});

element("adminLogoutBtn").addEventListener("click", () => setAdminState(false));

element("addProductBtn").addEventListener("click", async () => {
  const name = element("prodName").value.trim();
  const price = Number(element("prodPrice").value);

  if (!name || !Number.isFinite(price) || price <= 0) {
    showProductMessage("Name and a valid price are required.", "error");
    return;
  }

  const product = {
    name,
    brand: element("prodBrand").value.trim() || null,
    size: element("prodSize").value.trim() || null,
    price,
    condition: element("prodCondition").value.trim() || null,
    image_url: element("prodImage").value.trim() || null,
  };

  try {
    const response = await apiFetch("/products", {
      method: "POST",
      body: JSON.stringify(product),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(data.error || "Failed to add product");
    }

    showProductMessage("Boot added successfully.", "success");
    [
      "prodName",
      "prodBrand",
      "prodSize",
      "prodPrice",
      "prodCondition",
      "prodImage",
    ].forEach((id) => {
      element(id).value = "";
    });
    await loadProducts();
  } catch (error) {
    showProductMessage(error.message, "error");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setAdminState(Boolean(adminToken));
  loadProducts();
});
