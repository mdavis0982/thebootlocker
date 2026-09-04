const API_URL = "/api";
const INSTAGRAM_URL = "https://www.instagram.com/the_boot_locker/";
const ADMIN_TOKEN_KEY = "bootLockerAdminToken";
const IS_STATIC_PREVIEW = window.location.pathname.includes("/public/");

const PREVIEW_PRODUCTS = [
  {
    id: "101",
    name: "Adidas X Speedportal",
    brand: "Adidas",
    size: "UK 9",
    price: "85.00",
    condition: "Excellent",
    image_url: "IMG_7146.jpeg",
    status: "available",
  },
  {
    id: "102",
    name: "Nike Phantom GX",
    brand: "Nike",
    size: "UK 8.5",
    price: "110.00",
    condition: "Like new",
    image_url: "IMG_7146.jpeg",
    status: "reserved",
  },
  {
    id: "103",
    name: "Adidas Predator Accuracy",
    brand: "Adidas",
    size: "UK 10",
    price: "70.00",
    condition: "Good",
    image_url: "IMG_7146.jpeg",
    status: "sold",
  },
];

let products = [];
let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
let toastTimer;

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

function formatPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) ? price.toFixed(2) : "0.00";
}

function showToast(message) {
  const toast = element("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toast.classList.remove("visible");
  }, 3500);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (adminToken) {
    headers.set("Authorization", "Bearer " + adminToken);
  }

  const response = await fetch(API_URL + path, { ...options, headers });
  if (response.status === 401 && path !== "/admin/login") {
    setAdminState(false);
    showToast("Your admin session expired. Please sign in again.");
  }
  return response;
}

function setAdminState(loggedIn) {
  if (!loggedIn) {
    adminToken = "";
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  }

  element("adminLogin").hidden = loggedIn;
  element("adminPanel").hidden = !loggedIn;
  element("adminLoginError").hidden = true;
  element("adminPass").value = "";

  if (loggedIn) renderAdminProducts();
}

function statusPill(status) {
  const safeStatus = normaliseStatus(status);
  const label =
    safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1).toLowerCase();
  return (
    '<span class="status-pill status-' +
    safeStatus +
    '">' +
    label +
    "</span>"
  );
}

function imageMarkup(product, className) {
  if (!product.image_url) {
    return '<div class="image-placeholder">BL</div>';
  }
  return (
    '<img class="' +
    (className || "") +
    '" src="' +
    escapeHtml(product.image_url) +
    '" alt="' +
    escapeHtml(product.name) +
    '" loading="lazy" />'
  );
}

function productCard(product) {
  const id = escapeHtml(product.id);
  const name = escapeHtml(product.name);
  const brand = escapeHtml(product.brand || "Unbranded");
  const size = escapeHtml(product.size || "Size not listed");
  const condition = escapeHtml(product.condition || "Ask for condition");
  const status = normaliseStatus(product.status);

  return (
    '<article class="product-card">' +
    '<div class="product-photo">' +
    statusPill(status) +
    imageMarkup(product) +
    "</div>" +
    '<div class="product-info">' +
    '<p class="product-kicker">' +
    brand +
    " • Stock #" +
    id +
    "</p>" +
    '<div class="product-title-row">' +
    "<h3>" +
    name +
    "</h3>" +
    '<span class="product-price">£' +
    formatPrice(product.price) +
    "</span>" +
    "</div>" +
    '<div class="product-meta">' +
    '<span class="meta-chip">' +
    size +
    "</span>" +
    '<span class="meta-chip">' +
    condition +
    "</span>" +
    "</div>" +
    '<div class="product-actions">' +
    '<button class="button button-dark view-product-button" data-product-id="' +
    id +
    '">View pair</button>' +
    '<button class="icon-button enquire-button" data-product-id="' +
    id +
    '" aria-label="Enquire about ' +
    name +
    '"' +
    (status === "available" ? "" : " disabled") +
    ">↗</button>" +
    "</div>" +
    "</div>" +
    "</article>"
  );
}

function populateFilter(selectId, values, label) {
  const select = element(selectId);
  const currentValue = select.value;
  select.innerHTML = '<option value="">' + label + "</option>";

  values.forEach(function (value) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });

  if (values.includes(currentValue)) select.value = currentValue;
}

function updateFilterOptions() {
  const brands = [
    ...new Set(products.map(function (product) {
      return product.brand;
    }).filter(Boolean)),
  ].sort(function (a, b) {
    return a.localeCompare(b);
  });
  const sizes = [
    ...new Set(products.map(function (product) {
      return product.size;
    }).filter(Boolean)),
  ].sort(function (a, b) {
    return a.localeCompare(b, undefined, { numeric: true });
  });

  populateFilter("brandFilter", brands, "All brands");
  populateFilter("sizeFilter", sizes, "All sizes");
}

function filteredProducts() {
  const search = element("searchInput").value.trim().toLowerCase();
  const brand = element("brandFilter").value;
  const size = element("sizeFilter").value;
  const status = element("statusFilter").value;

  return products.filter(function (product) {
    const searchable = [
      product.name,
      product.brand,
      product.size,
      product.condition,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      (!search || searchable.includes(search)) &&
      (!brand || product.brand === brand) &&
      (!size || product.size === size) &&
      (!status || normaliseStatus(product.status) === status)
    );
  });
}

function wireProductButtons() {
  document.querySelectorAll(".view-product-button").forEach(function (button) {
    button.addEventListener("click", function () {
      openProduct(button.dataset.productId);
    });
  });

  document.querySelectorAll(".enquire-button").forEach(function (button) {
    button.addEventListener("click", function () {
      const product = products.find(function (item) {
        return String(item.id) === button.dataset.productId;
      });
      if (product) enquire(product);
    });
  });
}

function renderCatalogue() {
  const visibleProducts = filteredProducts();
  const grid = element("productGrid");
  const emptyState = element("emptyState");
  const availableCount = products.filter(function (product) {
    return normaliseStatus(product.status) === "available";
  }).length;

  element("heroAvailableCount").textContent = availableCount;
  element("catalogueCount").textContent =
    visibleProducts.length +
    (visibleProducts.length === 1 ? " pair shown" : " pairs shown");

  grid.hidden = visibleProducts.length === 0;
  emptyState.hidden = visibleProducts.length !== 0;
  grid.innerHTML = visibleProducts.map(productCard).join("");
  wireProductButtons();
}

async function loadProducts() {
  if (IS_STATIC_PREVIEW) {
    products = PREVIEW_PRODUCTS;
    updateFilterOptions();
    renderCatalogue();
    return;
  }

  try {
    const response = await apiFetch("/products");
    if (!response.ok) throw new Error("The catalogue could not be loaded");
    const data = await readJson(response);
    products = Array.isArray(data) ? data : [];
    updateFilterOptions();
    renderCatalogue();
    if (adminToken) renderAdminProducts();
  } catch (error) {
    element("productGrid").innerHTML = "";
    element("emptyState").hidden = false;
    element("emptyState").querySelector("h3").textContent =
      "The catalogue is waking up";
    element("emptyState").querySelector("p").textContent =
      "Please wait a moment and refresh the page.";
    element("catalogueCount").textContent = "Temporarily unavailable";
  }
}

function openProduct(id) {
  const product = products.find(function (item) {
    return String(item.id) === String(id);
  });
  if (!product) return;

  const status = normaliseStatus(product.status);
  const canEnquire = status === "available";
  element("productDialogContent").innerHTML =
    '<div class="product-detail-grid">' +
    '<div class="product-detail-image">' +
    imageMarkup(product) +
    "</div>" +
    '<div class="product-detail-copy">' +
    '<p class="eyebrow">Stock #' +
    escapeHtml(product.id) +
    "</p>" +
    "<h2>" +
    escapeHtml(product.name) +
    "</h2>" +
    '<p class="detail-price">£' +
    formatPrice(product.price) +
    "</p>" +
    '<div class="detail-list">' +
    "<div><span>Brand</span><strong>" +
    escapeHtml(product.brand || "Not listed") +
    "</strong></div>" +
    "<div><span>Size</span><strong>" +
    escapeHtml(product.size || "Not listed") +
    "</strong></div>" +
    "<div><span>Condition</span><strong>" +
    escapeHtml(product.condition || "Ask the seller") +
    "</strong></div>" +
    "<div><span>Status</span><strong>" +
    status.charAt(0).toUpperCase() +
    status.slice(1) +
    "</strong></div>" +
    "</div>" +
    '<button class="button button-accent" id="dialogEnquireButton"' +
    (canEnquire ? "" : " disabled") +
    ">" +
    (canEnquire ? "Enquire on Instagram ↗" : "Currently " + status) +
    "</button>" +
    "</div>" +
    "</div>";

  element("dialogEnquireButton").addEventListener("click", function () {
    enquire(product);
  });
  element("productDialog").showModal();
}

function enquire(product) {
  const message =
    "Hi, I'm interested in " +
    product.name +
    " (stock #" +
    product.id +
    "). Is it still available?";

  window.open(INSTAGRAM_URL, "_blank", "noopener,noreferrer");
  if (navigator.clipboard) {
    navigator.clipboard.writeText(message).catch(function () {});
  }
  showToast("Instagram opened — the enquiry message has been copied.");
}

function renderAdminProducts() {
  const container = element("adminProductList");
  element("adminItemCount").textContent =
    products.length + (products.length === 1 ? " listing" : " listings");

  if (products.length === 0) {
    container.innerHTML = '<p class="muted">No stock has been added yet.</p>';
    return;
  }

  container.innerHTML = products
    .map(function (product) {
      const id = escapeHtml(product.id);
      const status = normaliseStatus(product.status);
      return (
        '<div class="inventory-item">' +
        "<div><strong>" +
        escapeHtml(product.name) +
        "</strong><small>#" +
        id +
        " • £" +
        formatPrice(product.price) +
        " • " +
        escapeHtml(product.size || "No size") +
        "</small></div>" +
        '<select class="inventory-status" data-product-id="' +
        id +
        '" aria-label="Status for ' +
        escapeHtml(product.name) +
        '">' +
        '<option value="available"' +
        (status === "available" ? " selected" : "") +
        ">Available</option>" +
        '<option value="reserved"' +
        (status === "reserved" ? " selected" : "") +
        ">Reserved</option>" +
        '<option value="sold"' +
        (status === "sold" ? " selected" : "") +
        ">Sold</option>" +
        "</select>" +
        '<button class="icon-button delete-button" data-product-id="' +
        id +
        '" aria-label="Delete ' +
        escapeHtml(product.name) +
        '">×</button>' +
        "</div>"
      );
    })
    .join("");

  container.querySelectorAll(".inventory-status").forEach(function (select) {
    select.addEventListener("change", function () {
      updateProductStatus(select.dataset.productId, select.value);
    });
  });

  container.querySelectorAll(".delete-button").forEach(function (button) {
    button.addEventListener("click", function () {
      deleteProduct(button.dataset.productId);
    });
  });
}

async function updateProductStatus(id, status) {
  try {
    const response = await apiFetch("/products/" + id + "/status", {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(data.error || "The status could not be updated");
    }
    showToast("Product status updated.");
    await loadProducts();
  } catch (error) {
    showToast(error.message);
    await loadProducts();
  }
}

async function deleteProduct(id) {
  const product = products.find(function (item) {
    return String(item.id) === String(id);
  });
  const label = product ? product.name : "this product";
  if (!window.confirm("Permanently delete " + label + "?")) return;

  try {
    const response = await apiFetch("/products/" + id, { method: "DELETE" });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(data.error || "The product could not be deleted");
    }
    showToast("Product deleted.");
    await loadProducts();
  } catch (error) {
    showToast(error.message);
  }
}

function clearFilters() {
  element("searchInput").value = "";
  element("brandFilter").value = "";
  element("sizeFilter").value = "";
  element("statusFilter").value = "available";
  renderCatalogue();
}

["searchInput", "brandFilter", "sizeFilter", "statusFilter"].forEach(
  function (id) {
    element(id).addEventListener("input", renderCatalogue);
    element(id).addEventListener("change", renderCatalogue);
  },
);

element("clearFiltersButton").addEventListener("click", clearFilters);

element("openAdminButton").addEventListener("click", function () {
  if (IS_STATIC_PREVIEW) {
    showToast("Run the full Node app to use the admin tools.");
    return;
  }

  setAdminState(Boolean(adminToken));
  element("adminDialog").showModal();
});

document.querySelectorAll("[data-open-dialog]").forEach(function (button) {
  button.addEventListener("click", function () {
    element(button.dataset.openDialog).showModal();
  });
});

document.querySelectorAll("[data-close-dialog]").forEach(function (button) {
  button.addEventListener("click", function () {
    element(button.dataset.closeDialog).close();
  });
});

document.querySelectorAll("dialog").forEach(function (dialog) {
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) dialog.close();
  });
});

element("adminLoginForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  const errorElement = element("adminLoginError");
  errorElement.hidden = true;

  try {
    const response = await apiFetch("/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: element("adminUser").value.trim(),
        password: element("adminPass").value,
      }),
    });
    const data = await readJson(response);
    if (!response.ok || !data.token) {
      throw new Error(data.error || "The username or password is incorrect");
    }

    adminToken = data.token;
    sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    setAdminState(true);
    showToast("Signed in successfully.");
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.hidden = false;
  }
});

element("adminLogoutButton").addEventListener("click", function () {
  setAdminState(false);
  showToast("Signed out.");
});

element("addProductForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  const messageElement = element("addProductMessage");
  messageElement.hidden = true;

  const product = {
    name: element("productName").value.trim(),
    brand: element("productBrand").value.trim() || null,
    size: element("productSize").value.trim() || null,
    price: Number(element("productPrice").value),
    condition: element("productCondition").value || null,
    image_url: element("productImage").value.trim() || null,
  };

  try {
    const response = await apiFetch("/products", {
      method: "POST",
      body: JSON.stringify(product),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(data.error || "The product could not be added");
    }

    event.currentTarget.reset();
    messageElement.textContent = "Boot added successfully.";
    messageElement.className = "form-message success-message";
    messageElement.hidden = false;
    showToast("New boot added to the catalogue.");
    await loadProducts();
  } catch (error) {
    messageElement.textContent = error.message;
    messageElement.className = "form-message error-message";
    messageElement.hidden = false;
  }
});

setAdminState(Boolean(adminToken));
loadProducts();
