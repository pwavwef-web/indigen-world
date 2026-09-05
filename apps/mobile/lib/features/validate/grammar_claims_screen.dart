import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

class GrammarClaimsScreen extends StatefulWidget {
  const GrammarClaimsScreen({
    super.key,
    required this.evidenceId,
    required this.dialect,
  });
  final String evidenceId, dialect;
  @override
  State<GrammarClaimsScreen> createState() => _GrammarClaimsScreenState();
}

class _GrammarClaimsScreenState extends State<GrammarClaimsScreen> {
  String? _error;
  bool _busy = false;
  Future<void> _evidence(Map<String, dynamic> claim) async {
    setState(() => _busy = true);
    try {
      final ids = (claim['evidenceIds'] as List? ?? []).whereType<String>();
      final documents = await Future.wait(
        ids.map(
          (id) => FirebaseFirestore.instance
              .collection('grammarNotes')
              .doc(id)
              .get(),
        ),
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Supporting sentences'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final doc in documents) ...[
                    Text(
                      doc.data()?['title'] as String? ?? 'Evidence unavailable',
                    ),
                    Text(
                      'Current status: ${doc.data()?['status'] ?? 'unavailable'}',
                    ),
                    for (final row
                        in (doc.data()?['examples'] as List? ?? [])
                            .whereType<Map>()) ...[
                      const SizedBox(height: 12),
                      Text(row['kasem'] as String? ?? ''),
                      Text(row['english'] as String? ?? ''),
                      Text('Dialect: ${row['dialect'] ?? 'unknown'}'),
                      for (final key in [
                        'situation',
                        'preceding',
                        'intent',
                        'register',
                      ])
                        if ((row['context'] as Map?)?[key]
                            case final String text when text.isNotEmpty)
                          Text('$key: $text'),
                      if (row['source'] case final String source
                          when source.isNotEmpty)
                        Text('Source: $source'),
                    ],
                    const Divider(),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not open the supporting evidence.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _propose() async {
    final controllers = {
      for (final key in ['title', 'summary', 'scope', 'triggers', 'dialect'])
        key: TextEditingController(),
    };
    controllers['dialect']!.text = widget.dialect;
    final route = DialogRoute<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Propose a grammar rule'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'A rule starts as a hypothesis. Two independent reviewers must support it. This sentence note will be linked as evidence.',
                ),
                for (final field in const {
                  'title': 'Short title',
                  'summary': 'What does the evidence show?',
                  'scope': 'When does this apply? Include exceptions or uncertainty.',
                  'dialect': 'Dialect',
                  'triggers':
                      'Words people might ask about, separated by commas',
                }.entries)
                  TextField(
                    controller: controllers[field.key],
                    maxLines: field.key == 'scope' || field.key == 'summary'
                        ? 3
                        : 1,
                    decoration: InputDecoration(labelText: field.value),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, {
              for (final field in controllers.entries)
                field.key: field.value.text,
              'evidenceIds': [widget.evidenceId],
            }),
            child: const Text('Propose'),
          ),
        ],
      ),
    );
    final data = await Navigator.of(context).push(route);
    await route.completed;
    for (final controller in controllers.values) {
      controller.dispose();
    }
    if (data == null || !mounted) return;
    await _call('submitGrammarClaim', data);
  }

  Future<void> _call(String name, Map<String, dynamic> data) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await FirebaseFunctions.instance.httpsCallable(name).call(data);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Decision recorded with its evidence.')),
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) setState(() => _error = error.message ?? 'Could not save.');
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not save. Try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _review(Map<String, dynamic> claim, String decision) async {
    final reason = TextEditingController();
    final route = DialogRoute<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          decision == 'supported' ? 'Support this rule' : 'Record a concern',
        ),
        content: TextField(
          controller: reason,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Explain your evidence and its limits',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, reason.text),
            child: const Text('Record independent review'),
          ),
        ],
      ),
    );
    final answer = await Navigator.of(context).push(route);
    await route.completed;
    reason.dispose();
    if (answer != null && mounted) {
      await _call('decideGrammarClaim', {
        'claimId': claim['id'],
        'version': claim['version'],
        'decision': decision,
        'reason': answer,
      });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Grammar evidence'),
      actions: [
        IconButton(
          onPressed: _busy ? null : _propose,
          tooltip: 'Propose a rule from this evidence',
          icon: const Icon(Icons.add),
        ),
      ],
    ),
    body: Column(
      children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: FirebaseFirestore.instance
                .collection('grammarClaims')
                .limit(100)
                .snapshots(),
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return const Center(
                  child: Text('Could not load grammar claims.'),
                );
              }
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.data!.docs.isEmpty) {
                return const Center(
                  child: Text(
                    'Use + to propose a rule supported by this reviewed sentence.',
                  ),
                );
              }
              return ListView(
                children: snapshot.data!.docs.map((doc) {
                  final data = doc.data();
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            data['title'] as String? ?? '',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(data['status'] as String? ?? 'hypothesis'),
                          Text(data['summary'] as String? ?? ''),
                          Text(data['scope'] as String? ?? ''),
                          Text(
                            'Dialect: ${data['dialect'] as String? ?? 'unknown'}',
                          ),
                          TextButton(
                            onPressed: _busy ? null : () => _evidence(data),
                            child: const Text('Read supporting sentences'),
                          ),
                          Wrap(
                            children: [
                              TextButton(
                                onPressed: _busy
                                    ? null
                                    : () => _review(data, 'supported'),
                                child: const Text('Support with evidence'),
                              ),
                              TextButton(
                                onPressed: _busy
                                    ? null
                                    : () => _review(data, 'disputed'),
                                child: const Text('Raise a concern'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ),
      ],
    ),
  );
}
