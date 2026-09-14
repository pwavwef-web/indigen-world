import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_feedback.dart';

/// Reports use the existing authenticated verdict/review path.
class KawuriReportForm extends ConsumerStatefulWidget {
  const KawuriReportForm({
    required this.question,
    required this.answer,
    super.key,
  });
  final String question;
  final String answer;
  @override
  ConsumerState<KawuriReportForm> createState() => _KawuriReportFormState();
}

class _KawuriReportFormState extends ConsumerState<KawuriReportForm> {
  final _comment = TextEditingController();
  String _reason = 'Inaccurate or unsupported';
  String? _error;
  bool _busy = false;
  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text(
        'Your question, this response and your report will be sent to the review team.',
      ),
      const SizedBox(height: 16),
      DropdownButtonFormField<String>(
        initialValue: _reason,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Reason'),
        items: [
          for (final reason in [
            'Inaccurate or unsupported',
            'Harmful or disrespectful',
            'Privacy or rights concern',
            'Other',
          ])
            DropdownMenuItem(value: reason, child: Text(reason)),
        ],
        onChanged: _busy ? null : (value) => setState(() => _reason = value!),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _comment,
        maxLines: 3,
        maxLength: 1000,
        decoration: const InputDecoration(labelText: 'Details (optional)'),
      ),
      if (_error != null) Text(_error!),
      FilledButton(
        onPressed: _busy ? null : _send,
        child: Text(_busy ? 'Sending…' : 'Send report'),
      ),
    ],
  );
  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await ref
        .read(kawuriFeedbackServiceProvider)
        .rate(
          question: widget.question,
          answer: widget.answer,
          wasRight: false,
          comment: 'Report: $_reason\n${_comment.text.trim()}',
        );
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _busy = false;
        _error = error;
      });
      return;
    }
    Navigator.pop(context);
  }
}
