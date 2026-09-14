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
  /// **'Make a post'**
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

  /// No description provided for @communityComposeIn.
  ///
  /// In en, this message translates to:
  /// **'Post in {community}'**
  String communityComposeIn(String community);

  /// No description provided for @communityAddPhoto.
  ///
  /// In en, this message translates to:
  /// **'Add a photo'**
  String get communityAddPhoto;

  /// No description provided for @communityAddVideo.
  ///
  /// In en, this message translates to:
  /// **'Add a video'**
  String get communityAddVideo;

  /// No description provided for @communityCommunitiesTab.
  ///
  /// In en, this message translates to:
  /// **'Communities'**
  String get communityCommunitiesTab;

  /// No description provided for @communityCommunitiesTabSemantics.
  ///
  /// In en, this message translates to:
  /// **'Communities. Find, join or create a community'**
  String get communityCommunitiesTabSemantics;

  /// No description provided for @communityPromptTitle.
  ///
  /// In en, this message translates to:
  /// **'Today in {language}'**
  String communityPromptTitle(String language);

  /// No description provided for @communityPromptSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Share a word from home'**
  String get communityPromptSubtitle;

  /// No description provided for @communityPromptHint.
  ///
  /// In en, this message translates to:
  /// **'Share a word from home, and what it means…'**
  String get communityPromptHint;

  /// No description provided for @communityPromptSemantics.
  ///
  /// In en, this message translates to:
  /// **'{title}. {subtitle}. Opens the composer'**
  String communityPromptSemantics(String title, String subtitle);

  /// No description provided for @communityNewVoicesSeeAll.
  ///
  /// In en, this message translates to:
  /// **'See all'**
  String get communityNewVoicesSeeAll;

  /// No description provided for @communityVoiceNew.
  ///
  /// In en, this message translates to:
  /// **'New member'**
  String get communityVoiceNew;

  /// No description provided for @communityVoiceDialect.
  ///
  /// In en, this message translates to:
  /// **'Near you'**
  String get communityVoiceDialect;

  /// No description provided for @communityVoiceCommunity.
  ///
  /// In en, this message translates to:
  /// **'In your communities'**
  String get communityVoiceCommunity;

  /// No description provided for @communityVoiceCreator.
  ///
  /// In en, this message translates to:
  /// **'Creator'**
  String get communityVoiceCreator;

  /// No description provided for @communityVoiceActive.
  ///
  /// In en, this message translates to:
  /// **'Posting now'**
  String get communityVoiceActive;

  /// No description provided for @communityLoadingMore.
  ///
  /// In en, this message translates to:
  /// **'Loading more posts'**
  String get communityLoadingMore;

  /// No description provided for @communityCaughtUp.
  ///
  /// In en, this message translates to:
  /// **'You\'re all caught up'**
  String get communityCaughtUp;

  /// No description provided for @communityPostedIn.
  ///
  /// In en, this message translates to:
  /// **'in {community}'**
  String communityPostedIn(String community);

  /// No description provided for @communityPostCategory.
  ///
  /// In en, this message translates to:
  /// **'Kind of post'**
  String get communityPostCategory;

  /// No description provided for @postCategoryQuestion.
  ///
  /// In en, this message translates to:
  /// **'Question'**
  String get postCategoryQuestion;

  /// No description provided for @postCategoryLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get postCategoryLanguage;

  /// No description provided for @postCategoryCulture.
  ///
  /// In en, this message translates to:
  /// **'Culture'**
  String get postCategoryCulture;

  /// No description provided for @postCategoryMusic.
  ///
  /// In en, this message translates to:
  /// **'Music'**
  String get postCategoryMusic;

  /// No description provided for @postCategoryStory.
  ///
  /// In en, this message translates to:
  /// **'Story'**
  String get postCategoryStory;

  /// No description provided for @postCategoryAnnouncement.
  ///
  /// In en, this message translates to:
  /// **'Announcement'**
  String get postCategoryAnnouncement;

  /// No description provided for @communitiesTitle.
  ///
  /// In en, this message translates to:
  /// **'Communities'**
  String get communitiesTitle;

  /// No description provided for @communitiesSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search name, language, place or topic'**
  String get communitiesSearchHint;

  /// No description provided for @communitiesSearchLabel.
  ///
  /// In en, this message translates to:
  /// **'Search communities'**
  String get communitiesSearchLabel;

  /// No description provided for @communitiesClearSearch.
  ///
  /// In en, this message translates to:
  /// **'Clear search'**
  String get communitiesClearSearch;

  /// No description provided for @communitiesDiscover.
  ///
  /// In en, this message translates to:
  /// **'Discover'**
  String get communitiesDiscover;

  /// No description provided for @communitiesJoined.
  ///
  /// In en, this message translates to:
  /// **'Joined'**
  String get communitiesJoined;

  /// No description provided for @communitiesCreate.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get communitiesCreate;

  /// No description provided for @communitiesCreateCommunity.
  ///
  /// In en, this message translates to:
  /// **'Create a community'**
  String get communitiesCreateCommunity;

  /// No description provided for @communitiesMembers.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 member} other{{count} members}}'**
  String communitiesMembers(int count);

  /// No description provided for @communitiesPrivate.
  ///
  /// In en, this message translates to:
  /// **'Private'**
  String get communitiesPrivate;

  /// No description provided for @communitiesPublic.
  ///
  /// In en, this message translates to:
  /// **'Public'**
  String get communitiesPublic;

  /// No description provided for @communitiesJoin.
  ///
  /// In en, this message translates to:
  /// **'Join'**
  String get communitiesJoin;

  /// No description provided for @communitiesRequest.
  ///
  /// In en, this message translates to:
  /// **'Ask to join'**
  String get communitiesRequest;

  /// No description provided for @communitiesRequested.
  ///
  /// In en, this message translates to:
  /// **'Requested'**
  String get communitiesRequested;

  /// No description provided for @communitiesMember.
  ///
  /// In en, this message translates to:
  /// **'Joined'**
  String get communitiesMember;

  /// No description provided for @communitiesLeave.
  ///
  /// In en, this message translates to:
  /// **'Leave community'**
  String get communitiesLeave;

  /// No description provided for @communitiesCancelRequest.
  ///
  /// In en, this message translates to:
  /// **'Withdraw request'**
  String get communitiesCancelRequest;

  /// No description provided for @communitiesNoneJoined.
  ///
  /// In en, this message translates to:
  /// **'You haven\'t joined a community yet'**
  String get communitiesNoneJoined;

  /// No description provided for @communitiesNoneJoinedAction.
  ///
  /// In en, this message translates to:
  /// **'Discover communities'**
  String get communitiesNoneJoinedAction;

  /// No description provided for @communitiesNoResults.
  ///
  /// In en, this message translates to:
  /// **'No communities match “{query}”'**
  String communitiesNoResults(String query);

  /// No description provided for @communitiesNoResultsAction.
  ///
  /// In en, this message translates to:
  /// **'Start one'**
  String get communitiesNoResultsAction;

  /// No description provided for @communitiesEmpty.
  ///
  /// In en, this message translates to:
  /// **'No communities yet'**
  String get communitiesEmpty;

  /// No description provided for @communitiesLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'Communities could not load'**
  String get communitiesLoadFailed;

  /// No description provided for @communityTabFeed.
  ///
  /// In en, this message translates to:
  /// **'Feed'**
  String get communityTabFeed;

  /// No description provided for @communityTabAbout.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get communityTabAbout;

  /// No description provided for @communityTabMembers.
  ///
  /// In en, this message translates to:
  /// **'Members'**
  String get communityTabMembers;

  /// No description provided for @communityTabRules.
  ///
  /// In en, this message translates to:
  /// **'Rules'**
  String get communityTabRules;

  /// No description provided for @communityShareCommunity.
  ///
  /// In en, this message translates to:
  /// **'Share community'**
  String get communityShareCommunity;

  /// No description provided for @communityReportCommunity.
  ///
  /// In en, this message translates to:
  /// **'Report community'**
  String get communityReportCommunity;

  /// No description provided for @communityMoreOptions.
  ///
  /// In en, this message translates to:
  /// **'More options'**
  String get communityMoreOptions;

  /// No description provided for @communityPendingTitle.
  ///
  /// In en, this message translates to:
  /// **'Your request is waiting for approval'**
  String get communityPendingTitle;

  /// No description provided for @communityPendingBody.
  ///
  /// In en, this message translates to:
  /// **'A moderator will look at it soon.'**
  String get communityPendingBody;

  /// No description provided for @communityPrivateTitle.
  ///
  /// In en, this message translates to:
  /// **'This community is private'**
  String get communityPrivateTitle;

  /// No description provided for @communityPrivateBody.
  ///
  /// In en, this message translates to:
  /// **'Ask to join to see its posts and members.'**
  String get communityPrivateBody;

  /// No description provided for @communityUnavailableTitle.
  ///
  /// In en, this message translates to:
  /// **'This community is unavailable'**
  String get communityUnavailableTitle;

  /// No description provided for @communityUnavailableBody.
  ///
  /// In en, this message translates to:
  /// **'It may have been removed, or the link is wrong.'**
  String get communityUnavailableBody;

  /// No description provided for @communityBannedTitle.
  ///
  /// In en, this message translates to:
  /// **'You can\'t take part in this community'**
  String get communityBannedTitle;

  /// No description provided for @communitySpaceEmpty.
  ///
  /// In en, this message translates to:
  /// **'No posts here yet'**
  String get communitySpaceEmpty;

  /// No description provided for @communityJoinToPost.
  ///
  /// In en, this message translates to:
  /// **'Join to post here'**
  String get communityJoinToPost;

  /// No description provided for @communityAboutCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get communityAboutCategory;

  /// No description provided for @communityAboutLanguage.
  ///
  /// In en, this message translates to:
  /// **'Primary language'**
  String get communityAboutLanguage;

  /// No description provided for @communityAboutLocation.
  ///
  /// In en, this message translates to:
  /// **'Place or cultural group'**
  String get communityAboutLocation;

  /// No description provided for @communityAboutCreated.
  ///
  /// In en, this message translates to:
  /// **'Created'**
  String get communityAboutCreated;

  /// No description provided for @communityAboutVisibility.
  ///
  /// In en, this message translates to:
  /// **'Visibility'**
  String get communityAboutVisibility;

  /// No description provided for @communityAboutNoDescription.
  ///
  /// In en, this message translates to:
  /// **'No description yet.'**
  String get communityAboutNoDescription;

  /// No description provided for @communityNoRules.
  ///
  /// In en, this message translates to:
  /// **'No rules have been written yet.'**
  String get communityNoRules;

  /// No description provided for @communityRequests.
  ///
  /// In en, this message translates to:
  /// **'Requests to join'**
  String get communityRequests;

  /// No description provided for @communityApprove.
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get communityApprove;

  /// No description provided for @communityDecline.
  ///
  /// In en, this message translates to:
  /// **'Decline'**
  String get communityDecline;

  /// No description provided for @communityRoleOwner.
  ///
  /// In en, this message translates to:
  /// **'Owner'**
  String get communityRoleOwner;

  /// No description provided for @communityRoleAdmin.
  ///
  /// In en, this message translates to:
  /// **'Admin'**
  String get communityRoleAdmin;

  /// No description provided for @communityRoleModerator.
  ///
  /// In en, this message translates to:
  /// **'Moderator'**
  String get communityRoleModerator;

  /// No description provided for @communityMemberActions.
  ///
  /// In en, this message translates to:
  /// **'Member options'**
  String get communityMemberActions;

  /// No description provided for @communityMakeModerator.
  ///
  /// In en, this message translates to:
  /// **'Make moderator'**
  String get communityMakeModerator;

  /// No description provided for @communityMakeAdmin.
  ///
  /// In en, this message translates to:
  /// **'Make admin'**
  String get communityMakeAdmin;

  /// No description provided for @communityMakeMember.
  ///
  /// In en, this message translates to:
  /// **'Remove role'**
  String get communityMakeMember;

  /// No description provided for @communityRemoveMember.
  ///
  /// In en, this message translates to:
  /// **'Remove from community'**
  String get communityRemoveMember;

  /// No description provided for @communityBanMember.
  ///
  /// In en, this message translates to:
  /// **'Ban from community'**
  String get communityBanMember;

  /// No description provided for @communityMembersEmpty.
  ///
  /// In en, this message translates to:
  /// **'No members to show'**
  String get communityMembersEmpty;

  /// No description provided for @createCommunityStepBasics.
  ///
  /// In en, this message translates to:
  /// **'Basics'**
  String get createCommunityStepBasics;

  /// No description provided for @createCommunityStepDetails.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get createCommunityStepDetails;

  /// No description provided for @createCommunityStepLook.
  ///
  /// In en, this message translates to:
  /// **'Look and rules'**
  String get createCommunityStepLook;

  /// No description provided for @createCommunityName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get createCommunityName;

  /// No description provided for @createCommunityNameHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Navrongo Kasem Circle'**
  String get createCommunityNameHint;

  /// No description provided for @createCommunityAddress.
  ///
  /// In en, this message translates to:
  /// **'Address'**
  String get createCommunityAddress;

  /// No description provided for @createCommunityAddressHelper.
  ///
  /// In en, this message translates to:
  /// **'Lowercase letters, numbers and hyphens. Can\'t be changed later.'**
  String get createCommunityAddressHelper;

  /// No description provided for @createCommunityAddressChecking.
  ///
  /// In en, this message translates to:
  /// **'Checking the address…'**
  String get createCommunityAddressChecking;

  /// No description provided for @createCommunityAddressFree.
  ///
  /// In en, this message translates to:
  /// **'This address is free'**
  String get createCommunityAddressFree;

  /// No description provided for @createCommunityCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get createCommunityCategory;

  /// No description provided for @createCommunityDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get createCommunityDescription;

  /// No description provided for @createCommunityDescriptionHint.
  ///
  /// In en, this message translates to:
  /// **'What is this community for?'**
  String get createCommunityDescriptionHint;

  /// No description provided for @createCommunityLanguage.
  ///
  /// In en, this message translates to:
  /// **'Primary language'**
  String get createCommunityLanguage;

  /// No description provided for @createCommunityLanguageHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Kasem'**
  String get createCommunityLanguageHint;

  /// No description provided for @createCommunityLocation.
  ///
  /// In en, this message translates to:
  /// **'Location or cultural group'**
  String get createCommunityLocation;

  /// No description provided for @createCommunityLocationHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. Paga, Kassena-Nankana'**
  String get createCommunityLocationHint;

  /// No description provided for @createCommunityVisibility.
  ///
  /// In en, this message translates to:
  /// **'Who can read posts?'**
  String get createCommunityVisibility;

  /// No description provided for @createCommunityPublicBody.
  ///
  /// In en, this message translates to:
  /// **'Anyone can read posts and join.'**
  String get createCommunityPublicBody;

  /// No description provided for @createCommunityPrivateBody.
  ///
  /// In en, this message translates to:
  /// **'Only approved members read posts. People ask to join.'**
  String get createCommunityPrivateBody;

  /// No description provided for @createCommunityVisibilityLocked.
  ///
  /// In en, this message translates to:
  /// **'This can\'t be changed after the community is created.'**
  String get createCommunityVisibilityLocked;

  /// No description provided for @createCommunityProfileImage.
  ///
  /// In en, this message translates to:
  /// **'Profile image'**
  String get createCommunityProfileImage;

  /// No description provided for @createCommunityCoverImage.
  ///
  /// In en, this message translates to:
  /// **'Cover image'**
  String get createCommunityCoverImage;

  /// No description provided for @createCommunityChooseImage.
  ///
  /// In en, this message translates to:
  /// **'Choose picture'**
  String get createCommunityChooseImage;

  /// No description provided for @createCommunityRemoveImage.
  ///
  /// In en, this message translates to:
  /// **'Remove picture'**
  String get createCommunityRemoveImage;

  /// No description provided for @createCommunityImageHelper.
  ///
  /// In en, this message translates to:
  /// **'JPG, PNG or WebP, under 12 MB.'**
  String get createCommunityImageHelper;

  /// No description provided for @createCommunityRules.
  ///
  /// In en, this message translates to:
  /// **'Rules'**
  String get createCommunityRules;

  /// No description provided for @createCommunityRuleHint.
  ///
  /// In en, this message translates to:
  /// **'Rule {number}'**
  String createCommunityRuleHint(int number);

  /// No description provided for @createCommunityAddRule.
  ///
  /// In en, this message translates to:
  /// **'Add a rule'**
  String get createCommunityAddRule;

  /// No description provided for @createCommunityRemoveRule.
  ///
  /// In en, this message translates to:
  /// **'Remove rule'**
  String get createCommunityRemoveRule;

  /// No description provided for @createCommunityNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get createCommunityNext;

  /// No description provided for @createCommunityBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get createCommunityBack;

  /// No description provided for @createCommunitySubmit.
  ///
  /// In en, this message translates to:
  /// **'Create community'**
  String get createCommunitySubmit;

  /// No description provided for @createCommunitySubmitting.
  ///
  /// In en, this message translates to:
  /// **'Creating…'**
  String get createCommunitySubmitting;

  /// No description provided for @communityCategoryLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get communityCategoryLanguage;

  /// No description provided for @communityCategoryCulture.
  ///
  /// In en, this message translates to:
  /// **'Culture'**
  String get communityCategoryCulture;

  /// No description provided for @communityCategoryMusic.
  ///
  /// In en, this message translates to:
  /// **'Music'**
  String get communityCategoryMusic;

  /// No description provided for @communityCategoryHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get communityCategoryHistory;

  /// No description provided for @communityCategoryFaith.
  ///
  /// In en, this message translates to:
  /// **'Faith'**
  String get communityCategoryFaith;

  /// No description provided for @communityCategoryEducation.
  ///
  /// In en, this message translates to:
  /// **'Education'**
  String get communityCategoryEducation;

  /// No description provided for @communityCategoryHometown.
  ///
  /// In en, this message translates to:
  /// **'Hometown'**
  String get communityCategoryHometown;

  /// No description provided for @communityCategoryDiaspora.
  ///
  /// In en, this message translates to:
  /// **'Diaspora'**
  String get communityCategoryDiaspora;

  /// No description provided for @communityCategoryYouth.
  ///
  /// In en, this message translates to:
  /// **'Youth'**
  String get communityCategoryYouth;

  /// No description provided for @communityCategoryOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get communityCategoryOther;

  /// No description provided for @communityOptions.
  ///
  /// In en, this message translates to:
  /// **'Community options'**
  String get communityOptions;

  /// No description provided for @communityEditCommunity.
  ///
  /// In en, this message translates to:
  /// **'Edit community'**
  String get communityEditCommunity;

  /// No description provided for @communityEditSave.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get communityEditSave;

  /// No description provided for @communityEditSaving.
  ///
  /// In en, this message translates to:
  /// **'Saving…'**
  String get communityEditSaving;

  /// No description provided for @communityEditSaved.
  ///
  /// In en, this message translates to:
  /// **'Community updated.'**
  String get communityEditSaved;

  /// No description provided for @communityEditAddressFixed.
  ///
  /// In en, this message translates to:
  /// **'Address: communities/{slug}. It can\'t be changed.'**
  String communityEditAddressFixed(String slug);

  /// No description provided for @communityEditVisibilityFixed.
  ///
  /// In en, this message translates to:
  /// **'{visibility}. Visibility can\'t be changed after a community is created.'**
  String communityEditVisibilityFixed(String visibility);

  /// No description provided for @communityEditDiscardTitle.
  ///
  /// In en, this message translates to:
  /// **'Discard your changes?'**
  String get communityEditDiscardTitle;

  /// No description provided for @communityEditDiscardBody.
  ///
  /// In en, this message translates to:
  /// **'Nothing you changed here has been saved.'**
  String get communityEditDiscardBody;

  /// No description provided for @communityEditDiscard.
  ///
  /// In en, this message translates to:
  /// **'Discard'**
  String get communityEditDiscard;

  /// No description provided for @communityHandOver.
  ///
  /// In en, this message translates to:
  /// **'Hand over ownership'**
  String get communityHandOver;

  /// No description provided for @communityHandOverTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose the new owner'**
  String get communityHandOverTitle;

  /// No description provided for @communityHandOverBody.
  ///
  /// In en, this message translates to:
  /// **'They become the owner. You stay on as an admin, and can leave afterwards.'**
  String get communityHandOverBody;

  /// No description provided for @communityHandOverConfirm.
  ///
  /// In en, this message translates to:
  /// **'Make {name} the owner?'**
  String communityHandOverConfirm(String name);

  /// No description provided for @communityHandOverDone.
  ///
  /// In en, this message translates to:
  /// **'{name} now owns this community.'**
  String communityHandOverDone(String name);

  /// No description provided for @communityHandOverNobody.
  ///
  /// In en, this message translates to:
  /// **'Nobody else is in this community yet. You can close it instead.'**
  String get communityHandOverNobody;

  /// No description provided for @communityClose.
  ///
  /// In en, this message translates to:
  /// **'Close community'**
  String get communityClose;

  /// No description provided for @communityCloseTitle.
  ///
  /// In en, this message translates to:
  /// **'Close {name}?'**
  String communityCloseTitle(String name);

  /// No description provided for @communityCloseBody.
  ///
  /// In en, this message translates to:
  /// **'It stops taking members and posts, and its address stays reserved. This can\'t be undone from the app.'**
  String get communityCloseBody;

  /// No description provided for @communityCloseDone.
  ///
  /// In en, this message translates to:
  /// **'Community closed.'**
  String get communityCloseDone;

  /// No description provided for @communityLeaveOwnerTitle.
  ///
  /// In en, this message translates to:
  /// **'You own this community'**
  String get communityLeaveOwnerTitle;

  /// No description provided for @communityLeaveOwnerBody.
  ///
  /// In en, this message translates to:
  /// **'Hand it over to another member before leaving, or close it if you are the only one here.'**
  String get communityLeaveOwnerBody;

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
