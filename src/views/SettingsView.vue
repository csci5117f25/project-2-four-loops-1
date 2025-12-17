
<script setup>
import { ref, computed, onMounted, watch, nextTick, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseApp } from "@/firebase_conf";
import { useNotifications } from "@/composables/useNotifications";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const { askPermission } = useNotifications();
const route = useRoute();
/* ------------------------------------------------------------------
   USER / PROFILE STATE
------------------------------------------------------------------- */
const user = ref(null);
/* -------------------- PREFERENCES -------------------- */
const prefs = ref({
  enableNotifications: true,
  notificationOffset: 10,
  enableStockAlerts: false,
  // removed: stockReminderDays
  enablePharmacyLocation: false,
});
const originalPrefs = ref({});
const originalPharmacyName = ref("");
const offsetError = ref("");
const loaded = ref(false);
/* -------------------- SAVED PHARMACY SEARCH -------------------- */
const savedPharmacyName = ref("");
const savedPharmacyDetails = ref(null);
const searchResults = ref([]);
const searchLoading = ref(false);
const searchError = ref("");
const searchTimeout = ref(null);
const searchAbort = ref(null);
/* -------------------- MAP / NEARBY PHARMACIES -------------------- */
const mapContainer = ref(null);
const mapInstance = ref(null);
const markersLayer = ref(null);
const nearbyPharmacies = ref([]);
const mapLoading = ref(false);
const mapError = ref("");
const userLocation = ref(null);
const nearbyAbort = ref(null);
/* ArcGIS endpoint */
const ARC_BASE =
  "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
/* Custom icon for SAVED pharmacy (red) */
const savedIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
/* Default blue icon for nearby pharmacies */
const nearbyIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
/* -------------------- SCROLL TARGET FOR SAVED PHARMACY -------------------- */
const savedPharmacySection = ref(null);
function scrollToSavedPharmacy() {
  if (!savedPharmacySection.value) return;
  savedPharmacySection.value.scrollIntoView({ behavior: "smooth", block: "start" });
}
watch(
  () => route.query.section,
  (section) => {
    if (section === "savedPharmacy") nextTick(scrollToSavedPharmacy);
  },
  { immediate: true }
);
/* ================================================================
   COMPUTED: HAS CHANGES
================================================================ */
const hasChanges = computed(() => {
  if (!loaded.value) return false;
  const prefsChanged =
    JSON.stringify(prefs.value) !== JSON.stringify(originalPrefs.value);
  const pharmacyChanged =
    savedPharmacyName.value !== originalPharmacyName.value;
  return prefsChanged || pharmacyChanged;
});
/* ================================================================
   COMPUTED: What to show on map
================================================================ */
const showSavedPharmacyOnMap = computed(() => {
  return (
    savedPharmacyDetails.value &&
    savedPharmacyDetails.value.lat != null &&
    savedPharmacyDetails.value.lng != null
  );
});
const mapStatusMessage = computed(() => {
  if (mapLoading.value) return "Finding pharmacies near you...";
  if (mapError.value) return mapError.value;
  if (showSavedPharmacyOnMap.value) {
    return `Showing your saved pharmacy: ${savedPharmacyDetails.value.name}`;
  }
  if (nearbyPharmacies.value.length > 0) {
    const nearest = nearbyPharmacies.value[0];
    const nearestDist =
      nearest._distance !== undefined && nearest._distance !== Infinity
        ? ` (nearest: ${nearest._distance.toFixed(1)} mi)`
        : "";
    return `Found ${nearbyPharmacies.value.length} pharmacies within 10 miles${nearestDist}`;
  }
  return "Enable location to see pharmacies near you.";
});
/* ================================================================
   HELPERS
================================================================ */
function mapArcGisCandidates(candidates) {
  return (candidates || []).map((c) => ({
    id:
      c.attributes?.ResultID ||
      c.attributes?.Place_addr ||
      c.address ||
      `${c.location?.x},${c.location?.y}`,
    name: c.attributes?.PlaceName || c.address || "Pharmacy",
    address: c.attributes?.Place_addr || c.address || "",
    lat: c.location?.y,
    lng: c.location?.x,
    score: c.score,
  }));
}
function distanceMiles(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
// bbox around user for ArcGIS "searchExtent" (speed + nearby ranking)
function bboxAround(lat, lng, miles = 10) {
  const latDelta = miles / 69.0;
  const lngDelta = miles / (69.0 * Math.cos((lat * Math.PI) / 180) || 1);
  const xmin = lng - lngDelta;
  const ymin = lat - latDelta;
  const xmax = lng + lngDelta;
  const ymax = lat + latDelta;
  return `${xmin},${ymin},${xmax},${ymax}`;
}
/* ================================================================
   GOOGLE MAPS HELPER
================================================================ */
function openGoogleMaps(lat, lng, name, address) {
  let query = `${name || ""} ${address || ""}`.trim();
  if (!query) query = `${lat},${lng}`;
  const url =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(query);
  window.open(url, "_blank");
}
/* ================================================================
   LOCATION
   - getLocationOptional(): DOES NOT prompt. Used for fast search.
   - requestBrowserLocation(): prompts (only on nearby button / map load).
================================================================ */
function getLocationOptional() {
  return userLocation.value || null;
}
async function requestBrowserLocation() {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    mapError.value = "Geolocation not supported in this browser.";
    return null;
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        userLocation.value = loc;
        resolve(loc);
      },
      (err) => {
        if (err.code === 1) {
          mapError.value =
            "Location access denied. Please enable location in your browser settings.";
        } else if (err.code === 2) {
          mapError.value = "Unable to determine your location. Please try again.";
        } else if (err.code === 3) {
          mapError.value = "Location request timed out. Please try again.";
        }
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}
/* ================================================================
   LOAD USER + PREFERENCES
================================================================ */
onMounted(() => {
  onAuthStateChanged(auth, async (firebaseUser) => {
    user.value = firebaseUser;
    if (!firebaseUser) return;
    const prefRef = doc(db, "users", firebaseUser.uid, "preferences", "general");
    const snap = await getDoc(prefRef);
    if (snap.exists()) {
      const data = snap.data();
      prefs.value = {
        ...prefs.value,
        enableNotifications:
          data.enableNotifications ?? prefs.value.enableNotifications,
        notificationOffset:
          data.notificationOffset ?? prefs.value.notificationOffset,
        enableStockAlerts: data.enableStockAlerts ?? prefs.value.enableStockAlerts,
        enablePharmacyLocation:
          data.enablePharmacyLocation ?? prefs.value.enablePharmacyLocation,
      };
      if (data.savedPharmacy) {
        savedPharmacyName.value = data.savedPharmacy.name || "";
        savedPharmacyDetails.value = data.savedPharmacy;
      }
    }
    originalPrefs.value = JSON.parse(JSON.stringify(prefs.value));
    originalPharmacyName.value = savedPharmacyName.value;
    if (prefs.value.enablePharmacyLocation) {
      await nextTick();
      initMap();
      if (showSavedPharmacyOnMap.value) {
        updateMapMarkers();
      } else {
        // don't auto-prompt location here; show map, user can click 📍
        updateMapMarkers();
      }
    }
    loaded.value = true;
  });
});
/* ================================================================
   NOTIFICATION PERMISSION + OFFSET VALIDATION
================================================================ */
watch(
  () => prefs.value.enableNotifications,
  async (enabled) => {
    if (!loaded.value) return;
    if (enabled) await askPermission();
  }
);
watch(
  () => prefs.value.notificationOffset,
  (val) => {
    if (!loaded.value) return;
    if (!prefs.value.enableNotifications) {
      offsetError.value = "";
      return;
    }
    if (!val && val !== 0) return (offsetError.value = "Please enter a value.");
    if (val < 5) return (offsetError.value = "Minimum allowed is 5 minutes.");
    if (val % 5 !== 0)
      return (offsetError.value = "Must be a multiple of 5 minutes (5, 10, 15…).");
    offsetError.value = "";
  }
);
/* ================================================================
   CLEAR SAVED PHARMACY WHEN INPUT EMPTIED
================================================================ */
watch(savedPharmacyName, async (newVal) => {
  const trimmed = newVal.trim();
  if (savedPharmacyDetails.value && trimmed === "") {
    const u = auth.currentUser;
    if (u) {
      const prefRef = doc(db, "users", u.uid, "preferences", "general");
      await setDoc(prefRef, { savedPharmacy: null }, { merge: true });
    }
    savedPharmacyDetails.value = null;
    originalPharmacyName.value = "";
    if (prefs.value.enablePharmacyLocation && mapInstance.value) {
      nearbyPharmacies.value = [];
      mapError.value = "";
      updateMapMarkers();
    }
  }
});
/* ================================================================
   SAVE PREFERENCES
================================================================ */
async function savePreferences(silent = false) {
  if (offsetError.value) return;
  const u = auth.currentUser;
  if (!u) return;
  const prefRef = doc(db, "users", u.uid, "preferences", "general");
  const payload = {
    enableNotifications: prefs.value.enableNotifications,
    notificationOffset: prefs.value.notificationOffset,
    enableStockAlerts: prefs.value.enableStockAlerts,
    enablePharmacyLocation: prefs.value.enablePharmacyLocation,
  };
  const trimmedName = savedPharmacyName.value.trim();
  if (!trimmedName) {
    payload.savedPharmacy = null;
  } else if (savedPharmacyDetails.value) {
    payload.savedPharmacy = {
      id: savedPharmacyDetails.value.id || null,
      name: trimmedName,
      address: savedPharmacyDetails.value.address || "",
      lat: savedPharmacyDetails.value.lat ?? null,
      lng: savedPharmacyDetails.value.lng ?? null,
    };
  } else {
    payload.savedPharmacy = { id: null, name: trimmedName, address: "", lat: null, lng: null };
  }
  await setDoc(prefRef, payload, { merge: true });
  originalPrefs.value = JSON.parse(JSON.stringify(prefs.value));
  originalPharmacyName.value = savedPharmacyName.value;
  if (!silent) alert("Preferences saved!");
}
/* ================================================================
   TOGGLES
================================================================ */
function toggleNotifications() {
  prefs.value.enableNotifications = !prefs.value.enableNotifications;
}
function toggleStockAlerts() {
  prefs.value.enableStockAlerts = !prefs.value.enableStockAlerts;
}
function togglePharmacyLocation() {
  prefs.value.enablePharmacyLocation = !prefs.value.enablePharmacyLocation;
}
/* destroy Leaflet map cleanly */
function destroyMap() {
  if (mapInstance.value) {
    mapInstance.value.remove();
    mapInstance.value = null;
  }
  markersLayer.value = null;
}
watch(
  () => prefs.value.enablePharmacyLocation,
  async (enabled) => {
    if (!loaded.value) return;
    if (enabled) {
      await nextTick();
      initMap();
      updateMapMarkers(); // show saved if exists, else empty map
    } else {
      nearbyPharmacies.value = [];
      mapError.value = "";
      destroyMap();
    }
  }
);
/* ================================================================
   SEARCH (FASTER: fewer calls, fewer results, no location prompt)
================================================================ */
function onSavedPharmacyInput() {
  searchError.value = "";
  if (searchTimeout.value) clearTimeout(searchTimeout.value);
  const q = savedPharmacyName.value.trim();
  if (q.length < 3) {
    if (searchAbort.value) searchAbort.value.abort();
    searchResults.value = [];
    return;
  }
  // slower debounce => fewer calls => faster overall UI
  searchTimeout.value = setTimeout(() => {
    searchPharmaciesByText(q);
  }, 650);
}
async function searchPharmaciesByText(query) {
  if (searchAbort.value) searchAbort.value.abort();
  searchAbort.value = new AbortController();
  searchLoading.value = true;
  searchError.value = "";
  searchResults.value = [];
  // IMPORTANT: do NOT request location here (no permission popup while typing)
  const loc = getLocationOptional();
  const params = new URLSearchParams({
    singleLine: query,
    category: "Pharmacy",
    maxLocations: "5", // smaller = faster
    outFields: "PlaceName,Place_addr,Score",
    f: "json",
  });
  // only use location if already known (cached)
  if (loc?.lat != null && loc?.lng != null) {
    params.set("location", `${loc.lng},${loc.lat}`);
    params.set("searchExtent", bboxAround(loc.lat, loc.lng, 10));
  }
  try {
    const res = await fetch(`${ARC_BASE}?${params.toString()}`, {
      signal: searchAbort.value.signal,
    });
    if (!res.ok) throw new Error("ArcGIS error");
    const data = await res.json();
    let mapped = mapArcGisCandidates(data.candidates);
    if (loc?.lat != null && loc?.lng != null) {
      const { lat, lng } = loc;
      mapped = mapped
        .map((p) => ({
          ...p,
          _distance:
            p.lat != null && p.lng != null ? distanceMiles(lat, lng, p.lat, p.lng) : Infinity,
        }))
        .sort((a, b) => a._distance - b._distance);
    } else {
      mapped.sort((a, b) => (b.score || 0) - (a.score || 0));
    }
    searchResults.value = mapped;
    if (!mapped.length) searchError.value = "No pharmacies match your search.";
  } catch (e) {
    if (e?.name !== "AbortError") {
      console.error(e);
      searchError.value = "Search failed.";
    }
  } finally {
    searchLoading.value = false;
  }
}
async function saveSelectedPharmacy(pharmacy) {
  const u = auth.currentUser;
  if (!u) return;
  savedPharmacyName.value = pharmacy.name;
  savedPharmacyDetails.value = pharmacy;
  searchResults.value = [];
  const prefRef = doc(db, "users", u.uid, "preferences", "general");
  await setDoc(
    prefRef,
    {
      savedPharmacy: {
        id: pharmacy.id || null,
        name: pharmacy.name || "",
        address: pharmacy.address || "",
        lat: pharmacy.lat ?? null,
        lng: pharmacy.lng ?? null,
      },
    },
    { merge: true }
  );
  originalPharmacyName.value = savedPharmacyName.value;
  // Update map instantly to show the saved pharmacy
  if (prefs.value.enablePharmacyLocation) {
    if (!mapInstance.value) {
      await nextTick();
      initMap();
    }
    nearbyPharmacies.value = [];
    mapError.value = "";
    updateMapMarkers();
  }
}
/* ================================================================
   MAP
================================================================ */
function initMap() {
  if (!mapContainer.value) return;
  if (mapInstance.value) destroyMap();
  mapInstance.value = L.map(mapContainer.value).setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(mapInstance.value);
  markersLayer.value = L.layerGroup().addTo(mapInstance.value);
  // Fix: map renders wrong size when inside v-if
  nextTick(() => {
    if (mapInstance.value) mapInstance.value.invalidateSize(true);
  });
  updateMapMarkers();
}
function clearMarkers() {
  if (markersLayer.value) markersLayer.value.clearLayers();
}
function updateMapMarkers() {
  if (!mapInstance.value || !markersLayer.value) return;
  clearMarkers();
  const saved = savedPharmacyDetails.value;
  const hasSaved = saved && saved.lat != null && saved.lng != null;
  // CASE 1: Show saved pharmacy if it exists with valid coordinates
  if (hasSaved) {
    const marker = L.marker([saved.lat, saved.lng], { icon: savedIcon }).addTo(
      markersLayer.value
    );
    marker.bindPopup(
      `<b>${saved.name}</b><br>${saved.address || ""}<br><i>Your saved pharmacy</i>`
    );
    marker.on("click", () => openGoogleMaps(saved.lat, saved.lng, saved.name, saved.address));
    mapInstance.value.setView([saved.lat, saved.lng], 16);
    return;
  }
  // CASE 2: No saved pharmacy - show nearby pharmacies within 10 miles
  const bounds = [];
  nearbyPharmacies.value.forEach((p) => {
    if (p.lat != null && p.lng != null) {
      const marker = L.marker([p.lat, p.lng], { icon: nearbyIcon }).addTo(markersLayer.value);
      const distanceText =
        p._distance !== undefined && p._distance !== Infinity
          ? `<br><i>${p._distance.toFixed(1)} miles away</i>`
          : "";
      marker.bindPopup(`<b>${p.name}</b><br>${p.address || ""}${distanceText}`);
      marker.on("click", () => openGoogleMaps(p.lat, p.lng, p.name, p.address));
      bounds.push([p.lat, p.lng]);
    }
  });
  if (bounds.length) mapInstance.value.fitBounds(bounds, { padding: [20, 20] });
  else mapInstance.value.setView([20, 0], 2);
}
async function loadNearbyPharmacies() {
  if (showSavedPharmacyOnMap.value) {
    updateMapMarkers();
    return;
  }
  if (nearbyAbort.value) nearbyAbort.value.abort();
  nearbyAbort.value = new AbortController();
  mapError.value = "";
  mapLoading.value = true;
  nearbyPharmacies.value = [];
  const loc = await requestBrowserLocation();
  if (!loc) {
    mapLoading.value = false;
    updateMapMarkers();
    return;
  }
  try {
    const params = new URLSearchParams({
      category: "Pharmacy",
      location: `${loc.lng},${loc.lat}`,
      searchExtent: bboxAround(loc.lat, loc.lng, 10),
      maxLocations: "25",
      outFields: "PlaceName,Place_addr,Score",
      f: "json",
    });
    const res = await fetch(`${ARC_BASE}?${params.toString()}`, {
      signal: nearbyAbort.value.signal,
    });
    if (!res.ok) throw new Error("ArcGIS error");
    const data = await res.json();
    const mapped = mapArcGisCandidates(data.candidates)
      .map((p) => ({
        ...p,
        _distance:
          p.lat != null && p.lng != null ? distanceMiles(loc.lat, loc.lng, p.lat, p.lng) : Infinity,
      }))
      .filter((p) => p._distance <= 10)
      .sort((a, b) => a._distance - b._distance);
    nearbyPharmacies.value = mapped;
    if (!mapped.length) mapError.value = "No nearby pharmacies found within 10 miles.";
    if (!mapInstance.value) {
      await nextTick();
      initMap();
    }
    updateMapMarkers();
  } catch (e) {
    if (e?.name !== "AbortError") {
      console.error(e);
      mapError.value = "Failed to load nearby pharmacies.";
      updateMapMarkers();
    }
  } finally {
    mapLoading.value = false;
  }
}
/* ================================================================
   OTHER
================================================================ */
async function handleLogout() {
  try {
    await signOut(auth);
    window.location.href = "/";
  } catch (e) {
    console.error("Logout failed:", e);
  }
}
onBeforeUnmount(() => {
  if (searchAbort.value) searchAbort.value.abort();
  if (nearbyAbort.value) nearbyAbort.value.abort();
  if (searchTimeout.value) clearTimeout(searchTimeout.value);
  destroyMap();
});
</script>
<template>
  <main class="settings-page">
    <section class="settings-card">
      <header class="settings-header">
        <h1 class="app-title">MediMate Settings</h1>
      </header>
      <div class="settings-main">
        <div class="settings-left">
          <!-- PROFILE -->
          <section class="settings-section">
            <h2 class="section-title">Profile</h2>
            <div class="field-row">
              <div class="field-icon">✉️</div>
              <input
                class="text-input"
                type="email"
                :value="user?.email || ''"
                readonly
                placeholder="Email"
              />
            </div>
          </section>
          <!-- REMINDERS & ALERTS -->
          <section class="settings-section">
            <h2 class="section-title tooltip-container">
              Reminders & Alerts
              <span class="info-icon">ℹ️</span>
              <span class="tooltip-box">
                To get notifications, enable allow notifications on the browser.
              </span>
            </h2>

            <div class="pref-row">
              <div class="text-block">
                <p class="pref-title">Notifications</p>
                <p class="pref-desc">Receive reminders before your medication time.</p>
              </div>
              <label class="switch">
                <input type="checkbox" :checked="prefs.enableNotifications" @change="toggleNotifications" />
                <span class="slider"></span>
              </label>
            </div>
            <div v-if="prefs.enableNotifications" class="nested">
              <label class="nested-label tooltip-container">
                Notify before (minutes)
                <span class="info-icon">ℹ️</span>
                <span class="tooltip-box">
                  Must be a multiple of 5 minutes (5, 10, 15…)
                </span>
              </label>
              <input
                type="number"
                class="nested-input"
                v-model.number="prefs.notificationOffset"
                min="5"
                step="5"
              />
              <p v-if="offsetError" style="color:red; font-size:0.85rem; margin-top:4px;">
                {{ offsetError }}
              </p>
            </div>
            <hr />
            <div class="pref-row">
              <div class="text-block">
                <p class="pref-title">Stock Alerts</p>
                <p class="pref-desc">Get alerts when medicines are running low.</p>
              </div>
              <label class="switch">
                <input type="checkbox" :checked="prefs.enableStockAlerts" @change="toggleStockAlerts" />
                <span class="slider"></span>
              </label>
            </div>
            <!-- removed the stockReminderDays nested block (as requested) -->
          </section>
          <!-- SAVED PHARMACY -->
          <section class="settings-section" id="saved-pharmacy" ref="savedPharmacySection">
            <h2 class="section-title">Saved Pharmacy</h2>
            <p class="pref-desc">
              Search and save your preferred pharmacy. We'll use this later for restock reminders.
            </p>
            <div class="saved-pharmacy-wrapper">
              <div class="saved-pharmacy-row">
                <input
                  class="text-input saved-pharmacy-input"
                  type="text"
                  v-model="savedPharmacyName"
                  placeholder="Search for a pharmacy (min 3 letters)"
                  @input="onSavedPharmacyInput"
                />
                <button class="icon-btn" type="button" title="Load nearby pharmacies" @click="loadNearbyPharmacies">
                  📍
                </button>
              </div>
              <div v-if="searchLoading || searchError || searchResults.length" class="nearby-pharmacies">
                <p v-if="searchLoading" class="nearby-status">Searching pharmacies...</p>
                <p v-else-if="searchError" class="nearby-status error">{{ searchError }}</p>
                <ul v-else class="nearby-list">
                  <li
                    v-for="p in searchResults"
                    :key="p.id"
                    class="nearby-item"
                    @mousedown.prevent="saveSelectedPharmacy(p)"
                  >
                    <div class="nearby-name">
                      {{ p.name }}
                      <span v-if="p._distance !== undefined && p._distance !== Infinity">
                        • {{ p._distance.toFixed(1) }} mi
                      </span>
                    </div>
                    <div class="nearby-address">{{ p.address }}</div>
                  </li>
                </ul>
              </div>
            </div>
          </section>
          <!-- PHARMACY LOCATION MAP -->
          <section class="settings-section">
            <h2 class="section-title">Pharmacy Location</h2>
            <div class="pref-row">
              <div class="text-block">
                <p class="pref-title">Show Pharmacy on Map</p>
                <p class="pref-desc">
                  If you have a saved pharmacy, we'll show it here. Otherwise we'll show pharmacies near you within 10 miles.
                </p>
              </div>
              <label class="switch">
                <input type="checkbox" :checked="prefs.enablePharmacyLocation" @change="togglePharmacyLocation" />
                <span class="slider"></span>
              </label>
            </div>
            <div v-if="prefs.enablePharmacyLocation" class="nested">
              <div ref="mapContainer" class="map-placeholder"></div>
              <div class="map-footer">
                <p class="map-status" :class="{ error: mapError, loading: mapLoading }">
                  <span v-if="mapLoading" class="loading-dot"></span>
                  {{ mapStatusMessage }}
                </p>
                <button
                  v-if="!showSavedPharmacyOnMap && !mapLoading"
                  class="refresh-btn"
                  type="button"
                  @click="loadNearbyPharmacies"
                  title="Refresh nearby pharmacies"
                >
                  🔄
                </button>
              </div>
            </div>
          </section>
          <!-- SAVE + LOGOUT -->
          <section class="settings-actions">
            <button
              type="button"
              @click="savePreferences()"
              :class="['save-btn', hasChanges && !offsetError ? 'changed' : '']"
              :disabled="!hasChanges || !!offsetError"
            >
              Save Preferences
            </button>
            <button class="btn-secondary" type="button" @click="handleLogout">
              Log Out
            </button>
          </section>
        </div>
      </div>
    </section>
  </main>
</template>
<style scoped>
/* ✅ UNCHANGED CSS (kept exactly as you had) */
.settings-page {
  padding: 24px 16px;
  display: flex;
  justify-content: center;
}
.settings-card {
  width: 100%;
  max-width: 960px;
  background: var(--color-card, #111827);
  color: var(--color-text, #f9fafb);
  box-shadow: var(--shadow-soft, 0 10px 30px rgba(15, 23, 42, 0.12));
  border-radius: 20px;
  padding: 24px 24px 28px;
}
.settings-header {
  margin-bottom: 16px;
}
.app-title {
  font-size: 24px;
  font-weight: 700;
}
.settings-main {
  display: flex;
  gap: 32px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.settings-left {
  flex: 2;
  min-width: 260px;
}
.settings-section {
  margin-bottom: 24px;
}
.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
}
.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field-icon {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--color-card, #020617);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.text-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border, #374151);
  background: var(--color-bg, #020617);
  color: var(--color-text, #f9fafb);
  font-size: 14px;
  outline: none;
}
.text-input::placeholder {
  color: var(--color-text-subtle, #9ca3af);
}
.text-input:focus {
  border-color: var(--color-primary, #4b9a7d);
}
.pref-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.9rem 0;
}
.text-block {
  max-width: 80%;
}
.pref-title {
  margin: 0;
  font-weight: 600;
}
.pref-desc {
  margin: 0;
  margin-top: 4px;
  font-size: 0.85rem;
  color: var(--color-subtle-text);
}
.nested {
  padding-left: 0.6rem;
  margin-bottom: 1rem;
}
.nested-label {
  color: var(--color-text);
}
.nested-input {
  width: 100%;
  padding: 0.6rem;
  margin-top: 0.3rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-card);
  color: var(--color-text);
}
.saved-pharmacy-wrapper {
  position: static;
}
.saved-pharmacy-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--color-card, #020617);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: background 0.15s ease, color 0.15s ease;
}
.icon-btn:hover {
  background: var(--color-primary-hover, #788f7e);
  color: #ffffff;
}
.nearby-pharmacies {
  position: static;
  margin-top: 4px;
  background: var(--color-card, #020617);
  border-radius: 12px;
  border: 1px solid var(--color-border, #374151);
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.6);
  padding: 6px 0;
  z-index: 30;
  max-height: 220px;
  overflow-y: auto;
  font-size: 13px;
}
.nearby-status {
  color: var(--color-text-subtle, #9ca3af);
  padding: 4px 10px;
}
.nearby-status.error {
  color: #f97373;
}
.nearby-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.nearby-item {
  padding: 6px 10px;
  cursor: pointer;
}
.nearby-item + .nearby-item {
  border-top: 1px solid var(--color-border, #1f2933);
}
.nearby-item:hover {
  background: var(--color-primary-hover, #788f7e);
}
.nearby-name {
  font-weight: 500;
}
.nearby-address {
  font-size: 12px;
  color: var(--color-text-subtle, #9ca3af);
}
.map-placeholder {
  height: 180px;
  border-radius: var(--radius-md);
  background: var(--color-border);
  overflow: hidden;
}
.map-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.4rem;
}
.map-status {
  font-size: 0.8rem;
  color: var(--color-subtle-text);
  display: flex;
  align-items: center;
  gap: 6px;
}
.map-status.error {
  color: #f97373;
}
.map-status.loading {
  color: var(--color-primary, #4b9a7d);
}
.loading-dot {
  width: 8px;
  height: 8px;
  background: var(--color-primary, #4b9a7d);
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}
.refresh-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: var(--color-card, #020617);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background 0.15s ease, transform 0.15s ease;
}
.refresh-btn:hover {
  background: var(--color-primary-hover, #788f7e);
  transform: rotate(90deg);
}
.settings-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.save-btn,
.btn-secondary {
  width: auto;
  padding: 0.7rem 1.6rem;
  border-radius: 999px;
}
.save-btn {
  border: none;
  background: var(--color-primary);
  opacity: 0.85;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.25s ease, opacity 0.25s ease;
}
.save-btn.changed {
  background: var(--color-primary-dark);
  opacity: 1;
}
.save-btn:disabled {
  cursor: not-allowed !important;
  opacity: 0.6 !important;
  background: var(--color-border, #374151);
}
.btn-secondary {
  border: 1px solid var(--color-border, #374151);
  font-size: 1rem;
  cursor: pointer;
  background: var(--color-card, #020617);
  color: var(--color-text, #f9fafb);
}
.btn-secondary:hover {
  background: var(--color-primary-hover, #788f7e);
  color: #ffffff;
  border-color: var(--color-primary-hover, #788f7e);
}
.switch {
  position: relative;
  width: 46px;
  height: 24px;
}
.switch input {
  opacity: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  border-radius: 50px;
  background: var(--color-border);
  inset: 0;
  transition: 0.3s;
}
.slider:before {
  content: "";
  position: absolute;
  height: 20px;
  width: 20px;
  border-radius: 50%;
  left: 2px;
  top: 2px;
  background: var(--color-card);
  transition: 0.3s;
}
input:checked + .slider {
  background: var(--color-primary);
}
input:checked + .slider:before {
  transform: translateX(22px);
}
.tooltip-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tooltip-box {
  visibility: hidden;
  opacity: 0;
  transition: 0.2s;
  position: absolute;
  top: 110%;
  left: 0;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  width: max-content;
  max-width: 220px;
  z-index: 99;
}
.tooltip-container:hover .tooltip-box {
  visibility: visible;
  opacity: 1;
}
@media (max-width: 768px) {
  .settings-card {
    padding: 20px 16px 24px;
  }
  .settings-main {
    flex-direction: column;
  }
}
</style>
