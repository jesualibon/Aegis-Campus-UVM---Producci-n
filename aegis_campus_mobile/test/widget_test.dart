import 'package:flutter_test/flutter_test.dart';
import 'package:aegis_campus_mobile/main.dart';

void main() {
  testWidgets('Carga inicial de pantalla de reporte de emergencia', (WidgetTester tester) async {
    await tester.pumpWidget(const AegisCampusApp());

    expect(find.text('Reportar una emergencia'), findsOneWidget);
    expect(find.text('Aegis Campus • UVM Mérida'), findsOneWidget);
    expect(find.text('Enviar reporte'), findsOneWidget);
  });
}
