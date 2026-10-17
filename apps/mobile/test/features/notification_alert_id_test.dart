import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/notifications/local_alerts.dart';

void main() {
  test(
    'alert IDs use a stable positive digest across launches and isolates',
    () {
      expect(stableAlertId('notification-test'), 1339238117);
      expect(
        stableAlertId('notification-test'),
        stableAlertId('notification-test'),
      );
      expect(stableAlertId('another-notification'), isNot(1339238117));
    },
  );
}
