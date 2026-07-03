const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const cargando = ref(true);
        const tiempo = ref({ horas: "00", minutos: "00", segundos: "00" });
        
        // Fecha de inicio del conteo (Año 2026)
        const fechaInicioConteo = Math.floor(new Date("2026-06-25T00:00:00Z").getTime() / 1000);

        // BASE DE DATOS DE HOLDERS REALES (Agrega aquí las direcciones y cantidades de tu comunidad)
        const holders = ref([
            { "address": "0x953e34637cc596b8195eb7fb83305402d3b9d000", "balance": 150 },
            { "address": "0x742d35cc6634c0532925a3b844bc454e4438f44e", "balance": 95 },
            { "address": "0x1234567890abcdef1234567890abcdef12345678", "balance": 42 },
            { "address": "0xabcdef1234567890abcdef1234567890abcdef12", "balance": 20 }
        ]);

        const calcularPuntosActuales = (holder) => {
            const ahora = new Date();
            const hoyUTC = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
            const dias = Math.floor((hoyUTC - (fechaInicioConteo * 1000)) / (1000 * 60 * 60 * 24));
            return dias > 0 ? (dias * holder.balance) : 0;
        };

        // Ordena automáticamente el Top 100 de mayor a menor balance
        const holdersOrdenados = computed(() => {
            return [...holders.value]
                .map(h => ({ ...h, puntosCalculados: calcularPuntosActuales(h) }))
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 100);
        });

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

        onMounted(() => {
            // Carga inmediata sin esperas de red
            cargando.value = false;
            actualizarCuentaRegresiva();
            setInterval(actualizarCuentaRegresiva, 1000);
        });

        return { 
            cargando, 
            holdersOrdenados, 
            tiempo, 
            formatearDireccion: (a) => a ? a.substring(0, 6) + '...' + a.substring(a.length - 4) : '' 
        };
    }
}).mount('#app');
