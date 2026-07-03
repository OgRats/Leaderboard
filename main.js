const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const cargando = ref(true);
        const holders = ref([]);
        const tiempo = ref({ horas: "00", minutes: "00", segundos: "00" });
        
        const fechaInicioConteo = Math.floor(new Date("2026-06-25T00:00:00Z").getTime() / 1000);

        // CONFIGURACIÓN CON TU NUEVA API KEY
        const contratoOgRats = "0x953e34637cc596b8195eb7fb83305402d3b9d000";
        const API_KEY_RONIN = "gQUj546pZtgFbOz8DD1iT4AirKIkJnJJ"; 

        const consultarMarketplaceAPI = async () => {
            try {
                console.log("Sincronizando con la nueva API Key...");
                
                // Intentamos consultar el endpoint con un límite extendido de elementos
                const response = await fetch(`https://api-gateway.skymavis.com/skynet/ronin/web3/v2/collections/${contratoOgRats}/owners?limit=200`, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json",
                        "X-API-KEY": API_KEY_RONIN
                    }
                });

                if (!response.ok) throw new Error(`Error de respuesta: ${response.status}`);

                const json = await response.json();
                
                // Estructura de extracción profunda
                let datosCrudos = [];
                if (json.result && Array.isArray(json.result)) {
                    datosCrudos = json.result;
                } else if (json.result && Array.isArray(json.result.items)) {
                    datosCrudos = json.result.items;
                } else if (json.owners && Array.isArray(json.owners)) {
                    datosCrudos = json.owners;
                } else if (json.items && Array.isArray(json.items)) {
                    datosCrudos = json.items;
                }

                // Si la API nos devuelve una estructura limpia, mapeamos los balances
                if (datosCrudos.length > 0) {
                    holders.value = datosCrudos.map(item => {
                        const wallet = item.owner || item.address || item.ownerAddress || "";
                        const cantidad = item.balance || item.amount || item.tokenCount || 1;
                        return {
                            address: wallet ? wallet.toLowerCase() : "",
                            balance: parseInt(cantidad)
                        };
                    }).filter(h => h.balance > 0 && h.address !== "" && h.address !== "0x0000000000000000000000000000000000000000");
                } else {
                    console.log("La API devolvió un array vacío. Posiblemente requiera indexación manual de tokens.");
                }

                console.log(`Carga finalizada. Registros procesados: ${holders.value.length}`);

            } catch (error) {
                console.error("Fallo en la comunicación con Sky Mavis:", error);
            } finally {
                cargando.value = false;
            }
        };

        const calcularPuntosActuales = (holder) => {
            const ahora = new Date();
            const hoyUTC = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
            const dias = Math.floor((hoyUTC - (fechaInicioConteo * 1000)) / (1000 * 60 * 60 * 24));
            return dias > 0 ? (dias * holder.balance) : 0;
        };

        const holdersOrdenados = computed(() => {
            return [...holders.value]
                .map(h => ({ ...h, puntosCalculados: calcularPuntosActuales(h) }))
                .sort((a, b) => b.balance - a.balance);
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

        onMounted(async () => {
            await consultarMarketplaceAPI();
            actualizarCuentaRegresiva();
            setInterval(actualizarCuentaRegresiva, 1000);

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
                
