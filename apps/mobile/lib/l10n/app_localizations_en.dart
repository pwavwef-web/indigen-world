// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Indigen';

  @override
  String get settingsPreferences => 'PREFERENCES';

  @override
  String get settingsLanguage => 'Language';

  @override
  String get settingsLanguageMatchDevice => 'Match my device';

  @override
  String get settingsLanguageSubtitle => 'The language the app reads in';

  @override
  String get settingsAppearance => 'Appearance';

  @override
  String get settingsAppearanceSystem =>
      'Match device — light by day, dark by night';

  @override
  String get settingsAppearanceLight => 'Light — warm paper and deep green';

  @override
  String get settingsAppearanceDark => 'Dark — charcoal with a green undertone';

  @override
  String get settingsAutoplayTitle => 'Play videos automatically';

  @override
  String get settingsAutoplayBody =>
      'Clips in the community feed start themselves, silently. Off saves data on a metered connection — tap any clip to watch it.';

  @override
  String get navExplore => 'Explore';

  @override
  String get navLearn => 'Learn';

  @override
  String get navCommunity => 'Community';

  @override
  String get navCollection => 'Collection';

  @override
  String get navContribute => 'Contribute';

  @override
  String get onboardingTitle => 'Language lives\nwith people.';

  @override
  String get onboardingBody =>
      'Learn, search, and contribute through Project Kassena — the first language cell in Indigen World.';

  @override
  String get onboardingQuestion => 'What brings you here?';

  @override
  String get onboardingHome => 'Home community';

  @override
  String get onboardingHomeBody => 'Stay close to language used around you.';

  @override
  String get onboardingDiaspora => 'Diaspora';

  @override
  String get onboardingDiasporaBody =>
      'Reconnect and practise from wherever you are.';

  @override
  String get onboardingVisitor => 'Visitor or learner';

  @override
  String get onboardingVisitorBody =>
      'Learn respectfully with context and attribution.';

  @override
  String get onboardingStart => 'Start with Kasem';

  @override
  String get onboardingGuestNote =>
      'Public dictionary and learning content work without sign-in. You can choose an account later.';

  @override
  String get communityTitle => 'Community';

  @override
  String get communityMenu => 'Community menu';

  @override
  String get communityMenuWaiting => 'Community menu, items waiting';

  @override
  String get communityNotifications => 'Notifications';

  @override
  String communityNotificationsUnread(int count) {
    return 'Notifications, $count unread';
  }

  @override
  String get communityFindPeople => 'Find people';

  @override
  String get communitySavedPosts => 'Saved posts';

  @override
  String get communityNewPost => 'New Kasem post';

  @override
  String get communityCompose => 'Make a Kasem post';

  @override
  String get communityNewVoices => 'New voices';

  @override
  String get communityNobodyNew => 'Nobody new yet.';

  @override
  String get communityForYou => 'For you';

  @override
  String get communityFollowing => 'Following';

  @override
  String communityNewPostsPill(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count new posts',
      one: '1 new post',
    );
    return '$_temp0';
  }

  @override
  String communityNewPostsSemantics(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count new posts, go to the top',
      one: '1 new post, go to the top',
    );
    return '$_temp0';
  }

  @override
  String get communityEmptyFollowing => 'Nothing from the people you follow';

  @override
  String get communityEmptyFeed => 'No posts yet';

  @override
  String get communityFirstPost => 'Make the first post';

  @override
  String get communityBackendPending =>
      'The community service is still starting up';

  @override
  String get communityFeedFailed => 'The feed could not load';

  @override
  String get communityTryAgain => 'Try again';

  @override
  String get learnDictionary => 'Dictionary';

  @override
  String learnStreakClaimed(int days) {
    return 'Streak, $days days, claimed today';
  }

  @override
  String learnDailySpark(int days) {
    return 'Daily spark, $days day streak';
  }

  @override
  String learnXpSemantics(int xp) {
    return '$xp experience points';
  }

  @override
  String learnQuestSemantics(int done) {
    return 'Today’s quest, $done of 3';
  }

  @override
  String learnSparkClaimed(int xp) {
    return 'Daily spark claimed · +$xp XP';
  }

  @override
  String get learnLockedAbove => 'Finish the lesson above to unlock this one.';

  @override
  String learnUnitNumber(int order) {
    return 'UNIT $order';
  }

  @override
  String get learnWordOfTheDay => 'WORD OF THE DAY';

  @override
  String get learnHeroOfTheWeek => 'HERO OF THE WEEK';

  @override
  String get learnStart => 'START';

  @override
  String get learnUnitComplete => 'UNIT COMPLETE';

  @override
  String get learnUnitTrophy => 'UNIT TROPHY';

  @override
  String learnUnitCompleteSemantics(String unit) {
    return '$unit complete';
  }

  @override
  String learnUnitTrophySemantics(String unit) {
    return 'Finish $unit to open what is at the end of it';
  }

  @override
  String learnNodeSemantics(int number, int total, String title, String state) {
    return 'Lesson $number of $total, $title, $state';
  }

  @override
  String get learnStateCompleted => 'completed';

  @override
  String get learnStateReady => 'ready';

  @override
  String get learnStateLocked => 'locked';

  @override
  String learnBubbleCompleted(int number, int total) {
    return 'COMPLETED · LESSON $number OF $total';
  }

  @override
  String learnBubbleLesson(int number, int total) {
    return 'LESSON $number OF $total';
  }

  @override
  String get learnBubbleLocked => 'LOCKED';

  @override
  String learnBubbleMinutes(int minutes, int xp) {
    return '$minutes min · $xp XP';
  }

  @override
  String get learnBubbleLockedBody =>
      'Finish the lesson above to open this one.';

  @override
  String get learnBubblePractise => 'PRACTISE AGAIN';

  @override
  String learnBubbleStart(int xp) {
    return 'START · +$xp XP';
  }

  @override
  String get learnQuestTitle => 'Today’s quest';

  @override
  String get learnQuestSubtitle => 'Complete 3 quick lessons';

  @override
  String get learnMomentumTitle => 'Your momentum';

  @override
  String get learnMomentumUnpublished => 'The path is still being published';

  @override
  String learnMomentumProgress(int done, int total) {
    return '$done of $total lessons complete';
  }

  @override
  String get learnPerfectLesson => 'Perfect lesson!';

  @override
  String get learnLessonComplete => 'Lesson complete!';

  @override
  String get learnXpEarned => 'XP EARNED';

  @override
  String get learnTotalXp => 'TOTAL XP';

  @override
  String get learnAnswersRight => 'ANSWERS RIGHT';

  @override
  String get learnStreakDayOne => 'Day one of your streak.';

  @override
  String learnStreakDays(int days) {
    return '$days days in a row.';
  }

  @override
  String get learnContinue => 'CONTINUE';

  @override
  String get collectionEyebrow => 'The Kassena Collection';

  @override
  String get collectionMusic => 'Music';

  @override
  String get collectionDictionary => 'Dictionary';

  @override
  String get collectionLiterature => 'Literature';

  @override
  String get collectionAudiobooks => 'Audiobooks';

  @override
  String get collectionVideo => 'Video';

  @override
  String get collectionHeroes => 'Heroes';

  @override
  String get collectionApps => 'Apps';

  @override
  String get collectionShop => 'Shop';
}
