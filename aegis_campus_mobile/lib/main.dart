import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

/// URL base del servidor Aegis Campus Web en producción (Render)
const String kBaseUrl = 'https://aegis-campus-producci-n.onrender.com';

void main() {
  runApp(const AegisCampusApp());
}

class AegisCampusApp extends StatelessWidget {
  const AegisCampusApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Aegis Campus',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFFC8102E),
        scaffoldBackgroundColor: const Color(0xFFF0F4F9),
      ),
      home: const ReportarEmergenciaScreen(),
    );
  }
}

class ReportarEmergenciaScreen extends StatefulWidget {
  const ReportarEmergenciaScreen({super.key});

  @override
  State<ReportarEmergenciaScreen> createState() => _ReportarEmergenciaScreenState();
}

class _ReportarEmergenciaScreenState extends State<ReportarEmergenciaScreen> {
  final _formKey = GlobalKey<FormState>();
  final _descripcionController = TextEditingController();
  final _telefonoController = TextEditingController();

  String? _zonaSeleccionada;
  String? _tipoSeleccionado;
  String _severidadSeleccionada = 'MEDIA';
  bool _isLoading = false;

  static const List<String> _zonasCampus = [
    'Edificio E - Fisioterapia (PB)',
    'Edificio E - Centro de Cómputo (PA)',
    'Edificio D - Lab. Gastronomía',
    'Edificio B - Biblioteca / CAE',
    'Edificio I - Taller de Diseño',
    'Edificio H - Aulas y Cubículos',
    'Zona 1 - Alberca (PB)',
    'Zona 1 - Gimnasio (PA)',
    'Zona 2 - Campo Deportivo',
    'Zona 3 - Cancha de Usos Múltiples',
    'Estacionamiento Norte (Círculo - Campo)',
    'Estacionamiento Central (Triángulo - Edificios)',
    'Estacionamiento Sur-Oeste (Cuadrado - Diseño)',
  ];

  static const List<Map<String, String>> _tiposIncidente = [
    {'value': 'Medica', 'label': 'Emergencia Médica'},
    {'value': 'Seguridad', 'label': 'Seguridad / Vigilancia'},
    {'value': 'Incendio', 'label': 'Protección Civil / Incendio'},
  ];

  @override
  void dispose() {
    _descripcionController.dispose();
    _telefonoController.dispose();
    super.dispose();
  }

  void _mostrarModalSuscripcion() {
    final emailSubController = TextEditingController();
    bool isSubscribing = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final bottomPadding = MediaQuery.of(context).viewInsets.bottom;
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: 20 + bottomPadding,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Avisos por correo',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1F1F1F),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.of(sheetContext).pop(),
                        icon: const Icon(Icons.close, size: 20, color: Color(0xFF64748B)),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: emailSubController,
                    keyboardType: TextInputType.emailAddress,
                    autofocus: true,
                    style: const TextStyle(fontSize: 13, color: Color(0xFF1F1F1F)),
                    decoration: _inputDecoration(
                      hintText: 'ejemplo@uvmnet.edu',
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: isSubscribing
                        ? null
                        : () async {
                            final email = emailSubController.text.trim();
                            if (email.isEmpty || !email.contains('@')) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Ingrese un correo electrónico válido.'),
                                  backgroundColor: Color(0xFFC5221F),
                                  behavior: SnackBarBehavior.floating,
                                ),
                              );
                              return;
                            }

                            setModalState(() {
                              isSubscribing = true;
                            });

                            try {
                              final response = await http
                                  .post(
                                    Uri.parse('$kBaseUrl/api/v1/suscriptores'),
                                    headers: {'Content-Type': 'application/json'},
                                    body: jsonEncode({'email': email}),
                                  )
                                  .timeout(const Duration(seconds: 15));

                              if (!sheetContext.mounted) return;
                              Navigator.of(sheetContext).pop();

                              if (response.statusCode >= 200 && response.statusCode < 300) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Suscripción activada con éxito.'),
                                    backgroundColor: Color(0xFF137333),
                                    behavior: SnackBarBehavior.floating,
                                  ),
                                );
                              } else {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text('Error al suscribir (${response.statusCode})'),
                                    backgroundColor: const Color(0xFFC5221F),
                                    behavior: SnackBarBehavior.floating,
                                  ),
                                );
                              }
                            } catch (e) {
                              if (!sheetContext.mounted) return;
                              Navigator.of(sheetContext).pop();
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('Error de conexión: $e'),
                                  backgroundColor: const Color(0xFFC5221F),
                                  behavior: SnackBarBehavior.floating,
                                ),
                              );
                            }
                          },
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFC8102E),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      elevation: 0,
                    ),
                    child: isSubscribing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Text(
                            'Suscribirme',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _enviarReporte() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    final telefonoInput = _telefonoController.text.trim();
    final payload = {
      'nombre_reportante': 'Anónimo',
      'telefono': telefonoInput.isEmpty ? 'Anónimo' : telefonoInput,
      'tipo_emergencia': _tipoSeleccionado,
      'severidad': _severidadSeleccionada,
      'zona_id': _zonaSeleccionada,
      'descripcion': _descripcionController.text.trim(),
      'coordenadas': {
        'lat': 21.0475,
        'lng': -89.6322,
      },
      // Aliases de compatibilidad directa
      'zona': _zonaSeleccionada,
      'prioridad': _severidadSeleccionada,
      'detalles': _descripcionController.text.trim(),
    };

    try {
      final response = await http
          .post(
            Uri.parse('$kBaseUrl/api/v1/incidentes'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 45));

      if (!mounted) return;

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final data = jsonDecode(response.body);
        final incidenteId = data['incidente']?['id'] ?? 'Registrado';

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Reporte $incidenteId enviado con éxito.'),
            backgroundColor: const Color(0xFF137333),
            behavior: SnackBarBehavior.floating,
          ),
        );

        _formKey.currentState!.reset();
        _descripcionController.clear();
        _telefonoController.clear();
        setState(() {
          _zonaSeleccionada = null;
          _tipoSeleccionado = null;
          _severidadSeleccionada = 'MEDIA';
        });
      } else {
        String errorMsg = 'Error al enviar reporte (${response.statusCode})';
        try {
          final errJson = jsonDecode(response.body);
          if (errJson['error'] != null) {
            errorMsg = errJson['error'].toString();
          }
        } catch (_) {}

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMsg),
            backgroundColor: const Color(0xFFC5221F),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error de conexión con el servidor: $e'),
          backgroundColor: const Color(0xFFC5221F),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  InputDecoration _inputDecoration({String? hintText}) {
    return InputDecoration(
      filled: true,
      fillColor: Colors.white,
      hintText: hintText,
      hintStyle: const TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFC8102E), width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFC5221F)),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFC5221F), width: 1.5),
      ),
    );
  }

  Widget _buildFieldLabel(String label, {bool isRequired = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: RichText(
        text: TextSpan(
          text: label,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Color(0xFF1F1F1F),
          ),
          children: isRequired
              ? const [
                  TextSpan(
                    text: ' *',
                    style: TextStyle(
                      color: Color(0xFFC5221F),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ]
              : const [
                  TextSpan(
                    text: ' Opcional',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.normal,
                      color: Color(0xFF64748B),
                    ),
                  ),
                ],
        ),
      ),
    );
  }

  Widget _buildPrioridadRail() {
    final opciones = [
      {'val': 'BAJA', 'label': 'Baja', 'color': const Color(0xFF1A73E8)},
      {'val': 'MEDIA', 'label': 'Media', 'color': const Color(0xFFE37400)},
      {'val': 'ALTA', 'label': 'Alta', 'color': const Color(0xFFC5221F)},
    ];

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color(0xFFF0F4F9),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: opciones.map((opcion) {
          final isSelected = _severidadSeleccionada == opcion['val'];
          final dotColor = opcion['color'] as Color;
          final label = opcion['label'] as String;
          final val = opcion['val'] as String;

          return Expanded(
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _severidadSeleccionada = val;
                });
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                height: 36,
                decoration: BoxDecoration(
                  color: isSelected ? Colors.white : Colors.transparent,
                  borderRadius: BorderRadius.circular(6),
                  boxShadow: isSelected
                      ? const [
                          BoxShadow(
                            color: Color(0x0A000000),
                            blurRadius: 2,
                            offset: Offset(0, 1),
                          ),
                        ]
                      : null,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: dotColor,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      label,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                        color: isSelected ? const Color(0xFF1F1F1F) : const Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 500),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Cabecera Integrada: Fila superior con botón de Alertas
                      Row(
                        children: [
                          const Expanded(
                            child: Row(
                              children: [
                                Icon(
                                  Icons.shield_outlined,
                                  color: Color(0xFFC8102E),
                                  size: 18,
                                ),
                                SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    'Aegis Campus • UVM Mérida',
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                      color: Color(0xFF64748B),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 4),
                          TextButton.icon(
                            onPressed: _mostrarModalSuscripcion,
                            icon: const Icon(
                              Icons.notifications_none_rounded,
                              size: 16,
                              color: Color(0xFFC8102E),
                            ),
                            label: const Text(
                              'Alertas',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFFC8102E),
                              ),
                            ),
                            style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Título
                      const Text(
                        'Reportar una emergencia',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1F1F1F),
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 4),

                      // Subtítulo
                      const Text(
                        'Envía una alerta directa al centro de monitoreo del campus.',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFF444746),
                        ),
                      ),
                      const SizedBox(height: 24),

                      // Campo: Ubicación en el campus
                      _buildFieldLabel('Ubicación en el campus', isRequired: true),
                      DropdownButtonFormField<String>(
                        initialValue: _zonaSeleccionada,
                        isExpanded: true,
                        menuMaxHeight: 350.0,
                        decoration: _inputDecoration(
                          hintText: 'Seleccionar área en el campus...',
                        ),
                        items: _zonasCampus.map((zona) {
                          return DropdownMenuItem<String>(
                            value: zona,
                            child: Text(
                              zona,
                              style: const TextStyle(fontSize: 13, color: Color(0xFF1F1F1F)),
                            ),
                          );
                        }).toList(),
                        onChanged: (val) {
                          setState(() {
                            _zonaSeleccionada = val;
                          });
                        },
                        validator: (val) {
                          if (val == null || val.isEmpty) {
                            return 'Seleccione la ubicación en el campus';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),

                      // Campo: Tipo de incidente
                      _buildFieldLabel('Tipo de incidente', isRequired: true),
                      DropdownButtonFormField<String>(
                        initialValue: _tipoSeleccionado,
                        isExpanded: true,
                        menuMaxHeight: 250.0,
                        decoration: _inputDecoration(
                          hintText: 'Seleccionar tipo...',
                        ),
                        items: _tiposIncidente.map((tipo) {
                          return DropdownMenuItem<String>(
                            value: tipo['value'],
                            child: Text(
                              tipo['label']!,
                              style: const TextStyle(fontSize: 13, color: Color(0xFF1F1F1F)),
                            ),
                          );
                        }).toList(),
                        onChanged: (val) {
                          setState(() {
                            _tipoSeleccionado = val;
                          });
                        },
                        validator: (val) {
                          if (val == null || val.isEmpty) {
                            return 'Seleccione el tipo de incidente';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),

                      // Campo: Prioridad (Segmented Control)
                      _buildFieldLabel('Prioridad', isRequired: true),
                      _buildPrioridadRail(),
                      const SizedBox(height: 16),

                      // Campo: Detalles de la situación (Opcional)
                      _buildFieldLabel('Detalles de la situación'),
                      TextFormField(
                        controller: _descripcionController,
                        maxLines: 3,
                        maxLength: 300,
                        style: const TextStyle(fontSize: 13, color: Color(0xFF1F1F1F)),
                        decoration: _inputDecoration(
                          hintText: 'Describa síntomas, personas afectadas o referencias visuales...',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 16),

                      // Campo: Teléfono de contacto
                      _buildFieldLabel('Teléfono de contacto'),
                      TextFormField(
                        controller: _telefonoController,
                        keyboardType: TextInputType.phone,
                        maxLength: 30,
                        style: const TextStyle(fontSize: 13, color: Color(0xFF1F1F1F)),
                        decoration: _inputDecoration(
                          hintText: 'Ej. 999-123-4567',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 24),

                      // Botón de Envío
                      SizedBox(
                        width: double.infinity,
                        height: 44,
                        child: FilledButton(
                          onPressed: _isLoading ? null : _enviarReporte,
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFFC8102E),
                            disabledBackgroundColor: const Color(0x99C8102E),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            elevation: 0,
                          ),
                          child: _isLoading
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                    strokeWidth: 2.2,
                                  ),
                                )
                              : const Text(
                                  'Enviar reporte',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
