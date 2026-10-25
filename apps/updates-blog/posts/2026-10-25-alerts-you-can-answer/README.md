# Rich alerts in the notification shade, plus five usability features (0.1.35+44)

- **Title:** Alerts you can answer, and five shortcuts to less tapping
- **Topic:** Android notifications drawn in the app's own design (avatar with kind badge, attached picture, Reply / Like / Mark as read, conversations, grouped summaries) and five usability features: app-icon shortcuts, message drafts, copy any message, Undo for deleted notifications, snooze alerts.
- **Labels:** Notifications, Mobile, Release, Messages, Indigen World
- **Search description:** Indigen World 0.1.35 for Android shows notifications the way the app does — the person's photo, the picture, and Reply, Like and Mark as read buttons — and adds shortcuts, drafts, copy, Undo and snooze.
- **Status (25 October 2026):** Built and tested. Signed Android `0.1.35+44` AAB built (SHA-256 `6c0fad2f…7f4c`, upload key; see `docs/operations/release-0.1.35-44.md`) and checked on an Android emulator. **Backend deployed 25 October 2026 (13:57 UTC)**: `onCommunityNotificationCreated`, `retryNotificationPushes`, `onChatMessageCreated`, `onNotificationCreated` and `notificationAction` all updated and verified (same 249 live functions before and after; cold-start probe answers). **Not uploaded to Play**, so no member's phone has the new design yet; older app versions now also show the post picture in their system notifications. Not published on Blogger. The post says the update is not in the Play Store yet — change that once it is.
- **Publishing owner:** Chinedum. Preparing this post does not authorize publishing or sharing it.

## What changed (code)

| Change | Where |
| --- | --- |
| Android pushes drawn by the app in the notification centre's design: actor avatar wearing the kind badge (composited off-thread), Big Picture for the attached image, kind as sub-text, post time, per-channel groups with an Inbox-style summary and **Mark all as read**, silent redraw after a button ("Liked", "Reply sent", "Sending when you are online", "Not sent") | `apps/mobile/lib/features/notifications/alert_presentation.dart`, `notification_art.dart`, `local_alerts.dart`; badge glyphs in `apps/mobile/assets/notification_badges/` drawn by `apps/mobile/tool/notification_badges/render_badges_test.dart` |
| Buttons: Reply (inline text) / Like / Mark as read on community alerts through the `notificationAction` callable; Reply / Mark as read on messages written straight to the thread; offline answers are kept and sent later | `notification_actions.dart`, `chat_repository.dart` (`replyFromAlert`) |
| Backend: devices announce `pushRenderer: 2`; only those receive data-only messages (`RICH_NOTIFICATION_PUSH_ENABLED=false` is now a kill switch); actor name/avatar, send time and channel in every payload; system notifications carry `imageUrl`; liking or replying from an alert marks it read; message pushes carry recipient/sender ids | `services/functions/src/push.ts`, `community-notifications.ts`, `chat-notifications.ts`, `notification-actions.ts`; tests `firebase/tests/richPush.test.mjs` |
| Alerts already dealt with in the app leave the shade (row read or deleted, conversation opened, mark all read) | `local_alerts.dart` (`clearAlertsFor`, `clearAlertGroup`), `notifications_screen.dart`, `chat_screen.dart` |
| **Send a test alert** in Alert settings (two sample alerts that answer locally) | `notification_settings_screen.dart`, `showTestAlerts` |
| 1. App-icon shortcuts: Look up, New post, Messages, Alerts (dynamic shortcuts, `indigen://open/<id>`, new `/dictionary` and `/compose` routes) | `lib/core/app_shortcuts.dart`, `deep_links.dart`, `app_router.dart`, `compose_from_shortcut.dart`, `android/.../AppShortcutsChannel.kt`, `res/drawable/ic_shortcut_*.xml`, `res/raw/shortcut_icons_keep.xml` |
| 2. Message drafts kept per account and conversation; "Draft:" in the inbox | `lib/features/community/data/chat_drafts.dart`, `chat_screen.dart`, `messages_screen.dart` |
| 3. Copy any message (long-press menu; Delete for your own) | `chat_screen.dart` |
| 4. Undo instead of a confirm dialog when deleting a notification | `notifications_screen.dart` |
| 5. Snooze alerts on this phone (1 h, 8 h, until 07:00), silent delivery, banner with Resume | `lib/features/notifications/alert_snooze.dart`, `notifications_screen.dart`, `notification_settings_screen.dart` |
| Fix: `ChatScreen` used `ref` in `dispose`, which Riverpod 3 refuses, so a closed conversation stayed marked open and its in-app alerts were suppressed | `chat_screen.dart` |
| Fix: Flutter's own deep linking (on by default since Flutter 3.27) was never switched off, so every incoming link was also handed to the router directly — a shared post opened with no app beneath it (Back left the app) and the shortcut's `focus=search` was lost. Switched off as `deep_links.dart` always assumed | `android/app/src/main/AndroidManifest.xml` (`flutter_deeplinking_enabled`), `ios/Runner/Info.plist` (`FlutterDeepLinkingEnabled`) |

## Images

`screens/` holds the unaltered screenshots; `images/` holds the branded cover
and framed figures that `post.html` uses (frames, backgrounds and titles are
illustration). Regenerate with:

```text
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-25-alerts-you-can-answer
```

- `shade-alert.png`, `shade-conversation.png`, `alert-settings.png`,
  `shortcuts.png` — actual screenshots of the signed 0.1.35 (44) release
  build, installed from its AAB on an Android 16 emulator (Pixel 7 image) in
  guest mode, with the demo-mode status bar. The alerts are the app's own
  sample alerts from **Send a test alert**: they write nothing anywhere, and
  their picture is the bundled Paga crocodile pond photograph. The reply in
  `shade-conversation.png` was typed into the notification and sent.
  Taken on the candidate built just before the last change (the dictionary
  shortcut's keyboard), which does not appear in these pictures.
- `messages-draft.png`, `notifications-undo.png`, `chat-copy.png` — actual
  Flutter screens rendered in a test harness (1170×2532, 3×) with sample
  conversations and notifications. The names, messages and times are made up
  for the pictures; no real member's data is shown.

Credits: Paga pond — Dieu-Donné Gameli, Wikimedia Commons, CC BY-SA 3.0 (see
`apps/mobile/assets/places/README.md`). The Indigen World mark is the existing
repository logo. Badge glyphs are Material Icons (Apache 2.0).

## Blogger handoff

1. Confirm the release status first: the post says the update is built but not
   in the Play Store and that the new alert design needs the server update.
   Change that wording once both are true.
2. Upload every image in `images/` to Blogger, keep the captions and alt text,
   and replace each `images/...` path with Blogger's image URL.
3. Paste `post.html` in HTML mode; set the title, labels and search
   description above; preview on desktop and mobile.
4. After publishing, put the article URL into `share.md`. Sharing is a separate
   step for Chinedum.
