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
  String get settingsLanguageSubtitle => 'La langue dans laquelle l\'application se lit';

  @override
  String get settingsAppearance => 'Apparence';

  @override
  String get settingsAppearanceSystem => 'Suivre l\'appareil — clair le jour, sombre la nuit';

  @override
  String get settingsAppearanceLight => 'Clair — papier chaud et vert profond';

  @override
  String get settingsAppearanceDark => 'Sombre — anthracite aux reflets verts';

  @override
  String get settingsAutoplayTitle => 'Lire les vidéos automatiquement';

  @override
  String get settingsAutoplayBody => 'Les clips du fil communautaire démarrent seuls, sans son. Désactivé, vous économisez des données sur un forfait limité — touchez un clip pour le regarder.';

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
  String get onboardingBody => 'Apprenez, cherchez et contribuez avec Project Kassena — la première cellule linguistique d’Indigen World.';

  @override
  String get onboardingQuestion => 'Qu’est-ce qui vous amène ?';

  @override
  String get onboardingHome => 'Communauté d’origine';

  @override
  String get onboardingHomeBody => 'Rester proche de la langue parlée autour de vous.';

  @override
  String get onboardingDiaspora => 'Diaspora';

  @override
  String get onboardingDiasporaBody => 'Renouer et pratiquer, où que vous soyez.';

  @override
  String get onboardingVisitor => 'Visiteur ou apprenant';

  @override
  String get onboardingVisitorBody => 'Apprendre avec respect, contexte et attribution.';

  @override
  String get onboardingStart => 'Commencer par le kasem';

  @override
  String get onboardingGuestNote => 'Le dictionnaire public et les leçons fonctionnent sans compte. Vous pourrez en créer un plus tard.';

  @override
  String get communityTitle => 'Communauté';

  @override
  String get communityMenu => 'Menu de la communauté';

  @override
  String get communityMenuWaiting => 'Menu de la communauté, éléments en attente';

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
  String get communityCompose => 'Publier';

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
  String get communityEmptyFollowing => 'Rien de la part des personnes que vous suivez';

  @override
  String get communityEmptyFeed => 'Aucune publication pour l’instant';

  @override
  String get communityFirstPost => 'Publier la première';

  @override
  String get communityBackendPending => 'Le service communautaire démarre encore';

  @override
  String get communityFeedFailed => 'Le fil n’a pas pu se charger';

  @override
  String get communityTryAgain => 'Réessayer';

  @override
  String communityComposeIn(String community) {
    return 'Publier dans $community';
  }

  @override
  String get communityAddPhoto => 'Ajouter une photo';

  @override
  String get communityAddVideo => 'Ajouter une vidéo';

  @override
  String get communityCommunitiesTab => 'Communautés';

  @override
  String get communityCommunitiesTabSemantics => 'Communautés. Trouver, rejoindre ou créer une communauté';

  @override
  String communityPromptTitle(String language) {
    return 'Aujourd\'hui en $language';
  }

  @override
  String get communityPromptSubtitle => 'Partagez un mot de chez vous';

  @override
  String get communityPromptHint => 'Partagez un mot de chez vous et ce qu\'il veut dire…';

  @override
  String communityPromptSemantics(String title, String subtitle) {
    return '$title. $subtitle. Ouvre l\'éditeur';
  }

  @override
  String get communityNewVoicesSeeAll => 'Tout voir';

  @override
  String get communityVoiceNew => 'Nouveau membre';

  @override
  String get communityVoiceDialect => 'Près de chez vous';

  @override
  String get communityVoiceCommunity => 'Dans vos communautés';

  @override
  String get communityVoiceCreator => 'Créateur';

  @override
  String get communityVoiceActive => 'Publie en ce moment';

  @override
  String get communityLoadingMore => 'Chargement d\'autres publications';

  @override
  String get communityCaughtUp => 'Vous êtes à jour';

  @override
  String communityPostedIn(String community) {
    return 'dans $community';
  }

  @override
  String get communityPostCategory => 'Type de publication';

  @override
  String get postCategoryQuestion => 'Question';

  @override
  String get postCategoryLanguage => 'Langue';

  @override
  String get postCategoryCulture => 'Culture';

  @override
  String get postCategoryMusic => 'Musique';

  @override
  String get postCategoryStory => 'Récit';

  @override
  String get postCategoryAnnouncement => 'Annonce';

  @override
  String get communitiesTitle => 'Communautés';

  @override
  String get communitiesSearchHint => 'Nom, langue, lieu ou sujet';

  @override
  String get communitiesSearchLabel => 'Rechercher des communautés';

  @override
  String get communitiesClearSearch => 'Effacer la recherche';

  @override
  String get communitiesDiscover => 'Découvrir';

  @override
  String get communitiesJoined => 'Rejointes';

  @override
  String get communitiesCreate => 'Créer';

  @override
  String get communitiesCreateCommunity => 'Créer une communauté';

  @override
  String communitiesMembers(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count membres',
      one: '1 membre',
    );
    return '$_temp0';
  }

  @override
  String get communitiesPrivate => 'Privée';

  @override
  String get communitiesPublic => 'Publique';

  @override
  String get communitiesJoin => 'Rejoindre';

  @override
  String get communitiesRequest => 'Demander';

  @override
  String get communitiesRequested => 'Demandé';

  @override
  String get communitiesMember => 'Membre';

  @override
  String get communitiesLeave => 'Quitter la communauté';

  @override
  String get communitiesCancelRequest => 'Retirer la demande';

  @override
  String get communitiesNoneJoined => 'Vous n\'avez rejoint aucune communauté';

  @override
  String get communitiesNoneJoinedAction => 'Découvrir des communautés';

  @override
  String communitiesNoResults(String query) {
    return 'Aucune communauté ne correspond à « $query »';
  }

  @override
  String get communitiesNoResultsAction => 'En créer une';

  @override
  String get communitiesEmpty => 'Aucune communauté pour l\'instant';

  @override
  String get communitiesLoadFailed => 'Impossible de charger les communautés';

  @override
  String get communityTabFeed => 'Fil';

  @override
  String get communityTabAbout => 'À propos';

  @override
  String get communityTabMembers => 'Membres';

  @override
  String get communityTabRules => 'Règles';

  @override
  String get communityShareCommunity => 'Partager la communauté';

  @override
  String get communityReportCommunity => 'Signaler la communauté';

  @override
  String get communityMoreOptions => 'Plus d\'options';

  @override
  String get communityPendingTitle => 'Votre demande attend une validation';

  @override
  String get communityPendingBody => 'Un modérateur va l\'examiner bientôt.';

  @override
  String get communityPrivateTitle => 'Cette communauté est privée';

  @override
  String get communityPrivateBody => 'Demandez à rejoindre pour voir ses publications et ses membres.';

  @override
  String get communityUnavailableTitle => 'Cette communauté n\'est pas disponible';

  @override
  String get communityUnavailableBody => 'Elle a peut-être été supprimée, ou le lien est erroné.';

  @override
  String get communityBannedTitle => 'Vous ne pouvez pas participer à cette communauté';

  @override
  String get communitySpaceEmpty => 'Aucune publication ici';

  @override
  String get communityJoinToPost => 'Rejoignez-la pour publier';

  @override
  String get communityAboutCategory => 'Catégorie';

  @override
  String get communityAboutLanguage => 'Langue principale';

  @override
  String get communityAboutLocation => 'Lieu ou groupe culturel';

  @override
  String get communityAboutCreated => 'Créée';

  @override
  String get communityAboutVisibility => 'Visibilité';

  @override
  String get communityAboutNoDescription => 'Pas encore de description.';

  @override
  String get communityNoRules => 'Aucune règle n\'a encore été écrite.';

  @override
  String get communityRequests => 'Demandes d\'adhésion';

  @override
  String get communityApprove => 'Accepter';

  @override
  String get communityDecline => 'Refuser';

  @override
  String get communityRoleOwner => 'Propriétaire';

  @override
  String get communityRoleAdmin => 'Admin';

  @override
  String get communityRoleModerator => 'Modérateur';

  @override
  String get communityMemberActions => 'Options du membre';

  @override
  String get communityMakeModerator => 'Nommer modérateur';

  @override
  String get communityMakeAdmin => 'Nommer admin';

  @override
  String get communityMakeMember => 'Retirer le rôle';

  @override
  String get communityRemoveMember => 'Retirer de la communauté';

  @override
  String get communityBanMember => 'Bannir de la communauté';

  @override
  String get communityMembersEmpty => 'Aucun membre à afficher';

  @override
  String get createCommunityStepBasics => 'L\'essentiel';

  @override
  String get createCommunityStepDetails => 'Détails';

  @override
  String get createCommunityStepLook => 'Apparence et règles';

  @override
  String get createCommunityName => 'Nom';

  @override
  String get createCommunityNameHint => 'ex. Cercle kasem de Navrongo';

  @override
  String get createCommunityAddress => 'Adresse';

  @override
  String get createCommunityAddressHelper => 'Minuscules, chiffres et tirets. Ne pourra pas être modifiée.';

  @override
  String get createCommunityAddressChecking => 'Vérification de l\'adresse…';

  @override
  String get createCommunityAddressFree => 'Cette adresse est libre';

  @override
  String get createCommunityCategory => 'Catégorie';

  @override
  String get createCommunityDescription => 'Description';

  @override
  String get createCommunityDescriptionHint => 'À quoi sert cette communauté ?';

  @override
  String get createCommunityLanguage => 'Langue principale';

  @override
  String get createCommunityLanguageHint => 'ex. kasem';

  @override
  String get createCommunityLocation => 'Lieu ou groupe culturel';

  @override
  String get createCommunityLocationHint => 'ex. Paga, Kassena-Nankana';

  @override
  String get createCommunityVisibility => 'Qui peut lire les publications ?';

  @override
  String get createCommunityPublicBody => 'Tout le monde peut lire et rejoindre.';

  @override
  String get createCommunityPrivateBody => 'Seuls les membres acceptés lisent les publications.';

  @override
  String get createCommunityVisibilityLocked => 'Ce choix ne pourra plus être modifié.';

  @override
  String get createCommunityProfileImage => 'Image de profil';

  @override
  String get createCommunityCoverImage => 'Image de couverture';

  @override
  String get createCommunityChooseImage => 'Choisir une image';

  @override
  String get createCommunityRemoveImage => 'Retirer l\'image';

  @override
  String get createCommunityImageHelper => 'JPG, PNG ou WebP, moins de 12 Mo.';

  @override
  String get createCommunityRules => 'Règles';

  @override
  String createCommunityRuleHint(int number) {
    return 'Règle $number';
  }

  @override
  String get createCommunityAddRule => 'Ajouter une règle';

  @override
  String get createCommunityRemoveRule => 'Retirer la règle';

  @override
  String get createCommunityNext => 'Suivant';

  @override
  String get createCommunityBack => 'Retour';

  @override
  String get createCommunitySubmit => 'Créer la communauté';

  @override
  String get createCommunitySubmitting => 'Création…';

  @override
  String get communityCategoryLanguage => 'Langue';

  @override
  String get communityCategoryCulture => 'Culture';

  @override
  String get communityCategoryMusic => 'Musique';

  @override
  String get communityCategoryHistory => 'Histoire';

  @override
  String get communityCategoryFaith => 'Foi';

  @override
  String get communityCategoryEducation => 'Éducation';

  @override
  String get communityCategoryHometown => 'Village natal';

  @override
  String get communityCategoryDiaspora => 'Diaspora';

  @override
  String get communityCategoryYouth => 'Jeunesse';

  @override
  String get communityCategoryOther => 'Autre';

  @override
  String get communityOptions => 'Options de la communauté';

  @override
  String get communityEditCommunity => 'Modifier la communauté';

  @override
  String get communityEditSave => 'Enregistrer';

  @override
  String get communityEditSaving => 'Enregistrement…';

  @override
  String get communityEditSaved => 'Communauté mise à jour.';

  @override
  String communityEditAddressFixed(String slug) {
    return 'Adresse : communities/$slug. Elle ne peut pas être modifiée.';
  }

  @override
  String communityEditVisibilityFixed(String visibility) {
    return '$visibility. La visibilité ne peut plus être modifiée après la création.';
  }

  @override
  String get communityEditDiscardTitle => 'Abandonner vos modifications ?';

  @override
  String get communityEditDiscardBody => 'Rien de ce que vous avez modifié n\'a été enregistré.';

  @override
  String get communityEditDiscard => 'Abandonner';

  @override
  String get communityHandOver => 'Transférer la propriété';

  @override
  String get communityHandOverTitle => 'Choisir le nouveau propriétaire';

  @override
  String get communityHandOverBody => 'Cette personne devient propriétaire. Vous restez admin et pourrez partir ensuite.';

  @override
  String communityHandOverConfirm(String name) {
    return 'Faire de $name le propriétaire ?';
  }

  @override
  String communityHandOverDone(String name) {
    return '$name est maintenant propriétaire de cette communauté.';
  }

  @override
  String get communityHandOverNobody => 'Personne d\'autre n\'est encore dans cette communauté. Vous pouvez la fermer.';

  @override
  String get communityClose => 'Fermer la communauté';

  @override
  String communityCloseTitle(String name) {
    return 'Fermer $name ?';
  }

  @override
  String get communityCloseBody => 'Elle n\'accepte plus de membres ni de publications, et son adresse reste réservée. Impossible d\'annuler depuis l\'application.';

  @override
  String get communityCloseDone => 'Communauté fermée.';

  @override
  String get communityLeaveOwnerTitle => 'Vous êtes propriétaire de cette communauté';

  @override
  String get communityLeaveOwnerBody => 'Transférez-la à un autre membre avant de partir, ou fermez-la si vous êtes seul.';

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
  String get learnLockedAbove => 'Terminez la leçon précédente pour ouvrir celle-ci.';

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
  String get learnBubbleLockedBody => 'Terminez la leçon précédente pour ouvrir celle-ci.';

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
  String get learnMomentumUnpublished => 'Le parcours est encore en cours de publication';

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
