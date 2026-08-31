// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appTitle => 'Indigen';

  @override
  String get settingsPreferences => 'PRÉFÉRENCES';

  @override
  String get settingsLanguage => 'Langue';

  @override
  String get settingsLanguageMatchDevice => 'Suivre mon appareil';

  @override
  String get settingsLanguageSubtitle =>
      'La langue dans laquelle l\'application se lit';

  @override
  String get settingsAppearance => 'Apparence';

  @override
  String get settingsAppearanceSystem =>
      'Suivre l\'appareil — clair le jour, sombre la nuit';

  @override
  String get settingsAppearanceLight => 'Clair — papier chaud et vert profond';

  @override
  String get settingsAppearanceDark => 'Sombre — anthracite aux reflets verts';

  @override
  String get settingsAutoplayTitle => 'Lire les vidéos automatiquement';

  @override
  String get settingsAutoplayBody =>
      'Les clips du fil communautaire démarrent seuls, sans son. Désactivé, vous économisez des données sur un forfait limité — touchez un clip pour le regarder.';

  @override
  String get navExplore => 'Explorer';

  @override
  String get navLearn => 'Apprendre';

  @override
  String get navCommunity => 'Communauté';

  @override
  String get navCollection => 'Collection';

  @override
  String get navContribute => 'Contribuer';

  @override
  String get onboardingTitle => 'La langue vit\navec les gens.';

  @override
  String get onboardingBody =>
      'Apprenez, cherchez et contribuez avec Project Kassena — la première cellule linguistique d’Indigen World.';

  @override
  String get onboardingQuestion => 'Qu’est-ce qui vous amène ?';

  @override
  String get onboardingHome => 'Communauté d’origine';

  @override
  String get onboardingHomeBody =>
      'Rester proche de la langue parlée autour de vous.';

  @override
  String get onboardingDiaspora => 'Diaspora';

  @override
  String get onboardingDiasporaBody =>
      'Renouer et pratiquer, où que vous soyez.';

  @override
  String get onboardingVisitor => 'Visiteur ou apprenant';

  @override
  String get onboardingVisitorBody =>
      'Apprendre avec respect, contexte et attribution.';

  @override
  String get onboardingStart => 'Commencer par le kasem';

  @override
  String get onboardingGuestNote =>
      'Le dictionnaire public et les leçons fonctionnent sans compte. Vous pourrez en créer un plus tard.';

  @override
  String get communityTitle => 'Communauté';

  @override
  String get communityMenu => 'Menu de la communauté';

  @override
  String get communityMenuWaiting =>
      'Menu de la communauté, éléments en attente';

  @override
  String get communityNotifications => 'Notifications';

  @override
  String communityNotificationsUnread(int count) {
    return 'Notifications, $count non lues';
  }

  @override
  String get communityFindPeople => 'Trouver des membres';

  @override
  String get communitySavedPosts => 'Publications enregistrées';

  @override
  String get communityNewPost => 'Nouvelle publication en kasem';

  @override
  String get communityCompose => 'Écrire en kasem';

  @override
  String get communityNewVoices => 'Nouvelles voix';

  @override
  String get communityNobodyNew => 'Personne de nouveau pour l’instant.';

  @override
  String get communityForYou => 'Pour vous';

  @override
  String get communityFollowing => 'Abonnements';

  @override
  String communityNewPostsPill(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count nouvelles publications',
      one: '1 nouvelle publication',
    );
    return '$_temp0';
  }

  @override
  String communityNewPostsSemantics(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count nouvelles publications, revenir en haut',
      one: '1 nouvelle publication, revenir en haut',
    );
    return '$_temp0';
  }

  @override
  String get communityEmptyFollowing =>
      'Rien de la part des personnes que vous suivez';

  @override
  String get communityEmptyFeed => 'Aucune publication pour l’instant';

  @override
  String get communityFirstPost => 'Publier la première';

  @override
  String get communityBackendPending =>
      'Le service communautaire démarre encore';

  @override
  String get communityFeedFailed => 'Le fil n’a pas pu se charger';

  @override
  String get communityTryAgain => 'Réessayer';

  @override
  String get learnDictionary => 'Dictionnaire';

  @override
  String learnStreakClaimed(int days) {
    return 'Série de $days jours, réclamée aujourd’hui';
  }

  @override
  String learnDailySpark(int days) {
    return 'Étincelle du jour, série de $days jours';
  }

  @override
  String learnXpSemantics(int xp) {
    return '$xp points d’expérience';
  }

  @override
  String learnQuestSemantics(int done) {
    return 'Quête du jour, $done sur 3';
  }

  @override
  String learnSparkClaimed(int xp) {
    return 'Étincelle du jour réclamée · +$xp XP';
  }

  @override
  String get learnLockedAbove =>
      'Terminez la leçon précédente pour ouvrir celle-ci.';

  @override
  String learnUnitNumber(int order) {
    return 'UNITÉ $order';
  }

  @override
  String get learnWordOfTheDay => 'MOT DU JOUR';

  @override
  String get learnHeroOfTheWeek => 'FIGURE DE LA SEMAINE';

  @override
  String get learnStart => 'COMMENCER';

  @override
  String get learnUnitComplete => 'UNITÉ TERMINÉE';

  @override
  String get learnUnitTrophy => 'TROPHÉE D’UNITÉ';

  @override
  String learnUnitCompleteSemantics(String unit) {
    return '$unit terminée';
  }

  @override
  String learnUnitTrophySemantics(String unit) {
    return 'Terminez $unit pour ouvrir ce qui vous attend au bout';
  }

  @override
  String learnNodeSemantics(int number, int total, String title, String state) {
    return 'Leçon $number sur $total, $title, $state';
  }

  @override
  String get learnStateCompleted => 'terminée';

  @override
  String get learnStateReady => 'disponible';

  @override
  String get learnStateLocked => 'verrouillée';

  @override
  String learnBubbleCompleted(int number, int total) {
    return 'TERMINÉE · LEÇON $number SUR $total';
  }

  @override
  String learnBubbleLesson(int number, int total) {
    return 'LEÇON $number SUR $total';
  }

  @override
  String get learnBubbleLocked => 'VERROUILLÉE';

  @override
  String learnBubbleMinutes(int minutes, int xp) {
    return '$minutes min · $xp XP';
  }

  @override
  String get learnBubbleLockedBody =>
      'Terminez la leçon précédente pour ouvrir celle-ci.';

  @override
  String get learnBubblePractise => 'REFAIRE';

  @override
  String learnBubbleStart(int xp) {
    return 'COMMENCER · +$xp XP';
  }

  @override
  String get learnQuestTitle => 'Quête du jour';

  @override
  String get learnQuestSubtitle => 'Terminez 3 leçons rapides';

  @override
  String get learnMomentumTitle => 'Votre élan';

  @override
  String get learnMomentumUnpublished =>
      'Le parcours est encore en cours de publication';

  @override
  String learnMomentumProgress(int done, int total) {
    return '$done leçons terminées sur $total';
  }

  @override
  String get learnPerfectLesson => 'Leçon parfaite !';

  @override
  String get learnLessonComplete => 'Leçon terminée !';

  @override
  String get learnXpEarned => 'XP GAGNÉS';

  @override
  String get learnTotalXp => 'XP AU TOTAL';

  @override
  String get learnAnswersRight => 'BONNES RÉPONSES';

  @override
  String get learnStreakDayOne => 'Premier jour de votre série.';

  @override
  String learnStreakDays(int days) {
    return '$days jours d’affilée.';
  }

  @override
  String get learnContinue => 'CONTINUER';

  @override
  String get collectionEyebrow => 'La collection kassena';

  @override
  String get collectionMusic => 'Musique';

  @override
  String get collectionDictionary => 'Dictionnaire';

  @override
  String get collectionLiterature => 'Littérature';

  @override
  String get collectionAudiobooks => 'Livres audio';

  @override
  String get collectionVideo => 'Vidéo';

  @override
  String get collectionHeroes => 'Figures';

  @override
  String get collectionApps => 'Applications';

  @override
  String get collectionShop => 'Boutique';
}
