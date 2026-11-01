/**
 * Aegis Campus - SafeZone
 * Controlador de Aplicación Web
 */

// =========================================================================
// MÓDULOS COMPARTIDOS EN EL ÁMBITO GLOBAL
// =========================================================================

// Helpers de Toast y Notificaciones accesibles (Material 3 Snackbar)
const Toast = {
    container: null,
    init() {
        this.container = document.getElementById('toast-container');
    },
    show(message, type = 'info', duration = 3500) {
        if (!this.container) this.init();
        if (!this.container) return;

        const toast = document.createElement('div');
        const types = {
            success: {
                icon: 'check_circle',
                iconColor: 'text-emerald-400'
            },
            error: {
                icon: 'error',
                iconColor: 'text-rose-400'
            },
            warning: {
                icon: 'warning',
                iconColor: 'text-amber-400'
            },
            info: {
                icon: 'info',
                iconColor: 'text-blue-400'
            }
        };

        const config = types[type] || types.info;

        toast.className = `bg-[#323232] text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-md flex items-center justify-between gap-2.5 transform transition-all duration-300 translate-y-3 opacity-0 pointer-events-auto`;
        toast.innerHTML = `
            <div class="flex items-center gap-2.5 font-medium">
                <span class="material-symbols-outlined text-[18px] ${config.iconColor} shrink-0">${config.icon}</span>
                <span>${message}</span>
            </div>
            <button class="hover:opacity-75 text-white/70 hover:text-white transition-opacity ml-2 shrink-0 cursor-pointer" aria-label="Cerrar">
                <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
        `;

        const closeBtn = toast.querySelector('button');
        const removeToast = () => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => {
                if (toast.parentElement) toast.remove();
            }, 300);
        };

        closeBtn.addEventListener('click', removeToast);
        this.container.appendChild(toast);

        // Entrada fluida
        requestAnimationFrame(() => {
            toast.classList.remove('opacity-0', 'translate-y-3');
        });

        setTimeout(removeToast, duration);
    }
};

// Catálogo de Zonas del Campus y coordenadas estimadas sobre el mapa ortogonal (Orientación Horizontal 791x489)
// Puntos calibrados al centroide geométrico exacto de cada edificio y área
const ZONAS_CAMPUS = {
    // Edificios Académicos (Centrados con precisión milimétrica en sus techos)
    "Edificio E - Fisioterapia (PB)": { url: '/img/fisioterapia.jpg', lat: 21.0470, lng: -89.6328, top: '36.5%', left: '19.8%' },
    "Edificio E - Centro de Cómputo (PA)": { url: null, lat: 21.0470, lng: -89.6328, top: '36.5%', left: '19.8%' },
    "Edificio D - Lab. Gastronomía": { url: '/img/gastronomia.jpg', lat: 21.0465, lng: -89.6330, top: '37.2%', left: '7.0%' },
    "Edificio B - Biblioteca / CAE": { url: null, lat: 21.0465, lng: -89.6325, top: '58.0%', left: '6.2%' },
    "Edificio I - Taller de Diseño": { url: '/img/diseno.jpg', lat: 21.0472, lng: -89.6330, top: '34.8%', left: '28.4%' },
    "Edificio H - Aulas y Cubículos": { url: null, lat: 21.0480, lng: -89.6322, top: '50.1%', left: '49.9%' },

    // Zonas Deportivas (Centrados en el núcleo funcional de cada complejo)
    "Zona 1 - Alberca (PB)": { url: '/img/alberca.jpg', lat: 21.0485, lng: -89.6315, top: '77.5%', left: '52.3%' },
    "Zona 1 - Gimnasio (PA)": { url: '/img/alberca.jpg', lat: 21.0485, lng: -89.6315, top: '77.5%', left: '52.3%' },
    "Zona 2 - Campo Deportivo": { url: null, lat: 21.0490, lng: -89.6325, top: '55.2%', left: '68.9%' },
    "Zona 3 - Cancha de Usos Múltiples": { url: null, lat: 21.0482, lng: -89.6320, top: '68.5%', left: '52.5%' },

    // Estacionamientos (Centrados en los cuadrantes de cada figura)
    "Estacionamiento Norte (Círculo - Campo)": { url: null, lat: 21.0495, lng: -89.6335, top: '13.3%', left: '71.6%' },
    "Estacionamiento Central (Triángulo - Edificios)": { url: null, lat: 21.0475, lng: -89.6320, top: '44.0%', left: '38.0%' },
    "Estacionamiento Sur-Oeste (Cuadrado - Diseño)": { url: null, lat: 21.0472, lng: -89.6332, top: '29.7%', left: '40.0%' }
};

// Normalización de texto (elimina acentos, diacríticos y espacios extra)
function normalizarTexto(texto) {
    if (!texto) return '';
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

// Búsqueda flexible de zona en el catálogo ZONAS_CAMPUS
function obtenerInfoZona(zona_id) {
    if (!zona_id) return null;
    if (ZONAS_CAMPUS[zona_id]) {
        return { nombre: zona_id, ...ZONAS_CAMPUS[zona_id] };
    }

    const zNorm = normalizarTexto(zona_id);
    for (const [nombre, info] of Object.entries(ZONAS_CAMPUS)) {
        const nomNorm = normalizarTexto(nombre);
        if (nomNorm === zNorm || nomNorm.includes(zNorm) || zNorm.includes(nomNorm)) {
            return { nombre, ...info };
        }
    }

    // Coincidencias por palabras clave
    if (zNorm.includes('fisio')) return { nombre: "Edificio E - Fisioterapia (PB)", ...ZONAS_CAMPUS["Edificio E - Fisioterapia (PB)"] };
    if (zNorm.includes('computo')) return { nombre: "Edificio E - Centro de Cómputo (PA)", ...ZONAS_CAMPUS["Edificio E - Centro de Cómputo (PA)"] };
    if (zNorm.includes('gastronom') || zNorm.includes('cocina')) return { nombre: "Edificio D - Lab. Gastronomía", ...ZONAS_CAMPUS["Edificio D - Lab. Gastronomía"] };
    if (zNorm.includes('biblioteca') || zNorm.includes('cae')) return { nombre: "Edificio B - Biblioteca / CAE", ...ZONAS_CAMPUS["Edificio B - Biblioteca / CAE"] };
    if (zNorm.includes('disen') || zNorm.includes('taller')) return { nombre: "Edificio I - Taller de Diseño", ...ZONAS_CAMPUS["Edificio I - Taller de Diseño"] };
    if (zNorm.includes('edificio h') || zNorm.includes('cubiculo') || zNorm.includes('sector h')) return { nombre: "Edificio H - Aulas y Cubículos", ...ZONAS_CAMPUS["Edificio H - Aulas y Cubículos"] };
    if (zNorm.includes('alberca')) return { nombre: "Zona 1 - Alberca (PB)", ...ZONAS_CAMPUS["Zona 1 - Alberca (PB)"] };
    if (zNorm.includes('gimnasio') || zNorm.includes('gym')) return { nombre: "Zona 1 - Gimnasio (PA)", ...ZONAS_CAMPUS["Zona 1 - Gimnasio (PA)"] };
    if (zNorm.includes('campo')) return { nombre: "Zona 2 - Campo Deportivo", ...ZONAS_CAMPUS["Zona 2 - Campo Deportivo"] };
    if (zNorm.includes('cancha') || zNorm.includes('usos multiples')) return { nombre: "Zona 3 - Cancha de Usos Múltiples", ...ZONAS_CAMPUS["Zona 3 - Cancha de Usos Múltiples"] };
    if (zNorm.includes('estacionamiento norte') || zNorm.includes('circulo')) return { nombre: "Estacionamiento Norte (Círculo - Campo)", ...ZONAS_CAMPUS["Estacionamiento Norte (Círculo - Campo)"] };
    if (zNorm.includes('estacionamiento central') || zNorm.includes('triangulo')) return { nombre: "Estacionamiento Central (Triángulo - Edificios)", ...ZONAS_CAMPUS["Estacionamiento Central (Triángulo - Edificios)"] };
    if (zNorm.includes('estacionamiento sur') || zNorm.includes('cuadrado')) return { nombre: "Estacionamiento Sur-Oeste (Cuadrado - Diseño)", ...ZONAS_CAMPUS["Estacionamiento Sur-Oeste (Cuadrado - Diseño)"] };

    return null;
}

// Búsqueda de fotografía de referencia si existe
function obtenerImagenZona(zona_id) {
    const info = obtenerInfoZona(zona_id);
    if (info && info.url) {
        return { url: info.url, nombre: info.nombre };
    }
    return null;
}

// Coordenadas oficiales UVM Campus Mérida
const CAMPUS_CONFIG = {
    center: [21.0475, -89.6322],
    bounds: {
        minLat: 21.0455,
        maxLat: 21.0495,
        minLng: -89.6345,
        maxLng: -89.6300
    }
};

// Función para obtener coordenadas garantizadas dentro del campus
function generarUbicacionCampusFallback() {
    const { bounds } = CAMPUS_CONFIG;
    const lat = bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat);
    const lng = bounds.minLng + Math.random() * (bounds.maxLng - bounds.minLng);
    return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

// =========================================================================
// INICIALIZACIÓN POR VISTA (DOM CONTENT LOADED)
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    Toast.init();

    // =====================================================================
    // 1. AISLAMIENTO DEL MÓDULO DE REPORTE MÓVIL (REPORTAR.HTML)
    // =====================================================================
    const form = document.getElementById('form-emergencia');
    if (form) {
        const statusMsg = document.getElementById('status-msg');
        const btnSubmit = document.getElementById('btn-submit');

        // Selector de Prioridad tipo Segmented Control (Riel con botones internos)
        const inputSeveridad = document.getElementById('severidad');
        const btnsPrioridad = document.querySelectorAll('.btn-prioridad');
        const estiloActivo = 'btn-prioridad h-8 rounded-sm text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-white text-[#1F1F1F] shadow-xs font-semibold';
        const estiloInactivo = 'btn-prioridad h-8 rounded-sm text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900 font-medium';

        function setPrioridad(val) {
            if (inputSeveridad) inputSeveridad.value = val;
            btnsPrioridad.forEach(btn => {
                const btnVal = btn.getAttribute('data-val');
                btn.className = (btnVal === val) ? estiloActivo : estiloInactivo;
            });
        }

        btnsPrioridad.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setPrioridad(btn.getAttribute('data-val'));
            });
        });

        form.addEventListener('reset', () => {
            setTimeout(() => setPrioridad('MEDIA'), 0);
        });

        function mostrarEstadoForm(texto, colorClass) {
            if (!statusMsg) return;
            statusMsg.textContent = texto;
            statusMsg.className = `text-xs mt-3 font-medium text-center ${colorClass}`;
            statusMsg.classList.remove('hidden');
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const tipoEmergencia = document.getElementById('tipo_emergencia').value;
            const zonaId = document.getElementById('zona_id').value;

            // Solo exige como campos obligatorios tipo_emergencia y zona_id
            if (!tipoEmergencia || !zonaId) {
                Toast.show('Por favor completa todos los campos requeridos (*)', 'warning');
                return;
            }

            mostrarEstadoForm('Verificando telemetría de geolocalización...', 'text-[#1a73e8]');
            if (btnSubmit) btnSubmit.disabled = true;

            const zonaInfo = obtenerInfoZona(zonaId);

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const coords = {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude
                        };
                        // Si el GPS físico está fuera de la zona del campus, usar ubicación del catálogo o fallback
                        if (coords.lat < 20.8 || coords.lat > 21.2 || coords.lng < -90.0 || coords.lng > -89.3) {
                            const targetLat = (zonaInfo && zonaInfo.lat) ? zonaInfo.lat : generarUbicacionCampusFallback().lat;
                            const targetLng = (zonaInfo && zonaInfo.lng) ? zonaInfo.lng : generarUbicacionCampusFallback().lng;
                            enviarReporte(targetLat, targetLng);
                        } else {
                            enviarReporte(coords.lat, coords.lng);
                        }
                    },
                    (err) => {
                        console.info("[Geo] GPS no disponible o denegado, asignando ubicación por zona en catálogo.");
                        const targetLat = (zonaInfo && zonaInfo.lat) ? zonaInfo.lat : generarUbicacionCampusFallback().lat;
                        const targetLng = (zonaInfo && zonaInfo.lng) ? zonaInfo.lng : generarUbicacionCampusFallback().lng;
                        enviarReporte(targetLat, targetLng);
                    },
                    { timeout: 4000 }
                );
            } else {
                const targetLat = (zonaInfo && zonaInfo.lat) ? zonaInfo.lat : generarUbicacionCampusFallback().lat;
                const targetLng = (zonaInfo && zonaInfo.lng) ? zonaInfo.lng : generarUbicacionCampusFallback().lng;
                enviarReporte(targetLat, targetLng);
            }
        });

        async function enviarReporte(lat, lng) {
            const inputTelefono = document.getElementById('telefono');
            const inputDescripcion = document.getElementById('descripcion');

            // Lee #telefono (opcional; si está vacío, envía "Anónimo")
            const valorTelefono = (inputTelefono && inputTelefono.value.trim()) ? inputTelefono.value.trim() : 'Anónimo';

            const payload = {
                nombre_reportante: 'Anónimo',
                telefono: valorTelefono,
                tipo_emergencia: document.getElementById('tipo_emergencia').value,
                severidad: document.getElementById('severidad').value,
                zona_id: document.getElementById('zona_id').value,
                descripcion: inputDescripcion ? inputDescripcion.value.trim() : '',
                coordenadas: { lat, lng }
            };

            try {
                mostrarEstadoForm('Enviando reporte de emergencia...', 'text-[#1a73e8]');
                const response = await fetch('/api/v1/incidentes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Error al enviar reporte');
                }

                mostrarEstadoForm('¡Reporte enviado con éxito!', 'text-[#137333]');
                Toast.show('Incidente registrado y vinculado al expediente médico', 'success');

                const tarjetaConfirmacion = document.getElementById('confirmacion-alerta');
                if (tarjetaConfirmacion && data.incidente) {
                    const confId = document.getElementById('conf-id');
                    const confZona = document.getElementById('conf-zona');
                    const confTipo = document.getElementById('conf-tipo-prioridad');
                    const confTel = document.getElementById('conf-telefono');
                    const confSoap = document.getElementById('conf-soap-titular');

                    if (confId) confId.textContent = data.incidente.id;
                    if (confZona) confZona.textContent = data.incidente.zona_id;
                    if (confTipo) confTipo.textContent = `${data.incidente.tipo_emergencia} (${data.incidente.severidad})`;
                    if (confTel) confTel.textContent = data.incidente.telefono || 'Anónimo';
                    if (confSoap && data.incidente.expediente_soap) {
                        confSoap.textContent = data.incidente.expediente_soap.afiliacion || data.incidente.expediente_soap.titular || 'Visitante / Comunidad UVM';
                    }

                    form.classList.add('hidden');
                    tarjetaConfirmacion.classList.remove('hidden');
                    tarjetaConfirmacion.classList.add('flex');
                } else {
                    form.reset();
                    setTimeout(() => {
                        if (statusMsg) statusMsg.classList.add('hidden');
                    }, 3000);
                }
            } catch (error) {
                mostrarEstadoForm(error.message, 'text-[#c5221f]');
                Toast.show(error.message, 'error');
            } finally {
                if (btnSubmit) btnSubmit.disabled = false;
            }
        }

        // Botón para emitir nuevo reporte tras la confirmación
        const btnNuevoReporte = document.getElementById('btn-nuevo-reporte');
        if (btnNuevoReporte) {
            btnNuevoReporte.addEventListener('click', () => {
                const tarjetaConfirmacion = document.getElementById('confirmacion-alerta');
                if (tarjetaConfirmacion) {
                    tarjetaConfirmacion.classList.add('hidden');
                    tarjetaConfirmacion.classList.remove('flex');
                }
                form.reset();
                form.classList.remove('hidden');
                if (statusMsg) {
                    statusMsg.classList.add('hidden');
                }
            });
        }
    }

    // Manejo de Suscripción a la Red de Ayuda Comunitaria
    const formSuscripcion = document.getElementById('form-suscripcion');
    if (formSuscripcion) {
        formSuscripcion.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputEmail = document.getElementById('email-suscripcion');
            const email = inputEmail ? inputEmail.value.trim() : '';
            if (!email) return;

            const btnSuscribir = document.getElementById('btn-suscribir');
            if (btnSuscribir) btnSuscribir.disabled = true;

            try {
                const res = await fetch('/api/v1/comunidad/suscribir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al procesar la suscripción.');
                Toast.show(data.mensaje || '¡Te has suscrito exitosamente a la Red de Ayuda Comunitaria!', 'success');
                if (inputEmail) inputEmail.value = '';
            } catch(err) {
                Toast.show(err.message, 'error');
            } finally {
                if (btnSuscribir) btnSuscribir.disabled = false;
            }
        });
    }

    // =====================================================================
    // 2. AISLAMIENTO DEL MÓDULO DE CENTRO DE MANDO (DASHBOARD.HTML)
    // =====================================================================
    const mapaContainer = document.getElementById('mapa-container');
    if (mapaContainer && typeof io !== 'undefined') {

        // Inicialización de Socket.io
        const socket = io();

        // Indicadores #ws-status y KPI de red
        const wsStatus = document.getElementById('ws-status');
        const wsDot = document.getElementById('ws-indicator-dot');
        const wsText = document.getElementById('ws-status-text');
        const kpiWsStatus = document.getElementById('kpi-ws-status');

        function actualizarEstadoWS(conectado) {
            if (wsStatus) {
                if (conectado) {
                    wsStatus.className = 'pointer-events-none select-none flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-200/80 transition-all duration-300 whitespace-nowrap';
                    if (wsDot) {
                        wsDot.innerHTML = '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-[6px] w-[6px] bg-emerald-500"></span>';
                    }
                    if (wsText) wsText.textContent = 'EN LÍNEA';
                } else {
                    wsStatus.className = 'pointer-events-none select-none flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-rose-50 text-rose-700 border border-rose-200/80 transition-all duration-300 whitespace-nowrap';
                    if (wsDot) {
                        wsDot.innerHTML = '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span><span class="relative inline-flex rounded-full h-[6px] w-[6px] bg-rose-500"></span>';
                    }
                    if (wsText) wsText.textContent = 'DESCONECTADO';
                }
            }
            if (kpiWsStatus) {
                if (conectado) {
                    kpiWsStatus.className = 'flex items-center justify-center gap-1 font-mono text-[11px] font-bold text-emerald-600 leading-tight mt-0.5';
                    kpiWsStatus.innerHTML = '<span class="relative flex h-1.5 w-1.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span></span><span>ONLINE</span>';
                } else {
                    kpiWsStatus.className = 'flex items-center justify-center gap-1 font-mono text-[11px] font-bold text-rose-600 leading-tight mt-0.5';
                    kpiWsStatus.innerHTML = '<span class="relative flex h-1.5 w-1.5"><span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span></span><span>OFFLINE</span>';
                }
            }
        }

        socket.on('connect', () => {
            actualizarEstadoWS(true);
            Toast.show('Conectado al Centro de Operaciones en Tiempo Real', 'info', 2500);
        });

        socket.on('disconnect', () => {
            actualizarEstadoWS(false);
            Toast.show('Conexión perdida con el servidor. Reconectando...', 'warning', 4000);
        });

        // Modal fotográfico (#modal-foto)
        const modalFoto = document.getElementById('modal-foto');
        const modalImg = document.getElementById('modal-img');
        const modalTitulo = document.getElementById('modal-titulo');
        const btnCerrarModal = document.getElementById('btn-cerrar-modal');

        function abrirModal(rutaImg, tituloZona) {
            if (!modalFoto || !modalImg) return;
            modalImg.src = rutaImg;
            if (modalTitulo) {
                modalTitulo.innerHTML = `
                    <span class="material-symbols-outlined text-[18px] text-[#1a73e8]">photo_camera</span>
                    <span>Distribución Física: <strong>${tituloZona}</strong></span>
                `;
            }
            modalFoto.classList.remove('hidden');
            modalFoto.classList.add('flex');
        }

        function cerrarModal() {
            if (!modalFoto) return;
            modalFoto.classList.add('hidden');
            modalFoto.classList.remove('flex');
        }

        if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModal);
        if (modalFoto) {
            modalFoto.addEventListener('click', (e) => {
                if (e.target === modalFoto) cerrarModal();
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (modalFoto && !modalFoto.classList.contains('hidden')) {
                    cerrarModal();
                }
                if (typeof modalOperadores !== 'undefined' && modalOperadores && !modalOperadores.classList.contains('hidden')) {
                    modalOperadores.classList.add('hidden');
                    modalOperadores.classList.remove('flex');
                }
                if (typeof modalPassword !== 'undefined' && modalPassword && !modalPassword.classList.contains('hidden')) {
                    modalPassword.classList.add('hidden');
                    modalPassword.classList.remove('flex');
                }
            }
        });

        // Capa de pines del mapa ortogonal
        const pinsOrtogonalLayer = document.getElementById('pins-ortogonal-layer');
        let pinsOrtogonales = {};

        function renderizarPinOrtogonal(incidente) {
            if (!pinsOrtogonalLayer) return;
            const info = obtenerInfoZona(incidente.zona_id);
            if (!info || !info.top || !info.left) return;

            const pinExistente = document.getElementById(`pin-orto-${incidente.id}`);
            if (pinExistente) pinExistente.remove();

            const baseTop = parseFloat(info.top);
            const baseLeft = parseFloat(info.left);

            const pinesMismaZona = Object.values(pinsOrtogonales).filter(p => {
                const pZona = p.getAttribute('data-zona-base');
                return pZona === info.nombre || (Math.abs(parseFloat(p.getAttribute('data-base-left')) - baseLeft) < 1.0 && Math.abs(parseFloat(p.getAttribute('data-base-top')) - baseTop) < 1.0);
            });

            const orden = pinesMismaZona.length;
            let offsetLeft = 0;
            let offsetTop = 0;

            if (orden > 0) {
                const radioX = 2.4;
                const radioY = 3.6;
                const angulo = (orden * 2.39996) + (Math.PI / 4);
                offsetLeft = Math.cos(angulo) * radioX;
                offsetTop = Math.sin(angulo) * radioY;
            }

            const finalTop = `${(baseTop + offsetTop).toFixed(2)}%`;
            const finalLeft = `${(baseLeft + offsetLeft).toFixed(2)}%`;

            const pin = document.createElement('div');
            pin.id = `pin-orto-${incidente.id}`;
            pin.setAttribute('data-zona-base', info.nombre);
            pin.setAttribute('data-base-top', baseTop);
            pin.setAttribute('data-base-left', baseLeft);
            pin.className = "marcador-ortogonal absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-20 transition-all duration-300";
            pin.style.top = finalTop;
            pin.style.left = finalLeft;

            let pinBg = "bg-blue-600";
            if (incidente.severidad === 'ALTA') pinBg = "bg-rose-600";
            else if (incidente.severidad === 'MEDIA') pinBg = "bg-amber-500";

            const nombreZona = info.nombre;
            pin.innerHTML = `
                <div class="relative flex items-center justify-center">
                    <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full opacity-75 ${pinBg}"></span>
                    <div class="w-5 h-5 ${pinBg} rounded-full border-2 border-white flex items-center justify-center text-white shadow-sm">
                        <span class="w-1.5 h-1.5 bg-white rounded-full"></span>
                    </div>
                </div>
                <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white text-slate-800 px-3 py-2 rounded-lg absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap pointer-events-none z-40 border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                    <div class="text-xs font-semibold text-slate-900">${incidente.id} • ${incidente.tipo_emergencia}</div>
                    <div class="text-[11px] text-slate-600">${nombreZona}</div>
                </div>
            `;

            if (info.url) {
                pin.addEventListener('click', () => {
                    abrirModal(info.url, info.nombre);
                });
            }

            pinsOrtogonalLayer.appendChild(pin);
            pinsOrtogonales[incidente.id] = pin;
        }

        // Gestión de la bitácora de incidentes y KPIs
        const listaIncidentes = document.getElementById('lista-incidentes');
        const emptyState = document.getElementById('empty-state');
        const contadorIncidentes = document.getElementById('contador-incidentes');
        const contadorAltas = document.getElementById('contador-altas');

        function actualizarContador() {
            const total = Object.keys(pinsOrtogonales).length;
            if (contadorIncidentes) {
                contadorIncidentes.textContent = `${total} ${total === 1 ? 'activo' : 'activos'}`;
            }
            if (contadorAltas) {
                const altas = Object.keys(pinsOrtogonales).filter(id => {
                    const card = document.getElementById(`card-${id}`);
                    if (!card) return false;
                    return card.innerHTML.includes('ALTA') || card.innerHTML.includes('Alta');
                }).length;
                contadorAltas.textContent = altas;
            }
        }

        // Renderizado de tarjeta de incidente en el Dashboard
        function renderizarIncidente(incidente, esNuevo = false) {
            if (emptyState) emptyState.style.display = 'none';

            if (document.getElementById(`card-${incidente.id}`)) {
                return;
            }

            const sev = (incidente.severidad || 'BAJA').toUpperCase();
            let badgeTipoColor = 'bg-slate-100 text-slate-700';
            let badgeSevColor = 'bg-blue-50 text-blue-700';

            if (sev === 'ALTA' || sev.includes('CRIT') || sev.includes('ALTA')) {
                badgeSevColor = 'bg-rose-50 text-rose-700';
            } else if (sev === 'MEDIA') {
                badgeSevColor = 'bg-amber-50 text-amber-800';
            } else {
                badgeSevColor = 'bg-blue-50 text-blue-700';
            }

            const infoFoto = obtenerImagenZona(incidente.zona_id);
            const soapData = incidente.expediente_soap || {
                tipo_sangre: 'No registrado',
                alergias: 'Ninguna conocida',
                poliza: 'N/A',
                contacto: 'N/A'
            };

            const contactoVal = incidente.telefono || 'Anónimo';
            const reportanteVal = incidente.nombre_reportante && incidente.nombre_reportante !== 'Anónimo' ? incidente.nombre_reportante : 'Comunidad UVM';
            const horaStr = new Date(incidente.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            const estado = incidente.estado || 'REPORTADO';
            let estadoPuntoColor = 'bg-blue-500';
            let estadoTexto = 'Reportado';
            if (estado === 'EN ATENCIÓN') {
                estadoPuntoColor = 'bg-amber-500';
                estadoTexto = 'En atención';
            } else if (estado === 'RESUELTO') {
                estadoPuntoColor = 'bg-emerald-500';
                estadoTexto = 'Resuelto';
            }

            const card = document.createElement('div');
            card.className = `bg-white rounded-xl border border-slate-200/90 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-colors flex flex-col gap-3 ${esNuevo ? 'incidente-nuevo ring-2 ring-blue-500/20' : ''} group`;
            card.id = `card-${incidente.id}`;

            card.innerHTML = `
                <!-- Cabecera: ID en negrita, Tipo y Severidad sin borde, Hora en texto simple -->
                <div class="flex justify-between items-center flex-wrap gap-2">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-mono font-bold text-slate-900 text-sm tracking-tight">${incidente.id}</span>
                        <span class="text-xs font-medium px-2 py-0.5 rounded ${badgeTipoColor}">${incidente.tipo_emergencia}</span>
                        <span class="text-xs font-medium px-2 py-0.5 rounded ${badgeSevColor}">${incidente.severidad}</span>
                    </div>
                    <span class="font-mono text-xs text-slate-400">${horaStr}</span>
                </div>

                <!-- Cuerpo Principal: Ubicación completa, descripción y metadatos en una sola fila -->
                <div class="space-y-1">
                    <h3 class="text-base font-semibold text-slate-900 leading-snug">${incidente.zona_id}</h3>
                    ${incidente.descripcion ? `
                        <p class="text-sm text-slate-600 leading-relaxed">${incidente.descripcion}</p>
                    ` : ''}
                    <div class="text-xs text-slate-500 flex items-center gap-2 flex-wrap pt-0.5">
                        <span>Contacto: <strong class="font-medium text-slate-700">${contactoVal}</strong></span>
                        <span class="text-slate-300 select-none">•</span>
                        <span>Reportante: <strong class="font-medium text-slate-700">${reportanteVal}</strong></span>
                    </div>
                </div>

                <!-- Previsualización de Distribución Física (si existe) -->
                ${infoFoto ? `
                    <div class="zona-preview-btn rounded-md overflow-hidden border border-slate-200 bg-slate-100 relative group cursor-pointer" data-img="${infoFoto.url}" data-nombre="${infoFoto.nombre}">
                        <img src="${infoFoto.url}" alt="${infoFoto.nombre}" class="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300">
                        <div class="absolute bottom-2 right-2 bg-slate-900/80 backdrop-blur-md text-white text-[11px] px-2 py-0.5 rounded flex items-center gap-1 font-medium border border-white/20">
                            <span class="material-symbols-outlined text-[16px]">zoom_in</span>
                            <span>Distribución del área</span>
                        </div>
                    </div>
                ` : ''}

                <!-- Expediente Clínico (SOAP): Separado solo con línea superior, rejilla de 2 columnas -->
                <div class="border-t border-slate-100 pt-2.5 mt-0.5 text-xs text-slate-600">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                        <div><span class="text-slate-400">Sangre:</span> <strong class="text-slate-800 font-semibold">${soapData.tipo_sangre}</strong></div>
                        <div><span class="text-slate-400">Póliza:</span> <strong class="text-slate-800 font-semibold">${soapData.poliza || 'N/A'}</strong></div>
                        <div><span class="text-slate-400">Alergias:</span> <strong class="text-slate-800 font-semibold">${soapData.alergias}</strong></div>
                        <div><span class="text-slate-400">Contacto:</span> <strong class="text-slate-800 font-semibold">${soapData.contacto || 'N/A'}</strong></div>
                    </div>
                </div>

                <!-- Pie de tarjeta: Estado a la izquierda con punto, botones limpios y compactos a la derecha -->
                <div class="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                        <span class="estado-punto w-2 h-2 rounded-full ${estadoPuntoColor}"></span>
                        <span class="estado-texto">${estadoTexto}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" class="btn-atender px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1 cursor-pointer active:scale-95" data-id="${incidente.id}">
                            <span class="material-symbols-outlined text-[16px]">pending_actions</span>
                            <span>Atender</span>
                        </button>
                        <button type="button" class="btn-resolver px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1 cursor-pointer active:scale-95" data-id="${incidente.id}">
                            <span class="material-symbols-outlined text-[16px]">check</span>
                            <span>Resolver</span>
                        </button>
                    </div>
                </div>
            `;

            // Aplicar estilo si ya viene en atención
            if (incidente.estado === 'EN ATENCIÓN') {
                card.classList.remove('bg-white');
                card.classList.add('bg-amber-50/30', 'ring-1', 'ring-amber-200');
            }

            // Listeners de los botones Atender y Resolver
            const btnAtender = card.querySelector('.btn-atender');
            if (btnAtender) {
                btnAtender.addEventListener('click', async () => {
                    try {
                        const res = await fetch(`/api/v1/incidentes/${incidente.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ estado: 'EN ATENCIÓN' })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Error al actualizar estado');
                        // Actualización silenciosa e idempotente del DOM local
                        card.classList.remove('bg-white');
                        card.classList.add('bg-amber-50/30', 'ring-1', 'ring-amber-200');
                        const punto = card.querySelector('.estado-punto');
                        const texto = card.querySelector('.estado-texto');
                        if (punto) punto.className = 'estado-punto w-2 h-2 rounded-full bg-amber-500 animate-pulse';
                        if (texto) texto.textContent = 'En atención';
                    } catch (err) {
                        Toast.show(err.message, 'error');
                    }
                });
            }

            const btnResolver = card.querySelector('.btn-resolver');
            if (btnResolver) {
                btnResolver.addEventListener('click', async () => {
                    try {
                        const res = await fetch(`/api/v1/incidentes/${incidente.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ estado: 'RESUELTO' })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Error al resolver incidente');
                        // Actualización silenciosa e idempotente del DOM y mapa
                        if (card && !card.classList.contains('opacity-0')) {
                            card.classList.add('opacity-0', 'scale-95', 'transition-all');
                            setTimeout(() => { if (card.parentElement) card.remove(); }, 250);
                        }
                        const pin = document.getElementById(`pin-orto-${incidente.id}`);
                        if (pin) pin.remove();
                        if (pinsOrtogonales[incidente.id]) {
                            delete pinsOrtogonales[incidente.id];
                        }
                        actualizarContador();
                    } catch (err) {
                        Toast.show(err.message, 'error');
                    }
                });
            }

            const previewBtn = card.querySelector('.zona-preview-btn');
            if (previewBtn) {
                previewBtn.addEventListener('click', () => {
                    abrirModal(previewBtn.getAttribute('data-img'), previewBtn.getAttribute('data-nombre'));
                });
            }

            if (listaIncidentes) {
                listaIncidentes.prepend(card);
            }

            renderizarPinOrtogonal(incidente);
            actualizarContador();
        }

        // Carga inicial de incidentes activos
        fetch('/api/v1/incidentes/activos')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    data.slice().reverse().forEach(incidente => renderizarIncidente(incidente, false));
                }
                actualizarContador();
            })
            .catch(err => {
                console.error('Error al sincronizar incidentes iniciales:', err);
                Toast.show('No se pudieron obtener incidentes previos', 'warning');
            });

        // Escucha de eventos Socket.io en tiempo real
        socket.on('nueva_alerta', (nuevoIncidente) => {
            renderizarIncidente(nuevoIncidente, true);
            Toast.show(`Nueva Alerta recibida: ${nuevoIncidente.id} - ${nuevoIncidente.zona_id}`, 'error', 4000);
        });

        socket.on('incidente_actualizado', (data) => {
            const card = document.getElementById(`card-${data.id}`);
            if (card) {
                card.classList.remove('bg-white');
                card.classList.add('bg-amber-50/30', 'ring-1', 'ring-amber-200');
                const punto = card.querySelector('.estado-punto');
                const texto = card.querySelector('.estado-texto');
                if (punto) punto.className = 'estado-punto w-2 h-2 rounded-full bg-amber-500 animate-pulse';
                if (texto) texto.textContent = data.estado === 'EN ATENCIÓN' ? 'En atención' : (data.estado || 'En atención');
            }
            const estadoTexto = (data.estado || 'en atención').toLowerCase();
            Toast.show(`Incidente ${data.id} marcado como ${estadoTexto}`, 'warning');
        });

        socket.on('incidente_resuelto', (data) => {
            // 1. Eliminar tarjeta del DOM (idempotente)
            const card = document.getElementById(`card-${data.id}`);
            if (card && !card.classList.contains('opacity-0')) {
                card.classList.add('opacity-0', 'scale-95', 'transition-all');
                setTimeout(() => { if (card.parentElement) card.remove(); }, 250);
            }

            // 2. Remover pin del mapa ortogonal (idempotente)
            const pin = document.getElementById(`pin-orto-${data.id}`);
            if (pin) pin.remove();
            if (pinsOrtogonales[data.id]) {
                delete pinsOrtogonales[data.id];
            }
            actualizarContador();

            // 3. Restaurar empty-state si ya no quedan incidentes activos
            setTimeout(() => {
                const remaining = document.querySelectorAll('#lista-incidentes > [id^="card-"]:not(.opacity-0)');
                if (remaining.length === 0 && emptyState) {
                    emptyState.style.display = 'flex';
                }
            }, 300);

            Toast.show(`Incidente ${data.id} marcado como resuelto`, 'success');
        });

        socket.on('limpiar_mapa', () => {
            if (listaIncidentes) {
                listaIncidentes.innerHTML = `
                    <div class="flex flex-col items-center justify-center text-center py-16" id="empty-state">
                        <div class="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 border border-emerald-200/60">
                            <span class="material-symbols-outlined text-[22px]">check_circle</span>
                        </div>
                        <p class="text-slate-800 font-bold text-sm">Sin incidentes activos</p>
                        <p class="text-slate-400 text-xs mt-1 max-w-xs">Los nuevos reportes aparecerán aquí automáticamente.</p>
                    </div>`;
            }

            if (pinsOrtogonalLayer) {
                pinsOrtogonalLayer.innerHTML = '';
            }
            pinsOrtogonales = {};
            actualizarContador();
            Toast.show('Tablero reiniciado', 'info');
        });

        // Botón Limpiar Tablero
        const btnReset = document.getElementById('btn-reset');
        if (btnReset) {
            btnReset.addEventListener('click', async () => {
                if (!confirm("¿Confirmar reinicio del tablero y archivado de incidentes?")) {
                    return;
                }

                try {
                    const res = await fetch('/api/v1/expo/reset', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        Toast.show(data.error || 'No autorizado para reiniciar el tablero', 'error');
                        if (data.redirect) {
                            setTimeout(() => window.location.href = data.redirect, 1000);
                        }
                        return;
                    }
                    Toast.show(data.mensaje || 'Tablero reiniciado con éxito', 'success');
                } catch (err) {
                    Toast.show('Error al solicitar reinicio de tablero', 'error');
                }
            });
        }

        // Botón Cerrar Sesión Táctica
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', async () => {
                try {
                    await fetch('/api/v1/auth/logout', { method: 'POST' });
                } finally {
                    window.location.href = '/login';
                }
            });
        }

        // =====================================================================
        // CONTROL DE IDENTIDAD Y GESTIÓN DE OPERADORES (SUPERADMIN)
        // =====================================================================
        const btnAdminOperadores = document.getElementById('btn-admin-operadores');
        const modalOperadores = document.getElementById('modal-admin-operadores');
        const btnCerrarModalOp = document.getElementById('btn-cerrar-modal-operadores');
        // Menú de perfil en Avatar SZ
        const btnPerfilAvatar = document.getElementById('btn-perfil-avatar');
        const perfilDropdown = document.getElementById('perfil-dropdown');
        const userEmailDisplay = document.getElementById('user-email-display');

        if (btnPerfilAvatar && perfilDropdown) {
            btnPerfilAvatar.addEventListener('click', (e) => {
                e.stopPropagation();
                perfilDropdown.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!perfilDropdown.contains(e.target) && !btnPerfilAvatar.contains(e.target)) {
                    perfilDropdown.classList.add('hidden');
                }
            });
        }

        // Función para verificar identidad activa y habilitar controles de SUPERADMIN
        async function verificarIdentidad() {
            try {
                const res = await fetch('/api/v1/auth/me');
                if (!res.ok) return;
                const user = await res.json();
                if (user && userEmailDisplay) {
                    userEmailDisplay.textContent = user.email || 'Operador activo';
                }
                if (user && user.rol === 'SUPERADMIN' && btnAdminOperadores) {
                    btnAdminOperadores.classList.remove('hidden');
                }
            } catch (err) {
                console.warn('[AUTH] Error al verificar identidad:', err);
            }
        }
        verificarIdentidad();

        // Control de apertura y cierre del Modal de Operadores
        function abrirModalOperadores() {
            if (!modalOperadores) return;
            modalOperadores.classList.remove('hidden');
            modalOperadores.classList.add('flex');
            cargarOperadores();
        }

        function cerrarModalOperadores() {
            if (!modalOperadores) return;
            modalOperadores.classList.add('hidden');
            modalOperadores.classList.remove('flex');
        }

        if (btnAdminOperadores) {
            btnAdminOperadores.addEventListener('click', abrirModalOperadores);
        }

        if (btnCerrarModalOp) {
            btnCerrarModalOp.addEventListener('click', cerrarModalOperadores);
        }

        if (modalOperadores) {
            modalOperadores.addEventListener('click', (e) => {
                if (e.target === modalOperadores) cerrarModalOperadores();
            });
        }

        const listaOperadoresAdmin = document.getElementById('lista-operadores-admin');
        const formCrearOperador = document.getElementById('form-crear-operador');
        const btnRecargarOperadores = document.getElementById('btn-recargar-operadores');

        if (btnRecargarOperadores) {
            btnRecargarOperadores.addEventListener('click', cargarOperadores);
        }

        // Función para consultar y renderizar la lista de operadores en el DOM
        async function cargarOperadores() {
            if (!listaOperadoresAdmin) return;
            listaOperadoresAdmin.innerHTML = `
                <tr>
                    <td colspan="5" class="py-6 text-center text-slate-400">
                        <div class="flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px] animate-spin text-blue-600">sync</span>
                            <span>Cargando directorio de operadores...</span>
                        </div>
                    </td>
                </tr>
            `;

            try {
                const res = await fetch('/api/v1/admin/operadores');
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || 'No autorizado para consultar operadores.');
                }
                const operadores = await res.json();

                if (!Array.isArray(operadores) || operadores.length === 0) {
                    listaOperadoresAdmin.innerHTML = `
                        <tr>
                            <td colspan="5" class="py-6 text-center text-slate-400">
                                No hay operadores registrados actualmente.
                            </td>
                        </tr>
                    `;
                    return;
                }

                listaOperadoresAdmin.innerHTML = operadores.map(op => {
                    const rolTexto = `<span class="text-xs font-medium text-slate-500 uppercase">${op.rol}</span>`;
                    
                    const estadoTexto = op.activo 
                        ? '<span class="inline-flex items-center gap-1.5 text-xs text-slate-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Activo</span>'
                        : '<span class="inline-flex items-center gap-1.5 text-xs text-slate-400"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Inactivo</span>';

                    const btnDesactivar = op.activo
                        ? `<button type="button" class="btn-desactivar-op text-xs font-medium text-red-600 hover:underline cursor-pointer" data-id="${op.id}" data-email="${op.email}">Desactivar</button>`
                        : `<span class="text-xs text-slate-400 font-normal italic">Desactivado</span>`;

                    return `
                        <tr class="hover:bg-slate-50/70 transition-colors">
                            <td class="py-2.5 px-3.5 font-mono text-slate-400 text-xs">#${op.id}</td>
                            <td class="py-2.5 px-3.5 font-medium text-slate-800">${op.email}</td>
                            <td class="py-2.5 px-3.5">${rolTexto}</td>
                            <td class="py-2.5 px-3.5">${estadoTexto}</td>
                            <td class="py-2.5 px-3.5 text-right">${btnDesactivar}</td>
                        </tr>
                    `;
                }).join('');

                // Listeners dinámicos para los botones "Desactivar" (PATCH /api/v1/admin/operadores/:id)
                listaOperadoresAdmin.querySelectorAll('.btn-desactivar-op').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const opId = btn.getAttribute('data-id');
                        const opEmail = btn.getAttribute('data-email');
                        if (!confirm(`¿Confirmas desactivar al operador ${opEmail}? Se revocará su acceso al sistema.`)) {
                            return;
                        }

                        try {
                            const patchRes = await fetch(`/api/v1/admin/operadores/${opId}`, {
                                method: 'PATCH'
                            });
                            const patchData = await patchRes.json();
                            if (!patchRes.ok) {
                                throw new Error(patchData.error || 'Error al desactivar operador.');
                            }
                            Toast.show(`Operador ${opEmail} desactivado.`, 'warning');
                            cargarOperadores();
                        } catch (err) {
                            Toast.show(err.message, 'error');
                        }
                    });
                });

            } catch (err) {
                console.error('[Admin Operadores] Error al listar:', err);
                listaOperadoresAdmin.innerHTML = `
                    <tr>
                        <td colspan="5" class="py-6 text-center text-rose-500 font-medium">
                            ${err.message || 'Error al consultar operadores.'}
                        </td>
                    </tr>
                `;
            }
        }

        // Listener del Formulario para Crear Operador (POST /api/v1/admin/operadores)
        if (formCrearOperador) {
            formCrearOperador.addEventListener('submit', async (e) => {
                e.preventDefault();
                const emailInput = document.getElementById('admin-op-email');
                const passInput = document.getElementById('admin-op-password');
                const rolSelect = document.getElementById('admin-op-rol');
                const submitBtn = document.getElementById('btn-submit-crear-operador');

                const payload = {
                    email: emailInput ? emailInput.value.trim() : '',
                    password: passInput ? passInput.value : '',
                    rol: rolSelect ? rolSelect.value : 'OPERADOR'
                };

                if (!payload.email || !payload.password) {
                    Toast.show('Por favor completa todos los campos requeridos.', 'warning');
                    return;
                }

                if (submitBtn) submitBtn.disabled = true;

                try {
                    const res = await fetch('/api/v1/admin/operadores', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.error || 'Error al registrar nuevo operador.');
                    }

                    Toast.show(`Operador ${data.operador?.email || payload.email} creado con éxito.`, 'success');
                    formCrearOperador.reset();
                    cargarOperadores();
                } catch (err) {
                    Toast.show(err.message, 'error');
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }

        // =====================================================================
        // GESTIÓN DE PERFIL: CAMBIAR CONTRASEÑA
        // =====================================================================
        const modalPassword = document.getElementById('modal-cambiar-password');
        const btnCambiarPassword = document.getElementById('btn-cambiar-password');
        const btnCerrarModalPass = document.getElementById('btn-cerrar-modal-password');
        const btnCancelarPass = document.getElementById('btn-cancelar-password');
        const formCambiarPassword = document.getElementById('form-cambiar-password');

        function abrirModalPassword() {
            if (perfilDropdown) perfilDropdown.classList.add('hidden');
            if (!modalPassword) return;
            modalPassword.classList.remove('hidden');
            modalPassword.classList.add('flex');
            const passActualInput = document.getElementById('password_actual');
            if (passActualInput) passActualInput.focus();
        }

        function cerrarModalPassword() {
            if (!modalPassword) return;
            modalPassword.classList.add('hidden');
            modalPassword.classList.remove('flex');
            if (formCambiarPassword) formCambiarPassword.reset();
        }

        if (btnCambiarPassword) {
            btnCambiarPassword.addEventListener('click', abrirModalPassword);
        }

        if (btnCerrarModalPass) {
            btnCerrarModalPass.addEventListener('click', cerrarModalPassword);
        }

        if (btnCancelarPass) {
            btnCancelarPass.addEventListener('click', cerrarModalPassword);
        }

        if (modalPassword) {
            modalPassword.addEventListener('click', (e) => {
                if (e.target === modalPassword) cerrarModalPassword();
            });
        }

        if (formCambiarPassword) {
            formCambiarPassword.addEventListener('submit', async (e) => {
                e.preventDefault();
                const passActual = document.getElementById('password_actual')?.value;
                const passNuevo = document.getElementById('password_nuevo')?.value;
                const submitBtn = document.getElementById('btn-submit-password');

                if (!passActual || !passNuevo) {
                    Toast.show('Por favor llena todos los campos obligatorios.', 'warning');
                    return;
                }

                if (passNuevo.length < 6) {
                    Toast.show('La nueva contraseña debe tener al menos 6 caracteres.', 'warning');
                    return;
                }

                if (submitBtn) submitBtn.disabled = true;

                try {
                    const res = await fetch('/api/v1/auth/password', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            password_actual: passActual,
                            password_nuevo: passNuevo
                        })
                    });

                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.error || 'Error al actualizar la contraseña.');
                    }

                    Toast.show(data.mensaje || 'Contraseña actualizada con éxito.', 'success');
                    cerrarModalPassword();
                } catch (err) {
                    Toast.show(err.message, 'error');
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }
    }
});