<template>
  <div class="analytics-container">
    <div class="header-section">
      <h2 class="text-2xl font-bold mb-4">Adherence Analytics</h2>
    </div>

    <TabView v-model:activeIndex="activeIndex" class="report-tabs">
      
      <TabPanel header="Today">
        <div class="toolbar">
          <span class="p-float-label-mock">Filter:</span>
          <Dropdown
            v-model="selectedMedId"
            :options="medicineOptions"
            optionLabel="label"
            optionValue="value"
            class="med-dd"
            :placeholder="dropdownPlaceholder"
          />
        </div>

        <div class="chart-container">
          <Chart type="bar" :data="todayChartData" :options="currentChartOptions" />
        </div>
      </TabPanel>

      <TabPanel header="Weekly">
        <div class="toolbar">
          <span class="p-float-label-mock">Filter:</span>
          <Dropdown
            v-model="selectedMedId"
            :options="medicineOptions"
            optionLabel="label"
            optionValue="value"
            class="med-dd"
            :placeholder="dropdownPlaceholder"
          />
        </div>

        <div class="chart-container">
          <Chart type="bar" :data="weeklyChartData" :options="currentChartOptions" />
        </div>
      </TabPanel>

      <TabPanel header="Monthly">
        <div class="toolbar">
          <span class="p-float-label-mock">Filter:</span>
          <Dropdown
            v-model="selectedMedId"
            :options="medicineOptions"
            optionLabel="label"
            optionValue="value"
            class="med-dd"
            :placeholder="dropdownPlaceholder"
          />
        </div>

        <div class="chart-container">
          <Chart type="bar" :data="monthlyChartData" :options="currentChartOptions" />
        </div>
      </TabPanel>
    </TabView>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import Dropdown from "primevue/dropdown";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import Chart from "primevue/chart";
import { onAuthStateChanged } from "firebase/auth"; // Import auth listener

// Firebase imports
import { auth, db } from "@/firebase_conf"; 
import { collection, getDocs, query, where } from "firebase/firestore";

/** Constants */
const MEDS_COL = "medication";
const LOGS_COL = "logs";

/** State */
const activeIndex = ref(0); 
const meds = ref([]);
const selectedMedId = ref("ALL");

/** Chart Data Refs */
const todayChartData = ref(emptyTodayChart());
const weeklyChartData = ref(emptyWeeklyChart());
const monthlyChartData = ref(emptyMonthlyChart());

/** 1. DYNAMIC CHART OPTIONS (Hides Legend for Today) */
const currentChartOptions = computed(() => {
  const isToday = activeIndex.value === 0;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        display: !isToday, // Hide "undefined" legend on Today view
        position: "top" 
      },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: { 
        grid: { display: false },
        ticks: { maxRotation: 0, minRotation: 0 } 
      },
      y: { 
        beginAtZero: true, 
        ticks: { precision: 0 },
        grid: { color: '#f3f4f6' }
      },
    },
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

/* ---------------- SCHEDULE LOGIC ---------------- */
function isScheduledOnDate(med, dateObj) {
  const schedule = med.schedule || {};
  const type = schedule.type || "Everyday";
  const data = schedule.data || {};

  if (med.status !== "Active") return false;
  if (type === "AsNeeded") return false;
  if (type === "Everyday") return true;

  if (type === "SpecificDays") {
    const dow = dateObj.getDay(); 
    const days = Array.isArray(data.daysOfWeek) ? data.daysOfWeek : [];
    return days.includes(dow);
  }

  if (type === "EveryFewDays") {
    const interval = Number(data.interval || 0);
    if (!interval || !data.startDate) return false;
    const start = new Date(data.startDate); start.setHours(0,0,0,0);
    const target = new Date(dateObj); target.setHours(0,0,0,0);
    const diffDays = Math.round((target - start) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays % interval === 0;
  }

  if (type === "Custom") {
    const ds = toDateStringLocal(dateObj);
    return (data.dates || []).includes(ds);
  }
  return true;
}

function buildExpectedSlotsForDate(med, dateObj) {
  if (!isScheduledOnDate(med, dateObj)) return [];
  const times = Array.isArray(med.times) ? med.times : [];
  const dateString = toDateStringLocal(dateObj);
  return times.map((t) => ({ key: `${dateString}_${med.id}_${t}`, time: t }));
}

function buildLoggedKeySet(logs) {
  const set = new Set();
  for (const l of logs) {
    if (l.dateString && l.medicationId && l.scheduledTimeSlot) {
      set.add(`${l.dateString}_${l.medicationId}_${l.scheduledTimeSlot}`);
    }
  }
  return set;
}

/* ---------------- FIRESTORE ---------------- */
// Fix: Ensure we wait for Auth before loading
onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loadMeds().then(() => recomputeActiveTab());
    }
  });
});

async function loadMeds() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    const snap = await getDocs(collection(db, "users", uid, MEDS_COL));
    meds.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error loading meds:", e);
  }
}

async function fetchLogsByDateStringRange(startStr, endStr, medIdOrAll) {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  
  const constraints = [
    where("dateString", ">=", startStr),
    where("dateString", "<=", endStr)
  ];
  if (medIdOrAll && medIdOrAll !== "ALL") {
    constraints.push(where("medicationId", "==", medIdOrAll));
  }
  
  const qRef = query(collection(db, "users", uid, LOGS_COL), ...constraints);
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------------- UI LOGIC ---------------- */

// 2. FIXED DROPDOWN PLACEHOLDER
const dropdownPlaceholder = computed(() => {
  return activeIndex.value === 0 ? "Today's Medicine" : "Active Medicines";
});

const medicineOptions = computed(() => {
  // Guard clause: if meds aren't loaded yet, return empty
  if (!meds.value || meds.value.length === 0) return [{ label: "All", value: "ALL" }];

  const activeMeds = meds.value.filter((m) => m.status === "Active");
  const today = startOfDay(new Date());

  let list = [];
  if (activeIndex.value === 0) {
    list = activeMeds.filter((m) => isScheduledOnDate(m, today));
  } else {
    list = activeMeds;
  }

  list.sort((a, b) => (a.medicineName || "").localeCompare(b.medicineName || ""));

  return [
    { label: "All Medicines", value: "ALL" },
    ...list.map((m) => ({ label: m.medicineName || "Unknown Name", value: m.id })),
  ];
});

watch([activeIndex, selectedMedId], () => recomputeActiveTab());

/* ---------------- COMPUTATIONS ---------------- */

async function recomputeActiveTab() {
  if (activeIndex.value === 0) await computeToday();
  else if (activeIndex.value === 1) await computeWeekly();
  else if (activeIndex.value === 2) await computeMonthly();
}

function getMedsToProcess() {
  const activeMeds = meds.value.filter(m => m.status === "Active");
  if (selectedMedId.value === "ALL") return activeMeds;
  return activeMeds.filter(m => m.id === selectedMedId.value);
}

// 3. FIXED TODAY CHART (Removed "undefined")
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
    slots.forEach(slot => { if (loggedKeys.has(slot.key)) totalTaken++; });
  }

  const notLogged = Math.max(0, totalScheduled - totalTaken);

  todayChartData.value = {
    labels: ["Logged", "Not Logged"],
    datasets: [{ 
      label: 'Doses', // Label is required even if legend is hidden
      data: [totalTaken, notLogged],
      backgroundColor: ['#374151', '#9CA3AF'], // Dark Gray & Light Gray (Matching screenshot style)
      borderRadius: 5
    }],
  };
}

async function computeWeekly() {
  // ... (Keep existing Weekly logic, just update Colors if desired)
  const today = startOfDay(new Date());
  const day = today.getDay(); 
  const diffToMon = (day === 0 ? 6 : day - 1); 
  const monday = new Date(today); monday.setDate(today.getDate() - diffToMon);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);

  const startStr = toDateStringLocal(monday);
  const endStr = toDateStringLocal(sunday);

  const medsList = getMedsToProcess();
  const logs = await fetchLogsByDateStringRange(startStr, endStr, selectedMedId.value);
  const loggedKeys = buildLoggedKeySet(logs);

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const takenData = [];
  const missedData = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    let dailyExpected = 0; let dailyTaken = 0;
    
    // Don't chart future
    if (d > new Date()) { 
        takenData.push(0); missedData.push(0); 
    } else {
        for (const m of medsList) {
            const slots = buildExpectedSlotsForDate(m, d);
            dailyExpected += slots.length;
            slots.forEach(slot => { if (loggedKeys.has(slot.key)) dailyTaken++; });
        }
        takenData.push(dailyTaken);
        missedData.push(Math.max(0, dailyExpected - dailyTaken));
    }
  }

  weeklyChartData.value = {
    labels,
    datasets: [
      { label: "Logged", data: takenData, backgroundColor: '#374151' },
      { label: "Not Logged", data: missedData, backgroundColor: '#9CA3AF' },
    ],
  };
}

async function computeMonthly() {
  // ... (Keep existing Monthly logic)
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
      slots.forEach(slot => { if (loggedKeys.has(slot.key)) dayTaken++; });
      if (bucketIndex < 5) {
        takenBuckets[bucketIndex] += dayTaken;
        missedBuckets[bucketIndex] += Math.max(0, slots.length - dayTaken);
      }
    }
  }

  monthlyChartData.value = {
    labels,
    datasets: [
      { label: "Logged", data: takenBuckets, backgroundColor: '#374151' },
      { label: "Not Logged", data: missedBuckets, backgroundColor: '#9CA3AF' },
    ],
  };
}

function emptyTodayChart() { return { labels: [], datasets: [] }; }
function emptyWeeklyChart() { return { labels: [], datasets: [] }; }
function emptyMonthlyChart() { return { labels: [], datasets: [] }; }
</script>

<style scoped>
.analytics-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Inter', sans-serif;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.med-dd {
  width: 250px;
}

.p-float-label-mock {
  font-size: 0.9rem;
  color: #666;
  font-weight: 500;
}

.chart-container {
  height: 400px;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border: 1px solid #f3f4f6;
}

/* =========================================
   REPORT TABS STYLING (Matches Screenshot)
   ========================================= */

/* Clear default tab header background/border */
:deep(.report-tabs .p-tabview-nav) {
  background: transparent;
  border-bottom: 2px solid #e5e7eb; /* Light gray base line */
}

/* Base style for Tab Links (Inactive) */
:deep(.report-tabs .p-tabview-nav li .p-tabview-nav-link) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: #6b7280 !important; /* Gray text */
  font-weight: 600; /* Slightly bolder */
  font-size: 1.1rem;
  padding: 1rem 1.5rem;
  transition: all 0.2s ease;
}

/* Active Tab Style */
:deep(.report-tabs .p-tabview-nav li.p-highlight .p-tabview-nav-link) {
  color: #1f2937 !important; /* Dark Gray / Black Text */
  border-bottom: 4px solid #374151 !important; /* Thick Dark Underline */
  background: transparent !important;
}

/* Target the inner span to ensure color applies */
:deep(.report-tabs .p-tabview-nav li.p-highlight .p-tabview-nav-link span) {
  color: #1f2937 !important;
}

/* Hover Effect */
:deep(.report-tabs .p-tabview-nav li:not(.p-highlight) .p-tabview-nav-link:hover) {
  color: #374151 !important;
}

:deep(.p-tabview-panels) {
  padding: 1.5rem 0;
  background: transparent;
}
</style>