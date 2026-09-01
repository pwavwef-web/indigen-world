// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $ContributionRecordsTable extends ContributionRecords
    with TableInfo<$ContributionRecordsTable, ContributionRecord> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ContributionRecordsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sourceTextMeta = const VerificationMeta(
    'sourceText',
  );
  @override
  late final GeneratedColumn<String> sourceText = GeneratedColumn<String>(
    'source_text',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _targetTextMeta = const VerificationMeta(
    'targetText',
  );
  @override
  late final GeneratedColumn<String> targetText = GeneratedColumn<String>(
    'target_text',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dialectMeta = const VerificationMeta(
    'dialect',
  );
  @override
  late final GeneratedColumn<String> dialect = GeneratedColumn<String>(
    'dialect',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _knowledgeBasisMeta = const VerificationMeta(
    'knowledgeBasis',
  );
  @override
  late final GeneratedColumn<String> knowledgeBasis = GeneratedColumn<String>(
    'knowledge_basis',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _partOfSpeechMeta = const VerificationMeta(
    'partOfSpeech',
  );
  @override
  late final GeneratedColumn<String> partOfSpeech = GeneratedColumn<String>(
    'part_of_speech',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
    'notes',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _relatedEntryIdMeta = const VerificationMeta(
    'relatedEntryId',
  );
  @override
  late final GeneratedColumn<String> relatedEntryId = GeneratedColumn<String>(
    'related_entry_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _rightsConfirmedMeta = const VerificationMeta(
    'rightsConfirmed',
  );
  @override
  late final GeneratedColumn<bool> rightsConfirmed = GeneratedColumn<bool>(
    'rights_confirmed',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("rights_confirmed" IN (0, 1))',
    ),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    sourceText,
    targetText,
    dialect,
    knowledgeBasis,
    createdAt,
    status,
    partOfSpeech,
    notes,
    relatedEntryId,
    rightsConfirmed,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'contribution_records';
  @override
  VerificationContext validateIntegrity(
    Insertable<ContributionRecord> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('source_text')) {
      context.handle(
        _sourceTextMeta,
        sourceText.isAcceptableOrUnknown(data['source_text']!, _sourceTextMeta),
      );
    } else if (isInserting) {
      context.missing(_sourceTextMeta);
    }
    if (data.containsKey('target_text')) {
      context.handle(
        _targetTextMeta,
        targetText.isAcceptableOrUnknown(data['target_text']!, _targetTextMeta),
      );
    } else if (isInserting) {
      context.missing(_targetTextMeta);
    }
    if (data.containsKey('dialect')) {
      context.handle(
        _dialectMeta,
        dialect.isAcceptableOrUnknown(data['dialect']!, _dialectMeta),
      );
    } else if (isInserting) {
      context.missing(_dialectMeta);
    }
    if (data.containsKey('knowledge_basis')) {
      context.handle(
        _knowledgeBasisMeta,
        knowledgeBasis.isAcceptableOrUnknown(
          data['knowledge_basis']!,
          _knowledgeBasisMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_knowledgeBasisMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('part_of_speech')) {
      context.handle(
        _partOfSpeechMeta,
        partOfSpeech.isAcceptableOrUnknown(
          data['part_of_speech']!,
          _partOfSpeechMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_partOfSpeechMeta);
    }
    if (data.containsKey('notes')) {
      context.handle(
        _notesMeta,
        notes.isAcceptableOrUnknown(data['notes']!, _notesMeta),
      );
    } else if (isInserting) {
      context.missing(_notesMeta);
    }
    if (data.containsKey('related_entry_id')) {
      context.handle(
        _relatedEntryIdMeta,
        relatedEntryId.isAcceptableOrUnknown(
          data['related_entry_id']!,
          _relatedEntryIdMeta,
        ),
      );
    }
    if (data.containsKey('rights_confirmed')) {
      context.handle(
        _rightsConfirmedMeta,
        rightsConfirmed.isAcceptableOrUnknown(
          data['rights_confirmed']!,
          _rightsConfirmedMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_rightsConfirmedMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ContributionRecord map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ContributionRecord(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      sourceText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}source_text'],
      )!,
      targetText: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}target_text'],
      )!,
      dialect: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}dialect'],
      )!,
      knowledgeBasis: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}knowledge_basis'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      partOfSpeech: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}part_of_speech'],
      )!,
      notes: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}notes'],
      )!,
      relatedEntryId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}related_entry_id'],
      ),
      rightsConfirmed: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}rights_confirmed'],
      )!,
    );
  }

  @override
  $ContributionRecordsTable createAlias(String alias) {
    return $ContributionRecordsTable(attachedDatabase, alias);
  }
}

class ContributionRecord extends DataClass
    implements Insertable<ContributionRecord> {
  final String id;
  final String sourceText;
  final String targetText;
  final String dialect;
  final String knowledgeBasis;
  final DateTime createdAt;
  final String status;
  final String partOfSpeech;
  final String notes;
  final String? relatedEntryId;
  final bool rightsConfirmed;
  const ContributionRecord({
    required this.id,
    required this.sourceText,
    required this.targetText,
    required this.dialect,
    required this.knowledgeBasis,
    required this.createdAt,
    required this.status,
    required this.partOfSpeech,
    required this.notes,
    this.relatedEntryId,
    required this.rightsConfirmed,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['source_text'] = Variable<String>(sourceText);
    map['target_text'] = Variable<String>(targetText);
    map['dialect'] = Variable<String>(dialect);
    map['knowledge_basis'] = Variable<String>(knowledgeBasis);
    map['created_at'] = Variable<DateTime>(createdAt);
    map['status'] = Variable<String>(status);
    map['part_of_speech'] = Variable<String>(partOfSpeech);
    map['notes'] = Variable<String>(notes);
    if (!nullToAbsent || relatedEntryId != null) {
      map['related_entry_id'] = Variable<String>(relatedEntryId);
    }
    map['rights_confirmed'] = Variable<bool>(rightsConfirmed);
    return map;
  }

  ContributionRecordsCompanion toCompanion(bool nullToAbsent) {
    return ContributionRecordsCompanion(
      id: Value(id),
      sourceText: Value(sourceText),
      targetText: Value(targetText),
      dialect: Value(dialect),
      knowledgeBasis: Value(knowledgeBasis),
      createdAt: Value(createdAt),
      status: Value(status),
      partOfSpeech: Value(partOfSpeech),
      notes: Value(notes),
      relatedEntryId: relatedEntryId == null && nullToAbsent
          ? const Value.absent()
          : Value(relatedEntryId),
      rightsConfirmed: Value(rightsConfirmed),
    );
  }

  factory ContributionRecord.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ContributionRecord(
      id: serializer.fromJson<String>(json['id']),
      sourceText: serializer.fromJson<String>(json['sourceText']),
      targetText: serializer.fromJson<String>(json['targetText']),
      dialect: serializer.fromJson<String>(json['dialect']),
      knowledgeBasis: serializer.fromJson<String>(json['knowledgeBasis']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      status: serializer.fromJson<String>(json['status']),
      partOfSpeech: serializer.fromJson<String>(json['partOfSpeech']),
      notes: serializer.fromJson<String>(json['notes']),
      relatedEntryId: serializer.fromJson<String?>(json['relatedEntryId']),
      rightsConfirmed: serializer.fromJson<bool>(json['rightsConfirmed']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'sourceText': serializer.toJson<String>(sourceText),
      'targetText': serializer.toJson<String>(targetText),
      'dialect': serializer.toJson<String>(dialect),
      'knowledgeBasis': serializer.toJson<String>(knowledgeBasis),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'status': serializer.toJson<String>(status),
      'partOfSpeech': serializer.toJson<String>(partOfSpeech),
      'notes': serializer.toJson<String>(notes),
      'relatedEntryId': serializer.toJson<String?>(relatedEntryId),
      'rightsConfirmed': serializer.toJson<bool>(rightsConfirmed),
    };
  }

  ContributionRecord copyWith({
    String? id,
    String? sourceText,
    String? targetText,
    String? dialect,
    String? knowledgeBasis,
    DateTime? createdAt,
    String? status,
    String? partOfSpeech,
    String? notes,
    Value<String?> relatedEntryId = const Value.absent(),
    bool? rightsConfirmed,
  }) => ContributionRecord(
    id: id ?? this.id,
    sourceText: sourceText ?? this.sourceText,
    targetText: targetText ?? this.targetText,
    dialect: dialect ?? this.dialect,
    knowledgeBasis: knowledgeBasis ?? this.knowledgeBasis,
    createdAt: createdAt ?? this.createdAt,
    status: status ?? this.status,
    partOfSpeech: partOfSpeech ?? this.partOfSpeech,
    notes: notes ?? this.notes,
    relatedEntryId: relatedEntryId.present
        ? relatedEntryId.value
        : this.relatedEntryId,
    rightsConfirmed: rightsConfirmed ?? this.rightsConfirmed,
  );
  ContributionRecord copyWithCompanion(ContributionRecordsCompanion data) {
    return ContributionRecord(
      id: data.id.present ? data.id.value : this.id,
      sourceText: data.sourceText.present
          ? data.sourceText.value
          : this.sourceText,
      targetText: data.targetText.present
          ? data.targetText.value
          : this.targetText,
      dialect: data.dialect.present ? data.dialect.value : this.dialect,
      knowledgeBasis: data.knowledgeBasis.present
          ? data.knowledgeBasis.value
          : this.knowledgeBasis,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      status: data.status.present ? data.status.value : this.status,
      partOfSpeech: data.partOfSpeech.present
          ? data.partOfSpeech.value
          : this.partOfSpeech,
      notes: data.notes.present ? data.notes.value : this.notes,
      relatedEntryId: data.relatedEntryId.present
          ? data.relatedEntryId.value
          : this.relatedEntryId,
      rightsConfirmed: data.rightsConfirmed.present
          ? data.rightsConfirmed.value
          : this.rightsConfirmed,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ContributionRecord(')
          ..write('id: $id, ')
          ..write('sourceText: $sourceText, ')
          ..write('targetText: $targetText, ')
          ..write('dialect: $dialect, ')
          ..write('knowledgeBasis: $knowledgeBasis, ')
          ..write('createdAt: $createdAt, ')
          ..write('status: $status, ')
          ..write('partOfSpeech: $partOfSpeech, ')
          ..write('notes: $notes, ')
          ..write('relatedEntryId: $relatedEntryId, ')
          ..write('rightsConfirmed: $rightsConfirmed')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    sourceText,
    targetText,
    dialect,
    knowledgeBasis,
    createdAt,
    status,
    partOfSpeech,
    notes,
    relatedEntryId,
    rightsConfirmed,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ContributionRecord &&
          other.id == this.id &&
          other.sourceText == this.sourceText &&
          other.targetText == this.targetText &&
          other.dialect == this.dialect &&
          other.knowledgeBasis == this.knowledgeBasis &&
          other.createdAt == this.createdAt &&
          other.status == this.status &&
          other.partOfSpeech == this.partOfSpeech &&
          other.notes == this.notes &&
          other.relatedEntryId == this.relatedEntryId &&
          other.rightsConfirmed == this.rightsConfirmed);
}

class ContributionRecordsCompanion extends UpdateCompanion<ContributionRecord> {
  final Value<String> id;
  final Value<String> sourceText;
  final Value<String> targetText;
  final Value<String> dialect;
  final Value<String> knowledgeBasis;
  final Value<DateTime> createdAt;
  final Value<String> status;
  final Value<String> partOfSpeech;
  final Value<String> notes;
  final Value<String?> relatedEntryId;
  final Value<bool> rightsConfirmed;
  final Value<int> rowid;
  const ContributionRecordsCompanion({
    this.id = const Value.absent(),
    this.sourceText = const Value.absent(),
    this.targetText = const Value.absent(),
    this.dialect = const Value.absent(),
    this.knowledgeBasis = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.status = const Value.absent(),
    this.partOfSpeech = const Value.absent(),
    this.notes = const Value.absent(),
    this.relatedEntryId = const Value.absent(),
    this.rightsConfirmed = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ContributionRecordsCompanion.insert({
    required String id,
    required String sourceText,
    required String targetText,
    required String dialect,
    required String knowledgeBasis,
    required DateTime createdAt,
    required String status,
    required String partOfSpeech,
    required String notes,
    this.relatedEntryId = const Value.absent(),
    required bool rightsConfirmed,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       sourceText = Value(sourceText),
       targetText = Value(targetText),
       dialect = Value(dialect),
       knowledgeBasis = Value(knowledgeBasis),
       createdAt = Value(createdAt),
       status = Value(status),
       partOfSpeech = Value(partOfSpeech),
       notes = Value(notes),
       rightsConfirmed = Value(rightsConfirmed);
  static Insertable<ContributionRecord> custom({
    Expression<String>? id,
    Expression<String>? sourceText,
    Expression<String>? targetText,
    Expression<String>? dialect,
    Expression<String>? knowledgeBasis,
    Expression<DateTime>? createdAt,
    Expression<String>? status,
    Expression<String>? partOfSpeech,
    Expression<String>? notes,
    Expression<String>? relatedEntryId,
    Expression<bool>? rightsConfirmed,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (sourceText != null) 'source_text': sourceText,
      if (targetText != null) 'target_text': targetText,
      if (dialect != null) 'dialect': dialect,
      if (knowledgeBasis != null) 'knowledge_basis': knowledgeBasis,
      if (createdAt != null) 'created_at': createdAt,
      if (status != null) 'status': status,
      if (partOfSpeech != null) 'part_of_speech': partOfSpeech,
      if (notes != null) 'notes': notes,
      if (relatedEntryId != null) 'related_entry_id': relatedEntryId,
      if (rightsConfirmed != null) 'rights_confirmed': rightsConfirmed,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ContributionRecordsCompanion copyWith({
    Value<String>? id,
    Value<String>? sourceText,
    Value<String>? targetText,
    Value<String>? dialect,
    Value<String>? knowledgeBasis,
    Value<DateTime>? createdAt,
    Value<String>? status,
    Value<String>? partOfSpeech,
    Value<String>? notes,
    Value<String?>? relatedEntryId,
    Value<bool>? rightsConfirmed,
    Value<int>? rowid,
  }) {
    return ContributionRecordsCompanion(
      id: id ?? this.id,
      sourceText: sourceText ?? this.sourceText,
      targetText: targetText ?? this.targetText,
      dialect: dialect ?? this.dialect,
      knowledgeBasis: knowledgeBasis ?? this.knowledgeBasis,
      createdAt: createdAt ?? this.createdAt,
      status: status ?? this.status,
      partOfSpeech: partOfSpeech ?? this.partOfSpeech,
      notes: notes ?? this.notes,
      relatedEntryId: relatedEntryId ?? this.relatedEntryId,
      rightsConfirmed: rightsConfirmed ?? this.rightsConfirmed,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (sourceText.present) {
      map['source_text'] = Variable<String>(sourceText.value);
    }
    if (targetText.present) {
      map['target_text'] = Variable<String>(targetText.value);
    }
    if (dialect.present) {
      map['dialect'] = Variable<String>(dialect.value);
    }
    if (knowledgeBasis.present) {
      map['knowledge_basis'] = Variable<String>(knowledgeBasis.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (partOfSpeech.present) {
      map['part_of_speech'] = Variable<String>(partOfSpeech.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (relatedEntryId.present) {
      map['related_entry_id'] = Variable<String>(relatedEntryId.value);
    }
    if (rightsConfirmed.present) {
      map['rights_confirmed'] = Variable<bool>(rightsConfirmed.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ContributionRecordsCompanion(')
          ..write('id: $id, ')
          ..write('sourceText: $sourceText, ')
          ..write('targetText: $targetText, ')
          ..write('dialect: $dialect, ')
          ..write('knowledgeBasis: $knowledgeBasis, ')
          ..write('createdAt: $createdAt, ')
          ..write('status: $status, ')
          ..write('partOfSpeech: $partOfSpeech, ')
          ..write('notes: $notes, ')
          ..write('relatedEntryId: $relatedEntryId, ')
          ..write('rightsConfirmed: $rightsConfirmed, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SavedEntryRecordsTable extends SavedEntryRecords
    with TableInfo<$SavedEntryRecordsTable, SavedEntryRecord> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SavedEntryRecordsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _entryIdMeta = const VerificationMeta(
    'entryId',
  );
  @override
  late final GeneratedColumn<String> entryId = GeneratedColumn<String>(
    'entry_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [entryId];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'saved_entry_records';
  @override
  VerificationContext validateIntegrity(
    Insertable<SavedEntryRecord> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('entry_id')) {
      context.handle(
        _entryIdMeta,
        entryId.isAcceptableOrUnknown(data['entry_id']!, _entryIdMeta),
      );
    } else if (isInserting) {
      context.missing(_entryIdMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {entryId};
  @override
  SavedEntryRecord map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SavedEntryRecord(
      entryId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}entry_id'],
      )!,
    );
  }

  @override
  $SavedEntryRecordsTable createAlias(String alias) {
    return $SavedEntryRecordsTable(attachedDatabase, alias);
  }
}

class SavedEntryRecord extends DataClass
    implements Insertable<SavedEntryRecord> {
  final String entryId;
  const SavedEntryRecord({required this.entryId});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['entry_id'] = Variable<String>(entryId);
    return map;
  }

  SavedEntryRecordsCompanion toCompanion(bool nullToAbsent) {
    return SavedEntryRecordsCompanion(entryId: Value(entryId));
  }

  factory SavedEntryRecord.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SavedEntryRecord(
      entryId: serializer.fromJson<String>(json['entryId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{'entryId': serializer.toJson<String>(entryId)};
  }

  SavedEntryRecord copyWith({String? entryId}) =>
      SavedEntryRecord(entryId: entryId ?? this.entryId);
  SavedEntryRecord copyWithCompanion(SavedEntryRecordsCompanion data) {
    return SavedEntryRecord(
      entryId: data.entryId.present ? data.entryId.value : this.entryId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SavedEntryRecord(')
          ..write('entryId: $entryId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => entryId.hashCode;
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SavedEntryRecord && other.entryId == this.entryId);
}

class SavedEntryRecordsCompanion extends UpdateCompanion<SavedEntryRecord> {
  final Value<String> entryId;
  final Value<int> rowid;
  const SavedEntryRecordsCompanion({
    this.entryId = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SavedEntryRecordsCompanion.insert({
    required String entryId,
    this.rowid = const Value.absent(),
  }) : entryId = Value(entryId);
  static Insertable<SavedEntryRecord> custom({
    Expression<String>? entryId,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (entryId != null) 'entry_id': entryId,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SavedEntryRecordsCompanion copyWith({
    Value<String>? entryId,
    Value<int>? rowid,
  }) {
    return SavedEntryRecordsCompanion(
      entryId: entryId ?? this.entryId,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (entryId.present) {
      map['entry_id'] = Variable<String>(entryId.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SavedEntryRecordsCompanion(')
          ..write('entryId: $entryId, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $DownloadedTrackRecordsTable extends DownloadedTrackRecords
    with TableInfo<$DownloadedTrackRecordsTable, DownloadedTrackRecord> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $DownloadedTrackRecordsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _trackIdMeta = const VerificationMeta(
    'trackId',
  );
  @override
  late final GeneratedColumn<String> trackId = GeneratedColumn<String>(
    'track_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _artistMeta = const VerificationMeta('artist');
  @override
  late final GeneratedColumn<String> artist = GeneratedColumn<String>(
    'artist',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _albumMeta = const VerificationMeta('album');
  @override
  late final GeneratedColumn<String> album = GeneratedColumn<String>(
    'album',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _artworkUrlMeta = const VerificationMeta(
    'artworkUrl',
  );
  @override
  late final GeneratedColumn<String> artworkUrl = GeneratedColumn<String>(
    'artwork_url',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sourceUrlMeta = const VerificationMeta(
    'sourceUrl',
  );
  @override
  late final GeneratedColumn<String> sourceUrl = GeneratedColumn<String>(
    'source_url',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fileNameMeta = const VerificationMeta(
    'fileName',
  );
  @override
  late final GeneratedColumn<String> fileName = GeneratedColumn<String>(
    'file_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sizeBytesMeta = const VerificationMeta(
    'sizeBytes',
  );
  @override
  late final GeneratedColumn<int> sizeBytes = GeneratedColumn<int>(
    'size_bytes',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _downloadedAtMeta = const VerificationMeta(
    'downloadedAt',
  );
  @override
  late final GeneratedColumn<DateTime> downloadedAt = GeneratedColumn<DateTime>(
    'downloaded_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    trackId,
    title,
    artist,
    album,
    artworkUrl,
    kind,
    sourceUrl,
    fileName,
    sizeBytes,
    downloadedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'downloaded_track_records';
  @override
  VerificationContext validateIntegrity(
    Insertable<DownloadedTrackRecord> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('track_id')) {
      context.handle(
        _trackIdMeta,
        trackId.isAcceptableOrUnknown(data['track_id']!, _trackIdMeta),
      );
    } else if (isInserting) {
      context.missing(_trackIdMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('artist')) {
      context.handle(
        _artistMeta,
        artist.isAcceptableOrUnknown(data['artist']!, _artistMeta),
      );
    }
    if (data.containsKey('album')) {
      context.handle(
        _albumMeta,
        album.isAcceptableOrUnknown(data['album']!, _albumMeta),
      );
    } else if (isInserting) {
      context.missing(_albumMeta);
    }
    if (data.containsKey('artwork_url')) {
      context.handle(
        _artworkUrlMeta,
        artworkUrl.isAcceptableOrUnknown(data['artwork_url']!, _artworkUrlMeta),
      );
    }
    if (data.containsKey('kind')) {
      context.handle(
        _kindMeta,
        kind.isAcceptableOrUnknown(data['kind']!, _kindMeta),
      );
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('source_url')) {
      context.handle(
        _sourceUrlMeta,
        sourceUrl.isAcceptableOrUnknown(data['source_url']!, _sourceUrlMeta),
      );
    } else if (isInserting) {
      context.missing(_sourceUrlMeta);
    }
    if (data.containsKey('file_name')) {
      context.handle(
        _fileNameMeta,
        fileName.isAcceptableOrUnknown(data['file_name']!, _fileNameMeta),
      );
    } else if (isInserting) {
      context.missing(_fileNameMeta);
    }
    if (data.containsKey('size_bytes')) {
      context.handle(
        _sizeBytesMeta,
        sizeBytes.isAcceptableOrUnknown(data['size_bytes']!, _sizeBytesMeta),
      );
    } else if (isInserting) {
      context.missing(_sizeBytesMeta);
    }
    if (data.containsKey('downloaded_at')) {
      context.handle(
        _downloadedAtMeta,
        downloadedAt.isAcceptableOrUnknown(
          data['downloaded_at']!,
          _downloadedAtMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_downloadedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {trackId};
  @override
  DownloadedTrackRecord map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return DownloadedTrackRecord(
      trackId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}track_id'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      artist: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}artist'],
      ),
      album: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}album'],
      )!,
      artworkUrl: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}artwork_url'],
      ),
      kind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}kind'],
      )!,
      sourceUrl: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}source_url'],
      )!,
      fileName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}file_name'],
      )!,
      sizeBytes: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}size_bytes'],
      )!,
      downloadedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}downloaded_at'],
      )!,
    );
  }

  @override
  $DownloadedTrackRecordsTable createAlias(String alias) {
    return $DownloadedTrackRecordsTable(attachedDatabase, alias);
  }
}

class DownloadedTrackRecord extends DataClass
    implements Insertable<DownloadedTrackRecord> {
  /// The published record id — the same id the collection stream is keyed by.
  final String trackId;
  final String title;
  final String? artist;
  final String album;
  final String? artworkUrl;

  /// Which collection it was saved from, so Downloads can group them.
  final String kind;

  /// The remote file this came from. Kept so a re-download after a failure
  /// does not need the collection stream to be loaded again.
  final String sourceUrl;

  /// Absolute path on this device. Rebuilt against the current documents
  /// directory on read, because iOS and Android both move that directory
  /// between installs and an absolute path stored today can be wrong tomorrow.
  final String fileName;
  final int sizeBytes;
  final DateTime downloadedAt;
  const DownloadedTrackRecord({
    required this.trackId,
    required this.title,
    this.artist,
    required this.album,
    this.artworkUrl,
    required this.kind,
    required this.sourceUrl,
    required this.fileName,
    required this.sizeBytes,
    required this.downloadedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['track_id'] = Variable<String>(trackId);
    map['title'] = Variable<String>(title);
    if (!nullToAbsent || artist != null) {
      map['artist'] = Variable<String>(artist);
    }
    map['album'] = Variable<String>(album);
    if (!nullToAbsent || artworkUrl != null) {
      map['artwork_url'] = Variable<String>(artworkUrl);
    }
    map['kind'] = Variable<String>(kind);
    map['source_url'] = Variable<String>(sourceUrl);
    map['file_name'] = Variable<String>(fileName);
    map['size_bytes'] = Variable<int>(sizeBytes);
    map['downloaded_at'] = Variable<DateTime>(downloadedAt);
    return map;
  }

  DownloadedTrackRecordsCompanion toCompanion(bool nullToAbsent) {
    return DownloadedTrackRecordsCompanion(
      trackId: Value(trackId),
      title: Value(title),
      artist: artist == null && nullToAbsent
          ? const Value.absent()
          : Value(artist),
      album: Value(album),
      artworkUrl: artworkUrl == null && nullToAbsent
          ? const Value.absent()
          : Value(artworkUrl),
      kind: Value(kind),
      sourceUrl: Value(sourceUrl),
      fileName: Value(fileName),
      sizeBytes: Value(sizeBytes),
      downloadedAt: Value(downloadedAt),
    );
  }

  factory DownloadedTrackRecord.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return DownloadedTrackRecord(
      trackId: serializer.fromJson<String>(json['trackId']),
      title: serializer.fromJson<String>(json['title']),
      artist: serializer.fromJson<String?>(json['artist']),
      album: serializer.fromJson<String>(json['album']),
      artworkUrl: serializer.fromJson<String?>(json['artworkUrl']),
      kind: serializer.fromJson<String>(json['kind']),
      sourceUrl: serializer.fromJson<String>(json['sourceUrl']),
      fileName: serializer.fromJson<String>(json['fileName']),
      sizeBytes: serializer.fromJson<int>(json['sizeBytes']),
      downloadedAt: serializer.fromJson<DateTime>(json['downloadedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'trackId': serializer.toJson<String>(trackId),
      'title': serializer.toJson<String>(title),
      'artist': serializer.toJson<String?>(artist),
      'album': serializer.toJson<String>(album),
      'artworkUrl': serializer.toJson<String?>(artworkUrl),
      'kind': serializer.toJson<String>(kind),
      'sourceUrl': serializer.toJson<String>(sourceUrl),
      'fileName': serializer.toJson<String>(fileName),
      'sizeBytes': serializer.toJson<int>(sizeBytes),
      'downloadedAt': serializer.toJson<DateTime>(downloadedAt),
    };
  }

  DownloadedTrackRecord copyWith({
    String? trackId,
    String? title,
    Value<String?> artist = const Value.absent(),
    String? album,
    Value<String?> artworkUrl = const Value.absent(),
    String? kind,
    String? sourceUrl,
    String? fileName,
    int? sizeBytes,
    DateTime? downloadedAt,
  }) => DownloadedTrackRecord(
    trackId: trackId ?? this.trackId,
    title: title ?? this.title,
    artist: artist.present ? artist.value : this.artist,
    album: album ?? this.album,
    artworkUrl: artworkUrl.present ? artworkUrl.value : this.artworkUrl,
    kind: kind ?? this.kind,
    sourceUrl: sourceUrl ?? this.sourceUrl,
    fileName: fileName ?? this.fileName,
    sizeBytes: sizeBytes ?? this.sizeBytes,
    downloadedAt: downloadedAt ?? this.downloadedAt,
  );
  DownloadedTrackRecord copyWithCompanion(
    DownloadedTrackRecordsCompanion data,
  ) {
    return DownloadedTrackRecord(
      trackId: data.trackId.present ? data.trackId.value : this.trackId,
      title: data.title.present ? data.title.value : this.title,
      artist: data.artist.present ? data.artist.value : this.artist,
      album: data.album.present ? data.album.value : this.album,
      artworkUrl: data.artworkUrl.present
          ? data.artworkUrl.value
          : this.artworkUrl,
      kind: data.kind.present ? data.kind.value : this.kind,
      sourceUrl: data.sourceUrl.present ? data.sourceUrl.value : this.sourceUrl,
      fileName: data.fileName.present ? data.fileName.value : this.fileName,
      sizeBytes: data.sizeBytes.present ? data.sizeBytes.value : this.sizeBytes,
      downloadedAt: data.downloadedAt.present
          ? data.downloadedAt.value
          : this.downloadedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('DownloadedTrackRecord(')
          ..write('trackId: $trackId, ')
          ..write('title: $title, ')
          ..write('artist: $artist, ')
          ..write('album: $album, ')
          ..write('artworkUrl: $artworkUrl, ')
          ..write('kind: $kind, ')
          ..write('sourceUrl: $sourceUrl, ')
          ..write('fileName: $fileName, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('downloadedAt: $downloadedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    trackId,
    title,
    artist,
    album,
    artworkUrl,
    kind,
    sourceUrl,
    fileName,
    sizeBytes,
    downloadedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is DownloadedTrackRecord &&
          other.trackId == this.trackId &&
          other.title == this.title &&
          other.artist == this.artist &&
          other.album == this.album &&
          other.artworkUrl == this.artworkUrl &&
          other.kind == this.kind &&
          other.sourceUrl == this.sourceUrl &&
          other.fileName == this.fileName &&
          other.sizeBytes == this.sizeBytes &&
          other.downloadedAt == this.downloadedAt);
}

class DownloadedTrackRecordsCompanion
    extends UpdateCompanion<DownloadedTrackRecord> {
  final Value<String> trackId;
  final Value<String> title;
  final Value<String?> artist;
  final Value<String> album;
  final Value<String?> artworkUrl;
  final Value<String> kind;
  final Value<String> sourceUrl;
  final Value<String> fileName;
  final Value<int> sizeBytes;
  final Value<DateTime> downloadedAt;
  final Value<int> rowid;
  const DownloadedTrackRecordsCompanion({
    this.trackId = const Value.absent(),
    this.title = const Value.absent(),
    this.artist = const Value.absent(),
    this.album = const Value.absent(),
    this.artworkUrl = const Value.absent(),
    this.kind = const Value.absent(),
    this.sourceUrl = const Value.absent(),
    this.fileName = const Value.absent(),
    this.sizeBytes = const Value.absent(),
    this.downloadedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  DownloadedTrackRecordsCompanion.insert({
    required String trackId,
    required String title,
    this.artist = const Value.absent(),
    required String album,
    this.artworkUrl = const Value.absent(),
    required String kind,
    required String sourceUrl,
    required String fileName,
    required int sizeBytes,
    required DateTime downloadedAt,
    this.rowid = const Value.absent(),
  }) : trackId = Value(trackId),
       title = Value(title),
       album = Value(album),
       kind = Value(kind),
       sourceUrl = Value(sourceUrl),
       fileName = Value(fileName),
       sizeBytes = Value(sizeBytes),
       downloadedAt = Value(downloadedAt);
  static Insertable<DownloadedTrackRecord> custom({
    Expression<String>? trackId,
    Expression<String>? title,
    Expression<String>? artist,
    Expression<String>? album,
    Expression<String>? artworkUrl,
    Expression<String>? kind,
    Expression<String>? sourceUrl,
    Expression<String>? fileName,
    Expression<int>? sizeBytes,
    Expression<DateTime>? downloadedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (trackId != null) 'track_id': trackId,
      if (title != null) 'title': title,
      if (artist != null) 'artist': artist,
      if (album != null) 'album': album,
      if (artworkUrl != null) 'artwork_url': artworkUrl,
      if (kind != null) 'kind': kind,
      if (sourceUrl != null) 'source_url': sourceUrl,
      if (fileName != null) 'file_name': fileName,
      if (sizeBytes != null) 'size_bytes': sizeBytes,
      if (downloadedAt != null) 'downloaded_at': downloadedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  DownloadedTrackRecordsCompanion copyWith({
    Value<String>? trackId,
    Value<String>? title,
    Value<String?>? artist,
    Value<String>? album,
    Value<String?>? artworkUrl,
    Value<String>? kind,
    Value<String>? sourceUrl,
    Value<String>? fileName,
    Value<int>? sizeBytes,
    Value<DateTime>? downloadedAt,
    Value<int>? rowid,
  }) {
    return DownloadedTrackRecordsCompanion(
      trackId: trackId ?? this.trackId,
      title: title ?? this.title,
      artist: artist ?? this.artist,
      album: album ?? this.album,
      artworkUrl: artworkUrl ?? this.artworkUrl,
      kind: kind ?? this.kind,
      sourceUrl: sourceUrl ?? this.sourceUrl,
      fileName: fileName ?? this.fileName,
      sizeBytes: sizeBytes ?? this.sizeBytes,
      downloadedAt: downloadedAt ?? this.downloadedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (trackId.present) {
      map['track_id'] = Variable<String>(trackId.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (artist.present) {
      map['artist'] = Variable<String>(artist.value);
    }
    if (album.present) {
      map['album'] = Variable<String>(album.value);
    }
    if (artworkUrl.present) {
      map['artwork_url'] = Variable<String>(artworkUrl.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (sourceUrl.present) {
      map['source_url'] = Variable<String>(sourceUrl.value);
    }
    if (fileName.present) {
      map['file_name'] = Variable<String>(fileName.value);
    }
    if (sizeBytes.present) {
      map['size_bytes'] = Variable<int>(sizeBytes.value);
    }
    if (downloadedAt.present) {
      map['downloaded_at'] = Variable<DateTime>(downloadedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('DownloadedTrackRecordsCompanion(')
          ..write('trackId: $trackId, ')
          ..write('title: $title, ')
          ..write('artist: $artist, ')
          ..write('album: $album, ')
          ..write('artworkUrl: $artworkUrl, ')
          ..write('kind: $kind, ')
          ..write('sourceUrl: $sourceUrl, ')
          ..write('fileName: $fileName, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('downloadedAt: $downloadedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $ContributionRecordsTable contributionRecords =
      $ContributionRecordsTable(this);
  late final $SavedEntryRecordsTable savedEntryRecords =
      $SavedEntryRecordsTable(this);
  late final $DownloadedTrackRecordsTable downloadedTrackRecords =
      $DownloadedTrackRecordsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    contributionRecords,
    savedEntryRecords,
    downloadedTrackRecords,
  ];
}

typedef $$ContributionRecordsTableCreateCompanionBuilder =
    ContributionRecordsCompanion Function({
      required String id,
      required String sourceText,
      required String targetText,
      required String dialect,
      required String knowledgeBasis,
      required DateTime createdAt,
      required String status,
      required String partOfSpeech,
      required String notes,
      Value<String?> relatedEntryId,
      required bool rightsConfirmed,
      Value<int> rowid,
    });
typedef $$ContributionRecordsTableUpdateCompanionBuilder =
    ContributionRecordsCompanion Function({
      Value<String> id,
      Value<String> sourceText,
      Value<String> targetText,
      Value<String> dialect,
      Value<String> knowledgeBasis,
      Value<DateTime> createdAt,
      Value<String> status,
      Value<String> partOfSpeech,
      Value<String> notes,
      Value<String?> relatedEntryId,
      Value<bool> rightsConfirmed,
      Value<int> rowid,
    });

class $$ContributionRecordsTableFilterComposer
    extends Composer<_$AppDatabase, $ContributionRecordsTable> {
  $$ContributionRecordsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sourceText => $composableBuilder(
    column: $table.sourceText,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get targetText => $composableBuilder(
    column: $table.targetText,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get dialect => $composableBuilder(
    column: $table.dialect,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get knowledgeBasis => $composableBuilder(
    column: $table.knowledgeBasis,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get partOfSpeech => $composableBuilder(
    column: $table.partOfSpeech,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get relatedEntryId => $composableBuilder(
    column: $table.relatedEntryId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get rightsConfirmed => $composableBuilder(
    column: $table.rightsConfirmed,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ContributionRecordsTableOrderingComposer
    extends Composer<_$AppDatabase, $ContributionRecordsTable> {
  $$ContributionRecordsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sourceText => $composableBuilder(
    column: $table.sourceText,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get targetText => $composableBuilder(
    column: $table.targetText,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get dialect => $composableBuilder(
    column: $table.dialect,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get knowledgeBasis => $composableBuilder(
    column: $table.knowledgeBasis,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get partOfSpeech => $composableBuilder(
    column: $table.partOfSpeech,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get relatedEntryId => $composableBuilder(
    column: $table.relatedEntryId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get rightsConfirmed => $composableBuilder(
    column: $table.rightsConfirmed,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ContributionRecordsTableAnnotationComposer
    extends Composer<_$AppDatabase, $ContributionRecordsTable> {
  $$ContributionRecordsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get sourceText => $composableBuilder(
    column: $table.sourceText,
    builder: (column) => column,
  );

  GeneratedColumn<String> get targetText => $composableBuilder(
    column: $table.targetText,
    builder: (column) => column,
  );

  GeneratedColumn<String> get dialect =>
      $composableBuilder(column: $table.dialect, builder: (column) => column);

  GeneratedColumn<String> get knowledgeBasis => $composableBuilder(
    column: $table.knowledgeBasis,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get partOfSpeech => $composableBuilder(
    column: $table.partOfSpeech,
    builder: (column) => column,
  );

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<String> get relatedEntryId => $composableBuilder(
    column: $table.relatedEntryId,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get rightsConfirmed => $composableBuilder(
    column: $table.rightsConfirmed,
    builder: (column) => column,
  );
}

class $$ContributionRecordsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ContributionRecordsTable,
          ContributionRecord,
          $$ContributionRecordsTableFilterComposer,
          $$ContributionRecordsTableOrderingComposer,
          $$ContributionRecordsTableAnnotationComposer,
          $$ContributionRecordsTableCreateCompanionBuilder,
          $$ContributionRecordsTableUpdateCompanionBuilder,
          (
            ContributionRecord,
            BaseReferences<
              _$AppDatabase,
              $ContributionRecordsTable,
              ContributionRecord
            >,
          ),
          ContributionRecord,
          PrefetchHooks Function()
        > {
  $$ContributionRecordsTableTableManager(
    _$AppDatabase db,
    $ContributionRecordsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ContributionRecordsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ContributionRecordsTableOrderingComposer(
                $db: db,
                $table: table,
              ),
          createComputedFieldComposer: () =>
              $$ContributionRecordsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> sourceText = const Value.absent(),
                Value<String> targetText = const Value.absent(),
                Value<String> dialect = const Value.absent(),
                Value<String> knowledgeBasis = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String> partOfSpeech = const Value.absent(),
                Value<String> notes = const Value.absent(),
                Value<String?> relatedEntryId = const Value.absent(),
                Value<bool> rightsConfirmed = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ContributionRecordsCompanion(
                id: id,
                sourceText: sourceText,
                targetText: targetText,
                dialect: dialect,
                knowledgeBasis: knowledgeBasis,
                createdAt: createdAt,
                status: status,
                partOfSpeech: partOfSpeech,
                notes: notes,
                relatedEntryId: relatedEntryId,
                rightsConfirmed: rightsConfirmed,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String sourceText,
                required String targetText,
                required String dialect,
                required String knowledgeBasis,
                required DateTime createdAt,
                required String status,
                required String partOfSpeech,
                required String notes,
                Value<String?> relatedEntryId = const Value.absent(),
                required bool rightsConfirmed,
                Value<int> rowid = const Value.absent(),
              }) => ContributionRecordsCompanion.insert(
                id: id,
                sourceText: sourceText,
                targetText: targetText,
                dialect: dialect,
                knowledgeBasis: knowledgeBasis,
                createdAt: createdAt,
                status: status,
                partOfSpeech: partOfSpeech,
                notes: notes,
                relatedEntryId: relatedEntryId,
                rightsConfirmed: rightsConfirmed,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ContributionRecordsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ContributionRecordsTable,
      ContributionRecord,
      $$ContributionRecordsTableFilterComposer,
      $$ContributionRecordsTableOrderingComposer,
      $$ContributionRecordsTableAnnotationComposer,
      $$ContributionRecordsTableCreateCompanionBuilder,
      $$ContributionRecordsTableUpdateCompanionBuilder,
      (
        ContributionRecord,
        BaseReferences<
          _$AppDatabase,
          $ContributionRecordsTable,
          ContributionRecord
        >,
      ),
      ContributionRecord,
      PrefetchHooks Function()
    >;
typedef $$SavedEntryRecordsTableCreateCompanionBuilder =
    SavedEntryRecordsCompanion Function({
      required String entryId,
      Value<int> rowid,
    });
typedef $$SavedEntryRecordsTableUpdateCompanionBuilder =
    SavedEntryRecordsCompanion Function({
      Value<String> entryId,
      Value<int> rowid,
    });

class $$SavedEntryRecordsTableFilterComposer
    extends Composer<_$AppDatabase, $SavedEntryRecordsTable> {
  $$SavedEntryRecordsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get entryId => $composableBuilder(
    column: $table.entryId,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SavedEntryRecordsTableOrderingComposer
    extends Composer<_$AppDatabase, $SavedEntryRecordsTable> {
  $$SavedEntryRecordsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get entryId => $composableBuilder(
    column: $table.entryId,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SavedEntryRecordsTableAnnotationComposer
    extends Composer<_$AppDatabase, $SavedEntryRecordsTable> {
  $$SavedEntryRecordsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get entryId =>
      $composableBuilder(column: $table.entryId, builder: (column) => column);
}

class $$SavedEntryRecordsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SavedEntryRecordsTable,
          SavedEntryRecord,
          $$SavedEntryRecordsTableFilterComposer,
          $$SavedEntryRecordsTableOrderingComposer,
          $$SavedEntryRecordsTableAnnotationComposer,
          $$SavedEntryRecordsTableCreateCompanionBuilder,
          $$SavedEntryRecordsTableUpdateCompanionBuilder,
          (
            SavedEntryRecord,
            BaseReferences<
              _$AppDatabase,
              $SavedEntryRecordsTable,
              SavedEntryRecord
            >,
          ),
          SavedEntryRecord,
          PrefetchHooks Function()
        > {
  $$SavedEntryRecordsTableTableManager(
    _$AppDatabase db,
    $SavedEntryRecordsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SavedEntryRecordsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SavedEntryRecordsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SavedEntryRecordsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback: ({
            Value<String> entryId = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => SavedEntryRecordsCompanion(entryId: entryId, rowid: rowid),
          createCompanionCallback:
              ({
                required String entryId,
                Value<int> rowid = const Value.absent(),
              }) => SavedEntryRecordsCompanion.insert(
                entryId: entryId,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SavedEntryRecordsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SavedEntryRecordsTable,
      SavedEntryRecord,
      $$SavedEntryRecordsTableFilterComposer,
      $$SavedEntryRecordsTableOrderingComposer,
      $$SavedEntryRecordsTableAnnotationComposer,
      $$SavedEntryRecordsTableCreateCompanionBuilder,
      $$SavedEntryRecordsTableUpdateCompanionBuilder,
      (
        SavedEntryRecord,
        BaseReferences<
          _$AppDatabase,
          $SavedEntryRecordsTable,
          SavedEntryRecord
        >,
      ),
      SavedEntryRecord,
      PrefetchHooks Function()
    >;
typedef $$DownloadedTrackRecordsTableCreateCompanionBuilder =
    DownloadedTrackRecordsCompanion Function({
      required String trackId,
      required String title,
      Value<String?> artist,
      required String album,
      Value<String?> artworkUrl,
      required String kind,
      required String sourceUrl,
      required String fileName,
      required int sizeBytes,
      required DateTime downloadedAt,
      Value<int> rowid,
    });
typedef $$DownloadedTrackRecordsTableUpdateCompanionBuilder =
    DownloadedTrackRecordsCompanion Function({
      Value<String> trackId,
      Value<String> title,
      Value<String?> artist,
      Value<String> album,
      Value<String?> artworkUrl,
      Value<String> kind,
      Value<String> sourceUrl,
      Value<String> fileName,
      Value<int> sizeBytes,
      Value<DateTime> downloadedAt,
      Value<int> rowid,
    });

class $$DownloadedTrackRecordsTableFilterComposer
    extends Composer<_$AppDatabase, $DownloadedTrackRecordsTable> {
  $$DownloadedTrackRecordsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get trackId => $composableBuilder(
    column: $table.trackId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get artist => $composableBuilder(
    column: $table.artist,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get album => $composableBuilder(
    column: $table.album,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get artworkUrl => $composableBuilder(
    column: $table.artworkUrl,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sourceUrl => $composableBuilder(
    column: $table.sourceUrl,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get fileName => $composableBuilder(
    column: $table.fileName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sizeBytes => $composableBuilder(
    column: $table.sizeBytes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get downloadedAt => $composableBuilder(
    column: $table.downloadedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$DownloadedTrackRecordsTableOrderingComposer
    extends Composer<_$AppDatabase, $DownloadedTrackRecordsTable> {
  $$DownloadedTrackRecordsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get trackId => $composableBuilder(
    column: $table.trackId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get artist => $composableBuilder(
    column: $table.artist,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get album => $composableBuilder(
    column: $table.album,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get artworkUrl => $composableBuilder(
    column: $table.artworkUrl,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sourceUrl => $composableBuilder(
    column: $table.sourceUrl,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get fileName => $composableBuilder(
    column: $table.fileName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sizeBytes => $composableBuilder(
    column: $table.sizeBytes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get downloadedAt => $composableBuilder(
    column: $table.downloadedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$DownloadedTrackRecordsTableAnnotationComposer
    extends Composer<_$AppDatabase, $DownloadedTrackRecordsTable> {
  $$DownloadedTrackRecordsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get trackId =>
      $composableBuilder(column: $table.trackId, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get artist =>
      $composableBuilder(column: $table.artist, builder: (column) => column);

  GeneratedColumn<String> get album =>
      $composableBuilder(column: $table.album, builder: (column) => column);

  GeneratedColumn<String> get artworkUrl => $composableBuilder(
    column: $table.artworkUrl,
    builder: (column) => column,
  );

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get sourceUrl =>
      $composableBuilder(column: $table.sourceUrl, builder: (column) => column);

  GeneratedColumn<String> get fileName =>
      $composableBuilder(column: $table.fileName, builder: (column) => column);

  GeneratedColumn<int> get sizeBytes =>
      $composableBuilder(column: $table.sizeBytes, builder: (column) => column);

  GeneratedColumn<DateTime> get downloadedAt => $composableBuilder(
    column: $table.downloadedAt,
    builder: (column) => column,
  );
}

class $$DownloadedTrackRecordsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $DownloadedTrackRecordsTable,
          DownloadedTrackRecord,
          $$DownloadedTrackRecordsTableFilterComposer,
          $$DownloadedTrackRecordsTableOrderingComposer,
          $$DownloadedTrackRecordsTableAnnotationComposer,
          $$DownloadedTrackRecordsTableCreateCompanionBuilder,
          $$DownloadedTrackRecordsTableUpdateCompanionBuilder,
          (
            DownloadedTrackRecord,
            BaseReferences<
              _$AppDatabase,
              $DownloadedTrackRecordsTable,
              DownloadedTrackRecord
            >,
          ),
          DownloadedTrackRecord,
          PrefetchHooks Function()
        > {
  $$DownloadedTrackRecordsTableTableManager(
    _$AppDatabase db,
    $DownloadedTrackRecordsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$DownloadedTrackRecordsTableFilterComposer(
                $db: db,
                $table: table,
              ),
          createOrderingComposer: () =>
              $$DownloadedTrackRecordsTableOrderingComposer(
                $db: db,
                $table: table,
              ),
          createComputedFieldComposer: () =>
              $$DownloadedTrackRecordsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> trackId = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String?> artist = const Value.absent(),
                Value<String> album = const Value.absent(),
                Value<String?> artworkUrl = const Value.absent(),
                Value<String> kind = const Value.absent(),
                Value<String> sourceUrl = const Value.absent(),
                Value<String> fileName = const Value.absent(),
                Value<int> sizeBytes = const Value.absent(),
                Value<DateTime> downloadedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => DownloadedTrackRecordsCompanion(
                trackId: trackId,
                title: title,
                artist: artist,
                album: album,
                artworkUrl: artworkUrl,
                kind: kind,
                sourceUrl: sourceUrl,
                fileName: fileName,
                sizeBytes: sizeBytes,
                downloadedAt: downloadedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String trackId,
                required String title,
                Value<String?> artist = const Value.absent(),
                required String album,
                Value<String?> artworkUrl = const Value.absent(),
                required String kind,
                required String sourceUrl,
                required String fileName,
                required int sizeBytes,
                required DateTime downloadedAt,
                Value<int> rowid = const Value.absent(),
              }) => DownloadedTrackRecordsCompanion.insert(
                trackId: trackId,
                title: title,
                artist: artist,
                album: album,
                artworkUrl: artworkUrl,
                kind: kind,
                sourceUrl: sourceUrl,
                fileName: fileName,
                sizeBytes: sizeBytes,
                downloadedAt: downloadedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$DownloadedTrackRecordsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $DownloadedTrackRecordsTable,
      DownloadedTrackRecord,
      $$DownloadedTrackRecordsTableFilterComposer,
      $$DownloadedTrackRecordsTableOrderingComposer,
      $$DownloadedTrackRecordsTableAnnotationComposer,
      $$DownloadedTrackRecordsTableCreateCompanionBuilder,
      $$DownloadedTrackRecordsTableUpdateCompanionBuilder,
      (
        DownloadedTrackRecord,
        BaseReferences<
          _$AppDatabase,
          $DownloadedTrackRecordsTable,
          DownloadedTrackRecord
        >,
      ),
      DownloadedTrackRecord,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$ContributionRecordsTableTableManager get contributionRecords =>
      $$ContributionRecordsTableTableManager(_db, _db.contributionRecords);
  $$SavedEntryRecordsTableTableManager get savedEntryRecords =>
      $$SavedEntryRecordsTableTableManager(_db, _db.savedEntryRecords);
  $$DownloadedTrackRecordsTableTableManager get downloadedTrackRecords =>
      $$DownloadedTrackRecordsTableTableManager(
        _db,
        _db.downloadedTrackRecords,
      );
}
