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
  String get settingsAppearanceLight => 'Light — pale paper, for daylight';

  @override
  String get settingsAppearanceDark => 'Dark — a night ground, for low light';

  @override
  String get settingsTheme => 'Theme';

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
  String get communityCompose => 'Make a post';

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
  String communityComposeIn(String community) {
    return 'Post in $community';
  }

  @override
  String get communityAddPhoto => 'Add a photo';

  @override
  String get communityAddVideo => 'Add a video';

  @override
  String get communityCommunitiesTab => 'Communities';

  @override
  String get communityCommunitiesTabSemantics =>
      'Communities. Find, join or create a community';

  @override
  String communityPromptTitle(String language) {
    return 'Today in $language';
  }

  @override
  String get communityPromptSubtitle => 'Share a word from home';

  @override
  String get communityPromptHint =>
      'Share a word from home, and what it means…';

  @override
  String communityPromptSemantics(String title, String subtitle) {
    return '$title. $subtitle. Opens the composer';
  }

  @override
  String get communityNewVoicesSeeAll => 'See all';

  @override
  String get communityVoiceNew => 'New member';

  @override
  String get communityVoiceDialect => 'Near you';

  @override
  String get communityVoiceCommunity => 'In your communities';

  @override
  String get communityVoiceCreator => 'Creator';

  @override
  String get communityVoiceActive => 'Posting now';

  @override
  String get communityLoadingMore => 'Loading more posts';

  @override
  String get communityCaughtUp => 'You\'re all caught up';

  @override
  String communityPostedIn(String community) {
    return 'in $community';
  }

  @override
  String get communityPostCategory => 'Kind of post';

  @override
  String get postCategoryQuestion => 'Question';

  @override
  String get postCategoryLanguage => 'Language';

  @override
  String get postCategoryCulture => 'Culture';

  @override
  String get postCategoryMusic => 'Music';

  @override
  String get postCategoryStory => 'Story';

  @override
  String get postCategoryAnnouncement => 'Announcement';

  @override
  String get communitiesTitle => 'Communities';

  @override
  String get communitiesSearchHint => 'Search name, language, place or topic';

  @override
  String get communitiesSearchLabel => 'Search communities';

  @override
  String get communitiesClearSearch => 'Clear search';

  @override
  String get communitiesDiscover => 'Discover';

  @override
  String get communitiesJoined => 'Joined';

  @override
  String get communitiesCreate => 'Create';

  @override
  String get communitiesCreateCommunity => 'Create a community';

  @override
  String communitiesMembers(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count members',
      one: '1 member',
    );
    return '$_temp0';
  }

  @override
  String get communitiesPrivate => 'Private';

  @override
  String get communitiesPublic => 'Public';

  @override
  String get communitiesJoin => 'Join';

  @override
  String get communitiesRequest => 'Ask to join';

  @override
  String get communitiesRequested => 'Requested';

  @override
  String get communitiesMember => 'Joined';

  @override
  String get communitiesLeave => 'Leave community';

  @override
  String get communitiesCancelRequest => 'Withdraw request';

  @override
  String get communitiesNoneJoined => 'You haven\'t joined a community yet';

  @override
  String get communitiesNoneJoinedAction => 'Discover communities';

  @override
  String communitiesNoResults(String query) {
    return 'No communities match “$query”';
  }

  @override
  String get communitiesNoResultsAction => 'Start one';

  @override
  String get communitiesEmpty => 'No communities yet';

  @override
  String get communitiesLoadFailed => 'Communities could not load';

  @override
  String get communityTabFeed => 'Feed';

  @override
  String get communityTabAbout => 'About';

  @override
  String get communityTabMembers => 'Members';

  @override
  String get communityTabRules => 'Rules';

  @override
  String get communityShareCommunity => 'Share community';

  @override
  String get communityReportCommunity => 'Report community';

  @override
  String get communityMoreOptions => 'More options';

  @override
  String get communityPendingTitle => 'Your request is waiting for approval';

  @override
  String get communityPendingBody => 'A moderator will look at it soon.';

  @override
  String get communityPrivateTitle => 'This community is private';

  @override
  String get communityPrivateBody =>
      'Ask to join to see its posts and members.';

  @override
  String get communityUnavailableTitle => 'This community is unavailable';

  @override
  String get communityUnavailableBody =>
      'It may have been removed, or the link is wrong.';

  @override
  String get communityBannedTitle => 'You can\'t take part in this community';

  @override
  String get communitySpaceEmpty => 'No posts here yet';

  @override
  String get communityJoinToPost => 'Join to post here';

  @override
  String get communityAboutCategory => 'Category';

  @override
  String get communityAboutLanguage => 'Primary language';

  @override
  String get communityAboutLocation => 'Place or cultural group';

  @override
  String get communityAboutCreated => 'Created';

  @override
  String get communityAboutVisibility => 'Visibility';

  @override
  String get communityAboutNoDescription => 'No description yet.';

  @override
  String get communityNoRules => 'No rules have been written yet.';

  @override
  String get communityRequests => 'Requests to join';

  @override
  String get communityApprove => 'Approve';

  @override
  String get communityDecline => 'Decline';

  @override
  String get communityRoleOwner => 'Owner';

  @override
  String get communityRoleAdmin => 'Admin';

  @override
  String get communityRoleModerator => 'Moderator';

  @override
  String get communityMemberActions => 'Member options';

  @override
  String get communityMakeModerator => 'Make moderator';

  @override
  String get communityMakeAdmin => 'Make admin';

  @override
  String get communityMakeMember => 'Remove role';

  @override
  String get communityRemoveMember => 'Remove from community';

  @override
  String get communityBanMember => 'Ban from community';

  @override
  String get communityMembersEmpty => 'No members to show';

  @override
  String get createCommunityStepBasics => 'Basics';

  @override
  String get createCommunityStepDetails => 'Details';

  @override
  String get createCommunityStepLook => 'Look and rules';

  @override
  String get createCommunityName => 'Name';

  @override
  String get createCommunityNameHint => 'e.g. Navrongo Kasem Circle';

  @override
  String get createCommunityAddress => 'Address';

  @override
  String get createCommunityAddressHelper =>
      'Lowercase letters, numbers and hyphens. Can\'t be changed later.';

  @override
  String get createCommunityAddressChecking => 'Checking the address…';

  @override
  String get createCommunityAddressFree => 'This address is free';

  @override
  String get createCommunityCategory => 'Category';

  @override
  String get createCommunityDescription => 'Description';

  @override
  String get createCommunityDescriptionHint => 'What is this community for?';

  @override
  String get createCommunityLanguage => 'Primary language';

  @override
  String get createCommunityLanguageHint => 'e.g. Kasem';

  @override
  String get createCommunityLocation => 'Location or cultural group';

  @override
  String get createCommunityLocationHint => 'e.g. Paga, Kassena-Nankana';

  @override
  String get createCommunityVisibility => 'Who can read posts?';

  @override
  String get createCommunityPublicBody => 'Anyone can read posts and join.';

  @override
  String get createCommunityPrivateBody =>
      'Only approved members read posts. People ask to join.';

  @override
  String get createCommunityVisibilityLocked =>
      'This can\'t be changed after the community is created.';

  @override
  String get createCommunityProfileImage => 'Profile image';

  @override
  String get createCommunityCoverImage => 'Cover image';

  @override
  String get createCommunityChooseImage => 'Choose picture';

  @override
  String get createCommunityRemoveImage => 'Remove picture';

  @override
  String get createCommunityImageHelper => 'JPG, PNG or WebP, under 12 MB.';

  @override
  String get createCommunityRules => 'Rules';

  @override
  String createCommunityRuleHint(int number) {
    return 'Rule $number';
  }

  @override
  String get createCommunityAddRule => 'Add a rule';

  @override
  String get createCommunityRemoveRule => 'Remove rule';

  @override
  String get createCommunityNext => 'Next';

  @override
  String get createCommunityBack => 'Back';

  @override
  String get createCommunitySubmit => 'Create community';

  @override
  String get createCommunitySubmitting => 'Creating…';

  @override
  String get communityCategoryLanguage => 'Language';

  @override
  String get communityCategoryCulture => 'Culture';

  @override
  String get communityCategoryMusic => 'Music';

  @override
  String get communityCategoryHistory => 'History';

  @override
  String get communityCategoryFaith => 'Faith';

  @override
  String get communityCategoryEducation => 'Education';

  @override
  String get communityCategoryHometown => 'Hometown';

  @override
  String get communityCategoryDiaspora => 'Diaspora';

  @override
  String get communityCategoryYouth => 'Youth';

  @override
  String get communityCategoryOther => 'Other';

  @override
  String get communityOptions => 'Community options';

  @override
  String get communityEditCommunity => 'Edit community';

  @override
  String get communityEditSave => 'Save changes';

  @override
  String get communityEditSaving => 'Saving…';

  @override
  String get communityEditSaved => 'Community updated.';

  @override
  String communityEditAddressFixed(String slug) {
    return 'Address: communities/$slug. It can\'t be changed.';
  }

  @override
  String communityEditVisibilityFixed(String visibility) {
    return '$visibility. Visibility can\'t be changed after a community is created.';
  }

  @override
  String get communityEditDiscardTitle => 'Discard your changes?';

  @override
  String get communityEditDiscardBody =>
      'Nothing you changed here has been saved.';

  @override
  String get communityEditDiscard => 'Discard';

  @override
  String get communityHandOver => 'Hand over ownership';

  @override
  String get communityHandOverTitle => 'Choose the new owner';

  @override
  String get communityHandOverBody =>
      'They become the owner. You stay on as an admin, and can leave afterwards.';

  @override
  String communityHandOverConfirm(String name) {
    return 'Make $name the owner?';
  }

  @override
  String communityHandOverDone(String name) {
    return '$name now owns this community.';
  }

  @override
  String get communityHandOverNobody =>
      'Nobody else is in this community yet. You can close it instead.';

  @override
  String get communityClose => 'Close community';

  @override
  String communityCloseTitle(String name) {
    return 'Close $name?';
  }

  @override
  String get communityCloseBody =>
      'It stops taking members and posts, and its address stays reserved. This can\'t be undone from the app.';

  @override
  String get communityCloseDone => 'Community closed.';

  @override
  String get communityLeaveOwnerTitle => 'You own this community';

  @override
  String get communityLeaveOwnerBody =>
      'Hand it over to another member before leaving, or close it if you are the only one here.';

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
