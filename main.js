const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const cargando = ref(true);
        const holders = ref([]);
        const tiempo = ref({ horas: "00", minutos: "00", segundos: "00" });
        
        // Fecha de inicio para el cálculo acumulativo de tus puntos (Año 2026)
        const fechaInicioConteo = Math.floor(new Date("2026-06-25T00:00:00Z").getTime() / 1000);

        // CONFIGURACIÓN CON TU API KEY
        const contratoOgRats = "0x953e34637cc596b8195eb7fb83305402d3b9d000";
        const API_KEY_RONIN = "gQUj546pZtgFbOz8DD1iT4AirKIkJnJJ"; 

        const consultarMarketplaceAPI = async () => {
            try {
                console.log("Sincronizando mediante endpoint de Tokens ERC-721...");
                
                // Consultamos los tokens de la colección (Trae el dueño de cada pieza)
                const response = await fetch(`https://api-gateway.skymavis.com/skynet/ronin/web3/v2/collections/${contratoOgRats}/tokens?limit=200`, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json",
                        "X-API-KEY": API_KEY_RONIN
                    }
                });

                if (!response.ok) throw new Error(`Error de respuesta RPC: ${response.status}`);

                const json = await response.json();
                
                // Extraemos la lista de tokens del resultado
                const tokens = json.result || json.items || [];
                const mapaBalances = {};

                // Recorremos cada NFT y sumamos +1 al balance de su respectivo dueño
                tokens.forEach(token => {
                    const owner = token.owner || (token.minterAddress ? token.minterAddress : "");
                    if (owner && owner !== "0x0000000000000000000000000000000000000000") {
                        const walletLcase = owner.toLowerCase();
                        mapaBalances[walletLcase] = (mapaBalances[walletLcase] || 0) + 1;
                    }
                });

                // Convertimos el mapa agrupado al formato que requiere la tabla de Vue
                holders.value = Object.keys(mapaBalances).map(wallet => ({
                    address: wallet,
                    balance: mapaBalances[wallet]
                }));

                console.log(`Sincronización completada con éxito. Holders agrupados: ${holders.value.length}`);

            } catch (error) {
                console.error("Fallo crítico en la comunicación con el indexador:", error);
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

            // Refresco programado cada 5 minutos
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
