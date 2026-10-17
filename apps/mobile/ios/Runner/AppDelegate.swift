import Flutter
import UIKit
import UserNotifications
import flutter_local_notifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var actionChannel: FlutterMethodChannel?
  private let queueKey = "indigen.notification.actions.v1"
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    FlutterLocalNotificationsPlugin.setPluginRegistrantCallback { registry in GeneratedPluginRegistrant.register(with: registry) }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "IndigenNotificationActions") {
      let channel = FlutterMethodChannel(name: "world.indigen/notification_actions", binaryMessenger: registrar.messenger())
      actionChannel = channel
      channel.setMethodCallHandler { [weak self] call, result in
        guard let self = self else { result(nil); return }
        let queue = (UserDefaults.standard.array(forKey: self.queueKey) as? [[String: Any]] ?? []).filter { Date().timeIntervalSince1970 - ($0["queuedAt"] as? Double ?? 0) < 604800 }
        UserDefaults.standard.set(queue, forKey: self.queueKey)
        if call.method == "pending" { result(queue); return }
        if call.method == "ack", let args = call.arguments as? [String: Any], let id = args["id"] as? String {
          if args["read"] as? Bool == true, let row = queue.first(where: { $0["id"] as? String == id }), let requestId = row["requestId"] as? String { UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [requestId]) }
          UserDefaults.standard.set(queue.filter { $0["id"] as? String != id }, forKey: self.queueKey)
          result(nil); return
        }
        result(FlutterMethodNotImplemented)
      }
    }
  }

  override func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
    let info = response.notification.request.content.userInfo
    let action = response.actionIdentifier
    if ["like", "read", "reply"].contains(action), let recipient = info["recipientId"] as? String, let notification = info["notificationId"] as? String, info["payloadVersion"] as? String == "2" {
      var queue = UserDefaults.standard.array(forKey: queueKey) as? [[String: Any]] ?? []
      var row: [String: Any] = ["id": UUID().uuidString, "recipientId": recipient, "notificationId": notification, "action": action, "requestId": response.notification.request.identifier, "queuedAt": Date().timeIntervalSince1970]
      if let reply = response as? UNTextInputNotificationResponse { row["text"] = reply.userText }
      queue = queue.filter { Date().timeIntervalSince1970 - ($0["queuedAt"] as? Double ?? 0) < 604800 }
      queue.append(row); UserDefaults.standard.set(Array(queue.suffix(50)), forKey: queueKey)
      actionChannel?.invokeMethod("actionsAvailable", arguments: nil)
      completionHandler(); return
    }
    super.userNotificationCenter(center, didReceive: response, withCompletionHandler: completionHandler)
  }
}
