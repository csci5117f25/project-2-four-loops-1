import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "@/firebase_conf";

const getUserID = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("No user logged in");
  }
  return uid;
};

export const getMedsCollectionRef = () => {
  const uid = getUserID();
  return collection(db, "users", uid, "medications");
};

export const saveMeds = async (data) => {
  const uid = getUserID();
  console.log(uid);
  const colRef = collection(db, "users", uid, "medications");

  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  return await addDoc(colRef, payload);
};

export const getAllMeds = async () => {
  const colRef = getMedsCollectionRef();
  const snapshot = await getDocs(colRef);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
};

export const updateMeds = async (id, data) => {
  const uid = getUserID();
  const docRef = doc(db, "users", uid, "medications", id);
  return await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const getMedsById = async (id) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw Error("User not logged in");

  const docRef = doc(db, "users", uid, "medications", id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) throw Error("Medication not found");

  return { id: snapshot.id, ...snapshot.data() };
};

export const deleteMedById = async (id) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw Error("User is not logged in");

  try {
    const docRef = doc(db, "users", uid, "medications", id);
    await deleteDoc(docRef);
    return { success: true };
  } catch (err) {
    console.error("Could not delete medicine", err);
    return { success: false, error: err };
  }
};

function todayString() {
  return new Date().toISOString().split("T")[0];
}

function normalizeNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/\D/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

/* LOG DOSE */
export async function logDose(slot) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");

  const med = slot.medications;
  const dateStr = todayString();
  const logId = `${dateStr}_${med.id}_${slot.time}`;

  const medRef = doc(db, "users", uid, "medications", med.id);
  const logRef = doc(db, "users", uid, "logs", logId);

  await runTransaction(db, async (tx) => {
    const medSnap = await tx.get(medRef);
    if (!medSnap.exists()) throw new Error("Medication not found");

    const medData = medSnap.data();

    const currentInventory = normalizeNumber(medData.currentInventory);
    const doseQuantity = normalizeNumber(medData.doseQuantity);

    if (currentInventory < doseQuantity) {
      throw new Error("Not enough inventory");
    }

    tx.set(logRef, {
      medicationId: med.id,
      scheduledTimeSlot: slot.time,
      dateString: dateStr,
      action: "TAKEN",
      takenAt: Timestamp.now(),
      dosageTaken: doseQuantity,
    });

    tx.update(medRef, {
      currentInventory: currentInventory - doseQuantity,
      updatedAt: Timestamp.now(),
    });
  });
}

/* -------------------------
   UNDO DOSE
------------------------- */
export async function unLogDose(slot) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");

  const med = slot.medications;
  const dateStr = todayString();
  const logId = `${dateStr}_${med.id}_${slot.time}`;

  const medRef = doc(db, "users", uid, "medications", med.id);
  const logRef = doc(db, "users", uid, "logs", logId);

  await runTransaction(db, async (tx) => {
    const medSnap = await tx.get(medRef);
    if (!medSnap.exists()) throw new Error("Medication not found");

    const medData = medSnap.data();
    const doseQuantity = normalizeNumber(medData.doseQuantity);
    const currentInventory = normalizeNumber(medData.currentInventory);

    tx.delete(logRef);

    tx.update(medRef, {
      currentInventory: currentInventory + doseQuantity,
      updatedAt: Timestamp.now(),
    });
  });
}
