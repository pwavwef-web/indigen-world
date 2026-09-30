import 'dart:convert';

Map<String, dynamic> knowledgeMap(Object? value) => value is Map
    ? value.map((key, value) => MapEntry(key.toString(), value))
    : <String, dynamic>{};

List<Map<String, dynamic>> knowledgeRows(Object? value) => value is List
    ? value.whereType<Map>().map(knowledgeMap).toList()
    : <Map<String, dynamic>>[];

const knowledgePermissionLabels = {
  'sourceConfirmed': 'I have the right to contribute this material',
  'review': 'Allow community reviewers to check this record',
  'publication': 'Allow future public sharing after review',
  'providerRetrieval': 'Allow Kawuri to send this material to its AI provider',
  'modelTraining': 'Allow use in language model training',
  'evaluation': 'Allow use in language model evaluation',
  'audio': 'Allow attached recordings to be stored and reviewed',
};

String knowledgeStatus(Object? status) => switch (status) {
  'draft' => 'Draft',
  'submitted' => 'Awaiting review',
  'reviewed' => 'One review completed',
  'gold' => 'Gold · independently verified',
  'changes_requested' => 'Changes requested',
  'disputed' => 'Disputed',
  'withdrawn' => 'Withdrawn',
  _ => 'Status unavailable',
};

/// Keeps the original wording and metadata intact while editing one section.
/// Permission is an explicit choice; neither a draft nor a review grants it.
class KnowledgeDraft {
  KnowledgeDraft.newRecord(String datasetType)
    : data = {
        'datasetType': datasetType,
        'language': 'xsm',
        'sourceType': 'speaker',
        'details': <String, dynamic>{},
        'variants': <Map<String, dynamic>>[],
        'relatedRecordIds': <String>[],
        'audio': <Map<String, dynamic>>[],
        'permissions': <String, dynamic>{
          for (final key in knowledgePermissionLabels.keys) key: false,
          'licence': '',
          'culturalAccess': 'open',
        },
      };

  KnowledgeDraft.fromRecord(Map<String, dynamic> record)
    : data = knowledgeMap(jsonDecode(jsonEncode(record)));

  final Map<String, dynamic> data;
  String text(String key) => data[key] as String? ?? '';
  Map<String, dynamic> get details => _map('details');
  Map<String, dynamic> get permissions => _map('permissions');
  List<Map<String, dynamic>> get variants => _rows('variants');
  List<Map<String, dynamic>> get audio => _rows('audio');

  Map<String, dynamic> _map(String key) {
    if (data[key] is Map<String, dynamic>) {
      return data[key] as Map<String, dynamic>;
    }
    final value = knowledgeMap(data[key]);
    data[key] = value;
    return value;
  }

  List<Map<String, dynamic>> _rows(String key) {
    if (data[key] is List<Map<String, dynamic>>) {
      return data[key] as List<Map<String, dynamic>>;
    }
    final value = knowledgeRows(data[key]);
    data[key] = value;
    return value;
  }

  Map<String, dynamic> toRecord() => {
    for (final key in const [
      'datasetType', 'language', 'title', 'original', 'english', 'french',
      'context', 'region', 'source', 'sourceType', 'sourceReference',
      'details', 'variants', 'relatedRecordIds', 'audio',
    ])
      if (data.containsKey(key)) key: data[key],
    'permissions': {
      ...permissions,
      for (final key in knowledgePermissionLabels.keys)
        key: permissions[key] == true,
    },
  };
}

class KnowledgePage {
  KnowledgePage.fromMap(Map<String, dynamic> data)
    : records = knowledgeRows(data['records']),
      catalog = knowledgeRows(data['catalog']),
      canReview = data['canReview'] == true,
      nextCursor = data['nextCursor'] as String?;

  final List<Map<String, dynamic>> records;
  final List<Map<String, dynamic>> catalog;
  final bool canReview;
  final String? nextCursor;
}
