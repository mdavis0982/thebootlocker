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
let editingProductId = null;
let selectedPhotos = [];
let savingProduct = false;
let uploadsEnabled = false;
const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

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
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
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

  if (loggedIn) {
    renderAdminProducts();
    checkUploadAvailability();
  }
}

async function checkUploadAvailability() {
  element("uploadAvailability").textContent = "Checking photo uploads…";
  element("productPhotos").disabled = true;
  try {
    const response = await apiFetch("/admin/uploads");
    const data = await readJson(response);
    uploadsEnabled = response.ok && data.enabled === true;
    element("uploadAvailability").textContent = uploadsEnabled
      ? "The first photo is your cover. Photos upload when you save the listing."
      : "Photo uploads are not connected yet. You can still edit listing details and keep existing photos.";
  } catch {
    uploadsEnabled = false;
    element("uploadAvailability").textContent = "Could not check photo uploads. Reopen the stock manager to retry.";
  }
  element("productPhotos").disabled = !uploadsEnabled;
}

function productImages(product) {
  return Array.isArray(product.images) && product.images.length
    ? product.images : (product.image_url ? [product.image_url] : []);
}

function clearPhotoSelections() {
  selectedPhotos.forEach((photo) => {
    if (photo.preview) URL.revokeObjectURL(photo.preview);
  });
  selectedPhotos = [];
  element("productPhotos").value = "";
}

function renderPhotoPreviews() {
  element("photoSelectionCount").textContent = selectedPhotos.length ? `${selectedPhotos.length} of ${MAX_PHOTOS} photos selected` : "No photos selected";
  element("photoPreviews").innerHTML = selectedPhotos.map((photo, index) => `
    <div class="photo-preview">
      <div class="photo-preview-image">
        <span class="photo-preview-fallback" aria-hidden="true">Preview available after upload</span>
        <img src="${escapeHtml(photo.url || photo.preview)}" alt="Selected photo ${index + 1}" />
        ${index === 0 ? '<span class="cover-label">Cover photo</span>' : ''}
      </div>
      <span class="photo-filename">${escapeHtml(photo.name || "Photo " + (index + 1))}</span>
      <div class="photo-controls">
        ${index > 0 ? `<button type="button" class="text-button" data-cover-photo="${index}" aria-label="Make photo ${index + 1} the cover">Make cover</button>` : '<span>Shown in catalogue</span>'}
        <button type="button" class="text-button danger-text" data-remove-photo="${index}" aria-label="Remove photo ${index + 1}">Remove</button>
      </div>
    </div>`).join("");
  element("photoPreviews").querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", () => {
      img.hidden = true;
      img.previousElementSibling.setAttribute("aria-hidden", "false");
    });
  });
  element("photoPreviews").querySelectorAll("[data-cover-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      const [photo] = selectedPhotos.splice(Number(button.dataset.coverPhoto), 1);
      selectedPhotos.unshift(photo);
      renderPhotoPreviews();
    });
  });
  element("photoPreviews").querySelectorAll("[data-remove-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      const [photo] = selectedPhotos.splice(Number(button.dataset.removePhoto), 1);
      if (photo.preview) URL.revokeObjectURL(photo.preview);
      renderPhotoPreviews();
    });
  });
}

function resetProductForm() {
  element("addProductForm").reset();
  editingProductId = null;
  clearPhotoSelections();
  renderPhotoPreviews();
  element("listingHeading").textContent = "New listing";
  element("saveProductButton").textContent = "Add boot";
  element("cancelEditButton").hidden = true;
  element("photoMessage").hidden = true;
  element("addProductMessage").hidden = true;
}

function editProduct(id) {
  if (savingProduct) return;
  const product = products.find((item) => String(item.id) === String(id));
  if (!product) return;
  if (hasProductDraft() && !window.confirm("Discard the current unsaved listing changes?")) return;
  resetProductForm();
  editingProductId = String(id);
  element("productName").value = product.name;
  element("productBrand").value = product.brand || "";
  element("productSize").value = product.size || "";
  element("productPrice").value = product.price;
  const condition = element("productCondition");
  if (product.condition && !Array.from(condition.options).some((option) => option.value === product.condition)) {
    condition.add(new Option(product.condition, product.condition));
  }
  condition.value = product.condition || "";
  element("productDescription").value = product.description || "";
  selectedPhotos = productImages(product).map((url) => ({ url }));
  renderPhotoPreviews();
  element("listingHeading").textContent = "Editing stock #" + id;
  element("saveProductButton").textContent = "Save changes";
  element("cancelEditButton").hidden = false;
  element("addProductForm").scrollIntoView({ block: "start" });
  element("productName").focus({ preventScroll: true });
}

function hasProductDraft() {
  return selectedPhotos.length > 0 || ["productName", "productBrand", "productSize", "productPrice", "productCondition", "productDescription"]
    .some((id) => element(id).value !== "");
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
  const cover = productImages(product)[0];
  if (!cover) {
    return '<div class="image-placeholder">BL</div>';
  }
  return (
    '<img class="' +
    (className || "") +
    '" src="' +
    escapeHtml(cover) +
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
    '<div class="product-gallery"><div class="product-detail-image" id="galleryMain">' +
    imageMarkup(product) +
    '</div><div class="gallery-thumbnails" id="galleryThumbnails" aria-label="Product photos"></div></div>' +
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
    (product.description ? '<div class="condition-notes"><h3>Description &amp; condition</h3><p>' + escapeHtml(product.description) + '</p></div>' : '') +
    '<button class="button button-accent" id="dialogEnquireButton"' +
    (canEnquire ? "" : " disabled") +
    ">" +
    (canEnquire ? "Enquire on Instagram ↗" : "Currently " + status) +
    "</button>" +
    '<p class="enquiry-help" id="enquiryHelp" hidden></p>' +
    "</div>" +
    "</div>";

  element("dialogEnquireButton").addEventListener("click", function () {
    enquire(product);
  });
  const images = productImages(product);
  if (images.length > 1) {
    element("galleryThumbnails").innerHTML = images.map((url, index) =>
      `<button type="button" class="gallery-thumbnail" aria-label="View photo ${index + 1}" aria-pressed="${index === 0}"><img src="${escapeHtml(url)}" alt="${escapeHtml(product.name)} — photo ${index + 1}" loading="lazy" /></button>`
    ).join("");
    element("galleryThumbnails").querySelectorAll("button").forEach((button, index) => {
      button.addEventListener("click", () => {
        element("galleryMain").querySelector("img").src = images[index];
        element("galleryMain").querySelector("img").alt = product.name + " — photo " + (index + 1);
        element("galleryThumbnails").querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      });
    });
  }
  element("productDialog").showModal();
}

async function enquire(product) {
  const message =
    "Hi, I'm interested in " +
    product.name +
    " (stock #" +
    product.id +
    "). Is it still available?";

  window.open(INSTAGRAM_URL, "_blank", "noopener,noreferrer");
  try {
    await navigator.clipboard.writeText(message);
    showToast("Enquiry copied. Paste it into a message to The Boot Locker on Instagram.");
  } catch {
    if (!element("productDialog").open) openProduct(product.id);
    const help = element("enquiryHelp");
    help.hidden = false;
    help.textContent = "Copy this message and send it on Instagram: " + message;
    showToast("Could not copy automatically. Your enquiry message is shown with the product.");
  }
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
        '<button class="button button-outline edit-product-button" data-product-id="' + id + '" aria-label="Edit ' + escapeHtml(product.name) + '">Edit</button>' +
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
  container.querySelectorAll(".edit-product-button").forEach((button) => {
    button.addEventListener("click", () => editProduct(button.dataset.productId));
  });
  if (savingProduct) container.querySelectorAll("button, select").forEach((control) => { control.disabled = true; });
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
  if (savingProduct) return;
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
    if (String(editingProductId) === String(id)) resetProductForm();
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
  if (savingProduct) return;
  if (hasProductDraft() && !window.confirm("Discard unsaved listing changes and sign out?")) return;
  resetProductForm();
  setAdminState(false);
  showToast("Signed out.");
});

element("productPhotos").addEventListener("change", function (event) {
  const input = event.currentTarget;
  const files = Array.from(input.files || []);
  input.value = "";
  const error = element("photoMessage");
  error.hidden = true;
  if (selectedPhotos.length + files.length > MAX_PHOTOS) {
    error.textContent = "Choose up to 8 photos in total. Remove a photo before adding more.";
    error.hidden = false;
    return;
  }
  for (const file of files) {
    if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) || file.size > MAX_PHOTO_BYTES || file.size === 0) {
      error.textContent = "Choose JPG, PNG, WebP or HEIC photos, each up to 10 MB. No new photos were added.";
      error.hidden = false;
      return;
    }
  }
  files.forEach((file) => selectedPhotos.push({ file, name: file.name, preview: URL.createObjectURL(file) }));
  renderPhotoPreviews();
});

element("cancelEditButton").addEventListener("click", () => {
  if (!savingProduct && window.confirm("Discard unsaved changes to this listing?")) resetProductForm();
});

window.addEventListener("beforeunload", (event) => {
  if (savingProduct || hasProductDraft()) {
    event.preventDefault();
    event.returnValue = "";
  }
});

function setSavingProduct(busy) {
  savingProduct = busy;
  element("productFields").disabled = busy;
  element("addProductForm").setAttribute("aria-busy", String(busy));
  element("adminLogoutButton").disabled = busy;
  element("adminProductList").querySelectorAll("button, select").forEach((control) => { control.disabled = busy; });
}

element("addProductForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  if (savingProduct) return;
  const isEditing = editingProductId !== null;
  const messageElement = element("addProductMessage");
  messageElement.hidden = false;
  messageElement.className = "form-message";
  messageElement.textContent = "Preparing listing…";

  const product = {
    name: element("productName").value.trim(),
    brand: element("productBrand").value.trim() || null,
    size: element("productSize").value.trim() || null,
    price: Number(element("productPrice").value),
    condition: element("productCondition").value || null,
    description: element("productDescription").value.trim(),
  };

  setSavingProduct(true);
  try {
    const pendingPhotos = selectedPhotos.filter((photo) => !photo.url);
    if (pendingPhotos.length && !uploadsEnabled) throw new Error("Photo uploads are not connected. Your changes have been kept.");
    for (let index = 0; index < pendingPhotos.length; index++) {
      messageElement.textContent = `Uploading photo ${index + 1} of ${pendingPhotos.length}… Please keep this page open.`;
      const photo = pendingPhotos[index];
      const body = new FormData();
      body.append("photo", photo.file);
      const response = await apiFetch("/admin/photos", { method: "POST", body });
      const data = await readJson(response);
      if (!response.ok || !data.url) throw new Error(data.error || "A photo could not be uploaded. Please try saving again.");
      // Keep successful uploads on retry so earlier photos aren't uploaded twice.
      photo.url = data.url;
    }
    product.images = selectedPhotos.map((photo) => photo.url);
    messageElement.textContent = "Saving listing…";
    const response = await apiFetch(isEditing ? "/products/" + editingProductId : "/products", {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify(product),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(data.error || "The listing could not be saved");
    }

    resetProductForm();
    messageElement.textContent = isEditing ? "Changes saved successfully." : "Boot added successfully.";
    messageElement.className = "form-message success-message";
    messageElement.hidden = false;
    showToast(isEditing ? "Listing updated." : "New boot added to the catalogue.");
    await loadProducts();
  } catch (error) {
    messageElement.textContent = error.message;
    messageElement.className = "form-message error-message";
    messageElement.hidden = false;
  } finally {
    setSavingProduct(false);
  }
});

setAdminState(Boolean(adminToken));
loadProducts();
