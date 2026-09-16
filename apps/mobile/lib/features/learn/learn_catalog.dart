import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/learn/learn_content.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// THE COURSE CATALOGUE
///
/// A course is one language; a unit is a stretch of it with a title, a picture
/// and a place in the order; a lesson is what a member actually opens.
///
/// Courses and units are documents (`learnCourses`, `learnUnits`) an
/// administrator writes, and lessons join a unit by `unitOrder` — so a unit
/// can exist, with its picture, before any of its lessons are published, and
/// the Learn tab shows it honestly as *in preparation*. Until the project
/// publishes its own, the app draws the bundled Kasem outline below, the same
/// way it falls back to the bundled lessons: learning is the one tab that has
/// to work on a first launch with no connection.
/// ─────────────────────────────────────────────────────────────────────────────

/// One language a member can learn.
@immutable
class LearnCourse {
  const LearnCourse({
    required this.id,
    required this.title,
    required this.languageName,
    this.languageCode = '',
    this.order = 1,
    this.description = '',
  });

  final String id;
  final String title;

  /// What the selector says after "Learning".
  final String languageName;

  /// ISO 639-3 where there is one — `xsm` for Kasem.
  final String languageCode;
  final int order;
  final String description;

  static LearnCourse fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final title = _text(data['title'], fallback: doc.id);
    return LearnCourse(
      id: doc.id,
      title: title,
      languageName: _text(data['languageName'], fallback: title),
      languageCode: _text(data['languageCode']),
      order: _int(data['order'], fallback: 1),
      description: _text(data['description']),
    );
  }
}

/// One unit of a course.
@immutable
class LearnUnit {
  const LearnUnit({
    required this.id,
    required this.order,
    required this.title,
    this.courseId = 'kasem',
    this.subtitle = '',
    this.imageUrl = '',
    this.imageAttribution = '',
    this.assetImage = '',
  });

  final String id;
  final String courseId;

  /// Lessons whose `unitOrder` matches belong to this unit.
  final int order;
  final String title;
  final String subtitle;

  /// An administrator-approved illustration, and its credit line.
  final String imageUrl;
  final String imageAttribution;

  /// A picture shipped inside the app, for the bundled outline.
  final String assetImage;

  bool get hasImage => imageUrl.isNotEmpty || assetImage.isNotEmpty;

  static LearnUnit fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    return LearnUnit(
      id: doc.id,
      courseId: _text(data['courseId'], fallback: 'kasem'),
      order: _int(data['order'], fallback: 1),
      title: _text(data['title'], fallback: 'Unit'),
      subtitle: _text(data['subtitle']),
      imageUrl: _text(data['imageUrl']),
      imageAttribution: _text(data['imageAttribution']),
    );
  }

  LearnUnit withFallbackArt(LearnUnit? bundled) =>
      bundled == null || imageUrl.isNotEmpty
      ? this
      : LearnUnit(
          id: id,
          courseId: courseId,
          order: order,
          title: title,
          subtitle: subtitle,
          imageAttribution: bundled.imageAttribution,
          assetImage: bundled.assetImage,
        );
}

const kasemCourse = LearnCourse(
  id: 'kasem',
  title: 'Kasem',
  languageName: 'Kasem',
  languageCode: 'xsm',
  description:
      'The language of the Kassena people of northern Ghana and '
      'southern Burkina Faso.',
);

/// Credit for the illustrations shipped with the app.
const bundledIllustrationCredit =
    'AI illustration (Nano Banana on Vertex AI) · Indigen World';

/// The Kasem outline shipped inside the app.
///
/// Unit 1 is the bundled lessons. Units 2 to 4 are the course plan: they carry
/// no lessons yet, and the Learn tab says exactly that rather than inventing a
/// lesson count. An administrator's `learnUnits` documents replace this list
/// entirely.
const bundledUnits = <LearnUnit>[
  LearnUnit(
    id: 'kasem-unit-1',
    order: 1,
    title: 'Start a conversation',
    subtitle: 'Greetings, introductions and everyday courtesy',
    assetImage: 'assets/learn/hero-greeting.webp',
    imageAttribution: bundledIllustrationCredit,
  ),
  LearnUnit(
    id: 'kasem-unit-2',
    order: 2,
    title: 'Family & people',
    subtitle: 'Relatives, names and the people around you',
    assetImage: 'assets/learn/unit-family.webp',
    imageAttribution: bundledIllustrationCredit,
  ),
  LearnUnit(
    id: 'kasem-unit-3',
    order: 3,
    title: 'Food & home',
    subtitle: 'Meals, the kitchen and the compound',
    assetImage: 'assets/learn/unit-food.webp',
    imageAttribution: bundledIllustrationCredit,
  ),
  LearnUnit(
    id: 'kasem-unit-4',
    order: 4,
    title: 'Around town',
    subtitle: 'The market, directions and getting about',
    assetImage: 'assets/learn/unit-town.webp',
    imageAttribution: bundledIllustrationCredit,
  ),
];

// ── Reading ─────────────────────────────────────────────────────────────────

class LearnCatalogRepository {
  const LearnCatalogRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<LearnCourse>> watchCourses() => _firestore
      .collection('learnCourses')
      .where('published', isEqualTo: true)
      .orderBy('order')
      .snapshots()
      .map((snapshot) => snapshot.docs.map(LearnCourse.fromDoc).toList());

  Stream<List<LearnUnit>> watchUnits() => _firestore
      .collection('learnUnits')
      .where('published', isEqualTo: true)
      .orderBy('order')
      .snapshots()
      .map((snapshot) => snapshot.docs.map(LearnUnit.fromDoc).toList());
}

final learnCatalogRepositoryProvider = Provider<LearnCatalogRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return LearnCatalogRepository(FirebaseFirestore.instance);
});

/// Every course a member can pick. Kasem alone until the project publishes
/// others; the selector is built for the list, not for the one.
final learnCoursesProvider = StreamProvider<List<LearnCourse>>((ref) {
  final repository = ref.watch(learnCatalogRepositoryProvider);
  if (repository == null) return Stream.value(const [kasemCourse]);
  return repository.watchCourses().map(
    (courses) => courses.isEmpty ? const [kasemCourse] : courses,
  );
});

/// The published units of every course, or the bundled outline.
final learnUnitsProvider = StreamProvider<List<LearnUnit>>((ref) {
  final repository = ref.watch(learnCatalogRepositoryProvider);
  if (repository == null) return Stream.value(bundledUnits);
  return repository.watchUnits().map(
    (units) => units.isEmpty ? bundledUnits : units,
  );
});

/// The course the member has chosen, remembered on the device.
class SelectedCourse extends Notifier<String> {
  static const preferenceKey = 'learn.courseId';

  @override
  String build() {
    unawaited(_restore());
    return kasemCourse.id;
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getString(preferenceKey);
      if (stored != null && stored.isNotEmpty && stored != state) {
        state = stored;
      }
    } on Object {
      // Kasem, which is what an unreadable preference means anyway.
    }
  }

  Future<void> choose(String courseId) async {
    state = courseId;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(preferenceKey, courseId);
    } on Object {
      // The choice holds for this session either way.
    }
  }
}

final selectedCourseIdProvider = NotifierProvider<SelectedCourse, String>(
  SelectedCourse.new,
);

// ── The outline ─────────────────────────────────────────────────────────────

enum UnitState {
  /// Every lesson finished.
  completed,

  /// Some lessons finished, or the member's next lesson is in here.
  inProgress,

  /// Open, and nothing done yet.
  available,

  /// An earlier unit has to be finished first.
  locked,

  /// The unit exists but none of its lessons are published yet.
  inPreparation,
}

@immutable
class UnitOutline {
  const UnitOutline({
    required this.unit,
    required this.lessons,
    required this.completed,
    required this.firstIndex,
    required this.state,
    this.blockedBy,
  });

  final LearnUnit unit;
  final List<Lesson> lessons;

  /// Lessons of this unit already finished.
  final int completed;

  /// Where this unit's first lesson sits on the whole path, or -1 when it has
  /// no lessons.
  final int firstIndex;
  final UnitState state;

  /// The unit that has to be finished before this one opens.
  final UnitOutline? blockedBy;

  int get remaining => lessons.length - completed;

  bool get opensLessons =>
      state == UnitState.available ||
      state == UnitState.inProgress ||
      state == UnitState.completed;
}

@immutable
class CourseOutline {
  const CourseOutline({
    required this.course,
    required this.units,
    required this.path,
    required this.nextIndex,
  });

  final LearnCourse course;
  final List<UnitOutline> units;

  /// Every lesson of the course in the order it is walked.
  final List<Lesson> path;

  /// The first unfinished lesson on [path], or -1 when every lesson is done
  /// (or there are none).
  final int nextIndex;

  bool get isEmpty => path.isEmpty;
  bool get allComplete => path.isNotEmpty && nextIndex == -1;

  Lesson? get nextLesson => nextIndex < 0 ? null : path[nextIndex];

  UnitOutline? unitOfLesson(Lesson lesson) {
    for (final unit in units) {
      if (unit.lessons.any((candidate) => candidate.id == lesson.id)) {
        return unit;
      }
    }
    return null;
  }

  UnitOutline? get currentUnit {
    final lesson = nextLesson;
    if (lesson != null) return unitOfLesson(lesson);
    return units.where((unit) => unit.lessons.isNotEmpty).lastOrNull;
  }

  int get completedLessons =>
      units.fold<int>(0, (total, unit) => total + unit.completed);

  /// Units after the one the member is working in — what the Explore next
  /// strip offers. Everything but the current unit once the course is done.
  List<UnitOutline> get upcoming {
    final current = currentUnit;
    if (current == null) return units;
    final position = units.indexOf(current);
    final after = units.sublist(position + 1);
    if (after.isNotEmpty) return after;
    return [
      for (final unit in units)
        if (unit != current) unit,
    ];
  }
}

/// Puts a course together from its units, its lessons and a member's progress.
///
/// Pure, so the rules about what is open and what is locked are tested without
/// a widget: a unit opens when every lesson before it is finished, exactly as
/// the trail has always gated lessons, and a unit with no published lessons is
/// in preparation rather than locked — nothing the member does will open it.
CourseOutline buildCourseOutline({
  required LearnCourse course,
  required List<LearnUnit> units,
  required List<Lesson> lessons,
  required LearnProgress progress,
}) {
  final courseLessons = [
    for (final lesson in lessons)
      if (lesson.courseId == course.id) lesson,
  ];
  final bundledByOrder = {
    for (final unit in bundledUnits)
      if (course.id == kasemCourse.id) unit.order: unit,
  };
  final unitByOrder = <int, LearnUnit>{
    for (final unit in units)
      if (unit.courseId == course.id)
        unit.order: unit.withFallbackArt(bundledByOrder[unit.order]),
  };
  final bundledIds = {for (final unit in bundledUnits) unit.id};
  final lessonsByOrder = <int, List<Lesson>>{};
  for (final lesson in courseLessons) {
    lessonsByOrder.putIfAbsent(lesson.unitOrder, () => <Lesson>[]).add(lesson);
    // A lesson in a unit nobody has written a document for still gets a unit,
    // named the way the lesson names it — and the published lessons outrank
    // the bundled plan's name for their unit, keeping only its picture.
    final existing = unitByOrder[lesson.unitOrder];
    if (existing != null &&
        !(bundledIds.contains(existing.id) &&
            existing.title != lesson.unitTitle)) {
      continue;
    }
    unitByOrder[lesson.unitOrder] = LearnUnit(
      id: '${course.id}-unit-${lesson.unitOrder}',
      courseId: course.id,
      order: lesson.unitOrder,
      title: lesson.unitTitle,
      subtitle: lesson.unitSubtitle,
      assetImage: bundledByOrder[lesson.unitOrder]?.assetImage ?? '',
      imageAttribution:
          bundledByOrder[lesson.unitOrder]?.imageAttribution ?? '',
    );
  }
  final orders = unitByOrder.keys.toList()..sort();
  final path = <Lesson>[];
  final grouped = <(LearnUnit, List<Lesson>, int)>[];
  for (final order in orders) {
    final unitLessons = [...?lessonsByOrder[order]]
      ..sort((a, b) => a.order.compareTo(b.order));
    grouped.add((
      unitByOrder[order]!,
      unitLessons,
      unitLessons.isEmpty ? -1 : path.length,
    ));
    path.addAll(unitLessons);
  }
  var nextIndex = -1;
  for (var index = 0; index < path.length; index++) {
    if (!progress.hasCompleted(path[index].id)) {
      nextIndex = index;
      break;
    }
  }

  final outlines = <UnitOutline>[];
  UnitOutline? working;
  for (final (unit, unitLessons, firstIndex) in grouped) {
    final done = unitLessons
        .where((lesson) => progress.hasCompleted(lesson.id))
        .length;
    final UnitState state;
    if (unitLessons.isEmpty) {
      state = UnitState.inPreparation;
    } else if (done == unitLessons.length) {
      state = UnitState.completed;
    } else if (nextIndex >= firstIndex &&
        nextIndex < firstIndex + unitLessons.length) {
      state = done > 0 || progress.stepsIn(path[nextIndex].id) > 0
          ? UnitState.inProgress
          : UnitState.available;
    } else if (nextIndex >= 0 && firstIndex > nextIndex) {
      state = UnitState.locked;
    } else {
      // Some lessons done out of order — earlier path versions allowed it.
      state = done > 0 ? UnitState.inProgress : UnitState.available;
    }
    final outline = UnitOutline(
      unit: unit,
      lessons: List.unmodifiable(unitLessons),
      completed: done,
      firstIndex: firstIndex,
      state: state,
      blockedBy: state == UnitState.locked ? working : null,
    );
    if (state == UnitState.inProgress || state == UnitState.available) {
      working ??= outline;
    }
    outlines.add(outline);
  }
  return CourseOutline(
    course: course,
    units: List.unmodifiable(outlines),
    path: List.unmodifiable(path),
    nextIndex: nextIndex,
  );
}

/// The selected course, assembled. Always answers: the bundled course, units
/// and lessons stand in for anything not loaded yet.
final courseOutlineProvider = Provider<CourseOutline>((ref) {
  final courses =
      ref.watch(learnCoursesProvider).asData?.value ?? const [kasemCourse];
  final selected = ref.watch(selectedCourseIdProvider);
  final course = courses.firstWhere(
    (candidate) => candidate.id == selected,
    orElse: () => courses.first,
  );
  final lessons = ref.watch(lessonPathProvider).asData?.value ?? bundledLessons;
  var units = ref.watch(learnUnitsProvider).asData?.value ?? bundledUnits;
  // The bundled plan belongs to the bundled lessons. Once real lessons are
  // published without unit documents, only their own units are shown — the
  // plan keeps lending its pictures, but not units nobody has published.
  if (identical(units, bundledUnits) && !identical(lessons, bundledLessons)) {
    final orders = {for (final lesson in lessons) lesson.unitOrder};
    units = [
      for (final unit in bundledUnits)
        if (orders.contains(unit.order)) unit,
    ];
  }
  return buildCourseOutline(
    course: course,
    units: units,
    lessons: lessons,
    progress:
        ref.watch(learnProgressProvider).asData?.value ?? const LearnProgress(),
  );
});

/// Whether the dashboard is still waiting for its first course — the published
/// lessons. Drives the skeleton.
///
/// Progress is deliberately not waited on: it comes off the device a frame or
/// two later, and a dashboard that fills its numbers in beats one that blinks
/// from a skeleton to the same layout.
final learnDashboardLoadingProvider = Provider<bool>((ref) {
  // Without Firebase the bundled course is handed over at once; a skeleton for
  // that one frame would only be a flicker.
  if (!ref.watch(firebaseReadyProvider)) return false;
  final lessons = ref.watch(lessonPathProvider);
  return lessons.isLoading && !lessons.hasValue;
});

String _text(Object? value, {String fallback = ''}) {
  if (value is String && value.trim().isNotEmpty) return value.trim();
  return fallback;
}

int _int(Object? value, {int fallback = 0}) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? fallback;
  return fallback;
}
