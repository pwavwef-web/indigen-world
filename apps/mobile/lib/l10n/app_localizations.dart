import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('fr'),
  ];

  /// The app's name. Not translated — it is a brand.
  ///
  /// In en, this message translates to:
  /// **'Indigen'**
  String get appTitle;

  /// Section heading above the appearance, language and notification choices.
  ///
  /// In en, this message translates to:
  /// **'PREFERENCES'**
  String get settingsPreferences;

  /// Settings row that opens the reading-language chooser.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsLanguage;

  /// The default language choice: whatever the phone is set to.
  ///
  /// In en, this message translates to:
  /// **'Match my device'**
  String get settingsLanguageMatchDevice;

  /// Supporting line under the Language row when the device language is being followed.
  ///
  /// In en, this message translates to:
  /// **'The language the app reads in'**
  String get settingsLanguageSubtitle;

  /// No description provided for @settingsAppearance.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get settingsAppearance;

  /// No description provided for @settingsAppearanceSystem.
  ///
  /// In en, this message translates to:
  /// **'Match device — light by day, dark by night'**
  String get settingsAppearanceSystem;

  /// No description provided for @settingsAppearanceLight.
  ///
  /// In en, this message translates to:
  /// **'Light — warm paper and deep green'**
  String get settingsAppearanceLight;

  /// No description provided for @settingsAppearanceDark.
  ///
  /// In en, this message translates to:
  /// **'Dark — charcoal with a green undertone'**
  String get settingsAppearanceDark;

  /// No description provided for @settingsAutoplayTitle.
  ///
  /// In en, this message translates to:
  /// **'Play videos automatically'**
  String get settingsAutoplayTitle;

  /// No description provided for @settingsAutoplayBody.
  ///
  /// In en, this message translates to:
  /// **'Clips in the community feed start themselves, silently. Off saves data on a metered connection — tap any clip to watch it.'**
  String get settingsAutoplayBody;

  /// The five destinations in the bottom rail. Kept short — they sit under an icon in a 9.5px label.
  ///
  /// In en, this message translates to:
  /// **'Explore'**
  String get navExplore;

  /// No description provided for @navLearn.
  ///
  /// In en, this message translates to:
  /// **'Learn'**
  String get navLearn;

  /// No description provided for @navCommunity.
  ///
  /// In en, this message translates to:
  /// **'Community'**
  String get navCommunity;

  /// No description provided for @navCollection.
  ///
  /// In en, this message translates to:
  /// **'Collection'**
  String get navCollection;

  /// No description provided for @navContribute.
  ///
  /// In en, this message translates to:
  /// **'Contribute'**
  String get navContribute;

  /// The first line anybody reads. The line break is deliberate.
  ///
  /// In en, this message translates to:
  /// **'Language lives\nwith people.'**
  String get onboardingTitle;

  /// No description provided for @onboardingBody.
  ///
  /// In en, this message translates to:
  /// **'Learn, search, and contribute through Project Kassena — the first language cell in Indigen World.'**
  String get onboardingBody;

  /// No description provided for @onboardingQuestion.
  ///
  /// In en, this message translates to:
  /// **'What brings you here?'**
  String get onboardingQuestion;

  /// No description provided for @onboardingHome.
  ///
  /// In en, this message translates to:
  /// **'Home community'**
  String get onboardingHome;

  /// No description provided for @onboardingHomeBody.
  ///
  /// In en, this message translates to:
  /// **'Stay close to language used around you.'**
  String get onboardingHomeBody;

  /// No description provided for @onboardingDiaspora.
  ///
  /// In en, this message translates to:
  /// **'Diaspora'**
  String get onboardingDiaspora;

  /// No description provided for @onboardingDiasporaBody.
  ///
  /// In en, this message translates to:
  /// **'Reconnect and practise from wherever you are.'**
  String get onboardingDiasporaBody;

  /// No description provided for @onboardingVisitor.
  ///
  /// In en, this message translates to:
  /// **'Visitor or learner'**
  String get onboardingVisitor;

  /// No description provided for @onboardingVisitorBody.
  ///
  /// In en, this message translates to:
  /// **'Learn respectfully with context and attribution.'**
  String get onboardingVisitorBody;

  /// No description provided for @onboardingStart.
  ///
  /// In en, this message translates to:
  /// **'Start with Kasem'**
  String get onboardingStart;

  /// No description provided for @onboardingGuestNote.
  ///
  /// In en, this message translates to:
  /// **'Public dictionary and learning content work without sign-in. You can choose an account later.'**
  String get onboardingGuestNote;

  /// No description provided for @communityTitle.
  ///
  /// In en, this message translates to:
  /// **'Community'**
  String get communityTitle;

  /// No description provided for @communityMenu.
  ///
  /// In en, this message translates to:
  /// **'Community menu'**
  String get communityMenu;

  /// No description provided for @communityMenuWaiting.
  ///
  /// In en, this message translates to:
  /// **'Community menu, items waiting'**
  String get communityMenuWaiting;

  /// No description provided for @communityNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get communityNotifications;

  /// No description provided for @communityNotificationsUnread.
  ///
  /// In en, this message translates to:
  /// **'Notifications, {count} unread'**
  String communityNotificationsUnread(int count);

  /// No description provided for @communityFindPeople.
  ///
  /// In en, this message translates to:
  /// **'Find people'**
  String get communityFindPeople;

  /// No description provided for @communitySavedPosts.
  ///
  /// In en, this message translates to:
  /// **'Saved posts'**
  String get communitySavedPosts;

  /// No description provided for @communityNewPost.
  ///
  /// In en, this message translates to:
  /// **'New Kasem post'**
  String get communityNewPost;

  /// No description provided for @communityCompose.
  ///
  /// In en, this message translates to:
  /// **'Make a Kasem post'**
  String get communityCompose;

  /// No description provided for @communityNewVoices.
  ///
  /// In en, this message translates to:
  /// **'New voices'**
  String get communityNewVoices;

  /// No description provided for @communityNobodyNew.
  ///
  /// In en, this message translates to:
  /// **'Nobody new yet.'**
  String get communityNobodyNew;

  /// No description provided for @communityForYou.
  ///
  /// In en, this message translates to:
  /// **'For you'**
  String get communityForYou;

  /// No description provided for @communityFollowing.
  ///
  /// In en, this message translates to:
  /// **'Following'**
  String get communityFollowing;

  /// The pill at the top of the feed counting posts held back while somebody reads.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 new post} other{{count} new posts}}'**
  String communityNewPostsPill(int count);

  /// No description provided for @communityNewPostsSemantics.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 new post, go to the top} other{{count} new posts, go to the top}}'**
  String communityNewPostsSemantics(int count);

  /// No description provided for @communityEmptyFollowing.
  ///
  /// In en, this message translates to:
  /// **'Nothing from the people you follow'**
  String get communityEmptyFollowing;

  /// No description provided for @communityEmptyFeed.
  ///
  /// In en, this message translates to:
  /// **'No posts yet'**
  String get communityEmptyFeed;

  /// No description provided for @communityFirstPost.
  ///
  /// In en, this message translates to:
  /// **'Make the first post'**
  String get communityFirstPost;

  /// No description provided for @communityBackendPending.
  ///
  /// In en, this message translates to:
  /// **'The community service is still starting up'**
  String get communityBackendPending;

  /// No description provided for @communityFeedFailed.
  ///
  /// In en, this message translates to:
  /// **'The feed could not load'**
  String get communityFeedFailed;

  /// No description provided for @communityTryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get communityTryAgain;

  /// No description provided for @learnDictionary.
  ///
  /// In en, this message translates to:
  /// **'Dictionary'**
  String get learnDictionary;

  /// No description provided for @learnStreakClaimed.
  ///
  /// In en, this message translates to:
  /// **'Streak, {days} days, claimed today'**
  String learnStreakClaimed(int days);

  /// No description provided for @learnDailySpark.
  ///
  /// In en, this message translates to:
  /// **'Daily spark, {days} day streak'**
  String learnDailySpark(int days);

  /// No description provided for @learnXpSemantics.
  ///
  /// In en, this message translates to:
  /// **'{xp} experience points'**
  String learnXpSemantics(int xp);

  /// No description provided for @learnQuestSemantics.
  ///
  /// In en, this message translates to:
  /// **'Today’s quest, {done} of 3'**
  String learnQuestSemantics(int done);

  /// No description provided for @learnSparkClaimed.
  ///
  /// In en, this message translates to:
  /// **'Daily spark claimed · +{xp} XP'**
  String learnSparkClaimed(int xp);

  /// No description provided for @learnLockedAbove.
  ///
  /// In en, this message translates to:
  /// **'Finish the lesson above to unlock this one.'**
  String get learnLockedAbove;

  /// No description provided for @learnUnitNumber.
  ///
  /// In en, this message translates to:
  /// **'UNIT {order}'**
  String learnUnitNumber(int order);

  /// No description provided for @learnWordOfTheDay.
  ///
  /// In en, this message translates to:
  /// **'WORD OF THE DAY'**
  String get learnWordOfTheDay;

  /// No description provided for @learnHeroOfTheWeek.
  ///
  /// In en, this message translates to:
  /// **'HERO OF THE WEEK'**
  String get learnHeroOfTheWeek;

  /// No description provided for @learnStart.
  ///
  /// In en, this message translates to:
  /// **'START'**
  String get learnStart;

  /// No description provided for @learnUnitComplete.
  ///
  /// In en, this message translates to:
  /// **'UNIT COMPLETE'**
  String get learnUnitComplete;

  /// No description provided for @learnUnitTrophy.
  ///
  /// In en, this message translates to:
  /// **'UNIT TROPHY'**
  String get learnUnitTrophy;

  /// No description provided for @learnUnitCompleteSemantics.
  ///
  /// In en, this message translates to:
  /// **'{unit} complete'**
  String learnUnitCompleteSemantics(String unit);

  /// No description provided for @learnUnitTrophySemantics.
  ///
  /// In en, this message translates to:
  /// **'Finish {unit} to open what is at the end of it'**
  String learnUnitTrophySemantics(String unit);

  /// No description provided for @learnNodeSemantics.
  ///
  /// In en, this message translates to:
  /// **'Lesson {number} of {total}, {title}, {state}'**
  String learnNodeSemantics(int number, int total, String title, String state);

  /// No description provided for @learnStateCompleted.
  ///
  /// In en, this message translates to:
  /// **'completed'**
  String get learnStateCompleted;

  /// No description provided for @learnStateReady.
  ///
  /// In en, this message translates to:
  /// **'ready'**
  String get learnStateReady;

  /// No description provided for @learnStateLocked.
  ///
  /// In en, this message translates to:
  /// **'locked'**
  String get learnStateLocked;

  /// No description provided for @learnBubbleCompleted.
  ///
  /// In en, this message translates to:
  /// **'COMPLETED · LESSON {number} OF {total}'**
  String learnBubbleCompleted(int number, int total);

  /// No description provided for @learnBubbleLesson.
  ///
  /// In en, this message translates to:
  /// **'LESSON {number} OF {total}'**
  String learnBubbleLesson(int number, int total);

  /// No description provided for @learnBubbleLocked.
  ///
  /// In en, this message translates to:
  /// **'LOCKED'**
  String get learnBubbleLocked;

  /// No description provided for @learnBubbleMinutes.
  ///
  /// In en, this message translates to:
  /// **'{minutes} min · {xp} XP'**
  String learnBubbleMinutes(int minutes, int xp);

  /// No description provided for @learnBubbleLockedBody.
  ///
  /// In en, this message translates to:
  /// **'Finish the lesson above to open this one.'**
  String get learnBubbleLockedBody;

  /// No description provided for @learnBubblePractise.
  ///
  /// In en, this message translates to:
  /// **'PRACTISE AGAIN'**
  String get learnBubblePractise;

  /// No description provided for @learnBubbleStart.
  ///
  /// In en, this message translates to:
  /// **'START · +{xp} XP'**
  String learnBubbleStart(int xp);

  /// No description provided for @learnQuestTitle.
  ///
  /// In en, this message translates to:
  /// **'Today’s quest'**
  String get learnQuestTitle;

  /// No description provided for @learnQuestSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Complete 3 quick lessons'**
  String get learnQuestSubtitle;

  /// No description provided for @learnMomentumTitle.
  ///
  /// In en, this message translates to:
  /// **'Your momentum'**
  String get learnMomentumTitle;

  /// No description provided for @learnMomentumUnpublished.
  ///
  /// In en, this message translates to:
  /// **'The path is still being published'**
  String get learnMomentumUnpublished;

  /// No description provided for @learnMomentumProgress.
  ///
  /// In en, this message translates to:
  /// **'{done} of {total} lessons complete'**
  String learnMomentumProgress(int done, int total);

  /// No description provided for @learnPerfectLesson.
  ///
  /// In en, this message translates to:
  /// **'Perfect lesson!'**
  String get learnPerfectLesson;

  /// No description provided for @learnLessonComplete.
  ///
  /// In en, this message translates to:
  /// **'Lesson complete!'**
  String get learnLessonComplete;

  /// No description provided for @learnXpEarned.
  ///
  /// In en, this message translates to:
  /// **'XP EARNED'**
  String get learnXpEarned;

  /// No description provided for @learnTotalXp.
  ///
  /// In en, this message translates to:
  /// **'TOTAL XP'**
  String get learnTotalXp;

  /// No description provided for @learnAnswersRight.
  ///
  /// In en, this message translates to:
  /// **'ANSWERS RIGHT'**
  String get learnAnswersRight;

  /// No description provided for @learnStreakDayOne.
  ///
  /// In en, this message translates to:
  /// **'Day one of your streak.'**
  String get learnStreakDayOne;

  /// No description provided for @learnStreakDays.
  ///
  /// In en, this message translates to:
  /// **'{days} days in a row.'**
  String learnStreakDays(int days);

  /// No description provided for @learnContinue.
  ///
  /// In en, this message translates to:
  /// **'CONTINUE'**
  String get learnContinue;

  /// No description provided for @collectionEyebrow.
  ///
  /// In en, this message translates to:
  /// **'The Kassena Collection'**
  String get collectionEyebrow;

  /// No description provided for @collectionMusic.
  ///
  /// In en, this message translates to:
  /// **'Music'**
  String get collectionMusic;

  /// No description provided for @collectionDictionary.
  ///
  /// In en, this message translates to:
  /// **'Dictionary'**
  String get collectionDictionary;

  /// No description provided for @collectionLiterature.
  ///
  /// In en, this message translates to:
  /// **'Literature'**
  String get collectionLiterature;

  /// No description provided for @collectionAudiobooks.
  ///
  /// In en, this message translates to:
  /// **'Audiobooks'**
  String get collectionAudiobooks;

  /// No description provided for @collectionVideo.
  ///
  /// In en, this message translates to:
  /// **'Video'**
  String get collectionVideo;

  /// No description provided for @collectionHeroes.
  ///
  /// In en, this message translates to:
  /// **'Heroes'**
  String get collectionHeroes;

  /// No description provided for @collectionApps.
  ///
  /// In en, this message translates to:
  /// **'Apps'**
  String get collectionApps;

  /// No description provided for @collectionShop.
  ///
  /// In en, this message translates to:
  /// **'Shop'**
  String get collectionShop;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'fr'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
