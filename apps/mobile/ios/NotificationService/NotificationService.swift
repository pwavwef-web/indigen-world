import UserNotifications
import Foundation

/// A bounded, text-preserving attachment fetch. This extension never authenticates
/// as a member, performs reactions, or treats the push as an authorization grant.
final class NotificationService: UNNotificationServiceExtension, URLSessionDownloadDelegate {
  private var handler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?
  private var session: URLSession?
  private var completed = false
  private let allowedHosts = ["firebasestorage.googleapis.com", "storage.googleapis.com"]
  private let maxBytes: Int64 = 5 * 1024 * 1024
  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    handler = contentHandler
    content = request.content.mutableCopy() as? UNMutableNotificationContent
    guard let content = content, content.userInfo["previews"] as? String != "false",
          let raw = content.userInfo["imageUrl"] as? String, let url = URL(string: raw),
          url.scheme == "https", allowedHosts.contains(url.host ?? "") else { finish(); return }
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 6
    config.timeoutIntervalForResource = 8
    session = URLSession(configuration: config, delegate: self, delegateQueue: OperationQueue.main)
    session?.downloadTask(with: url).resume()
  }
  override func serviceExtensionTimeWillExpire() { finish() }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    if totalBytesWritten > maxBytes || totalBytesExpectedToWrite > maxBytes { downloadTask.cancel(); finish() }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    defer { finish() }
    guard let response = downloadTask.response as? HTTPURLResponse, response.statusCode == 200,
          ["image/jpeg", "image/png"].contains(response.mimeType ?? ""),
          let size = try? FileManager.default.attributesOfItem(atPath: location.path)[.size] as? NSNumber,
          size.int64Value <= maxBytes else { return }
    do {
      let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let target = folder.appendingPathComponent(response.mimeType == "image/png" ? "image.png" : "image.jpg")
      try FileManager.default.moveItem(at: location, to: target)
      content?.attachments = [try UNNotificationAttachment(identifier: "preview", url: target)]
    } catch { /* The original text remains available if decoding fails. */ }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { if error != nil { finish() } }
  private func finish() {
    guard !completed, let content = content else { return }
    completed = true
    handler?(content); handler = nil
    session?.invalidateAndCancel(); session = nil
  }
}
