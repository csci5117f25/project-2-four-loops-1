<template>
  <div class="analytics-container">
    <header class="header-section card">
      <div class="header-top">
        <div>
          <h2 class="page-title">Adherence Analytics</h2>
          <p class="page-subtitle">{{ todayHeaderLabel }}</p>
        </div>
      </div>
    </header>

    <TabView v-model:activeIndex="activeIndex" class="report-tabs">
      <!-- TODAY -->
      <TabPanel header="Today">
        <div class="panel-shell card">
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="toolbar-title">Today</span>
              <span class="toolbar-subtitle">Doses scheduled for today</span>
            </div>

            <div class="toolbar-right">
              <span class="filter-label">Filter</span>
              <Dropdown
                v-model="selectedMedId"
                :options="medicineOptions"
                optionLabel="label"
                optionValue="value"
                optionDisabled="disabled"
                class="med-dd"
                panelClass="med-dd-panel"
                :placeholder="dropdownPlaceholder"
              />
            </div>
          </div>

          <div class="chart-wrap">
            <Chart type="bar" :data="todayChartData" :options="currentChartOptions" />
          </div>
        </div>
      </TabPanel>

      <!-- WEEKLY -->
      <TabPanel header="Weekly">
        <div class="panel-shell card">
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="toolbar-title">Weekly</span>
              <span class="toolbar-subtitle">Daily adherence this week</span>
            </div>

            <div class="toolbar-right">
              <span class="filter-label">Filter</span>
              <Dropdown
                v-model="selectedMedId"
                :options="medicineOptions"
                optionLabel="label"
                optionValue="value"
                optionDisabled="disabled"
                class="med-dd"
                panelClass="med-dd-panel"
                :placeholder="dropdownPlaceholder"
              />
            </div>
          </div>

          <div class="chart-wrap">
            <Chart type="bar" :data="weeklyChartData" :options="currentChartOptions" />
          </div>
        </div>
      </TabPanel>

      <!-- MONTHLY -->
      <TabPanel header="Monthly">
        <div class="panel-shell card">
          <div class="toolbar">
            <div class="toolbar-left">
              <span class="toolbar-title">Monthly</span>
              <span class="toolbar-subtitle">Week-by-week this month</span>
            </div>

            <div class="toolbar-right">
              <span class="filter-label">Filter</span>
              <Dropdown
                v-model="selectedMedId"
                :options="medicineOptions"
                optionLabel="label"
                optionValue="value"
                optionDisabled="disabled"
                class="med-dd"
                panelClass="med-dd-panel"
                :placeholder="dropdownPlaceholder"
              />
            </div>
          </div>

          <div class="chart-wrap">
            <Chart type="bar" :data="monthlyChartData" :options="currentChartOptions" />
          </div>
        </div>
      </TabPanel>
    </TabView>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount } from "vue";
import Dropdown from "primevue/dropdown";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import Chart from "primevue/chart";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/firebase_conf";
import { collection, getDocs, query, where } from "firebase/firestore";

const LOGS_COL = "logs";

const activeIndex = ref(0);
const meds = ref([]);
const selectedMedId = ref(null);

const todayChartData = ref(emptyChart());
const weeklyChartData = ref(emptyChart());
const monthlyChartData = ref(emptyChart());

const themeTick = ref(0);

/* ---------------- THEME HELPERS ---------------- */
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)?.trim();
  return v || fallback;
}

const chartColors = computed(() => {
  void themeTick.value;
  return {
    logged: cssVar("--color-primary-dark", "#6f8b74"),
    missed: cssVar("--color-border", "#e1ddd7"),
    grid: cssVar("--color-border", "#e1ddd7"),
    text: cssVar("--color-text", "#3b3a36"),
  };
});

/* ---------------- DATE HELPERS ---------------- */
function toDateStringLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

// parse YYYY-MM-DD as local date (fixes timezone off-by-1)
function toJSDate(x) {
  if (!x) return null;
  if (typeof x?.toDate === "function") return x.toDate();
  if (x instanceof Date) return x;

  if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) {
    const [yy, mm, dd] = x.split("-").map(Number);
    return new Date(yy, mm - 1, dd, 0, 0, 0, 0);
  }

  const d = new Date(x);
  return isNaN(d.getTime()) ? null : d;
}

const todayHeaderLabel = computed(() => {
  const d = new Date();
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(d);
});

/* ---------------- NORMALIZE MED DOC ---------------- */
function normalizeScheduleType(raw) {
  return String(raw || "Everyday").toLowerCase().trim().replace(/\s+|_|-/g, "");
}

function normalizeScheduleFromLegacy(scheduleType) {
  const t = normalizeScheduleType(scheduleType);
  if (t === "asneeded") return { type: "AsNeeded", data: {} };
  if (t === "everyday") return { type: "Everyday", data: {} };
  if (t === "specificdays") return { type: "SpecificDays", data: {} };
  if (t === "everyfewdays") return { type: "EveryFewDays", data: {} };
  if (t === "custom") return { type: "Custom", data: {} };
  return { type: "Everyday", data: {} };
}

function normalizeMed(docId, raw) {
  return {
    id: docId,
    ...raw,
    status: raw.status ?? "Active",
    // supports both schemas:
    times: Array.isArray(raw.times) ? raw.times : raw.time ? [raw.time] : [],
    schedule: raw.schedule ?? normalizeScheduleFromLegacy(raw.scheduleType),
    startDate: raw.startDate ?? null,
    endDate: raw.endDate ?? null,
  };
}

/* ---------------- SCHEDULE LOGIC ---------------- */
function isActiveInDateRange(med, dateObj) {
  const s = toJSDate(med.startDate);
  if (s) {
    s.setHours(0, 0, 0, 0);
    const t = new Date(dateObj);
    t.setHours(0, 0, 0, 0);
    if (t < s) return false;
  }

  const e = toJSDate(med.endDate);
  if (e) {
    e.setHours(23, 59, 59, 999);
    if (dateObj > e) return false;
  }

  return true;
}

function dowToNum(x) {
  if (typeof x === "number") return x;
  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const key = String(x || "").slice(0, 3).toLowerCase();
  return map[key];
}

function isScheduledOnDate(med, dateObj) {
  if ((med.status || "Active") !== "Active") return false;
  if (!isActiveInDateRange(med, dateObj)) return false;

  const schedule = med.schedule || {};
  const typeNorm = normalizeScheduleType(schedule.type || "Everyday");
  const data = schedule.data || {};

  if (typeNorm === "asneeded") return false;
  if (typeNorm === "everyday") return true;

  if (typeNorm === "specificdays") {
    const raw = Array.isArray(data.daysOfWeek) ? data.daysOfWeek : [];
    if (raw.length === 0) return false;
    const days = raw.map(dowToNum).filter((v) => v !== undefined);
    return days.includes(dateObj.getDay());
  }

  if (typeNorm === "everyfewdays") {
    const interval = Number(data.interval || 0);
    const start = toJSDate(data.startDate);
    if (!interval || !start) return false;

    start.setHours(0, 0, 0, 0);
    const target = new Date(dateObj);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target - start) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays % interval === 0;
  }

  if (typeNorm === "custom") {
    const dates = Array.isArray(data.dates) ? data.dates : [];
    if (dates.length === 0) return false;

    const ds = toDateStringLocal(dateObj);
    const normalizedDates = dates.map((x) => {
      const d = toJSDate(x);
      return d ? toDateStringLocal(d) : String(x);
    });
    return normalizedDates.includes(ds);
  }

  return false;
}

function buildExpectedSlotsForDate(med, dateObj) {
  if (!isScheduledOnDate(med, dateObj)) return [];
  const times = Array.isArray(med.times) ? med.times : [];
  const dateString = toDateStringLocal(dateObj);

  if (times.length === 0) return [{ key: `${dateString}_${med.id}_NO_TIME`, time: null }];
  return times.map((t) => ({ key: `${dateString}_${med.id}_${t}`, time: t }));
}

function buildLoggedKeySet(logs) {
  const set = new Set();
  for (const l of logs) {
    if (l.dateString && l.medicationId && l.scheduledTimeSlot) {
      set.add(`${l.dateString}_${l.medicationId}_${l.scheduledTimeSlot}`);
    }
    if (l.dateString && l.medicationId && (l.scheduledTimeSlot === null || l.scheduledTimeSlot === "")) {
      set.add(`${l.dateString}_${l.medicationId}_NO_TIME`);
    }
  }
  return set;
}

/* ---------------- FIRESTORE ---------------- */
let themeObserver = null;

onMounted(() => {
  themeObserver = new MutationObserver(() => (themeTick.value += 1));
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class"],
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    await loadMeds();
    await recomputeActiveTab();
  });
});

onBeforeUnmount(() => {
  if (themeObserver) themeObserver.disconnect();
});

async function loadMeds() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const subCandidates = ["medication", "medicine", "medications", "meds"];
  for (const colName of subCandidates) {
    const snap = await getDocs(collection(db, "users", uid, colName));
    if (snap.size > 0) {
      meds.value = snap.docs.map((d) => normalizeMed(d.id, d.data()));
      return;
    }
  }
  meds.value = [];
}

async function fetchLogsByDateStringRange(startStr, endStr, medIdOrAll) {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const constraints = [
    where("dateString", ">=", startStr),
    where("dateString", "<=", endStr),
  ];
  if (medIdOrAll && medIdOrAll !== "__NONE__") {
    constraints.push(where("medicationId", "==", medIdOrAll));
  }

  const qRef = query(collection(db, "users", uid, LOGS_COL), ...constraints);
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------------- DROPDOWN (NO "ALL MEDICINES" ITEM) ---------------- */
const dropdownPlaceholder = computed(() =>
  activeIndex.value === 0 ? "Today's medicines" : "Active medicines"
);

const medicineOptions = computed(() => {
  const activeMeds = (meds.value || []).filter((m) => (m.status || "Active") === "Active");
  const today = startOfDay(new Date());
  const isTodayTab = activeIndex.value === 0;

  const list = isTodayTab
    ? activeMeds.filter((m) => isScheduledOnDate(m, today))
    : activeMeds;

  list.sort((a, b) => (a.medicineName || "").localeCompare(b.medicineName || ""));

  if (list.length === 0) {
    return [
      {
        label: isTodayTab ? "No medicines due today" : "No active medicines found",
        value: "__NONE__",
        disabled: true,
      },
    ];
  }

  return list.map((m) => ({
    label: m.medicineName || "Unknown Name",
    value: m.id,
  }));
});

// On tab change: clear selection so placeholder shows
watch(activeIndex, () => {
  selectedMedId.value = null;
});

watch([activeIndex, selectedMedId], () => recomputeActiveTab());

/* ---------------- CHART OPTIONS ---------------- */
const currentChartOptions = computed(() => {
  void themeTick.value;
  const isToday = activeIndex.value === 0;

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "top",
        labels: { color: chartColors.value.text },
      },
      tooltip: { mode: "index", intersect: false },
    },
    scales: {
      x: {
        stacked: isToday,
        grid: { display: false },
        ticks: { color: chartColors.value.text, maxRotation: 0, minRotation: 0 },
      },
      y: {
        stacked: isToday,
        beginAtZero: true,
        ticks: { color: chartColors.value.text, precision: 0 },
        grid: { color: chartColors.value.grid },
      },
    },
  };
});

/* ---------------- COMPUTE ---------------- */
function getMedsToProcess() {
  const activeMeds = meds.value.filter((m) => (m.status || "Active") === "Active");
  const today = startOfDay(new Date());
  const isTodayTab = activeIndex.value === 0;

  // nothing selected => show default group
  if (!selectedMedId.value || selectedMedId.value === "__NONE__") {
    return isTodayTab
      ? activeMeds.filter((m) => isScheduledOnDate(m, today))
      : activeMeds;
  }

  return activeMeds.filter((m) => m.id === selectedMedId.value);
}

async function recomputeActiveTab() {
  if (activeIndex.value === 0) await computeToday();
  else if (activeIndex.value === 1) await computeWeekly();
  else await computeMonthly();
}

async function computeToday() {
  const today = startOfDay(new Date());
  const ds = toDateStringLocal(today);

  const medsList = getMedsToProcess();
  const logs = await fetchLogsByDateStringRange(ds, ds, selectedMedId.value);
  const loggedKeys = buildLoggedKeySet(logs);

  let totalScheduled = 0;
  let totalTaken = 0;

  for (const m of medsList) {
    const slots = buildExpectedSlotsForDate(m, today);
    totalScheduled += slots.length;
    for (const slot of slots) if (loggedKeys.has(slot.key)) totalTaken += 1;
  }

  todayChartData.value = {
    labels: ["Today"],
    datasets: [
      { label: "Logged", data: [totalTaken], backgroundColor: chartColors.value.logged, borderRadius: 8 },
      {
        label: "Not Logged",
        data: [Math.max(0, totalScheduled - totalTaken)],
        backgroundColor: chartColors.value.missed,
        borderRadius: 8,
      },
    ],
  };
}

async function computeWeekly() {
  const today = startOfDay(new Date());
  const day = today.getDay();
  const diffToMon = day === 0 ? 6 : day - 1;

  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMon);

  const startStr = toDateStringLocal(monday);
  const endStr = toDateStringLocal(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));

  const medsList = getMedsToProcess();
  const logs = await fetchLogsByDateStringRange(startStr, endStr, selectedMedId.value);
  const loggedKeys = buildLoggedKeySet(logs);

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const takenData = [];
  const missedData = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);

    if (d > new Date()) {
      takenData.push(0);
      missedData.push(0);
      continue;
    }

    let dailyExpected = 0;
    let dailyTaken = 0;

    for (const m of medsList) {
      const slots = buildExpectedSlotsForDate(m, d);
      dailyExpected += slots.length;
      for (const slot of slots) if (loggedKeys.has(slot.key)) dailyTaken += 1;
    }

    takenData.push(dailyTaken);
    missedData.push(Math.max(0, dailyExpected - dailyTaken));
  }

  weeklyChartData.value = {
    labels,
    datasets: [
      { label: "Logged", data: takenData, backgroundColor: chartColors.value.logged, borderRadius: 8 },
      { label: "Not Logged", data: missedData, backgroundColor: chartColors.value.missed, borderRadius: 8 },
    ],
  };
}

async function computeMonthly() {
  const today = startOfDay(new Date());
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const startStr = toDateStringLocal(firstDay);
  const endStr = toDateStringLocal(lastDay);

  const medsList = getMedsToProcess();
  const logs = await fetchLogsByDateStringRange(startStr, endStr, selectedMedId.value);
  const loggedKeys = buildLoggedKeySet(logs);

  const labels = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"];
  const takenBuckets = [0, 0, 0, 0, 0];
  const missedBuckets = [0, 0, 0, 0, 0];

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (d > new Date()) break;
    const bucketIndex = Math.floor((d.getDate() - 1) / 7);

    for (const m of medsList) {
      const slots = buildExpectedSlotsForDate(m, d);
      let dayTaken = 0;
      for (const slot of slots) if (loggedKeys.has(slot.key)) dayTaken += 1;

      if (bucketIndex < 5) {
        takenBuckets[bucketIndex] += dayTaken;
        missedBuckets[bucketIndex] += Math.max(0, slots.length - dayTaken);
      }
    }
  }

  monthlyChartData.value = {
    labels,
    datasets: [
      { label: "Logged", data: takenBuckets, backgroundColor: chartColors.value.logged, borderRadius: 8 },
      { label: "Not Logged", data: missedBuckets, backgroundColor: chartColors.value.missed, borderRadius: 8 },
    ],
  };
}

function emptyChart() {
  return { labels: [], datasets: [] };
}
</script>

<style scoped>
/* Layout */
.analytics-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 18px 18px 40px;
  color: var(--color-text);
}

.header-section {
  padding: 18px 18px 14px;
  margin-bottom: 10px;
}

.header-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 900;
  letter-spacing: -0.02em;
}

.page-subtitle {
  margin: 6px 0 0;
  color: var(--color-subtle-text);
  font-size: 0.95rem;
}

/* Panel */
.panel-shell {
  padding: 14px 14px 16px;
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 10px 12px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 240px;
}

.toolbar-title {
  font-weight: 900;
  font-size: 1.05rem;
}

.toolbar-subtitle {
  color: var(--color-subtle-text);
  font-size: 0.9rem;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-left: auto;
}

.filter-label {
  font-size: 0.9rem;
  color: var(--color-subtle-text);
  font-weight: 800;
}

.med-dd {
  width: 280px;
  min-width: 240px;
}

/* Chart */
.chart-wrap {
  height: 380px;
  padding: 8px 10px 4px;
}

/* =========================
   TABS = REAL PILL TABS
   ========================= */
:deep(.report-tabs .p-tabview-nav) {
  background: transparent;
  border: none;
  display: flex;
  gap: 10px;
  padding: 10px 4px 0;
  margin: 0;
  flex-wrap: wrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
:deep(.report-tabs .p-tabview-nav::-webkit-scrollbar) {
  display: none;
}

:deep(.report-tabs .p-tabview-nav li) {
  margin: 0;
}

:deep(.report-tabs .p-tabview-nav li .p-tabview-nav-link) {
  background: var(--color-card) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: var(--radius-pill) !important;
  padding: 10px 18px !important;

  font-weight: 900 !important;
  font-size: 1.05rem;
  color: var(--color-subtle-text) !important;

  box-shadow: var(--shadow-soft);
  transition: all 0.18s ease;
  white-space: nowrap;
}

:deep(.report-tabs .p-tabview-nav li .p-tabview-nav-link:hover) {
  background: color-mix(in srgb, var(--color-primary) 18%, var(--color-card)) !important;
  border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border)) !important;
  color: var(--color-text) !important;
  transform: translateY(-1px);
}

:deep(.report-tabs .p-tabview-nav li.p-highlight .p-tabview-nav-link) {
  background: color-mix(in srgb, var(--color-primary) 30%, var(--color-card)) !important;
  border-color: var(--color-primary) !important;
  color: var(--color-text) !important;
  box-shadow: var(--shadow-medium);
  transform: translateY(-1px);
}

/* Remove PrimeVue underline indicator */
:deep(.report-tabs .p-tabview-nav li.p-highlight .p-tabview-nav-link::after) {
  display: none !important;
}

:deep(.report-tabs .p-tabview-panels) {
  padding: 14px 0 0;
  background: transparent;
}

/* Dropdown theme */
:deep(.p-dropdown) {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  box-shadow: none;
  width: 100%;
}

:deep(.p-dropdown:not(.p-disabled):hover) {
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
}

:deep(.p-dropdown.p-focus) {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 24%, transparent);
}

:deep(.p-dropdown .p-dropdown-label) {
  color: var(--color-text);
  font-weight: 700;
}

:deep(.med-dd-panel.p-dropdown-panel) {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-medium);
  overflow: hidden;
  max-width: calc(100vw - 24px);
}

:deep(.med-dd-panel .p-dropdown-items) {
  padding: 6px;
}

:deep(.med-dd-panel .p-dropdown-item) {
  border-radius: 10px;
  margin: 2px 0;
  color: var(--color-text);
}

:deep(.med-dd-panel .p-dropdown-item:not(.p-disabled):hover) {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
}

:deep(.med-dd-panel .p-dropdown-item.p-highlight) {
  background: color-mix(in srgb, var(--color-primary) 22%, transparent);
}

/* Responsive */
@media (max-width: 720px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .toolbar-left {
    min-width: 0;
  }

  .toolbar-right {
    width: 100%;
    justify-content: space-between;
  }

  .med-dd {
    width: 100%;
    min-width: 0;
  }

  .chart-wrap {
    height: 320px;
    padding: 6px 6px 2px;
  }

  :deep(.report-tabs .p-tabview-nav li .p-tabview-nav-link) {
    width: 100%;
    justify-content: center;
    padding: 10px 14px !important;
    font-size: 1rem;
  }
}

@media (max-width: 480px) {
  .analytics-container {
    padding: 12px 10px 28px;
  }

  .chart-wrap {
    height: 280px;
  }
}
</style>
