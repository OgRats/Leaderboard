const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const cargando = ref(true);
        const holders = ref([]);
        const tiempo = ref({ horas: "00", minutos: "00", segundos: "00" });
        
        // Fecha de inicio para el cálculo acumulativo de tus puntos (Año 2026)
        const fechaInicioConteo = Math.floor(new Date("2026-06-25T00:00:00Z").getTime() / 1000);

        // CONFIGURACIÓN OFICIAL DE SINCRONIZACIÓN CON EL MARKETPLACE
        const contratoOgRats = "0x953e34637cc596b8195eb7fb83305402d3b9d000";
        const API_KEY_RONIN = "rtkyjrbeFFfQy0m1htxdoKWE2iWOFolJ"; 

        const consultarMarketplaceAPI = async () => {
            try {
                console.log("Conectando con el indexador oficial de Sky Mavis...");
                
                // Llamada directa al endpoint V2 que extrae los verdaderos holders del Marketplace
                const response = await fetch(`https://api-gateway.skymavis.com/skynet/ronin/web3/v2/collections/${contratoOgRats}/owners?limit=100`, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json",
                        "X-API-KEY": API_KEY_RONIN
                    }
                });

                if (!response.ok) throw new Error("Llave o conexión rechazada por Sky Mavis");

                const json = await response.json();
                
                // Mapeo preciso de la estructura devuelta por la Blockchain de Ronin
                const listaData = json.result || [];

                holders.value = listaData.map(item => ({
                    address: item.owner ? item.owner.toLowerCase() : "",
                    balance: parseInt(item.balance || item.amount || 0)
                })).filter(h => h.balance > 0 && h.address !== "");

                console.log(`¡Sincronización exitosa! Encontrados ${holders.value.length} holders en el marketplace.`);

            } catch (error) {
                console.error("Error sincronizando los holders del mercado:", error);
            } finally {
                cargando.value = false;
            }
        };

        // Fórmula matemática para la puntuación automática diaria de los NFTs de tus holders
        const calcularPuntosActuales = (holder) => {
            const ahora = new Date();
            const hoyUTC = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
            const dias = Math.floor((hoyUTC - (fechaInicioConteo * 1000)) / (1000 * 60 * 60 * 24));
            return dias > 0 ? (dias * holder.balance) : 0;
        };

        // Organiza el Top de mayor a menor según el Marketplace
        const holdersOrdenados = computed(() => {
            return [...holders.value]
                .map(h => ({ ...h, puntosCalculados: calcularPuntosActuales(h) }))
                .sort((a, b) => b.balance - a.balance);
        });

        // Lógica visual del temporizador UTC diario en pantalla
        const actualizarCuentaRegresiva = () => {
            const ahora = new Date();
            const mananaUTC = new Date(Date.UTC(ahora.getUTCFullYear(), grandma = ahora.getUTCMonth(), ahora.getUTCDate() + 1, 0, 0, 0));
            let totalSegundos = Math.floor((mananaUTC - ahora) / 1000);
            if (totalSegundos < 0) totalSegundos = 0;
            
            tiempo.value = {
                horas: String(Math.floor(totalSegundos / 3600)).padStart(2, '0'),
                minutos: String(Math.floor((totalSegundos % 3600) / 60)).padStart(2, '0'),
                segundos: String(totalSegundos % 60).padStart(2, '0')
            };
        };

        onMounted(async () => {
            // Primer escaneo al cargar la web
            await consultarMarketplaceAPI();
            actualizarCuentaRegresiva();
            
            // Intervalo del reloj visual (Cada 1 segundo)
            setInterval(actualizarCuentaRegresiva, 1000);

            // Refresco de datos automático en segundo plano mientras la pestaña esté abierta (Cada 5 minutos)
            setInterval(async () => {
                await consultarMarketplaceAPI();
            }, 300000);
        });

        return { 
            cargando, 
            holdersOrdenados, 
            tiempo, 
            formatearDireccion: (a) => a ? a.substring(0, 6) + '...' + a.substring(a.length - 4) : '' 
        };
    }
}).mount('#app');
