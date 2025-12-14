<script setup>
import { ref, computed, onMounted } from "vue";
import { collection, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/firebase_conf";
import { logDose, unLogDose } from "@/firebase/firebase_service.js";


const slots = ref([]);
const viewMode = ref("time"); // "time" | "med"


function todayString() {
    return new Date().toISOString().split("T")[0];
}

function normalizeTimes(med) {
    if (Array.isArray(med.times)) return med.times;
    if (typeof med.times === "string") return [med.times];
    if (typeof med.time === "string") return [med.time];
    return [];
}

/* LOAD DAILY DATA */
async function loadTodaySlots() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    slots.value = [];

    // Fetch medications
    const medsSnap = await getDocs(
        collection(db, "users", uid, "medications")
    );

    const meds = medsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => m.status !== "Deleted");

    // Fetch today's logs
    const logsSnap = await getDocs(
        query(
            collection(db, "users", uid, "logs"),
            where("dateString", "==", todayString())
        )
    );

    const takenSet = new Set(logsSnap.docs.map(d => d.id));

    const result = [];

    meds.forEach(med => {
        const timesArray = normalizeTimes(med);

        timesArray.forEach(time => {
            const logId = `${todayString()}_${med.id}_${time}`;
            result.push({
                medications: med,
                time,
                isTaken: takenSet.has(logId),
            });
        });
    });

    slots.value = result;
}


onMounted(() => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadTodaySlots();
        } else {
            slots.value = [];
        }
    });
});

/* GROUPED VIEWS */
const chronological = computed(() =>
    [...slots.value].sort((a, b) => a.time.localeCompare(b.time))
);

const grouped = computed(() => {
    const map = {};
    slots.value.forEach(s => {
        if (!map[s.medications.id]) {
            map[s.medications.id] = {
                medications: s.medications,
                items: [],
            };
        }
        map[s.medications.id].items.push(s);
    });
    return Object.values(map);
});

/*ACTION FUNCTIONS */
async function handleLog(slot) {
    await logDose(slot);
    slot.isTaken = true;
}

async function handleUndo(slot) {
    await unLogDose(slot);
    slot.isTaken = false;
}
</script>

<template>
    <section class="card">
        <header class="header">
            <h2>Today</h2>
            <select v-model="viewMode">
                <option value="time">Chronological</option>
                <option value="med">By Medication</option>
            </select>
        </header>

        <!-- Chronological View -->
        <div v-if="viewMode === 'time'">
            <div v-for="slot in chronological" :key="slot.medications.id + slot.time" class="group">
                <h3>{{ slot.medications.medicineName }}</h3>
                <div class="dose-row">
                    <div class="dose-left">
                        <div class="dose-time">{{ slot.time }}</div>
                        <div class="dose-main">
                            <div class="dose-name">{{ slot.medications.medicineName }}</div>
                            <div class="dose-meta">
                                {{ slot.medications.doseQuantity || 1 }}
                                {{ slot.medications.unit || "dose" }}•{{ slot.medications.form || "Medication" }}
                            </div>
                            <div class="dose-stock">
                                Remaining: {{ slot.medications.currentInventory }}
                            </div>
                        </div>
                    </div>
                    <div class="dose-action">
                        <button v-if="!slot.isTaken" @click="handleLog(slot)">Log</button>
                        <button v-else @click="handleUndo(slot)">Undo</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Grouped View -->
        <div v-else>
            <div v-for="group in grouped" :key="group.medications.id" class="group">
                <h3>{{ group.medications.medicineName }}</h3>

                <div v-for="dose in group.items" :key="dose.medications.id + dose.time" class="dose-row">
                    <div class="dose-left">
                        <div class="dose-time">{{ dose.time }}</div>

                        <div class="dose-main">
                            <div class="dose-name">
                                {{ dose.medications.medicineName }}
                            </div>

                            <div class="dose-meta">
                                {{ dose.medications.doseQuantity || 1 }}
                                {{ dose.medications.unit || "dose" }}
                                • {{ dose.medications.form || "Medication" }}
                            </div>

                            <div class="dose-stock">
                                Remaining: {{ dose.medications.currentInventory }}
                            </div>
                        </div>
                    </div>

                    <div class="dose-action">
                        <button v-if="!dose.isTaken" @click="handleLog(dose)">
                            Log
                        </button>
                        <button v-else @click="handleUndo(dose)">
                            Undo
                        </button>
                    </div>
                </div>
            </div>
        </div>

    </section>
</template>

<style scoped>
.card {
    background: var(--color-card);
    padding: 1.5rem;
    border-radius: 16px;
    margin: 1.5rem auto;
    max-width: 1100px;
    width: 100%;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.dose-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.dose-left {
    display: flex;
    gap: 1.25rem;
    ;
}

.dose-time {
    font-weight: 600;
    min-width: 90px;
    color: var(--color-primary);
}

.dose-main {
    display: flex;
    flex-direction: column;
    gap: 0.25rem
}

.dose-name {
    font-size: 1rem;
    font-weight: 600;
}

.dose-meta {
    font-size: 0.85rem;
    opacity: 0.85;
}

.dose-stock {
    font-size: 0.8rem;
    opacity: 0.7;
}

.dose-action button {
    border-radius: 999px;
    padding: 0.4rem 1rem;
    border: none;
    cursor: pointer;
    font-weight: 500;
}
</style>
