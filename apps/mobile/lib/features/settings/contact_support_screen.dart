import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/support_channels.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:url_launcher/url_launcher.dart';

class ContactSupportScreen extends StatefulWidget {
  const ContactSupportScreen({super.key});
  @override
  State<ContactSupportScreen> createState() => _ContactSupportScreenState();
}

class _ContactSupportScreenState extends State<ContactSupportScreen> {
  bool _busy = false;
  Future<void> _open(Uri uri) async {
    setState(() => _busy = true);
    try {
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw StateError('No app can open this link');
      }
    } on Object {
      if (mounted) {
        showGlassToast(
          context,
          'Could not open it. Try again, or copy the support email.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Contact Support')),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'We are here to help',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 12),
          const Text(
            'Describe what happened and the steps that led to it. Include your app version from Settings when reporting a problem.',
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _busy
                ? null
                : () => _open(
                    Uri(
                      scheme: 'mailto',
                      path: SupportChannels.email,
                      query:
                          'subject=${Uri.encodeComponent('Indigen World support')}',
                    ),
                  ),
            icon: const Icon(Icons.email_outlined),
            label: const Text('Compose support email'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _open(SupportChannels.website),
            icon: const Icon(Icons.open_in_new),
            label: const Text('Open contact page'),
          ),
          const SizedBox(height: 12),
          TextButton.icon(
            onPressed: () async {
              await Clipboard.setData(
                const ClipboardData(text: SupportChannels.email),
              );
              if (context.mounted) {
                showGlassToast(context, 'Support email copied.');
              }
            },
            icon: const Icon(Icons.copy),
            label: const Text(SupportChannels.email),
          ),
          if (_busy) const LinearProgressIndicator(),
        ],
      ),
    ),
  );
}
