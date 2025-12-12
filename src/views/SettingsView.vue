<script setup>
import {
  ref,
  computed,
  onMounted,
  watch,
  nextTick,
  onBeforeUnmount,
} from "vue";
import { useRoute } from "vue-router";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
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
   - `user` is used only for showing profile info (email) in the UI.
   - Populated via onAuthStateChanged below.
------------------------------------------------------------------- */
const user = ref(null);

/* -------------------- PREFERENCES -------------------- */
const prefs = ref({
  enableNotifications: true,
  notificationOffset: 10,
  enableStockAlerts: false,
  stockReminderDays: 2,
  enablePharmacyLocation: false,
});

const originalPrefs = ref({});
const originalPharmacyName = ref(""); // track initial pharmacy for change detection
const offsetError = ref("");
const loaded = ref(false); // prevent false change detection on load

/* -------------------- SAVED PHARMACY SEARCH -------------------- */
const savedPharmacyName = ref("");
const savedPharmacyDetails = ref(null);

const searchResults = ref([]);
const searchLoading = ref(false);
const searchError = ref("");
const searchTimeout = ref(null);

/* -------------------- MAP / NEARBY PHARMACIES -------------------- */
const mapContainer = ref(null);
const mapInstance = ref(null);
const markersLayer = ref(null);

const nearbyPharmacies = ref([]);
const mapLoading = ref(false);
const mapError = ref("");

// User location (for nearby search + ordering, but NO pin)
const userLocation = ref(null);

// ArcGIS endpoint
const ARC_BASE =
  "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";

/* Custom icon for SAVED pharmacy (red) */
const savedIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/* -------------------- SCROLL TARGET FOR SAVED PHARMACY -------------------- */
const savedPharmacySection = ref(null);

function scrollToSavedPharmacy() {
  if (!savedPharmacySection.value) return;
  savedPharmacySection.value.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

// If URL has ?section=savedPharmacy, scroll there
watch(
  () => route.query.section,
  (section) => {
    if (section === "savedPharmacy") {
      nextTick(() => {
        scrollToSavedPharmacy();
      });
    }
  },
  { immediate: true }
);

/* ================================================================
   COMPUTED: HAS CHANGES
   - True if either:
     1) prefs differ from originalPrefs, OR
     2) savedPharmacyName differs from originalPharmacyName
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
   LOAD USER + PREFERENCES
   - This is where we:
     1) Set `user` (for Profile View)
     2) Load settings & saved pharmacy from Firestore
================================================================ */
onMounted(() => {
  onAuthStateChanged(auth, async (firebaseUser) => {
    // PROFILE VIEW: this is the user object used by the email field
    user.value = firebaseUser;

    if (!firebaseUser) return;

    const prefRef = doc(
      db,
      "users",
      firebaseUser.uid,
      "preferences",
      "general"
    );
    const snap = await getDoc(prefRef);

    if (snap.exists()) {
      const data = snap.data();

      prefs.value = {
        ...prefs.value,
        enableNotifications:
          data.enableNotifications ?? prefs.value.enableNotifications,
        notificationOffset:
          data.notificationOffset ?? prefs.value.notificationOffset,
        enableStockAlerts:
          data.enableStockAlerts ?? prefs.value.enableStockAlerts,
        stockReminderDays:
          data.stockReminderDays ?? prefs.value.stockReminderDays,
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

    // If map toggle is on from DB, init map
    if (prefs.value.enablePharmacyLocation) {
      await nextTick();
      initMap();
      if (savedPharmacyDetails.value) {
        updateMapMarkers();
      } else {
        loadNearbyPharmacies();
      }
    }

    loaded.value = true; // allow change detection + validations
  });
});

/* ================================================================
   NOTIFICATION PERMISSION + OFFSET VALIDATION
================================================================ */
watch(
  () => prefs.value.enableNotifications,
  async (enabled) => {
    if (!loaded.value) return;
    if (enabled) {
      await askPermission();
    }
  }
);

// multiple-of-5 validation, min 5
watch(
  () => prefs.value.notificationOffset,
  (val) => {
    if (!loaded.value) return;

    if (!prefs.value.enableNotifications) {
      offsetError.value = "";
      return;
    }

    if (!val && val !== 0) {
      offsetError.value = "Please enter a value.";
      return;
    }

    if (val < 5) {
      offsetError.value = "Minimum allowed is 5 minutes.";
      return;
    }

    if (val % 5 !== 0) {
      offsetError.value = "Must be a multiple of 5 minutes (5, 10, 15…).";
      return;
    }

    offsetError.value = "";
  }
);

/* ================================================================
   WHEN SAVED PHARMACY IS CLEARED BY EMPTYING INPUT
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
    originalPharmacyName.value = ""; // baseline: "no saved pharmacy"

    if (prefs.value.enablePharmacyLocation) {
      nearbyPharmacies.value = [];
      mapError.value = "";
      loadNearbyPharmacies();
    }
  }
});

/* ================================================================
   SAVE PREFERENCES
   - Saves:
     * Notification, stock, map toggles
     * Saved pharmacy (or null if cleared)
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
    stockReminderDays: prefs.value.stockReminderDays,
    enablePharmacyLocation: prefs.value.enablePharmacyLocation,
  };

  // also save savedPharmacy through the same button
  const trimmedName = savedPharmacyName.value.trim();
  if (!trimmedName) {
    payload.savedPharmacy = null;
  } else if (savedPharmacyDetails.value) {
    payload.savedPharmacy = {
      id: savedPharmacyDetails.value.id || null,
      name: trimmedName,
      address: savedPharmacyDetails.value.address || "",
      lat: savedPharmacyDetails.value.lat,
      lng: savedPharmacyDetails.value.lng,
    };
  } else {
    // user typed a name but didn't pick from search results
    payload.savedPharmacy = {
      id: null,
      name: trimmedName,
      address: "",
      lat: null,
      lng: null,
    };
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
    if (!loaded.value) return; // avoid firing during initial load

    if (enabled) {
      await nextTick(); // wait for <div ref="mapContainer"> to exist
      initMap();
      if (savedPharmacyDetails.value) {
        updateMapMarkers();
      } else {
        loadNearbyPharmacies();
      }
    } else {
      nearbyPharmacies.value = [];
      mapError.value = "";
      destroyMap();
    }
  }
);

/* ================================================================
   ARC GIS HELPERS + DISTANCE
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

/* ================================================================
   GOOGLE MAPS HELPER (text first, coords fallback)
================================================================ */
function openGoogleMaps(lat, lng, name, address) {
  let query = `${name || ""} ${address || ""}`.trim();

  if (!query) {
    query = `${lat},${lng}`;
  }

  const url =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(query);

  if (typeof window !== "undefined") {
    window.open(url, "_blank");
  }
}

/* ================================================================
   BROWSER LOCATION FOR SEARCH (used to sort nearest first)
================================================================ */
async function getBrowserLocationOnce() {
  if (userLocation.value) return userLocation.value;

  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const loc = { lat: latitude, lng: longitude };
        userLocation.value = loc;
        resolve(loc);
      },
      (err) => {
        console.error("Search geolocation error:", err);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 600000,
      }
    );
  });
}

/* ================================================================
   SAVED PHARMACY SEARCH
================================================================ */
function onSavedPharmacyInput() {
  searchError.value = "";

  if (searchTimeout.value) clearTimeout(searchTimeout.value);

  const q = savedPharmacyName.value.trim();
  if (q.length < 3) {
    searchResults.value = [];
    return;
  }

  searchTimeout.value = setTimeout(() => {
    searchPharmaciesByText(q);
  }, 400);
}

async function searchPharmaciesByText(query) {
  searchLoading.value = true;
  searchError.value = "";
  searchResults.value = [];

  // Get location (once) so search is biased + sorted by nearest
  const loc = await getBrowserLocationOnce();

  const params = new URLSearchParams({
    singleLine: query,
    category: "Pharmacy",
    maxLocations: "10",
    outFields: "PlaceName,Place_addr,Score",
    f: "json",
  });

  if (loc && loc.lat != null && loc.lng != null) {
    params.set("location", `${loc.lng},${loc.lat}`);
  }

  try {
    const res = await fetch(`${ARC_BASE}?${params.toString()}`);
    if (!res.ok) throw new Error("ArcGIS error");

    const data = await res.json();
    let mapped = mapArcGisCandidates(data.candidates);

    // If we have user location → sort by distance (nearest first)
    if (loc && loc.lat != null && loc.lng != null) {
      const { lat, lng } = loc;

      mapped = mapped.map((p) => ({
        ...p,
        _distance:
          p.lat != null && p.lng != null
            ? distanceMiles(lat, lng, p.lat, p.lng)
            : Infinity,
      }));

      mapped.sort((a, b) => {
        if (a._distance !== b._distance) {
          return a._distance - b._distance; // nearest first
        }
        return (b.score || 0) - (a.score || 0);
      });
    } else {
      // Fallback: just sort by ArcGIS score
      mapped.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    searchResults.value = mapped;

    if (!mapped.length) {
      searchError.value = "No pharmacies match your search.";
    }
  } catch (e) {
    console.error(e);
    searchError.value = "Search failed.";
  }

  searchLoading.value = false;
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
        id: pharmacy.id,
        name: pharmacy.name,
        address: pharmacy.address,
        lat: pharmacy.lat,
        lng: pharmacy.lng,
      },
    },
    { merge: true }
  );

  // we just persisted this selection, so treat it as the "baseline"
  originalPharmacyName.value = savedPharmacyName.value;

  if (mapInstance.value && prefs.value.enablePharmacyLocation) {
    updateMapMarkers();
  }
}

/* ================================================================
   MAP
================================================================ */
function initMap() {
  if (!mapContainer.value) return;

  // if a stray instance exists, reset it
  if (mapInstance.value) {
    destroyMap();
  }

  mapInstance.value = L.map(mapContainer.value).setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(mapInstance.value);

  markersLayer.value = L.layerGroup().addTo(mapInstance.value);

  updateMapMarkers();
}

function clearMarkers() {
  if (markersLayer.value) markersLayer.value.clearLayers();
}

/**
 * Behaviour:
 * - If saved pharmacy exists → ONLY that pharmacy (red marker), zoom 16.
 * - If no saved pharmacy:
 *    - If location allowed → pharmacies within 10 miles (NO user pin).
 *    - If location denied → world map only, text shows error.
 * - Hover → show popup; click → open Google Maps with name+address.
 */
function updateMapMarkers() {
  if (!mapInstance.value || !markersLayer.value) return;

  clearMarkers();

  const saved = savedPharmacyDetails.value;
  const hasSaved = saved && saved.lat != null && saved.lng != null;

  if (hasSaved) {
    const marker = L.marker([saved.lat, saved.lng], { icon: savedIcon }).addTo(
      markersLayer.value
    );

    const popupHtml = `<b>${saved.name}</b><br>${saved.address || ""}<br><i>Saved pharmacy</i>`;
    marker.bindPopup(popupHtml);

    marker.on("mouseover", () => marker.openPopup());
    marker.on("mouseout", () => marker.closePopup());
    marker.on("click", () =>
      openGoogleMaps(saved.lat, saved.lng, saved.name, saved.address)
    );

    mapInstance.value.setView([saved.lat, saved.lng], 16);
    return;
  }

  const bounds = [];

  // Use user location only for centering; no pin
  if (
    userLocation.value &&
    userLocation.value.lat != null &&
    userLocation.value.lng != null
  ) {
    bounds.push([userLocation.value.lat, userLocation.value.lng]);
  }

  nearbyPharmacies.value.forEach((p) => {
    if (p.lat != null && p.lng != null) {
      const marker = L.marker([p.lat, p.lng]).addTo(markersLayer.value);
      const popupHtml = `<b>${p.name}</b><br>${p.address || ""}`;
      marker.bindPopup(popupHtml);

      marker.on("mouseover", () => marker.openPopup());
      marker.on("mouseout", () => marker.closePopup());
      marker.on("click", () =>
        openGoogleMaps(p.lat, p.lng, p.name, p.address)
      );

      bounds.push([p.lat, p.lng]);
    }
  });

  if (bounds.length) {
    mapInstance.value.fitBounds(bounds, { padding: [20, 20] });
  } else {
    mapInstance.value.setView([20, 0], 2);
  }
}

async function loadNearbyPharmacies() {
  mapError.value = "";
  mapLoading.value = true;
  nearbyPharmacies.value = [];
  userLocation.value = null;

  if (!("geolocation" in navigator)) {
    mapError.value = "Geolocation is not supported in this browser.";
    mapLoading.value = false;
    updateMapMarkers();
    return;
  }

  const geoOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0,
  };

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      userLocation.value = { lat: latitude, lng: longitude };

      try {
        const params = new URLSearchParams({
          category: "Pharmacy",
          location: `${longitude},${latitude}`,
          maxLocations: "30",
          outFields: "PlaceName,Place_addr,Score",
          f: "json",
        });

        const res = await fetch(`${ARC_BASE}?${params.toString()}`);
        if (!res.ok) throw new Error("ArcGIS error");

        const data = await res.json();
        const allMapped = mapArcGisCandidates(data.candidates);

        const mapped = allMapped.filter((p) => {
          if (p.lat == null || p.lng == null) return false;
          const d = distanceMiles(latitude, longitude, p.lat, p.lng);
          return d <= 10;
        });

        nearbyPharmacies.value = mapped;

        if (!mapped.length) {
          mapError.value = "No nearby pharmacies found within 10 miles.";
        }

        updateMapMarkers();
      } catch (e) {
        console.error(e);
        mapError.value = "Failed to load nearby pharmacies.";
        updateMapMarkers();
      }

      mapLoading.value = false;
    },
    (err) => {
      console.error(err);
      if (err.code === err.PERMISSION_DENIED) {
        mapError.value = "Location permission denied.";
      } else {
        mapError.value = "Could not get your location.";
      }
      mapLoading.value = false;
      updateMapMarkers();
    },
    geoOptions
  );
}

/* ================================================================
   OTHER
================================================================ */
async function handleLogout() {
  try {
    await signOut(auth);
    window.location.href = "/"; // back to home
  } catch (e) {
    console.error("Logout failed:", e);
  }
}

onBeforeUnmount(() => {
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
          <!-- =====================================================
               PROFILE VIEW
               - Shows only email right now.
               - `user` is set inside onAuthStateChanged in <script setup>.
          ====================================================== -->
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
            <h2 class="section-title">Reminders & Alerts</h2>

            <div class="pref-row">
              <div class="text-block">
                <p class="pref-title">Notifications</p>
                <p class="pref-desc">
                  Receive reminders before your medication time.
                </p>
              </div>

              <label class="switch">
                <input
                  type="checkbox"
                  :checked="prefs.enableNotifications"
                  @change="toggleNotifications"
                />
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

              <p
                v-if="offsetError"
                style="color:red; font-size:0.85rem; margin-top:4px;"
              >
                {{ offsetError }}
              </p>
            </div>

            <hr />

            <div class="pref-row">
              <div class="text-block">
                <p class="pref-title">Stock Alerts</p>
                <p class="pref-desc">
                  Get alerts when medicines are running low.
                </p>
              </div>

              <label class="switch">
                <input
                  type="checkbox"
                  :checked="prefs.enableStockAlerts"
                  @change="toggleStockAlerts"
                />
                <span class="slider"></span>
              </label>
            </div>

            <div v-if="prefs.enableStockAlerts" class="nested">
              <label class="nested-label">
                Reminder days before stock runs out:
              </label>
              <input
                type="number"
                class="nested-input"
                v-model.number="prefs.stockReminderDays"
                min="1"
              />
            </div>
          </section>

          <!-- SAVED PHARMACY -->
          <section
            class="settings-section"
            id="saved-pharmacy"
            ref="savedPharmacySection"
          >
            <h2 class="section-title">Saved Pharmacy</h2>
            <p class="pref-desc">
              Search and save your preferred pharmacy. We’ll use this later for
              restock reminders.
            </p>

            <div class="saved-pharmacy-wrapper">
              <div class="saved-pharmacy-row">
                <input
                  class="text-input saved-pharmacy-input"
                  type="text"
                  v-model="savedPharmacyName"
                  placeholder="Search for a pharmacy"
                  @input="onSavedPharmacyInput"
                />
                <button
                  class="icon-btn"
                  type="button"
                  title="Use current location for nearby pharmacies when no saved pharmacy"
                  @click="loadNearbyPharmacies"
                >
                  📍
                </button>
              </div>

              <div
                v-if="searchLoading || searchError || searchResults.length"
                class="nearby-pharmacies"
              >
                <p v-if="searchLoading" class="nearby-status">
                  Searching pharmacies...
                </p>
                <p v-else-if="searchError" class="nearby-status error">
                  {{ searchError }}
                </p>
                <ul v-else class="nearby-list">
                  <li
                    v-for="p in searchResults"
                    :key="p.id"
                    class="nearby-item"
                    @mousedown.prevent="saveSelectedPharmacy(p)"
                  >
                    <div class="nearby-name">{{ p.name }}</div>
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
                  If you have a saved pharmacy, we’ll show it here. Otherwise
                  we’ll show pharmacies near you within 10 miles.
                </p>
              </div>

              <label class="switch">
                <input
                  type="checkbox"
                  :checked="prefs.enablePharmacyLocation"
                  @change="togglePharmacyLocation"
                />
                <span class="slider"></span>
              </label>
            </div>

            <div v-if="prefs.enablePharmacyLocation" class="nested">
              <div ref="mapContainer" class="map-placeholder"></div>
              <p class="map-status" v-if="mapLoading">
                Loading map data...
              </p>
              <p class="map-status error" v-else-if="mapError">
                {{ mapError }}
              </p>
              <p
                class="map-status"
                v-else-if="
                  !savedPharmacyDetails &&
                  !nearbyPharmacies.length &&
                  !mapLoading &&
                  !mapError
                "
              >
                Turn on location in your browser to see pharmacies near you.
              </p>
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

.map-status {
  margin-top: 0.4rem;
  font-size: 0.8rem;
  color: var(--color-subtle-text);
}

.map-status.error {
  color: #f97373;
}

/* ---------- ACTION BUTTONS LAYOUT ---------- */
.settings-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;      /* stacked */
  align-items: flex-start;     /* left aligned */
  gap: 10px;
}

.save-btn,
.btn-secondary {
  width: auto;
  padding: 0.7rem 1.6rem;
  border-radius: 999px;
}

/* primary button */
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

/* disabled state */
.save-btn:disabled {
  cursor: not-allowed !important;
  opacity: 0.6 !important;
  background: var(--color-border, #374151);
}

/* secondary button */
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

/* tooltip styles (for ℹ️) */
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
