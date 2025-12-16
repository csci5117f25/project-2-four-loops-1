<script setup>


import { onMounted, ref } from "vue";
import { getAllMeds } from "@/firebase/firebase_service";




const medications = ref([]);
const loadMeds = async () => {
   medications.value = await getAllMeds();
   console.log(medications);
};


onMounted(loadMeds)


</script>


<template>
   <div class="stocks-page">
       <h2 class="page-title">Stocks</h2>
       <div class="stocks-container">
           <h3 class="section-title">Medications</h3>
           <div class="stocks">




               <div class="stock" v-for="med in medications" :key="med.id">
                   <div class="stock-card">
                       <div class="stock-title">
                           <div>
                               <p>{{ med.medicineName }}</p>
                           </div>
                           <div>
                               <p>Dosage: {{ med.doseQuantity || '—'  }}</p>     
                           </div>
                       </div>
                      
                       <div class="stack-description">
                           <p v-if=" med.currentInventory <= parseInt(med.refillThreshold) " class="low-stock-warning">
                                ⚠️ Low stock: ({{ med.currentInventory }}
                  {{ med.unit || "" }} remaining)
                           </p>
                           <p v-else>
                                Stock: {{  med.currentInventory || "-"}}
                           </p>
                           <p>
                               Expiration Date: {{  med.expiryDate || "-"}}
                           </p>
                           <p>

                               Refill ETA: {{ med.refillThreshold || "-" }}
                           </p>
                       </div>
                   </div>
               </div>


           </div>


          
       </div>
   </div>
</template>


<style scoped>
.stocks-page {
 padding: 1rem;
 display: flex;
 flex-direction: column;
 align-items: center;
 padding-bottom: 4rem;
}


.page-title {
 width: 100%;
 max-width: 800px;
 margin-bottom: 1rem;
 font-size: 1.4rem;
 font-weight: 700;
}

.stocks {
 display: grid;
 grid-template-columns: auto auto auto;
 gap: 10px;
}


.stocks-container{
 width: 100%;
 max-width: 800px;
 background: var(--color-card);
 border: 1px solid var(--color-border);
 border-radius: var(--radius-lg);
 border: 1px solid var(--color-border);
 padding: 1.5rem;
}


.stocks-container:hover{
   box-shadow: var(--shadow-soft);
   transition: box-shadow 0.25s ease;
}

.low-stock-warning {
  margin-top: 4px;
  font-size: 0.7rem;
  color: #f59e0b;
  font-weight: 800;
}

.stock {
 background-color: #f1f1f1;
 border: 1px solid black;
 border-radius: 10px;
 padding: 10px;
 font-size: 30px;
 width: 205px;
 height: 150px;
 border-radius: var(--radius-lg);
 border: 1px solid var(--color-border);
 }


.stock:hover{
   box-shadow: var(--shadow-soft);
   transition: box-shadow 0.25s ease;
}


.stock-card{
   display: inline;
}


.stock-title{
   display: flex;
   margin-bottom: 1rem;
   font-size: .6rem;
   font-weight: 600;
   justify-content: space-between;
}


.stack-description{
   margin-bottom: .5rem;
   font-size: .6rem;
   font-weight: 600;
}


@media (max-width: 768px) {
  
    .stocks-page {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-bottom: 4rem;
    }


    .page-title {
    width: 100%;
    max-width: 800px;
    margin-bottom: 1rem;
    font-size: 1.4rem;
    font-weight: 700;
    }

    .stocks {
    display: grid;
    grid-template-columns: auto auto;
    gap: 10px;
    }


    .stocks-container{
    width: 100%;
    max-width: 800px;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    padding: 1.5rem;
    }


    .stocks-container:hover{
    box-shadow: var(--shadow-soft);
    transition: box-shadow 0.25s ease;
    }


    .stock {
    background-color: #f1f1f1;
    border: 1px solid black;
    border-radius: 10px;
    padding: 10px;
    font-size: 30px;
    width: 205px;
    height: 150px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    }


    .stock:hover{
    box-shadow: var(--shadow-soft);
    transition: box-shadow 0.25s ease;
    }


    .stock-card{
    display: inline;
    }


    .stock-title{
    display: flex;
    margin-bottom: 1rem;
    font-size: .6rem;
    font-weight: 600;
    justify-content: space-between;
    }


    .stack-description{
    margin-bottom: .5rem;
    font-size: .6rem;
    font-weight: 600;
    }


}

@media (max-width: 350px) {
  
    .stocks-page {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-bottom: 4rem;
    }


    .page-title {
    width: 100%;
    max-width: 800px;
    margin-bottom: 1rem;
    font-size: 1.4rem;
    font-weight: 700;
    }

    .stocks {
    display: flex;
    flex-direction: column;
    gap: 10px;
    }


    .stocks-container{
    width: 100%;
    max-width: 800px;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    padding: 1.5rem;
    }


    .stocks-container:hover{
    box-shadow: var(--shadow-soft);
    transition: box-shadow 0.25s ease;
    }


    .stock {
    background-color: #f1f1f1;
    border: 1px solid black;
    border-radius: 10px;
    padding: 10px;
    font-size: 30px;
    width: 205px;
    height: 150px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    }


    .stock:hover{
    box-shadow: var(--shadow-soft);
    transition: box-shadow 0.25s ease;
    }


    .stock-card{
    display: inline;
    }


    .stock-title{
    display: flex;
    margin-bottom: 1rem;
    font-size: .6rem;
    font-weight: 600;
    justify-content: space-between;
    }


    .stack-description{
    margin-bottom: .5rem;
    font-size: .6rem;
    font-weight: 600;
    }


}

</style>