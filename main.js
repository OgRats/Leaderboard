const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const cargando = ref(true);
        const holders = ref([]);
        const tiempo = ref({ horas: "00", minutos: "00", segundos: "00" });
        
        // Fecha de inicio del conteo para el cálculo de puntos
        const fechaInicioConteo = Math.floor(new Date("2026-06-25T00:00:00Z").getTime() / 1000);

        // Función principal para obtener los datos más recientes del mercado
        const cargarDatos = async () => {
            try {
                // Se realiza la petición al archivo generado por tu bot/API
                const response = await fetch('holders.json');
                if (!response.ok) throw new Error("No se pudo obtener el archivo de datos");
                
                const data = await response.json();
                if (Array.isArray(data)) {
                    holders.value = data;
                }
            } catch (e) {
                console.error("Error actualizando los datos del Leaderboard:", e);
            } finally {
                cargando.value = false;
            }
        };

        // Función matemática para procesar y asignar puntos
        const calcularPuntosActuales = (holder) => {
            const ahora = new Date();
            const hoyUTC = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
            const dias = Math.floor((hoyUTC - (fechaInicioConteo * 1000)) / (1000 * 60 * 60 * 24));
            return dias > 0 ? (dias * holder.balance) : 0;
        };

        // Ordena automáticamente el Top según el balance de la wallet
        const holdersOrdenados = computed(() => {
            return [...holders.value]
                .map(h => ({ ...h, puntosCalculados: calcularPuntosActuales(h) }))
                .sort((a, b) => b.balance - a.balance);
        });

        // Manejo visual de la cuenta regresiva en la interfaz
        const actualizarCuentaRegresiva = () => {
            const ahora = new Date();
            const mananaUTC = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1, 0, 0, 0));
            let totalSegundos = Math.floor((mananaUTC - ahora) / 1000);
            if (totalSegundos < 0) totalSegundos = 0;
            
            tiempo.value = {
                horas: String(Math.floor(totalSegundos / 3600)).padStart(2, '0'),
                minutos: String(Math.floor((totalSegundos % 3600) / 60)).padStart(2, '0'),
                segundos: String(totalSegundos % 60).padStart(2, '0')
            };
        };

        onMounted(async () => {
            // Ejecución inicial al cargar la página
            await cargarDatos();
            actualizarCuentaRegresiva();
            
            // Intervalo para el contador visual (Cada 1 segundo)
            setInterval(actualizarCuentaRegresiva, 1000);

            // AUTO-ACTUALIZACIÓN EN SEGUNDO PLANO
            // Configurado a 30 minutos (1800000 ms) para equilibrar frescura de datos y rendimiento
            setInterval(async () => {
                console.log("Sincronizando tabla con los últimos datos del mercado...");
                await cargarDatos();
            }, 1800000); 
        });

        return { 
            cargando, 
            holdersOrdenados, 
            tiempo, 
            formatearDireccion: (a) => a ? a.substring(0, 6) + '...' + a.substring(a.length - 4) : '' 
        };
    }
}).mount('#app');
              
